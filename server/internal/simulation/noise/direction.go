package noise

import (
	"math"
	"math/rand"
)

// DetermineOrderSide calculates the momentum-biased probability of a Buy order,
// applies contrarian logic, and returns "BUY" or "SELL".
// deltaS: Percentage change in price over the trailing window.
// k: Sensitivity constant for momentum.
// contrarianProb: The chance (0.0 to 1.0) that a trader bets against the trend.
func DetermineOrderSide(rng *rand.Rand, deltaS float64, k float64, contrarianProb float64) string {
	// 1. Calculate the bounded momentum probability
	// P(Buy) = 0.5 + 0.5 * tanh(k * deltaS)
	probBuy := 0.5 + (0.5 * math.Tanh(k*deltaS))

	// 2. Apply Contrarian Bias (Mean Reversion)
	// Occasionally, traders will try to "catch a falling knife" or short the top.
	if rng.Float64() < contrarianProb {
		probBuy = 1.0 - probBuy // Invert the probability
	}

	// 3. Execute the probabilistic roll
	if rng.Float64() < probBuy {
		return "BUY"
	}
	return "SELL"
}