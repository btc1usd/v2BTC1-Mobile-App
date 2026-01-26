import { useWeb3 } from "@/lib/web3-walletconnect-v2";

export function useWallet() {
  const { 
    address, 
    isConnected, 
    chainId, 
    error,
    disconnectWallet,
    signer,
  } = useWeb3();

  return {
    address,
    isConnected,
    chain: { id: chainId || 8453, name: "Base Mainnet" },
    error,
    disconnectWallet,
    signer,
  };
}
