package noise

import (
	"math"
	"time"
)

// CalculateUShapeMultiplier models intraday volume.
// 'progress' is a float between 0.0 (market open) and 1.0 (market close).
func CalculateUShapeMultiplier(progress float64) float64 {
	// Using the formula: U(t) = a(t - T/2)^2 + c
	// T/2 is represented as 0.5 (midday).
	a := 4.0 // Scale of the parabola (steepness at open/close)
	c := 0.5 // Baseline multiplier at midday (lowest trading volume)

	return a*math.Pow(progress-0.5, 2) + c
}

// CalculateNextDelay determines the wait time before firing the next order.
func CalculateNextDelay(baseDelay time.Duration, volatility float64, progress float64, minDelay time.Duration) time.Duration {
	uMultiplier := CalculateUShapeMultiplier(progress)

	// Prevent division by zero if volatility is ever strictly 0
	if volatility <= 0 {
		volatility = 0.01 
	}

	// Calculate final multiplier inversely to volatility and the U-curve
	scalingFactor := 1.0 / (volatility * uMultiplier)

	// Calculate raw delay in nanoseconds to avoid integer truncation 
	rawDelay := float64(baseDelay.Nanoseconds()) * scalingFactor
	calculatedDelay := time.Duration(rawDelay) * time.Nanosecond

	// IMPROVEMENT: Enforce a hard-capped minimum delay to prevent infinite loops
	if calculatedDelay < minDelay {
		return minDelay
	}

	return calculatedDelay
}