package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/config"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/utils"
)

type contextKey string

const (
	UserIDKey contextKey = "user_id"
)

// JWTMiddleware validates the JWT access token and adds UserID to context
func JWTMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid authorization format", http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		cfg, err := config.LoadConfig()
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		claims, err := utils.ValidateToken(tokenString, cfg.Server.JWTSecret)
		if err != nil {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Add UserID to context
		ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
