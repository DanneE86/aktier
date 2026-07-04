// =============================================================================
// Test: Stod/Motstands-algoritm -- findConsolidationZones, findVolumeProfile,
// clusterLevels, analyzeBreakout
//
// Syfte: Verifiera att stodnivaaer kring $1,700 hittas nar ETH konsoliderar
// i omraadet $1,680-$1,730, istallet for att bara visa $1,595 (ett gammalt dip).
// =============================================================================

// ---------------------------------------------------------------------------
// Kopiera relevanta funktioner fran script.js (browser-fritt)
// ---------------------------------------------------------------------------

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

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function analyzeBreakout(prices, volumes, currentPrice) {
  const { maxima, minima } = findLocalExtremes(prices, 3);
  const n = prices.length;

  const recentLen    = Math.min(90, prices.length);
  const recentPrices = prices.slice(-recentLen);
  const recentVols   = volumes.slice(-recentLen);
  const idxOffset    = prices.length - recentLen;

  const consolZones = findConsolidationZones(recentPrices).map(z => ({ price: z.price, idx: z.idx + idxOffset }));
  const volProfile  = findVolumeProfile(recentPrices, recentVols).map(v => ({ price: v.price, idx: v.idx + idxOffset }));

  const allResistance = clusterLevels([...maxima, ...consolZones.filter(z => z.price > currentPrice), ...volProfile.filter(v => v.price > currentPrice)], n);
  const allSupport    = clusterLevels([...minima, ...consolZones.filter(z => z.price < currentPrice), ...volProfile.filter(v => v.price < currentPrice)], n);

  const resistanceLevels = allResistance
    .filter(c => c.price > currentPrice * 1.005)
    .sort((a, b) => a.price - b.price)
    .slice(0, 6);

  const rawSupport = allSupport
    .filter(c => c.price < currentPrice * 0.995)
    .sort((a, b) => b.price - a.price)
    .slice(0, 6);

  const ma50val  = sma(prices, 50);
  const ma200val = sma(prices, 200);
  const dynamicSupport = [];
  if (ma50val  && ma50val  < currentPrice * 0.995) dynamicSupport.push({ price: ma50val,  label: "MA50",  touches: null });
  if (ma200val && ma200val < currentPrice * 0.995) dynamicSupport.push({ price: ma200val, label: "MA200", touches: null });

  const low20d = Math.min(...prices.slice(-20));
  if (low20d < currentPrice * 0.995) {
    dynamicSupport.push({ price: low20d, label: "20d-lagsta", touches: null });
  }

  const supportLevels = [
    ...rawSupport,
    ...dynamicSupport.filter(d => !rawSupport.some(s => Math.abs(s.price - d.price) / d.price < 0.02)),
  ].sort((a, b) => b.price - a.price).slice(0, 8);

  const pricesLast7 = prices.slice(-7);
  const minLast7    = Math.min(...pricesLast7);

  const breakoutLevel = allResistance
    .filter(c =>
      c.price < currentPrice * 0.99 &&
      c.price > currentPrice * 0.78 &&
      minLast7 <= c.price * 1.04 &&
      currentPrice > c.price * 1.005
    )
    .sort((a, b) => b.price - a.price)[0] || null;

  const vols     = volumes.slice(-21);
  const avgVol20 = vols.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  const todayVol = vols[vols.length - 1];
  const volRatio = avgVol20 > 0 ? todayVol / avgVol20 : 1;

  const nearestR    = resistanceLevels[0] || null;
  const approaching = nearestR && nearestR.price / currentPrice < 1.04;

  return {
    resistanceLevels,
    supportLevels,
    breakoutLevel,
    nearestResistance:      nearestR,
    nearestSupport:         supportLevels[0] || null,
    approachingResistance:  approaching ? nearestR : null,
    volRatio,
    isVolumeConfirmed: volRatio >= 1.5,
    avgVol20,
    todayVol,
    // Debug-data for tests
    _debug: { consolZones, volProfile, allResistance, allSupport, rawSupport, dynamicSupport },
  };
}


