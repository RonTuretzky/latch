// Headless recorder — drives the Latch console against a local anvil and records a webm the
// orchestrator converts to a GIF. SCENARIO selects the flow. (Used only for producing demo media.)
import { chromium } from "playwright";

const scenario = process.env.SCENARIO || "demo";
const base = process.env.BASE || "http://localhost:5173";
const outDir = `/tmp/rec/${scenario}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 860 } },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

const wait = (ms) => page.waitForTimeout(ms);
const clickIf = async (name) => {
  const b = page.getByRole("button", { name });
  if (await b.count()) {
    await b.first().click();
    return true;
  }
  return false;
};

await page.goto(`${base}/#/app`, { waitUntil: "domcontentloaded" });
await wait(2500);

if (scenario === "demo") {
  await clickIf(/Seed demo scenario/i);
  await wait(15000); // list market + 2 approvals + 2 deposits + 2 orders + settle
  await wait(2500);
  // tour the tabs so the gif shows the whole console, not just the Trade view
  for (const t of ["Markets", "Operator", "Risk & liquidations", "Trade"]) {
    await page.getByRole("button", { name: new RegExp(`^${t}`) }).first().click();
    await wait(2200);
  }
} else if (scenario === "commitment") {
  // Manual sequence, keeping the right-rail "single-slot commitment" panel visible the whole time.
  await clickIf(/Approve USDC/i);
  await wait(2800);
  await clickIf(/^Deposit$/);
  await wait(3200);
  await page.getByRole("button", { name: /^Markets$/ }).first().click();
  await wait(1000);
  await clickIf(/^List market$/);
  await wait(3200);
} else if (scenario === "tour") {
  for (const t of ["Markets", "Operator", "Risk & liquidations", "Trade"]) {
    await page.getByRole("button", { name: new RegExp(`^${t}`) }).first().click();
    await wait(1600);
  }
}

await wait(1200);
await ctx.close(); // flushes the video file
await browser.close();
console.log(`recorded ${scenario}`);
