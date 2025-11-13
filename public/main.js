// ===== Join Community (Google Sheets via JSONP, with status messages) =====
document.addEventListener("DOMContentLoaded", () => {
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbz4OoId6YfogVy_VSoMWM7HR84amjlGb0NZZ9l6lmU1EIjeMw6D7fnbKDBEmvuVF89UYQ/exec";

  const joinBtn    = document.getElementById("join-community-btn");
  const joinPopup  = document.getElementById("join-popup");
  const joinClose  = document.getElementById("join-close");
  const joinForm   = document.getElementById("join-form");
  const joinEmail  = document.getElementById("join-email");
  const joinMsg    = document.getElementById("join-msg");
  const joinSubmit = document.getElementById("join-submit");

  if (!joinBtn) return;

  // Open / close
  joinBtn.addEventListener("click", (e) => {
    e.preventDefault();
    joinPopup.style.display = "flex";
    joinMsg.style.display = "none";
    joinForm.reset();
    joinEmail.focus();
  });
  joinClose.addEventListener("click", () => (joinPopup.style.display = "none"));
  joinPopup.addEventListener("click", (e) => {
    if (e.target === joinPopup) joinPopup.style.display = "none";
  });

  // JSONP helper
  function sendJSONP(url, params, cbName, onComplete) {
    const qs = new URLSearchParams({ ...params, callback: cbName, ts: String(Date.now()) });
    const script = document.createElement("script");
    script.src = `${url}?${qs.toString()}`;
    script.async = true;
    script.onerror = () => {
      onComplete({ status: "error", message: "Network error" });
      cleanup();
    };
    function cleanup() {
      try { script.remove(); } catch {}
      try { delete window[cbName]; } catch {}
    }
    window[cbName] = (data) => {
      onComplete(data || { status: "error" });
      cleanup();
    };
    document.body.appendChild(script);
  }

  // Submit handler
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = joinEmail.value.trim();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!isValid) {
      joinMsg.textContent = "Please enter a valid email address.";
      joinMsg.style.display = "block";
      return;
    }

    joinSubmit.disabled = true;
    joinMsg.textContent = "Submitting…";
    joinMsg.style.display = "block";

    // unique callback name per request
    const cbName = `joinCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    sendJSONP(APPS_SCRIPT_URL, { email }, cbName, (res) => {
      let text = "Something went wrong. Please try again.";
      switch (res.status) {
        case "success":
          text = "Thanks! You’re in. Check your inbox soon.";
          joinForm.reset();
          setTimeout(() => {
            joinPopup.style.display = "none";
            joinMsg.style.display = "none";
          }, 1200);
          break;
        case "duplicate":
          text = "You’re already on the list 👏";
          break;
        case "invalid":
          text = "Invalid email — please check and try again.";
          break;
        case "too_fast":
          text = "Easy there! Please try again in a few seconds.";
          break;
        case "error":
          text = res.message || text;
          break;
      }
      joinMsg.textContent = text;
      joinMsg.style.display = "block";
      joinSubmit.disabled = false;
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const openBtn  = document.getElementById("open-buy-card-btn");
  const popup    = document.getElementById("buy-card-popup");
  const closeBtn = document.getElementById("close-popup");
  const buyBtn   = document.getElementById("buy-autody-btn");

  // Step containers
  const buyStep      = document.getElementById("buy-step");
  const walletStep   = document.getElementById("wallet-step");
  const openWallets  = document.getElementById("open-wallets");
  const walletDisplay= document.getElementById("walletAddressDisplay");

  const usdInput   = document.getElementById("usdAmount");
  const tokenInput = document.getElementById("tokenAmount");

  // --- EIP-6963 Provider Discovery ---
  const discoveredProviders = [];
  window.addEventListener("eip6963:announceProvider", (event) => {
    const { info, provider } = event.detail;
    discoveredProviders.push({ info, provider });
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // --- Helper: Enable/disable Buy button ---
  function updateBuyButtonState() {
    const usdRaw = (usdInput.value || "").toString().replace(/,/g, "");
    const usdValue = parseFloat(usdRaw);
    const wallet   = window.localStorage.getItem("autodyWallet");

    const validUsd = isFinite(usdValue) && usdValue > 0;
    const validWallet = wallet && wallet.length > 0;

    if (validUsd && validWallet) {
      buyBtn.disabled = false;
    } else {
      buyBtn.disabled = true;
    }
  }

  // Initially disabled
  buyBtn.disabled = true;

  // Watch USD input
  usdInput.addEventListener("input", updateBuyButtonState);

  // Also re-check when wallet connects
  document.addEventListener("walletConnected", updateBuyButtonState);

  // Open popup
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    popup.style.display = "flex";
    warmPriceCache().catch(console.error);
  });

  // Close popup
  closeBtn.addEventListener("click", () => {
    popup.style.display = "none";
  });

  // Switch to wallet step
  openWallets.addEventListener("click", () => {
    buyStep.style.display = "none";
    walletStep.style.display = "block";
  });

  // Buy button launches Transak
  buyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    launchTransak();
  });

  // Wallet connect logic (per-button)
  document.querySelectorAll(".wallet-option").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.wallet; 
      try {
        const address = await connectWallet(type, discoveredProviders);
        if (address) {
          walletDisplay.innerText = `Connected: ${address}`;
          window.localStorage.setItem("autodyWallet", address);

          // ✅ trigger custom event for Buy button state
          document.dispatchEvent(new Event("walletConnected"));

          walletStep.style.display = "none";
          buyStep.style.display = "block";
        }
      } catch (err) {
        console.error(`${type} connection failed:`, err);
        alert("Connection failed: " + (err?.message || err));
      }
    });
  });
});

/* ---------------------------
   Wallet selection helpers
--------------------------- */
function findInjectedFor(type, discoveredProviders) {
  const NAME_MAP = {
    metamask:   ["MetaMask"],
    coinbase:   ["Coinbase Wallet", "Coinbase"],
    blockchain: ["Blockchain.com", "Blockchain Wallet"],
    trust:      ["Trust Wallet", "Trust"],
    ledger:     ["Ledger", "Ledger Live"]
  };

  const FLAG_CHECK = {
    metamask:   (p) => p.isMetaMask,
    coinbase:   (p) => p.isCoinbaseWallet,
    blockchain: (p) => p.isBlockchain || p.isBlockchainWallet,
    trust:      (p) => p.isTrust || p.isTrustWallet,
    ledger:     (p) => p.isLedger || p.isLedgerLive
  };

  const wantedNames = NAME_MAP[type] || [];
  for (const { info, provider } of discoveredProviders) {
    if (info?.name && wantedNames.some(n => info.name.toLowerCase().includes(n.toLowerCase()))) {
      return provider;
    }
  }

  const eth = window.ethereum;
  if (!eth) return null;
  const candidates = Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth];
  const checker = FLAG_CHECK[type];
  if (!checker) return null;
  return candidates.find(checker) || null;
}

async function connectViaInjected(injectedProvider) {
  await injectedProvider.request({ method: "eth_requestAccounts" });
  const provider = new ethers.BrowserProvider(injectedProvider);
  const signer = await provider.getSigner();
  return await signer.getAddress();
}

/* ---------------------------
   WalletConnect (QR) setup
--------------------------- */
let wcUniversalProvider = null;
let wcModal = null;

async function ensureWalletConnectReady() {
  const Universal = window.WalletConnectUniversalProvider;
  const ModalLib  = window.WalletConnectModal?.default || window.WalletConnectModal;
  if (!Universal || !ModalLib) {
    throw new Error("WalletConnect scripts not loaded. Make sure universal-provider and modal are included.");
  }

  if (!wcUniversalProvider) {
    wcUniversalProvider = await Universal.init({
      projectId: "69e2560c7b637bd282fec177545d8036", // ✅ your real projectId
      metadata: {
        name: "Autody",
        description: "Autody Token Sale",
        url: window.location.origin,
        icons: ["https://autody-online.onrender.com/favicon.ico"]
      }
    });
  }

  if (!wcModal) {
    wcModal = new ModalLib({
      projectId: "69e2560c7b637bd282fec177545d8036",
      themeMode: "light",
      themeVariables: { "--wcm-z-index": "3000" }
    });
  }
}

async function connectViaWalletConnect() {
  await ensureWalletConnectReady();

  return new Promise(async (resolve, reject) => {
    try {
      wcUniversalProvider.once("display_uri", (uri) => {
        setTimeout(() => wcModal.openModal({ uri }), 100);
      });

      const session = await wcUniversalProvider.connect({
        namespaces: {
          eip155: {
            methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData"],
            chains: ["eip155:1"],
            events: ["chainChanged", "accountsChanged"]
          }
        }
      });

      wcModal.closeModal();

      const caip = session?.namespaces?.eip155?.accounts?.[0];
      const address = caip ? caip.split(":")[2] : null;
      if (!address) throw new Error("No account returned from WalletConnect.");
      resolve(address);
    } catch (e) {
      try { wcModal.closeModal(); } catch (_) {}
      reject(e);
    }
  });
}

/* ---------------------------
   Main connect dispatcher
--------------------------- */
async function connectWallet(type, discoveredProviders) {
  if (type === "walletconnect") {
    return await connectViaWalletConnect();
  }

  const injected = findInjectedFor(type, discoveredProviders);
  if (injected) {
    try {
      return await connectViaInjected(injected);
    } catch (err) {
      console.warn(`${type} extension failed, falling back to QR…`, err);
      return await connectViaWalletConnect();
    }
  }

  return await connectViaWalletConnect();
}

/* ---------------------------
   Transak
--------------------------- */
function launchTransak() {
  const usdRaw = (document.getElementById("usdAmount").value || "").toString().replace(/,/g, "");
  const usdValue = parseFloat(usdRaw);

  if (!isFinite(usdValue) || usdValue <= 0) {
    alert("Please enter a valid USD amount first.");
    return;
  }

  const wallet = window.localStorage.getItem("autodyWallet") || "";
  if (!wallet) {
    alert("Please connect your wallet before buying.");
    return;
  }

  const transak = new TransakSDK.default({
    apiKey: "abb84712-113f-4bc5-9e4a-53495a966676",  // replace with your live key in production
    environment: "STAGING", // change to "PRODUCTION" later
    defaultCryptoCurrency: "AUTODY",
    fiatCurrency: "USD",
    fiatAmount: usdValue,   // ✅ pre-fill USD amount
    walletAddress: wallet,  // ✅ auto-send to connected wallet
    themeColor: "007bff",
    hostURL: window.location.origin,
    redirectURL: window.location.href
  });

  transak.init();
}

/* ---------------------------
   Live USD → AUTODY converter
--------------------------- */
const usdInput   = document.getElementById("usdAmount");
const tokenInput = document.getElementById("tokenAmount");

const AUTODY_ADDRESS = "0xa2746a48211cd3cb0fc6356deb10d79feb792c57".toLowerCase(); // new Polygon contract (lowercased)
const NETWORK_SLUG   = "polygon_pos";   // GeckoTerminal network slug for Polygon (used in GT API endpoints)
const POOL_ADDRESS   = "0x30dA748C76D1c87b2893035b60fDc50a31439d8D"; // new GeckoTerminal pool pair (case preserved)

const POLYGON_RPC = "https://polygon-rpc.com"; // read-only JSON-RPC endpoint

const ABI_V3 = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 obsIndex,uint16 obsCardinality,uint16 obsCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];
const ABI_V2 = [
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];
const ABI_ERC20 = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

async function fetchOnchainPoolPrice(poolAddress, targetTokenAddress) {
  // returns { price: Number, unit: string } where price is decimal number in unit (e.g. "USD" or "USDC" or "MATIC")
  try {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const poolV3 = new ethers.Contract(poolAddress, ABI_V3, provider);

    // try v3 first
    let token0, token1;
    try {
      token0 = (await poolV3.token0()).toLowerCase();
      token1 = (await poolV3.token1()).toLowerCase();
      const slot0 = await poolV3.slot0();
      const sqrtPriceX96 = BigInt(slot0[0].toString()); // BigInt
      // decimals
      const token0c = Number(await (new ethers.Contract(token0, ABI_ERC20, provider)).decimals());
      const token1c = Number(await (new ethers.Contract(token1, ABI_ERC20, provider)).decimals());

      // price = (sqrtPriceX96 ** 2) / 2**192 * (10**(token0c - token1c))
      const numerator = sqrtPriceX96 * sqrtPriceX96; // BigInt
      const denom = BigInt(1) << BigInt(192);
      // compute fractional with Number (may lose tiny precision but fine for UI)
      const raw = Number(numerator) / Number(denom); // token1 per token0 (before decimals adj)
      const price = raw * Math.pow(10, token0c - token1c);

      // determine which side is AUTODY: if target == token0, then price is token1 per 1 token0 → that's quote/token
      const target = targetTokenAddress.toLowerCase();
      const isTargetToken0 = (target === token0);

      let priceInQuote = isTargetToken0 ? price : (1 / price);

      // figure out quote token symbol to return unit
      const quoteTokenAddr = isTargetToken0 ? token1 : token0;
      const quoteToken = new ethers.Contract(quoteTokenAddr, ABI_ERC20, provider);
      let quoteSymbol = "TOKEN";
      try { quoteSymbol = (await quoteToken.symbol()).toUpperCase(); } catch (e) { /* ignore */ }

      // if quoteSymbol is a USD stablecoin, return USD
      if (["USDC","USDT","DAI"].includes(quoteSymbol)) {
        return { price: Number(priceInQuote), unit: "USD" };
      }
      // if quote is WMATIC/WETH -> return price in that asset
      if (["WMATIC","MATIC","WETH","ETH"].includes(quoteSymbol)) {
        return { price: Number(priceInQuote), unit: quoteSymbol };
      }

      // otherwise return raw in quote token units
      return { price: Number(priceInQuote), unit: quoteSymbol };
    } catch (v3Err) {
      // not a v3 pool or v3 read failed; try v2 style
      // console.warn("v3 attempt failed:", v3Err);
      const poolV2 = new ethers.Contract(poolAddress, ABI_V2, provider);
      token0 = (await poolV2.token0()).toLowerCase();
      token1 = (await poolV2.token1()).toLowerCase();
      const res = await poolV2.getReserves();
      const reserve0 = BigInt(res[0].toString());
      const reserve1 = BigInt(res[1].toString());

      const token0c = Number(await (new ethers.Contract(token0, ABI_ERC20, provider)).decimals());
      const token1c = Number(await (new ethers.Contract(token1, ABI_ERC20, provider)).decimals());

      // price token1 per token0 = (reserve1 / reserve0) * 10^(token0c - token1c)
      const rawRatio = Number(reserve1) / Number(reserve0);
      const price = rawRatio * Math.pow(10, token0c - token1c);

      const target = targetTokenAddress.toLowerCase();
      const isTargetToken0 = (target === token0);
      const priceInQuote = isTargetToken0 ? price : (1 / price);

      const quoteTokenAddr = isTargetToken0 ? token1 : token0;
      const quoteToken = new ethers.Contract(quoteTokenAddr, ABI_ERC20, provider);
      let quoteSymbol = "TOKEN";
      try { quoteSymbol = (await quoteToken.symbol()).toUpperCase(); } catch (e) {}

      if (["USDC","USDT","DAI"].includes(quoteSymbol)) {
        return { price: Number(priceInQuote), unit: "USD" };
      }
      if (["WMATIC","MATIC","WETH","ETH"].includes(quoteSymbol)) {
        return { price: Number(priceInQuote), unit: quoteSymbol };
      }
      return { price: Number(priceInQuote), unit: quoteSymbol };
    }
  } catch (err) {
    console.warn("fetchOnchainPoolPrice failed:", err);
    throw err;
  }
}

// helper to convert non-USD quote to USD using CoinGecko (used only if onchain quote is MATIC/ETH)
async function convertQuoteToUSD(amount, unitSymbol) {
  try {
    const map = { "WMATIC": "matic", "MATIC": "matic", "WETH": "weth", "ETH": "ethereum" };
    const slug = map[unitSymbol] || null;
    if (!slug) return null;
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${slug}&vs_currencies=usd`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const priceUsd = j[slug]?.usd;
    if (!isFinite(priceUsd)) return null;
    return Number(amount) * Number(priceUsd);
  } catch (e) {
    return null;
  }
}


