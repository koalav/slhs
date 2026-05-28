const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("docs/assets/simulator.js", "utf8");

const appendedTest = `
sim.latest = {
  market: {
    equities: {
      samsung: { price: 292000, change_pct: -0.0489 },
      skhynix: { price: 2191000, change_pct: -0.0232 },
    },
  },
  signals: { position_1h: { actual_hedge_h: 0.6821295143212951, samsung_contracts: 11 } },
};
sim.base = {
  latest: { samsung_close: 292000, skhynix_close: 2191000 },
  series: {
    dates: ["d0", "d1", "d2"],
    samsung_close: [100, 110, 105],
    skhynix_close: [200, 180, 190],
    beta_samsung_on_skhynix_60d: [null, 0.5, 0.6],
    beta_skhynix_on_samsung_60d: [null, 0.8, 0.9],
    vol_hedge_h_60d: [null, 0.7, 0.75],
  },
};

const c = {
  h: 0.6821295143212951,
  multiplier: 1,
  samsungContracts: 110,
  capital: 100000000,
  samsungExpected: 292000,
  hynixExpected: 2191000,
  bufferMultiple: 3,
  samsungMarginRate: 0.291,
  hynixMarginRate: 0.2925,
  feeBps: 0.5,
  slippageBps: 2,
};

const p = buildPosition(c);
assert.strictEqual(p.samsungExposure, 32120000);
assert.strictEqual(p.hynixContracts, 10);
assert.strictEqual(p.hynixExposure, 21910000);
assert.ok(Math.abs(p.actualH - 0.6821295143212951) < 1e-12);
assert.strictEqual(p.grossNotional, 54030000);

const m = computeMargin(c, p);
assert.strictEqual(m.required, 15755595);
assert.strictEqual(m.recommended, 47280292.5);

const flat = computeForward(c, p);
assert.strictEqual(flat.grossPnl, 0);
assert.strictEqual(flat.entryCost, 13507.5);
assert.strictEqual(flat.exitCost, 13507.5);
assert.strictEqual(flat.roundTripCost, 27015);
assert.strictEqual(flat.netPnl, -27015);

const upDown = computeForward({ ...c, samsungExpected: 321200, hynixExpected: 1971900 }, p);
assert.strictEqual(upDown.samsungPnl, 3212000);
assert.strictEqual(upDown.hynixPnl, 2191000);
assert.strictEqual(upDown.grossPnl, 5403000);
assert.ok(upDown.netPnl < upDown.grossPnl);

const bt = computeBacktest({ ...c, samsungContracts: 100, multiplier: 1, capital: 1000000, h: 1 });
assert.deepStrictEqual(bt.equity, [1000000, 1001260, 1000630]);
assert.strictEqual(bt.position.hynixContracts, 13);

const refs = hReferenceValues();
assert.strictEqual(refs.signal, 0.6821295143212951);
assert.strictEqual(refs.beta, 0.6);
assert.strictEqual(refs.reverseBeta, 0.9);
assert.strictEqual(refs.vol, 0.75);

const rolling = computeRollingBetaBacktest({
  ...c,
  samsungContracts: 100,
  multiplier: 1,
  capital: 1000000,
  h: 1,
});
assert.strictEqual(rolling.hUsed.length, 3);
assert.strictEqual(rolling.hynixContracts[1], 50);
assert.strictEqual(rolling.latestH, 0.6);
assert.strictEqual(rolling.latestPosition.hynixContracts, 8);

"ok";
`;

const context = {
  assert,
  console,
  document: {
    getElementById() {
      return { value: 0, textContent: "", classList: { toggle() {} }, addEventListener() {} };
    },
  },
  window: { location: { href: "http://localhost/" }, addEventListener() {} },
  Chart: function Chart() {},
  fetch() {
    throw new Error("fetch should not run in unit tests");
  },
  URL,
  Number,
  Math,
};

vm.runInNewContext(`${source}\n${appendedTest}`, context, { filename: "simulator.vm.js" });
console.log("simulator calculation tests passed");
