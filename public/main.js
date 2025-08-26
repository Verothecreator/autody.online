// main.js

// Attach event listener to Buy Autody button
document.addEventListener("DOMContentLoaded", function () {
  const buyButton = document.getElementById("buy-autody-btn");

  if (buyButton) {
    buyButton.addEventListener("click", function (e) {
      e.preventDefault();
      launchTransak();
    });
  }
});

// Function to launch Transak widget
function launchTransak() {
  const transak = new TransakSDK({
    apiKey: 'abb84712-113f-4bc5-9e4a-53495a966676', // your partner API key
    environment: 'STAGING', // use 'PRODUCTION' when live
    defaultCryptoCurrency: 'AUTODY', // token symbol
    fiatCurrency: 'USD',
    walletAddress: '0xUSER_WALLET_ADDRESS', // replace or inject dynamically from wallet connect
    themeColor: '007bff',
    hostURL: window.location.origin,
    redirectURL: window.location.href,
  });

  transak.init();

  // Optional: listen for events
  transak.on(transak.ALL_EVENTS, (data) => {
    console.log("Transak Event:", data);
  });

  transak.on(transak.EVENTS.TRANSAK_ORDER_SUCCESSFUL, (orderData) => {
    console.log("Order Successful:", orderData);
    alert("✅ Purchase successful! AUTODY will arrive in your wallet.");
    transak.close();
  });
}
