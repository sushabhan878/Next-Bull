# Algorithmic Trading Simulator - System Architecture & Detailed Documentation

This document provides a comprehensive technical overview of the Algorithmic Trading Simulator project, detailing the architecture, execution pipeline, internal matching mechanics, and frontend component layout.

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Colima-2496ED?style=for-the-badge&logo=docker&logoColor=white)

---

## 1. Overview

The **Algorithmic Trading Simulator** simulates an entire stock exchange **in-memory** using Go, providing a realistic paper-trading environment. It features:
*   **Concurrent Matching Engine**: Built on Go channels running with Price-Time priority.
*   **Synthetic Market Maker**: Emits real-time bid/ask ladders with power-law quantity scaling and dynamic spread adjustment.
*   **Noise Trader Simulation**: Simulates retail order flow using heavy-tailed Pareto distributions, EMA momentum bias, and U-shaped intraday volume.
*   **GBM Price Generation**: Simulates market trends via Geometric Brownian Motion price streams with Markov-regime transitions.
*   **Real-time Streaming**: Uses Redis Pub/Sub to deliver WebSocket updates to the client under 500ms throttles.
*   **Professional UI**: React dashboard containing Trade page, Order Book, Charts (Lightweight Charts), Portfolio breakdowns, and Analytics indicators.

The platform configures and simulates **15 Indian stock market assets** across various segments (Large, Mid, Small, Micro, PSU, FMCG, Tech).

---

## 2. System Architecture

The following block diagram outlines the high-level system layout:

```mermaid
graph TB
    subgraph Client["Client (React + TypeScript)"]
        UI["Trading UI<br/>TradePage, OrderBook, ChartPanel"]
        WS["WebSocket Client<br/>topic-based subscriptions"]
        REST["REST Client<br/>auth, orders, portfolio"]
    end

    subgraph Server["Server (Go 1.26)"]
        ROUTER["Chi Router<br/>/v1/api + /v1/ws"]
        JWT["JWT Middleware<br/>auth/refresh"]
        HANDLERS["REST Handlers<br/>market, orders, portfolio, watchlist"]
        WSH["WS Handler<br/>streams via Redis Pub/Sub"]
        ME["Matching Engine<br/>Price-Time priority<br/>buffered channels"]
    end

    subgraph Storage["Storage Layer"]
        PG["PostgreSQL 15<br/>users, portfolios, holdings, watchlists"]
        TSDB["TimescaleDB<br/>trades, OHLCV candles<br/>continuous aggregates 1s/5s"]
        REDIS["Redis 7<br/>cache, Pub/Sub,<br/>order snapshots, prices"]
    end

    subgraph Sim["Simulation Layer"]
        GBM["GBM Generator<br/>Geometric Brownian Motion"]
        MM["Synthetic Market Maker<br/>bid/ask ladders"]
        NT["Noise Trader<br/>retail order flow"]
        MGR["MarketManager<br/>lifecycle + Markov regimes"]
    end

    UI -->|WSS| WS
    UI -->|HTTP| REST
    WS --> ROUTER
    REST --> ROUTER
    ROUTER --> JWT
    JWT --> HANDLERS
    JWT --> WSH
    HANDLERS -->|orderStream chan| ME
    ME --> PG
    ME --> REDIS
    WSH --> REDIS
    HANDLERS --> PG
    ME -->|tradeStream chan| TSDB
    MGR --> GBM
    MGR --> MM
    MGR --> NT
    MM -->|orderStream chan| ME
    NT -->|orderStream chan| ME
```

---

## 3. Data Flow

The order submission, execution, and real-time distribution streams follow this sequence:

```mermaid
sequenceDiagram
    participant UI as React UI
    participant Router as Chi Router
    participant Engine as Matching Engine
    participant Redis as Redis Pub/Sub
    participant Sim as Simulation Layer

    Note over UI,Sim: Order Placement Flow
    UI->>Router: POST /v1/orders/ (JWT)
    Router->>Engine: orderStream chan
    Engine->>Engine: Price-Time matching
    Engine->>Redis: Publish trade + LOB update
    Redis-->>UI: WebSocket push (orderbook, candle, portfolio)

    Note over UI,Sim: Market Data Flow
    Sim->>Engine: Synthetic orders (every ~100ms)
    Engine->>Redis: Publish midprice + snapshot
    Redis-->>UI: WebSocket push (prices, candles)

    Note over UI,Sim: Subscription Flow
    UI->>Router: WSS connect /v1/ws
    Router->>UI: Subscribe topics (orderbook:X, candles:X, portfolio:Y)
    UI->>Redis: Subscribe via WS handler
    Redis-->>UI: Stream updates (500ms throttle)
```

