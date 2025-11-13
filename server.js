// server.js
const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // npm i node-fetch
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Simple proxy for GeckoTerminal pool info
app.get('/api/gt/pool', async (req, res) => {
  const network = req.query.network;
  const pool = req.query.pool;
  if (!network || !pool) return res.status(400).json({ error: "Missing network or pool parameters" });

  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}`;
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }});
    const data = await response.json();
    // Optional: set cache-control for a short time
    res.set('Cache-Control', 'public, max-age=20, s-maxage=20');
    res.json(data);
  } catch (err) {
    console.error("GT pool proxy error:", err?.message || err);
    res.status(502).json({ error: "Failed to fetch pool from GeckoTerminal" });
  }
});

// Proxy for GeckoTerminal trades (avoid CORS on browser)
app.get('/api/gt/trades', async (req, res) => {
  const network = req.query.network;
  const pool = req.query.pool;
  const limit = req.query.limit || 500;
  if (!network || !pool) return res.status(400).json({ error: "Missing network or pool parameters" });

  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}/trades?limit=${limit}`;
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }});
    const data = await response.json();
    // keep cache short; trades change fast
    res.set('Cache-Control', 'public, max-age=10, s-maxage=10');
    res.json(data);
  } catch (err) {
    console.error("GT trades proxy error:", err?.message || err);
    res.status(502).json({ error: "Failed to fetch trades from GeckoTerminal" });
  }
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Autody is running at http://localhost:${PORT}`);
});
