package main

import (
	"context"
	"encoding/json"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/api"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/config"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/database"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/handlers"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/matching"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/simulation/gbm"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/simulation/noise"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/simulation/synthetic"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/storage"
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/utils/response"
)

// Global channels
var orderStream = make(chan models.Order, 100000)
var tradeStream = make(chan models.TradeMessage, 10000)
var eventStream = make(chan models.MarketEvent, 10000)
var lobStream = make(chan models.LOBSnapshot, 500)
var tickerTape = make(chan models.TradeMessage, 1000)

// Store is the global financial-data store (TimescaleDB + Redis)
var store *storage.Store

// --------------------
// Routes
// --------------------

func pingHandler(w http.ResponseWriter, r *http.Request) {
	response.WriteJson(w, http.StatusOK, response.GeneralSuccess("pong", nil))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	response.WriteJson(w, http.StatusOK, response.GeneralSuccess("healthy", time.Now()))
}

// --------------------
// Main
// --------------------

func main() {
	log.Println("=====================================================")
	log.Println("🚀 STARTING ALGORITHMIC TRADING SIMULATOR")
	log.Println("=====================================================")

	// NEW: Create a cancellation context for all background workers (like Noise Trader)
	ctxWorkers, cancelWorkers := context.WithCancel(context.Background())
	defer cancelWorkers() // Safety catch to ensure it always fires on exit

	// 1. Load config
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatal("Failed to load configuration:", err)
	}

	// 2. Init databases (Postgres, TimescaleDB, Redis)
	dbConnections, err := database.Init(cfg)
	if err != nil {
		log.Fatal("Failed to initialize databases:", err)
	}

	// 3. Schema migration BEFORE creating the Store — tables must exist first.
	//    From File 2: correct order. File 1 had NewStore before InitSchema which
	//    meant the store could be used against a database with no tables.
	store = storage.NewStore(dbConnections.Candlestick, dbConnections.Redis)
	if err := store.ResetDatabase(); err != nil {
		log.Fatalf("Database reset failed: %v", err)
	}
	if err := storage.InitSchema(dbConnections.Candlestick); err != nil {
		log.Fatal("Failed to init storage schema:", err)
	}

	apphandlers := handlers.New(dbConnections, orderStream, store, cfg)
	r := api.SetupRouter(apphandlers)

	log.Println("Initializing the Backend and Simulations...")

	// 4. Start Market Data Service (Shadow Book)
	mds := matching.NewMarketDataService(eventStream, lobStream)
	go mds.Start()

	// 5. Start matching engine
	engine := matching.NewEngine(orderStream, tradeStream, eventStream)
	go engine.Start()

	// 6. LOB snapshot pipeline (Storage still consumes from LOBStream)
	store.StartPipeline(lobStream)

	// 7. Single trade consumer — owns tradeStream exclusively.
	//    From File 2: calls store.HandleTrade for real persistence.
	//    File 1's fake OrderbookUpdate payload is removed — the real LOB
	//    snapshot is already published by storage.handleLOBSnapshot via lobStream.
	go func() {
		for trade := range tradeStream {
			// log.Printf("✅ [TRADE EXECUTED] %s & %s | %d shares of %s @ ₹%.2f of user %d (maker) and user %d (taker)",
			// 	trade.MakerOrderID, trade.TakerOrderID, trade.Quantity, trade.Symbol, trade.Price, trade.MakerUserID, trade.TakerUserID)

			if trade.MakerUserID < 900000000 || trade.TakerUserID < 900000000 {
				err := apphandlers.UpdatePortfolioAfterTrade(trade)
				if err != nil {
					log.Printf("⚠️ Failed to update portfolios after trade: %v", err)
				}
			}

			// Persist trade to TimescaleDB + update Redis candle + ring buffer
			store.HandleTrade(trade)

			// Publish real-time trade event for WebSocket subscribers
			payload, _ := json.Marshal(trade)
			dbConnections.Redis.Publish(
				context.Background(),
				"trades:"+trade.Symbol,
				payload,
			)

			// Feed tickerTape for noise trader (non-blocking)
			select {
			case tickerTape <- trade:
			default:
			}
		}
	}()

	// 8. GBM Market Manager — multi-asset from assets.json
	marketManager := gbm.NewMarketManager()

	assetFile, err := os.ReadFile("internal/config/assets.json")
	if err != nil {
		log.Fatal("❌ Failed to read assets.json: ", err)
	}

	var configuredAssets []struct {
		Symbol     string  `json:"symbol"`
		Class      string  `json:"class"`
		StartPrice float64 `json:"start_price"`
		Active     bool    `json:"isActive"`
	}
	if err := json.Unmarshal(assetFile, &configuredAssets); err != nil {
		log.Fatal("❌ Failed to parse assets.json: ", err)
	}

	var activeSymbols []string
	ctxBackground := context.Background()

	for _, a := range configuredAssets {
		if !a.Active {
			continue
		}
		// Add to simulation engine
		marketManager.AddAsset(a.Symbol, a.Class, a.StartPrice)
		activeSymbols = append(activeSymbols, a.Symbol)

		// Seed asset metadata into Redis for API handlers
		assetMetadata := map[string]interface{}{
			"ticker":      a.Symbol,
			"class":       a.Class,
			"start_price": a.StartPrice,
			"status":      "active",
		}
		metaJSON, _ := json.Marshal(assetMetadata)
		dbConnections.Redis.HSet(ctxBackground, "market:assets", a.Symbol, metaJSON)
		// log.Printf("📦 Seeded %s into Memory and Redis", a.Symbol)
	}

	time.Sleep(50 * time.Millisecond)

	// 9. Synthetic Market Maker — uses activeSymbols
	marketMaker := synthetic.NewMarketMaker(marketManager, orderStream)
	go marketMaker.Start(ctxWorkers, activeSymbols, 100*time.Millisecond)

	// 10. Noise Trader — passes ctxWorkers so it can be gracefully shut down
	noiseTrader := noise.NewAgent(marketManager, orderStream, tickerTape)
	go noiseTrader.Start(ctxWorkers, activeSymbols, 8*time.Hour)

	// 11. GBM fair value diagnostics — 2s interval, all symbols
	// go func() {
	// 	ticker := time.NewTicker(2 * time.Second)
	// 	defer ticker.Stop()
	// 	for range ticker.C {
	// 		// for _, sym := range activeSymbols {
	// 			// price := marketManager.GetPrice(sym)
	// 			// log.Printf("📊 [GBM FAIR VALUE] %s: ₹%.4f", sym, price)
	// 		}
	// 	}
	// }()

	// 12. Register routes
	r.Get("/ping", pingHandler)
	r.Get("/health", healthHandler)

	// 13. HTTP server
	address := ":" + strconv.Itoa(cfg.Server.Port)
	server := &http.Server{
		Addr:         address,
		Handler:      r,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("Server running on http://localhost" + address)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-done
	log.Println("\n--- INITIATING SHUTDOWN ---")

	// SHUTDOWN STEP 1: Instantly broadcast kill signal to the Noise Trader
	cancelWorkers()
	log.Println("Stopped noise order generation.")

	// SHUTDOWN STEP 2: Kill the GBM math engines
	for _, sym := range activeSymbols {
		marketManager.RemoveAsset(sym)
	}
	time.Sleep(200 * time.Millisecond)
	log.Println("Exchange offline.")

	// SHUTDOWN STEP 3: Close the HTTP Server
	slog.Info("Shutting down API server...")
	ctxServer, cancelServer := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelServer()

	if err := server.Shutdown(ctxServer); err != nil {
		slog.Error("Server shutdown error:", slog.String("error", err.Error()))
	}
	slog.Info("Server stopped gracefully. Goodbye!")
}