// ===========================================================================
// Testdata-generatorer
// ===========================================================================

function generateRealisticEthData() {
  // Scenario: 365 dagar ETH-historik
  //   Dag 0-89:   Nedgang fran $2,400 till $1,595 (dip)
  //   Dag 90-120:  Studs upp fran dip till $1,680
  //   Dag 121-320: Lang konsolidering kring $1,680-$1,730 (200 dagar!)
  //   Dag 321-364: Stigning till $1,720 (nuvarande pris)
  //
  // Tillagd: realistisk krypto-volatilitet (1-3% dagliga swings)
  const prices = [];
  const volumes = [];
  const rng = mulberry32(42); // Deterministic seed

  function addDay(basePrice, volatilityPct) {
    const noise = (rng() - 0.5) * 2 * volatilityPct * basePrice;
    const price = basePrice + noise;
    prices.push(Math.round(price * 100) / 100);
    // Volume: 8-25 miljarder med variation
    volumes.push(8e9 + rng() * 17e9);
  }

  // Fas 1: Nedgang $2,400 -> $1,595 (90 dagar)
  for (let i = 0; i < 90; i++) {
    const progress = i / 89;
    const base = 2400 - (2400 - 1595) * progress;
    addDay(base, 0.025);
  }

  // Fas 2: Studs $1,595 -> $1,680 (31 dagar)
  for (let i = 0; i < 31; i++) {
    const progress = i / 30;
    const base = 1595 + (1680 - 1595) * progress;
    addDay(base, 0.02);
  }

  // Fas 3: Konsolidering $1,680-$1,730 (200 dagar) -- denna period ska generera stod!
  for (let i = 0; i < 200; i++) {
    const base = 1705 + Math.sin(i * 0.1) * 20; // oscillerar kring $1,705 +/- $20
    addDay(base, 0.015); // Lagre volatilitet = konsolidering
  }

  // Fas 4: Stigning till $1,720 (44 dagar)
  for (let i = 0; i < 44; i++) {
    const progress = i / 43;
    const base = 1710 + progress * 10;
    addDay(base, 0.015);
  }

  return { prices, volumes, currentPrice: prices[prices.length - 1] };
}

// Seeded PRNG (Mulberry32)
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ===========================================================================
// Kort 90-dagars scenario (matchar recentLen-snittet i analyzeBreakout)
// ===========================================================================
function generateShort90dData() {
  const prices = [];
  const volumes = [];
  const rng = mulberry32(99);

  // Dag 0-19: Dip till $1,595
  for (let i = 0; i < 20; i++) {
    const base = 1700 - (1700 - 1595) * (i / 19);
    prices.push(Math.round((base + (rng() - 0.5) * 30) * 100) / 100);
    volumes.push(10e9 + rng() * 15e9);
  }

  // Dag 20-70: Konsolidering $1,680-$1,730
  for (let i = 0; i < 51; i++) {
    const base = 1705 + Math.sin(i * 0.15) * 18;
    prices.push(Math.round((base + (rng() - 0.5) * 20) * 100) / 100);
    // Hogre volym i konsolideringszonen
    volumes.push(15e9 + rng() * 20e9);
  }

  // Dag 71-89: Upp till ~$1,720
  for (let i = 0; i < 19; i++) {
    const base = 1710 + (i / 18) * 10;
    prices.push(Math.round((base + (rng() - 0.5) * 15) * 100) / 100);
    volumes.push(12e9 + rng() * 15e9);
  }

  return { prices, volumes, currentPrice: prices[prices.length - 1] };
}


// ===========================================================================
// Testkorning
// ===========================================================================

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log("  PASS: " + msg);
  } else {
    failed++;
    console.log("  FAIL: " + msg);
  }
}

function section(name) {
  console.log("\n" + "=".repeat(70));
  console.log(name);
  console.log("=".repeat(70));
}

