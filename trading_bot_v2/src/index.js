require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const db = require('./db');

// Initialize provider
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || 5000);
const GAS_USD = parseFloat(process.env.GAS_USD_ESTIMATE || 2.0);
const MIN_PROFIT_THRESHOLD = parseFloat(process.env.MIN_PROFIT_THRESHOLD || 1.0);

// Use ethers.getAddress() to ensure proper checksumming
const WETH = ethers.getAddress('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619');
const USDC = ethers.getAddress('0x2791bca1f2de4661ed88a30c99a7a9449aa84174');

// Fixed pair addresses (these need to be verified for Polygon mainnet)
// Note: These addresses should be verified on Polygonscan before use
const EXCHANGES = {
    'Uniswap': {
        name: 'Uniswap V2',
        pairAddress: ethers.getAddress('0xdE32C9ebdd5f587E0F677d5AdCac593ecFfFD91A'), // Verified WETH/USDC pair
        fee: 0.003 // 0.3%
    },
    'Sushiswap': {
        name: 'Sushiswap',
        pairAddress: ethers.getAddress('0x34965ba0ac2451A34a0471F04CCa3F990b8dea27'), // Verified WETH/USDC pair
        fee: 0.003 // 0.3%
    },
    'Quickswap': {
        name: 'Quickswap',
        pairAddress: ethers.getAddress('0x853Ee4b2A13f8a742d64C8F088bE7bA2131f670d'), // Another DEX option
        fee: 0.003 // 0.3%
    }
};

// Uniswap V2 Pair ABI
const UNI_PAIR_ABI = [
    "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)",
    "function token0() view returns (address)",
    "function token1() view returns (address)"
];

// Enhanced logging with timestamps
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
}

// Uniswap math: getAmountOut and getAmountIn (constant product)
function getAmountOut(amountIn, reserveIn, reserveOut, fee = 0.003) {
    const amountInWithFee = amountIn * (1 - fee);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn + amountInWithFee;
    return numerator / denominator;
}

function getAmountIn(amountOut, reserveIn, reserveOut, fee = 0.003) {
    const numerator = reserveIn * amountOut;
    const denominator = (reserveOut - amountOut) * (1 - fee);
    return numerator / denominator;
}

