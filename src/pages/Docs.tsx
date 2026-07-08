import { Heading1, Heading2, Heading3, Body, Caption } from "@breadcoop/ui";
import { BRAND } from "../brand";

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 border-t border-black/10 pt-8">
      <Heading2 className="!text-xl">{children}</Heading2>
    </div>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <Body className="mt-2 leading-relaxed text-neutral-700">{children}</Body>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <pre className="gk-scroll mt-3 overflow-x-auto rounded-xl bg-neutral-900 p-4 font-mono text-[12.5px] leading-relaxed text-neutral-100">{children}</pre>;
}

const TOC = [
  ["overview", "Overview"],
  ["commitment", "The single-slot commitment"],
  ["paths", "Two ways to advance state"],
  ["margin", "Cross-margin math"],
  ["operator", "The operator model (this app)"],
  ["addresses", "Address resolution (etherform)"],
  ["run", "Running locally"],
  ["functions", "Function reference"],
];

export function Docs() {
  return (
    <div className="mx-auto max-w-[1000px] px-6 py-12">
      <Heading1 className="!text-3xl">{BRAND.name} docs</Heading1>
      <Body className="mt-2 text-neutral-600">
        {BRAND.name} is a single-slot cross-margin perpetual-futures DEX built on the Gas Killer SDK. The reference contract is{" "}
        <a className="underline" href={BRAND.contractRepoUrl}>
          GasKillerVertex
        </a>{" "}
        in gas-killer/solidity-sdk.
      </Body>

      <nav className="mt-6 flex flex-wrap gap-2">
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-600 hover:bg-black/5">
            {label}
          </a>
        ))}
      </nav>

      <H id="overview">Overview</H>
      <P>
        The contract commits the <b>entire</b> mutable exchange — every account's collateral and open perp positions, every
        resting order, each market's oracle price and cumulative funding index, and the insurance fund — into one storage slot.
        Matching, funding and liquidation run off-chain; the chain only verifies a hash and applies a single write. This app is
        the off-chain operator that maintains that state and drives the contract.
      </P>

      <H id="commitment">The single-slot commitment</H>
      <P>One 32-byte slot holds a 192-bit state hash plus a 64-bit timestamp used by the emergency-exit gate:</P>
      <Code>{`STATE_SLOT:
  bits[255:64] = uint192( keccak256(abi.encode(
                   DOMAIN, nextOrderId, insuranceFund,
                   canonicalAccounts, canonicalOrders, canonicalMarkets
                 ))[:24] )
  bits[63:0]   = uint64(block.timestamp at last transition)`}</Code>
      <P>
        The state is <b>canonicalized</b> before hashing — accounts sorted by owner, positions by market, orders and markets by
        id, with zero-size positions and empty accounts dropped and duplicates rejected. That makes the commitment independent of
        the witness's ordering, so any faithful representation of the same state hashes identically.
      </P>

      <H id="paths">Two ways to advance state</H>
      <P>
        <b>Standalone.</b> A caller passes the full <code>ExchangeState</code> witness to a mutator (<code>deposit</code>,{" "}
        <code>placeOrder</code>, <code>settleEpoch</code>, …). The contract re-hashes it, requires it equals the committed slot,
        applies the change in memory, and writes the new commitment.
      </P>
      <P>
        <b>Gas Killer path.</b> Operators run the transition off-chain under <code>SimProfile::UnboundedV1</code>, BLS-sign the
        resulting commitment, and a ≥66% restaked quorum applies it on-chain via <code>verifyAndUpdate</code> as a single
        <code> STORE</code>. Replay is prevented by a monotonic transition index.
      </P>

      <H id="margin">Cross-margin math (WAD = 1e18)</H>
      <Code>{`equity            = collateral
                  + Σ size·(oracle − avgEntry)/1e18        (unrealized PnL, signed)
                  − Σ size·(cumFunding − entryFunding)/1e18 (funding owed, signed)
initialMargin     = Σ |size|·oracle·imf / 1e36
maintenanceMargin = Σ |size|·oracle·mmf / 1e36`}</Code>
      <P>
        Withdrawals and order placement require <code>equity ≥ initialMargin</code> (placement checks the account as if the order
        fully filled). An account with <code>equity &lt; maintenanceMargin</code> is liquidatable: its position closes at the
        oracle, a 2.5% penalty of notional routes to the insurance fund, bad debt is absorbed by the fund, and the liquidator
        inherits the position and must itself stay initial-margin healthy.
      </P>

      <H id="operator">The operator model (this app)</H>
      <P>
        Because every mutator needs the full witness, a frontend can't just call <code>deposit(amount)</code> — it has to be the
        operator. This app keeps the whole <code>ExchangeState</code> in the browser (a faithful TypeScript port of the contract's
        transitions in <code>src/engine/engine.ts</code>), passes it as the witness on every call, and after each transaction
        verifies sync by comparing the contract's <code>computeStateHash(witness)</code> to the on-chain <code>stateHash()</code> —
        shown live in the header and the "single-slot commitment" panel. <code>scripts/verify.mts</code> proves the engine mirrors
        the contract by driving all nine mutators through both and asserting the hashes match at every step.
      </P>

      <H id="addresses">Address resolution (the etherform convention)</H>
      <P>
        Following <a className="underline" href="https://github.com/BreadchainCoop/crowdstake.fun">crowdstake.fun</a>, contract
        addresses are <b>not baked into the build</b>. On load the app fetches an <code>addresses.json</code> manifest from this
        repo's <code>addresses</code> branch via <code>raw.githubusercontent.com</code> (which sends{" "}
        <code>access-control-allow-origin: *</code>), with the baked <code>deployments.json</code> as fallback and{" "}
        <code>VITE_*</code> env pins on top. A contract redeploy therefore needs no frontend rebuild — the deploy publishes a new
        manifest and the live site picks it up on the next load. In the full stack the deploy is driven by the{" "}
        <a className="underline" href="https://github.com/BreadchainCoop/etherform">
          etherform
        </a>{" "}
        reusable Foundry workflow, whose post-deploy step writes the manifest.
      </P>
      <Code>{`precedence:  VITE_* env pin  >  addresses.json manifest  >  baked deployments.json
manifest:    https://raw.githubusercontent.com/<owner>/<repo>/addresses/addresses.json
shape:       { "version": 1, "chains": { "<chainId>": { rpcUrl, vertex, usdc, bls } } }`}</Code>

      <H id="run">Running locally</H>
      <Code>{`# 1. contract repo — local chain + deploy
anvil
forge script script/DeployVertex.s.sol:DeployVertex \\
  --rpc-url http://127.0.0.1:8545 --broadcast \\
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 2. this app
npm install
npm run dev            # http://localhost:5173

# 3. engine ↔ contract conformance
npx tsx scripts/verify.mts`}</Code>
      <Caption className="mt-2 text-neutral-400">
        The hosted site targets a local anvil by default, so a public visitor sees the full UI but must run a local chain (or
        repoint the manifest at a public deployment) to transact.
      </Caption>

      <H id="functions">Function reference</H>
      <div className="mt-3 overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-black/5">
            {[
              ["deposit / withdraw", "add or remove quote (USDC) collateral; withdraw stays initial-margin healthy"],
              ["listMarket", "operator lists a perp market with initial & maintenance margin fractions"],
              ["syncMarket", "sequencer posts a market's oracle price and a cumulative-funding delta"],
              ["placeOrder / cancelOrder", "rest or remove a limit order (placement is margin-checked)"],
              ["settleEpoch", "match every market in price-time priority, opening perp positions"],
              ["verifyAndUpdate", "Gas Killer path: apply a BLS-attested transition as one STORE"],
              ["liquidate", "close an underwater account's position; liquidator inherits it"],
              ["emergencyWithdraw", "withdraw free collateral after 7 days of operator inactivity"],
            ].map((r) => (
              <tr key={r[0]}>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[13px] font-medium">{r[0]}</td>
                <td className="px-4 py-2 text-neutral-600">{r[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 border-t border-black/10 pt-6 text-sm text-neutral-500">
        Links:{" "}
        <a className="underline" href={BRAND.contractRepoUrl}>
          contract (solidity-sdk)
        </a>{" "}
        ·{" "}
        <a className="underline" href={BRAND.repoUrl}>
          this repo
        </a>{" "}
        ·{" "}
        <a className="underline" href="https://github.com/BreadchainCoop/etherform">
          etherform
        </a>{" "}
        ·{" "}
        <a className="underline" href={BRAND.breadUrl}>
          @breadcoop/ui
        </a>
      </div>
    </div>
  );
}
