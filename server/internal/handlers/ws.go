package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/utils"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/utils/response"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type priceUpdate struct {
	Symbol string
	Price  any
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// 1. Try to Authenticate
	var userID uint
	tokenString := r.URL.Query().Get("token")
	if tokenString == "" {
		// Try header
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = authHeader[7:]
		}
	}

	if tokenString != "" {
		// USE THE INJECTED CONFIG HERE
		claims, err := utils.ValidateToken(tokenString, h.Config.Server.JWTSecret)
		if err == nil {
			userID = claims.UserID
			slog.Info("Authenticated WS connection", "userID", userID)
		} else {
			slog.Warn("Wont authenticate WS connection: invalid token", "error", err)
		}
	}

	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})

	if err != nil {
		response.WriteJson(w, http.StatusInternalServerError, map[string]string{"error": "Failed to accept WebSocket connection"})
		return
	}

	defer c.CloseNow()

	ctx := r.Context()
	slog.Info("🟢 Frontend connected to WebSocket")

	for {
		var msg models.ClientMessage

		// wsjson.Read pauses here and waits for the frontend to send a message
		err := wsjson.Read(ctx, c, &msg)
		if err != nil {
			// If we get an error here, it usually means the client disconnected
			slog.Error("🔴 WebSocket closed or read error", "error", err)
			break
		}

		// 3. Handle the Subscription Request
		if msg.Action == "subscribe" {
			slog.Info("Client wants to subscribe to topic", "topic", msg.Topic)

			// Route the request based on the topic prefix
			// (In a real app, this triggers a Redis Pub/Sub subscription)
			switch {
			case len(msg.Topic) > 9 && msg.Topic[:9] == "orderbook":
				go h.streamLobSnapshot(ctx, c, msg.Topic) // Run in a background thread (Assuming you want streamOrderbook or streamLobSnapshot here)
			case len(msg.Topic) > 7 && msg.Topic[:7] == "candles":
				go h.streamCandles(ctx, c, msg.Topic)
			case len(msg.Topic) > 9 && msg.Topic[:9] == "portfolio":
				if userID == 0 {
					slog.Warn("Unauthenticated client tried to subscribe to portfolio data")
					continue
				}
				go h.streamPortFolioData(ctx, c, msg.Topic, userID)
			case msg.Topic == "prices:all":
				go h.streamPrices(ctx, c)
			case msg.Topic == "watchlist":
				if userID == 0 {
					slog.Warn("Unauthenticated client tried to subscribe to watchlist")
					continue
				}
				go h.streamWatchlist(ctx, c, userID)
			default:
				slog.Error("Unknown topic requested", "topic", msg.Topic)
			}
		}
	}
}

func (h *Handler) streamOrderbook(ctx context.Context, c *websocket.Conn, topic string) {
	// USE REDIS!
	pubsub := h.DB.Redis.Subscribe(ctx, topic)
	defer pubsub.Close()
	ch := pubsub.Channel()

	log.Printf("📡 Subscribed to Redis channel: %s", topic)

	for {
		select {
		case <-ctx.Done():
			log.Printf("🛑 Client disconnected from %s", topic)
			return

		case msg := <-ch:
			// A message arrived from Redis
			var obUpdate models.OrderbookUpdate
			if err := json.Unmarshal([]byte(msg.Payload), &obUpdate); err != nil {
				continue
			}

			response := models.ServerMessage{
				Topic: topic,
				Data:  obUpdate,
			}

			if err := wsjson.Write(ctx, c, response); err != nil {
				return
			}
		}
	}
}

func (h *Handler) streamLobSnapshot(ctx context.Context, c *websocket.Conn, topic string) {
	// This Streams LOB Snapshots from redis
	pubsub := h.DB.Redis.Subscribe(ctx, topic)
	defer pubsub.Close()
	ch := pubsub.Channel()
	log.Printf("📡 Subscribed to Redis channel: %s", topic)

	for {
		select {
		case <-ctx.Done():
			log.Printf("🛑 Client disconnected from %s", topic)
			return
		case msg := <-ch:
			var lobSnapshot models.LOBSnapshot
			if err := json.Unmarshal([]byte(msg.Payload), &lobSnapshot); err != nil {
				continue
			}

			if err := wsjson.Write(ctx, c, models.ServerMessage{
				Topic: topic,
				Data:  lobSnapshot,
			}); err != nil {
				return
			}
		}

	}
}