let cachedPriceUSD = null;
let lastPriceTs    = 0;
const PRICE_TTL_MS = 10_000;

async function fetchPriceFromGeckoSimple() {
  const url = `https://api.geckoterminal.com/api/v2/simple/networks/${NETWORK_SLUG}/token_price/${AUTODY_ADDRESS}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Gecko simple price HTTP ${res.status}`);
  const json = await res.json();
  const priceStr = json?.data?.attributes?.token_prices?.[AUTODY_ADDRESS];
  const price = priceStr ? parseFloat(priceStr) : null;
  if (!price || !isFinite(price)) throw new Error("No valid price in simple endpoint");
  return price;
}

async function fetchPriceFromPool() {
  const url = `https://api.geckoterminal.com/api/v2/networks/${NETWORK_SLUG}/pools/${POOL_ADDRESS}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Gecko pool price HTTP ${res.status}`);
  const json = await res.json();
  const attrs = json?.data?.attributes || {};
  const candidate =
    Number(attrs.base_token_price_usd) ||
    Number(attrs.quote_token_price_usd) ||
    Number(attrs.token_price_usd);
  if (!candidate || !isFinite(candidate)) throw new Error("No valid price in pool endpoint");
  return candidate;
}

async function getAutodyPriceUSD() {
  const now = Date.now();
  if (cachedPriceUSD && now - lastPriceTs < PRICE_TTL_MS) return cachedPriceUSD;

  // 1) Try on-chain pool direct read (fastest, most live)
  try {
    const onchain = await fetchOnchainPoolPrice(POOL_ADDRESS, AUTODY_ADDRESS);
    if (onchain && isFinite(onchain.price)) {
      if (onchain.unit === "USD") {
        cachedPriceUSD = onchain.price;
        lastPriceTs = now;
        return cachedPriceUSD;
      }
      // if unit is MATIC/WETH/etc convert to USD via CoinGecko
      if (["WMATIC","MATIC","WETH","ETH"].includes(onchain.unit)) {
        const conv = await convertQuoteToUSD(onchain.price, onchain.unit);
        if (conv && isFinite(conv)) {
          cachedPriceUSD = conv;
          lastPriceTs = now;
          return cachedPriceUSD;
        }
      }
      // otherwise we don't have a USD valuation for the quote token — fall back
      console.warn("Onchain returned non-USD quote:", onchain);
    }
  } catch (e) {
    console.warn("Onchain pool price failed, falling back to GT/CoinGecko:", e?.message || e);
  }

  // 2) Fallback: original approach (GeckoTerminal simple -> pool)
  try {
    const p = await fetchPriceFromGeckoSimple();
    cachedPriceUSD = p; lastPriceTs = now; return p;
  } catch (e1) {
    console.warn("Simple price failed:", e1?.message || e1);
    try {
      const p2 = await fetchPriceFromPool();
      cachedPriceUSD = p2; lastPriceTs = now; return p2;
    } catch (e2) {
      console.error("Pool price failed:", e2?.message || e2);
      return null;
    }
  }
}


