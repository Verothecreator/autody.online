// ===== Join Community (Email capture connected to Google Sheets) =====
document.addEventListener("DOMContentLoaded", () => {
  const joinBtn   = document.getElementById("join-community-btn");
  const joinPopup = document.getElementById("join-popup");
  const joinClose = document.getElementById("join-close");
  const joinForm  = document.getElementById("join-form");
  const joinEmail = document.getElementById("join-email");
  const joinMsg   = document.getElementById("join-msg");

  if (!joinBtn) return; // safety

  // Open popup
  joinBtn.addEventListener("click", (e) => {
    e.preventDefault();
    joinPopup.style.display = "flex";
    joinMsg.style.display = "none";
    joinForm.reset();
    joinEmail.focus();
  });

  // Close popup (X)
  joinClose.addEventListener("click", () => {
    joinPopup.style.display = "none";
  });

  // Close when clicking the backdrop
  joinPopup.addEventListener("click", (e) => {
    if (e.target === joinPopup) joinPopup.style.display = "none";
  });

  // Form submit handler
  joinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = joinEmail.value.trim();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!isValid) {
      joinMsg.textContent = "Please enter a valid email address.";
      joinMsg.style.display = "block";
      return;
    }

    try {
      // ✅ Send email to your Google Apps Script endpoint
      await fetch("https://script.google.com/macros/s/AKfycbz4OoId6YfogVy_VSoMWM7HR84amjlGb0NZZ9l6lmU1EIjeMw6D7fnbKDBEmvuVF89UYQ/exec", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email })
      });

      // ✅ Success feedback
      joinMsg.textContent = "Thanks! You’re in. Check your inbox soon.";
      joinMsg.style.display = "block";
      joinForm.reset();

      // Close popup after a short delay
      setTimeout(() => {
        joinPopup.style.display = "none";
        joinMsg.style.display = "none";
      }, 1200);
    } catch (err) {
      console.error("Join Community error:", err);
      joinMsg.textContent = "Something went wrong. Please try again.";
      joinMsg.style.display = "block";
    }
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


