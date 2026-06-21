const fs = require("fs");
const path = require("path");
const db = require("./db");

const PREDICTIONS_DIR = path.join(__dirname, "predictions");
const ROCKETS_DB = path.join(PREDICTIONS_DIR, "rockets.json");

/** Min score enligt Rocket Signal Aggregator – under detta publiceras ingen pick. */
const MIN_ROCKET_SCORE = 65;
/** Max antal raketer per dag (Signal Aggregator: max 3). */
const DEFAULT_ROCKET_COUNT = 3;

function readRocketsDb() {
  try {
    if (fs.existsSync(ROCKETS_DB)) {
      return JSON.parse(fs.readFileSync(ROCKETS_DB, "utf-8"));
    }
  } catch (e) {
    console.warn("Rockets DB read error:", e.message);
  }
  return { predictions: [] };
}

function writeRocketsDb(data) {
  if (!fs.existsSync(PREDICTIONS_DIR)) fs.mkdirSync(PREDICTIONS_DIR, { recursive: true });
  fs.writeFileSync(ROCKETS_DB, JSON.stringify(data, null, 2), "utf-8");
}

function getNextTradingDay(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function triggerReason(hit) {
  return (hit.trigger_reason || "").toLowerCase();
}

function riskFlagsString(hit) {
  return typeof hit.risk_flags === "string"
    ? hit.risk_flags
    : JSON.stringify(hit.risk_flags || []);
}

/** Hårt filter: pump-flaggor från scannern eller extrem rörelse utan katalysator. */
function isPumpFlagged(hit) {
  const reason = triggerReason(hit);
  if (reason.includes("pump-varning") || reason.includes("pump warning")) return true;

  const flags = riskFlagsString(hit);
  const hasCatalyst =
    reason.includes("sec") ||
    reason.includes("8-k") ||
    reason.includes("insider") ||
    reason.includes("ceo") ||
    reason.includes("fda") ||
    reason.includes("earnings");

  if (flags.includes("Extreme daily move") && !hasCatalyst) return true;

  return false;
}

function scoreForRocket(hit) {
  let score = 0;

  // 1. Momentum (positive change = bullish for continuation in penny stocks)
  const change = Math.abs(hit.change_pct || 0);
  if (hit.change_pct > 5 && hit.change_pct < 40) score += 20;
  else if (hit.change_pct > 2) score += 10;
  if (hit.change_pct > 40) score -= 10; // Too extended, pullback risk

  // 2. Volume confirmation
  const relVol = hit.relative_volume || 0;
  if (relVol > 5) score += 25;
  else if (relVol > 3) score += 20;
  else if (relVol > 1.5) score += 10;

  // 3. Confidence from scanner
  const conf = hit.confidence_score || 0;
  if (conf >= 80) score += 20;
  else if (conf >= 60) score += 15;
  else if (conf >= 40) score += 10;

  // 4. Multiple scanner layers = stronger signal
  const layers = hit.layers_triggered || 1;
  score += Math.min(layers * 5, 15);

  // 5. Catalyst presence (SEC filing, insider, etc.)
  const reason = triggerReason(hit);
  if (reason.includes("sec") || reason.includes("8-k")) score += 10;
  if (reason.includes("insider") || reason.includes("ceo")) score += 10;
  if (reason.includes("52v-high") || reason.includes("breakout")) score += 10;
  if (reason.includes("float rotation")) score += 8;
  if (reason.includes("short")) score += 5;

  // 6. Risk penalty
  const risk = hit.risk_score || 3;
  if (risk >= 5) score -= 15;
  else if (risk >= 4) score -= 5;
  else if (risk <= 2) score += 5;

  // 7. Red flags (pump hanteras via isPumpFlagged – hårt uteslutna före scoring)
  const flags = riskFlagsString(hit);
  if (flags.includes("Extreme daily move")) score -= 5;

  // 8. Price tier bonus (under $1 = higher percentage potential)
  if (hit.price < 1) score += 5;
  else if (hit.price < 3) score += 3;

  return Math.max(0, score);
}

function generateRockets(options = {}) {
  const {
    count = DEFAULT_ROCKET_COUNT,
    maxPrice = 10,
    minPrice = 0.01,
    minScore = MIN_ROCKET_SCORE,
  } = options;
  const today = new Date().toISOString().split("T")[0];
  const targetDate = getNextTradingDay(today);

  const hits = db.getHitsForDate(today);
  if (hits.length === 0) return null;

  const inPriceRange = h => h.price >= minPrice && h.price <= maxPrice;
  const bullish = h => h.change_pct > 0;

  const candidates = hits.filter(h => inPriceRange(h) && bullish(h));
  const excludedPump = candidates.filter(isPumpFlagged);
  const eligible = candidates.filter(h => !isPumpFlagged(h));

  const scored = eligible
    .map(h => ({
      ...h,
      rocket_score: scoreForRocket(h),
      risk_flags: typeof h.risk_flags === "string" ? safeJsonParse(h.risk_flags) : (h.risk_flags || []),
    }))
    .sort((a, b) => b.rocket_score - a.rocket_score);

  const qualified = scored.filter(h => h.rocket_score >= minScore);
  const top = qualified.slice(0, count);

  const prediction = {
    id: `rocket-${today}`,
    prediction_date: today,
    target_date: targetDate,
    generated_at: new Date().toISOString(),
    scanner_universe: hits.length,
    candidates_scored: scored.length,
    filters: {
      min_rocket_score: minScore,
      max_picks: count,
      excluded_pump_count: excludedPump.length,
      below_threshold_count: scored.length - qualified.length,
    },
    rockets: top.map(h => ({
      ticker: h.ticker,
      name: h.name || h.ticker,
      price_at_prediction: h.price,
      change_today: h.change_pct,
      rocket_score: h.rocket_score,
      volume: h.volume || 0,
      relative_volume: h.relative_volume || 0,
      confidence_score: h.confidence_score || 0,
      risk_score: h.risk_score || 3,
      scanner_type: h.scanner_type,
      trigger_reason: h.trigger_reason,
      risk_flags: h.risk_flags || [],
      result: null,
    })),
  };

  // Save to rockets DB
  const rdb = readRocketsDb();
  const existingIdx = rdb.predictions.findIndex(p => p.prediction_date === today);
  if (existingIdx >= 0) {
    rdb.predictions[existingIdx] = prediction;
  } else {
    rdb.predictions.push(prediction);
  }
  writeRocketsDb(rdb);
  saveRocketSnapshot(prediction);

  return prediction;
}

async function verifyRockets(predictionDate) {
  const rdb = readRocketsDb();
  const pred = rdb.predictions.find(p => p.prediction_date === predictionDate);
  if (!pred) return null;

  const tickers = pred.rockets.map(r => r.ticker).join(",");

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const quotes = data?.quoteResponse?.result || [];

    for (const rocket of pred.rockets) {
      const q = quotes.find(qq => qq.symbol === rocket.ticker);
      if (!q) continue;
      const currentPrice = q.regularMarketPrice;
      if (!currentPrice) continue;

      const changePct = ((currentPrice - rocket.price_at_prediction) / rocket.price_at_prediction) * 100;
      rocket.result = {
        verified_at: new Date().toISOString(),
        current_price: currentPrice,
        change_pct: Math.round(changePct * 100) / 100,
        was_correct: changePct > 0,
        hit_20pct: changePct >= 20,
        hit_stop_loss: changePct <= -8,
      };
    }

    const verified = pred.rockets.filter(r => r.result);
    const correct = verified.filter(r => r.result.was_correct);
    pred.summary = {
      verified_count: verified.length,
      correct_count: correct.length,
      hit_rate: verified.length > 0 ? Math.round((correct.length / verified.length) * 100) : 0,
      rockets_20pct: verified.filter(r => r.result.hit_20pct).length,
      avg_change: verified.length > 0
        ? Math.round(verified.reduce((s, r) => s + r.result.change_pct, 0) / verified.length * 100) / 100
        : 0,
    };

    writeRocketsDb(rdb);

    const snapshot = readRocketSnapshot(pred.target_date);
    if (snapshot) {
      snapshot.verification = {
        ...snapshot.verification,
        verified_at: new Date().toISOString(),
        result: pred.summary,
        rockets: pred.rockets.map(r => ({ ticker: r.ticker, result: r.result || null })),
      };
      writeRocketSnapshot(snapshot);
    }

    return pred;
  } catch (e) {
    console.warn("Rocket verification error:", e.message);
    return pred;
  }
}

