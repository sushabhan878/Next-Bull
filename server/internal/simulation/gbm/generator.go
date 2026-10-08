package gbm

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

// Generator safely holds the state for the Geometric Brownian Motion model
type Generator struct {
	mu           float64
	sigma        float64
	currentPrice float64
	timeStep     float64
	muLock       sync.RWMutex
}

func NewGenerator(startPrice, drift, volatility, timeStep float64) *Generator {
	rand.Seed(time.Now().UnixNano())
	return &Generator{
		mu:           drift,
		sigma:        volatility,
		currentPrice: startPrice,
		timeStep:     timeStep,
	}
}

func (g *Generator) NextPrice() float64 {
	Z := rand.NormFloat64()

	g.muLock.RLock()
	currentMu := g.mu
	currentSigma := g.sigma
	g.muLock.RUnlock()

	driftComponent := (currentMu - (math.Pow(currentSigma, 2) / 2.0)) * g.timeStep
	shockComponent := currentSigma * math.Sqrt(g.timeStep) * Z

	g.muLock.Lock()
	defer g.muLock.Unlock()

	g.currentPrice = g.currentPrice * math.Exp(driftComponent+shockComponent)
	if g.currentPrice < 0.0001 {
		g.currentPrice = 0.0001
	}
	return g.currentPrice
}

func (g *Generator) GetCurrentPrice() float64 {
	g.muLock.RLock()
	defer g.muLock.RUnlock()
	return g.currentPrice
}

func (g *Generator) GetDrift() float64 {
	g.muLock.RLock()
	defer g.muLock.RUnlock()
	return g.mu
}

// GetVolatility safely reads the current volatility (sigma)
func (g *Generator) GetVolatility() float64 {
	g.muLock.RLock()
	defer g.muLock.RUnlock()
	return g.sigma
}

func (g *Generator) SetDrift(newMu float64) {
	g.muLock.Lock()
	defer g.muLock.Unlock()
	g.mu = newMu
}

func (g *Generator) SetVolatility(newSigma float64) {
	g.muLock.Lock()
	defer g.muLock.Unlock()
	g.sigma = newSigma
}