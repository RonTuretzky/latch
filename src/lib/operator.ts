// Optional client for a hosted operator service (the backend in /server). When VITE_OPERATOR_URL is
// set the frontend uses it as a shared, fast state store; otherwise it reconstructs from the chain
// itself (see reconstruct.ts). Either way the state is the same — the operator can't forge it.
import * as E from "../engine/engine";

const env = (import.meta.env ?? {}) as unknown as Record<string, string | undefined>;
export const OPERATOR_URL = env.VITE_OPERATOR_URL || "";
export const hasOperator = OPERATOR_URL.length > 0;

export async function fetchOperatorState(): Promise<E.ExchangeState> {
  const r = await fetch(`${OPERATOR_URL}/state`, { cache: "no-store" });
  if (!r.ok) throw new Error(`operator /state → HTTP ${r.status}`);
  const j = (await r.json()) as { serialized: string };
  return E.deserialize(j.serialized);
}

export async function operatorApply(txHash: string): Promise<void> {
  try {
    await fetch(`${OPERATOR_URL}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    });
  } catch {
    /* best-effort; the reconciler and client reconstruction cover misses */
  }
}
