package handlers

import (
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/config"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/database"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/storage"
)

// Handler is the core struct that holds your database connections.
// Every specific handler function will be attached to this struct.
type Handler struct {
	DB          *database.Connections
	OrderStream chan<- models.Order
	Store       *storage.Store
	Config      *config.AppConfig // Added Config to the handler
}

// New creates a new Handler instance with the injected dependencies
func New(db *database.Connections, orderStream chan<- models.Order, store *storage.Store, cfg *config.AppConfig) *Handler {
	return &Handler{
		DB:          db,
		OrderStream: orderStream,
		Store:       store,
		Config:      cfg, // Store the injected config
	}
}
