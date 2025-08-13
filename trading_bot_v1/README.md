# DeFi Arbitrage Trading Bot (Backend Service)

## Overview
This backend service continuously monitors token prices across multiple **Uniswap V2-compatible DEXs** and identifies **profitable arbitrage opportunities**.  
It supports **percentage-based profit detection**, live gas estimation, and accurate AMM math for swap simulation — without sending real on-chain trades.  

The bot:
- Fetches live token prices from at least two Uniswap V2-compatible DEXs (currently Uniswap & Sushiswap for WETH/USDC).
- Detects profitable **two-leg arbitrage** (buy on one DEX, sell on another).
- Calculates **net profit percentage** considering:
  - Swap fees  
  - Live gas cost in USD  
  - Price slippage via AMM reserves
- Simulates trade execution **off-chain** (no gas spent, no actual trades).
- Stores results in a database (SQLite).
- Provides an **API endpoint** to fetch recent profitable opportunities.

---

## Features
- **Live price fetching** using on-chain reserves (`getReserves`) from each DEX pair.
- **Percentage-based detection** — compares opportunities by relative profitability, independent of trade size.
- **Realistic swap simulation** using Uniswap V2 constant-product formulas (`getAmountOut`).
- **Live gas cost estimation** using EIP-1559 base fee + priority fee, converted to USD.
- **SQLite storage** with timestamped records of profitable trades.
- **REST API** (`/opportunities`) for fetching recent results.
- Modular design, ready for **triangular arbitrage** extension.

---

## Project Structure
```
├── index.js                             # Main bot logic (fetching, simulation, API)
├── db.js                                # SQLite helper functions
├── .env                                 # Environment configuration
├── arbitrage.db                         # SQLite database file (auto-created)
└── README.md                            # Project documentation
```

### .env.example
```
RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY
POLL_INTERVAL_MS=5000
```


---

## Requirements
- Node.js v18+
- npm
- An RPC endpoint for Ethereum mainnet (Infura, Alchemy, or other)

---

## Installation

1. Clone the repository:
   ```bash
   git clone [<your-repo-url>](https://github.com/Shashwat-Nautiyal/Arbitrage_trading_bot/new)
   cd trading_bot_v1
2. npm install
3. node index.js

## API-Endpoint
The bot will run an API server on port `3000`.
```
GET /opportunities
```

Response Foramt
```
[
  {
    "timestamp": 1691936400000,
    "dex_a": "Uniswap",
    "dex_b": "Sushiswap",
    "pair": "WETH/USDC",
    "amount_in": 0.5,
    "direction": "BuyUni_SellSushi",
    "buy_price": 2020,
    "sell_price": 2025,
    "estimated_profit": 5.5
  }
]
```