// ---- TEST 1: findConsolidationZones med default maxRange=0.03 ----
section("TEST 1: findConsolidationZones -- default maxRange=0.03 (3%)");
{
  // Skapa 30 dagar med tatt konsolideringsdata kring $1,705
  const consolPrices = [];
  const rng = mulberry32(7);
  for (let i = 0; i < 30; i++) {
    // +/- $15 runt $1,705 = ca 1.8% range -- ska klara 3%
    consolPrices.push(1705 + (rng() - 0.5) * 30);
  }

  const zones = findConsolidationZones(consolPrices, 10, 0.03);
  console.log("  Antal zoner med maxRange=0.03:", zones.length);
  console.log("  Forsta 3 zoner:", zones.slice(0, 3).map(z =>
    "$" + z.price.toFixed(2) + " (idx=" + z.idx + ")"
  ).join(", "));

  assert(zones.length > 0, "Konsolideringszoner hittades med 3% maxRange och tatt data");

  // Kolla att zonerna ar nara $1,705
  if (zones.length > 0) {
    const avgPrice = zones.reduce((s, z) => s + z.price, 0) / zones.length;
    assert(Math.abs(avgPrice - 1705) < 30,
      "Genomsnittligt zonpris (" + avgPrice.toFixed(2) + ") ar nara $1,705");
  }
}

// ---- TEST 2: findConsolidationZones med REALISTISK krypto-volatilitet ----
section("TEST 2: findConsolidationZones -- krypto-volatilitet (3-5% dagliga swings)");
{
  const consolPrices = [];
  const rng = mulberry32(42);
  for (let i = 0; i < 30; i++) {
    // +/- $50 runt $1,705 = ca 5.9% range -- OVERSKRIDER 3% maxRange!
    consolPrices.push(1705 + (rng() - 0.5) * 100);
  }

  const zonesStrict = findConsolidationZones(consolPrices, 10, 0.03);
  const zonesLoose  = findConsolidationZones(consolPrices, 10, 0.06);

  console.log("  Daglig range: $" +
    (Math.max(...consolPrices) - Math.min(...consolPrices)).toFixed(2));
  console.log("  Zoner med maxRange=0.03 (3%):", zonesStrict.length);
  console.log("  Zoner med maxRange=0.06 (6%):", zonesLoose.length);

  // Buggen: 3% ar for tight for typisk krypto-volatilitet
  assert(zonesStrict.length < zonesLoose.length,
    "BUG BEKRAFTAD: 3% maxRange missar zoner som 6% hittar (strict=" +
    zonesStrict.length + " vs loose=" + zonesLoose.length + ")");

  // Prova aven windowSize=5 istallet for 10
  const zonesSmallWin = findConsolidationZones(consolPrices, 5, 0.03);
  console.log("  Zoner med windowSize=5, maxRange=0.03:", zonesSmallWin.length);
  assert(zonesSmallWin.length >= zonesStrict.length,
    "Mindre windowSize hittar fler (eller lika manga) zoner");
}

// ---- TEST 3: findVolumeProfile bin-storlek och precision ----
section("TEST 3: findVolumeProfile -- bin-precision");
{
  // 90 dagars priser med hogt volym-kluster runt $1,700
  const prices = [];
  const volumes = [];
  const rng = mulberry32(13);

  for (let i = 0; i < 90; i++) {
    let p;
    if (i < 20) {
      p = 1595 + (rng() - 0.5) * 40; // Dip-omradet
    } else {
      p = 1700 + (rng() - 0.5) * 60; // Konsolideringszonen
    }
    prices.push(p);
    // Hogre volym i konsolideringszonen (dag 20+)
    volumes.push(i >= 20 ? 20e9 + rng() * 10e9 : 5e9 + rng() * 5e9);
  }

  const profile = findVolumeProfile(prices, volumes, 20);
  console.log("  Antal volym-punkter:", profile.length);

  if (profile.length > 0) {
    console.log("  Volymprofil-nivaer:");
    const uniquePrices = [...new Set(profile.map(p => p.price))];
    uniquePrices.forEach(p => {
      const count = profile.filter(pp => pp.price === p).length;
      console.log("    $" + p.toFixed(2) + " (styrka: " + count + ")");
    });

    // Kollar att det finns nivaer nara $1,700
    const near1700 = profile.filter(p => Math.abs(p.price - 1700) < 60);
    assert(near1700.length > 0,
      "Volymprofil hittar nivaer nara $1,700 (" + near1700.length + " punkter)");

    // Kollar bin-storlek
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const binSize = (hi - lo) / 20;
    console.log("  Prisrange: $" + lo.toFixed(2) + " - $" + hi.toFixed(2));
    console.log("  Bin-storlek: $" + binSize.toFixed(2));
    assert(binSize < 20,
      "Bin-storlek (" + binSize.toFixed(2) + ") ar tillrackligt liten for att separera $1,595 fran $1,700");
  } else {
    assert(false, "Volymprofil borde ha hittat nivaer -- 0 punkter returnerades!");
  }
}