let debounceTimer = null;
function debounce(fn, wait = 250) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, wait);
}

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
    tokenInput.value = autodyAmount.toFixed(6);
  });
});

setInterval(async () => {
  const usdRaw = (usdInput.value || "").toString().replace(/,/g, "");
  const usdValue = parseFloat(usdRaw);
  if (!isFinite(usdValue) || usdValue <= 0) return;
  const price = await getAutodyPriceUSD();
  if (!price) return;
  const autodyAmount = usdValue / price;
  tokenInput.value = autodyAmount.toFixed(6);
}, PRICE_TTL_MS);

async function warmPriceCache() {
  await getAutodyPriceUSD();
}

// ======== AUTODY Pool Stats (v2) ========

// ---- format helpers
const fmtUSD  = (n, fd=0)=> (n==null||!isFinite(n)) ? "—"
  : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:fd}).format(n);
const fmtUSDc = (n)=>fmtUSD(n,6);

// ----------------- Dexscreener client (frontend) -----------------
const DEX_CACHE_TTL = 30_000; // ms
let cachedDex = null, cachedDexTs = 0;

// call our server proxy /api/dex/pair?pair=<POOL_ADDRESS>
async function fetchDexPair() {
  const now = Date.now();
  if (cachedDex && (now - cachedDexTs) < DEX_CACHE_TTL) return cachedDex;

  const url = `/api/dex/pair?pair=${encodeURIComponent(POOL_ADDRESS)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }});
    if (!res.ok) {
      const text = await res.text().catch(()=>"<no body>");
      throw new Error(`Dex proxy HTTP ${res.status} : ${text}`);
    }
    const json = await res.json();
    if (!json || !json.success) throw new Error("Invalid dex proxy response");
    cachedDex = json;
    cachedDexTs = Date.now();
    return cachedDex;
  } catch (err) {
    console.warn("[Dex] fetch failed:", err?.message || err);
    // don't throw, let callers handle null
    return null;
  }
}


// ---- aggregate trades into time windows
const WINDOWS_MIN = { "5m":5, "1h":60, "6h":360, "24h":1440 };
function cutoffForWindow(winKey){ return Date.now() - (WINDOWS_MIN[winKey]||5)*60*1000; }

function aggregateTrades(tradesJson, winKey){
  const cutoff = cutoffForWindow(winKey);
  const list = tradesJson?.data || [];
  let txn=0, vol=0, buys=0, sells=0;

  for (const t of list){
    const a   = t?.attributes || {};
    const ts  = a.block_timestamp ? new Date(a.block_timestamp).getTime() : 0;
    if (ts < cutoff) continue;

    const side = String(a.trade_type||"").toLowerCase();       // "buy" or "sell"
    const usd  = Number(a.amount_usd ?? a.total_value_usd ?? 0);
    if (!isFinite(usd) || usd <= 0) continue;

    txn += 1; vol += usd;
    if (side === "buy") buys += usd;
    else if (side === "sell") sells += usd;
  }
  return { txn, volUSD: vol, buysUSD: buys, sellsUSD: sells, netBuyUSD: buys - sells };
}

// ---- DOM refs
const elTF = {
  txn:   document.getElementById("tf-txn"),
  vol:   document.getElementById("tf-vol"),
  net:   document.getElementById("tf-net"),
  buys:  document.getElementById("tf-buys"),
  sells: document.getElementById("tf-sells"),
};
const elKPI = {
  vol24: document.getElementById("kpi-vol24"),
  liq:   document.getElementById("kpi-liq"),
  fdv:   document.getElementById("kpi-fdv"),
  mcap:  document.getElementById("kpi-mcap"),
};

let cachedTradesProxy = null, tradesProxyTs = 0;
const TRADES_TTL = 50_000;

async function ensureTrades(){
  const now = Date.now();
  if (cachedTradesProxy && (now - tradesProxyTs) <= TRADES_TTL) return cachedTradesProxy;

  const tradesJson = await gtFetchTrades(500);
  if (tradesJson) {
    cachedTradesProxy = tradesJson;
    tradesProxyTs = now;
    return cachedTradesProxy;
  }

  // trades endpoint failed via proxy -> explicit null (so callers use fallback)
  cachedTradesProxy = null;
  tradesProxyTs = now;
  return null;
}

// ---------- CoinGecko (polygon) + GeckoTerminal KPI updater ----------
// ---------- CoinGecko (polygon) with detailed error logging ----------
async function fetchFromCoinGecko() {
  const url = `https://api.coingecko.com/api/v3/coins/polygon-pos/contract/${AUTODY_ADDRESS}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  console.log("[CG] Requesting CoinGecko:", url);
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" }});
    console.log("[CG] HTTP status:", res.status);
    if (!res.ok) {
      // try to capture body for debugging (CoinGecko sometimes returns HTML or a short JSON)
      let bodyText = "";
      try { bodyText = await res.text(); } catch (e) { bodyText = "<failed to read body>"; }
      console.warn(`[CG] non-OK response: ${res.status} - body:`, bodyText);
      throw new Error(`CG HTTP ${res.status}`);
    }
    const json = await res.json();
    console.log("[CG] response keys:", Object.keys(json || {}));
    return json;
  } catch (err) {
    console.warn("[CG] fetch failed:", err?.message || err);
    throw err;
  }
}

