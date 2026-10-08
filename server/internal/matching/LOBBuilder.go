package matching

import (
	"sort"
	"time"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
)

// ShadowBook now uses slices kept in strict sorted order at all times.
// Bids are sorted Descending (Highest price first).
// Asks are sorted Ascending (Lowest price first).
type ShadowBook struct {
	Bids  []models.PriceLevel
	Asks  []models.PriceLevel
	dirty bool
}

type MarketDataService struct {
	Books       map[string]*ShadowBook
	EventStream <-chan models.MarketEvent
	LOBStream   chan<- models.LOBSnapshot
}

func NewMarketDataService(eventStream <-chan models.MarketEvent, lobStream chan<- models.LOBSnapshot) *MarketDataService {
	return &MarketDataService{
		Books:       make(map[string]*ShadowBook),
		EventStream: eventStream,
		LOBStream:   lobStream,
	}
}

func (m *MarketDataService) Start() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case event := <-m.EventStream:
			m.applyEvent(event)
		case <-ticker.C:
			m.emitSnapshots()
		}
	}
}

func (m *MarketDataService) applyEvent(event models.MarketEvent) {
	book, exists := m.Books[event.Symbol]
	if !exists {
		book = &ShadowBook{
			Bids:  make([]models.PriceLevel, 0, 100), // Pre-allocate capacity
			Asks:  make([]models.PriceLevel, 0, 100),
			dirty: false,
		}
		m.Books[event.Symbol] = book
	}

	delta := event.Quantity
	if event.Type == models.EventVolumeRemoved {
		delta = -event.Quantity
	}

	if event.Side == models.Buy {
		book.Bids = updateBids(book.Bids, event.Price, delta)
	} else {
		book.Asks = updateAsks(book.Asks, event.Price, delta)
	}

	book.dirty = true
}

// updateBids maintains a Descending sorted slice (Highest price at index 0)
func updateBids(bids []models.PriceLevel, price float64, delta int64) []models.PriceLevel {
	// Binary search for the price (Note: sorted descending, so we use <=)
	idx := sort.Search(len(bids), func(i int) bool { return bids[i].Price <= price })

	if idx < len(bids) && bids[idx].Price == price {
		// Price level exists
		bids[idx].Quantity += delta
		if bids[idx].Quantity <= 0 {
			// Remove element efficiently
			bids = append(bids[:idx], bids[idx+1:]...)
		}
	} else if delta > 0 {
		// Price level doesn't exist, insert at idx
		bids = append(bids, models.PriceLevel{}) // Grow slice by 1
		copy(bids[idx+1:], bids[idx:])           // Shift elements right
		bids[idx] = models.PriceLevel{Price: price, Quantity: delta}
	}

	return bids
}

// updateAsks maintains an Ascending sorted slice (Lowest price at index 0)
func updateAsks(asks []models.PriceLevel, price float64, delta int64) []models.PriceLevel {
	// Binary search for the price (Note: sorted ascending, so we use >=)
	idx := sort.Search(len(asks), func(i int) bool { return asks[i].Price >= price })

	if idx < len(asks) && asks[idx].Price == price {
		// Price level exists
		asks[idx].Quantity += delta
		if asks[idx].Quantity <= 0 {
			// Remove element efficiently
			asks = append(asks[:idx], asks[idx+1:]...)
		}
	} else if delta > 0 {
		// Price level doesn't exist, insert at idx
		asks = append(asks, models.PriceLevel{}) // Grow slice by 1
		copy(asks[idx+1:], asks[idx:])           // Shift elements right
		asks[idx] = models.PriceLevel{Price: price, Quantity: delta}
	}

	return asks
}

func (m *MarketDataService) emitSnapshots() {
	const maxDepth = 15

	for symbol, book := range m.Books {
		if !book.dirty {
			continue
		}

		// Snapshots are now O(1)! Just slice the first 15 elements.
		var snapBids []models.PriceLevel
		if len(book.Bids) > maxDepth {
			snapBids = book.Bids[:maxDepth]
		} else {
			snapBids = book.Bids
		}

		var snapAsks []models.PriceLevel
		if len(book.Asks) > maxDepth {
			snapAsks = book.Asks[:maxDepth]
		} else {
			snapAsks = book.Asks
		}

		var midPrice float64
		if len(snapBids) > 0 && len(snapAsks) > 0 {
			midPrice = (snapBids[0].Price + snapAsks[0].Price) / 2.0
		}

		select {
		case m.LOBStream <- models.LOBSnapshot{
			Symbol:   symbol,
			Bids:     snapBids, // Already perfectly sorted!
			Asks:     snapAsks, // Already perfectly sorted!
			MidPrice: midPrice,
		}:
		default:
			// Drop if consumer is slow
		}

		book.dirty = false
	}
}