// ---- TEST 4: Volume profile med BRED prisrange (365 dagar) ----
section("TEST 4: findVolumeProfile -- bred 365d range (bins for grova?)");
{
  // 365 dagar: $1,595 till $2,400 range
  const prices = [];
  const volumes = [];
  const rng = mulberry32(77);

  for (let i = 0; i < 365; i++) {
    if (i < 90) {
      prices.push(2400 - (2400 - 1595) * (i / 89) + (rng() - 0.5) * 40);
    } else {
      prices.push(1700 + (rng() - 0.5) * 60);
    }
    volumes.push(10e9 + rng() * 15e9);
  }

  const profile365 = findVolumeProfile(prices, volumes, 20);
  const binSize = (Math.max(...prices) - Math.min(...prices)) / 20;
  console.log("  365d bin-storlek: $" + binSize.toFixed(2));
  console.log("  Antal volym-nivaer:", profile365.length);

  assert(binSize > 35,
    "BUG: Med 365d data ar bin-storlek $" + binSize.toFixed(2) +
    " -- for grov for att skilja $1,680 fran $1,720");

  // Det ar darfor analyzeBreakout skickar recentPrices (90d) istallet for alla 365
  // Men aven med 90d-snittet kan det bli problem
  const recent90 = prices.slice(-90);
  const recentVols = volumes.slice(-90);
  const profile90 = findVolumeProfile(recent90, recentVols, 20);
  const binSize90 = (Math.max(...recent90) - Math.min(...recent90)) / 20;
  console.log("  90d bin-storlek: $" + binSize90.toFixed(2));
  console.log("  Antal volym-nivaer (90d):", profile90.length);
}

// ---- TEST 5: clusterLevels -- tolerance och scoring ----
section("TEST 5: clusterLevels -- toleranstest");
{
  // Simulera att vi har manga kontakter runt $1,700 och en ensam vid $1,595
  const points = [
    { price: 1700, idx: 80 },
    { price: 1705, idx: 82 },
    { price: 1695, idx: 85 },
    { price: 1710, idx: 87 },
    { price: 1700, idx: 88 },
    { price: 1595, idx: 10 }, // gammalt dip, far i index
  ];

  const clusters = clusterLevels(points, 90, 0.04);
  console.log("  Kluster:");
  clusters.forEach(c => {
    console.log("    $" + c.price.toFixed(2) +
      " touches=" + c.touches +
      " lastIdx=" + c.lastIdx +
      " score=" + c.score.toFixed(2));
  });

  assert(clusters.length >= 2, "Minst 2 kluster bildas ($1,595 och $1,700-omradet)");

  // Det hogre klustret ($1,700) ska ha hogst score pga fler touches + hogre idx
  const top = clusters[0];
  assert(top.price > 1680 && top.price < 1720,
    "Hogst rankade klustret ar nara $1,700 (fick $" + top.price.toFixed(2) + ")");
  assert(top.touches >= 4,
    "Klustret har 4+ touches (fick " + top.touches + ")");

  // $1,595 ska ligga langre ned
  const dipCluster = clusters.find(c => c.price < 1650);
  assert(dipCluster && dipCluster.score < top.score,
    "Dip-klustret ($1,595) har lagre score an $1,700-klustret");
}