async function fetchGtPool() {
  const url = `https://api.geckoterminal.com/api/v2/networks/${NETWORK_SLUG}/pools/${POOL_ADDRESS}`;
  console.log("[GT] Requesting pool:", url);
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    console.log("[GT] HTTP status:", res.status);
    if (!res.ok) throw new Error(`GT HTTP ${res.status}`);
    const json = await res.json();
    console.log("[GT] response keys:", Object.keys(json || {}));
    return json;
  } catch (err) {
    console.warn("[GT] fetch failed:", err?.message || err);
    throw err;
  }
}


// ======= GT-First KPI updater (use GT attributes directly) =======
async function updateKpis() {
  try {
    // immediate UI feedback
    if (elKPI.vol24) elKPI.vol24.textContent = "Loading…";
    if (elKPI.liq)   elKPI.liq.textContent   = "Loading…";
    if (elKPI.fdv)   elKPI.fdv.textContent   = "Loading…";
    if (elKPI.mcap)  elKPI.mcap.textContent  = "Loading…";

    // 1) GT pool (fast, authoritative for reserves/FDV)
    let poolJson = null;
    try {
      poolJson = await gtFetchPool();
    } catch (e) {
      console.warn("[updateKpis] GT pool fetch failed:", e?.message || e);
      poolJson = null;
    }
    const attrs = poolJson?.data?.attributes || {};

    // extract what GT provides (may be null for v3)
    let reserveUsd = Number(attrs.reserve_in_usd ?? attrs.reserve0_in_usd ?? attrs.reserve_in_usd_total ?? 0) || null;
    let vol24 = Number(attrs.volume_usd ?? attrs.volume_in_usd ?? attrs.total_volume_usd ?? 0) || null;
    let fdv = Number(attrs.fdv_usd ?? attrs.fdv ?? 0) || null;
    let mcap = Number(attrs.market_cap_usd ?? attrs.market_cap ?? 0) || null;

    // Extract GT price-change percent if present
    let priceChange24 = null;
    const pcp = attrs.price_change_percentage;
    if (pcp != null) {
      if (typeof pcp === "object") priceChange24 = Number(pcp.h24 ?? pcp['24h'] ?? pcp.h24);
      else priceChange24 = Number(pcp);
      if (!isFinite(priceChange24)) priceChange24 = null;
    }

    // 2) If GT did not provide 24h volume (common for Uniswap v3), try Uniswap subgraph fallback
    if (!vol24) {
      console.log("[updateKpis] GT vol24 missing or null — trying Uniswap subgraph fallback...");
      const uni = await fetchUniPool();
      if (uni) {
        // uni.volumeUSD is usually a string or number
        const uniVol = Number(uni.volumeUSD ?? uni.volumeUsd ?? 0) || null;
        const uniTVL = Number(uni.totalValueLockedUSD ?? uni.totalValueLockedUsd ?? 0) || null;
        if (uniVol) vol24 = uniVol;
        if (!reserveUsd && uniTVL) reserveUsd = uniTVL;
        // try txCount if you want later
        console.log("[updateKpis] uni fallback vol:", uniVol, "tvl:", uniTVL);
      } else {
        console.log("[updateKpis] uni fallback not available");
      }
    }

    // 3) CoinGecko supplement (only if you still want FDV/mcap fallback)
    // Keep the coinGecko call, but be tolerant to failures and log fully (fetchFromCoinGecko already logs)
    let cg = null;
    try {
      cg = await fetchFromCoinGecko();
    } catch (e) {
      // coinGecko often 404s for new tokens; we already log full body in fetchFromCoinGecko
      cg = null;
    }
    const md = cg?.market_data || {};
    const cgVol24 = Number(md.total_volume?.usd) || null;
    const cgMCap  = Number(md.market_cap?.usd) || null;
    const cgFDV   = Number(md.fully_diluted_valuation?.usd) || null;

    // choose final values — prefer GT/UNI, then CG as supplement
    const finalVol24 = (vol24 && isFinite(vol24) && vol24 > 0) ? vol24 : (Number.isFinite(cgVol24) ? cgVol24 : null);
    const finalLiq   = (reserveUsd && isFinite(reserveUsd) && reserveUsd > 0) ? reserveUsd : null;
    const finalFDV   = Number.isFinite(fdv) && fdv > 0 ? fdv : (Number.isFinite(cgFDV) ? cgFDV : null);
    const finalMCap  = Number.isFinite(mcap) && mcap > 0 ? mcap : (Number.isFinite(cgMCap) ? cgMCap : null);

    console.log("[updateKpis] finalVol24:", finalVol24, "finalLiq:", finalLiq, "finalFDV:", finalFDV, "finalMCap:", finalMCap, "pcp24:", priceChange24);

    // Render UI
    if (elKPI.vol24) elKPI.vol24.textContent = finalVol24 ? fmtUSD(finalVol24, 0) : "—";
    if (elKPI.liq)   elKPI.liq.textContent   = finalLiq   ? fmtUSD(finalLiq, 0)   : "—";
    if (elKPI.fdv)   elKPI.fdv.textContent   = finalFDV   ? fmtUSD(finalFDV, 0)   : "—";
    if (elKPI.mcap)  elKPI.mcap.textContent  = finalMCap  ? fmtUSD(finalMCap, 0)  : "—";

    // update percent badge
    const pctEl = document.getElementById("pct-h24");
    if (pctEl) {
      if (priceChange24 != null) {
        const n = Number(priceChange24);
        const sign = n > 0 ? "+" : (n < 0 ? "" : "");
        pctEl.textContent = `${sign}${n.toFixed(2)}%`;
        pctEl.classList.toggle("pct-pos", n > 0);
        pctEl.classList.toggle("pct-neg", n < 0);
      } else {
        pctEl.textContent = "0%";
        pctEl.classList.remove("pct-pos","pct-neg");
      }
    }

  } catch (err) {
    console.error("[updateKpis] fatal error:", err);
    if (elKPI.vol24) elKPI.vol24.textContent = "—";
    if (elKPI.liq)   elKPI.liq.textContent   = "—";
    if (elKPI.fdv)   elKPI.fdv.textContent   = "—";
    if (elKPI.mcap)  elKPI.mcap.textContent  = "—";
  }
}

