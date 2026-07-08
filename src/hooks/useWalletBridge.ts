import { useEffect } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useStore } from "../store";

// Pushes the connected wallet (wagmi) into the zustand store so store actions can submit txs.
export function useWalletBridge() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const setWallet = useStore((s) => s.setWallet);
  useEffect(() => {
    setWallet(walletClient ?? null, (address as `0x${string}` | undefined) ?? null);
  }, [walletClient, address, setWallet]);
}
