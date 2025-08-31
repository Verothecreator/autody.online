// ---------------------------
// Popup + Steps
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("open-buy-card-btn");
  const popup = document.getElementById("buy-card-popup");
  const closeBtn = document.getElementById("close-popup");
  const buyBtn = document.getElementById("buy-autody-btn");

  // Step containers
  const buyStep = document.getElementById("buy-step");
  const walletStep = document.getElementById("wallet-step");
  const openWallets = document.getElementById("open-wallets");
  const backToBuy = document.getElementById("back-to-buy");
  const walletDisplay = document.getElementById("walletAddressDisplay");

  // Open popup
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    popup.style.display = "flex";

    // Preload price
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

  // Back to buy step
  backToBuy.addEventListener("click", () => {
    walletStep.style.display = "none";
    buyStep.style.display = "block";
  });

  // Buy button launches Transak
  buyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    launchTransak();
  });

  // Wallet options click
  document.querySelectorAll(".wallet-option").forEach(btn => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.wallet;
      try {
        if (type === "metamask") {
          if (!window.ethereum) {
            alert("MetaMask not installed.");
            return;
          }
          const provider = new ethers.BrowserProvider(window.ethereum);
          await window.ethereum.request({ method: "eth_requestAccounts" });
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          walletDisplay.innerText = `Connected: ${address}`;
          window.localStorage.setItem("autodyWallet", address);
        }
        else if (type === "walletconnect") {
          alert("WalletConnect integration coming soon.");
        }
        else if (type === "coinbase") {
          alert("Coinbase Wallet integration coming soon.");
        }
        else if (type === "trust") {
          alert("Trust Wallet integration coming soon.");
        }
        else if (type === "ledger") {
          alert("Ledger support requires bridge (coming soon).");
        }

        // Return to Buy step
        walletStep.style.display = "none";
        buyStep.style.display = "block";
      } catch (err) {
        console.error("Wallet connect failed:", err);
      }
    });
  });
});

// ---------------------------
// Transak
// ---------------------------
function launchTransak() {
  const transak = new TransakSDK.default({
    apiKey: "abb84712-113f-4bc5-9e4a-53495a966676", // test key
    environment: "STAGING",
    defaultCryptoCurrency: "AUTODY",
    fiatCurrency: "USD",
    walletAddress: window.localStorage.getItem("autodyWallet") || "",
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
