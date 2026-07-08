import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useStore } from "../store";
import { Pill } from "./ui";
import { OPERATOR_URL } from "../lib/operator";

export function Header() {
  const { onchainHash, synced, transitionCount, stateSource, loadingState } = useStore();

  return (
    <div className="border-b border-black/10 bg-white/60">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-1.5">
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-wide text-neutral-400">on-chain commitment</span>
              <span className="font-mono text-xs">{onchainHash === null ? "—" : `0x${onchainHash.toString(16).padStart(48, "0").slice(0, 16)}…`}</span>
            </div>
            <div className="mx-1 h-8 w-px bg-black/10" />
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[10px] uppercase tracking-wide text-neutral-400">transition</span>
              <span className="font-mono text-xs">#{transitionCount.toString()}</span>
            </div>
            {synced ? <Pill tone="pos">witness in sync</Pill> : <Pill tone="warn">syncing…</Pill>}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-[11px] text-neutral-500">
            state via <span className="font-semibold text-neutral-700">{stateSource === "operator" ? "operator service" : "chain reconstruction"}</span>
            {loadingState && <span className="text-neutral-400">· loading…</span>}
          </div>
        </div>

        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>
    </div>
  );
}
