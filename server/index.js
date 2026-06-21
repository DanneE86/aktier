const express = require("express");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
const db = require("./db");
const { runFullScan, CONFIG } = require("./scanner");
const { registerFloatRoutes, runFloatSqueezeScan, DEFAULT_SQUEEZE_WATCHLIST } = require("./float-scanner");
const { generateRockets, verifyRockets, getRockets, getRocketHistory, getYesterdayRocketTips } = require("./rocket-engine");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, ".."), { etag: false, maxAge: 0 }));

// ── Input validation ───────────────────────────────────────────
const ALLOWED_TYPES = ["momentum", "catalyst", "watchlist", "trending"];
const ALLOWED_TIERS = ["under1", "under5", "5to10"];
const ALLOWED_SORTS = ["confidence", "price", "change", "risk"];

// ── API ROUTES ──────────────────────────────────────────────────

app.get("/api/scanner/today", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  let hits = db.getHitsForDate(today);

  // Filter by type (validated)
  const type = req.query.type;
  if (type && ALLOWED_TYPES.includes(type)) {
    hits = hits.filter((h) => h.scanner_type === type);
  }

  // Filter by price tier (validated)
  const tier = req.query.tier;
  if (tier && ALLOWED_TIERS.includes(tier)) {
    if (tier === "under1") hits = hits.filter((h) => h.price < 1);
    else if (tier === "under5") hits = hits.filter((h) => h.price < 5);
    else if (tier === "5to10") hits = hits.filter((h) => h.price >= 5 && h.price <= 10);
  }

  // Sort (validated)
  const sort = ALLOWED_SORTS.includes(req.query.sort) ? req.query.sort : "confidence";
  if (sort === "price") hits.sort((a, b) => a.price - b.price);
  else if (sort === "change") hits.sort((a, b) => Math.abs(b.change_pct || 0) - Math.abs(a.change_pct || 0));
  else if (sort === "risk") hits.sort((a, b) => (a.risk_score || 3) - (b.risk_score || 3));
  else hits.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));

  // Limit
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const total = hits.length;
  hits = hits.slice(0, limit);

  const parsed = hits.map((h) => ({ ...h, risk_flags: safeJsonParse(h.risk_flags) }));
  res.json({ date: today, count: parsed.length, total, hits: parsed });
});

app.get("/api/scanner/history", (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 30);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const hits = db.getAllHitsSince(cutoff.toISOString().split("T")[0]);
  const parsed = hits.map((h) => ({ ...h, risk_flags: safeJsonParse(h.risk_flags) }));
  res.json({ days, count: parsed.length, hits: parsed });
});

app.get("/api/scanner/stats", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const lastScan = db.getLastScanLog();
  const todayHits = db.getHitsForDate(today).length;
  const todayKilled = db.getKilledForDate(today).length;
  res.json({
    lastScan,
    todayHits,
    todayKilled,
    config: { maxHitsPerDay: CONFIG.maxHitsPerDay, priceRange: `$${CONFIG.minPrice}-$${CONFIG.maxPrice}` },
  });
});

app.get("/api/curated", (req, res) => {
  const picks = db.getCuratedPicks();
  res.json({ count: picks.length, picks });
});

app.post("/api/scanner/run", async (req, res) => {
  try {
    const hits = await runFullScan();
    res.json({ success: true, count: hits.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/scanner/killed", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const killed = db.getKilledForDate(today);
  res.json({ date: today, count: killed.length, killed });
});

function safeJsonParse(str) { try { return JSON.parse(str); } catch { return []; } }

// ── ROCKET PREDICTIONS API ──────────────────────────────────────

app.get("/api/rockets/today", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  let prediction = getRockets(today);
  if (!prediction) {
    prediction = generateRockets();
    if (!prediction) return res.json({ date: today, rockets: [], message: "Ingen scanner-data. Kor en scan forst." });
  }
  res.json(prediction);
});

app.post("/api/rockets/generate", (req, res) => {
  const prediction = generateRockets();
  if (!prediction) return res.status(400).json({ error: "Ingen scanner-data att basera raketer pa." });
  res.json(prediction);
});

app.get("/api/rockets/history", (req, res) => {
  const history = getRocketHistory();
  res.json({ count: history.length, predictions: history });
});

app.get("/api/rockets/yesterday", (req, res) => {
  const tips = getYesterdayRocketTips();
  if (!tips) return res.json({ rockets: [], message: "Inga sparade tips fran igar." });
  res.json(tips);
});

app.post("/api/rockets/verify", async (req, res) => {
  const date = req.body.date || new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const result = await verifyRockets(date);
  if (!result) return res.status(404).json({ error: "Inga prediktioner for " + date });
  res.json(result);
});

// ── FLOAT & SHORT SQUEEZE API ROUTES ──────────────────────────────
registerFloatRoutes(app);

// Cron: scan at market open (14:30 UTC) and midday (18:00 UTC)
cron.schedule("30 14 * * 1-5", () => {
  console.log("Scheduled morning scan...");
  runFullScan().catch(console.error);
});
cron.schedule("0 18 * * 1-5", () => {
  console.log("Scheduled midday scan...");
  runFullScan().catch(console.error);
});

// Float squeeze scan: 15:00 UTC (30 min efter market open) och 19:00 UTC
cron.schedule("0 15 * * 1-5", () => {
  console.log("Scheduled float squeeze scan (market open +30min)...");
  runFloatSqueezeScan(DEFAULT_SQUEEZE_WATCHLIST, { enrichTopCandidates: true, enrichLimit: 15 }).catch(console.error);
});
cron.schedule("0 19 * * 1-5", () => {
  console.log("Scheduled float squeeze scan (afternoon)...");
  runFloatSqueezeScan(DEFAULT_SQUEEZE_WATCHLIST, { enrichTopCandidates: true, enrichLimit: 15 }).catch(console.error);
});

app.listen(PORT, () => {
  console.log(`\nStock Scanner Backend: http://localhost:${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}/stocks.html`);
  console.log(`API: http://localhost:${PORT}/api/scanner/today`);
  console.log(`Float API: http://localhost:${PORT}/api/float/scan`);
  console.log(`Squeeze: http://localhost:${PORT}/api/float/squeeze-candidates`);
  console.log(`Float Rotation: http://localhost:${PORT}/api/float/rotation-leaders`);
  console.log(`\nRunning initial scan...`);
  runFullScan().catch(console.error);
});