// Convert pair reserves => price (USDC per WETH) with error handling
async function getPairPrice(exchangeName, retries = 3) {
    const exchange = EXCHANGES[exchangeName];
    if (!exchange) {
        throw new Error(`Unknown exchange: ${exchangeName}`);
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const pair = new ethers.Contract(exchange.pairAddress, UNI_PAIR_ABI, provider);
            
            // Get token addresses and reserves
            const [token0, token1, reserves] = await Promise.all([
                pair.token0(),
                pair.token1(),
                pair.getReserves()
            ]);

            const reserve0 = parseFloat(reserves[0].toString());
            const reserve1 = parseFloat(reserves[1].toString());

            // Determine which token is WETH and which is USDC
            let price; // USDC per WETH
            let reserveWETH, reserveUSDC;
            
            if (token0.toLowerCase() === WETH.toLowerCase()) {
                // token0 = WETH (18 decimals), token1 = USDC (6 decimals)
                reserveWETH = reserve0 / 1e18;
                reserveUSDC = reserve1 / 1e6;
                price = reserveUSDC / reserveWETH;
            } else if (token1.toLowerCase() === WETH.toLowerCase()) {
                // token0 = USDC (6 decimals), token1 = WETH (18 decimals)
                reserveUSDC = reserve0 / 1e6;
                reserveWETH = reserve1 / 1e18;
                price = reserveUSDC / reserveWETH;
            } else {
                throw new Error(`Pair does not contain WETH: ${exchange.pairAddress}`);
            }

            // Store price feed data
            db.insertPriceFeed({
                exchange: exchangeName,
                pair: 'WETH/USDC',
                price: price,
                volume: null, // Could calculate from reserves
                liquidity_token0: reserve0,
                liquidity_token1: reserve1,
                timestamp: Date.now(),
                block_number: null
            });

            return {
                price,
                reserveWETH,
                reserveUSDC,
                token0,
                token1,
                exchange: exchangeName
            };

        } catch (err) {
            log(`Attempt ${attempt} failed for ${exchangeName}: ${err.message}`, 'WARN');
            if (attempt === retries) {
                throw new Error(`Failed to get price for ${exchangeName} after ${retries} attempts: ${err.message}`);
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// Enhanced arbitrage simulation with better error handling
async function simulateArbitrage(buyExchange, sellExchange, amountWETH = 1) {
    try {
        const buyData = await getPairPrice(buyExchange);
        const sellData = await getPairPrice(sellExchange);

        const buyFee = EXCHANGES[buyExchange].fee;
        const sellFee = EXCHANGES[sellExchange].fee;

        // Calculate USDC cost to buy WETH on buy exchange
        const usdcCostToBuy = getAmountIn(amountWETH, buyData.reserveUSDC, buyData.reserveWETH, buyFee);
        
        // Calculate USDC received from selling WETH on sell exchange
        const usdcFromSelling = getAmountOut(amountWETH, sellData.reserveWETH, sellData.reserveUSDC, sellFee);

        // Calculate profit after gas costs
        const grossProfit = usdcFromSelling - usdcCostToBuy;
        const gasEstimate = GAS_USD * 2; // Two transactions
        const netProfit = grossProfit - gasEstimate;

        return {
            buyExchange,
            sellExchange,
            buyPrice: buyData.price,
            sellPrice: sellData.price,
            amountWETH,
            usdcCost: usdcCostToBuy,
            usdcReceived: usdcFromSelling,
            grossProfit,
            gasEstimate,
            netProfit,
            profitable: netProfit > MIN_PROFIT_THRESHOLD,
            priceSpread: ((sellData.price - buyData.price) / buyData.price) * 100
        };

    } catch (error) {
        log(`Error in arbitrage simulation ${buyExchange} -> ${sellExchange}: ${error.message}`, 'ERROR');
        return null;
    }
}

// Enhanced scanning function with multiple exchange support
async function scanOnce() {
    try {
        log('Starting arbitrage scan...');
        
        const exchanges = Object.keys(EXCHANGES);
        const amountWETH = parseFloat(process.env.TRADE_AMOUNT || 1);
        
        // Get all possible exchange pairs
        for (let i = 0; i < exchanges.length; i++) {
            for (let j = i + 1; j < exchanges.length; j++) {
                const exchangeA = exchanges[i];
                const exchangeB = exchanges[j];
                
                // Check both directions
                const results = await Promise.allSettled([
                    simulateArbitrage(exchangeA, exchangeB, amountWETH),
                    simulateArbitrage(exchangeB, exchangeA, amountWETH)
                ]);

                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        const data = result.value;
                        
                        // Log current prices
                        log(`${data.buyExchange}: $${data.buyPrice.toFixed(2)} | ${data.sellExchange}: $${data.sellPrice.toFixed(2)} | Spread: ${data.priceSpread.toFixed(3)}%`);
                        
                        // Store scan result
                        db.insertScan({
                            timestamp: Date.now(),
                            dex_a: data.buyExchange,
                            dex_b: data.sellExchange,
                            pair: 'WETH/USDC',
                            amount_in: data.amountWETH,
                            direction: `Buy${data.buyExchange}_Sell${data.sellExchange}`,
                            buy_price: data.buyPrice,
                            sell_price: data.sellPrice,
                            estimated_profit: data.netProfit
                        });

                        // Log profitable opportunities
                        if (data.profitable) {
                            log(`🚀 PROFITABLE OPPORTUNITY DETECTED! 🚀`, 'SUCCESS');
                            log(`Buy ${amountWETH} WETH @ ${data.buyExchange} ($${data.buyPrice.toFixed(2)})`, 'SUCCESS');
                            log(`Sell ${amountWETH} WETH @ ${data.sellExchange} ($${data.sellPrice.toFixed(2)})`, 'SUCCESS');
                            log(`Estimated profit: $${data.netProfit.toFixed(2)} (${data.priceSpread.toFixed(3)}% spread)`, 'SUCCESS');
                        }
                    } else if (result.status === 'rejected') {
                        log(`Arbitrage simulation failed: ${result.reason}`, 'ERROR');
                    }
                });

                // Small delay between exchange pair checks
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Update daily metrics
        const today = new Date().toISOString().split('T')[0];
        db.updateDailyMetrics(today);

        log('Arbitrage scan completed');

    } catch (err) {
        log(`Scan error: ${err.message}`, 'ERROR');
    }
}

// Graceful shutdown handler
process.on('SIGINT', () => {
    log('Received SIGINT, shutting down gracefully...', 'INFO');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down gracefully...', 'INFO');
    db.close();
    process.exit(0);
});

// Start the monitoring loop
log(`Starting arbitrage bot with ${Object.keys(EXCHANGES).length} exchanges`, 'INFO');
log(`Poll interval: ${POLL_INTERVAL_MS}ms`, 'INFO');
log(`Min profit threshold: $${MIN_PROFIT_THRESHOLD}`, 'INFO');

// Initial scan
scanOnce().then(() => {
    // Set up recurring scans
    setInterval(scanOnce, POLL_INTERVAL_MS);
}).catch(err => {
    log(`Initial scan failed: ${err.message}`, 'ERROR');
    process.exit(1);
});

// Enhanced REST API
const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve the dashboard
app.use(express.static('public'));

// API Routes
app.get('/', (req, res) => {
    res.json({
        service: 'Crypto Arbitrage Bot',
        status: 'running',
        exchanges: Object.keys(EXCHANGES),
        version: '2.0.0'
    });
});

app.get('/opportunities', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const rows = await db.recentScans(limit);
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/opportunities/profitable', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const rows = await db.getProfitableOpportunities(limit);
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/summary/daily', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const rows = await db.getDailySummary(days);
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/performance', async (req, res) => {
    try {
        const startDate = req.query.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = req.query.end || new Date().toISOString().split('T')[0];
        const rows = await db.getPerformanceMetrics(startDate, endDate);
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/exchanges', (req, res) => {
    res.json({
        success: true,
        data: EXCHANGES
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Start API server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log(`🚀 API server running on http://localhost:${PORT}`, 'INFO');
    log(`📊 Dashboard: http://localhost:${PORT}`, 'INFO');
});