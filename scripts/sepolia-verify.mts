// End-to-end on-chain flow verification against a REAL network (Sepolia).
// Drives every GasKillerVertex mutator through the TS engine + the live contract and asserts the
// operator mirror stays in sync (computeStateHash(witness) == on-chain stateHash()) after each.
//
//   RPC=... PK=0x... VERTEX=0x... USDC=0x... npx tsx scripts/sepolia-verify.mts
import {
  createPublicClient, createWalletClient, http, defineChain, parseEther,
  type Address, type Hash,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { vertexAbi } from "../src/abi/vertex";
import { erc20Abi } from "../src/abi/erc20";
import * as E from "../src/engine/engine";

const RPC = process.env.RPC!;
const PK = process.env.PK as `0x${string}`;
const VERTEX = process.env.VERTEX as Address;
const USDC = process.env.USDC as Address;

const chain = defineChain({
  id: Number(process.env.CHAIN_ID || 11155111),
  name: "sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = (pk: `0x${string}`) => createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(RPC) });
const addr = (pk: `0x${string}`) => privateKeyToAccount(pk).address.toLowerCase() as Address;

const WAD = 10n ** 18n;
const MAX = (1n << 256n) - 1n;
let state = E.emptyState();
let step = 0;

async function wait(hash: Hash) {
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (r.status !== "success") throw new Error(`tx ${hash} reverted`);
  return r;
}
async function send(pk: `0x${string}`, address: Address, abi: unknown, fn: string, args: unknown[]) {
  const { request } = await pub.simulateContract({ address, abi: abi as never, functionName: fn as never, args: args as never, account: privateKeyToAccount(pk) });
  const hash = await wallet(pk).writeContract(request as never);
  await wait(hash);
  return hash;
}
async function blockTimeOf(hash: Hash) {
  const r = await pub.waitForTransactionReceipt({ hash });
  return (await pub.getBlock({ blockNumber: r.blockNumber })).timestamp;
}
async function fundEth(from: `0x${string}`, to: Address, eth: string) {
  const hash = await wallet(from).sendTransaction({ to, value: parseEther(eth) });
  await wait(hash);
}
async function assertSync(label: string, next: E.ExchangeState) {
  const [onchain, computed] = await Promise.all([
    pub.readContract({ address: VERTEX, abi: vertexAbi, functionName: "stateHash" }) as Promise<bigint>,
    pub.readContract({ address: VERTEX, abi: vertexAbi, functionName: "computeStateHash", args: [E.toWitness(next)] }) as Promise<bigint>,
  ]);
  step++;
  const ok = onchain === computed;
  console.log(`${ok ? "✓" : "✗"} [${step}] ${label}   onchain=${onchain.toString(16).slice(0, 10)} computed=${computed.toString(16).slice(0, 10)}`);
  if (!ok) { console.error("DIVERGED:", JSON.stringify(E.toWitness(next), (_k, v) => (typeof v === "bigint" ? v.toString() : v))); process.exit(1); }
  state = next;
}

async function main() {
  const D = addr(PK);
  const alicePk = generatePrivateKey(); const A = addr(alicePk);
  const bobPk = generatePrivateKey(); const B = addr(bobPk);
  console.log(`deployer=${D}\nalice=${A}\nbob=${B}`);

  // fund helper gas + mint demo USDC to all three
  console.log("funding helpers + minting USDC…");
  await fundEth(PK, A, "0.35");
  await fundEth(PK, B, "0.35");
  for (const [pk, who] of [[PK, D], [alicePk, A], [bobPk, B]] as const) {
    await send(pk === PK ? PK : PK, USDC, erc20Abi, "mint", [who, 1_000_000n * WAD]);
  }

  await assertSync("initial empty state", state);

  // list market
  await send(PK, VERTEX, vertexAbi, "listMarket", [E.toWitness(state), 1, 5n * 10n ** 16n, 3n * 10n ** 16n, 3000n * WAD]);
  await assertSync("listMarket(ETH 5%/3% @3000)", E.applyListMarket(state, 1, 5n * 10n ** 16n, 3n * 10n ** 16n, 3000n * WAD));

  // deposits (D = thin-margin victim; B = deep counterparty)
  await send(PK, USDC, erc20Abi, "approve", [VERTEX, MAX]);
  await send(PK, VERTEX, vertexAbi, "deposit", [E.toWitness(state), 1600n * WAD]);
  await assertSync("Deployer deposit 1600", E.applyDeposit(state, D, 1600n * WAD));
  await send(bobPk, USDC, erc20Abi, "approve", [VERTEX, MAX]);
  await send(bobPk, VERTEX, vertexAbi, "deposit", [E.toWitness(state), 100000n * WAD]);
  await assertSync("Bob deposit 100000", E.applyDeposit(state, B, 100000n * WAD));

  // crossing orders → open positions
  let h = await send(PK, VERTEX, vertexAbi, "placeOrder", [E.toWitness(state), 1, true, 3000n * WAD, 10n * WAD]);
  let t = await blockTimeOf(h);
  await assertSync("Deployer bid 10 @3000", E.applyPlaceOrder(state, D, 1, true, 3000n * WAD, 10n * WAD, t));
  h = await send(bobPk, VERTEX, vertexAbi, "placeOrder", [E.toWitness(state), 1, false, 3000n * WAD, 10n * WAD]);
  t = await blockTimeOf(h);
  await assertSync("Bob ask 10 @3000", E.applyPlaceOrder(state, B, 1, false, 3000n * WAD, 10n * WAD, t));

  // settle → Deployer long 10, Bob short 10
  await send(PK, VERTEX, vertexAbi, "settleEpoch", [E.toWitness(state)]);
  await assertSync("settleEpoch (positions open)", E.applySettleEpoch(state));

  // liquidator funds; oracle drops; liquidate the deployer
  await send(alicePk, USDC, erc20Abi, "approve", [VERTEX, MAX]);
  await send(alicePk, VERTEX, vertexAbi, "deposit", [E.toWitness(state), 5000n * WAD]);
  await assertSync("Alice(liquidator) deposit 5000", E.applyDeposit(state, A, 5000n * WAD));
  await send(PK, VERTEX, vertexAbi, "syncMarket", [E.toWitness(state), 1, 2800n * WAD, 0n]);
  await assertSync("syncMarket oracle=2800 (Deployer underwater)", E.applySyncMarket(state, 1, 2800n * WAD, 0n));
  await send(alicePk, VERTEX, vertexAbi, "liquidate", [E.toWitness(state), D, 1]);
  await assertSync("Alice liquidates Deployer (inherits long)", E.applyLiquidate(state, D, 1, A));

  // funding + oracle move
  await send(PK, VERTEX, vertexAbi, "syncMarket", [E.toWitness(state), 1, 3000n * WAD, 20n * WAD]);
  await assertSync("syncMarket oracle=3000 funding+20", E.applySyncMarket(state, 1, 3000n * WAD, 20n * WAD));

  // place + cancel
  h = await send(bobPk, VERTEX, vertexAbi, "placeOrder", [E.toWitness(state), 1, true, 2500n * WAD, 10n ** 17n]);
  t = await blockTimeOf(h);
  const oid = state.nextOrderId;
  await assertSync("Bob bid 0.1 @2500", E.applyPlaceOrder(state, B, 1, true, 2500n * WAD, 10n ** 17n, t));
  await send(bobPk, VERTEX, vertexAbi, "cancelOrder", [E.toWitness(state), oid]);
  await assertSync("Bob cancelOrder", E.applyCancelOrder(state, oid));

  // withdraw
  await send(bobPk, VERTEX, vertexAbi, "withdraw", [E.toWitness(state), 100n * WAD]);
  await assertSync("Bob withdraw 100", E.applyWithdraw(state, B, 100n * WAD));

  // Gas Killer path: settle via verifyAndUpdate (one STORE)
  {
    const next = E.applySettleEpoch(state);
    const newHash = (await pub.readContract({ address: VERTEX, abi: vertexAbi, functionName: "computeStateHash", args: [E.toWitness(next)] })) as bigint;
    const { encodeAbiParameters, toHex, sha256, getAbiItem, toFunctionSelector } = await import("viem");
    const slot = (await pub.readContract({ address: VERTEX, abi: vertexAbi, functionName: "STATE_SLOT" })) as `0x${string}`;
    const now = (await pub.getBlock()).timestamp;
    const packed = toHex((newHash << 64n) | now, { size: 32 });
    const store0 = encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [slot, packed]);
    const upd = encodeAbiParameters([{ type: "uint8[]" }, { type: "bytes[]" }], [[0], [store0]]);
    const ti = (await pub.readContract({ address: VERTEX, abi: vertexAbi, functionName: "stateTransitionCount" })) as bigint;
    const sel = toFunctionSelector(getAbiItem({ abi: vertexAbi, name: "settleEpoch" }) as never);
    const msgHash = sha256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "bytes4" }, { type: "bytes" }], [ti, VERTEX, sel, upd]));
    const refBlock = Number((await pub.getBlockNumber()) - 1n);
    const emptySig = { nonSignerQuorumBitmapIndices: [], nonSignerPubkeys: [], quorumApks: [], apkG2: { X: [0n, 0n], Y: [0n, 0n] }, sigma: { X: 0n, Y: 0n }, quorumApkIndices: [], totalStakeIndices: [], nonSignerStakeIndices: [] };
    await send(PK, VERTEX, vertexAbi, "verifyAndUpdate", [msgHash, "0x00", refBlock, upd, ti, sel, emptySig]);
    await assertSync("verifyAndUpdate (BLS quorum → 1 STORE)", next);
  }

  // emergencyWithdraw is 7-day-gated: verify it REVERTS before the delay (can't warp a live chain).
  let reverted = false;
  try {
    await pub.simulateContract({ address: VERTEX, abi: vertexAbi, functionName: "emergencyWithdraw", args: [E.toWitness(state), 1n], account: privateKeyToAccount(PK) });
  } catch { reverted = true; }
  console.log(`${reverted ? "✓" : "✗"} [${++step}] emergencyWithdraw correctly reverts before the 7-day gate`);
  if (!reverted) process.exit(1);

  console.log("\nAll on-chain flows verified end-to-end on Sepolia ✅");
}
main().catch((e) => { console.error(e); process.exit(1); });