// ---- TEST 6: Full analyzeBreakout med realistisk 365d data ----
section("TEST 6: analyzeBreakout -- full 365d scenario");
{
  const data = generateRealisticEthData();
  console.log("  Datapunkter:", data.prices.length);
  console.log("  Aktuellt pris: $" + data.currentPrice.toFixed(2));
  console.log("  Prisrange: $" + Math.min(...data.prices).toFixed(2) +
    " - $" + Math.max(...data.prices).toFixed(2));

  const ba = analyzeBreakout(data.prices, data.volumes, data.currentPrice);

  console.log("\n  --- Stodnivaer ---");
  ba.supportLevels.forEach((s, i) => {
    const label = s.label ? " (" + s.label + ")" : " (touches=" + s.touches + ")";
    console.log("    " + (i+1) + ". $" + s.price.toFixed(2) + label);
  });

  console.log("\n  --- Motstandsnivaer ---");
  ba.resistanceLevels.forEach((r, i) => {
    console.log("    " + (i+1) + ". $" + r.price.toFixed(2) + " (touches=" + r.touches + ")");
  });

  console.log("\n  --- Debug ---");
  console.log("  Konsolideringszoner (raa):", ba._debug.consolZones.length);
  console.log("  Volymprofil-punkter:", ba._debug.volProfile.length);
  console.log("  rawSupport-kluster:", ba._debug.rawSupport.length);
  console.log("  dynamicSupport:", ba._debug.dynamicSupport.length);

  // Kollar att stod hittas nara $1,700 (INTE bara $1,595)
  const supportNear1700 = ba.supportLevels.filter(
    s => s.price > 1650 && s.price < 1750
  );
  assert(supportNear1700.length > 0,
    "KRITISK: Stodnivaer hittade NARA $1,700 (" +
    supportNear1700.map(s => "$" + s.price.toFixed(2)).join(", ") + ")");

  // Kollar att $1,595 INTE ar hogst rankade stod
  const topSupport = ba.supportLevels[0];
  if (topSupport) {
    console.log("\n  Hogsta stod: $" + topSupport.price.toFixed(2));
    assert(topSupport.price > 1650,
      "Hogsta stodnivaan ar INTE fast pa $1,595 (fick $" + topSupport.price.toFixed(2) + ")");
  }
}

// ---- TEST 7: 90-dagars scenario (exakt den slicea analyzeBreakout anvander) ----
section("TEST 7: 90-dagars scenario (matchar recentLen)");
{
  const data = generateShort90dData();
  console.log("  Datapunkter:", data.prices.length);
  console.log("  Aktuellt pris: $" + data.currentPrice.toFixed(2));

  // Kolla findConsolidationZones direkt pa 90d-datan
  const zones = findConsolidationZones(data.prices, 10, 0.03);
  console.log("  Konsolideringszoner (3%):", zones.length);

  const zones6pct = findConsolidationZones(data.prices, 10, 0.06);
  console.log("  Konsolideringszoner (6%):", zones6pct.length);

  // Kolla var zonerna ligger
  if (zones.length > 0) {
    const zonePrices = zones.map(z => z.price);
    console.log("  Zonpris-range: $" + Math.min(...zonePrices).toFixed(2) +
      " - $" + Math.max(...zonePrices).toFixed(2));
  }

  // Full analyzeBreakout
  const ba = analyzeBreakout(data.prices, data.volumes, data.currentPrice);

  console.log("\n  Stodnivaer:");
  ba.supportLevels.forEach((s, i) => {
    const label = s.label ? " (" + s.label + ")" : " (touches=" + s.touches + ")";
    console.log("    " + (i+1) + ". $" + s.price.toFixed(2) + label);
  });

  const near1700 = ba.supportLevels.filter(s => s.price > 1650 && s.price < 1750);
  assert(near1700.length > 0,
    "90d-scenario hittar stod nara $1,700 (" +
    near1700.map(s => "$" + s.price.toFixed(2)).join(", ") + ")");
}

