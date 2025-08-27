document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("open-buy-card-btn");
  const popup = document.getElementById("buy-card-popup");
  const closeBtn = document.getElementById("close-popup");
  const buyBtn = document.getElementById("buy-autody-btn");

  // Open popup
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    popup.style.display = "flex";
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

// ====== DOM Elements ======
const usdInput = document.getElementById("usdAmount");
const tokenInput = document.getElementById("tokenAmount");

// ====== Fetch Current Price from GeckoTerminal (Uniswap v4) ======
async function getAutodyPrice() {
  try {
    const res = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/eth/pools/0x50f7e4b8a5151996a32aa1f6da9856ffb2240dcd10b1afa72df3530b41f98cd3"
    );
    const data = await res.json();
    const price = parseFloat(data.data.attributes.token_price_usd);
    return price; // USD per 1 AUTODY
  } catch (err) {
    console.error("Error fetching price:", err);
    return null;
  }
}

// ====== Update Conversion on Input ======
usdInput.addEventListener("input", async () => {
  const usdValue = parseFloat(usdInput.value) || 0;
  const autodyPrice = await getAutodyPrice();
  if (!autodyPrice) return;
  const autodyValue = usdValue / autodyPrice;
  tokenInput.value = autodyValue.toFixed(2);
});

// ====== Auto-refresh every 15s ======
setInterval(async () => {
  if (usdInput.value) {
    const usdValue = parseFloat(usdInput.value) || 0;
    const autodyPrice = await getAutodyPrice();
    if (!autodyPrice) return;
    const autodyValue = usdValue / autodyPrice;
    tokenInput.value = autodyValue.toFixed(2);
  }
}, 15000);
