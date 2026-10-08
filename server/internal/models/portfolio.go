package models

import (
	"time"

	"gorm.io/gorm"
)

type Portfolio struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"user_id"`
	Balance   float64        `gorm:"not null" json:"balance"`
	Holdings  []Holding      `gorm:"foreignKey:PortfolioID" json:"holdings"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type Holding struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	PortfolioID  uint           `gorm:"index;not null" json:"portfolio_id"`
	Symbol       string         `gorm:"not null" json:"symbol"`
	Quantity     int64          `gorm:"not null" json:"quantity"`
	AvgPrice     float64        `json:"avg_price"`
	CurrentPrice float64        `json:"current_price"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}
