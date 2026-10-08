package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/api/middleware"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/utils/response"
	"gorm.io/gorm"
)

func (h *Handler) GetPortfolio(userID string) (models.Portfolio, error) {

	var portfolio models.Portfolio
	result := h.DB.Primary.Preload("Holdings").First(&portfolio, "user_id = ?", userID)

	if result.Error != nil {
		return portfolio, result.Error
	}

	return portfolio, nil
}

func (h *Handler) GetPortfolioHistory(w http.ResponseWriter, r *http.Request) {
	// 1. Safely extract the User ID from the context (Assuming it's a uint from JWT)
	ctxValue := r.Context().Value(middleware.UserIDKey)
	if ctxValue == nil {
		response.WriteJson(w, http.StatusUnauthorized, response.GeneralError("Unauthorized access", nil))
		return
	}
	userID := ctxValue.(uint)
	userIDStr := fmt.Sprintf("%d", userID) // Convert to string for Redis keys
	ctx := r.Context()

	// ==========================================
	// PART 1: Fetch Orders from Redis
	// ==========================================
	var orders []models.Order = []models.Order{} // Initialize as empty array so JSON doesn't return null

	indexKey := "orders:user:" + userIDStr
	orderIDs, err := h.DB.Redis.ZRange(ctx, indexKey, 0, -1).Result()
	if err != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to fetch order index", err))
		return
	}

	// Only attempt MGET if the user actually has orders
	if len(orderIDs) > 0 {
		var keys []string
		for _, id := range orderIDs {
			keys = append(keys, "order:"+id)
		}

		rawOrders, err := h.DB.Redis.MGet(ctx, keys...).Result()
		if err != nil {
			response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to fetch orders from Redis", err))
			return
		}

		for i, raw := range rawOrders {
			if raw == nil {
				continue // Skip expired orders
			}

			var o models.Order
			if err := json.Unmarshal([]byte(raw.(string)), &o); err == nil {
				orders = append(orders, o)
			} else {
				log.Printf("Failed to unmarshal order %s: %v", orderIDs[i], err)
			}
		}
	}

	// ==========================================
	// PART 2: Fetch Holdings via Portfolio from Postgres
	// ==========================================
	var portfolio models.Portfolio
	if err := h.DB.Primary.Preload("Holdings").Where("user_id = ?", userID).First(&portfolio).Error; err != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to retrieve portfolio", err))
		return
	}
	holdings := portfolio.Holdings

	// ==========================================
	// PART 3: Fetch Trades from TimescaleDB
	// ==========================================
	trades, err := h.Store.GetTradesByUserID(userID)
	if err != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to retrieve trades", err))
		return
	}

	// ==========================================
	// PART 4: Serve the Combined JSON
	// ==========================================
	response.WriteJson(w, http.StatusOK, map[string]interface{}{
		"status":  "success",
		"message": "Portfolio history retrieved successfully",
		"data": map[string]interface{}{
			"orders":   orders,
			"holdings": holdings,
			"trades":   trades,
		},
	})
}

func (h *Handler) ResetPortfolio(w http.ResponseWriter, r *http.Request) {
	// Reset the user's portfolio to the initial state (e.g., for a new simulation run)
	CtxValue := r.Context().Value(middleware.UserIDKey)
	userID, ok := CtxValue.(uint)

	if !ok {
		response.WriteJson(w, http.StatusBadRequest, response.GeneralError("Invalid user ID in context", nil))
		return
	}

	// Fetch portfolio first to get the portfolio ID
	var portfolio models.Portfolio
	result := h.DB.Primary.Where("user_id = ?", userID).First(&portfolio)
	if result.Error != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to reset portfolio", result.Error))
		return
	}

	// Clear holdings by portfolio_id (Holding has PortfolioID, not UserID)
	var Holdings []models.Holding
	result = h.DB.Primary.Where("portfolio_id = ?", portfolio.ID).Delete(&Holdings)
	if result.Error != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to reset portfolio", result.Error))
		return
	}

	// Reset User Balance
	portfolio.Balance = 100000.00 // Reset to initial balance
	result = h.DB.Primary.Save(&portfolio)

	if result.Error != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to reset portfolio", result.Error))
		return
	}

	response.WriteJson(w, http.StatusOK, response.GeneralSuccess("Portfolio reset successfully", nil))

}

// CreatePortfolio creates a new portfolio entry for a user with an initial balance.
// This is called during user registration to ensure every user starts with a portfolio.
func (h *Handler) CreatePortfolio(userID uint) error {
	portfolio := models.Portfolio{
		UserID:  userID,
		Balance: 100000.00, // Initial balance
	}
	if err := h.DB.Primary.Create(&portfolio).Error; err != nil {
		return fmt.Errorf("failed to create portfolio for user %d: %w", userID, err)
	}
	return nil
}

