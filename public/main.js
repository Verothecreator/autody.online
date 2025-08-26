document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("open-buy-card-btn");
  const popup = document.getElementById("buy-card-popup");
  const closeBtn = document.getElementById("close-popup");
  const buyNowBtn = document.getElementById("buy-autody-btn");

  // Open popup when "Buy Autody" is clicked
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    popup.style.display = "flex";
  });

  // Close popup
  closeBtn.addEventListener("click", () => {
    popup.style.display = "none";
  });

  // Close if clicking outside the popup content
  popup.addEventListener("click", (e) => {
    if (e.target === popup) {
      popup.style.display = "none";
    }
  });

  // Trigger Transak when "Buy Now" inside popup is clicked
  buyNowBtn.addEventListener("click", (e) => {
    e.preventDefault();
    launchTransak();
  });
});

function launchTransak() {
  const transak = new TransakSDK.default({
    apiKey: 'abb84712-113f-4bc5-9e4a-53495a966676',
    environment: 'STAGING',
    defaultCryptoCurrency: 'AUTODY',
    fiatCurrency: 'USD',
    walletAddress: '0xUSER_WALLET_ADDRESS',
    themeColor: '007bff',
    hostURL: window.location.origin,
    redirectURL: window.location.href,
  });

  transak.init();
}
