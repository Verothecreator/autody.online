// ESM shim for WalletConnect Universal Provider + Modal
import UniversalProvider from "https://esm.sh/@walletconnect/universal-provider@2.21.8";
import { WalletConnectModal } from "https://esm.sh/@walletconnect/modal@2.7.0";

// Expose to window so main.js can find them
window.WalletConnectUniversalProvider = UniversalProvider;
window.WalletConnectModal = { default: WalletConnectModal };

console.log("Shim ready");