// ---------- Uniswap v3 subgraph fallback (server -> subgraph) ----------
async function fetchUniPool() {
  // server route: /api/uni/pool?pool=<POOL_ADDRESS>
  const url = `/api/uni/pool?pool=${POOL_ADDRESS}`;
  console.log("[UNI] Requesting Uniswap subgraph (proxy):", url);
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" }});
    console.log("[UNI] HTTP status:", res.status);
    if (!res.ok) {
      const t = await res.text().catch(()=>"<no body>");
      console.warn("[UNI] non-OK response:", res.status, t);
      return null;
    }
    const json = await res.json();
    console.log("[UNI] pool keys:", Object.keys(json || {}));
    return json;
  } catch (err) {
    console.warn("[UNI] fetch failed:", err?.message || err);
    return null;
  }
}


// ensure regular refresh (keep your existing DOMContentLoaded wiring)

// Kick off initial update + periodic refresh every 30s (GT caches frequently)
document.addEventListener("DOMContentLoaded", () => {
  updateKpis();
  setInterval(updateKpis, 30_000);
});

async function updateTimeframe(winKey){
  try {
    // Map incoming keys to dexscreener naming
    const map = {
      "m5": ['5m','m5'],
      "m15": ['15m','m15'],
      "m30": ['30m','m30'],
      "h1": ['1h','h1'],
      "h6": ['6h','h6'],
      "h24": ['24h','h24']
    };
    const candidates = map[winKey] || map['h24'];

    const dex = await fetchDexPair();
    if (!dex) {
      // no dex data -> leave dashes
      if (elTF.txn)   elTF.txn.textContent   = "—";
      if (elTF.vol)   elTF.vol.textContent   = "—";
      if (elTF.net)   elTF.net.textContent   = "—";
      if (elTF.buys)  elTF.buys.textContent  = "—";
      if (elTF.sells) elTF.sells.textContent = "—";
      return;
    }
    const s = dex.summary || {};
    const raw = dex.raw?.pair || dex.raw?.pairs?.[0] || {};

    // prefer summary.volume and summary.txns if present
    let vol = null, txn = null, buys = null, sells = null;
    for (const k of candidates) {
      vol = vol ?? (s.volume && s.volume[k]) ?? (raw.volume && (raw.volume[k] ?? raw.volume?.[k]));
      txn = txn ?? (s.txns && s.txns[k]) ?? (raw.txns && (raw.txns[k] ?? raw.txns?.[k]));
      buys = buys ?? (s.buys && s.buys[k]) ?? (raw.txns && raw.txns[k] && raw.txns[k].buys) ?? null;
      sells = sells ?? (s.sells && s.sells[k]) ?? (raw.txns && raw.txns[k] && raw.txns[k].sells) ?? null;
    }

    // normalize values: dexscreener sometimes returns numbers or objects; try to extract USD numeric values
    const getNumber = v => {
      if (v == null) return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = Number(v.replace(/[^0-9.-]+/g,'')); // strip $ etc
        return isFinite(n) ? n : null;
      }
      if (typeof v === 'object') {
        // maybe { buys: N, sells: N } or { usd: N}
        if (v.usd != null) return Number(v.usd);
        if (v.volume_usd != null) return Number(v.volume_usd);
      }
      return null;
    };

    const volNum = getNumber(vol);
    const buysNum = getNumber(buys);
    const sellsNum = getNumber(sells);
    const txnNum = (typeof txn === 'number') ? txn : (typeof txn === 'string' && /^\d+$/.test(txn) ? Number(txn) : null);

    if (elTF.txn)   elTF.txn.textContent   = txnNum != null ? txnNum.toString() : "—";
    if (elTF.vol)   elTF.vol.textContent   = volNum != null ? fmtUSD(volNum,0) : "—";
    if (elTF.net)   elTF.net.textContent   = (buysNum!=null || sellsNum!=null) ? fmtUSD((buysNum||0)-(sellsNum||0),0) : "—";
    if (elTF.buys)  elTF.buys.textContent  = buysNum != null ? fmtUSD(buysNum,0) : "—";
    if (elTF.sells) elTF.sells.textContent = sellsNum != null ? fmtUSD(sellsNum,0) : "—";

  } catch (e) {
    console.error("updateTimeframe failed:", e);
    if (elTF.txn)   elTF.txn.textContent   = "—";
    if (elTF.vol)   elTF.vol.textContent   = "—";
    if (elTF.net)   elTF.net.textContent   = "—";
    if (elTF.buys)  elTF.buys.textContent  = "—";
    if (elTF.sells) elTF.sells.textContent = "—";
  }
}

