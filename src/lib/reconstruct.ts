// Reconstruct the canonical ExchangeState from on-chain calldata.
//
// Every mutating call carries its semantic action in calldata (function + args), so the full state
// is reconstructable by anyone from the chain — no trusted input. This is the same logic the
// operator service runs; the frontend can also run it directly (the browser as its own read-only
// operator), which is what makes the static site self-contained.
import { decodeFunctionData, type PublicClient, type Address, type Hash } from "viem";
import { vertexAbi } from "../abi/vertex";
import * as E from "../engine/engine";

/** Apply the transition carried by one mined tx's calldata. Returns the (possibly unchanged) state. */
export async function applyTxToState(state: E.ExchangeState, pub: PublicClient, vertex: string, hash: Hash): Promise<E.ExchangeState> {
  const v = vertex.toLowerCase();
  const tx = await pub.getTransaction({ hash });
  if (!tx.to || tx.to.toLowerCase() !== v) return state;
  const from = tx.from.toLowerCase() as E.Address;
  let d: { functionName: string; args: readonly unknown[] };
  try {
    d = decodeFunctionData({ abi: vertexAbi, data: tx.input }) as never;
  } catch {
    return state;
  }
  const a = d.args as unknown[];
  switch (d.functionName) {
    case "deposit": return E.applyDeposit(state, from, a[1] as bigint);
    case "withdraw": return E.applyWithdraw(state, from, a[1] as bigint);
    case "listMarket": return E.applyListMarket(state, Number(a[1]), a[2] as bigint, a[3] as bigint, a[4] as bigint);
    case "syncMarket": return E.applySyncMarket(state, Number(a[1]), a[2] as bigint, a[3] as bigint);
    case "placeOrder": {
      const blk = await pub.getBlock({ blockNumber: tx.blockNumber! });
      return E.applyPlaceOrder(state, from, Number(a[1]), a[2] as boolean, a[3] as bigint, a[4] as bigint, blk.timestamp);
    }
    case "cancelOrder": return E.applyCancelOrder(state, a[1] as bigint);
    case "settleEpoch": return E.applySettleEpoch(state);
    case "liquidate": return E.applyLiquidate(state, (a[1] as string).toLowerCase() as E.Address, Number(a[2]), from);
    case "emergencyWithdraw": return E.applyEmergencyWithdraw(state, from, a[1] as bigint);
    default: return state; // verifyAndUpdate: commits a raw STORE, not semantically reconstructable
  }
}

/** Rebuild the full state by replaying every contract event's tx (each mutator emits one event). */
export async function reconstruct(pub: PublicClient, vertex: string, fromBlock: bigint): Promise<{ state: E.ExchangeState; head: bigint }> {
  const head = await pub.getBlockNumber();
  let state = E.emptyState();
  if (fromBlock <= head) {
    const logs = await pub.getLogs({ address: vertex as Address, fromBlock, toBlock: head });
    const seen = new Set<string>();
    const ordered = logs
      .filter((l) => l.transactionHash && !seen.has(l.transactionHash) && seen.add(l.transactionHash))
      .sort((x, y) => (x.blockNumber === y.blockNumber ? Number((x.logIndex ?? 0) - (y.logIndex ?? 0)) : Number(x.blockNumber! - y.blockNumber!)));
    for (const l of ordered) state = await applyTxToState(state, pub, vertex, l.transactionHash!);
  }
  return { state, head };
}
