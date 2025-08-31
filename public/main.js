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

  // --- EIP-6963 Provider Discovery (robust multi-injected detection) ---
  const discoveredProviders = [];
  window.addEventListener("eip6963:announceProvider", (event) => {
    const { info, provider } = event.detail;
    discoveredProviders.push({ info, provider });
  });
  // Ask wallets to announce themselves
  window.dispatchEvent(new Event("eip6963:requestProvider"));

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
      const type = btn.dataset.wallet; // metamask | coinbase | blockchain | trust | ledger | walletconnect
      try {
        const address = await connectWallet(type, discoveredProviders);
        if (address) {
          walletDisplay.innerText = `Connected: ${address}`;
          window.localStorage.setItem("autodyWallet", address);
          // Auto-return to buy step
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

// Try to find the exact injected provider for the chosen wallet using EIP-6963 info.name,
// then fall back to window.ethereum.providers flags.
// If nothing found for that specific wallet, we return null (caller will use WalletConnect).
function findInjectedFor(type, discoveredProviders) {
  // Name matches (EIP-6963)
  const NAME_MAP = {
    metamask:   ["MetaMask"],
    coinbase:   ["Coinbase Wallet", "Coinbase"],
    blockchain: ["Blockchain.com", "Blockchain.com Wallet", "Blockchain Wallet"],
    trust:      ["Trust Wallet", "Trust"],
    ledger:     ["Ledger", "Ledger Live"]
  };

  // Flag checks (legacy)
  const FLAG_CHECK = {
    metamask:   (p) => p.isMetaMask,
    coinbase:   (p) => p.isCoinbaseWallet,
    blockchain: (p) => p.isBlockchain || p.isBlockchainWallet,
    trust:      (p) => p.isTrust || p.isTrustWallet,
    ledger:     (p) => p.isLedger || p.isLedgerLive
  };

  // 1) Try EIP-6963 discovered providers by name
  const wantedNames = NAME_MAP[type] || [];
  for (const { info, provider } of discoveredProviders) {
    if (info?.name && wantedNames.some(n => info.name.toLowerCase().includes(n.toLowerCase()))) {
      return provider;
    }
  }

  // 2) Try flags on window.ethereum/providers
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
  // UMD globals provided by the <script> tags:
  const Universal = window.WalletConnectUniversalProvider;
  const ModalLib  = window.WalletConnectModal;
  if (!Universal || !ModalLib) {
    throw new Error("WalletConnect scripts not loaded. Make sure the 2 <script> tags are included.");
  }
  if (!wcUniversalProvider) {
    wcUniversalProvider = await Universal.init({
      projectId: "YOUR_PROJECT_ID", // 👉 get from https://cloud.walletconnect.com
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
      projectId: "YOUR_PROJECT_ID",
      themeMode: "light",
      // optional: stack above your popup
      themeVariables: { "--wcm-z-index": "3000" }
    });
  }
}

async function connectViaWalletConnect() {
  await ensureWalletConnectReady();

  return new Promise(async (resolve, reject) => {
    try {
      // Show QR when URI is ready
      wcUniversalProvider.once("display_uri", (uri) => {
        wcModal.openModal({ uri });
      });

      const session = await wcUniversalProvider.connect({
        namespaces: {
          eip155: {
            methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData"],
            chains: ["eip155:1"], // Ethereum mainnet
            events: ["chainChanged", "accountsChanged"]
          }
        }
      });

      // Close QR modal once connected
      wcModal.closeModal();

      // Extract first account address from CAIP-10 string "eip155:1:0xabc..."
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
  // WalletConnect button is always QR
  if (type === "walletconnect") {
    return await connectViaWalletConnect();
  }

  // For specific wallets: try that wallet’s own injected provider first
  const injected = findInjectedFor(type, discoveredProviders);
  if (injected) {
    try {
      return await connectViaInjected(injected);
    } catch (err) {
      console.warn(`${type} injected connect failed, falling back to QR…`, err);
      return await connectViaWalletConnect();
    }
  }

  // No matching extension → QR fallback
  return await connectViaWalletConnect();
}

/* ---------------------------
   Transak
--------------------------- */
function launchTransak() {
  const transak = new TransakSDK.default({
    apiKey: "abb84712-113f-4bc5-9e4a-53495a966676", // test key
    environment: "STAGING",
    defaultCryptoCurrency: "AUTODY",
    fiatCurrency: "USD",
    walletAddress: window.localStorage.getItem("autodyWallet") || "",
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
