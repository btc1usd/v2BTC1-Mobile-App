import { useWeb3 } from "@/lib/web3-walletconnect-v2";

export function useWallet() {
  const { 
    address, 
    chainId, 
    isConnected, 
    isConnecting, 
    error,
    disconnectWallet,
    signer,
  } = useWeb3();

  return {
    address,
    chainId,
    chain: { id: chainId || 8453, name: chainId === 8453 ? "Base Mainnet" : "Unknown" },
    isConnected,
    isConnecting,
    error,
    disconnectWallet,
    signer,
  };
}
