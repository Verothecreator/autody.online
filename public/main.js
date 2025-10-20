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

const AUTODY_ADDRESS = "0xAB94A15E2d1a47069f4c6c33326A242Ba20AbD9B".toLowerCase();
const NETWORK_SLUG   = "eth";
const POOL_ADDRESS   = "0x50f7e4b8a5151996a32aa1f6da9856ffb2240dcd10b1afa72df3530b41f98cd3";

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

// ---- GT fetchers
async function gtFetchPool(){
  const url = `https://api.geckoterminal.com/api/v2/networks/${NETWORK_SLUG}/pools/${POOL_ADDRESS}`;
  const res = await fetch(url,{ headers:{ "Accept":"application/json" }});
  if (!res.ok) throw new Error(`GT pool HTTP ${res.status}`);
  return res.json();
}
async function gtFetchTrades(limit=300){
  const url = `https://api.geckoterminal.com/api/v2/networks/${NETWORK_SLUG}/pools/${POOL_ADDRESS}/trades?limit=${limit}`;
  const res = await fetch(url,{ headers:{ "Accept":"application/json" }});
  if (!res.ok) throw new Error(`GT trades HTTP ${res.status}`);
  return res.json();
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

let cachedTrades = null, tradesTs = 0;
const TRADES_TTL = 50_000; // GT caches ~60s

async function ensureTrades(){
  const now = Date.now();
  if (!cachedTrades || (now - tradesTs) > TRADES_TTL){
    try {
      cachedTrades = await gtFetchTrades(300);
      tradesTs = now;
    } catch (e){
      console.error("fetch trades failed:", e);
      throw e;
    }
  }
  return cachedTrades;
}

// --- CoinGecko + GeckoTerminal unified KPIs (no supply fields) ---
async function fetchFromCoinGecko() {
  const url = `https://api.coingecko.com/api/v3/coins/ethereum/contract/${AUTODY_ADDRESS}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json();
}

async function updateKpis() {
  try {
    // 1️⃣  CoinGecko data (FDV, Market Cap, 24h Vol)
    let cg = null;
    try { cg = await fetchFromCoinGecko(); } 
    catch (e) { console.warn("CoinGecko fetch failed:", e); }

    const md = cg?.market_data || {};
    const cgVol24 = Number(md.total_volume?.usd);
    const cgMCap  = Number(md.market_cap?.usd);
    const cgFDV   = Number(md.fully_diluted_valuation?.usd);

    // 2️⃣  GeckoTerminal liquidity (still the most accurate for DEX pools)
    let gtLiq = null;
    try {
      const pool = await gtFetchPool();
      gtLiq = Number(pool?.data?.attributes?.reserve_in_usd) || null;
    } catch (e) {
      console.warn("GeckoTerminal liquidity fetch failed:", e);
    }

    // 3️⃣  Paint to UI
    if (elKPI.vol24) elKPI.vol24.textContent = Number.isFinite(cgVol24) ? fmtUSD(cgVol24, 0) : "—";
    if (elKPI.liq)   elKPI.liq.textContent   = Number.isFinite(gtLiq)   ? fmtUSD(gtLiq, 0)   : "—";
    if (elKPI.fdv)   elKPI.fdv.textContent   = Number.isFinite(cgFDV)   ? fmtUSD(cgFDV, 0)   : "—";
    if (elKPI.mcap)  elKPI.mcap.textContent  = Number.isFinite(cgMCap)  ? fmtUSD(cgMCap, 0)  : "—";

  } catch (err) {
    console.error("updateKpis failed:", err);
  }
}

// --- auto refresh every minute ---
document.addEventListener("DOMContentLoaded", () => {
  updateKpis();
  setInterval(updateKpis, 60_000);
});

async function updateTimeframe(winKey){
  try {
    const trades = await ensureTrades();
    const agg = aggregateTrades(trades, winKey);

    if (elTF.txn)   elTF.txn.textContent   = agg.txn.toString();
    if (elTF.vol)   elTF.vol.textContent   = fmtUSD(agg.volUSD, 0);
    if (elTF.net)   elTF.net.textContent   = fmtUSD(agg.netBuyUSD, 0);
    if (elTF.buys)  elTF.buys.textContent  = fmtUSD(agg.buysUSD, 0);
    if (elTF.sells) elTF.sells.textContent = fmtUSD(agg.sellsUSD, 0);
  } catch (e){
    console.error("TF update failed:", e);
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