// candleTick mirrors storage.CurrentCandle for local unmarshaling in this handler.
type candleTick struct {
	Open       float64   `json:"open"`
	High       float64   `json:"high"`
	Low        float64   `json:"low"`
	Close      float64   `json:"close"`
	Volume     int64     `json:"volume"`
	BucketTime time.Time `json:"bucket_time"`
}

func (h *Handler) streamCandles(ctx context.Context, c *websocket.Conn, topic string) {
	// Topic format: "candles:{symbol}" or "candles:{symbol}:{timeframe}"
	parts := strings.Split(topic, ":")
	symbol := ""
	interval := "1s" // default

	if len(parts) >= 2 {
		symbol = parts[1]
	}
	if len(parts) >= 3 {
		interval = parts[2]
	}
	if interval != "1s" && interval != "5s" {
		interval = "1s"
	}

	// Always subscribe to the 1s Redis channel (the raw tick source)
	redisChannel := "candles:" + symbol
	pubsub := h.DB.Redis.Subscribe(ctx, redisChannel)
	defer pubsub.Close()
	ch := pubsub.Channel()

	log.Printf("📡 Subscribed to Redis channel: %s (interval: %s)", redisChannel, interval)

	// Send the full available history on connect
	candles, err := h.Store.GetCandles(symbol, interval, 50000)
	if err != nil {
		log.Printf("Error fetching candles for %s: %v", symbol, err)
	}
	if len(candles) > 0 {
		if err := wsjson.Write(ctx, c, models.ServerMessage{
			Topic: topic + ":historical",
			Data:  candles,
		}); err != nil {
			return
		}
	} else {
		log.Printf("No historical candles found for %s (interval: %s)", symbol, interval)
	}

	if interval == "1s" {
		// Stream raw 1s ticks directly to the client
		for {
			select {
			case <-ctx.Done():
				log.Printf("🛑 Client disconnected from %s", topic)
				return
			case msg := <-ch:
				var candleData json.RawMessage = []byte(msg.Payload)
				if err := wsjson.Write(ctx, c, models.ServerMessage{Topic: topic, Data: candleData}); err != nil {
					return
				}
			}
		}
	} else {
		// 5s: aggregate incoming 1s ticks into 5-second OHLCV buckets server-side
		var accum *candleTick

		for {
			select {
			case <-ctx.Done():
				log.Printf("🛑 Client disconnected from %s", topic)
				return
			case msg := <-ch:
				var tick candleTick
				if err := json.Unmarshal([]byte(msg.Payload), &tick); err != nil {
					continue
				}

				bucket := tick.BucketTime.Truncate(5 * time.Second)

				if accum == nil || !bucket.Equal(accum.BucketTime) {
					// New 5s bucket — start fresh
					accum = &candleTick{
						Open:       tick.Open,
						High:       tick.High,
						Low:        tick.Low,
						Close:      tick.Close,
						Volume:     tick.Volume,
						BucketTime: bucket,
					}
				} else {
					// Same bucket — update running OHLCV
					if tick.High > accum.High {
						accum.High = tick.High
					}
					if tick.Low < accum.Low {
						accum.Low = tick.Low
					}
					accum.Close = tick.Close
					accum.Volume += tick.Volume
				}

				if err := wsjson.Write(ctx, c, models.ServerMessage{Topic: topic, Data: accum}); err != nil {
					return
				}
			}
		}
	}
}

