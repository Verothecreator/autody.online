const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 3000;

// Polygon RPC
const RPC = process.env.POLYGON_RPC || "https://polygon-rpc.com";
const provider = new ethers.JsonRpcProvider(RPC);

// --- Uniswap V3 ABI Snippet (for price & liquidity)
const IUniswapV3PoolABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

app.get('/api/v3/pooldata', async (req, res) => {
  try {
    const { pool } = req.query;
    if (!pool) return res.status(400).json({ error: 'Missing ?pool=' });

    const poolContract = new ethers.Contract(pool, IUniswapV3PoolABI, provider);

    const [slot0, liquidity, token0, token1] = await Promise.all([
      poolContract.slot0(),
      poolContract.liquidity(),
      poolContract.token0(),
      poolContract.token1(),
    ]);

    const sqrtPriceX96 = slot0[0];
    const price = (sqrtPriceX96 / 2 ** 96) ** 2;

    res.json({
      token0,
      token1,
      sqrtPriceX96: sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      price,
      tick: slot0.tick,
    });

  } catch (err) {
    console.error("Error fetching v3 pool:", err);
    res.status(500).json({ error: 'Failed to fetch Uniswap v3 pool data', details: err.message });
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
