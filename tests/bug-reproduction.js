// Bug reproduction: Support shows $1,595 instead of $1,700 levels
// This simulates REALISTIC crypto volatility to expose the root cause.

function findLocalExtremes(prices, lookback = 5) {
  const maxima = [], minima = [];
  for (let i = lookback; i < prices.length - lookback; i++) {
    let isMax = true, isMin = true;
    for (let j = 1; j <= lookback; j++) {
      if (prices[i] <= prices[i - j] || prices[i] <= prices[i + j]) isMax = false;
      if (prices[i] >= prices[i - j] || prices[i] >= prices[i + j]) isMin = false;
    }
    if (isMax) maxima.push({ price: prices[i], idx: i });
    if (isMin) minima.push({ price: prices[i], idx: i });
  }
  return { maxima, minima };
}

function clusterLevels(points, totalLen, tolerance = 0.04) {
  const clusters = [];
  for (const pt of [...points].sort((a, b) => a.price - b.price)) {
    const c = clusters.find(c => Math.abs(c.price - pt.price) / c.price < tolerance);
    if (c) {
      c.price = (c.price * c.touches + pt.price) / (c.touches + 1);
      c.touches++;
      if (pt.idx > c.lastIdx) c.lastIdx = pt.idx;
    } else {
      clusters.push({ price: pt.price, touches: 1, lastIdx: pt.idx });
    }
  }
  return clusters
    .map(c => ({ ...c, score: c.touches + c.lastIdx / totalLen }))
    .sort((a, b) => b.score - a.score);
}

function findConsolidationZones(prices, windowSize = 10, maxRange = 0.03) {
  const zones = [];
  for (let i = 0; i <= prices.length - windowSize; i++) {
    const w = prices.slice(i, i + windowSize);
    const hi = Math.max(...w);
    const lo = Math.min(...w);
    const mid = (hi + lo) / 2;
    if ((hi - lo) / mid < maxRange) {
      zones.push({ price: mid, idx: i + Math.floor(windowSize / 2) });
    }
  }
  return zones;
}

function findVolumeProfile(prices, volumes, numBins = 20) {
  if (!volumes || volumes.length < 10) return [];
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  if (hi === lo) return [];
  const binSize = (hi - lo) / numBins;
  const bins = Array.from({ length: numBins }, (_, i) => ({
    price: lo + binSize * (i + 0.5),
    volume: 0,
    lastDataIdx: 0,
  }));
  for (let i = 0; i < prices.length; i++) {
    const bi = Math.min(Math.floor((prices[i] - lo) / binSize), numBins - 1);
    bins[bi].volume += volumes[i] || 0;
    bins[bi].lastDataIdx = Math.max(bins[bi].lastDataIdx, i);
  }
  const avgVol = bins.reduce((s, b) => s + b.volume, 0) / numBins;
  if (avgVol === 0) return [];
  const points = [];
  for (const b of bins) {
    if (b.volume <= avgVol * 1.5) continue;
    const strength = Math.round(b.volume / avgVol);
    for (let k = 0; k < strength; k++) {
      points.push({ price: b.price, idx: b.lastDataIdx });
    }
  }
  return points;
}

