package database

import (
	"context"
	"fmt"
	"log"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/config"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/glebarez/sqlite"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connections acts as a container for all our database pools
type Connections struct {
	Primary     *gorm.DB
	Candlestick *gorm.DB
	Redis       *redis.Client
}

// Init establishes connections to all configured databases
func Init(cfg *config.AppConfig) (*Connections, error) {
	// 1. Connect to Primary DB
	primaryDB, err := connectSQL(cfg.PrimaryDB)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to primary DB: %w", err)
	}
	log.Println("✅ Primary Database connected!")

	// 1.1 Run Migrations
	if err := primaryDB.AutoMigrate(&models.User{}, &models.Portfolio{}, &models.Holding{}, &models.Watchlist{}); err != nil {
		return nil, fmt.Errorf("failed to migrate primary DB: %w", err)
	}
	log.Println("✅ Primary Database migrated!")

	// 2. Connect to Candlestick DB (TimescaleDB)
	candlestickDB, err := connectSQL(cfg.CandlestickDB)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to candlestick DB: %w", err)
	}
	log.Println("✅ Candlestick Database connected!")

	// 3. Connect to Redis
	rdb := connectRedis(cfg.Redis)

	return &Connections{
		Primary:     primaryDB,
		Candlestick: candlestickDB,
		Redis:       rdb,
	}, nil
}

// connectSQL is a flexible helper that switches dialects based on the config
func connectSQL(cfg config.DatabaseConfig) (*gorm.DB, error) {
	var dialector gorm.Dialector

	// Switch based on the "driver" string in your YAML file
	switch cfg.Driver {
	case "postgres", "timescaledb":
		dsn := fmt.Sprintf(
			"host=%s user=%s password=%s dbname=%s port=%d sslmode=%s",
			cfg.Host, cfg.User, cfg.Password, cfg.Name, cfg.Port, cfg.SSLMode,
		)
		dialector = postgres.Open(dsn)
	case "sqlite":
		dialector = sqlite.Open(cfg.Name)
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", cfg.Driver)
	}

	// Connect using GORM
	db, err := gorm.Open(dialector, &gorm.Config{
		// This prints all SQL queries to your terminal (great for development)
		// Logger: logger.Default.LogMode(logger.Info),

		// This disables SQL logs 
		Logger: logger.Default.LogMode(logger.Silent),
	})

	return db, err
}

// connectRedis initializes the Redis client
func connectRedis(cfg config.RedisConfig) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       0, // use default DB
	})

	// Ping to verify the connection is actually alive
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("❌ Redis connection failed: %v", err)
	}
	log.Println("✅ Redis connected!")

	return rdb
}
