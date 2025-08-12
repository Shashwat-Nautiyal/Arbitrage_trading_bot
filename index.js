require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const db = require('./db');

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || 5000);
const GAS_USD = parseFloat(process.env.GAS_USD_ESTIMATE || 2.0);

// Addresses (polygon mainnet examples)
const USDC = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// Example Uniswap V2 pair addresses for ETH/USDC
const UNISWAP_PAIR = '0x67473ebdBFD1e6Fc4367462d55eD1eE56e1963FA';
const PANCAKE_SWAP = '0x2E8135bE71230c6B1B4045696d41C09Db0414226';
const UNI_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)",
  "function token0() view returns (address)"
];

// Uniswap math: getAmountOut and getAmountIn (constant product)
function getAmountOut(amountIn, reserveIn, reserveOut, fee=0.003) {
  const amountInWithFee = amountIn * (1 - fee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return numerator / denominator;
}

// Convert pair reserves => price (USDC per WETH)
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

  // normalize reserves to WETH <-> USDC decimals
  // helper to return reserves as (reserveWETH, reserveUSDC)
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

  // __seq of reserves__ (weth, usdc)
  const buyNorm = normalize(buyToken0, buyRes);
  const sellNorm = normalize(sellToken0, sellRes);

  // 1) Buy WETH on buyPair using USDC: we start with amountWETH as desired output? easier is:
  // We'll start with buying `amountWETH` by inputting USDC required = getAmountIn for amountWETH
  // But earlier we used getAmountOut: simpler: start with amountWETH (1 WETH) and compute USD cost via reserves (reverse)
  // Use constant product backwards: compute required USDC to get amountWETH out.
  // For simplicity here: simulate selling amountWETH on sellPair to USDC, and buying amountWETH on buyPair costing USDC.
  // compute USDC received when selling amountWETH on sellPair:
  const reserveInSell = sellNorm.rw; // WETH
  const reserveOutSell = sellNorm.ru; // USDC
  const usdcProceeds = getAmountOut(amountWETH, reserveInSell, reserveOutSell, swapFeePct);

  // compute USDC cost to buy amountWETH on buyPair: we need getAmountIn but we can approximate by numeric solve or formula:
  // getAmountIn = reserveIn * ((reserveOut / (reserveOut - amountOut)) - 1) / (1 - fee)
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
    const { price: priceSushi } = await getPairPrice(PANCAKE_SWAP);

    console.log(`[${new Date().toISOString()}] Uni: $${priceUni.toFixed(2)}  Sushi: $${priceSushi.toFixed(2)}`);

    // example amount to simulate
    const amountWETH = 1; // simulate 1 WETH
    const res1 = await simulateTwoLeg(UNISWAP_PAIR, PANCAKE_SWAP, amountWETH);
    const res2 = await simulateTwoLeg(PANCAKE_SWAP, UNISWAP_PAIR, amountWETH);

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