---

## 4. Tech Stack

### Backend (Go)
| Technology | Purpose |
| :--- | :--- |
| **Go 1.26** | Language for high-performance matching and concurrency. |
| **Chi (`go-chi/chi/v5`)** | HTTP router with middleware chaining. |
| **`coder/websocket`** | WebSocket connection library. |
| **GORM** | ORM for PostgreSQL schema migration and records queries. |
| **JWT (`golang-jwt/jwt/v5`)** | JWT access + refresh token authentication. |
| **Bcrypt** | Password hashing. |
| **Viper (`spf13/viper`)** | YAML + env configuration. |
| **`go-playground/validator`** | Request payload validation. |

### Frontend (Client)
| Technology | Purpose |
| :--- | :--- |
| **React 18** | UI framework. |
| **TypeScript** | Type safety. |
| **Vite** | Build tool and dev server. |
| **React Router DOM v7** | Client-side routing. |
| **Tailwind CSS v3** | Utility-first styling. |
| **Lightweight Charts** | TradingView-style financial charting. |
| **Lucide React** | Icons. |
| **`react-resizable-panels`** | Resizable multi-pane panel layouts. |

### Storage & Infrastructure
| Technology | Purpose |
| :--- | :--- |
| **PostgreSQL 15** | Primary database (users, portfolios, holdings, watchlists). |
| **TimescaleDB** | Time-series database (trades, OHLCV candles, continuous aggregates). |
| **Redis 7** | Caching, Pub/Sub, real-time data distribution. |
| **Docker + Compose** | Multi-service orchestration. |
| **Nginx (Alpine)** | Serves built frontend in production. |

---

## 5. Server Architecture Layout

The directory structure and core module maps inside [server](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server):

```mermaid
graph LR
    subgraph cmd
        MAIN["main.go<br/>entry point"]
    end
    
    subgraph internal
        ROUTER["api/router.go"]
        MIDDLEWARE["api/middleware/jwt_middleware.go"]
        CONFIG["config/config.go<br/>+ assets.json"]
        DB["database/db.go"]
        
        subgraph HANDLERS["handlers"]
            AUTH["auth.go"]
            MARKET["market.go"]
            ORDERS["orders.go"]
            PORTFOLIO["portfolio.go"]
            WATCHLIST["watchlist.go"]
            WS["ws.go"]
        end
        
        subgraph MATCHING["matching"]
            ENGINE["engine.go"]
            LOB["LOBBuilder.go"]
            OQ["orderqueue.go"]
            OS["orderside.go"]
        end
        
        subgraph SIM["simulation"]
            GBM_DIR["gbm/<br/>generator.go, manager.go, profile.go"]
            NOISE["noise/<br/>agent.go, volume.go, timing.go, direction.go"]
            SYNTH["synthetic/agent.go"]
        end
        
        STORE["storage/storage.go"]
    end

    MAIN --> ROUTER
    MAIN --> ENGINE
    MAIN --> SIM
    ROUTER --> MIDDLEWARE
    ROUTER --> HANDLERS
    HANDLERS --> DB
    HANDLERS --> STORE
    MIDDLEWARE --> CONFIG
    SIM --> ENGINE
    ENGINE --> STORE
```

---

## 6. Matching Engine Design

The core matching engine is an **in-memory, concurrent** system built on Go channels:

*   **Buffered Channels** – `orderStream` (100k buffer) decouples REST handlers from the matching goroutine.
*   **Deterministic Execution** – A single background goroutine processes orders sequentially in [engine.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/matching/engine.go), guaranteeing Price-Time priority without mutex locks.
*   **Self-Trade Prevention (STP)** – Blocks trades where both buying and selling parties share the same `UserID`.
*   **Order Book Data Structures**:
    *   [OrderSide](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/matching/orderside.go) – Keeps price levels sorted using a balanced binary tree or sorted slice.
    *   [OrderQueue](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/matching/orderqueue.go) – Doubly-linked list per price level to achieve $O(1)$ push, pop, and remove operations.
    *   `OrderIndex` – Hash map from order ID to queue node pointer for $O(1)$ cancel operations.
*   [LOBBuilder](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/matching/LOBBuilder.go) (**Shadow Book**) – Maintains a real-time shadow book using the event stream and publishes limit order book (LOB) snapshots every 1s via Redis Pub/Sub.
*   **Supported Order Types** – Limit, Market, and Cancel orders.

---

## 7. Simulation Layer

