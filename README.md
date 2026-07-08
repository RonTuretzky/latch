# Latch — a single-slot perpetuals exchange

**Latch** is a cross-margin perpetual-futures DEX whose entire state — every balance, position,
order and funding index — is committed to **one 32-byte storage slot**. Matching runs off-chain with
no gas ceiling; the chain only ever verifies a hash and applies a single write. It's a proof-of-concept
built on the **Gas Killer** SDK; the reference contract is `GasKillerVertex` in
[`gas-killer/solidity-sdk`](https://github.com/gas-killer/solidity-sdk).

Built with [`@breadcoop/ui`](https://github.com/BreadchainCoop/bread-ui-kit) (React + Tailwind v4 +
wagmi/viem), following the [crowdstake.fun](https://github.com/BreadchainCoop/crowdstake.fun)
conventions for GitHub Pages hosting and runtime address resolution, and the
[etherform](https://github.com/BreadchainCoop/etherform) convention for deployments.

**Live site:** https://ronturetzky.github.io/latch/ · **Product** `/` · **App** `/#/app` · **Docs** `/#/docs`

![Latch demo](public/media/trade-settle.gif)

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

## Live on Sepolia

The manifest points at the **Sepolia** deployment (chain `11155111`), deployed with the
[etherform](https://github.com/BreadchainCoop/etherform) `DeployVertex` script:

| Contract | Address |
|---|---|
| GasKillerVertex | `0xf3A789D473dB08BdC07A03A57B1087CEc3203B26` |
| Demo USDC | `0xd4E6B38CD3C739898c168caa143a4CaF4AA51c22` |
| BLS checker | `0xbba6c8634764eF06bc90EA8727bbF04eEa9D4687` |

All on-chain flows are verified end-to-end on Sepolia (`scripts/sepolia-verify.mts`, 16/16 in sync).
Grab demo collateral by calling `mint(you, amount)` on the USDC contract, then connect a wallet and
deposit.

## The off-chain state store (operator)

GasKillerVertex stores only `keccak256(state)` on-chain, so the full state must be supplied as a
witness on every call. Something off-chain holds it. Because **every mutating call carries its
semantic action in calldata**, the state is reconstructable by anyone from the chain — so **one
honest operator is enough** (it can serve the truth or censor, never forge).

- **`server/`** — a Node operator service that rebuilds the canonical state from calldata, self-heals
  via an event-replay reconciler, and serves the witness (`GET /state` · `POST /apply` · `GET /health`).

  ```bash
  RPC=https://sepolia.drpc.org VERTEX=0xf3A7…3B26 CHAIN_ID=11155111 START_BLOCK=11231789 npm run server
  ```

- **`src/lib/reconstruct.ts`** — the same reconstruction, run **in the browser**, so the static site
  is self-contained. The frontend uses the hosted service when `VITE_OPERATOR_URL` is set, otherwise
  it reconstructs from the chain itself.

## Connection model

Real wallets via **RainbowKit** (WalletConnect + injected + Coinbase). Connect MetaMask/Rabby to
Sepolia; writes go through your wallet. Set `VITE_WC_PROJECT_ID` (from
[cloud.reown.com](https://cloud.reown.com)) to enable the WalletConnect protocol — injected wallets
work without it.

## Run locally

```bash
npm install
npm run dev            # → http://localhost:5173  (resolves Sepolia via the manifest)
npm run server         # optional: hosted operator (set VITE_OPERATOR_URL to use it)
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` (static export → GitHub Pages, source =
GitHub Actions). Contract redeploys need no frontend rebuild — publish a new `addresses.json` to the
`addresses` branch and the live site picks it up.
