/**
 * Unusual Volume Detection Algorithm
 * ====================================
 * Flaggar aktier som handlar med ovanligt hög volym relativt historiskt snitt.
 *
 * Designprinciper:
 * - Logaritmisk normalisering (tidiga multiplar väger tyngst)
 * - Tre komponenter: RVOL vs 3m, RVOL vs 10d, short-term accumulation
 * - Divergensanalys för att skilja ackumulering från pump-and-dump
 *
 * Begränsningar:
 * - Fångar INTE sektor-/marknadsbreda volymökningar
 * - Fångar INTE kalendereffekter (OPEX, FOMC)
 * - Kräver extern nyhetsfiltrering för att bekräfta "utan känd nyhet"
 * - Micro-cap aktier (<50k snittvolym) ger hög false-positive-rate
 * - Tröskelvärden är heuristiska, ej backtestade out-of-sample
 *
 * Input: Yahoo Finance v7 quote-objekt
 * Output: { unusualVolumeScore, relativeVolume, signal, reason }
 */

// ============================================================
// Konfiguration -- trösklar och vikter
// ============================================================
const CONFIG = {
  // Vikter för de tre komponenterna (måste summera till 1.0)
  weights: {
    rvol3m: 0.50,   // RVOL vs 3-månaders snitt
    rvol10d: 0.25,  // RVOL vs 10-dagars snitt
    accumulation: 0.25, // Short-term accumulation (10d/3m)
  },

  // Maxmultipler för log-normalisering (ratio som ger score 100)
  maxMultipliers: {
    rvol3m: 10,      // 10x 3-månaders snitt = score 100
    rvol10d: 8,      // 8x 10-dagars snitt = score 100
    accumulation: 3, // 3x short-term accumulation = score 100
  },

  // Signaltrösklar
  thresholds: {
    unusual: 26,
    extreme: 51,
    pumpWarning: 76,
  },

  // Minimivolym för att undvika micro-cap false positives
  minAverageVolume: 50_000,

  // Pump-and-dump detektering: om RVOL_3m / RVOL_10d > detta
  // värde indikerar det en plötslig spike utan föregående uppbyggnad
  pumpSpikeRatio: 2.0,
};

// ============================================================
// Hjälpfunktioner
// ============================================================

/**
 * Logaritmisk normalisering till 0-100.
 * Använder ln(ratio) / ln(max) för att ge avtagande marginalnytta
 * till högre multiplar. ratio=1 ger 0, ratio=max ger 100.
 *
 * @param {number} ratio - Den observerade kvoten (t.ex. RVOL)
 * @param {number} max   - Den multipel som motsvarar score 100
 * @returns {number} Score 0-100
 */
function logNormalize(ratio, max) {
  if (ratio <= 1) return 0;
  if (ratio >= max) return 100;
  return (Math.log(ratio) / Math.log(max)) * 100;
}

/**
 * Validerar att Yahoo Finance quote-objektet har nödvändig data.
 * Returnerar ett objekt med { valid, missingFields }.
 */
function validateQuote(quote) {
  const required = [
    'regularMarketVolume',
    'averageDailyVolume3Month',
    'averageDailyVolume10Day',
  ];

  const missing = required.filter(
    (field) => quote[field] === undefined || quote[field] === null
  );

  return {
    valid: missing.length === 0,
    missingFields: missing,
  };
}

// ============================================================
// Huvudfunktion
// ============================================================

/**
 * Beräknar unusual volume score för en aktie.
 *
 * @param {Object} quote - Yahoo Finance v7 quote-objekt med minst:
 *   - regularMarketVolume {number}
 *   - averageDailyVolume3Month {number}
 *   - averageDailyVolume10Day {number}
 *   - symbol {string} (valfritt, används i reason-text)
 * @returns {Object} {
 *   unusualVolumeScore: number (0-100),
 *   relativeVolume: number (RVOL vs 3m),
 *   relativeVolume10d: number (RVOL vs 10d),
 *   shortTermAccumulation: number (10d avg / 3m avg),
 *   signal: "normal" | "unusual" | "extreme" | "pump_warning",
 *   reason: string
 * }
 */
