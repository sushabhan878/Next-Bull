package matching

import (
	set "github.com/hashicorp/go-set"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
)

const DefaultLOBDepth = 15

type OrderSide struct {
	Prices  map[float64]*OrderQueue
	Ordered *set.TreeSet[float64, set.Compare[float64]]
}

func NewOrderSide(isBid bool) *OrderSide {
	var cmp set.Compare[float64]

	if isBid {
		// Bids → highest price first (descending)
		cmp = func(a, b float64) int {
			if a > b {
				return -1
			}
			if a < b {
				return 1
			}
			return 0
		}
	} else {
		// Asks → lowest price first (ascending)
		cmp = func(a, b float64) int {
			if a < b {
				return -1
			}
			if a > b {
				return 1
			}
			return 0
		}
	}

	return &OrderSide{
		Prices:  make(map[float64]*OrderQueue),
		Ordered: set.NewTreeSet(cmp),
	}
}

func (os *OrderSide) Add(order models.Order, index map[string]*OrderNode) {
	q, ok := os.Prices[order.Price]
	if !ok {
		q = &OrderQueue{}
		os.Prices[order.Price] = q
		os.Ordered.Insert(order.Price)
	}
	node := q.Push(order)
	index[order.ID] = node
}

func (os *OrderSide) BestPrice() (float64, bool) {
	if os.Ordered.Empty() {
		return 0, false
	}
	return os.Ordered.Min(), true
}

func (os *OrderSide) NextPrice(price float64) (float64, bool) {
	next, ok := os.Ordered.FirstAbove(price)
	return next, ok
}

func (os *OrderSide) RemovePriceLevel(price float64) {
	delete(os.Prices, price)
	os.Ordered.Remove(price)
}

func (os *OrderSide) GetQueue(price float64) *OrderQueue {
	return os.Prices[price]
}

// AllPrices returns all active price levels in the TreeSet's natural order.
// For Bids (isBid=true): descending (highest first).
// For Asks (isBid=false): ascending (lowest first).
// The ascending parameter is kept for call-site clarity but the comparator
// already guarantees the correct order — Slice() honours it directly.
func (os *OrderSide) AllPrices(_ bool) []float64 {
	return os.Ordered.Slice()
}

// VolumeAt returns the total resting quantity at a given price level.
// Iterates the queue at that price level — O(N) where N = orders at that level.
// Called by TopN and logOrderBookState in engine.go.
func (os *OrderSide) VolumeAt(price float64) int64 {
	q, ok := os.Prices[price]
	if !ok || q == nil || q.Empty() {
		return 0
	}
	var vol int64
	for node := q.Front(); node != nil; node = node.Next {
		vol += node.Order.Quantity
	}
	return vol
}

// TopN returns the top n price levels with their aggregated volume.
// Traverses the TreeSet in its natural order (best prices first for both
// bids and asks), stops early once n levels are collected.
// This is O(n) rather than O(P) — no full book traversal needed.
func (os *OrderSide) TopN(n int) []models.PriceLevel {
	prices := os.Ordered.Slice()
	if len(prices) > n {
		prices = prices[:n] // slice off everything beyond depth n
	}
	levels := make([]models.PriceLevel, 0, len(prices))
	for _, price := range prices {
		vol := os.VolumeAt(price)
		if vol > 0 {
			levels = append(levels, models.PriceLevel{
				Price:    price,
				Quantity: vol,
			})
		}
	}
	return levels
}
