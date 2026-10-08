package models
import(
	"time"
)

// OrderType defines if it's a Limit, Market, or Cancel order
type OrderType string

const (
	Limit  OrderType = "LIMIT"
	Market OrderType = "MARKET"
	Cancel OrderType = "CANCEL"
)

// OrderStatus
type OrderStatus string

const (
	StatusPending   OrderStatus = "PENDING"
	StatusPartial   OrderStatus = "PARTIALLY_FILLED"
	StatusFilled    OrderStatus = "FILLED"
	StatusCancelled OrderStatus = "CANCELLED"
	StatusRejected  OrderStatus = "REJECTED"
)

// Side defines Buy or Sell
type Side string

const (
	Buy  Side = "BUY"
	Sell Side = "SELL"
)

// Order represents a user's request to buy or sell
type Order struct {
	ID             string      `json:"id"`
	UserID         uint        `json:"user_id"`
	Symbol         string      `json:"symbol"` // e.g."NXT", "AAPL"
	Type           OrderType   `json:"type"`
	Side           Side        `json:"side"`
	Price          float64     `json:"price"` // 0 for Market orders
	Quantity       int64       `json:"quantity"`
	FilledQuantity int64       `json:"filled_quantity"`
	Status         OrderStatus `json:"Status"`
	Timestamp      int64       `json:"timestamp"` // Used for Time priority
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
}

// TradeMessage represents a completed execution
type TradeMessage struct {
	Symbol       string  `json:"symbol"` //So the frontend knows which chart to update
	MakerOrderID string  `json:"maker_order_id"`
	TakerOrderID string  `json:"taker_order_id"`
	MakerUserID uint	`json:"maker_user_id"`
	TakerUserID uint 	`json:"taker_user_id"`
	Price        float64 `json:"price"`
	Quantity     int64   `json:"quantity"`
	Timestamp    int64   `json:"timestamp"`
}

// PriceLevel represents one row in the order book depth (snapshot)
type PriceLevel struct {
	Price    float64 `json:"price"`
	Quantity int64   `json:"quantity"`
}

// LOBSnapshot is emitted by the engine after every order is processed
type LOBSnapshot struct {
	Symbol   string       `json:"symbol"`
	Bids     []PriceLevel `json:"bids"` // sorted descending (best bid first)
	Asks     []PriceLevel `json:"asks"` // sorted ascending  (best ask first)
	MidPrice float64      `json:"mid_price"`
}

// EventType defines how the Shadow Book should update its volume
type EventType string

const (
	EventVolumeAdded   EventType = "VOLUME_ADDED"
	EventVolumeRemoved EventType = "VOLUME_REMOVED"
)

// MarketEvent is emitted by the core engine to update the Shadow Book instantly
type MarketEvent struct {
	Type     EventType `json:"type"`
	Symbol   string    `json:"symbol"`
	Side     Side      `json:"side"`     // The side of the book being modified (Maker's side)
	Price    float64   `json:"price"`
	Quantity int64     `json:"quantity"` // Delta quantity (how much added/removed)
}