function analyzeUnusualVolume(quote) {
  // ---- Validering ----
  const validation = validateQuote(quote);
  if (!validation.valid) {
    return {
      unusualVolumeScore: 0,
      relativeVolume: 0,
      relativeVolume10d: 0,
      shortTermAccumulation: 0,
      signal: 'normal',
      reason: `Saknar data: ${validation.missingFields.join(', ')}`,
    };
  }

  const vol = quote.regularMarketVolume;
  const avg3m = quote.averageDailyVolume3Month;
  const avg10d = quote.averageDailyVolume10Day;
  const symbol = quote.symbol || 'UNKNOWN';

  // ---- Skydd mot micro-cap false positives ----
  if (avg3m < CONFIG.minAverageVolume) {
    // Beräkna ändå men flagga i reason
    const rvol3m = avg3m > 0 ? vol / avg3m : 0;
    return {
      unusualVolumeScore: 0,
      relativeVolume: parseFloat(rvol3m.toFixed(2)),
      relativeVolume10d: avg10d > 0 ? parseFloat((vol / avg10d).toFixed(2)) : 0,
      shortTermAccumulation: avg3m > 0 ? parseFloat((avg10d / avg3m).toFixed(2)) : 0,
      signal: 'normal',
      reason:
        `${symbol}: Snittvolym ${avg3m.toLocaleString()} < ${CONFIG.minAverageVolume.toLocaleString()} ` +
        `(micro-cap filter). RVOL ${rvol3m.toFixed(1)}x ignoreras pga hög false-positive risk.`,
    };
  }

  // ---- Beräkna nyckeltal ----
  const rvol3m = avg3m > 0 ? vol / avg3m : 0;
  const rvol10d = avg10d > 0 ? vol / avg10d : 0;
  const shortTermAccumulation = avg3m > 0 ? avg10d / avg3m : 0;

  // ---- Komponentscore (0-100 vardera) ----
  const score3m = logNormalize(rvol3m, CONFIG.maxMultipliers.rvol3m);
  const score10d = logNormalize(rvol10d, CONFIG.maxMultipliers.rvol10d);
  const scoreAccum = logNormalize(
    shortTermAccumulation,
    CONFIG.maxMultipliers.accumulation
  );

  // ---- Viktat totalscore ----
  const rawScore =
    score3m * CONFIG.weights.rvol3m +
    score10d * CONFIG.weights.rvol10d +
    scoreAccum * CONFIG.weights.accumulation;

  const unusualVolumeScore = Math.round(Math.min(100, Math.max(0, rawScore)));

  // ---- Signalklassificering ----
  let signal;
  if (unusualVolumeScore >= CONFIG.thresholds.pumpWarning) {
    signal = 'pump_warning';
  } else if (unusualVolumeScore >= CONFIG.thresholds.extreme) {
    signal = 'extreme';
  } else if (unusualVolumeScore >= CONFIG.thresholds.unusual) {
    signal = 'unusual';
  } else {
    signal = 'normal';
  }

  // ---- Pump-and-dump divergensanalys ----
  // Om volymen explodera idag men 10-dagarsnittet inte visar
  // föregående uppbyggnad, är det en plötslig spike.
  let pumpDumpFlag = false;
  if (rvol3m > 3 && rvol10d > 0 && shortTermAccumulation < 1.2) {
    // Hög RVOL vs 3m, men 10d-snittet är nära 3m-snittet
    // => ingen gradvis uppbyggnad, allt hände plötsligt
    pumpDumpFlag = true;
    if (signal !== 'pump_warning') {
      signal = 'pump_warning';
    }
  }

  // Omvänt: om shortTermAccumulation är hög men rvol10d är
  // måttlig, tyder det på äkta gradvis ackumulering
  let accumulationPattern = false;
  if (shortTermAccumulation > 1.3 && rvol3m > 2 && rvol10d < rvol3m * 0.7) {
    accumulationPattern = true;
  }

  // ---- Bygg reason-text ----
  const reason = buildReason({
    symbol,
    rvol3m,
    rvol10d,
    shortTermAccumulation,
    unusualVolumeScore,
    signal,
    pumpDumpFlag,
    accumulationPattern,
    vol,
    avg3m,
    avg10d,
  });

  return {
    unusualVolumeScore,
    relativeVolume: parseFloat(rvol3m.toFixed(2)),
    relativeVolume10d: parseFloat(rvol10d.toFixed(2)),
    shortTermAccumulation: parseFloat(shortTermAccumulation.toFixed(2)),
    signal,
    reason,
  };
}

