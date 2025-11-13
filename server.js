const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 3000;

const RPC = process.env.POLYGON_RPC || "https://polygon-rpc.com";
const provider = new ethers.JsonRpcProvider(RPC);

// Dexscreener proxy (avoids CORS issues)
app.get('/api/dex/pair', async (req, res) => {
  try {
    const { pair } = req.query;
    if (!pair) return res.status(400).json({ error: 'Missing ?pair=' });

    // Dexscreener polygon pair endpoint (no API key)
    const url = `https://api.dexscreener.com/latest/dex/pairs/polygon/${pair}`;

    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      const body = await r.text().catch(()=>'<no body>');
      return res.status(502).json({ error: 'Dexscreener fetch failed', status: r.status, body });
    }
    const json = await r.json();

    // Normalize a small subset that the front-end will use:
    // We'll return the full dexscreener response as `raw` and a `summary` mapping
    const pairData = json?.pair || json?.pairs?.[0] || null;

    const summary = {
      pairAddress: pair,
      priceUsd: pairData?.priceUsd ?? null,
      fdv: pairData?.fdv ?? null,
      liquidityUsd: pairData?.liquidity?.usd ?? pairData?.liquidityUsd ?? null,
      // time-windowed stats (safe-read multiple possible key names)
      txns: {
        '5m': pairData?.txns?.m5 ?? pairData?.txns?.'5m' ?? null,
        '15m': pairData?.txns?.m15 ?? null,
        '30m': pairData?.txns?.m30 ?? null,
        '1h': pairData?.txns?.h1 ?? pairData?.txns?.'1h' ?? null,
        '6h': pairData?.txns?.h6 ?? null,
        '24h': pairData?.txns?.h24 ?? pairData?.txns?.'24h' ?? null,
      },
      volume: {
        '5m': pairData?.volume?.m5 ?? pairData?.volume?.'5m' ?? null,
        '15m': pairData?.volume?.m15 ?? null,
        '30m': pairData?.volume?.m30 ?? null,
        '1h': pairData?.volume?.h1 ?? null,
        '6h': pairData?.volume?.h6 ?? null,
        '24h': pairData?.volume?.h24 ?? pairData?.volume?.'24h' ?? null,
      },
      // in case dexscreener exposes buys/sells split (some versions do)
      buys: {
        '5m': pairData?.buys?.m5 ?? null,
        '15m': pairData?.buys?.m15 ?? null,
        '30m': pairData?.buys?.m30 ?? null,
        '1h': pairData?.buys?.h1 ?? null,
        '6h': pairData?.buys?.h6 ?? null,
        '24h': pairData?.buys?.h24 ?? null,
      },
      sells: {
        '5m': pairData?.sells?.m5 ?? null,
        '15m': pairData?.sells?.m15 ?? null,
        '30m': pairData?.sells?.m30 ?? null,
        '1h': pairData?.sells?.h1 ?? null,
        '6h': pairData?.sells?.h6 ?? null,
        '24h': pairData?.sells?.h24 ?? null,
      }
    };

    return res.json({ success: true, raw: json, summary });
  } catch (err) {
    console.error("Dex proxy error:", err);
    return res.status(500).json({ error: "Failed to fetch Dexscreener", details: String(err?.message || err) });
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
