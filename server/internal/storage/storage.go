package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"sync/atomic"
)

var tradeSeq uint64

// ---- TimescaleDB Table Models (GORM) ----

type OrderRecord struct {
	ID        string `gorm:"primaryKey"`
	UserID    uint   `gorm:"index"`
	Symbol    string `gorm:"index"`
	Type      string
	Side      string
	Price     float64
	Quantity  int64
	FilledQty int64     `gorm:"default:0"`
	Status    string    `gorm:"default:'OPEN'"`
	CreatedAt time.Time `gorm:"index"`
}

// TradeRecord — composite PK (id, executed_at) required by TimescaleDB
// so that executed_at (the partition column) is included in every unique index.
type TradeRecord struct {
	ID           string    `gorm:"column:id"`
	Symbol       string    `gorm:"column:symbol;index"`
	Price        float64   `gorm:"column:price"`
	Quantity     int64     `gorm:"column:quantity"`
	MakerOrderID string    `gorm:"column:maker_order_id"`
	TakerOrderID string    `gorm:"column:taker_order_id"`
	MakerUserID  uint      `gorm:"column:maker_user_id"`
	TakerUserID  uint      `gorm:"column:taker_user_id"`
	ExecutedAt   time.Time `gorm:"column:executed_at;index"`
}

// CandleRecord is READ-ONLY — queried from TimescaleDB continuous aggregate views
type CandleRecord struct {
	Symbol string    `gorm:"column:symbol"  json:"symbol"`
	Bucket time.Time `gorm:"column:bucket"  json:"bucket_time"` // named bucket_time to match live tick field
	Open   float64   `gorm:"column:open"    json:"open"`
	High   float64   `gorm:"column:high"    json:"high"`
	Low    float64   `gorm:"column:low"     json:"low"`
	Close  float64   `gorm:"column:close"   json:"close"`
	Volume int64     `gorm:"column:volume"  json:"volume"`
}

// ---- Store ----

type Store struct {
	tsdb  *gorm.DB
	redis *redis.Client
	ctx   context.Context
}

func NewStore(tsdb *gorm.DB, rdb *redis.Client) *Store {
	return &Store{
		tsdb:  tsdb,
		redis: rdb,
		ctx:   context.Background(),
	}
}

// ---- InitSchema ----
// Safe to call on every startup — all statements are idempotent.
// FIX: Removed the DROP TABLE trade_records CASCADE that previously ran on every
// startup, wiping all trade data and dropping candles_1s/candles_5s views each
// time the server restarted. Replaced with CREATE TABLE IF NOT EXISTS.

