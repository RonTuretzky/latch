// ------------------------------------------------------------------------------------------------
// Latch operator service — the off-chain state store.
//
// WHY THIS EXISTS: GasKillerVertex stores only keccak256(state) on-chain. Every call must be handed
// the full ExchangeState as a witness. So *something* off-chain must hold the expanded state and
// serve it. This service is that operator.
//
// TRUST MODEL (per the design): every mutating call carries the semantic action in its CALLDATA
// (the function + its args), which is on-chain data. So the canonical state is *reconstructable by
// anyone* from the chain — the operator cannot forge it (the contract rejects a wrong witness); it
// can only serve the truth or refuse. Hence **one honest operator is enough**, and anyone can run a
// replica. (Caveat: the `verifyAndUpdate` path commits a raw STORE without a decodable semantic
// action, so transitions applied that way are only reconstructable by the operator that produced
// them — the UI uses the standalone, fully-reconstructable mutators instead.)
//
// HOW IT STAYS IN SYNC:
//   • POST /apply {txHash}    — a client reports a landed tx; we decode its calldata and advance.
//   • background reconciler   — every ~15s, if our hash != the on-chain hash, we replay the
//                               contract's event log (each mutator emits one event) to catch up.
// It serves the witness at GET /state; the frontend builds txs from it and submits with the user's
// own wallet.
// ------------------------------------------------------------------------------------------------
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createPublicClient, http, decodeFunctionData, type Address, type Hash } from "viem";
import { vertexAbi } from "../src/abi/vertex";
import * as E from "../src/engine/engine";

const PORT = Number(process.env.PORT || 8787);
const RPC = process.env.RPC || "https://ethereum-sepolia-rpc.publicnode.com";
const VERTEX = (process.env.VERTEX || "").toLowerCase() as Address;
const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111);
const STATE_FILE = process.env.STATE_FILE || "./server/state.json";
const START_BLOCK = process.env.START_BLOCK ? BigInt(process.env.START_BLOCK) : undefined;

if (!VERTEX) throw new Error("set VERTEX=0x… (the GasKillerVertex address)");

const pub = createPublicClient({ transport: http(RPC) });

type Persisted = { serialized: string; lastBlock: string };
let state: E.ExchangeState = E.emptyState();
let lastBlock: bigint = 0n;

function persist() {
  const p: Persisted = { serialized: E.serialize(state), lastBlock: lastBlock.toString() };
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(p));
}
function loadPersisted() {
  if (existsSync(STATE_FILE)) {
    try {
      const p = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Persisted;
      state = E.deserialize(p.serialized);
      lastBlock = BigInt(p.lastBlock);
      return true;
    } catch {
      /* fall through */
    }
  }
  return false;
}

async function onchainHash(): Promise<bigint> {
  return (await pub.readContract({ address: VERTEX, abi: vertexAbi, functionName: "stateHash" })) as bigint;
}
async function computedHash(): Promise<bigint> {
  return (await pub.readContract({ address: VERTEX, abi: vertexAbi, functionName: "computeStateHash", args: [E.toWitness(state)] })) as bigint;
}

// Apply the transition carried by a single mined transaction's calldata.
async function applyTx(hash: Hash): Promise<void> {
  const tx = await pub.getTransaction({ hash });
  if (!tx.to || tx.to.toLowerCase() !== VERTEX) return;
  const from = tx.from.toLowerCase() as E.Address;
  let decoded: { functionName: string; args: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: vertexAbi, data: tx.input }) as never;
  } catch {
    return; // not a decodable mutator
  }
  const a = decoded.args as unknown[];
  switch (decoded.functionName) {
    case "deposit": state = E.applyDeposit(state, from, a[1] as bigint); break;
    case "withdraw": state = E.applyWithdraw(state, from, a[1] as bigint); break;
    case "listMarket": state = E.applyListMarket(state, Number(a[1]), a[2] as bigint, a[3] as bigint, a[4] as bigint); break;
    case "syncMarket": state = E.applySyncMarket(state, Number(a[1]), a[2] as bigint, a[3] as bigint); break;
    case "placeOrder": {
      const blk = await pub.getBlock({ blockNumber: tx.blockNumber! });
      state = E.applyPlaceOrder(state, from, Number(a[1]), a[2] as boolean, a[3] as bigint, a[4] as bigint, blk.timestamp);
      break;
    }
    case "cancelOrder": state = E.applyCancelOrder(state, a[1] as bigint); break;
    case "settleEpoch": state = E.applySettleEpoch(state); break;
    case "liquidate": state = E.applyLiquidate(state, (a[1] as string).toLowerCase() as E.Address, Number(a[2]), from); break;
    case "emergencyWithdraw": state = E.applyEmergencyWithdraw(state, from, a[1] as bigint); break;
    default: return; // verifyAndUpdate etc. — not semantically reconstructable from calldata
  }
  if (tx.blockNumber && tx.blockNumber > lastBlock) lastBlock = tx.blockNumber;
  persist();
}