/**
 * Bygger en människoläsbar motivering av analysen.
 */
function buildReason(data) {
  const {
    symbol, rvol3m, rvol10d, shortTermAccumulation,
    signal, pumpDumpFlag, accumulationPattern, vol, avg3m, avg10d,
  } = data;

  const parts = [];

  // Grunddata
  parts.push(
    `${symbol}: Volym ${vol.toLocaleString()} vs 3m-snitt ${avg3m.toLocaleString()} (${rvol3m.toFixed(1)}x)`
  );

  if (signal === 'normal') {
    parts.push('Normal handelsvolym.');
    return parts.join('. ');
  }

  // Volymanalys
  parts.push(`10d-snitt ${avg10d.toLocaleString()} (RVOL 10d: ${rvol10d.toFixed(1)}x)`);

  // Ackumuleringsanalys
  if (shortTermAccumulation > 1.3) {
    parts.push(
      `Kort-sikt ackumulering: 10d/3m = ${shortTermAccumulation.toFixed(2)}x ` +
      `(volymen har okat gradvis de senaste dagarna)`
    );
  }

  // Divergensvarningar
  if (pumpDumpFlag) {
    parts.push(
      'VARNING: Plotslig volymspike utan foregang. ' +
      'Monstret liknar pump-and-dump snarare an gradvis ackumulering. ' +
      '10d-snittet visar ingen uppbyggnad fore dagens spike.'
    );
  }

  if (accumulationPattern) {
    parts.push(
      'Monstret tyder pa gradvis ackumulering: volymen har byggt upp ' +
      'over flera dagar (10d-snitt > 3m-snitt) och dagens volym ar ' +
      'en fortsattning snarare an en plotslig spike.'
    );
  }

  // Signalsammanfattning
  const signalDescriptions = {
    unusual: 'Ovanlig volym -- vart att bevaka for potentiell katalysator.',
    extreme: 'Extremt hog volym -- stark signal for positionering fore en katalysator.',
    pump_warning: 'Extremt hog volym med pump-and-dump-liknande monster. Stor forsiktighet rekommenderas.',
  };

  parts.push(signalDescriptions[signal] || '');

  return parts.filter(Boolean).join('. ');
}

// ============================================================
// Batch-analys: analysera flera aktier och sortera
// ============================================================

/**
 * Analyserar en array av Yahoo Finance quotes och returnerar
 * de mest intressanta sorterade efter score.
 *
 * @param {Object[]} quotes - Array av Yahoo Finance quote-objekt
 * @param {Object} options
 * @param {number} options.minScore - Minimiscore för att inkluderas (default 26)
 * @param {number} options.maxResults - Max antal resultat (default 20)
 * @returns {Object[]} Sorterade resultat med quote-data inkluderat
 */
function scanUnusualVolume(quotes, options = {}) {
  const minScore = options.minScore ?? CONFIG.thresholds.unusual;
  const maxResults = options.maxResults ?? 20;

  const results = quotes
    .map((quote) => {
      const analysis = analyzeUnusualVolume(quote);
      return {
        symbol: quote.symbol,
        price: quote.regularMarketPrice,
        marketCap: quote.marketCap,
        ...analysis,
      };
    })
    .filter((r) => r.unusualVolumeScore >= minScore)
    .sort((a, b) => b.unusualVolumeScore - a.unusualVolumeScore)
    .slice(0, maxResults);

  return results;
}

