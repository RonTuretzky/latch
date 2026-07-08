# GasKillerVertex — operator console

A static React dApp for **GasKillerVertex**, a single-slot cross-margin perpetual-futures DEX
(off-chain matching, whole exchange committed to one storage slot, applied on-chain via a
BLS-attested `verifyAndUpdate`). The contract lives in
[`gas-killer/solidity-sdk`](https://github.com/gas-killer/solidity-sdk).

Built with [`@breadcoop/ui`](https://github.com/BreadchainCoop/bread-ui-kit) (React + Tailwind v4 +
wagmi/viem), and it follows the [crowdstake.fun](https://github.com/BreadchainCoop/crowdstake.fun)
conventions for GitHub Pages hosting and runtime address resolution.

**Live site:** https://ronturetzky.github.io/gaskiller-vertex-ui/

## Why this frontend is unusual

GasKillerVertex commits its **entire** state — accounts, cross-margin positions, orders, per-market
oracle/funding, insurance fund — into **one storage slot**; the chain stores only a 32-byte hash.
Every mutator takes the full expanded state as a `witness`, verifies it against that hash, mutates in
memory, and re-commits. So the frontend **is the off-chain operator**: it maintains the full
`ExchangeState` locally (`src/engine/engine.ts` — a faithful TS port of the contract), passes it as
the witness on every call, and after each tx verifies sync by comparing the contract's
`computeStateHash(witness)` to the on-chain `stateHash()`. `scripts/verify.mts` proves the engine is a
faithful mirror (drives all 9 mutators through the engine + a live contract, 16/16 in sync).

## The "etherform → latest addy" convention

Exactly like crowdstake.fun, contract addresses are **not baked into the build**. On load the app
fetches an `addresses.json` manifest from this repo's **`addresses` branch** via
`raw.githubusercontent.com` (which sends `access-control-allow-origin: *`, so it's fetchable from the
static page). Precedence: `VITE_*` env pins → manifest → baked-in `src/deployments.json` fallback. See
`src/lib/addresses.ts`.

Result: **a contract redeploy needs no frontend rebuild** — update the manifest on the `addresses`
branch (the `Publish addresses manifest` workflow, or in the full stack the BreadchainCoop
[`etherform`](https://github.com/BreadchainCoop/etherform) contracts-deploy pipeline) and the live
site picks up the new address on the next page load.

## ⚠️ This targets a local chain by default

The seeded manifest points at a **local anvil** (chain `31337`) with the deterministic addresses
`DeployVertex.s.sol` produces. So the hosted page renders and shows the whole UI, but to actually
transact you need that local chain running:

```bash
# in gas-killer/solidity-sdk:
anvil
forge script script/DeployVertex.s.sol:DeployVertex --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

To make the hosted site a fully-live public demo, deploy GasKillerVertex to a public testnet and run
the **Publish addresses manifest** workflow with that chain id, a public RPC URL, and the deployed
addresses — no rebuild required.

## Run locally

```bash
npm install
npm run dev            # → http://localhost:5173

# engine ↔ contract conformance (needs anvil + a deploy, see above)
npx tsx scripts/verify.mts
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` (build the static export → GitHub Pages). Pages
must be set to **Source: GitHub Actions**.

## Connection model

The console sends transactions as one of the default anvil accounts (Deployer / Alice / Bob / Carol /
Liquidator), selectable in the header — no wallet extension needed, so the whole flow is one click.
**Those are the universally-known anvil test keys; they hold no real funds and are only meaningful on
chain 31337.** For a real chain you'd wire a wallet connector instead.
