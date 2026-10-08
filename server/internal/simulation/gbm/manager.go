package gbm

import (
	"log"
	"math/rand"
	"sync"
	"time"
)

type ManagedAsset struct {
	Ticker       string
	Generator    *Generator
	Profile      AssetProfile
	CurrentDrift DriftState
	CurrentVol   VolState
	cancel       chan struct{} // Kill switch for Goroutines
}

type MarketManager struct {
	assets map[string]*ManagedAsset
	mu     sync.RWMutex // Protects the map during add/delete operations
}

func NewMarketManager() *MarketManager {
	return &MarketManager{
		assets: make(map[string]*ManagedAsset),
	}
}

// AddAsset registers a new asset, builds its unique profile, and starts its lifecycles
func (m *MarketManager) AddAsset(ticker, assetClass string, startPrice float64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.assets[ticker]; exists {
		log.Printf("[%s] Asset already exists.", ticker)
		return
	}

	// 1. Generate the unique DNA and math engine
	profile := NewProfileFactory(assetClass)

	// 2. Calculate the initial Drift and Volatility based on the profile's "Normal" state!
	initialDriftBounds := profile.DriftBounds[NormalDrift]
	initialDrift := randomBetween(initialDriftBounds[0], initialDriftBounds[1])

	initialVolBounds := profile.SigmaBounds[NormalVol]
	initialVol := randomBetween(initialVolBounds[0], initialVolBounds[1])
	gen := NewGenerator(startPrice, initialDrift, initialVol, 0.00000000317)

																				// 0.1 second (1x): 0.00000000317
																				// 1 second (10x): 0.0000000317
																				// 2 seconds (20x): 0.0000000634
																				// 5 seconds (50x): 0.0000001585
																				// 10 seconds (100x): 0.000000317
																				// 20 seconds (200x): 0.000000634
																				// 1 minute (600x): 0.000001902

	asset := &ManagedAsset{
		Ticker:       ticker,
		Generator:    gen,
		Profile:      profile,
		CurrentDrift: NormalDrift,
		CurrentVol:   NormalVol,
		cancel:       make(chan struct{}),
	}

	m.assets[ticker] = asset

	// 3. Start the macro/micro physics and the price generator loops
	go m.manageDriftLifecycle(asset)
	go m.manageVolatilityLifecycle(asset)
	go m.runPriceGenerator(asset)

	log.Printf("[%s] Successfully added to market.", ticker)
}

// RemoveAsset safely stops the asset's Goroutines and deletes it from memory
func (m *MarketManager) RemoveAsset(ticker string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if asset, exists := m.assets[ticker]; exists {
		close(asset.cancel) // Broadcasts the kill signal to all Goroutines for this asset
		delete(m.assets, ticker)
		log.Printf("[%s] Successfully removed from market. Memory freed.", ticker)
	}
}

// runPriceGenerator continuously ticks the baseline price forward
func (m *MarketManager) runPriceGenerator(asset *ManagedAsset) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			asset.Generator.NextPrice()
		case <-asset.cancel:
			return // Kills this loop if asset is deleted
		}
	}
}

func (m *MarketManager) manageDriftLifecycle(asset *ManagedAsset) {
	prof := asset.Profile
	for {
		sleepSecs := randomBetween(prof.MinDriftShift.Seconds(), prof.MaxDriftShift.Seconds())
		
		select {
		case <-time.After(time.Duration(sleepSecs * float64(time.Second))):
			nextState := rollMarkovState(prof.DriftTransitions[asset.CurrentDrift])
			asset.CurrentDrift = DriftState(nextState)

			bounds := prof.DriftBounds[asset.CurrentDrift]
			newDrift := randomBetween(bounds[0], bounds[1])
			
			asset.Generator.SetDrift(newDrift)
		case <-asset.cancel:
			return // Kills this loop if asset is deleted
		}
	}
}

func (m *MarketManager) manageVolatilityLifecycle(asset *ManagedAsset) {
	prof := asset.Profile
	for {
		sleepSecs := randomBetween(prof.MinSigmaShift.Seconds(), prof.MaxSigmaShift.Seconds())
		
		select {
		case <-time.After(time.Duration(sleepSecs * float64(time.Second))):
			nextState := rollMarkovState(prof.VolTransitions[asset.CurrentVol])
			asset.CurrentVol = VolState(nextState)

			bounds := prof.SigmaBounds[asset.CurrentVol]
			newSigma := randomBetween(bounds[0], bounds[1])
			
			asset.Generator.SetVolatility(newSigma)
		case <-asset.cancel:
			return // Kills this loop if asset is deleted
		}
	}
}

func rollMarkovState(transitionRow [4]float64) int {
	roll := rand.Float64()
	cumulative := 0.0
	for i, prob := range transitionRow {
		cumulative += prob
		if roll < cumulative { return i }
	}
	return len(transitionRow) - 1
}

func randomBetween(min, max float64) float64 {
	return min + rand.Float64()*(max-min)
}

// GetPrice safely reads the current baseline price of a specific asset
func (m *MarketManager) GetPrice(ticker string) float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if asset, exists := m.assets[ticker]; exists {
		return asset.Generator.GetCurrentPrice()
	}
	return 0.0 // Returns 0 if the asset doesn't exist
}

// GetProfile safely reads the static configuration bounds for an asset
func (m *MarketManager) GetProfile(ticker string) AssetProfile {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if asset, exists := m.assets[ticker]; exists {
		return asset.Profile
	}
	// Fallback to a standard profile if not found
	return NewProfileFactory("DEFAULT") 
}

// GetDrift safely reads the current directional momentum (mu) of the asset
func (m *MarketManager) GetDrift(ticker string) float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if asset, exists := m.assets[ticker]; exists {
		// Note: You must ensure your 'Generator' struct has this method 
        // to return its internal drift (mu) variable!
		return asset.Generator.GetDrift() 
	}
	return 0.0 // Default to flat drift
}

func (m *MarketManager) GetVolatility(ticker string) float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if asset, exists := m.assets[ticker]; exists {
        // Assuming your Generator struct has a GetVolatility() or similar method 
        // to match your existing GetCurrentPrice() method.
		return asset.Generator.GetVolatility() 
	}
	return 0.2 // Fallback default if asset doesn't exist
}