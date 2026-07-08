import { create } from "zustand";
import { type Address, type WalletClient } from "viem";
import * as E from "./engine/engine";
import { vertexAddr, usdcAddr, vertexAbi, erc20Abi, publicClient, CONFIG } from "./chain";
import { readVertex, readErc20, errMessage, MAX_UINT } from "./contract";
import { reconstruct } from "./lib/reconstruct";
import { hasOperator, fetchOperatorState, operatorApply, OPERATOR_URL } from "./lib/operator";

export type LogEntry = { label: string; ok: boolean; hash?: string; msg?: string };

type Store = {
  // connection (real wallet via wagmi/RainbowKit)
  account: Address | null;
  acting: { address: Address; label: string } | null;
  walletClient: WalletClient | null;
  setWallet: (wc: WalletClient | null, account: Address | null) => void;

  // state
  state: E.ExchangeState;
  busy: boolean;
  error: string | null;
  log: LogEntry[];
  onchainHash: bigint | null;
  computedHash: bigint | null;
  synced: boolean;
  transitionCount: bigint;
  lastTransitionAt: bigint;
  stateSlot: `0x${string}` | null;
  usdcBalance: bigint;
  usdcAllowance: bigint;
  loadingState: boolean;
  stateSource: "operator" | "chain";

  refresh: () => Promise<void>;
  approve: () => Promise<void>;
  deposit: (amount: bigint) => Promise<void>;
  withdraw: (amount: bigint) => Promise<void>;
  listMarket: (id: number, imf: bigint, mmf: bigint, oracle: bigint) => Promise<void>;
  syncMarket: (id: number, oracle: bigint, fundingDelta: bigint) => Promise<void>;
  placeOrder: (marketId: number, isBid: boolean, price: bigint, size: bigint) => Promise<void>;
  cancelOrder: (id: bigint) => Promise<void>;
  settleEpoch: () => Promise<void>;
  liquidate: (victim: Address, marketId: number) => Promise<void>;
  emergencyWithdraw: (amount: bigint) => Promise<void>;
};

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const useStore = create<Store>((set, get) => {
  // Canonical state: from the hosted operator if configured, else reconstruct from chain calldata.
  async function loadState(): Promise<E.ExchangeState> {
    if (hasOperator) {
      try {
        return await fetchOperatorState();
      } catch (e) {
        console.warn("[operator] falling back to client reconstruction:", e);
      }
    }
    const { state } = await reconstruct(publicClient(), vertexAddr(), CONFIG.deployBlock);
    return state;
  }

  // Send a write from the CONNECTED wallet, notify the operator, then re-read the state.
  async function write(label: string, fn: string, args: unknown[]) {
    const { walletClient, account } = get();
    if (!walletClient || !account) {
      set({ error: "Connect a wallet first." });
      return;
    }
    set({ busy: true, error: null });
    try {
      const { request } = await publicClient().simulateContract({ address: vertexAddr(), abi: vertexAbi, functionName: fn as never, args: args as never, account });
      const hash = await walletClient.writeContract(request as never);
      await publicClient().waitForTransactionReceipt({ hash });
      if (hasOperator) await operatorApply(hash);
      set((s) => ({ log: [{ label, ok: true, hash }, ...s.log].slice(0, 40) }));
      await get().refresh();
    } catch (e) {
      const msg = errMessage(e);
      set((s) => ({ error: msg, log: [{ label, ok: false, msg }, ...s.log].slice(0, 40) }));
    } finally {
      set({ busy: false });
    }
  }

  const witness = () => E.toWitness(get().state);

  return {
    account: null,
    acting: null,
    walletClient: null,
    setWallet: (wc, account) => {
      set({ walletClient: wc, account, acting: account ? { address: account, label: "You" } : null });
      void get().refresh();
    },

    state: E.emptyState(),
    busy: false,
    error: null,
    log: [],
    onchainHash: null,
    computedHash: null,
    synced: false,
    transitionCount: 0n,
    lastTransitionAt: 0n,
    stateSlot: null,
    usdcBalance: 0n,
    usdcAllowance: 0n,
    loadingState: false,
    stateSource: hasOperator ? "operator" : "chain",

    refresh: async () => {
      set({ loadingState: true });
      try {
        const state = await loadState();
        set({ state });
        const acct = get().account;
        const [onchainHash, computedHash, transitionCount, lastTransitionAt, stateSlot] = await Promise.all([
          readVertex<bigint>("stateHash"),
          readVertex<bigint>("computeStateHash", [E.toWitness(state)]),
          readVertex<bigint>("stateTransitionCount"),
          readVertex<bigint>("lastTransitionAt"),
          readVertex<`0x${string}`>("STATE_SLOT"),
        ]);
        let usdcBalance = 0n;
        let usdcAllowance = 0n;
        if (acct) {
          [usdcBalance, usdcAllowance] = await Promise.all([
            readErc20<bigint>("balanceOf", [acct]),
            readErc20<bigint>("allowance", [acct, vertexAddr()]),
          ]);
        }
        set({ onchainHash, computedHash, synced: onchainHash === computedHash, transitionCount, lastTransitionAt, stateSlot, usdcBalance, usdcAllowance });
      } catch (e) {
        set({ error: errMessage(e) });
      } finally {
        set({ loadingState: false });
      }
    },

    approve: async () => {
      const { walletClient, account } = get();
      if (!walletClient || !account) return set({ error: "Connect a wallet first." });
      set({ busy: true, error: null });
      try {
        const { request } = await publicClient().simulateContract({ address: usdcAddr(), abi: erc20Abi, functionName: "approve", args: [vertexAddr(), MAX_UINT], account });
        const hash = await walletClient.writeContract(request as never);
        await publicClient().waitForTransactionReceipt({ hash });
        set((s) => ({ log: [{ label: "approve USDC", ok: true, hash }, ...s.log].slice(0, 40) }));
        await get().refresh();
      } catch (e) {
        set({ error: errMessage(e) });
      } finally {
        set({ busy: false });
      }
    },

    deposit: (amount) => write("deposit USDC", "deposit", [witness(), amount]),
    withdraw: (amount) => write("withdraw USDC", "withdraw", [witness(), amount]),
    listMarket: (id, imf, mmf, oracle) => write(`list market #${id}`, "listMarket", [witness(), id, imf, mmf, oracle]),
    syncMarket: (id, oracle, fundingDelta) => write(`sync market #${id}`, "syncMarket", [witness(), id, oracle, fundingDelta]),
    placeOrder: (marketId, isBid, price, size) => write(`${isBid ? "bid" : "ask"} on market #${marketId}`, "placeOrder", [witness(), marketId, isBid, price, size]),
    cancelOrder: (id) => write(`cancel order #${id}`, "cancelOrder", [witness(), id]),
    settleEpoch: () => write("settleEpoch", "settleEpoch", [witness()]),
    liquidate: (victim, marketId) => write(`liquidate ${shortAddr(victim)}`, "liquidate", [witness(), victim, marketId]),
    emergencyWithdraw: (amount) => write("emergencyWithdraw", "emergencyWithdraw", [witness(), amount]),
  };
});

export { MAX_UINT, OPERATOR_URL };

// ---- formatting helpers ------------------------------------------------------------------------

export function fmtWad(v: bigint, dp = 2): string {
  const neg = v < 0n;
  const x = neg ? -v : v;
  const int = x / E.WAD;
  const frac = ((x % E.WAD) * 10n ** BigInt(dp)) / E.WAD;
  const fracStr = dp > 0 ? "." + frac.toString().padStart(dp, "0") : "";
  return `${neg ? "-" : ""}${int.toString()}${fracStr}`;
}

export function parseWad(s: string): bigint {
  const t = s.trim();
  if (!t) return 0n;
  const neg = t.startsWith("-");
  const [i, f = ""] = (neg ? t.slice(1) : t).split(".");
  const frac = (f + "0".repeat(18)).slice(0, 18);
  const v = BigInt(i || "0") * E.WAD + BigInt(frac || "0");
  return neg ? -v : v;
}

export const short = shortAddr;
