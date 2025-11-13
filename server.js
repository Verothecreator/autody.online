const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 3000;

const RPC = process.env.POLYGON_RPC || "https://polygon-rpc.com";
const provider = new ethers.JsonRpcProvider(RPC);

const IUniswapV3PoolABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

app.get('/api/v3/pooldata', async (req, res) => {
  try {
    const { pool } = req.query;
    if (!pool) return res.status(400).json({ error: 'Missing ?pool=' });

    const poolContract = new ethers.Contract(pool, IUniswapV3PoolABI, provider);

    // fetch core info
    const [slot0, liquidity, token0, token1] = await Promise.all([
      poolContract.slot0(),
      poolContract.liquidity(),
      poolContract.token0(),
      poolContract.token1(),
    ]);

    // keep big values as strings to avoid BigInt/Number mixing on server
    const sqrtPriceX96 = slot0[0].toString();
    const tick = slot0.tick ?? (slot0[1] !== undefined ? slot0[1] : null);
    const liquidityStr = liquidity.toString();

    // fetch token decimals and symbols (best-effort)
    const t0 = new ethers.Contract(token0, ERC20_ABI, provider);
    const t1 = new ethers.Contract(token1, ERC20_ABI, provider);
    let dec0 = null, dec1 = null, sym0 = null, sym1 = null;
    try { dec0 = Number(await t0.decimals()); } catch (e) { dec0 = 18; }
    try { dec1 = Number(await t1.decimals()); } catch (e) { dec1 = 18; }
    try { sym0 = await t0.symbol(); } catch (e) { sym0 = null; }
    try { sym1 = await t1.symbol(); } catch (e) { sym1 = null; }

    // approximate price calculation:
    // sqrtPriceX96 is a Q64.96 fixed point representing sqrt(token1/token0) * 2^96
    // compute as Number((sqrt / 2^96)^2) * 10^(dec0 - dec1)
    // do division first to avoid extremely large intermediate BigInt -> Number
    let approxPrice = null;
    try {
      const sqrtBig = BigInt(sqrtPriceX96);
      // convert to Number safely by dividing by 2^96 first (should bring magnitude near 1..100)
      const sqrtAsNumber = Number(sqrtBig) / Math.pow(2, 96);
      const priceRaw = Math.pow(sqrtAsNumber, 2);
      // adjust for decimals (token1 per token0)
      const decimalAdj = Math.pow(10, (dec0 ?? 18) - (dec1 ?? 18));
      approxPrice = priceRaw * decimalAdj;
      // guard for NaN / Infinity
      if (!isFinite(approxPrice)) approxPrice = null;
    } catch (e) {
      approxPrice = null;
    }

    return res.json({
      success: true,
      pool: pool,
      token0,
      token1,
      token0Decimals: dec0,
      token1Decimals: dec1,
      token0Symbol: sym0,
      token1Symbol: sym1,
      sqrtPriceX96,        // string
      liquidity: liquidityStr, // string
      tick: tick ?? null,
      approxPriceUSD_or_quote: approxPrice // number or null (quote unit = token1 per token0)
    });
  } catch (err) {
    console.error("Error fetching v3 pool:", err);
    return res.status(500).json({ error: 'Failed to fetch Uniswap v3 pool data', details: String(err?.message || err) });
  }
});

// --- serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Autody is running at http://localhost:${PORT}`);
});
