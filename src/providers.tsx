import { ReactNode } from "react";
import { WagmiProvider, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { BreadUIKitProvider } from "@breadcoop/ui";
import { getChain, usdcAddr, CONFIG } from "./chain";
import { erc20Abi } from "./abi/erc20";

const env = (import.meta.env ?? {}) as unknown as Record<string, string | undefined>;
const chain = getChain();

// Real wallet connection via RainbowKit (WalletConnect + injected + Coinbase). Set a real
// VITE_WC_PROJECT_ID (from https://cloud.reown.com) to enable the WalletConnect protocol; injected
// wallets (MetaMask/Rabby) work regardless.
const wagmiConfig = getDefaultConfig({
  appName: "Latch",
  projectId: env.VITE_WC_PROJECT_ID || "00000000000000000000000000000000",
  chains: [chain],
  transports: { [chain.id]: http(CONFIG.rpcUrl) },
  ssr: false,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <BreadUIKitProvider app="fund" chainId={chain.id} authProvider="general" tokenConfig={{ BREAD: { address: usdcAddr(), abi: erc20Abi as never } }}>
            {children}
          </BreadUIKitProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
