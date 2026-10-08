package models

// ClientMessage is what the frontend sends to the backend
type ClientMessage struct {
	Action string `json:"action"` // "subscribe" or "unsubscribe"
	Channel string `json:"channel"` // "orderbook", "candles", "portfolio"
	Topic  string `json:"topic"`  // "candles:AAPL", "orderbook:BTC", "portfolio:123"
}

// ServerMessage is what the backend sends to the frontend
type ServerMessage struct {
	Topic string      `json:"topic"` // Tells the frontend what this data is
	Data  interface{} `json:"data"`  // The actual payload (Candlestick, Orderbook, etc.)
}

// OrderbookUpdate is a sample payload for the Data field
type OrderbookUpdate struct {
	Symbol string     `json:"symbol"`
	Bids   [][]string `json:"bids"` // e.g., [["150.00", "10.5"], ["149.90", "5.2"]]
	Asks   [][]string `json:"asks"`
}