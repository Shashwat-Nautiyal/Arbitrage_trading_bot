require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const db = require('./db');

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || 5000);
const GAS_USD = parseFloat(process.env.GAS_USD_ESTIMATE || 2.0);

// Addresses (mainnet examples)
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48';
const WETH = '0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2';

// Example Uniswap V2 pair addresses for ETH/USDC
const UNISWAP_PAIR = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc';
const SUSHI_SWAP = '0x397FF1542f962076d0BFE58eA045FfA2d347ACa0';
const UNI_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)",
  "function token0() view returns (address)"
];

function getAmountOut(amountIn, reserveIn, reserveOut, fee=0.003) {
  const amountInWithFee = amountIn * (1 - fee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return numerator / denominator;
}

async function getPairPrice(pairAddress) {
  const pair = new ethers.Contract(pairAddress, UNI_PAIR_ABI, provider);
  const token0 = (await pair.token0()).toLowerCase();
  const res = await pair.getReserves();
  const reserve0 = parseFloat(res[0].toString());
  const reserve1 = parseFloat(res[1].toString());

  // WETH/USDC pair where token0 may be WETH or USDC
  let price; // USDC per WETH
  if (token0 === WETH.toLowerCase()) {
    // reserve0 = WETH, reserve1 = USDC (USDC has 6 decimals, WETH 18)
    // normalize decimals: we only need ratio, but must account decimals
    // reserve0 (WETH) scaled by 1e18, reserve1 (USDC) scaled by 1e6
    price = (reserve1 / 1e6) / (reserve0 / 1e18);
  } else {
    // token0 is USDC
    price = (reserve0 / 1e6) / (reserve1 / 1e18);
  }
  return { price, reserve0, reserve1, token0 };
}

// simulate a full two-leg arbitrage with slippage via amounts
async function simulateTwoLeg(pairBuy, pairSell, amountWETH, swapFeePct=0.003) {
  // fetch reserves
  const buyPair = new ethers.Contract(pairBuy, UNI_PAIR_ABI, provider);
  const sellPair = new ethers.Contract(pairSell, UNI_PAIR_ABI, provider);

  const [buyToken0, buyRes] = await Promise.all([buyPair.token0(), buyPair.getReserves()]);
  const [sellToken0, sellRes] = await Promise.all([sellPair.token0(), sellPair.getReserves()]);

  function normalize(token0, res) {
    const r0 = parseFloat(res[0].toString());
    const r1 = parseFloat(res[1].toString());
    if (token0.toLowerCase() === WETH.toLowerCase()) {
      // token0 = WETH (1e18), token1 = USDC (1e6)
      return { rw: r0 / 1e18, ru: r1 / 1e6 };
    } else {
      // token0 = USDC, token1 = WETH
      return { rw: r1 / 1e18, ru: r0 / 1e6 };
    }
  }

  // seq of reserves => (weth, usdc)
  const buyNorm = normalize(buyToken0, buyRes);
  const sellNorm = normalize(sellToken0, sellRes);

  const reserveInSell = sellNorm.rw; // WETH
  const reserveOutSell = sellNorm.ru; // USDC
  const usdcProceeds = getAmountOut(amountWETH, reserveInSell, reserveOutSell, swapFeePct);

  
  function getAmountIn(amountOut, reserveIn, reserveOut, fee=0.003) {
    const numerator = reserveIn * amountOut;
    const denominator = (reserveOut - amountOut);
    const raw = numerator / denominator;
    const amountIn = raw / (1 - fee);
    return amountIn;
  }
  const usdcCost = getAmountIn(amountWETH, buyNorm.rw, buyNorm.ru, swapFeePct);

  // compute profit (USDC)
  const profitUSDC = usdcProceeds - usdcCost - (2 * GAS_USD); // subtract gas both legs
  // Also convert to USD profit directly (USDC ~ USD)
  return { profitUSDC, usdcProceeds, usdcCost };
}

// main monitoring loop
async function scanOnce() {
  try {
    const { price: priceUni } = await getPairPrice(UNISWAP_PAIR);
    const { price: priceSushi } = await getPairPrice(SUSHI_SWAP);

    console.log(`[${new Date().toISOString()}] Uni: $${priceUni.toFixed(2)}  Sushi: $${priceSushi.toFixed(2)}`);

    
    const amountWETH = 1; // simulate 1 WETH
    const res1 = await simulateTwoLeg(UNISWAP_PAIR, SUSHI_SWAP, amountWETH);
    const res2 = await simulateTwoLeg(SUSHI_SWAP, UNISWAP_PAIR, amountWETH);

    if (res1.profitUSDC > 0) {
      console.log(`Profitable: Buy @ Uni, Sell @ Sushi → profit $${res1.profitUSDC.toFixed(2)}`);
      db.insertScan({
        timestamp: Date.now(),
        dex_a: 'Uniswap',
        dex_b: 'Sushiswap',
        pair: 'WETH/USDC',
        amount_in: amountWETH,
        direction: 'BuyUni_SellSushi',
        buy_price: priceUni,
        sell_price: priceSushi,
        estimated_profit: res1.profitUSDC
      });
    }
    if (res2.profitUSDC > 0) {
      console.log(`Profitable: Buy @ Sushi, Sell @ Uni → profit $${res2.profitUSDC.toFixed(2)}`);
      db.insertScan({
        timestamp: Date.now(),
        dex_a: 'Sushiswap',
        dex_b: 'Uniswap',
        pair: 'WETH/USDC',
        amount_in: amountWETH,
        direction: 'BuySushi_SellUni',
        buy_price: priceSushi,
        sell_price: priceUni,
        estimated_profit: res2.profitUSDC
      });
    }
  } catch (err) {
    console.error('scan error', err);
  }
}

// start loop
setInterval(scanOnce, POLL_INTERVAL_MS);
scanOnce();

// basic API
const app = express();
app.get('/opportunities', (req, res) => {
  const rows = db.recentScans(100);
  res.json(rows);
});
app.listen(3000, () => console.log('API running on http://localhost:3000'));