function getRockets(date) {
  const rdb = readRocketsDb();
  return rdb.predictions.find(p => p.prediction_date === date) || null;
}

function getRocketHistory() {
  const rdb = readRocketsDb();
  return rdb.predictions
    .sort((a, b) => b.prediction_date.localeCompare(a.prediction_date))
    .slice(0, 30);
}

function safeJsonParse(str) { try { return JSON.parse(str); } catch { return []; } }

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function getWeekdayName(dateStr) {
  return WEEKDAY_NAMES[new Date(dateStr + "T12:00:00Z").getUTCDay()];
}

/** Snapshot för manuell uppföljning – en fil per målhandelsdag. */
function buildRocketSnapshot(prediction) {
  const price = p => p.price_at_prediction;
  return {
    title: "Morgondagens raketer",
    prediction_date: prediction.prediction_date,
    target_date: prediction.target_date,
    target_day: getWeekdayName(prediction.target_date),
    generated_at: prediction.generated_at,
    scanner_universe: prediction.scanner_universe,
    filters: prediction.filters,
    rockets: prediction.rockets.map(r => ({
      ...r,
      target_20pct: Math.round(price(r) * 1.2 * 100) / 100,
      stop_loss_8pct: Math.round(price(r) * 0.92 * 100) / 100,
    })),
    verification: {
      check_date: prediction.target_date,
      check_time: "16:00 ET (market close)",
      success_criteria: "+20% fran price_at_prediction = raket träffad. Under -8% = stop-loss.",
      result: null,
    },
  };
}

function snapshotPathForTargetDate(targetDate) {
  return path.join(PREDICTIONS_DIR, `${targetDate}-morgondagens-raketer.json`);
}

function saveRocketSnapshot(prediction) {
  if (!fs.existsSync(PREDICTIONS_DIR)) fs.mkdirSync(PREDICTIONS_DIR, { recursive: true });
  const snapshot = buildRocketSnapshot(prediction);
  fs.writeFileSync(snapshotPathForTargetDate(prediction.target_date), JSON.stringify(snapshot, null, 2), "utf-8");
  return snapshot;
}

function readRocketSnapshot(targetDate) {
  const file = snapshotPathForTargetDate(targetDate);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function writeRocketSnapshot(snapshot) {
  fs.writeFileSync(snapshotPathForTargetDate(snapshot.target_date), JSON.stringify(snapshot, null, 2), "utf-8");
}

module.exports = {
  generateRockets,
  verifyRockets,
  getRockets,
  getRocketHistory,
  scoreForRocket,
  isPumpFlagged,
  saveRocketSnapshot,
  readRocketSnapshot,
  MIN_ROCKET_SCORE,
  DEFAULT_ROCKET_COUNT,
};
