const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "scanner-data.json");

const EMPTY_DB = {
  scanner_hits: [],
  curated_picks: [],
  kill_filter_log: [],
  scan_log: [],
};

function readDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    }
  } catch (e) {
    console.warn("DB read error, resetting:", e.message);
  }
  return structuredClone(EMPTY_DB);
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function getHitsForDate(date) {
  const db = readDb();
  return db.scanner_hits.filter((h) => h.scan_date === date);
}

function clearHitsForDate(date) {
  const db = readDb();
  db.scanner_hits = db.scanner_hits.filter((h) => h.scan_date !== date);
  writeDb(db);
}

function insertHits(hits) {
  const db = readDb();
  const maxId = db.scanner_hits.reduce((max, h) => Math.max(max, h.id || 0), 0);
  hits.forEach((h, i) => {
    h.id = maxId + i + 1;
    h.created_at = new Date().toISOString();
    db.scanner_hits.push(h);
  });
  writeDb(db);
}

function insertKillLog(ticker, reason, date) {
  const db = readDb();
  db.kill_filter_log.push({ ticker, reason, scan_date: date });
  writeDb(db);
}

function insertScanLog(entry) {
  const db = readDb();
  db.scan_log.push({ ...entry, completed_at: new Date().toISOString() });
  writeDb(db);
}

function getLastScanLog() {
  const db = readDb();
  return db.scan_log.length > 0 ? db.scan_log[db.scan_log.length - 1] : null;
}

function getKilledForDate(date) {
  const db = readDb();
  return db.kill_filter_log.filter((k) => k.scan_date === date);
}

function getCuratedPicks() {
  const db = readDb();
  return db.curated_picks.filter((p) => p.status === "active");
}

function getAllHitsSince(cutoffDate) {
  const db = readDb();
  return db.scanner_hits
    .filter((h) => h.scan_date >= cutoffDate)
    .sort((a, b) => {
      if (b.scan_date !== a.scan_date) return b.scan_date.localeCompare(a.scan_date);
      return (b.confidence_score || 0) - (a.confidence_score || 0);
    });
}

module.exports = {
  readDb,
  writeDb,
  getHitsForDate,
  clearHitsForDate,
  insertHits,
  insertKillLog,
  insertScanLog,
  getLastScanLog,
  getKilledForDate,
  getCuratedPicks,
  getAllHitsSince,
};
