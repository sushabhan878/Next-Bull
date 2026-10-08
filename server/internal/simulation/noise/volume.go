package noise

import (
	"math"
	"math/rand"
)

// GenerateOrderSize determines the quantity of shares for a synthetic order.
func GenerateOrderSize(rng *rand.Rand, alpha float64, minSize float64) int64 {
	// 1. Generate a uniform random number U between [0.0, 1.0)
	u := rng.Float64()

	// Safety check to prevent math.Inf panics
	if u > 0.999999 {
		u = 0.999999
	}

	// 2. Inverse Transform Sampling for Pareto distribution
	// Note: minSize can now be a fraction (e.g., 0.21 for BTC)!
	rawSize := minSize / math.Pow(1.0-u, 1.0/alpha)

	// 3. Discretize the continuous volume to a whole number
	finalSize := math.Round(rawSize)

	// 4. THE FIX: Clamp to a minimum of 1 share AFTER the Pareto math and rounding.
	if finalSize < 1.0 {
		finalSize = 1.0
	}

	return int64(finalSize)
}