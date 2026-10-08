package synthetic

import (
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"
	"context"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/simulation/gbm"
)

const MarketMakerUserID uint = 999999998 

type MarketMaker struct {
	manager      *gbm.MarketManager
	orderStream  chan<- models.Order
	activeOrders map[string][]models.Order
	mu           sync.Mutex
	idCounter    int64
}

func NewMarketMaker(manager *gbm.MarketManager, orderStream chan<- models.Order) *MarketMaker {
	rand.Seed(time.Now().UnixNano())
	return &MarketMaker{
		manager:      manager,
		orderStream:  orderStream,
		activeOrders: make(map[string][]models.Order),
	}
}

// Start tracks specific symbols and updates their order books continuously
func (mm *MarketMaker) Start(ctx context.Context, symbols []string, tickRate time.Duration) {
	ticker := time.NewTicker(tickRate)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// Graceful shutdown triggered: break the infinite loop and exit the Goroutine
			// You can optionally add a log.Println("Market Maker shutting down...") here
			return
            
		case <-ticker.C:
			// Normal tick operation: update the order book for all symbols
			for _, symbol := range symbols {
				mm.updateOrderBook(symbol)
			}
		}
	}
}

func (mm *MarketMaker) updateOrderBook(symbol string) {
	fairPrice := mm.manager.GetPrice(symbol)
	if fairPrice <= 0 { return }
	
	currentSigma := mm.manager.GetVolatility(symbol)
	currentDrift := mm.manager.GetDrift(symbol)
	profile := mm.manager.GetProfile(symbol)

	normalMin := profile.SigmaBounds[gbm.NormalVol][0]
	normalMax := profile.SigmaBounds[gbm.NormalVol][1]
	expectedSigma := (normalMin + normalMax) / 2.0
	if expectedSigma <= 0 { expectedSigma = 0.2 }

	mm.mu.Lock()
	defer mm.mu.Unlock()

	// 1. Cancel the old ladder
	oldOrders := mm.activeOrders[symbol]
	for _, oldOrder := range oldOrders {
		cancelReq := models.Order{
			ID:       oldOrder.ID,
			UserID:   oldOrder.UserID,
			Type:     models.Cancel,
			Side:     oldOrder.Side,
			Price:    oldOrder.Price,
			Symbol:   symbol,
			Quantity: oldOrder.Quantity, 
		}
		mm.orderStream <- cancelReq
	}
	mm.activeOrders[symbol] = make([]models.Order, 0)

	// 2. Dynamic Spreads
	volSpreadScale := currentSigma / expectedSigma
	if volSpreadScale > 3.0 { volSpreadScale = 3.0 }
	if volSpreadScale < 0.3 { volSpreadScale = 0.3 }

	baseTickPct := 0.0001 * volSpreadScale
	tickSize := fairPrice * baseTickPct
	if tickSize < 0.01 { tickSize = 0.01 }

	spreadMultiplier := 1.0 + (rand.Float64() * 1.5)
	halfSpread := (tickSize * spreadMultiplier) / 2.0
	if halfSpread < 0.01 { halfSpread = 0.01 }

	currentBidPrice := fairPrice - halfSpread
	currentAskPrice := fairPrice + halfSpread

	// 3. NEW: Power-Law Base Notional Scaling
	// This ensures liquidity depth scales with the asset price
	baseConstant := 10000.0
	scalingFactor := 0.25
	
	// Add a small 10% random jitter to the baseline so it's not a rigid number
	baseTargetNotional := baseConstant * math.Pow(fairPrice, scalingFactor) * (0.95 + rand.Float64()*0.1)

	// 4. Volatility Thinning
	volQtyScale := expectedSigma / currentSigma
	if volQtyScale > 5.0 { volQtyScale = 5.0 }
	if volQtyScale < 0.2 { volQtyScale = 0.2 }

	// Drift Skewing
	bidSkew := 1.0 + currentDrift
	askSkew := 1.0 - currentDrift
	if bidSkew < 0.1 { bidSkew = 0.1 }
	if askSkew < 0.1 { askSkew = 0.1 }

	// 5. Dynamic Hard Cap (Relative to the scaled notional)
	// Allow any single level to grow up to 10x the base target
	maxMMNotional := baseTargetNotional * 10.0
	maxAllowedShares := int64(math.Max(1.0, math.Round(maxMMNotional/fairPrice)))

	// 6. Asymmetric Ladder Generation
	levels := rand.Intn(7) + 4

	for i := 0; i < levels; i++ {
		distanceScalar := 1.0 + (float64(i) * 0.5) 
		levelNotional := baseTargetNotional * distanceScalar

		rawLevelQty := (levelNotional * volQtyScale) / fairPrice
		if rawLevelQty < 1.0 { rawLevelQty = 1.0 }

		jitter := 0.85 + (rand.Float64() * 0.3) 
		bidQtyFloat := rawLevelQty * bidSkew * jitter
		askQtyFloat := rawLevelQty * askSkew * jitter

		if rand.Float64() > 0.8 { bidQtyFloat *= 3.0 }
		if rand.Float64() > 0.8 { askQtyFloat *= 3.0 }

		bidQty := int64(math.Round(bidQtyFloat))
		askQty := int64(math.Round(askQtyFloat))

		if bidQty < 1 { bidQty = 1 }
		if askQty < 1 { askQty = 1 }
		if bidQty > maxAllowedShares { bidQty = maxAllowedShares }
		if askQty > maxAllowedShares { askQty = maxAllowedShares }

		bidOrder := models.Order{
			ID:       mm.generateID("BID"),
			UserID:   MarketMakerUserID, 
			Symbol:   symbol,
			Type:     models.Limit,
			Side:     models.Buy,
			Price:    math.Round(currentBidPrice*100) / 100, 
			Quantity: bidQty,
		}

		askOrder := models.Order{
			ID:       mm.generateID("ASK"),
			UserID:   MarketMakerUserID, 
			Symbol:   symbol,
			Type:     models.Limit,
			Side:     models.Sell,
			Price:    math.Round(currentAskPrice*100) / 100,
			Quantity: askQty,
		}

		mm.activeOrders[symbol] = append(mm.activeOrders[symbol], bidOrder, askOrder)
		mm.orderStream <- bidOrder
		mm.orderStream <- askOrder

		bidGap := tickSize * (1.0 + rand.Float64()*1.5)
		askGap := tickSize * (1.0 + rand.Float64()*1.5)
		if bidGap < 0.01 { bidGap = 0.01 }
		if askGap < 0.01 { askGap = 0.01 }

		currentBidPrice -= bidGap
		currentAskPrice += askGap
	}
}

func (mm *MarketMaker) generateID(prefix string) string {
	mm.idCounter++
	return fmt.Sprintf("MM-%s-%d", prefix, mm.idCounter)
}