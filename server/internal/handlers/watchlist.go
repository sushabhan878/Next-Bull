package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/api/middleware"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/storage"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/utils/response"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm/clause"
)

// GetWatchlist returns the user's watchlist symbols enriched with live market data.
// GET /v1/watchlist
func (h *Handler) GetWatchlist(w http.ResponseWriter, r *http.Request) {
	ctxValue := r.Context().Value(middleware.UserIDKey)
	if ctxValue == nil {
		response.WriteJson(w, http.StatusUnauthorized, response.GeneralError("Unauthorized access", nil))
		return
	}
	userID := ctxValue.(uint)
	ctx := r.Context()

	// 1. Fetch watchlist entries from Postgres
	var entries []models.Watchlist
	if err := h.DB.Primary.Where("user_id = ?", userID).Order("added_at DESC").Find(&entries).Error; err != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to fetch watchlist", err))
		return
	}

	if len(entries) == 0 {
		response.WriteJson(w, http.StatusOK, response.GeneralSuccess("Watchlist retrieved successfully", []storage.MarketPriceData{}))
		return
	}

	// 2. Collect symbols and load their start prices from Redis market:assets
	symbols := make([]string, 0, len(entries))
	startPrices := make(map[string]float64, len(entries))

	for _, entry := range entries {
		assetStr, err := h.DB.Redis.HGet(ctx, "market:assets", entry.Symbol).Result()
		if err != nil {
			continue // symbol may have been delisted — skip it
		}
		var asset struct {
			Ticker     string  `json:"ticker"`
			StartPrice float64 `json:"start_price"`
		}
		if err := json.Unmarshal([]byte(assetStr), &asset); err == nil && asset.Ticker != "" {
			symbols = append(symbols, asset.Ticker)
			startPrices[asset.Ticker] = asset.StartPrice
		}
	}

	// 3. Get live market data for the watchlist symbols
	prices := h.Store.GetMarketPrices(symbols, startPrices)

	response.WriteJson(w, http.StatusOK, response.GeneralSuccess("Watchlist retrieved successfully", prices))
}

// AddToWatchlist adds a symbol to the user's watchlist after validating it exists.
// POST /v1/watchlist/{symbol}
func (h *Handler) AddToWatchlist(w http.ResponseWriter, r *http.Request) {
	ctxValue := r.Context().Value(middleware.UserIDKey)
	if ctxValue == nil {
		response.WriteJson(w, http.StatusUnauthorized, response.GeneralError("Unauthorized access", nil))
		return
	}
	userID := ctxValue.(uint)
	symbol := chi.URLParam(r, "symbol")
	ctx := r.Context()

	// 1. Validate that the symbol exists in market:assets
	exists, err := h.DB.Redis.HExists(ctx, "market:assets", symbol).Result()
	if err != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to validate symbol", err))
		return
	}
	if !exists {
		response.WriteJson(w, http.StatusNotFound, response.GeneralError("Symbol not found in market assets", nil))
		return
	}

	// 2. Upsert — ON CONFLICT DO NOTHING to silently ignore duplicates
	entry := models.Watchlist{
		UserID: userID,
		Symbol: symbol,
	}
	if err := h.DB.Primary.Clauses(clause.OnConflict{DoNothing: true}).Create(&entry).Error; err != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to add to watchlist", err))
		return
	}

	response.WriteJson(w, http.StatusCreated, response.GeneralSuccess("Symbol added to watchlist", map[string]string{"symbol": symbol}))
}

// RemoveFromWatchlist removes a symbol from the user's watchlist.
// DELETE /v1/watchlist/{symbol}
func (h *Handler) RemoveFromWatchlist(w http.ResponseWriter, r *http.Request) {
	ctxValue := r.Context().Value(middleware.UserIDKey)
	if ctxValue == nil {
		response.WriteJson(w, http.StatusUnauthorized, response.GeneralError("Unauthorized access", nil))
		return
	}
	userID := ctxValue.(uint)
	symbol := chi.URLParam(r, "symbol")

	result := h.DB.Primary.Where("user_id = ? AND symbol = ?", userID, symbol).Delete(&models.Watchlist{})
	if result.Error != nil {
		response.WriteJson(w, http.StatusInternalServerError, response.GeneralError("Failed to remove from watchlist", result.Error))
		return
	}

	if result.RowsAffected == 0 {
		response.WriteJson(w, http.StatusNotFound, response.GeneralError("Symbol not in watchlist", nil))
		return
	}

	response.WriteJson(w, http.StatusOK, response.GeneralSuccess("Symbol removed from watchlist", map[string]string{"symbol": symbol}))
}