// Replay the contract's event log from `lastBlock` to catch any transitions we didn't hear about.
async function reconcile(): Promise<{ synced: boolean; onchain: bigint; computed: bigint }> {
  const head = await pub.getBlockNumber();
  const from = lastBlock > 0n ? lastBlock + 1n : (START_BLOCK ?? head);
  if (from <= head) {
    const logs = await pub.getLogs({ address: VERTEX, fromBlock: from, toBlock: head });
    const seen = new Set<string>();
    const ordered = logs
      .filter((l) => l.transactionHash && !seen.has(l.transactionHash) && seen.add(l.transactionHash))
      .sort((x, y) => (x.blockNumber === y.blockNumber ? (x.logIndex ?? 0) - (y.logIndex ?? 0) : Number(x.blockNumber! - y.blockNumber!)));
    for (const l of ordered) await applyTx(l.transactionHash!);
    lastBlock = head;
    persist();
  }
  const [oc, cp] = await Promise.all([onchainHash(), computedHash()]);
  return { synced: oc === cp, onchain: oc, computed: cp };
}

// ---- HTTP ---------------------------------------------------------------------------------------

let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => (queue = queue.then(fn, fn)) as Promise<T>;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json",
};

function send(res: import("node:http").ServerResponse, code: number, body: unknown) {
  res.writeHead(code, CORS);
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  try {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET" && url.pathname === "/state") {
      const transitionCount = (await pub.readContract({ address: VERTEX, abi: vertexAbi, functionName: "stateTransitionCount" })) as bigint;
      return send(res, 200, { ok: true, chainId: CHAIN_ID, vertex: VERTEX, serialized: E.serialize(state), transitionCount: transitionCount.toString(), lastBlock: lastBlock.toString() });
    }
    if (req.method === "GET" && url.pathname === "/health") {
      const r = await reconcile();
      return send(res, 200, { ok: true, synced: r.synced, onchainHash: r.onchain.toString(16), computedHash: r.computed.toString(16), lastBlock: lastBlock.toString() });
    }
    if (req.method === "POST" && url.pathname === "/apply") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const { txHash } = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (!txHash) return send(res, 400, { ok: false, error: "txHash required" });
      const result = await serial(async () => {
        await pub.waitForTransactionReceipt({ hash: txHash as Hash, timeout: 120_000 });
        await applyTx(txHash as Hash);
        const [oc, cp] = await Promise.all([onchainHash(), computedHash()]);
        return { synced: oc === cp };
      });
      return send(res, 200, { ok: true, ...result, serialized: E.serialize(state) });
    }
    return send(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    return send(res, 500, { ok: false, error: (e as Error).message });
  }
});

// ---- boot ---------------------------------------------------------------------------------------
(async () => {
  loadPersisted();
  const r = await serial(reconcile);
  console.log(`[operator] vertex=${VERTEX} chain=${CHAIN_ID} synced=${r.synced} lastBlock=${lastBlock}`);
  setInterval(() => void serial(reconcile).catch((e) => console.warn("[reconcile]", (e as Error).message)), 15_000);
  server.listen(PORT, () => console.log(`[operator] serving witness on :${PORT}  (GET /state · POST /apply · GET /health)`));
})();
