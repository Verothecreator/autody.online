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
