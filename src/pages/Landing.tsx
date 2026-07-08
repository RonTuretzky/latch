import { Link } from "react-router-dom";
import { Button, Heading1, Heading2, Heading3, Body, Caption } from "@breadcoop/ui";
import { BRAND } from "../brand";
import { Gif } from "../components/Gif";

function Section({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-[1100px] px-6 py-14 ${className ?? ""}`}>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">{n}</div>
      <div>
        <Body bold>{title}</Body>
        <Body className="!text-sm text-neutral-600">{children}</Body>
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="text-neutral-800">
      {/* Hero */}
      <Section className="!py-20 text-center">
        <Caption className="mb-3 inline-block rounded-full bg-orange-100 px-3 py-1 font-semibold uppercase tracking-wide text-orange-700">
          {BRAND.powered}
        </Caption>
        <Heading1 className="!text-5xl !leading-tight">{BRAND.name}</Heading1>
        <Body className="mx-auto mt-4 max-w-2xl !text-lg text-neutral-600">{BRAND.tagline}</Body>
        <Body className="mx-auto mt-2 max-w-2xl text-neutral-500">
          A cross-margin perpetual-futures DEX whose entire state — every balance, position, order and funding index — is
          committed to <span className="font-semibold text-neutral-800">one 32-byte storage slot</span>. Matching runs off-chain
          with no gas ceiling; the chain only ever verifies a hash.
        </Body>
        <div className="mt-7 flex justify-center gap-3">
          <Button as={Link} to="/app">
            Launch the app
          </Button>
          <Button as={Link} to="/docs" variant="light">
            Read the docs
          </Button>
        </div>
      </Section>

      {/* Stat band */}
      <div className="border-y border-black/10 bg-white/60">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-6 px-6 py-8 sm:grid-cols-3">
          <Stat big="1 slot" small="the whole exchange is a single 32-byte on-chain commitment" />
          <Stat big="2 SSTOREs" small="written per state transition — regardless of fills, positions, or accounts" />
          <Stat big="~527M gas" small="a 1,200-order settle off-chain — 17× a mainnet block — lands as one on-chain write" />
        </div>
      </div>

      {/* Demo */}
      <Section>
        <Heading2 className="!text-2xl">See it move</Heading2>
        <Body className="mt-1 mb-6 text-neutral-600">The operator console drives every function against a local chain; the on-chain commitment stays in lock-step with the off-chain state.</Body>
        <Gif src="trade-settle.gif" alt="Seed a scenario, open positions, tour the console" caption="Seed → orders match into cross-margin perp positions → tour markets, operator and risk — the single-slot commitment tracking every step" />
      </Section>

      {/* The problem */}
      <Section className="!py-10">
        <Heading2 className="!text-2xl">Why on-chain order books are hard</Heading2>
        <Body className="mt-2 max-w-3xl text-neutral-600">
          A conventional on-chain CLOB runs matching, mark-to-market, funding accrual and liquidations inside a transaction, so
          throughput is capped by the block gas limit. That's why order-book perps live off-chain: dYdX moved to an app-chain,
          Lighter to a ZK-rollup, Vertex to an off-chain sequencer. {BRAND.name} takes the same "compute off-chain, settle
          on-chain" shape — but secures it with <span className="font-semibold">EigenLayer restaking</span> and compresses all
          on-chain state to a single slot.
        </Body>
      </Section>

      {/* How it works */}
      <Section id="how" className="!py-10">
        <Heading2 className="!text-2xl">How it works</Heading2>
        <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <Step n={1} title="The exchange is a witness, not storage">
              Balances, cross-margin positions, resting orders and per-market oracle/funding all live off-chain in an{" "}
              <code>ExchangeState</code>. On-chain, one slot holds{" "}
              <code>uint192(keccak256(state))</code> plus a <code>uint64</code> timestamp.
            </Step>
            <Step n={2} title="Every call carries the state and proves it">
              A mutator takes the full state as a <em>witness</em>, checks its hash matches the committed slot, applies the
              change in memory, and writes the new hash. The chain never stores the book — it only verifies you started from the
              real state.
            </Step>
            <Step n={3} title="Matching runs off-chain, unbounded">
              <code>settleEpoch</code> matches every market in price-time priority, opens positions, accrues funding and marks to
              the oracle. Off-chain it can burn hundreds of millions of gas; that's fine — it never touches a block.
            </Step>
            <Step n={4} title="Operators commit a single write">
              A committee of restaked operators runs the transition off-chain, BLS-signs the resulting 32-byte commitment, and a
              quorum lands it on-chain as one <code>SSTORE</code> via <code>verifyAndUpdate</code>.
            </Step>
          </div>
          <div className="rounded-2xl border border-black/10 bg-neutral-900 p-5 font-mono text-[13px] leading-relaxed text-neutral-100">
            <div className="text-neutral-400"># one storage slot commits everything</div>
            <div className="mt-1">
              STATE_SLOT ={"{"}
              <br />
              &nbsp;&nbsp;<span className="text-orange-300">bits[255:64]</span> = uint192(keccak256(state)),
              <br />
              &nbsp;&nbsp;<span className="text-orange-300">bits[63:0]</span>&nbsp;&nbsp;= uint64(lastTransitionAt)
              <br />
              {"}"}
            </div>
            <div className="mt-4 text-neutral-400"># applied on-chain in one op</div>
            <div className="mt-1">
              verifyAndUpdate(...) →<br />
              &nbsp;&nbsp;require(BLS quorum ≥ 66% stake)<br />
              &nbsp;&nbsp;<span className="text-emerald-300">SSTORE(STATE_SLOT, newCommitment)</span>
            </div>
          </div>
        </div>
      </Section>

      {/* HOW GAS KILLER ENABLES THIS — the centerpiece */}
      <div className="border-y border-black/10 bg-white/60">
        <Section id="gas-killer">
          <Heading2 className="!text-2xl">How Gas Killer enables this — precisely</Heading2>
          <Body className="mt-2 max-w-3xl text-neutral-600">
            {BRAND.name} is an example built on the <b>Gas Killer SDK</b>, an EigenLayer AVS pattern for "unbounded off-chain
            compute, O(1) on-chain state." Here is the exact chain of mechanisms that makes a single-slot perp DEX possible.
          </Body>

          <div className="mt-7 space-y-5">
            <Mech title="1 · State is a commitment, not a layout">
              A normal contract spends one storage slot per order and per position; the block gas limit then caps how much book
              can exist. Gas Killer inverts this: the contract stores <b>only</b> <code>uint192(keccak256(canonical_state))</code>.
              The expanded state is supplied by the caller as a witness and verified by re-hashing. Reads/writes of the "book" cost
              nothing on-chain because the book isn't on-chain — so the exchange's size is unbounded while its on-chain footprint is
              fixed at one slot.
            </Mech>
            <Mech title="2 · Unbounded execution profile off-chain">
              Operators run the transition (e.g. <code>settleEpoch</code>) under Gas Killer's{" "}
              <code>SimProfile::UnboundedV1</code> — a simulation profile with a gas limit of 2⁴⁰ (~1.1 Tgas), far above any
              block. A 1,200-order price-time match that costs ~527M gas simply runs to completion off-chain. A shape gate
              enforces that the transition ultimately reduces to a bounded set of on-chain effects.
            </Mech>
            <Mech title="3 · The result is a bounded diff: one STORE">
              However much compute a transition performs, its <i>effect</i> on-chain is a single storage diff:
              <code> STORE(STATE_SLOT, newCommitment)</code>. Gas Killer encodes state transitions as a typed list of primitive
              effects (STORE / CALL / LOG / CREATE); {BRAND.name}'s only effect is one STORE. That's why cost is O(1) in the size
              of the book.
            </Mech>
            <Mech title="4 · Restaked operators attest, a quorum applies">
              Off-chain operators compute the diff and BLS-sign the message{" "}
              <code>sha256(transitionIndex, contract, fn, storageUpdates)</code>. The inherited{" "}
              <code>verifyAndUpdate</code> checks the reference block is fresh, the transition index is next-in-sequence
              (replay protection), and that signatures represent ≥ 66% of restaked quorum stake — then applies the STORE. Trust
              is economic (restaking + slashing), not a validity proof: strictly weaker than a ZK-rollup, and honestly labeled so.
            </Mech>
            <Mech title="5 · A liveness backstop the operator can't block">
              Because users can reconstruct the state off-chain, a 7-day inactivity gate lets anyone withdraw free collateral via{" "}
              <code>emergencyWithdraw</code> if operators go silent. It deliberately does <i>not</i> reset the timer, so every user
              can exit even against a permanently-offline operator.
            </Mech>
          </div>

          <div className="mt-8">
            <Gif src="commitment.gif" alt="Single-slot commitment staying in sync" caption="Each action: off-chain state changes, the operator recomputes the hash, and it matches the on-chain slot exactly." />
          </div>
        </Section>
      </div>

      {/* Features */}
      <Section>
        <Heading2 className="!text-2xl">What the exchange does</Heading2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature title="Cross-margin perps" body="One collateral pool backs positions across markets; equity = collateral + unrealized PnL − funding owed." />
          <Feature title="Price-time order book" body="Resting limit orders matched in price-then-time priority, filled at the resting price, with self-trade prevention." />
          <Feature title="Funding" body="A sequencer posts each market's oracle price and a cumulative funding index; funding realizes into collateral on touch." />
          <Feature title="Health-based liquidation" body="Any account below maintenance margin is liquidatable; the liquidator inherits the position and must stay solvent." />
          <Feature title="Insurance fund" body="Liquidation penalties accrue to an insurance fund that absorbs bad debt." />
          <Feature title="Emergency exit" body="A 7-day operator-inactivity hatch lets users withdraw free collateral unilaterally." />
        </div>
      </Section>

      {/* Comparison */}
      <Section className="!py-10">
        <Heading2 className="!text-2xl">Where it sits</Heading2>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Property</th>
                <th className="px-4 py-2">Vertex</th>
                <th className="px-4 py-2">Lighter</th>
                <th className="px-4 py-2 font-bold text-neutral-800">{BRAND.name}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {[
                ["Matching", "Off-chain sequencer", "ZK-rollup sequencer", "Off-chain AVS operators"],
                ["Correctness", "On-chain risk re-check", "ZK validity proof", "EigenLayer BLS quorum (≥66%)"],
                ["On-chain state", "Per-position storage", "Merkle state root", "Single 32-byte commitment"],
                ["Product", "Hybrid book + AMM perps", "CLOB perps", "CLOB perps"],
                ["Trust", "Sequencer + on-chain checks", "Validity proof", "Restaking + slashing"],
              ].map((row) => (
                <tr key={row[0]}>
                  <td className="px-4 py-2 font-medium">{row[0]}</td>
                  <td className="px-4 py-2 text-neutral-600">{row[1]}</td>
                  <td className="px-4 py-2 text-neutral-600">{row[2]}</td>
                  <td className="px-4 py-2 font-medium text-neutral-800">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Caption className="mt-3 text-neutral-400">
          {BRAND.name} is a proof-of-concept demonstrating the Gas Killer pattern applied to perps — not a production exchange.
          Its security model (restaking + slashing) is intentionally weaker than a validity rollup.
        </Caption>
      </Section>

      {/* CTA */}
      <Section className="!py-16 text-center">
        <Heading3 className="!text-2xl">Drive it yourself</Heading3>
        <Body className="mx-auto mt-2 max-w-xl text-neutral-600">
          The console is the off-chain operator: deposit, list markets, trade, settle, liquidate, and watch the single-slot
          commitment track the off-chain state in real time.
        </Body>
        <div className="mt-6 flex justify-center gap-3">
          <Button as={Link} to="/app">
            Launch the app
          </Button>
          <Button as="a" href={BRAND.contractRepoUrl} target="_blank" variant="light">
            View the contract
          </Button>
        </div>
      </Section>

      <footer className="border-t border-black/10 py-8 text-center text-xs text-neutral-400">
        {BRAND.name} · {BRAND.powered} · UI by <a className="underline" href={BRAND.breadUrl}>@breadcoop/ui</a>
      </footer>
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold tracking-tight text-neutral-900">{big}</div>
      <div className="mt-1 text-sm text-neutral-500">{small}</div>
    </div>
  );
}

function Mech({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <Heading3 className="!text-base">{title}</Heading3>
      <Body className="mt-1 !text-sm leading-relaxed text-neutral-600">{children}</Body>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <Body bold>{title}</Body>
      <Body className="mt-1 !text-sm text-neutral-600">{body}</Body>
    </div>
  );
}