func (h *Handler) streamPortFolioData(ctx context.Context, c *websocket.Conn, topic string, userID uint) {
	// 1. Get User Portfolio from Postgres
	portfolio, err := h.GetPortfolio(fmt.Sprintf("%d", userID))
	if err != nil {
		slog.Error("Failed to get portfolio for user", "userID", userID, "error", err)
		return
	}

	for _, holding := range portfolio.Holdings {
		price, err := h.Store.GetCurrentPrice(holding.Symbol)
		if err != nil {
			slog.Error("Failed to get initial price", "symbol", holding.Symbol, "error", err)
			continue
		}
		holding.CurrentPrice = price
	}

	// 3. Send initial payload
	initialResponse := models.ServerMessage{
		Topic: topic,
		Data: map[string]any{
			"portfolio": portfolio,
		},
	}
	if err := wsjson.Write(ctx, c, initialResponse); err != nil {
		slog.Error("Failed to write initial portfolio data", "userID", userID, "error", err)
		return
	}

	// 4. Create a central channel for state updates
	updateCh := make(chan priceUpdate)

	// 5. Start a SINGLE state-manager goroutine
	// This ensures only one thread updates the map and writes to the websocket
	go func() {
		for {
			select {
			case <-ctx.Done():
				return // exit if websocket disconnects
			case update := <-updateCh:
				// Safely update the map (no mutex needed since it's only happening in this goroutine)
				for i := range portfolio.Holdings {
					if portfolio.Holdings[i].Symbol == update.Symbol {
						portfolio.Holdings[i].CurrentPrice = update.Price.(float64)
						break
					}
				}
				response := models.ServerMessage{
					Topic: topic,
					Data: map[string]any{
						"portfolio": portfolio,
					},
				}

				// Safely write to websocket sequentially
				if err := wsjson.Write(ctx, c, response); err != nil {
					log.Printf("Failed to write websocket update for user %d: %v", userID, err)
					return // consider closing the connection/context here
				}
			}
		}
	}()

	// 6. Start Redis subscribers for each holding
	for _, holding := range portfolio.Holdings {
		// Pass holding.Symbol explicitly to the closure to avoid variable capture bugs
		go func(symbol string) {
			candleTopic := "candles:" + symbol
			pubsub := h.DB.Redis.Subscribe(ctx, candleTopic)
			defer pubsub.Close()
			ch := pubsub.Channel()

			log.Printf("📡 Subscribed to Redis channel: %s for user %d", candleTopic, userID)

			for {
				select {
				case <-ctx.Done():
					log.Printf("🛑 Client disconnected from %s", candleTopic)
					return
				case _ = <-ch:
					// PRO TIP: Try to unmarshal the price directly from msg.Payload
					// instead of hitting the database!
					// Example:
					// var newPrice float64
					// if err := json.Unmarshal([]byte(msg.Payload), &newPrice); err == nil {
					//     updateCh <- priceUpdate{Symbol: symbol, Price: newPrice}
					// }

					// log.Printf("Received update for %s: %s", symbol, msg.Payload)

					// If you MUST hit the DB:
					price, err := h.Store.GetCurrentPrice(symbol)
					if err != nil {
						slog.Error("Failed to get current price", "symbol", symbol, "error", err)
						continue
					}

					// Send the update to the manager goroutine
					updateCh <- priceUpdate{
						Symbol: symbol,
						Price:  price,
					}
				}
			}
		}(holding.Symbol)
	}
}

func (h *Handler) streamPrices(ctx context.Context, c *websocket.Conn) {
	pubsub := h.DB.Redis.Subscribe(ctx, "prices:all")
	defer pubsub.Close()
	ch := pubsub.Channel()

	log.Printf("📡 Subscribed to Redis channel: prices:all")

	// 1. Send initial full snapshot immediately on connect
	if err := h.pushMarketPrices(ctx, c); err != nil {
		log.Printf("Failed to send initial market prices: %v", err)
		return
	}

	// 2. Throttle — at most one push per 500ms regardless of tick frequency
	throttle := time.NewTicker(500 * time.Millisecond)
	defer throttle.Stop()
	dirty := false // true if a tick arrived since last push

	for {
		select {
		case <-ctx.Done():
			log.Printf("🛑 Client disconnected from prices:all")
			return

		case <-ch:
			dirty = true // tick received, mark as needing a push

		case <-throttle.C:
			if !dirty {
				continue
			}
			dirty = false
			if err := h.pushMarketPrices(ctx, c); err != nil {
				log.Printf("Failed to push market prices: %v", err)
				return
			}
		}
	}
}

