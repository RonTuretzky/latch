import { useEffect, useState } from "react";
import { Button, Body, cn } from "@breadcoop/ui";
import { useStore } from "../store";
import { Header } from "../components/Header";
import { StateInspector } from "../components/StateInspector";
import { AccountPanel } from "../components/AccountPanel";
import { CollateralPanel } from "../components/CollateralPanel";
import { MarketsPanel } from "../components/MarketsPanel";
import { TradePanel } from "../components/TradePanel";
import { OperationsPanel } from "../components/OperationsPanel";
import { LiquidatePanel } from "../components/LiquidatePanel";
import { AccountsOverview } from "../components/AccountsOverview";
import { ActivityLog } from "../components/ActivityLog";

type Tab = "trade" | "markets" | "operator" | "risk";
const TABS: { id: Tab; label: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "markets", label: "Markets" },
  { id: "operator", label: "Operator" },
  { id: "risk", label: "Risk & liquidations" },
];

export function Console() {
  const { refresh, error, seedDemo, busy, transitionCount } = useStore();
  const [tab, setTab] = useState<Tab>("trade");

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <>
      <Header />

      {error && (
        <div className="mx-auto mt-3 max-w-[1400px] px-6">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-6 py-5">
        {transitionCount === 0n && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4">
            <div>
              <Body bold>Fresh exchange.</Body>
              <Body className="!text-sm text-neutral-600">
                This console is the off-chain operator: it holds the full exchange state and commits a single 32-byte hash on-chain. Seed a scenario, or drive everything by hand.
              </Body>
            </div>
            <Button onClick={seedDemo} isLoading={busy}>
              Seed demo scenario
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="flex flex-wrap gap-1 rounded-xl border border-black/10 bg-white/70 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === t.id ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-black/5")}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "trade" && (
              <div className="space-y-5">
                <TradePanel />
                <CollateralPanel />
              </div>
            )}
            {tab === "markets" && <MarketsPanel />}
            {tab === "operator" && <OperationsPanel />}
            {tab === "risk" && (
              <div className="space-y-5">
                <LiquidatePanel />
                <AccountsOverview />
              </div>
            )}
          </div>

          {/* persistent operator status rail */}
          <div className="space-y-5">
            <AccountPanel />
            <StateInspector />
            <ActivityLog />
          </div>
        </div>

        <footer className="mt-8 pb-8 text-center text-xs text-neutral-400">
          Latch · off-chain matching + single-slot commitment · local anvil · UI by <span className="font-medium">@breadcoop/ui</span>
        </footer>
      </main>
    </>
  );
}