// ---- Tabs (default = 24H)
function wireTabs(){
  const tabs = document.querySelectorAll("#gt-tabs .gt-tab");
  let current = "24h"; // default requested

  const setActive = (key)=>{
    tabs.forEach(b=>b.classList.toggle("active", b.dataset.win===key));
  };

  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.dataset.win;
      current = key;
      setActive(current);
      updateTimeframe(current);
    });
  });

  // first paint
  setActive(current);
  updateTimeframe(current);
  updateKpis();

  // refresh every minute (GT cache window)
  setInterval(()=>updateTimeframe(current), 60_000);
  setInterval(updateKpis, 60_000);
}

document.addEventListener("DOMContentLoaded", wireTabs);

// ====== Percentages under tabs + 15m/30m menu + dynamic labels ======

// Map of our windows to minutes for trade aggregation, and to GT price-change keys.
const WIN_DEFS = {
  m5:  { mins: 5,   pctKey: "m5",  label: "5M"  },
  m15: { mins: 15,  pctKey: "m15", label: "15m" },
  m30: { mins: 30,  pctKey: "m30", label: "30m" },
  h1:  { mins: 60,  pctKey: "h1",  label: "1H"  },
  h6:  { mins: 360, pctKey: "h6",  label: "6H"  },
  h24: { mins: 1440,pctKey: "h24", label: "24H" },
};

