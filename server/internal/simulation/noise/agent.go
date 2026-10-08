package noise

import (
	"context" 
	"fmt"
	"math"
	"math/rand"
	"time"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/simulation/gbm"
)

const NoiseTraderUserID uint = 999999999 // Base ID, will be randomized per order

type Agent struct {
	marketManager *gbm.MarketManager
	orderStream   chan models.Order
	tickerTape    <-chan models.TradeMessage
	rng           *rand.Rand
}

type symbolState struct {
	marketPrice   float64
	priceEMA      float64 // Smoothed price for momentum
	nextOrderTime time.Time
}

func NewAgent(manager *gbm.MarketManager, stream chan models.Order, tape <-chan models.TradeMessage) *Agent {
	return &Agent{
		marketManager: manager,
		orderStream:   stream,
		tickerTape:    tape,
		rng:           rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// Start tracks specific symbols and dynamically shoots retail noise orders
func (a *Agent) Start(ctx context.Context, symbols []string, sessionDuration time.Duration) {
	kSensitivity := 10.0
	contrarianChance := 0.15
	
	// Alpha = 1.50 tames infinite variance while keeping realistic whale trades
	paretoAlpha := 1.50 
	
	baseDelay := 100 * time.Millisecond
	minDelayLimit := 1 * time.Millisecond
	alphaEMA := 0.1

	startTime := time.Now()
	states := make(map[string]*symbolState)
	
	for _, sym := range symbols {
		startPrice := a.marketManager.GetPrice(sym)
		states[sym] = &symbolState{
			marketPrice:   startPrice,
			priceEMA:      startPrice,
			nextOrderTime: time.Now().Add(CalculateNextDelay(baseDelay, 0.2, 0.0, minDelayLimit)),
		}
	}

	evalTicker := time.NewTicker(10 * time.Millisecond)
	defer evalTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			// Graceful shutdown triggered
			return

		case trade := <-a.tickerTape:
			if state, exists := states[trade.Symbol]; exists {
				state.marketPrice = trade.Price
				state.priceEMA = (trade.Price * alphaEMA) + (state.priceEMA * (1.0 - alphaEMA))
			}

		case <-evalTicker.C:
			now := time.Now()
			elapsed := now.Sub(startTime)
			progress := float64(elapsed) / float64(sessionDuration)
			if progress > 1.0 {
				startTime = now
				progress = 0.0
			}

			for sym, state := range states {
				if now.After(state.nextOrderTime) {
					
					// 1. Fetch live metrics & profile from the math engine
					currentVolatility := a.marketManager.GetVolatility(sym)
					profile := a.marketManager.GetProfile(sym)

					// 2. Calculate Expected Sigma for this specific asset
					normalMin := profile.SigmaBounds[gbm.NormalVol][0]
					normalMax := profile.SigmaBounds[gbm.NormalVol][1]
					expectedSigma := (normalMin + normalMax) / 2.0
					if expectedSigma <= 0 {
						expectedSigma = 0.2
					}

					// 3. Power-Law Notional Scaling (Institutional Filter)
					// C=5000, k=0.4: Expensive assets attract more capital per trade
					baseConstant := 5000.0
					scalingFactor := 0.2
					priceDependentNotional := baseConstant * math.Pow(state.marketPrice, scalingFactor)

					// 4. Retail Volatility Thinning 
					volQtyScale := expectedSigma / currentVolatility
					// CLAMP: Prevent exploding retail volumes if volatility crashes to near zero
					if volQtyScale > 5.0 { volQtyScale = 5.0 }
					if volQtyScale < 0.2 { volQtyScale = 0.2 }

					// Apply volatility scale to the dynamic notional
					adjustedNotional := priceDependentNotional * volQtyScale

					// Calculate exact fractional share count. DO NOT clamp to 1.0 here!
					dynamicMinSize := adjustedNotional / state.marketPrice

					// 5. Momentum calculation
					deltaS := 0.0
					if state.priceEMA > 0 {
						deltaS = (state.marketPrice - state.priceEMA) / state.priceEMA
					}

					side := DetermineOrderSide(a.rng, deltaS, kSensitivity, contrarianChance)
					
					// 6. Generate quantity using the fractional dynamicMinSize
					quantity := GenerateOrderSize(a.rng, paretoAlpha, dynamicMinSize)

					// 7. Implement a Hard Cap based on the scaled notional
					// A whale trading BTC has a higher ceiling than a retail trader on a penny stock
					maxRetailNotional := adjustedNotional * 20.0
					maxAllowedShares := int64(math.Max(1.0, math.Round(maxRetailNotional/state.marketPrice)))
					if quantity > maxAllowedShares {
						quantity = maxAllowedShares
					}

					orderType := models.Market
					orderPrice := 0.0

					// 70% chance Market, 30% chance Limit
					if a.rng.Float64() > 0.70 {
						orderType = models.Limit

						// Volatility Spread Expansion for Retail Limits
						volSpreadScale := currentVolatility / expectedSigma
						// CLAMP: Don't let limits get placed miles away or exactly at the market price
						if volSpreadScale > 3.0 { volSpreadScale = 3.0 }
						if volSpreadScale < 0.3 { volSpreadScale = 0.3 }

						baseTickPct := 0.0001 * volSpreadScale
						tickSize := state.marketPrice * baseTickPct

						// CLAMP: Enforce absolute minimum physical tick size
						if tickSize < 0.01 {
							tickSize = 0.01
						}

						distanceMultiplier := 1.0 + (a.rng.Float64() * 4.0)
						tickOffset := tickSize * distanceMultiplier

						// CLAMP: Ensure offset is meaningful pre-rounding
						if tickOffset < 0.01 {
							tickOffset = 0.01
						}

						if models.Side(side) == models.Buy {
							orderPrice = state.marketPrice - tickOffset
						} else {
							orderPrice = state.marketPrice + tickOffset
						}

						orderPrice = math.Round(orderPrice*100) / 100
					}

					// Generate a random pseudo-UserID for each order to prevent self-match bugs
					dynamicUserID := uint(900000000 + a.rng.Intn(10000))

					order := models.Order{
						ID:        generateOrderID(sym),
						UserID:    dynamicUserID, 
						Symbol:    sym,
						Side:      models.Side(side),
						Quantity:  quantity,
						Type:      orderType,
						Price:     orderPrice,
						Timestamp: time.Now().UnixNano(),
					}

					// Non-blocking channel send
					select {
					case a.orderStream <- order:
					default:
					}

					// Schedule the NEXT order
					nextDelay := CalculateNextDelay(baseDelay, currentVolatility, progress, minDelayLimit)
					state.nextOrderTime = now.Add(nextDelay)
				}
			}
		}
	}
}

// generateOrderID creates a quick, unique string ID for the orders
func generateOrderID(symbol string) string {
	return fmt.Sprintf("NOISE-%s-%d", symbol, time.Now().UnixNano())
}