func (h *Handler) UpdatePortfolioAfterTrade(trade models.TradeMessage) error {
    if trade.MakerUserID == trade.TakerUserID {
        return nil
    }

    var order *models.Order
    var err error
    var isMakerBuyer bool

    if strings.HasPrefix(trade.MakerOrderID, "ORD-") {
        order, err = h.Store.GetOrderByID(trade.MakerOrderID)
        if err != nil {
            return fmt.Errorf("failed to fetch maker order %s: %w", trade.MakerOrderID, err)
        }
        isMakerBuyer = order.Side == models.Buy
    } else if strings.HasPrefix(trade.TakerOrderID, "ORD-") {
        order, err = h.Store.GetOrderByID(trade.TakerOrderID)
        if err != nil {
            return fmt.Errorf("failed to fetch taker order %s: %w", trade.TakerOrderID, err)
        }
        isMakerBuyer = order.Side == models.Sell
    } else {
        // Both are synthetic/noise — no real user to update
        return nil
    }

    if isMakerBuyer {
        // Maker=Buyer, Taker=Seller
        if trade.MakerUserID != 0 && trade.MakerUserID < 900000000 {
            if err := h.HandleUpdatePortfolioAfterTradeOfBuyer(trade, fmt.Sprintf("%d", trade.MakerUserID)); err != nil {
                return fmt.Errorf("failed to update buyer's portfolio: %w", err)
            }
        }
        if trade.TakerUserID != 0 && trade.TakerUserID < 900000000 {
            if err := h.HandleUpdatePortfolioAfterTradeOfSeller(trade, fmt.Sprintf("%d", trade.TakerUserID)); err != nil {
                return fmt.Errorf("failed to update seller's portfolio: %w", err)
            }
        }
    } else {
        // Maker=Seller, Taker=Buyer
        if trade.MakerUserID != 0 && trade.MakerUserID < 900000000 {
            if err := h.HandleUpdatePortfolioAfterTradeOfSeller(trade, fmt.Sprintf("%d", trade.MakerUserID)); err != nil {
                return fmt.Errorf("failed to update seller's portfolio: %w", err)
            }
        }
        if trade.TakerUserID != 0 && trade.TakerUserID < 900000000 {
            if err := h.HandleUpdatePortfolioAfterTradeOfBuyer(trade, fmt.Sprintf("%d", trade.TakerUserID)); err != nil {
                return fmt.Errorf("failed to update buyer's portfolio: %w", err)
            }
        }
    }

    return nil
}

func (h *Handler) HandleUpdatePortfolioAfterTradeOfBuyer(trade models.TradeMessage, userId string) error {
	portfolio, err := h.GetPortfolio(userId)
	if err != nil {
		return fmt.Errorf("failed to fetch portfolio: %w", err)
	}

	// Deduct the cost from the buyer's balance
	cost := trade.Price * float64(trade.Quantity)
	if err := h.DB.Primary.Model(&portfolio).
		UpdateColumn("balance", gorm.Expr("balance - ?", cost)).Error; err != nil {
		return fmt.Errorf("failed to deduct balance: %w", err)
	}

	found := false
	for i := range portfolio.Holdings {
		if portfolio.Holdings[i].Symbol == trade.Symbol {
			oldQty := portfolio.Holdings[i].Quantity
			oldAvg := portfolio.Holdings[i].AvgPrice
			newQty := oldQty + trade.Quantity

			// Update weighted average price
			portfolio.Holdings[i].AvgPrice = (oldAvg*float64(oldQty) + trade.Price*float64(trade.Quantity)) / float64(newQty)
			portfolio.Holdings[i].Quantity = newQty

			if err := h.DB.Primary.Save(&portfolio.Holdings[i]).Error; err != nil {
				return fmt.Errorf("failed to update holding: %w", err)
			}
			found = true
			break
		}
	}

	if !found {
		newHolding := models.Holding{
			PortfolioID: portfolio.ID,
			Symbol:      trade.Symbol,
			Quantity:    trade.Quantity,
			AvgPrice:    trade.Price,
		}
		if err := h.DB.Primary.Create(&newHolding).Error; err != nil {
			return fmt.Errorf("failed to create new holding: %w", err)
		}
	}

	return nil
}

func (h *Handler) HandleUpdatePortfolioAfterTradeOfSeller(trade models.TradeMessage, userId string) error {
	portfolio, err := h.GetPortfolio(userId)
	if err != nil {
		return fmt.Errorf("failed to fetch portfolio: %w", err)
	}

	for i := range portfolio.Holdings {
		if portfolio.Holdings[i].Symbol == trade.Symbol {
			portfolio.Holdings[i].Quantity -= trade.Quantity

			// 1. Explicitly save the reduced holding
			if err := h.DB.Primary.Save(&portfolio.Holdings[i]).Error; err != nil {
				return fmt.Errorf("failed to update holding: %w", err)
			}

			// 2. Safely add funds to the portfolio balance
			earnedCash := trade.Price * float64(trade.Quantity)
			err := h.DB.Primary.Model(&portfolio).
				UpdateColumn("balance", gorm.Expr("balance + ?", earnedCash)).Error

			if err != nil {
				return fmt.Errorf("failed to update portfolio balance: %w", err)
			}
			break
		}
	}

	return nil
}
