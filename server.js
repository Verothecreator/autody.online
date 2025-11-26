const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const { ethers } = require("ethers");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT;

const RPC = process.env.POLYGON_RPC;
const provider = new ethers.JsonRpcProvider(RPC);

// BUY CONTRACT
const BUY_CONTRACT_ADDRESS = process.env.BUY_CONTRACT_ADDRESS;

// ABI (only the function we call)
const BUY_ABI = [
    "function buyForBuyer(address buyer, uint256 auAmount) external",
    "function backend() view returns (address)"
];

// BACKEND PRIVATE KEY (VERY IMPORTANT)
const PRIVATE_KEY = process.env.BACKEND_PK;
if (!PRIVATE_KEY) {
    console.error("❌ ERROR: BACKEND_PK environment variable missing.");
    process.exit(1);
}

const backendWallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Transak Secret
const TRANSAK_SECRET = process.env.TRANSAK_SECRET;

// Orders store
const ORDER_STORE = path.join(__dirname, "orders.json");
if (!fs.existsSync(ORDER_STORE)) fs.writeFileSync(ORDER_STORE, "{}");

function loadOrders() {
    return JSON.parse(fs.readFileSync(ORDER_STORE));
}
function saveOrders(data) {
    fs.writeFileSync(ORDER_STORE, JSON.stringify(data, null, 2));
}

// ------------------ EXPRESS --------------------

// Transak requires raw body for signature hashing
app.use(bodyParser.raw({ type: "*/*" }));

// ----------------------
// VERIFY TRANSAK SIGNATURE
// ----------------------
function validTransakSignature(req) {
    const signature = req.headers["x-transak-signature"];
    if (!signature) return false;

    const computed = crypto
        .createHmac("sha256", TRANSAK_SECRET)
        .update(req.body)
        .digest("hex");

    return computed === signature;
}


// ----------------------
// WEBHOOK ENDPOINT
// ----------------------

app.post("/webhook/transak", async (req, res) => {
    try {
        if (!validTransakSignature(req)) {
            console.log("❌ Invalid Transak signature");
            return res.status(401).send("Invalid signature");
        }

        const data = JSON.parse(req.body.toString());

        console.log("🟢 Webhook received:", data);

        const orderId = data?.id;
        const status = data?.status;
        const metadata = data?.metaData || {};
        const buyerWallet = metadata.wallet_to_credit;
        const auAmount = Number(metadata.au_amount);

        if (!orderId || !buyerWallet || !auAmount) {
            console.log("❌ Missing required metadata");
            return res.status(400).send("Missing metadata");
        }

        let orders = loadOrders();

        // Prevent double-credit
        if (orders[orderId]) {
            console.log("⚠ Order already processed:", orderId);
            return res.status(200).send("Already processed");
        }

        // Only credit AU after Transak confirms success
        if (status !== "COMPLETED") {
            console.log("⌛ Order not completed yet:", orderId, status);
            return res.status(200).send("Waiting for completion");
        }

        // ---------------------------
        // CALL THE BUY CONTRACT
        // ---------------------------

        const contract = new ethers.Contract(
            BUY_CONTRACT_ADDRESS,
            BUY_ABI,
            backendWallet
        );

        console.log("📤 Sending AU:", auAmount, "to", buyerWallet);

        const tx = await contract.buyForBuyer(buyerWallet, auAmount);
        const receipt = await tx.wait();

        console.log("✅ AU credited:", receipt.transactionHash);

        // Save order to prevent re-credit
        orders[orderId] = {
            buyer: buyerWallet,
            auAmount,
            tx: receipt.transactionHash,
            timestamp: Date.now()
        };
        saveOrders(orders);

        return res.status(200).send("Success");
    } catch (err) {
        console.error("❌ Webhook error:", err);
        return res.status(500).send("Server error");
    }
});

// ------------------ SERVE FRONTEND --------------------


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
        '5m': pairData?.txns?.m5 ?? pairData?.txns?.['5m'] ?? null,
        '1h': pairData?.txns?.h1 ?? pairData?.txns?.['1h'] ?? null,
        '6h': pairData?.txns?.h6 ?? null,
        '24h': pairData?.txns?.h24 ?? pairData?.txns?.['24h'] ?? null,
      },
      volume: {
        '5m': pairData?.volume?.m5 ?? pairData?.volume?.['5m'] ?? null,
        '1h': pairData?.volume?.h1 ?? null,
        '6h': pairData?.volume?.h6 ?? null,
        '24h': pairData?.volume?.h24 ?? pairData?.volume?.['24h'] ?? null,
      },
      // in case dexscreener exposes buys/sells split (some versions do)
      buys: {
        '5m': pairData?.buys?.m5 ?? null,
        '1h': pairData?.buys?.h1 ?? null,
        '6h': pairData?.buys?.h6 ?? null,
        '24h': pairData?.buys?.h24 ?? null,
      },
      sells: {
        '5m': pairData?.sells?.m5 ?? null,
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

app.get("/config", (req, res) => {
    return res.json({
        rpc: process.env.POLYGON_RPC,

        tokenContract: process.env.TOKEN_CONTRACT,
        poolAddress: process.env.POOL_ADDRESS,
        vaultAddress: process.env.VAULT_ADDRESS,

        walletconnect: {
            projectId: process.env.WALLETCONNECT_PROJECT_ID
        },

        transak: {
            apiKey: process.env.TRANSAK_API_KEY,
            environment: process.env.TRANSAK_ENV
        },

        google: {
            sheetUrl: process.env.GOOGLE_SHEET_URL
        }
    });
});



app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Autody is running at http://localhost:${PORT}`);
});
