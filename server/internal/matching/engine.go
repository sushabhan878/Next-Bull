package matching

import (
	"log"
	"time"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
)

// ---- Data Structures ----

type OrderBook struct {
	Bids *OrderSide
	Asks *OrderSide
}

type Engine struct {
	Books       map[string]*OrderBook
	OrderIndex  map[string]*OrderNode
	OrderStream <-chan models.Order
	TradeStream chan<- models.TradeMessage
	EventStream chan<- models.MarketEvent // Replaced LOBStream with EventStream
}

// ---- Constructor ----

func NewEngine(
	orderStream <-chan models.Order,
	tradeStream chan<- models.TradeMessage,
	eventStream chan<- models.MarketEvent,
) *Engine {
	return &Engine{
		Books:       make(map[string]*OrderBook),
		OrderIndex:  make(map[string]*OrderNode),
		OrderStream: orderStream,
		TradeStream: tradeStream,
		EventStream: eventStream,
	}
}

// ---- Engine Loop ----

func (e *Engine) Start() {
	log.Println("Matching Engine Started...")
	for order := range e.OrderStream {
		e.processOrder(order)
	}
}

// ---- Order Processing ----

func (e *Engine) processOrder(order models.Order) {
	if order.Symbol == "BTCUSDT" && order.Quantity > 50 {
		log.Printf("🚨 GHOST CAUGHT! Massive %d share order received from UserID: %d", order.Quantity, order.UserID)
	}

	if order.Timestamp == 0 {
		order.Timestamp = time.Now().UnixNano()
	}
	book := e.getBook(order.Symbol)

	switch order.Type {
	case models.Limit:
		e.matchLimitOrder(order, book)
	case models.Market:
		e.matchMarketOrder(order, book)
	case models.Cancel:
		e.cancelOrder(order, book)
	}
}

// ---- Book Management ----

func (e *Engine) getBook(symbol string) *OrderBook {
	book, exists := e.Books[symbol]
	if !exists {
		book = &OrderBook{
			Bids: NewOrderSide(true),
			Asks: NewOrderSide(false),
		}
		e.Books[symbol] = book
		log.Printf("Created new Order Book for symbol: %s", symbol)
	}
	return book
}

// ---- Matching Logic ----

func (e *Engine) matchLimitOrder(order models.Order, book *OrderBook) {
	switch order.Side {
	case models.Buy:
		remaining := e.match(order, book.Asks)
		if remaining > 0 {
			order.Quantity = remaining
			book.Bids.Add(order, e.OrderIndex)
			// Emit Event: Volume Added to Bids
			e.EventStream <- models.MarketEvent{Type: models.EventVolumeAdded, Symbol: order.Symbol, Side: order.Side, Price: order.Price, Quantity: remaining}
		}
	case models.Sell:
		remaining := e.match(order, book.Bids)
		if remaining > 0 {
			order.Quantity = remaining
			book.Asks.Add(order, e.OrderIndex)
			// Emit Event: Volume Added to Asks
			e.EventStream <- models.MarketEvent{Type: models.EventVolumeAdded, Symbol: order.Symbol, Side: order.Side, Price: order.Price, Quantity: remaining}
		}
	}
}

func (e *Engine) matchMarketOrder(order models.Order, book *OrderBook) {
	switch order.Side {
	case models.Buy:
		remaining := e.match(order, book.Asks)
		if remaining > 0 {
			log.Printf("[%s] Market BUY not fully filled (%d remaining — no liquidity)", order.Symbol, remaining)
		}
	case models.Sell:
		remaining := e.match(order, book.Bids)
		if remaining > 0 {
			log.Printf("[%s] Market SELL not fully filled (%d remaining — no liquidity)", order.Symbol, remaining)
		}
	}
}

func (e *Engine) match(taker models.Order, side *OrderSide) int64 {
	remaining := taker.Quantity

	for remaining > 0 {
		bestPrice, ok := side.BestPrice()
		if !ok {
			break
		}

		if taker.Type == models.Limit {
			if taker.Side == models.Buy && bestPrice > taker.Price {
				break
			}
			if taker.Side == models.Sell && bestPrice < taker.Price {
				break
			}
		}

		queue := side.GetQueue(bestPrice)

		for node := queue.Front(); node != nil && remaining > 0; node = queue.Front() {
			maker := &node.Order

			// -----------------------------------------------------------
			// NEW: Self-Trade Prevention (STP)
			// If the taker and maker are the exact same user ID, block it!
			// -----------------------------------------------------------
			if maker.UserID != 0 && maker.UserID == taker.UserID {
				// log.Printf("🛡️ STP TRIGGERED: Prevented User %d from trading with itself on %s", taker.UserID, taker.Symbol)

				// Emit Event: Volume Removed due to STP cancellation
				e.EventStream <- models.MarketEvent{
					Type:     models.EventVolumeRemoved,
					Symbol:   taker.Symbol,
					Side:     maker.Side,
					Price:    bestPrice,
					Quantity: maker.Quantity,
				}

				queue.PopFront()
				delete(e.OrderIndex, maker.ID)
				continue // Skip to the next order in the queue
			}
			// -----------------------------------------------------------

			tradeQty := min(remaining, maker.Quantity)

			e.TradeStream <- models.TradeMessage{
				Symbol:       taker.Symbol,
				MakerOrderID: maker.ID,
				TakerOrderID: taker.ID,
				MakerUserID:  maker.UserID,
				TakerUserID:  taker.UserID,
				Price:        bestPrice,
				Quantity:     tradeQty,
				Timestamp:    time.Now().UnixNano(),
			}

			// Emit Event: Volume Removed from Maker's Side
			e.EventStream <- models.MarketEvent{Type: models.EventVolumeRemoved, Symbol: taker.Symbol, Side: maker.Side, Price: bestPrice, Quantity: tradeQty}

			// log.Printf("[%s] TRADE: %d shares @ ₹%.2f", taker.Symbol, tradeQty, bestPrice)

			remaining -= tradeQty
			maker.Quantity -= tradeQty

			if maker.Quantity == 0 {
				queue.PopFront()
				delete(e.OrderIndex, maker.ID)
			}
		}

		if queue.Empty() {
			side.RemovePriceLevel(bestPrice)
		}
	}

	return remaining
}

func (e *Engine) cancelOrder(order models.Order, book *OrderBook) {
	node, exists := e.OrderIndex[order.ID]
	if !exists {
		return
	}

	side := book.Asks
	if node.Order.Side == models.Buy {
		side = book.Bids
	}

	price := node.Order.Price
	queue := side.GetQueue(price)
	if queue == nil {
		delete(e.OrderIndex, order.ID)
		return
	}

	// Emit Event: Volume Removed due to Cancel
	e.EventStream <- models.MarketEvent{Type: models.EventVolumeRemoved, Symbol: order.Symbol, Side: node.Order.Side, Price: node.Order.Price, Quantity: node.Order.Quantity}

	queue.Remove(node)
	delete(e.OrderIndex, order.ID)

	if queue.Empty() {
		side.RemovePriceLevel(price)
	}

	// log.Printf("Cancelled Order: %s", order.ID)
}

// ---- Helpers ----

func min(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

// ---- Time Complexities ----
// Add order:    O(1) existing price level | O(log P) new price level (BST insert)
// Cancel order: O(1) via OrderIndex lookup
// Match orders: O(K + L log P) — K trades executed, L price levels traversed
// LOB snapshot: O(P) — one BST Slice() traversal + O(N) VolumeAt per level