document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("open-buy-card-btn");
  const popup = document.getElementById("buy-card-popup");
  const closeBtn = document.getElementById("close-popup");
  const buyBtn = document.getElementById("buy-autody-btn");

  // Open popup
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    popup.style.display = "flex";

    // Preload price so the first keystroke feels instant
    warmPriceCache().catch(console.error);
  });

  // Close popup
  closeBtn.addEventListener("click", () => {
    popup.style.display = "none";
  });

  // Buy button launches Transak
  buyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    launchTransak();
  });
});

function launchTransak() {
  const transak = new TransakSDK.default({
    apiKey: "abb84712-113f-4bc5-9e4a-53495a966676", // test key
    environment: "STAGING",
    defaultCryptoCurrency: "AUTODY",
    fiatCurrency: "USD",
    walletAddress: "0xUSER_WALLET_ADDRESS", // replace later
    themeColor: "007bff",
    hostURL: window.location.origin,
    redirectURL: window.location.href,
  });

  transak.init();
}

// ---------------------------
// Live USD → AUTODY converter
// ---------------------------
const usdInput   = document.getElementById("usdAmount");
const tokenInput = document.getElementById("tokenAmount");

// Your token + network
const AUTODY_ADDRESS = "0xAB94A15E2d1a47069f4c6c33326A242Ba20AbD9B".toLowerCase();
const NETWORK_SLUG   = "eth"; // GeckoTerminal network id for Ethereum
const POOL_ADDRESS   = "0x50f7e4b8a5151996a32aa1f6da9856ffb2240dcd10b1afa72df3530b41f98cd3";

// Local price cache so we don’t spam the API
let cachedPriceUSD = null;     // USD per 1 AUTODY
let lastPriceTs    = 0;        // ms
const PRICE_TTL_MS = 10_000;   // refresh every 10s

// Primary: simple token price endpoint (fast + CORS friendly)
async function fetchPriceFromGeckoSimple() {
  const url = `https://api.geckoterminal.com/api/v2/simple/networks/${NETWORK_SLUG}/token_price/${AUTODY_ADDRESS}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Gecko simple price HTTP ${res.status}`);
  const json = await res.json();
  const priceStr = json?.data?.attributes?.token_prices?.[AUTODY_ADDRESS];
  const price = priceStr ? parseFloat(priceStr) : null;
  if (!price || !isFinite(price)) throw new Error("No valid price in simple endpoint");
  return price;
}

// Fallback: pool endpoint (if simple endpoint ever fails)
async function fetchPriceFromPool() {
  const url = `https://api.geckoterminal.com/api/v2/networks/${NETWORK_SLUG}/pools/${POOL_ADDRESS}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Gecko pool price HTTP ${res.status}`);
  const json = await res.json();

  // GeckoTerminal returns both sides; prefer the AUTODY price in USD if present.
  // Try common fields; if structure changes, we still fail gracefully.
  const attrs = json?.data?.attributes || {};
  // Some pools expose `base_token_price_usd` / `quote_token_price_usd`.
  // If AUTODY is base token in this pool, use base; otherwise try the "token_price_usd".
  const candidate =
    Number(attrs.base_token_price_usd) ||
    Number(attrs.quote_token_price_usd) ||
    Number(attrs.token_price_usd);

  if (!candidate || !isFinite(candidate)) throw new Error("No valid price in pool endpoint");
  return candidate;
}

// Get price with cache + fallback
async function getAutodyPriceUSD() {
  const now = Date.now();
  if (cachedPriceUSD && now - lastPriceTs < PRICE_TTL_MS) {
    return cachedPriceUSD;
  }

  try {
    const p = await fetchPriceFromGeckoSimple();
    cachedPriceUSD = p;
    lastPriceTs = now;
    // console.log("Price (simple):", p);
    return p;
  } catch (e1) {
    console.warn("Simple price failed, trying pool endpoint:", e1?.message || e1);
    try {
      const p2 = await fetchPriceFromPool();
      cachedPriceUSD = p2;
      lastPriceTs = now;
      // console.log("Price (pool):", p2);
      return p2;
    } catch (e2) {
      console.error("Pool price failed:", e2?.message || e2);
      return null;
    }
  }
}

// Debounce user input to avoid rate limiting
let debounceTimer = null;
function debounce(fn, wait = 250) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, wait);
}

// Convert on input
usdInput.addEventListener("input", () => {
  debounce(async () => {
    const usdRaw = (usdInput.value || "").toString().replace(/,/g, "");
    const usdValue = parseFloat(usdRaw);
    if (!isFinite(usdValue) || usdValue <= 0) {
      tokenInput.value = "";
      return;
    }

    const price = await getAutodyPriceUSD();
    if (!price) {
      tokenInput.value = "";
      tokenInput.placeholder = "Price unavailable";
      return;
    }

    const autodyAmount = usdValue / price;
    tokenInput.value = autodyAmount.toFixed(6); // more precision for large USD values
  });
});

// Keep conversion fresh if price moves while the user pauses typing
setInterval(async () => {
  const usdRaw = (usdInput.value || "").toString().replace(/,/g, "");
  const usdValue = parseFloat(usdRaw);
  if (!isFinite(usdValue) || usdValue <= 0) return;

  const price = await getAutodyPriceUSD();
  if (!price) return;

  const autodyAmount = usdValue / price;
  tokenInput.value = autodyAmount.toFixed(6);
}, PRICE_TTL_MS);

// Preload on popup open
async function warmPriceCache() {
  await getAutodyPriceUSD();
}

// ---------------------------
// Wallet Connect Integration
// ---------------------------
import { EthereumClient, w3mConnectors, w3mProvider } from "@web3modal/ethereum";
import { Web3Modal } from "@web3modal/html";

// 1. Your project ID from WalletConnect Cloud (free signup at https://cloud.walletconnect.com)
const projectId = "YOUR_WALLETCONNECT_PROJECT_ID";  

// 2. Ethereum chains you support (Autody is on Ethereum first)
const chains = [{
  id: 1,
  name: "Ethereum",
  network: "mainnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://eth.llamarpc.com"] // reliable free RPC
}];

// 3. Ethereum client
const ethereumClient = new EthereumClient(w3mConnectors({ projectId, version: 2 }), w3mProvider({ projectId }), chains);

// 4. Modal instance
const web3modal = new Web3Modal({ projectId }, ethereumClient);

// ---------------------------
// Connect Wallet Button Logic
// ---------------------------
const connectBtn = document.getElementById("connectWalletBtn");
const walletDisplay = document.getElementById("walletAddressDisplay");

connectBtn.addEventListener("click", async () => {
  try {
    await web3modal.openModal(); // opens modal (like your picture)
    
    // After connect, get signer
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    walletDisplay.innerText = `Connected: ${address}`;
    
    // Optional: inject into Transak
    window.localStorage.setItem("autodyWallet", address);
  } catch (err) {
    console.error("Wallet connection failed:", err);
  }
});

