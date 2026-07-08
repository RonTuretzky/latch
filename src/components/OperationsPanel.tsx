import { useState } from "react";
import { Button, Body } from "@breadcoop/ui";
import { useStore, parseWad } from "../store";
import { Card, Field, TextInput } from "./ui";

export function OperationsPanel() {
  const { settleEpoch, emergencyWithdraw, busy, state } = useStore();
  const [amount, setAmount] = useState("100");
  const hasOrders = state.orders.length > 0;

  return (
    <Card title="Operator & settlement" subtitle="run the matching engine and the emergency exit">
      <div className="rounded-xl border border-black/10 p-3">
        <Body bold className="!text-sm">Settle epoch</Body>
        <p className="mb-2 mt-1 text-xs text-neutral-500">
          Matches every market's book in price-time priority and opens perp positions. Off-chain this can exceed the block gas limit; on-chain it lands as a single state commitment. (The contract also has the BLS <code>verifyAndUpdate</code> path; the UI uses the standalone settle, whose calldata is fully reconstructable by the operator.)
        </p>
        <Button variant="secondary" onClick={settleEpoch} isLoading={busy} disabled={!hasOrders}>
          settleEpoch
        </Button>
      </div>

      <div className="mt-3 rounded-xl border border-black/10 p-3">
        <Body bold className="!text-sm">Emergency exit</Body>
        <p className="mb-2 mt-1 text-xs text-neutral-500">
          If no transition lands for 7 days, any user with no open positions may withdraw free collateral. (The 7-day gate can't be fast-forwarded on a live testnet — it reverts until the delay elapses.)
        </p>
        <div className="flex items-end gap-2">
          <Field label="Amount (USDC)">
            <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Button variant="destructive" onClick={() => emergencyWithdraw(parseWad(amount))} isLoading={busy}>
            emergencyWithdraw
          </Button>
        </div>
      </div>
    </Card>
  );
}
