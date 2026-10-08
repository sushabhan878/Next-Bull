package gbm

import (
	"math/rand"
	"time"
)

type DriftState int

const (
	Bear        DriftState = 0
	Bull        DriftState = 1
	NormalDrift DriftState = 2
	Flat        DriftState = 3
)

type VolState int

const (
	Panic     VolState = 0
	Elevated  VolState = 1
	NormalVol VolState = 2
	Quiet     VolState = 3
)

type AssetProfile struct {
	MinDriftShift time.Duration
	MaxDriftShift time.Duration
	MinSigmaShift time.Duration
	MaxSigmaShift time.Duration

	DriftTransitions [4][4]float64
	VolTransitions   [4][4]float64
	DriftBounds      [4][2]float64
	SigmaBounds      [4][2]float64
}

// NewProfileFactory generates a unique profile tailored to Indian equity market classifications
func NewProfileFactory(assetClass string) AssetProfile {
	var p AssetProfile

	// Default regime shift durations for most equities (5 to 15 minutes for intraday sim)
	p.MinDriftShift, p.MaxDriftShift = 5*time.Minute, 15*time.Minute
	p.MinSigmaShift, p.MaxSigmaShift = 3*time.Minute, 10*time.Minute

	switch assetClass {

	case "LARGE_CAP_BLUECHIP":
		// e.g., Reliance, HDFC Bank, TCS. High liquidity, institutional backing.
		baseDrift := [4][4]float64{{0.40, 0.15, 0.30, 0.15}, {0.15, 0.40, 0.30, 0.15}, {0.05, 0.10, 0.70, 0.15}, {0.05, 0.05, 0.15, 0.75}}
		baseVol := [4][4]float64{{0.30, 0.40, 0.25, 0.05}, {0.10, 0.50, 0.30, 0.10}, {0.05, 0.10, 0.70, 0.15}, {0.02, 0.08, 0.20, 0.70}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.02)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.02)
		// Drift: 8% to 15% normal. Low bear severity.
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.15, -0.05}, {0.15, 0.25}, {0.08, 0.15}, {-0.02, 0.02}}, 0.01, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.30, 0.45}, {0.20, 0.30}, {0.12, 0.18}, {0.08, 0.12}}, 0.01, true)

	case "MID_CAP":
		// e.g., Tier-2 IT, growing manufacturing. Higher growth, moderate volatility.
		baseDrift := [4][4]float64{{0.50, 0.15, 0.25, 0.10}, {0.10, 0.50, 0.30, 0.10}, {0.10, 0.15, 0.65, 0.10}, {0.05, 0.10, 0.15, 0.70}}
		baseVol := [4][4]float64{{0.40, 0.40, 0.15, 0.05}, {0.15, 0.50, 0.25, 0.10}, {0.05, 0.15, 0.70, 0.10}, {0.05, 0.10, 0.25, 0.60}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.02)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.02)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.25, -0.10}, {0.20, 0.35}, {0.12, 0.20}, {-0.02, 0.02}}, 0.02, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.40, 0.60}, {0.30, 0.40}, {0.18, 0.25}, {0.10, 0.18}}, 0.02, true)

	case "SMALL_CAP":
		// Retail heavy, lower liquidity, prone to sharp institutional entries/exits.
		baseDrift := [4][4]float64{{0.60, 0.15, 0.15, 0.10}, {0.10, 0.60, 0.20, 0.10}, {0.10, 0.20, 0.60, 0.10}, {0.10, 0.10, 0.20, 0.60}}
		baseVol := [4][4]float64{{0.50, 0.30, 0.15, 0.05}, {0.15, 0.60, 0.20, 0.05}, {0.10, 0.20, 0.60, 0.10}, {0.05, 0.15, 0.30, 0.50}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.03)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.03)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.40, -0.15}, {0.30, 0.50}, {0.15, 0.25}, {-0.05, 0.05}}, 0.03, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.50, 0.80}, {0.40, 0.50}, {0.25, 0.35}, {0.15, 0.25}}, 0.03, true)

	case "MICRO_CAP_PENNY":
		// Prone to upper/lower circuits, long flatlines, extreme operator-driven spikes.
		p.MinDriftShift, p.MaxDriftShift = 10*time.Minute, 30*time.Minute // Sticks in circuits/flatlines longer
		baseDrift := [4][4]float64{{0.70, 0.10, 0.05, 0.15}, {0.15, 0.60, 0.10, 0.15}, {0.10, 0.15, 0.50, 0.25}, {0.05, 0.10, 0.10, 0.75}}
		baseVol := [4][4]float64{{0.60, 0.25, 0.10, 0.05}, {0.20, 0.60, 0.15, 0.05}, {0.15, 0.25, 0.50, 0.10}, {0.05, 0.10, 0.25, 0.60}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.05)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.05)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.60, -0.20}, {0.50, 1.50}, {0.00, 0.10}, {-0.10, 0.10}}, 0.05, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.80, 1.50}, {0.60, 0.80}, {0.40, 0.60}, {0.10, 0.40}}, 0.05, true)

	case "PSU_EQUITY":
		// Public Sector Undertakings. High dividend yield, policy-dependent, often slow moving.
		baseDrift := [4][4]float64{{0.40, 0.10, 0.20, 0.30}, {0.10, 0.40, 0.20, 0.30}, {0.05, 0.05, 0.60, 0.30}, {0.05, 0.05, 0.10, 0.80}}
		baseVol := [4][4]float64{{0.35, 0.35, 0.20, 0.10}, {0.10, 0.40, 0.30, 0.20}, {0.05, 0.10, 0.65, 0.20}, {0.05, 0.05, 0.15, 0.75}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.02)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.02)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.20, -0.05}, {0.15, 0.30}, {0.05, 0.12}, {-0.02, 0.02}}, 0.02, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.35, 0.50}, {0.25, 0.35}, {0.15, 0.22}, {0.08, 0.15}}, 0.02, true)

	case "FINANCIAL_PRIVATE":
		// Private Banks & NBFCs. High beta relative to index, heavily influenced by credit cycles.
		baseDrift := [4][4]float64{{0.55, 0.15, 0.20, 0.10}, {0.10, 0.55, 0.25, 0.10}, {0.10, 0.20, 0.60, 0.10}, {0.05, 0.10, 0.20, 0.65}}
		baseVol := [4][4]float64{{0.45, 0.35, 0.15, 0.05}, {0.15, 0.50, 0.25, 0.10}, {0.05, 0.15, 0.70, 0.10}, {0.05, 0.10, 0.25, 0.60}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.02)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.02)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.30, -0.10}, {0.25, 0.45}, {0.12, 0.20}, {-0.02, 0.02}}, 0.02, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.45, 0.65}, {0.30, 0.45}, {0.18, 0.25}, {0.10, 0.18}}, 0.02, true)

	case "IT_TECH_SERVICES":
		// Export-driven, influenced by global macros (US markets) and INR depreciation. Steady compounders.
		baseDrift := [4][4]float64{{0.50, 0.20, 0.20, 0.10}, {0.15, 0.50, 0.25, 0.10}, {0.05, 0.15, 0.70, 0.10}, {0.05, 0.10, 0.15, 0.70}}
		baseVol := [4][4]float64{{0.35, 0.40, 0.20, 0.05}, {0.15, 0.50, 0.25, 0.10}, {0.05, 0.15, 0.65, 0.15}, {0.05, 0.10, 0.20, 0.65}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.02)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.02)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.20, -0.05}, {0.20, 0.35}, {0.10, 0.18}, {-0.01, 0.03}}, 0.02, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.35, 0.50}, {0.25, 0.35}, {0.15, 0.22}, {0.10, 0.15}}, 0.02, true)

	case "FMCG_DEFENSIVE":
		// Fast-Moving Consumer Goods. Extremely low beta, acts as a safe haven during market crashes.
		baseDrift := [4][4]float64{{0.30, 0.20, 0.30, 0.20}, {0.10, 0.40, 0.30, 0.20}, {0.05, 0.05, 0.75, 0.15}, {0.02, 0.05, 0.15, 0.78}}
		baseVol := [4][4]float64{{0.20, 0.30, 0.30, 0.20}, {0.10, 0.40, 0.40, 0.10}, {0.05, 0.10, 0.70, 0.15}, {0.02, 0.05, 0.15, 0.78}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.01)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.01)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.10, -0.02}, {0.12, 0.20}, {0.08, 0.12}, {-0.01, 0.01}}, 0.01, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.20, 0.35}, {0.15, 0.20}, {0.10, 0.15}, {0.05, 0.10}}, 0.01, true)

	case "INFRA_CYCLICAL":
		// Capital Goods, Real Estate, Infrastructure. Highly cyclical, sensitive to capex and interest rates.
		baseDrift := [4][4]float64{{0.65, 0.15, 0.15, 0.05}, {0.10, 0.65, 0.20, 0.05}, {0.15, 0.20, 0.55, 0.10}, {0.05, 0.10, 0.15, 0.70}}
		baseVol := [4][4]float64{{0.50, 0.30, 0.15, 0.05}, {0.15, 0.50, 0.25, 0.10}, {0.10, 0.20, 0.60, 0.10}, {0.05, 0.15, 0.25, 0.55}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.03)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.03)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.35, -0.15}, {0.30, 0.60}, {0.10, 0.18}, {-0.03, 0.03}}, 0.03, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.50, 0.70}, {0.35, 0.50}, {0.22, 0.30}, {0.15, 0.22}}, 0.03, true)

	case "PHARMA_HEALTHCARE":
		// Generally defensive but exposed to sharp regulatory shocks (e.g., USFDA observations).
		baseDrift := [4][4]float64{{0.50, 0.10, 0.25, 0.15}, {0.10, 0.40, 0.35, 0.15}, {0.05, 0.15, 0.65, 0.15}, {0.05, 0.10, 0.15, 0.70}}
		baseVol := [4][4]float64{{0.40, 0.30, 0.20, 0.10}, {0.10, 0.40, 0.30, 0.20}, {0.05, 0.15, 0.65, 0.15}, {0.05, 0.10, 0.20, 0.65}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.02)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.02)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.25, -0.05}, {0.15, 0.35}, {0.10, 0.15}, {-0.02, 0.02}}, 0.02, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.40, 0.60}, {0.30, 0.40}, {0.16, 0.24}, {0.10, 0.16}}, 0.02, true)

	default: 
		// Fallback acts as a standard broad-market index ETF (e.g., NIFTY 50 / SENSEX)
		baseDrift := [4][4]float64{{0.60, 0.15, 0.20, 0.05}, {0.15, 0.60, 0.20, 0.05}, {0.10, 0.15, 0.70, 0.05}, {0.05, 0.05, 0.10, 0.80}}
		baseVol := [4][4]float64{{0.30, 0.40, 0.20, 0.10}, {0.10, 0.50, 0.30, 0.10}, {0.05, 0.15, 0.70, 0.10}, {0.05, 0.10, 0.15, 0.70}}
		p.DriftTransitions = applyMatrixJitter(baseDrift, 0.01)
		p.VolTransitions = applyMatrixJitter(baseVol, 0.01)
		p.DriftBounds = applyBoundsJitter([4][2]float64{{-0.20, -0.05}, {0.15, 0.30}, {0.08, 0.15}, {-0.01, 0.01}}, 0.01, false)
		p.SigmaBounds = applyBoundsJitter([4][2]float64{{0.30, 0.45}, {0.20, 0.30}, {0.12, 0.18}, {0.05, 0.12}}, 0.01, true)
	}

	return p
}