// Update the % badges under each tab from GT pool attributes.price_change_percentage
async function updateTabPercents(){
  try {
    const pool = await gtFetchPool();
    const a = pool?.data?.attributes || {};
    const pcp = a?.price_change_percentage || {};
    const setPct = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (val == null || !isFinite(Number(val))) { el.textContent = "0%"; el.classList.remove("pct-pos","pct-neg"); return; }
      const n = Number(val);
      const sign = n > 0 ? "+" : (n < 0 ? "" : "");
      el.textContent = `${sign}${n.toFixed(2)}%`;
      el.classList.toggle("pct-pos", n > 0);
      el.classList.toggle("pct-neg", n < 0);
    };
    setPct("pct-m5",  pcp.m5);
    setPct("pct-m15", pcp.m15);
    setPct("pct-m30", pcp.m30);
    setPct("pct-h1",  pcp.h1);
    setPct("pct-h6",  pcp.h6);
    setPct("pct-h24", pcp.h24);
  } catch (e){
    console.warn("updateTabPercents failed:", e);
  }
}

// Label helpers for Txn/Vol headings
const lblTxn = document.getElementById("lbl-txn");
const lblVol = document.getElementById("lbl-vol");

function setWindowLabels(key){
  const def = WIN_DEFS[key] || WIN_DEFS.h24;
  if (lblTxn) lblTxn.textContent = `${def.label} Txn`;
  if (lblVol) lblVol.textContent = `${def.label} Vol`;
}

