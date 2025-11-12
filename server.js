const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const fetch = require('node-fetch'); // install this if not already: npm install node-fetch

// Proxy endpoint to fetch trades from GeckoTerminal
app.get('/api/trades', async (req, res) => {
  const { network, pool, limit } = req.query;

  if (!network || !pool) {
    return res.status(400).json({ error: "Missing network or pool parameters" });
  }

  try {
    const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}/trades?limit=${limit || 300}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("GT proxy error:", err.message);
    res.status(500).json({ error: "Failed to fetch GeckoTerminal trades" });
  }
});

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for any routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Autody is running at http://localhost:${PORT}`);
});
