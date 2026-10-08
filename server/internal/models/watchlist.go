package models

import "time"

// Watchlist represents a single symbol saved in a user's watchlist.
// Composite primary key (user_id, symbol) prevents duplicates at the DB level.
type Watchlist struct {
	UserID  uint      `gorm:"primaryKey" json:"user_id"`
	Symbol  string    `gorm:"primaryKey;type:varchar(20)" json:"symbol"`
	AddedAt time.Time `gorm:"autoCreateTime" json:"added_at"`
}