// Seed PRNG
let seed = 123;
function rng() {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

// SCENARIO: ETH with sharp V-dip to $1,595, then CHOPPY consolidation
// around $1,680-$1,730 with REAL crypto volatility (3-5% daily candles)

const prices = [];
const volumes = [];

// Phase 1: Drop from $2,200 to $1,595 with HIGH volatility (90 days)
for (let i = 0; i < 90; i++) {
  const base = 2200 - (2200 - 1595) * (i / 89);
  const vol = 0.03 + rng() * 0.02;
  prices.push(base * (1 + (rng() - 0.5) * 2 * vol));
  volumes.push(15e9 + rng() * 25e9);
}

// Phase 2: CHOPPY consolidation $1,680-$1,730 (220 days)
for (let i = 0; i < 220; i++) {
  const base = 1705 + Math.sin(i * 0.08) * 25;
  const vol = 0.025 + rng() * 0.02;
  prices.push(base * (1 + (rng() - 0.5) * 2 * vol));
  volumes.push(18e9 + rng() * 20e9);
}

// Phase 3: Recent uptick to $1,720 (55 days)
for (let i = 0; i < 55; i++) {
  const base = 1710 + (i / 54) * 10;
  const vol = 0.02 + rng() * 0.015;
  prices.push(base * (1 + (rng() - 0.5) * 2 * vol));
  volumes.push(12e9 + rng() * 18e9);
}

const currentPrice = prices[prices.length - 1];
const n = prices.length;
const recentLen = Math.min(90, n);
const recentPrices = prices.slice(-recentLen);
const recentVols = volumes.slice(-recentLen);

console.log("============================================================");
console.log("BUG REPRODUCTION: Support shows $1,595 instead of $1,700");
console.log("============================================================");
console.log("Total days:", n);
console.log("Current price: $" + currentPrice.toFixed(2));
console.log("Recent 90d range: $" + Math.min(...recentPrices).toFixed(2) +
  " - $" + Math.max(...recentPrices).toFixed(2));
console.log("");

// Check: how volatile is the recent data?
let maxDailyPctChange = 0;
for (let i = 1; i < recentPrices.length; i++) {
  const pct = Math.abs(recentPrices[i] - recentPrices[i-1]) / recentPrices[i-1];
  if (pct > maxDailyPctChange) maxDailyPctChange = pct;
}
console.log("Max daily change in 90d: " + (maxDailyPctChange * 100).toFixed(1) + "%");

// What does a typical 10-day window range look like?
let ranges = [];
for (let i = 0; i <= recentPrices.length - 10; i++) {
  const w = recentPrices.slice(i, i + 10);
  const r = (Math.max(...w) - Math.min(...w)) / ((Math.max(...w) + Math.min(...w)) / 2);
  ranges.push(r);
}
const avgRange10d = ranges.reduce((a,b) => a+b, 0) / ranges.length;
const pctBelow3 = ranges.filter(r => r < 0.03).length / ranges.length * 100;
const pctBelow5 = ranges.filter(r => r < 0.05).length / ranges.length * 100;
const pctBelow6 = ranges.filter(r => r < 0.06).length / ranges.length * 100;

console.log("");
console.log("10-day window range statistics:");
console.log("  Average range: " + (avgRange10d * 100).toFixed(1) + "%");
console.log("  Min range: " + (Math.min(...ranges) * 100).toFixed(1) + "%");
console.log("  Max range: " + (Math.max(...ranges) * 100).toFixed(1) + "%");
console.log("  % windows below 3%: " + pctBelow3.toFixed(0) + "%");
console.log("  % windows below 5%: " + pctBelow5.toFixed(0) + "%");
console.log("  % windows below 6%: " + pctBelow6.toFixed(0) + "%");

console.log("");
console.log("CONSOLIDATION ZONES:");
const zones3 = findConsolidationZones(recentPrices, 10, 0.03);
const zones5 = findConsolidationZones(recentPrices, 10, 0.05);
const zones6 = findConsolidationZones(recentPrices, 10, 0.06);
console.log("  maxRange=3%: " + zones3.length + " zones");
console.log("  maxRange=5%: " + zones5.length + " zones");
console.log("  maxRange=6%: " + zones6.length + " zones");

// Also test smaller windows
const zones3_w5 = findConsolidationZones(recentPrices, 5, 0.03);
const zones3_w7 = findConsolidationZones(recentPrices, 7, 0.03);
console.log("  maxRange=3%, windowSize=5: " + zones3_w5.length + " zones");
console.log("  maxRange=3%, windowSize=7: " + zones3_w7.length + " zones");

console.log("");
console.log("VOLUME PROFILE (recent 90d):");
const vp = findVolumeProfile(recentPrices, recentVols, 20);
const binSize = (Math.max(...recentPrices) - Math.min(...recentPrices)) / 20;
console.log("  Bin size: $" + binSize.toFixed(2));
console.log("  Points found: " + vp.length);
const uniqueVP = [...new Set(vp.map(p => p.price))];
uniqueVP.forEach(p => {
  console.log("    $" + p.toFixed(2) + " (x" + vp.filter(pp => pp.price === p).length + ")");
});

console.log("");
console.log("LOCAL EXTREMES (full 365d, lookback=3):");
const { maxima, minima } = findLocalExtremes(prices, 3);
console.log("  Maxima count:", maxima.length);
console.log("  Minima count:", minima.length);
const minimaNear1595 = minima.filter(m => m.price < 1650);
const minimaNear1700 = minima.filter(m => m.price >= 1650 && m.price <= 1750);
console.log("  Minima below $1,650:", minimaNear1595.length);
console.log("  Minima near $1,700 ($1,650-$1,750):", minimaNear1700.length);

// Show top 5 minima by recency
const sortedMinima = [...minima].sort((a, b) => b.idx - a.idx);
console.log("  Most recent 10 minima:");
sortedMinima.slice(0, 10).forEach((m, i) => {
  console.log("    " + (i+1) + ". $" + m.price.toFixed(2) + " (day " + m.idx + "/" + n + ")");
});

console.log("");
console.log("SUPPORT POINT SOURCES:");
const idxOffset = n - recentLen;
const consolZonesAdj = zones3.map(z => ({ price: z.price, idx: z.idx + idxOffset }));
const volProfileAdj = vp.map(v => ({ price: v.price, idx: v.idx + idxOffset }));

const minimaBelow = minima.filter(m => m.price < currentPrice);
const consolBelow = consolZonesAdj.filter(z => z.price < currentPrice);
const volBelow = volProfileAdj.filter(v => v.price < currentPrice);

console.log("  From minima (below current): " + minimaBelow.length);
console.log("  From consolidation 3% (below current): " + consolBelow.length);
console.log("  From volume profile (below current): " + volBelow.length);

const allSupportPts = [...minimaBelow, ...consolBelow, ...volBelow];
const clusters = clusterLevels(allSupportPts, n, 0.04);

console.log("");
console.log("CLUSTERED SUPPORT (all, before 0.995 filter):");
clusters.slice(0, 10).forEach((c, i) => {
  console.log("  " + (i+1) + ". $" + c.price.toFixed(2) +
    " touches=" + c.touches + " score=" + c.score.toFixed(2));
});

const cutoff = currentPrice * 0.995;
const rawSupport = clusters.filter(c => c.price < cutoff);
console.log("");
console.log("AFTER 0.995 FILTER (cutoff=$" + cutoff.toFixed(2) + "):");
rawSupport.sort((a, b) => b.price - a.price).slice(0, 8).forEach((c, i) => {
  console.log("  " + (i+1) + ". $" + c.price.toFixed(2) +
    " touches=" + c.touches + " score=" + c.score.toFixed(2));
});

console.log("");
console.log("============================================================");
console.log("ROOT CAUSE ANALYSIS");
console.log("============================================================");

if (zones3.length < 5) {
  console.log("ROOT CAUSE CONFIRMED: maxRange=0.03 finds only " + zones3.length +
    " consolidation zones");
  console.log("With realistic crypto volatility:");
  console.log("  - Average 10-day window range is " + (avgRange10d*100).toFixed(1) + "%");
  console.log("  - Only " + pctBelow3.toFixed(0) + "% of windows have range < 3%");
  console.log("  - This means findConsolidationZones contributes almost nothing");
  console.log("  - Support falls back to findLocalExtremes minima only");
  console.log("  - Those minima are dominated by the $1,595 dip from phase 1");
  console.log("");
  console.log("RECOMMENDED FIX:");
  console.log("  Option A: Increase maxRange from 0.03 to 0.05 or 0.06");
  console.log("  Option B: Decrease windowSize from 10 to 5 or 7");
  console.log("  Option C: Both (windowSize=7, maxRange=0.05)");
  console.log("  With maxRange=5%: " + zones5.length + " zones found");
  console.log("  With maxRange=6%: " + zones6.length + " zones found");
} else {
  console.log("Consolidation zones found: " + zones3.length);
  console.log("The 3% threshold works for this data distribution.");
  console.log("Bug may be elsewhere.");
}
