// server.js
const express = require('express');
const path = require('path');
// Use node-fetch v2 for require() compatibility
const fetch = require('node-fetch'); // npm i node-fetch@2
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------- GeckoTerminal v3 proxy: pool ----------------------
app.get('/api/gtv3/pool', async (req, res) => {
  const network = req.query.network;
  const pool = req.query.pool;
  if (!network || !pool) return res.status(400).json({ error: "Missing network or pool parameters" });

  // GeckoTerminal v3 base path
  const url = `https://api.geckoterminal.com/api/v3/networks/${network}/pools/${pool}`;
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }});
    const data = await response.json();
    // short cache (GT updates frequently)
    res.set('Cache-Control', 'public, max-age=15, s-maxage=15');
    res.json(data);
  } catch (err) {
    console.error("GT v3 pool proxy error:", err?.message || err);
    res.status(502).json({ error: "Failed to fetch pool from GeckoTerminal v3" });
  }
});

// ---------------------- GeckoTerminal v3 proxy: trades ----------------------
app.get('/api/gtv3/trades', async (req, res) => {
  const network = req.query.network;
  const pool = req.query.pool;
  const limit = req.query.limit || 500;
  if (!network || !pool) return res.status(400).json({ error: "Missing network or pool parameters" });

  const url = `https://api.geckoterminal.com/api/v3/networks/${network}/pools/${pool}/trades?limit=${limit}`;
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }});
    const data = await response.json();
    res.set('Cache-Control', 'public, max-age=10, s-maxage=10');
    res.json(data);
  } catch (err) {
    console.error("GT v3 trades proxy error:", err?.message || err);
    res.status(502).json({ error: "Failed to fetch trades from GeckoTerminal v3" });
  }
});

// ---------------------- Uniswap V3 Subgraph fallback ----------------------
app.get('/api/uni/pool', async (req, res) => {
  const network = req.query.network || "polygon";
  const pool = req.query.pool;
  if (!pool) return res.status(400).json({ error: "Missing pool parameter" });

  // Uniswap V3 Polygon subgraph (maintained by Messari)
  const subgraphUrl = "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon";

  // GraphQL query: last 24h volume + tx count + token prices
  const query = {
    query: `
      {
        pool(id: "${pool.toLowerCase()}") {
          id
          token0 { symbol decimals }
          token1 { symbol decimals }
          volumeUSD
          totalValueLockedUSD
          txCount
          feesUSD
          totalValueLockedToken0
          totalValueLockedToken1
        }
      }
    `
  };

  try {
    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query)
    });
    const json = await response.json();

    if (json?.data?.pool) {
      res.set('Cache-Control', 'public, max-age=15');
      res.json(json.data.pool);
    } else {
      res.status(404).json({ error: "Pool not found in subgraph" });
    }
  } catch (err) {
    console.error("Uniswap v3 subgraph error:", err.message);
    res.status(502).json({ error: "Failed to fetch from Uniswap v3 subgraph" });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Autody is running at http://localhost:${PORT}`);
});
