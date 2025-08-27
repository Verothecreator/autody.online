
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

// ====== Uniswap Pair Data Setup ======
const provider = new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/YOUR_INFURA_ID"); 
// 👆 Replace with your Infura / Alchemy / QuickNode RPC URL

const pairAddress = "0x50f7e4b8a5151996a32aa1f6da9856ffb2240dcd10b1afa72df3530b41f98cd3";
const pairAbi = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];
const pairContract = new ethers.Contract(pairAddress, pairAbi, provider);

// ====== DOM Elements ======
const usdInput = document.getElementById("usdAmount");
const tokenInput = document.getElementById("tokenAmount");

// ====== Fetch Current Price ======
async function getAutodyPrice() {
  const [reserve0, reserve1] = await pairContract.getReserves();
  const token0 = await pairContract.token0();
  const token1 = await pairContract.token1();

  // Autody contract
  const autodyAddress = "0xAB94A15E2d1a47069f4c6c33326A242Ba20AbD9B".toLowerCase();

  let price;
  if (token0.toLowerCase() === autodyAddress) {
    // price in USDT per 1 AUTODY
    price = reserve1 / reserve0;
  } else {
    // reverse order
    price = reserve0 / reserve1;
  }

  return price;
}

// ====== Update Conversion on Input ======
usdInput.addEventListener("input", async () => {
  const usdValue = parseFloat(usdInput.value) || 0;
  const autodyPrice = await getAutodyPrice(); 
  const autodyValue = usdValue / autodyPrice;
  tokenInput.value = autodyValue.toFixed(2);
});

// ====== Optional: Auto-refresh price every 15s ======
setInterval(async () => {
  if (usdInput.value) {
    const usdValue = parseFloat(usdInput.value) || 0;
    const autodyPrice = await getAutodyPrice();
    const autodyValue = usdValue / autodyPrice;
    tokenInput.value = autodyValue.toFixed(2);
  }
}, 15000);
