package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/config"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/utils"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/utils/response"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	AccessTokenDuration  = 24 * time.Hour
	RefreshTokenDuration = 7 * 24 * time.Hour
)

// Register handles user registration
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJson(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		response.WriteJson(w, http.StatusInternalServerError, map[string]string{"error": "Failed to hash password"})
		return
	}

	user := models.User{
		FullName: req.FullName,
		Email:    req.Email,
		Password: string(hashedPassword),
	}

	// Create user in DB
	if err := h.DB.Primary.Create(&user).Error; err != nil {
		response.WriteJson(w, http.StatusConflict, map[string]string{"error": "User already exists or database error"})
		return
	}

	// Create portfolio for the new user
	if err := h.CreatePortfolio(user.ID); err != nil {
		response.WriteJson(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create portfolio"})
		return
	}

	// Generate tokens
	tokens, err := h.generateAuthTokens(user.ID)
	if err != nil {
		response.WriteJson(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate tokens"})
		return
	}

	response.WriteJson(w, http.StatusCreated, tokens)
}

// Login handles user authentication
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJson(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	var user models.User
	if err := h.DB.Primary.Where("email = ?", req.Email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.WriteJson(w, http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
			return
		}
		response.WriteJson(w, http.StatusInternalServerError, map[string]string{"error": "Database error"})
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		response.WriteJson(w, http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
		return
	}

	// Generate tokens
	tokens, err := h.generateAuthTokens(user.ID)
	if err != nil {
		response.WriteJson(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate tokens"})
		return
	}

	response.WriteJson(w, http.StatusOK, tokens)
}

// RefreshToken handles refreshing access tokens
func (h *Handler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJson(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	// Validate refresh token
	cfg, _ := config.LoadConfig() // Should really be in Handler struct but following existing pattern
	claims, err := utils.ValidateToken(req.RefreshToken, cfg.Server.JWTRefreshSecret)
	if err != nil {
		response.WriteJson(w, http.StatusUnauthorized, map[string]string{"error": "Invalid refresh token"})
		return
	}

	// Check if refresh token exists in Redis
	redisKey := fmt.Sprintf("refresh_token:%d:%s", claims.UserID, req.RefreshToken)
	val, err := h.DB.Redis.Get(context.Background(), redisKey).Result()
	if err != nil || val == "" {
		response.WriteJson(w, http.StatusUnauthorized, map[string]string{"error": "Refresh token expired or revoked"})
		return
	}

	// Generate new access token
	accessToken, err := utils.GenerateToken(claims.UserID, cfg.Server.JWTSecret, AccessTokenDuration)
	if err != nil {
		response.WriteJson(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate access token"})
		return
	}

	response.WriteJson(w, http.StatusOK, map[string]string{"access_token": accessToken})
}

// Logout revokes a refresh token
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJson(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	cfg, _ := config.LoadConfig()
	claims, err := utils.ValidateToken(req.RefreshToken, cfg.Server.JWTRefreshSecret)
	if err == nil {
		// Delete from Redis
		redisKey := fmt.Sprintf("refresh_token:%d:%s", claims.UserID, req.RefreshToken)
		h.DB.Redis.Del(context.Background(), redisKey)
	}

	response.WriteJson(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

// generateAuthTokens is a helper to create both tokens and store refresh token in Redis
func (h *Handler) generateAuthTokens(userID uint) (*models.TokenResponse, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, err
	}

	accessToken, err := utils.GenerateToken(userID, cfg.Server.JWTSecret, AccessTokenDuration)
	if err != nil {
		return nil, err
	}

	refreshToken, err := utils.GenerateToken(userID, cfg.Server.JWTRefreshSecret, RefreshTokenDuration)
	if err != nil {
		return nil, err
	}

	// Store refresh token in Redis with expiration
	redisKey := fmt.Sprintf("refresh_token:%d:%s", userID, refreshToken)
	err = h.DB.Redis.Set(context.Background(), redisKey, "active", RefreshTokenDuration).Err()
	if err != nil {
		return nil, err
	}

	return &models.TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}