func InitSchema(tsdb *gorm.DB) error {
	log.Println("[Storage] Running schema migration...")

	// 0. Enable TimescaleDB extension
	if err := tsdb.Exec(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`).Error; err != nil {
		return fmt.Errorf("failed to enable timescaledb extension: %w", err)
	}

	// 1. Orders table
	if err := tsdb.AutoMigrate(&OrderRecord{}); err != nil {
		return fmt.Errorf("orders migration failed: %w", err)
	}

	// 2. Trades table — manual DDL with composite PK (id, executed_at).
	//    GORM AutoMigrate would create UNIQUE(id) alone, which TimescaleDB rejects
	//    (error TS103) because the partition column must be in every unique index.
	//    CREATE TABLE IF NOT EXISTS makes this safe to call on every restart.
	if err := tsdb.Exec(`
		CREATE TABLE IF NOT EXISTS trade_records (
			id             TEXT        NOT NULL,
			symbol         TEXT        NOT NULL,
			price          FLOAT8      NOT NULL,
			quantity       BIGINT      NOT NULL,
			maker_order_id TEXT        NOT NULL,
			taker_order_id TEXT        NOT NULL,
			maker_user_id  BIGINT      NOT NULL DEFAULT 0,
			taker_user_id  BIGINT      NOT NULL DEFAULT 0,
			executed_at    TIMESTAMPTZ NOT NULL,
			PRIMARY KEY (id, executed_at)
		)
	`).Error; err != nil {
		return fmt.Errorf("trade_records creation failed: %w", err)
	}

	// Add user ID columns if they don't exist (for existing tables)
	tsdb.Exec(`ALTER TABLE trade_records ADD COLUMN IF NOT EXISTS maker_user_id BIGINT NOT NULL DEFAULT 0`)
	tsdb.Exec(`ALTER TABLE trade_records ADD COLUMN IF NOT EXISTS taker_user_id BIGINT NOT NULL DEFAULT 0`)

	// 3. Symbol index for fast per-symbol range queries
	tsdb.Exec(`
		CREATE INDEX IF NOT EXISTS idx_trade_records_symbol
		ON trade_records (symbol, executed_at DESC)
	`)

	// 4. Convert to hypertable (safe if already a hypertable)
	if err := tsdb.Exec(`
		SELECT create_hypertable('trade_records', 'executed_at',
		if_not_exists => TRUE,
		migrate_data  => TRUE)
	`).Error; err != nil {
		return fmt.Errorf("create_hypertable failed: %w", err)
	}

	// 5. 1-second candle continuous aggregate
	tsdb.Exec(`
		CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1s
		WITH (timescaledb.continuous) AS
		SELECT
			symbol,
			time_bucket('1 second', executed_at)  AS bucket,
			FIRST(price, executed_at)              AS open,
			MAX(price)                             AS high,
			MIN(price)                             AS low,
			LAST(price, executed_at)               AS close,
			SUM(quantity)                          AS volume
		FROM trade_records
		GROUP BY symbol, bucket
		WITH NO DATA
	`)

	// 6. 5-second candle continuous aggregate
	tsdb.Exec(`
		CREATE MATERIALIZED VIEW IF NOT EXISTS candles_5s
		WITH (timescaledb.continuous) AS
		SELECT
			symbol,
			time_bucket('5 seconds', executed_at) AS bucket,
			FIRST(price, executed_at)             AS open,
			MAX(price)                            AS high,
			MIN(price)                            AS low,
			LAST(price, executed_at)              AS close,
			SUM(quantity)                         AS volume
		FROM trade_records
		GROUP BY symbol, bucket
		WITH NO DATA
	`)

	// 7. Automatic refresh policies
	tsdb.Exec(`
		SELECT add_continuous_aggregate_policy('candles_1s',
			start_offset => INTERVAL '10 minutes',
			end_offset   => INTERVAL '1 second',
			schedule_interval => INTERVAL '1 second',
			if_not_exists => TRUE)
	`)
	tsdb.Exec(`
		SELECT add_continuous_aggregate_policy('candles_5s',
			start_offset => INTERVAL '10 minutes',
			end_offset   => INTERVAL '5 seconds',
			schedule_interval => INTERVAL '5 seconds',
			if_not_exists => TRUE)
	`)

	log.Println("[Storage] Schema ready.")
	return nil
}

// ---- Reset Database (For Development Only) ----

func (s *Store) ResetDatabase() error {
	log.Println("⚠️ [Storage] Wiping database clean...")

	// 1. Flush all Redis keys
	if err := s.redis.FlushDB(s.ctx).Err(); err != nil {
		return fmt.Errorf("failed to flush redis: %w", err)
	}

	// 2. Drop TimescaleDB Views & Tables
	// CASCADE is required to drop tables that have dependent materialized views
	queries := []string{
		"DROP MATERIALIZED VIEW IF EXISTS candles_1s CASCADE;",
		"DROP MATERIALIZED VIEW IF EXISTS candles_5s CASCADE;",
		"DROP TABLE IF EXISTS trade_records CASCADE;",
		"DROP TABLE IF EXISTS order_records CASCADE;",
	}

	for _, query := range queries {
		if err := s.tsdb.Exec(query).Error; err != nil {
			return fmt.Errorf("failed to drop schema: %w", err)
		}
	}

	log.Println("✅ [Storage] Database wiped successfully.")
	return nil
}

// ---- InsertOrder ----
// Stores order in Redis with a 24h TTL. CANCEL orders are skipped.

// Return an error so the handler can react if Redis is down
func (s *Store) InsertOrder(order models.Order) error {
	if order.Type == models.Cancel {
		return nil
	}

	key := "order:" + order.ID
	data, err := json.Marshal(order)
	if err != nil {
		return fmt.Errorf("marshal failed: %w", err)
	}

	// Execute synchronously (no 'go func')
	if err := s.redis.Set(s.ctx, key, data, 24*time.Hour).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}

	score := float64(time.Now().UnixNano())

	s.redis.ZAdd(s.ctx, fmt.Sprintf("orders:user:%d", order.UserID), redis.Z{
		Score:  score,
		Member: order.ID,
	})

	s.redis.ZAdd(s.ctx, "orders:open:"+order.Symbol, redis.Z{
		Score:  score,
		Member: order.ID,
	})

	return nil
}

// ---- StartPipeline ----

func (s *Store) StartPipeline(lobStream <-chan models.LOBSnapshot) {
	go func() {
		for snap := range lobStream {
			s.handleLOBSnapshot(snap)
		}
	}()
	log.Println("[Storage] LOB snapshot pipeline started.")
}

// ---- HandleTrade ----
// Exported so main.go's trade goroutine can call it directly.
// Persists the trade to TimescaleDB and updates all Redis hot-path keys.

func (s *Store) HandleTrade(trade models.TradeMessage) {
	// 1. Persist raw trade to TimescaleDB hypertable
	seq := atomic.AddUint64(&tradeSeq, 1)

	record := TradeRecord{
		ID:           fmt.Sprintf("%s-%d-%d", trade.TakerOrderID, trade.Timestamp, seq),
		Symbol:       trade.Symbol,
		Price:        trade.Price,
		Quantity:     trade.Quantity,
		MakerOrderID: trade.MakerOrderID,
		TakerOrderID: trade.TakerOrderID,
		MakerUserID:  trade.MakerUserID,
		TakerUserID:  trade.TakerUserID,
		ExecutedAt:   time.Unix(0, trade.Timestamp),
	}
	if err := s.tsdb.Create(&record).Error; err != nil {
		// log.Printf("[Storage] InsertTrade failed: %v", err)
	}

	// 2. Update fill status on Redis order JSON
	s.updateOrderStatusRedis(trade.MakerOrderID, trade.Quantity)
	s.updateOrderStatusRedis(trade.TakerOrderID, trade.Quantity)

	// 3. Update live in-progress candle in Redis
	s.updateCurrentCandle(trade)

	// 4. Append to recent trades ring buffer (last 50)
	tradeJSON, _ := json.Marshal(trade)
	key := "trades:recent:" + trade.Symbol
	s.redis.LPush(s.ctx, key, string(tradeJSON))
	s.redis.LTrim(s.ctx, key, 0, 49)
}

// updateOrderStatusRedis reads the order JSON from Redis, increments FilledQuantity,
// recalculates Status, and writes it back preserving the original TTL.
func (s *Store) updateOrderStatusRedis(orderID string, filledQty int64) {
	key := "order:" + orderID
	raw, err := s.redis.Get(s.ctx, key).Result()
	if err != nil {
		return // Order not in Redis — likely a simulation/anonymous order
	}

	var order models.Order
	if err := json.Unmarshal([]byte(raw), &order); err != nil {
		// log.Printf("[Storage] updateOrderStatusRedis unmarshal failed for %s: %v", orderID, err)
		return
	}

	order.FilledQuantity += filledQty

	switch {
	case order.FilledQuantity >= order.Quantity:
		order.Status = models.StatusFilled
	case order.FilledQuantity > 0:
		order.Status = models.StatusPartial
	default:
		order.Status = models.StatusPending
	}

	data, _ := json.Marshal(order)
	s.redis.Set(s.ctx, key, data, redis.KeepTTL)
}

// ---- Redis: Current In-Progress Candle ----

type CurrentCandle struct {
	Open       float64   `json:"open"`
	High       float64   `json:"high"`
	Low        float64   `json:"low"`
	Close      float64   `json:"close"`
	Volume     int64     `json:"volume"`
	BucketTime time.Time `json:"bucket_time"`
}

func (s *Store) updateCurrentCandle(trade models.TradeMessage) {
	key := "candle:current:" + trade.Symbol
	now := time.Now().Truncate(time.Second)

	raw, err := s.redis.Get(s.ctx, key).Result()
	if err != nil {
		candle := CurrentCandle{
			Open: trade.Price, High: trade.Price,
			Low: trade.Price, Close: trade.Price,
			Volume: trade.Quantity, BucketTime: now,
		}
		data, _ := json.Marshal(candle)
		s.redis.Set(s.ctx, key, data, 0)
		return
	}

	var candle CurrentCandle
	json.Unmarshal([]byte(raw), &candle)
	channelName := "candles:" + trade.Symbol

	if !now.Equal(candle.BucketTime) {
		candle = CurrentCandle{
			Open: trade.Price, High: trade.Price,
			Low: trade.Price, Close: trade.Price,
			Volume: trade.Quantity, BucketTime: now,
		}
		data, _ := json.Marshal(candle)
		s.redis.Set(s.ctx, key, data, 0)
		s.redis.Publish(s.ctx, channelName, data)
		return
	}

	if trade.Price > candle.High {
		candle.High = trade.Price
	}
	if trade.Price < candle.Low {
		candle.Low = trade.Price
	}
	candle.Close = trade.Price
	candle.Volume += trade.Quantity

	data, _ := json.Marshal(candle)
	s.redis.Set(s.ctx, key, data, 0)

	s.redis.Publish(s.ctx, channelName, data)
}

// ---- LOB Snapshot Handler ----

func (s *Store) handleLOBSnapshot(snap models.LOBSnapshot) {
	data, _ := json.Marshal(snap)
	key := "orderbook:" + snap.Symbol

	s.redis.Set(s.ctx, key, data, 0)
	s.redis.Publish(s.ctx, key, data)
	s.redis.Set(s.ctx, "midprice:"+snap.Symbol, fmt.Sprintf("%.4f", snap.MidPrice), 0)

	// Publish lightweight price tick to prices:all for WebSocket streamPrices
	type PriceTick struct {
		Symbol   string  `json:"symbol"`
		MidPrice float64 `json:"mid_price"`
	}
	tick, _ := json.Marshal(PriceTick{
		Symbol:   snap.Symbol,
		MidPrice: snap.MidPrice,
	})
	s.redis.Publish(s.ctx, "prices:all", tick)
}

// ---- REST API Helpers ----

func (s *Store) GetOrderBook(symbol string) (*models.LOBSnapshot, error) {
	raw, err := s.redis.Get(s.ctx, "orderbook:"+symbol).Result()
	if err != nil {
		return nil, fmt.Errorf("no order book for symbol: %s", symbol)
	}
	var snap models.LOBSnapshot
	json.Unmarshal([]byte(raw), &snap)
	return &snap, nil
}

func (s *Store) GetRecentTrades(symbol string, n int64) ([]models.TradeMessage, error) {
	raws, err := s.redis.LRange(s.ctx, "trades:recent:"+symbol, 0, n-1).Result()
	if err != nil {
		return nil, err
	}
	trades := make([]models.TradeMessage, 0, len(raws))
	for _, raw := range raws {
		var t models.TradeMessage
		json.Unmarshal([]byte(raw), &t)
		trades = append(trades, t)
	}
	return trades, nil
}

func (s *Store) GetCandles(symbol, interval string, limit int) ([]CandleRecord, error) {
	view := "candles_1s"
	if interval == "5s" {
		view = "candles_5s"
	}

	var candles []CandleRecord

	// Wrap in a subquery to sort Oldest -> Newest for the frontend chart
	query := fmt.Sprintf(`
        SELECT * FROM (
            SELECT symbol, bucket, open, high, low, close, volume
            FROM %s
            WHERE symbol = ?
            ORDER BY bucket DESC
            LIMIT ?
        ) AS recent_candles
        ORDER BY bucket ASC
    `, view)

	err := s.tsdb.Raw(query, symbol, limit).Scan(&candles).Error
	return candles, err
}


func (s *Store) GetOrderByID(orderID string) (*models.Order, error) {
	raw, err := s.redis.Get(s.ctx, "order:"+orderID).Result()
	if err != nil {
		// Check if the error specifically means "key not found"
		if errors.Is(err, redis.Nil) {
			return nil, fmt.Errorf("order %s not found", orderID)
		}
		// If it's any other error (e.g., connection refused), return the actual error
		return nil, fmt.Errorf("failed to fetch order %s from redis: %w", orderID, err)
	}

	var order models.Order
	if err := json.Unmarshal([]byte(raw), &order); err != nil {
		return nil, fmt.Errorf("failed to unmarshal order %s: %w", orderID, err)
	}

	return &order, nil
}

func (s *Store) GetOrdersByUser(userID uint) ([]models.Order, error) {
	ids, err := s.redis.ZRevRange(s.ctx, fmt.Sprintf("orders:user:%d", userID), 0, -1).Result()
	if err != nil || len(ids) == 0 {
		return []models.Order{}, nil
	}

	keys := make([]string, len(ids))
	for i, id := range ids {
		keys[i] = "order:" + id
	}

	raws, err := s.redis.MGet(s.ctx, keys...).Result()
	if err != nil {
		return nil, fmt.Errorf("GetOrdersByUser MGet failed: %w", err)
	}

	orders := make([]models.Order, 0, len(raws))
	for _, raw := range raws {
		if raw == nil {
			continue
		}
		var o models.Order
		if err := json.Unmarshal([]byte(raw.(string)), &o); err == nil {
			orders = append(orders, o)
		}
	}
	return orders, nil
}

func (s *Store) GetOrders(userID uint, orderID string) ([]models.Order, error) {
	if orderID != "" {
		order, err := s.GetOrderByID(orderID)
		if err != nil {
			return nil, err
		}
		if userID != 0 && order.UserID != userID {
			return nil, fmt.Errorf("order %s does not belong to user %d", orderID, userID)
		}
		return []models.Order{*order}, nil
	}
	if userID != 0 {
		return s.GetOrdersByUser(userID)
	}
	return nil, fmt.Errorf("must provide at least one of userID or orderID")
}

func (s *Store) GetCurrentCandle(symbol string) (*CurrentCandle, error) {
	raw, err := s.redis.Get(s.ctx, "candle:current:"+symbol).Result()
	if err != nil {
		return nil, err
	}
	var candle CurrentCandle
	json.Unmarshal([]byte(raw), &candle)
	return &candle, nil
}

func (s *Store) GetMidPrice(symbol string) (string, error) {
	return s.redis.Get(s.ctx, "midprice:"+symbol).Result()
}

// GetCurrentPrice queries TimescaleDB for the most recent executed trade price of a symbol.
func (s *Store) GetCurrentPrice(symbol string) (float64, error) {
	var price float64

	err := s.tsdb.Raw(`
		SELECT price
		FROM trade_records
		WHERE symbol = ?
		ORDER BY executed_at DESC
		LIMIT 1
	`, symbol).Scan(&price).Error

	if err != nil {
		return 0, fmt.Errorf("failed to query current price for %s: %w", symbol, err)
	}

	// GORM's Scan() into a primitive type won't error out if 0 rows are returned;
	// it will just leave the float64 at its zero value (0.0).
	if price == 0 {
		return 0, fmt.Errorf("no trades found for symbol: %s", symbol)
	}

	return price, nil
}

// GetTradesBySymbol queries trade_records for a given symbol from the Candlestick DB.
// Used by portfolio history — returns the N most recent trades.
func (s *Store) GetTradesBySymbol(symbol string, limit int) ([]TradeRecord, error) {
	var trades []TradeRecord
	err := s.tsdb.
		Raw(`SELECT id, symbol, price, quantity, maker_order_id, taker_order_id, maker_user_id, taker_user_id, executed_at
			 FROM trade_records
			 WHERE symbol = ?
			 ORDER BY executed_at DESC
			 LIMIT ?`, symbol, limit).
		Scan(&trades).Error
	return trades, err
}

// GetTradesByUserID queries trade_records for all trades involving a given user.
// Matches trades where the user was either the maker or the taker.
func (s *Store) GetTradesByUserID(userID uint) ([]TradeRecord, error) {
	var trades []TradeRecord
	err := s.tsdb.
		Raw(`SELECT id, symbol, price, quantity, maker_order_id, taker_order_id, maker_user_id, taker_user_id, executed_at
			 FROM trade_records
			 WHERE maker_user_id = ? OR taker_user_id = ?
			 ORDER BY executed_at DESC`, userID, userID).
		Scan(&trades).Error
	return trades, err
}

// MarketPriceData holds the computed market snapshot for a single symbol.
type MarketPriceData struct {
	Symbol    string    `json:"symbol"`
	Price     float64   `json:"price"`      // current mid price from Redis
	Change24h float64   `json:"change_24h"` // % change over last 24h
	High24h   float64   `json:"high_24h"`   // highest high in last 24h
	Low24h    float64   `json:"low_24h"`    // lowest low in last 24h
	Volume24h float64   `json:"volume_24h"` // notional volume (price * qty) over 24h
	Sparkline []float64 `json:"sparkline"`  // last 8 close prices from candles_5s
}

func (s *Store) GetMarketPrices(symbols []string, startPrices map[string]float64) []MarketPriceData {
	results := make([]MarketPriceData, len(symbols))

	var wg sync.WaitGroup
	for i, symbol := range symbols {
		wg.Add(1)
		go func(idx int, sym string) {
			defer wg.Done()
			results[idx] = s.fetchSymbolMarketData(sym, startPrices[sym])
		}(i, symbol)
	}
	wg.Wait()

	return results
}

func (s *Store) fetchSymbolMarketData(symbol string, fallbackPrice float64) MarketPriceData {
	data := MarketPriceData{Symbol: symbol, Price: fallbackPrice}
	priceResolved := false

	// 1. Last traded price from Redis ring buffer (fastest, most accurate for ticker)
	recentRaw, err := s.redis.LIndex(s.ctx, "trades:recent:"+symbol, 0).Result()
	if err == nil {
		var lastTrade models.TradeMessage
		if json.Unmarshal([]byte(recentRaw), &lastTrade) == nil && lastTrade.Price > 0 {
			data.Price = lastTrade.Price
			priceResolved = true
		}
	}

	// 2. Fallback to mid price if no trades have happened yet (cold start)
	if !priceResolved {
		if raw, err := s.redis.Get(s.ctx, "midprice:"+symbol).Result(); err == nil {
			if p, err := strconv.ParseFloat(raw, 64); err == nil {
				data.Price = p
			}
		}
	}

	// 3. Sparkline — last 8 closed 5s buckets, reversed to oldest→newest
	var sparkCandles []CandleRecord
	s.tsdb.Raw(`
		SELECT close, bucket
		FROM candles_5s
		WHERE symbol = ?
		ORDER BY bucket DESC
		LIMIT 8
	`, symbol).Scan(&sparkCandles)

	data.Sparkline = make([]float64, len(sparkCandles))
	for i, c := range sparkCandles {
		data.Sparkline[len(sparkCandles)-1-i] = c.Close
	}

	// 4. 24h stats from candles_5s — open price, high, low and notional volume
	type Stats struct {
		Open24h   float64 `gorm:"column:open_24h"`
		High24h   float64 `gorm:"column:high_24h"`
		Low24h    float64 `gorm:"column:low_24h"`
		Volume24h float64 `gorm:"column:volume_24h"`
	}
	var stats Stats
	s.tsdb.Raw(`
		SELECT
			FIRST(open, bucket)   AS open_24h,
			MAX(high)             AS high_24h,
			MIN(low)              AS low_24h,
			SUM(volume * close)   AS volume_24h
		FROM candles_5s
		WHERE symbol = ?
		  AND bucket > NOW() - INTERVAL '24 hours'
	`, symbol).Scan(&stats)

	data.Volume24h = stats.Volume24h
	data.High24h = stats.High24h
	data.Low24h = stats.Low24h

	// 5. % change: (last_traded - open_24h) / open_24h * 100
	if stats.Open24h > 0 {
		data.Change24h = ((data.Price - stats.Open24h) / stats.Open24h) * 100
	}

	// 6. Cold start fallback — no candle data yet
	if len(data.Sparkline) == 0 && data.Price > 0 {
		data.Sparkline = []float64{data.Price}
	}

	return data
}