// ============================================================
// Export
// ============================================================
module.exports = {
  analyzeUnusualVolume,
  scanUnusualVolume,
  CONFIG,
  // Exportera helpers för testning
  logNormalize,
  validateQuote,
};

// ============================================================
// Demo/test om filen körs direkt
// ============================================================
if (require.main === module) {
  console.log('=== Unusual Volume Detection -- Demo ===\n');

  // Testfall 1: Normal volym
  const normal = analyzeUnusualVolume({
    symbol: 'BORE',
    regularMarketVolume: 500_000,
    averageDailyVolume3Month: 450_000,
    averageDailyVolume10Day: 480_000,
  });
  console.log('TESTFALL 1 - Normal volym:');
  console.log(JSON.stringify(normal, null, 2));
  console.log();

  // Testfall 2: Ovanlig volym med gradvis ackumulering
  const accumulation = analyzeUnusualVolume({
    symbol: 'ACCM',
    regularMarketVolume: 1_800_000,
    averageDailyVolume3Month: 600_000,
    averageDailyVolume10Day: 950_000,
  });
  console.log('TESTFALL 2 - Gradvis ackumulering:');
  console.log(JSON.stringify(accumulation, null, 2));
  console.log();

  // Testfall 3: Plotslig spike (pump-and-dump-monster)
  const pump = analyzeUnusualVolume({
    symbol: 'PUMP',
    regularMarketVolume: 5_000_000,
    averageDailyVolume3Month: 300_000,
    averageDailyVolume10Day: 320_000,
  });
  console.log('TESTFALL 3 - Pump-and-dump-monster:');
  console.log(JSON.stringify(pump, null, 2));
  console.log();

  // Testfall 4: Extrem volym men med ackumulering (mer trovardig)
  const smartMoney = analyzeUnusualVolume({
    symbol: 'SMRT',
    regularMarketVolume: 3_000_000,
    averageDailyVolume3Month: 500_000,
    averageDailyVolume10Day: 1_200_000,
  });
  console.log('TESTFALL 4 - Smart money ackumulering:');
  console.log(JSON.stringify(smartMoney, null, 2));
  console.log();

  // Testfall 5: Micro-cap (filtreras bort)
  const microcap = analyzeUnusualVolume({
    symbol: 'TINY',
    regularMarketVolume: 200_000,
    averageDailyVolume3Month: 20_000,
    averageDailyVolume10Day: 25_000,
  });
  console.log('TESTFALL 5 - Micro-cap (filtrerad):');
  console.log(JSON.stringify(microcap, null, 2));
  console.log();

  // Testfall 6: Batch-scanning
  console.log('=== Batch Scan ===');
  const batchQuotes = [
    { symbol: 'AAA', regularMarketVolume: 100_000, averageDailyVolume3Month: 90_000, averageDailyVolume10Day: 95_000, regularMarketPrice: 3.50 },
    { symbol: 'BBB', regularMarketVolume: 2_000_000, averageDailyVolume3Month: 500_000, averageDailyVolume10Day: 800_000, regularMarketPrice: 5.20 },
    { symbol: 'CCC', regularMarketVolume: 8_000_000, averageDailyVolume3Month: 400_000, averageDailyVolume10Day: 420_000, regularMarketPrice: 1.80 },
    { symbol: 'DDD', regularMarketVolume: 1_500_000, averageDailyVolume3Month: 700_000, averageDailyVolume10Day: 1_100_000, regularMarketPrice: 7.40 },
  ];
  const scanResults = scanUnusualVolume(batchQuotes, { minScore: 1 });
  scanResults.forEach((r) => {
    console.log(`  ${r.symbol}: Score ${r.unusualVolumeScore}, Signal: ${r.signal}, RVOL: ${r.relativeVolume}x`);
  });
}