// Adjust existing aggregator to accept custom window mins
function cutoffForCustom(mins){
  return Date.now() - mins*60*1000;
}
function aggregateTradesFor(tradesJson, mins){
  const cutoff = cutoffForCustom(mins);
  const list = tradesJson?.data || [];
  let txn=0, vol=0, buys=0, sells=0;

  for (const t of list){
    const a   = t?.attributes || {};
    const ts  = a.block_timestamp ? new Date(a.block_timestamp).getTime() : 0;
    if (ts < cutoff) continue;

    const side = String(a.trade_type||"").toLowerCase();       // "buy" or "sell"
    const usd  = Number(a.amount_usd ?? a.total_value_usd ?? 0);
    if (!isFinite(usd) || usd <= 0) continue;

    txn += 1; vol += usd;
    if (side === "buy") buys += usd;
    else if (side === "sell") sells += usd;
  }
  return { txn, volUSD:vol, buysUSD:buys, sellsUSD:sells, netBuyUSD:buys - sells };
}

// Wire the tabs + more menu; default = 24H
function wireEnhancedTabs(){
  const tabsRow   = document.getElementById("gt-tabs");
  if (!tabsRow) return;

  const menuBtn   = document.getElementById("gt-more-btn");
  const menu      = document.getElementById("gt-more-menu");
  let currentKey  = "h24";

  // open/close menu
  if (menuBtn && menu){
    menuBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      menu.style.display = (menu.style.display === "none" || !menu.style.display) ? "block" : "none";
    });
    document.addEventListener("click", (e)=>{
      if (!menu.contains(e.target) && e.target !== menuBtn) menu.style.display = "none";
    });
  }

  function setActive(key){
    document.querySelectorAll("#gt-tabs .gt-tab").forEach(btn=>{
      if (btn.dataset?.win) btn.classList.toggle("active", btn.dataset.win === key);
    });
  }

  async function onSelect(key){
    currentKey = key;
    const def = WIN_DEFS[key] || WIN_DEFS.h24;
    setActive(key);
    setWindowLabels(key);
    // Trades
    try {
      const trades = await ensureTrades(); // you already have ensureTrades()
      const agg = aggregateTradesFor(trades, def.mins);
      document.getElementById("tf-txn").textContent   = agg.txn.toString();
      document.getElementById("tf-vol").textContent   = fmtUSD(agg.volUSD, 0);
      document.getElementById("tf-net").textContent   = fmtUSD(agg.netBuyUSD, 0);
      document.getElementById("tf-buys").textContent  = fmtUSD(agg.buysUSD, 0);
      document.getElementById("tf-sells").textContent = fmtUSD(agg.sellsUSD, 0);
    } catch (e){
      console.warn("trade agg failed:", e);
    }
  }

  // Clicks for visible tabs
  tabsRow.querySelectorAll(".gt-tab[data-win]").forEach(btn=>{
    btn.addEventListener("click", ()=> onSelect(btn.dataset.win));
  });
  // Clicks inside menu
  menu?.querySelectorAll(".gt-menu-item[data-win]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      onSelect(btn.dataset.win);
      menu.style.display = "none";
    });
  });

  // initial paint + periodic refresh
  setActive(currentKey);
  setWindowLabels(currentKey);
  onSelect(currentKey);
  updateTabPercents();
  setInterval(()=>onSelect(currentKey), 60_000);
  setInterval(updateTabPercents, 60_000);
}

// boot
document.addEventListener("DOMContentLoaded", wireEnhancedTabs);