// pushMarketPrices fetches full MarketPriceData for all assets and writes to the WebSocket.
func (h *Handler) pushMarketPrices(ctx context.Context, c *websocket.Conn) error {
	// Load assets from Redis to get symbols + start prices
	assetsMap, err := h.DB.Redis.HGetAll(ctx, "market:assets").Result()
	if err != nil || len(assetsMap) == 0 {
		return fmt.Errorf("no assets in Redis: %w", err)
	}

	symbols := make([]string, 0, len(assetsMap))
	startPrices := make(map[string]float64, len(assetsMap))

	for _, assetStr := range assetsMap {
		var asset struct {
			Ticker     string  `json:"ticker"`
			StartPrice float64 `json:"start_price"`
		}
		if err := json.Unmarshal([]byte(assetStr), &asset); err == nil && asset.Ticker != "" {
			symbols = append(symbols, asset.Ticker)
			startPrices[asset.Ticker] = asset.StartPrice
		}
	}

	prices := h.Store.GetMarketPrices(symbols, startPrices)

	return wsjson.Write(ctx, c, models.ServerMessage{
		Topic: "prices:all",
		Data:  prices,
	})
}

// streamWatchlist sends live market data for only the user's watchlist symbols.
// It sends an initial snapshot on connect, then listens on prices:all and
// re-fetches data for the watchlist symbols on each trigger (throttled to 500ms).
func (h *Handler) streamWatchlist(ctx context.Context, c *websocket.Conn, userID uint) {
	log.Printf("📡 Starting watchlist stream for user %d", userID)

	// 1. Send initial snapshot
	if err := h.pushWatchlistPrices(ctx, c, userID); err != nil {
		log.Printf("Failed to send initial watchlist data for user %d: %v", userID, err)
		return
	}

	// 2. Subscribe to prices:all trigger channel
	pubsub := h.DB.Redis.Subscribe(ctx, "prices:all")
	defer pubsub.Close()
	ch := pubsub.Channel()

	// 3. Throttle — at most one push per 500ms
	throttle := time.NewTicker(500 * time.Millisecond)
	defer throttle.Stop()
	dirty := false

	for {
		select {
		case <-ctx.Done():
			log.Printf("🛑 User %d disconnected from watchlist stream", userID)
			return
		case <-ch:
			dirty = true
		case <-throttle.C:
			if !dirty {
				continue
			}
			dirty = false
			if err := h.pushWatchlistPrices(ctx, c, userID); err != nil {
				log.Printf("Failed to push watchlist prices for user %d: %v", userID, err)
				return
			}
		}
	}
}

// pushWatchlistPrices fetches the user's watchlist from Postgres, loads start prices
// from Redis, computes live market data, and writes it to the WebSocket.
func (h *Handler) pushWatchlistPrices(ctx context.Context, c *websocket.Conn, userID uint) error {
	// 1. Get watchlist entries from Postgres
	var entries []models.Watchlist
	if err := h.DB.Primary.Where("user_id = ?", userID).Find(&entries).Error; err != nil {
		return fmt.Errorf("failed to query watchlist: %w", err)
	}

	if len(entries) == 0 {
		return wsjson.Write(ctx, c, models.ServerMessage{
			Topic: "watchlist",
			Data:  []interface{}{},
		})
	}

	// 2. Load start prices from Redis market:assets
	symbols := make([]string, 0, len(entries))
	startPrices := make(map[string]float64, len(entries))

	for _, entry := range entries {
		assetStr, err := h.DB.Redis.HGet(ctx, "market:assets", entry.Symbol).Result()
		if err != nil {
			continue
		}
		var asset struct {
			Ticker     string  `json:"ticker"`
			StartPrice float64 `json:"start_price"`
		}
		if err := json.Unmarshal([]byte(assetStr), &asset); err == nil && asset.Ticker != "" {
			symbols = append(symbols, asset.Ticker)
			startPrices[asset.Ticker] = asset.StartPrice
		}
	}

	// 3. Compute live market data
	prices := h.Store.GetMarketPrices(symbols, startPrices)

	return wsjson.Write(ctx, c, models.ServerMessage{
		Topic: "watchlist",
		Data:  prices,
	})
}