// applyMatrixJitter adds random noise and re-normalizes the row to exactly 1.0
func applyMatrixJitter(base [4][4]float64, maxJitter float64) [4][4]float64 {
	var jittered [4][4]float64
	for i := 0; i < 4; i++ {
		rowSum := 0.0
		for j := 0; j < 4; j++ {
			noise := (rand.Float64() * 2 * maxJitter) - maxJitter
			newVal := base[i][j] + noise
			if newVal < 0.01 {
				newVal = 0.01
			}
			jittered[i][j] = newVal
			rowSum += newVal
		}
		for j := 0; j < 4; j++ {
			jittered[i][j] = jittered[i][j] / rowSum
		}
	}
	return jittered
}

// applyBoundsJitter adds absolute random noise to the min and max bounds safely
func applyBoundsJitter(base [4][2]float64, maxJitter float64, isSigma bool) [4][2]float64 {
	var jittered [4][2]float64
	for i := 0; i < 4; i++ {
		noiseMin := (rand.Float64() * 2 * maxJitter) - maxJitter
		noiseMax := (rand.Float64() * 2 * maxJitter) - maxJitter

		jittered[i][0] = base[i][0] + noiseMin
		jittered[i][1] = base[i][1] + noiseMax

		// CRITICAL: Volatility (\sigma) cannot be <= 0, or math.Pow/math.Sqrt will fail
		if isSigma {
			if jittered[i][0] < 0.01 {
				jittered[i][0] = 0.01
			}
			if jittered[i][1] < 0.02 {
				jittered[i][1] = 0.02
			}
		}

		// Enforce that Min is always strictly less than Max
		if jittered[i][0] >= jittered[i][1] {
			jittered[i][1] = jittered[i][0] + 0.02 // Push the max slightly above the min
		}
	}
	return jittered
}