### 7.1 GBM Price Generator
The Geometric Brownian Motion generator in [generator.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/simulation/gbm/generator.go) runs with a tick resolution of ~100ms:
$$dS_t = \mu S_t dt + \sigma S_t dW_t$$
Each asset has independent drift ($\mu$) and volatility ($\sigma$) parameters managed by [manager.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/simulation/gbm/manager.go) that transition through **Markov states** configured in [profile.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/simulation/gbm/profile.go):

| Parameter | States | Transition Interval |
| :--- | :--- | :--- |
| **Drift** | Bear \| Bull \| Normal \| Flat | Every 5–30 minutes |
| **Volatility** | Panic \| Elevated \| Normal \| Quiet | Every 5–30 minutes |

### 7.2 Synthetic Market Maker
Implemented in [agent.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/simulation/synthetic/agent.go):
*   Places **bid/ask ladders** every ~100ms tick.
*   Applies dynamic spread scaling based on volatility (0.3x to 3.0x).
*   **Power-law notional scaling**: $Q = \text{baseConstant} \times P^{\text{scalingFactor}}$
*   **Volatility thinning** – reduces available quantity when volatility spikes.
*   **Drift skewing** – skews bid/ask quantities based on market trend/momentum.
*   Operates under a reserved synthetic user ID: `999999998`.

### 7.3 Noise Trader
Implemented in [agent.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/simulation/noise/agent.go):
*   Simulates realistic retail order flow and noise trading behavior.
*   Uses a **Pareto distribution** for order sizes (heavy-tailed, $\alpha = 1.5$) via [volume.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/simulation/noise/volume.go).
*   Applies a **momentum bias** using an Exponential Moving Average (EMA) of prices in [direction.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/simulation/noise/direction.go).
*   **Contrarian behavior** – has a 15% probability of fading the current trend.
*   **U-shaped intraday volume distribution** – high volume at market open/close, lower volume around midday, managed by [timing.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/simulation/noise/timing.go).
*   Mix: 70% market orders, 30% limit orders.
*   Uses randomized client user IDs in the range `900000000` to `909999999`.

---

## 8. Simulated Assets

The simulation configures 15 Indian stock market assets:

| Symbol | Class / Market Cap Segment | Start Price (INR) |
| :--- | :--- | :--- |
| **RELIANCE** | Large Cap Bluechip | 2,950.00 |
| **HDFCBANK** | Private Sector Financial | 1,530.00 |
| **ICICIBANK** | Private Sector Financial | 1,080.00 |
| **TCS** | IT Services | 3,980.00 |
| **INFY** | IT Services | 1,490.00 |
| **ITC** | Defensive FMCG | 430.00 |
| **HINDUNILVR** | Defensive FMCG | 2,250.00 |
| **SBIN** | PSU Banking | 760.00 |
| **COALINDIA** | PSU Equity | 440.00 |
| **LT** | Cyclical Infrastructure | 3,750.00 |
| **SUNPHARMA** | Healthcare / Pharma | 1,620.00 |
| **TATAELXSI** | Mid Cap Growth | 7,800.00 |
| **CDSL** | Small Cap Exchange/Service | 1,950.00 |
| **SUZLON** | Micro Cap / Penny Stock | 42.50 |
| **IDEA** | Micro Cap / Penny Stock | 13.80 |

---

## 9. API Reference Map

Base Path: `/v1`