// ---- TEST 8: Edge case -- findConsolidationZones med tom/for kort data ----
section("TEST 8: Edge cases");
{
  // Tom array
  const empty = findConsolidationZones([], 10, 0.03);
  assert(empty.length === 0, "Tom array ger inga zoner");

  // For kort array (kortare an windowSize)
  const short = findConsolidationZones([1700, 1705, 1710], 10, 0.03);
  assert(short.length === 0, "Array kortare an windowSize ger inga zoner");

  // Exakt windowSize
  const exact = findConsolidationZones(
    [1700, 1702, 1698, 1701, 1703, 1699, 1700, 1705, 1695, 1700],
    10, 0.03
  );
  assert(exact.length === 1, "Exakt windowSize langd ger 1 zon (fick " + exact.length + ")");

  // Volume profile utan volymer
  const noVol = findVolumeProfile([1700, 1705, 1710], null, 20);
  assert(noVol.length === 0, "null-volymer returnerar tom array");

  // Volume profile med alla noll-volymer
  const zeroVol = findVolumeProfile(
    Array(20).fill(0).map((_, i) => 1700 + i),
    Array(20).fill(0), 20
  );
  assert(zeroVol.length === 0, "Noll-volymer returnerar tom array");

  // Alla priser identiska
  const flat = findConsolidationZones(Array(20).fill(1700), 10, 0.03);
  assert(flat.length > 0, "Identiska priser ar maximal konsolidering");

  // Volume profile med identiska priser
  const flatVol = findVolumeProfile(
    Array(20).fill(1700),
    Array(20).fill(10e9),
    20
  );
  assert(flatVol.length === 0, "Identiska priser returnerar [] (hi===lo guard)");

  // Division med noll i clusterLevels
  const zeroPoints = [{ price: 0, idx: 5 }, { price: 0, idx: 10 }];
  try {
    const zeroClusters = clusterLevels(zeroPoints, 20, 0.04);
    // price=0 gor att Math.abs(c.price - pt.price) / c.price = 0/0 = NaN
    // NaN < tolerance = false, sa de klustras INTE ihop
    assert(zeroClusters.length === 2,
      "Division med noll: tva separata kluster skapas (pris=0, borde vara 1) -- " +
      "fick " + zeroClusters.length);
    console.log("    BUGG: Prisnivaaer pa $0 klustras inte ihop (NaN-jamforelse)");
  } catch (e) {
    assert(false, "Division med noll orsakade undantag: " + e.message);
  }
}

// ---- TEST 9: windowSize-sensitivity ----
section("TEST 9: windowSize-kanslighet");
{
  const data = generateShort90dData();

  [5, 7, 10, 14, 20].forEach(ws => {
    const zones = findConsolidationZones(data.prices, ws, 0.03);
    const zones6 = findConsolidationZones(data.prices, ws, 0.06);
    console.log("  windowSize=" + ws +
      ": zoner@3%=" + zones.length +
      " zoner@6%=" + zones6.length);
  });
}

// ---- TEST 10: idxOffset-verifiering ----
section("TEST 10: idxOffset-korrekthet i analyzeBreakout");
{
  const data = generateRealisticEthData();
  const n = data.prices.length;
  const recentLen = Math.min(90, n);
  const idxOffset = n - recentLen;

  console.log("  Total langd:", n);
  console.log("  recentLen:", recentLen);
  console.log("  idxOffset:", idxOffset);

  // Kolla att konsolideringszoner far korrekt idx efter offset
  const recentPrices = data.prices.slice(-recentLen);
  const rawZones = findConsolidationZones(recentPrices);
  const adjustedZones = rawZones.map(z => ({ price: z.price, idx: z.idx + idxOffset }));

  if (rawZones.length > 0) {
    const firstRaw = rawZones[0];
    const firstAdj = adjustedZones[0];
    console.log("  Forsta zon raw idx:", firstRaw.idx, "-> adjusted:", firstAdj.idx);

    assert(firstAdj.idx >= idxOffset,
      "Justerat idx (" + firstAdj.idx + ") >= idxOffset (" + idxOffset + ")");
    assert(firstAdj.idx < n,
      "Justerat idx (" + firstAdj.idx + ") < total langd (" + n + ")");

    // Verifiera att idx:et pekar pa ratt pris i den fulla prisvektorn
    const priceAtRawIdx = recentPrices[firstRaw.idx];
    const priceAtAdjIdx = data.prices[firstAdj.idx];
    assert(priceAtRawIdx === priceAtAdjIdx,
      "Pris vid raw idx ($" + priceAtRawIdx.toFixed(2) +
      ") matchar pris vid adjusted idx ($" + priceAtAdjIdx.toFixed(2) + ")");
  }
}

