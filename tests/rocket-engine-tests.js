/**
 * Node-tester for rocket-engine.js
 * Kor: node tests/rocket-engine-tests.js
 */
const {
  scoreForRocket,
  isPumpFlagged,
  MIN_ROCKET_SCORE,
} = require("../server/rocket-engine");

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error("FAIL:", msg);
    failed++;
    return;
  }
  console.log("OK:", msg);
  passed++;
}

const apwc = {
  ticker: "APWC",
  price: 1.99,
  change_pct: 43.1655,
  relative_volume: 62.2,
  confidence_score: 80,
  layers_triggered: 1,
  risk_score: 4,
  trigger_reason: "+43.2% | Vol: 47.7M | 62.2x snittvolym | PUMP-VARNING | $1-$5",
  risk_flags: '["Micro-price ($1-3)","Extreme daily move (>30%)"]',
};

const atpc = {
  ticker: "ATPC",
  price: 3.88,
  change_pct: 42.1245,
  relative_volume: 21.3,
  confidence_score: 80,
  layers_triggered: 1,
  risk_score: 4,
  trigger_reason: "+42.1% | Vol: 70.9M | 21.3x snittvolym | PUMP-VARNING | $1-$5",
  risk_flags: '["Extreme daily move (>30%)","Micro-cap (<$50M)"]',
};

const qxl = {
  ticker: "QXL",
  price: 6.35,
  change_pct: 12.9893,
  relative_volume: 5.04,
  confidence_score: 50,
  layers_triggered: 1,
  risk_score: 2,
  trigger_reason: "+13.0% | Vol: 376K | 5.0x snittvolym | EXTREM VOLYM | Nara 52v-high | $5-$10",
  risk_flags: "[]",
};

assert(isPumpFlagged(apwc), "APWC ska flaggas som pump");
assert(isPumpFlagged(atpc), "ATPC ska flaggas som pump");
assert(!isPumpFlagged(qxl), "QXL ska inte flaggas som pump");

const apwcScore = scoreForRocket(apwc);
const qxlScore = scoreForRocket(qxl);

assert(apwcScore < MIN_ROCKET_SCORE, "APWC score under tröskel (" + apwcScore + " < " + MIN_ROCKET_SCORE + ")");
assert(qxlScore >= MIN_ROCKET_SCORE, "QXL score over tröskel (" + qxlScore + " >= " + MIN_ROCKET_SCORE + ")");

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