| Method | Path | Auth Required | Description | Handler File |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/auth/register` | No | Create user account & issue token pair | [auth.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/auth.go) |
| **POST** | `/auth/login` | No | Authenticate & issue token pair | [auth.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/auth.go) |
| **POST** | `/auth/refresh` | No | Rotate access token | [auth.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/auth.go) |
| **POST** | `/auth/logout` | No | Revoke session | [auth.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/auth.go) |
| **GET** | `/ws` | Optional | WebSocket connection upgrade | [ws.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/ws.go) |
| **GET** | `/assets` | No | List all tradeable assets | [market.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/market.go) |
| **GET** | `/marketdata/{symbol}` | No | Fetch latest price, volume, change | [market.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/market.go) |
| **GET** | `/candles/{symbol}/{interval}` | No | Fetch historical OHLCV candle data | [market.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/market.go) |
| **POST** | `/orders/` | **Yes (JWT)** | Place a new limit or market order | [orders.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/orders.go) |
| **DELETE** | `/orders/{id}` | **Yes (JWT)** | Cancel an active order | [orders.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/orders.go) |
| **GET** | `/orders/{id}` | **Yes (JWT)** | Query status of a single order | [orders.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/orders.go) |
| **GET** | `/orders/active` | **Yes (JWT)** | List all active orders for the user | [orders.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/orders.go) |
| **GET** | `/orders/history` | **Yes (JWT)** | Fetch paginated order history | [orders.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/orders.go) |
| **GET** | `/trades/history` | **Yes (JWT)** | Fetch paginated executed trades | [orders.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/orders.go) |
| **GET** | `/portfolio/history` | **Yes (JWT)** | Fetch equity curve, holdings, P&L | [portfolio.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/portfolio.go) |
| **POST** | `/portfolio/reset` | **Yes (JWT)** | Reset portfolio to initial state | [portfolio.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/portfolio.go) |
| **GET** | `/watchlist/` | **Yes (JWT)** | Retrieve user watchlist | [watchlist.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/watchlist.go) |
| **POST** | `/watchlist/{symbol}` | **Yes (JWT)** | Add an asset to the watchlist | [watchlist.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/watchlist.go) |
| **DELETE** | `/watchlist/{symbol}` | **Yes (JWT)** | Remove an asset from the watchlist | [watchlist.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/watchlist.go) |

---

## 10. Client Architecture (React)

The React client dashboard in [App.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/App.tsx) coordinates routing, themes, and workspace structure.

### Pages
*   [LandingPage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/LandingPage.tsx) – Public home page.
*   [LoginPage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/LoginPage.tsx) – Authentication form.
*   [SignUpPage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/SignUpPage.tsx) – Registration form.
*   [TradePage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/TradePage.tsx) – Main trading workspace utilizing a 3-panel layout.
*   [MarketsPage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/MarketsPage.tsx) – Overview list of all assets with search and filtering.
*   [WatchlistPage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/WatchlistPage.tsx) – Custom list of assets tracked by the user.
*   [PortfolioPage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/PortfolioPage.tsx) – Open positions, asset distribution charts, and history.
*   [AnalyticsPage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/AnalyticsPage.tsx) – P&L, Sharpe ratio, win rate, and metrics visualization.
*   [HistoryPage.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/pages/HistoryPage.tsx) – Tabbed panel showing full order/trade logs.

### Trading Panels
*   [OrderBook.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/panels/OrderBook.tsx) – Real-time LOB depth ladders.
*   [ChartPanel.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/panels/ChartPanel.tsx) – Lightweight Charts canvas overlay.
*   [OrderForm.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/panels/OrderForm.tsx) – Core limit and market submission inputs.
*   [Balances.tsx](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/components/panels/Balances.tsx) – Displays current holdings allocation.

### React WebSocket Hooks
*   [useMarketPrices.ts](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/hooks/useMarketPrices.ts) – Subscribes to consolidated prices stream.
*   [useOrderBook.ts](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/hooks/useOrderBook.ts) – Subscribes to live book snapshots.
*   [usePortfolio.ts](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/hooks/usePortfolio.ts) – Tracks balances and position events.
*   [useTrade.ts](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/hooks/useTrade.ts) – Handles live candlesticks aggregates stream.
*   [useWatchlistData.ts](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/hooks/useWatchlistData.ts) – Watchlist caching hooks.
*   [useAuth.ts](file:///d:/Fullstack/Algorithmic-Trading-Simulator/Client/src/hooks/useAuth.ts) – Core login/token wrapper.

---

## 11. Real-Time Data Pipeline

Real-time data is multiplexed through **Redis Pub/Sub** channels, providing a horizontally scalable communication tier:

| Redis Channel | Payload | Stream Frequency / Throttle |
| :--- | :--- | :--- |
| `candles:{symbol}` | Real-time OHLCV candle update | Event-driven (on trade execution) |
| `orderbook:{symbol}` | Limit Order Book (LOB) snapshot | Throttled to 1,000ms |
| `midprice:{symbol}` | Current mid-price updates | Event-driven |
| `prices:all` | Aggregated ticks for all assets | Throttled to 500ms |
| `trades:{symbol}` | Last 50 executed trade records | Event-driven |

The WebSocket handler [ws.go](file:///d:/Fullstack/Algorithmic-Trading-Simulator/server/internal/handlers/ws.go) subscribes to these channels dynamically based on active client subscriptions and pushes JSON payloads over TCP connections.

---

## 12. Orchestration & Deployment

The system is coordinated using Docker Compose (refer to [docker-compose.yml](file:///d:/Fullstack/Algorithmic-Trading-Simulator/docker-compose.yml)):

*   **ats_frontend**: Nginx server delivering Vite built production files on port `80`.
*   **ats_backend**: Multi-stage Golang container exposing route handles on port `8080`.
*   **ats_primary_db**: PostgreSQL primary relational container on port `5432`.
*   **ats_candlestick_db**: TimescaleDB continuous aggregates engine on port `5433`.
*   **ats_redis**: Redis message broker on port `6379`.