// ---- TEST 11: 0.995-filtret i rawSupport -- tappar det nara nivaer? ----
section("TEST 11: 0.995-filter i rawSupport");
{
  // Om currentPrice = $1,720, sa filtrar 0.995 bort allt over $1,711.40
  // Det ar OK -- stod ska vara UNDER nuvarande pris
  const currentPrice = 1720;
  const cutoff = currentPrice * 0.995;
  console.log("  currentPrice: $" + currentPrice.toFixed(2));
  console.log("  0.995-cutoff: $" + cutoff.toFixed(2));
  console.log("  Nivaer $1,700-$1,711 passerar filtret");

  // Men vad om klustret ar $1,715? Da filtreras det bort!
  const cluster1715 = { price: 1715, touches: 5 };
  const passes = cluster1715.price < currentPrice * 0.995;
  console.log("  $1,715 passerar filtret?", passes, "(cutoff=$" + cutoff.toFixed(2) + ")");
  assert(!passes,
    "NOTERA: Stod vid $1,715 filtreras bort nar pris ar $1,720 -- 0.995 avstand kravet");
}

// ---- TEST 12: Parameteroptimering -- hitta basta combo ----
section("TEST 12: Parameteroptimering");
{
  const data = generateRealisticEthData();
  const currentPrice = data.currentPrice;
  const recentPrices = data.prices.slice(-90);

  console.log("\n  findConsolidationZones parametermatris:");
  console.log("  " + "ws\\maxR".padEnd(8) + "2%".padStart(6) + "3%".padStart(6) +
    "4%".padStart(6) + "5%".padStart(6) + "6%".padStart(6) + "8%".padStart(6));

  [5, 7, 10, 14, 20].forEach(ws => {
    let row = "  " + ("" + ws).padEnd(8);
    [0.02, 0.03, 0.04, 0.05, 0.06, 0.08].forEach(mr => {
      const zones = findConsolidationZones(recentPrices, ws, mr);
      row += ("" + zones.length).padStart(6);
    });
    console.log(row);
  });

  // Rekommendation: vilka parametrar hittar stod nara $1,700?
  console.log("\n  Zoner nara $1,700 (+/- $30) per parameter-combo:");
  let bestCombo = null;
  let bestCount = 0;

  [5, 7, 10, 14].forEach(ws => {
    [0.03, 0.04, 0.05, 0.06].forEach(mr => {
      const zones = findConsolidationZones(recentPrices, ws, mr);
      const near = zones.filter(z => Math.abs(z.price - 1700) < 30);
      if (near.length > bestCount) {
        bestCount = near.length;
        bestCombo = { ws, mr };
      }
    });
  });

  if (bestCombo) {
    console.log("  Basta: windowSize=" + bestCombo.ws + " maxRange=" +
      (bestCombo.mr * 100) + "% (" + bestCount + " zoner nara $1,700)");
  }
}

// ===========================================================================
// Sammanfattning
// ===========================================================================
section("SAMMANFATTNING");
console.log("  Totalt: " + passed + " PASS, " + failed + " FAIL\n");

if (failed > 0) {
  console.log("  ISSUE-LISTA:");
  console.log("  1. maxRange=0.03 ar troligen for tight for krypto-volatilitet");
  console.log("  2. windowSize=10 kan behova justeras beroende pa scenario");
  console.log("  3. Division med noll i clusterLevels (pris=0 -> NaN)");
  console.log("  4. Konsolideringszoner nara currentPrice kan filtreras av 0.995-kravet");
}
