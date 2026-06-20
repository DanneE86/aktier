/**
 * Float & Short Squeeze Scanner
 * ==============================
 * Identifierar short squeeze-kandidater genom att kombinera:
 * 1. Float-data (floatShares, sharesOutstanding)
 * 2. Short interest (sharesShort, shortPercentOfFloat, shortRatio/days-to-cover)
 * 3. Float rotation (daglig volym / float) -- nyckelmåttet för squeeze-potential
 *
 * Datakällor (alla gratis, ingen ny API-nyckel behövs):
 * - Yahoo Finance v7/finance/quote (bulk, upp till 200 tickers/anrop)
 * - Yahoo Finance v10/finance/quoteSummary (per ticker, defaultKeyStatistics)
 *
 * Viktigt om datakvalitet:
 * - Short interest uppdateras bara varannan vecka av FINRA (mid-month + end-of-month)
 * - floatShares saknas ofta för OTC-aktier och micro-caps
 * - sharesShort kan vara försenat 2-4 veckor
 * - Vi interpolerar ALDRIG saknade värden -- de flaggas som null med dataQuality-varning
 *
 * Float Rotation-formel:
 *   floatRotation = dailyVolume / floatShares
 *   Exempel: 5M float, 60M volym = 12x float rotation = EXTREMT (potentiell 200-500% rörelse)
 *
 * Short Squeeze-kriterier (VD-spec):
 *   - Short interest > 20% av float
 *   - Days-to-cover > 5 (shortRatio)
 *   - Float rotation > 1x (helst > 3x)
 */

// Återanvänd Yahoo-autentisering från scanner.js
let yahooCrumb = null;
let yahooCookie = null;

async function getYahooAuth() {
  if (yahooCrumb && yahooCookie) return { crumb: yahooCrumb, cookie: yahooCookie };

  try {
    const cookieRes = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "manual",
    });
    const setCookieHeader = cookieRes.headers.get("set-cookie") || "";
    yahooCookie = setCookieHeader.split(";")[0] || "";

    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Cookie: yahooCookie,
      },
    });
    if (crumbRes.ok) {
      yahooCrumb = await crumbRes.text();
      return { crumb: yahooCrumb, cookie: yahooCookie };
    }
  } catch (e) {
    console.log("  [Float Scanner] Yahoo auth failed:", e.message);
  }
  return null;
}

async function yahooFetchJson(url) {
  const auth = await getYahooAuth();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  if (auth) {
    headers.Cookie = auth.cookie;
    url += (url.includes("?") ? "&" : "?") + "crumb=" + encodeURIComponent(auth.crumb);
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════
// STEG 1: Bulk float-data via Yahoo v7/finance/quote
// ═══════════════════════════════════════════════════════════════════
// Returnerar floatShares, sharesOutstanding, sharesShort,
// shortRatio, shortPercentOfFloat för upp till 200 tickers/anrop.
// OBS: Inte alla tickers har dessa fält -- saknade flaggas.

async function fetchBulkFloatData(tickers) {
  console.log(`  [Float] Fetching bulk float data for ${tickers.length} tickers...`);
  const results = new Map();
  const BATCH_SIZE = 100; // Yahoo v7 klarar ~200, men 100 är säkrare

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const symbols = batch.join(",");
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
      const data = await yahooFetchJson(url);
      const quotes = data?.quoteResponse?.result || [];
      console.log(`  [Float] Batch ${batchNum}: ${quotes.length} quotes returned`);

      for (const q of quotes) {
        if (!q.symbol) continue;

        const dataQualityWarnings = [];

        // Validera float-data
        const floatShares = parseFiniteNumber(q.floatShares);
        const sharesOutstanding = parseFiniteNumber(q.sharesOutstanding);
        const sharesShort = parseFiniteNumber(q.sharesShort);
        const shortRatio = parseFiniteNumber(q.shortRatio); // = days-to-cover
        const shortPercentOfFloat = parseFiniteNumber(q.shortPercentOfFloat);
        const volume = parseFiniteNumber(q.regularMarketVolume);
        const avgVolume = parseFiniteNumber(q.averageDailyVolume3Month);
        const price = parseFiniteNumber(q.regularMarketPrice);

        // Datakvalitetskontroller
        if (floatShares === null) {
          dataQualityWarnings.push("floatShares saknas -- kan inte beräkna float rotation");
        }
        if (sharesShort === null) {
          dataQualityWarnings.push("sharesShort saknas -- short data ej tillgänglig");
        }
        if (shortPercentOfFloat === null && sharesShort !== null && floatShares !== null && floatShares > 0) {
          // Beräkna shortPercentOfFloat manuellt om Yahoo inte returnerar det
          dataQualityWarnings.push("shortPercentOfFloat beräknad manuellt (sharesShort/floatShares)");
        }
        if (floatShares !== null && sharesOutstanding !== null && floatShares > sharesOutstanding) {
          dataQualityWarnings.push("SUSPEKT: floatShares > sharesOutstanding -- datakvalitetsproblem");
        }
        if (floatShares !== null && floatShares < 100000) {
          dataQualityWarnings.push("Extremt låg float (<100K shares) -- extra volatil, verifiera data");
        }

        // Beräkna float rotation
        let floatRotation = null;
        if (floatShares !== null && floatShares > 0 && volume !== null) {
          floatRotation = volume / floatShares;
        }

        // Beräkna kort-intresse-procent manuellt om det saknas
        let computedShortPctOfFloat = shortPercentOfFloat;
        if (computedShortPctOfFloat === null && sharesShort !== null && floatShares !== null && floatShares > 0) {
          computedShortPctOfFloat = (sharesShort / floatShares) * 100;
        }

        // Beräkna days-to-cover manuellt om shortRatio saknas
        let daysToCover = shortRatio;
        if (daysToCover === null && sharesShort !== null && avgVolume !== null && avgVolume > 0) {
          daysToCover = sharesShort / avgVolume;
          dataQualityWarnings.push("daysToCover beräknad manuellt (sharesShort/avgVolume)");
        }

        results.set(q.symbol, {
          ticker: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price,
          volume,
          avgVolume,
          marketCap: parseFiniteNumber(q.marketCap),
          exchange: q.exchange || "",

          // Float-data
          floatShares,
          sharesOutstanding,

          // Short-data
          sharesShort,
          shortRatio: daysToCover,
          shortPercentOfFloat: computedShortPctOfFloat,

          // Beräknade metriker
          floatRotation,

          // Datakvalitet
          dataSource: "yahoo_v7_quote",
          dataQualityWarnings,
          hasFloatData: floatShares !== null,
          hasShortData: sharesShort !== null,
        });
      }
    } catch (e) {
      console.log(`  [Float] Batch ${batchNum} error:`, e.message);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// STEG 2: Detaljerad float/short-data via v10 quoteSummary
// ═══════════════════════════════════════════════════════════════════
// Anropas per ticker -- mer tillförlitlig men långsammare.
// Används som fallback för tickers där v7 saknar float/short-data,
// och som berikare för tickers som redan visar squeeze-potential.

async function fetchDetailedFloatData(ticker) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData`;
    const data = await yahooFetchJson(url);

    const stats = data?.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};

    // Yahoo v10 returnerar värden som { raw: 123456, fmt: "123.46K" }
    const floatShares = extractRawValue(stats.floatShares);
    const sharesOutstanding = extractRawValue(stats.sharesOutstanding);
    const sharesShort = extractRawValue(stats.sharesShort);
    const shortRatio = extractRawValue(stats.shortRatio);
    const shortPercentOfFloat = extractRawValue(stats.shortPercentOfFloat);
    const sharesShortPriorMonth = extractRawValue(stats.sharesShortPriorMonth);
    const dateShortInterest = stats.dateShortInterest?.fmt || null;

    return {
      floatShares,
      sharesOutstanding,
      sharesShort,
      shortRatio, // = days-to-cover
      shortPercentOfFloat: shortPercentOfFloat !== null ? shortPercentOfFloat * 100 : null, // v10 returnerar som decimal (0.25 = 25%)
      sharesShortPriorMonth,
      dateShortInterest,
      dataSource: "yahoo_v10_quoteSummary",
    };
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEG 3: Short Squeeze Scoring & Identifiering
// ═══════════════════════════════════════════════════════════════════

/**
 * Squeeze Score (0-100):
 *
 * Faktor                  | Poäng   | Logik
 * ----------------------- | ------- | -------------------------------------------
 * Short % av float > 20%  | 0-30    | Linjärt 0-30 mellan 10% och 50%+
 * Days-to-cover > 5       | 0-25    | Linjärt 0-25 mellan 2 och 15+
 * Float rotation > 1x     | 0-25    | Linjärt 0-25 mellan 0.5x och 10x+
 * Låg float (< 20M)       | 0-10    | < 5M = 10, < 10M = 7, < 20M = 4
 * Volym vs snitt > 2x     | 0-10    | Linjärt 0-10 mellan 1x och 5x+
 *
 * Squeeze-kandidat:  score >= 60
 * Stark squeeze:     score >= 80
 */

function calculateSqueezeScore(stock) {
  let score = 0;
  const factors = [];

  // Faktor 1: Short % av float (max 30 poäng)
  if (stock.shortPercentOfFloat !== null) {
    const shortPct = stock.shortPercentOfFloat;
    if (shortPct >= 10) {
      const pts = Math.min(30, Math.round(((shortPct - 10) / 40) * 30));
      score += pts;
      factors.push({
        name: "Short % av float",
        value: `${shortPct.toFixed(1)}%`,
        points: pts,
        maxPoints: 30,
        signal: shortPct >= 20 ? "STARK" : shortPct >= 15 ? "MEDEL" : "SVAG",
      });
    }
  }

  // Faktor 2: Days-to-cover (max 25 poäng)
  if (stock.shortRatio !== null) {
    const dtc = stock.shortRatio;
    if (dtc >= 2) {
      const pts = Math.min(25, Math.round(((dtc - 2) / 13) * 25));
      score += pts;
      factors.push({
        name: "Days-to-cover",
        value: `${dtc.toFixed(1)} dagar`,
        points: pts,
        maxPoints: 25,
        signal: dtc >= 5 ? "STARK" : dtc >= 3 ? "MEDEL" : "SVAG",
      });
    }
  }

  // Faktor 3: Float rotation (max 25 poäng)
  if (stock.floatRotation !== null) {
    const fr = stock.floatRotation;
    if (fr >= 0.5) {
      const pts = Math.min(25, Math.round(((fr - 0.5) / 9.5) * 25));
      score += pts;
      factors.push({
        name: "Float rotation",
        value: `${fr.toFixed(2)}x`,
        points: pts,
        maxPoints: 25,
        signal: fr >= 3 ? "STARK" : fr >= 1 ? "MEDEL" : "SVAG",
      });
    }
  }

  // Faktor 4: Låg float (max 10 poäng)
  if (stock.floatShares !== null) {
    const floatM = stock.floatShares / 1e6;
    let pts = 0;
    if (floatM < 5) { pts = 10; }
    else if (floatM < 10) { pts = 7; }
    else if (floatM < 20) { pts = 4; }
    if (pts > 0) {
      score += pts;
      factors.push({
        name: "Låg float",
        value: `${floatM.toFixed(1)}M aktier`,
        points: pts,
        maxPoints: 10,
        signal: floatM < 5 ? "STARK" : floatM < 10 ? "MEDEL" : "SVAG",
      });
    }
  }

  // Faktor 5: Relativ volym (max 10 poäng)
  if (stock.volume !== null && stock.avgVolume !== null && stock.avgVolume > 0) {
    const relVol = stock.volume / stock.avgVolume;
    if (relVol >= 1) {
      const pts = Math.min(10, Math.round(((relVol - 1) / 4) * 10));
      score += pts;
      factors.push({
        name: "Relativ volym",
        value: `${relVol.toFixed(1)}x snitt`,
        points: pts,
        maxPoints: 10,
        signal: relVol >= 3 ? "STARK" : relVol >= 2 ? "MEDEL" : "SVAG",
      });
    }
  }

  // Klassificering
  let squeezeLevel;
  if (score >= 80) squeezeLevel = "STARK_SQUEEZE";
  else if (score >= 60) squeezeLevel = "SQUEEZE_KANDIDAT";
  else if (score >= 40) squeezeLevel = "BEVAKNING";
  else squeezeLevel = "INGEN_SIGNAL";

  return {
    score: Math.min(score, 100),
    squeezeLevel,
    factors,
  };
}

/**
 * Identifiera short squeeze-kandidater enligt VD:ns krav:
 * - Short interest > 20% av float
 * - Days-to-cover > 5
 * - Float rotation beräknas och visas för alla
 */
function identifySqueezeSetups(stocksMap) {
  const candidates = [];

  for (const [ticker, stock] of stocksMap) {
    // Skippa tickers helt utan float- eller short-data
    if (!stock.hasFloatData && !stock.hasShortData) continue;

    const squeeze = calculateSqueezeScore(stock);

    // VD:ns primära kriterier
    const meetsShortCriteria = stock.shortPercentOfFloat !== null && stock.shortPercentOfFloat > 20;
    const meetsDtcCriteria = stock.shortRatio !== null && stock.shortRatio > 5;
    const hasHighFloatRotation = stock.floatRotation !== null && stock.floatRotation > 1;

    // Bygg trigger-anledning
    const triggerParts = [];
    if (meetsShortCriteria) {
      triggerParts.push(`Short: ${stock.shortPercentOfFloat.toFixed(1)}% av float`);
    }
    if (meetsDtcCriteria) {
      triggerParts.push(`DTC: ${stock.shortRatio.toFixed(1)} dagar`);
    }
    if (hasHighFloatRotation) {
      triggerParts.push(`Float rot: ${stock.floatRotation.toFixed(1)}x`);
    }
    if (stock.floatShares !== null) {
      triggerParts.push(`Float: ${formatFloat(stock.floatShares)}`);
    }

    candidates.push({
      ...stock,
      squeezeScore: squeeze.score,
      squeezeLevel: squeeze.squeezeLevel,
      squeezeFactors: squeeze.factors,
      meetsShortCriteria,
      meetsDtcCriteria,
      hasHighFloatRotation,
      // VD-kriteriet: alla tre = stark kandidat
      meetsAllCriteria: meetsShortCriteria && meetsDtcCriteria,
      triggerReason: triggerParts.length > 0
        ? triggerParts.join(" | ")
        : "Float/short data hämtad -- inga squeeze-kriterier uppfyllda",
      scannerType: squeeze.squeezeLevel === "STARK_SQUEEZE" || squeeze.squeezeLevel === "SQUEEZE_KANDIDAT"
        ? "squeeze"
        : "float_watch",
    });
  }

  // Sortera efter squeeze score (högst först)
  candidates.sort((a, b) => b.squeezeScore - a.squeezeScore);

  return candidates;
}

// ═══════════════════════════════════════════════════════════════════
// STEG 4: Komplett float-screening pipeline
// ═══════════════════════════════════════════════════════════════════

/**
 * Kör komplett float- och short squeeze-screening.
 *
 * @param {string[]} tickers - Lista av tickers att screena
 * @param {Object} options
 * @param {boolean} options.enrichTopCandidates - Om true, hämta detaljerad data via v10 för top-kandidater
 * @param {number} options.enrichLimit - Max antal tickers att berika (default: 15)
 * @returns {Object} - { candidates, stats, dataQualityLog }
 */
async function runFloatSqueezeScan(tickers, options = {}) {
  const startTime = Date.now();
  const enrichTopCandidates = options.enrichTopCandidates !== false;
  const enrichLimit = options.enrichLimit || 15;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`FLOAT & SHORT SQUEEZE SCANNER`);
  console.log(`Screening ${tickers.length} tickers`);
  console.log(`${"=".repeat(60)}\n`);

  // Steg 1: Bulk-hämta float/short-data via v7
  const stocksMap = await fetchBulkFloatData(tickers);

  // Steg 2: Identifiera squeeze-kandidater
  let candidates = identifySqueezeSetups(stocksMap);

  // Steg 3: Berika top-kandidater med v10-data (mer tillförlitlig)
  if (enrichTopCandidates) {
    const toEnrich = candidates
      .filter(c => c.squeezeScore >= 30 || !c.hasShortData)
      .slice(0, enrichLimit);

    if (toEnrich.length > 0) {
      console.log(`  [Float] Enriching ${toEnrich.length} candidates with v10 data...`);

      for (const candidate of toEnrich) {
        const detailed = await fetchDetailedFloatData(candidate.ticker);
        if (!detailed) continue;

        const updated = { ...candidate };
        let enriched = false;

        // Uppdatera med v10-data om den finns och v7 saknade det
        if (detailed.floatShares !== null && candidate.floatShares === null) {
          updated.floatShares = detailed.floatShares;
          updated.hasFloatData = true;
          enriched = true;
        }
        if (detailed.sharesShort !== null && candidate.sharesShort === null) {
          updated.sharesShort = detailed.sharesShort;
          updated.hasShortData = true;
          enriched = true;
        }
        if (detailed.shortRatio !== null && candidate.shortRatio === null) {
          updated.shortRatio = detailed.shortRatio;
          enriched = true;
        }
        if (detailed.shortPercentOfFloat !== null) {
          updated.shortPercentOfFloat = detailed.shortPercentOfFloat;
          enriched = true;
        }
        if (detailed.sharesShortPriorMonth !== null) {
          updated.sharesShortPriorMonth = detailed.sharesShortPriorMonth;
          enriched = true;
        }
        if (detailed.dateShortInterest !== null) {
          updated.dateShortInterest = detailed.dateShortInterest;
          enriched = true;
        }

        // Räkna om float rotation och squeeze score med uppdaterad data
        if (enriched) {
          if (updated.floatShares !== null && updated.floatShares > 0 && updated.volume !== null) {
            updated.floatRotation = updated.volume / updated.floatShares;
          }
          if (updated.shortPercentOfFloat === null && updated.sharesShort !== null && updated.floatShares !== null && updated.floatShares > 0) {
            updated.shortPercentOfFloat = (updated.sharesShort / updated.floatShares) * 100;
          }
          if (updated.shortRatio === null && updated.sharesShort !== null && updated.avgVolume !== null && updated.avgVolume > 0) {
            updated.shortRatio = updated.sharesShort / updated.avgVolume;
          }

          const newSqueeze = calculateSqueezeScore(updated);
          updated.squeezeScore = newSqueeze.score;
          updated.squeezeLevel = newSqueeze.squeezeLevel;
          updated.squeezeFactors = newSqueeze.factors;
          updated.meetsShortCriteria = updated.shortPercentOfFloat !== null && updated.shortPercentOfFloat > 20;
          updated.meetsDtcCriteria = updated.shortRatio !== null && updated.shortRatio > 5;
          updated.hasHighFloatRotation = updated.floatRotation !== null && updated.floatRotation > 1;
          updated.meetsAllCriteria = updated.meetsShortCriteria && updated.meetsDtcCriteria;
          updated.dataSource = "yahoo_v7+v10_enriched";

          // Uppdatera trigger-anledning
          const parts = [];
          if (updated.meetsShortCriteria) parts.push(`Short: ${updated.shortPercentOfFloat.toFixed(1)}% av float`);
          if (updated.meetsDtcCriteria) parts.push(`DTC: ${updated.shortRatio.toFixed(1)} dagar`);
          if (updated.hasHighFloatRotation) parts.push(`Float rot: ${updated.floatRotation.toFixed(1)}x`);
          if (updated.floatShares !== null) parts.push(`Float: ${formatFloat(updated.floatShares)}`);
          if (parts.length > 0) updated.triggerReason = parts.join(" | ");
        }

        // Ersätt i candidates-listan
        const idx = candidates.findIndex(c => c.ticker === candidate.ticker);
        if (idx >= 0) candidates[idx] = updated;
      }

      // Omsortera efter eventuellt ändrade scores
      candidates.sort((a, b) => b.squeezeScore - a.squeezeScore);
    }
  }

  // Statistik
  const duration = Date.now() - startTime;
  const stats = {
    totalTickers: tickers.length,
    tickersWithFloatData: candidates.filter(c => c.hasFloatData).length,
    tickersWithShortData: candidates.filter(c => c.hasShortData).length,
    squeezeCandidates: candidates.filter(c => c.squeezeLevel === "SQUEEZE_KANDIDAT" || c.squeezeLevel === "STARK_SQUEEZE").length,
    strongSqueezes: candidates.filter(c => c.squeezeLevel === "STARK_SQUEEZE").length,
    highFloatRotation: candidates.filter(c => c.hasHighFloatRotation).length,
    meetsAllCriteria: candidates.filter(c => c.meetsAllCriteria).length,
    durationMs: duration,
  };

  // Datakvalitetslogg för Tech Lead
  const dataQualityLog = {
    timestamp: new Date().toISOString(),
    tickersWithoutFloatData: candidates.filter(c => !c.hasFloatData).map(c => c.ticker),
    tickersWithoutShortData: candidates.filter(c => !c.hasShortData).map(c => c.ticker),
    tickersWithSuspectData: candidates
      .filter(c => c.dataQualityWarnings && c.dataQualityWarnings.some(w => w.includes("SUSPEKT")))
      .map(c => ({ ticker: c.ticker, warnings: c.dataQualityWarnings })),
  };

  // Konsol-rapport
  console.log(`\n${"=".repeat(60)}`);
  console.log(`FLOAT SCAN KLAR (${(duration / 1000).toFixed(1)}s)`);
  console.log(`  Tickers med float-data: ${stats.tickersWithFloatData}/${stats.totalTickers}`);
  console.log(`  Tickers med short-data: ${stats.tickersWithShortData}/${stats.totalTickers}`);
  console.log(`  Squeeze-kandidater:     ${stats.squeezeCandidates} (varav ${stats.strongSqueezes} starka)`);
  console.log(`  Hög float rotation:     ${stats.highFloatRotation}`);
  console.log(`  Uppfyller ALLA krav:    ${stats.meetsAllCriteria}`);
  console.log(`${"=".repeat(60)}`);

  // Top squeeze-kandidater
  const topSqueeze = candidates.filter(c =>
    c.squeezeLevel === "SQUEEZE_KANDIDAT" || c.squeezeLevel === "STARK_SQUEEZE"
  );
  if (topSqueeze.length > 0) {
    console.log(`\nTOP SQUEEZE-KANDIDATER:`);
    console.log("-".repeat(100));
    for (const c of topSqueeze.slice(0, 15)) {
      const shortStr = c.shortPercentOfFloat !== null ? `${c.shortPercentOfFloat.toFixed(1)}%` : "N/A";
      const dtcStr = c.shortRatio !== null ? `${c.shortRatio.toFixed(1)}d` : "N/A";
      const frStr = c.floatRotation !== null ? `${c.floatRotation.toFixed(2)}x` : "N/A";
      const floatStr = c.floatShares !== null ? formatFloat(c.floatShares) : "N/A";
      console.log(
        `  [${String(c.squeezeScore).padStart(3)}] ${c.ticker.padEnd(7)} ` +
        `$${c.price?.toFixed(2).padStart(7) || "  N/A "} ` +
        `Short:${shortStr.padStart(6)} DTC:${dtcStr.padStart(6)} ` +
        `FloatRot:${frStr.padStart(7)} Float:${floatStr.padStart(8)} ` +
        `[${c.squeezeLevel}]`
      );
    }
  }

  // Float rotation-leaders (VD-scenaeriot: 5M float, 60M volym)
  const floatRotLeaders = candidates
    .filter(c => c.floatRotation !== null && c.floatRotation > 1)
    .sort((a, b) => b.floatRotation - a.floatRotation);

  if (floatRotLeaders.length > 0) {
    console.log(`\nFLOAT ROTATION LEADERS (>1x):`);
    console.log("-".repeat(80));
    for (const c of floatRotLeaders.slice(0, 10)) {
      console.log(
        `  ${c.ticker.padEnd(7)} Float: ${formatFloat(c.floatShares).padStart(8)} ` +
        `Vol: ${formatVolume(c.volume).padStart(8)} ` +
        `Rotation: ${c.floatRotation.toFixed(2)}x ` +
        `-- Hela floaten har handlats ${c.floatRotation.toFixed(1)} gånger idag`
      );
    }
  }

  // Datakvalitetsvarningar
  if (dataQualityLog.tickersWithSuspectData.length > 0) {
    console.log(`\n[DATAKVALITET VARNING] Suspekt data hittad för ${dataQualityLog.tickersWithSuspectData.length} tickers:`);
    for (const item of dataQualityLog.tickersWithSuspectData) {
      console.log(`  ${item.ticker}: ${item.warnings.join(", ")}`);
    }
  }

  return { candidates, stats, dataQualityLog };
}

// ═══════════════════════════════════════════════════════════════════
// Hjälpfunktioner
// ═══════════════════════════════════════════════════════════════════

function parseFiniteNumber(val) {
  if (val === undefined || val === null) return null;
  const num = Number(val);
  if (!isFinite(num)) return null;
  return num;
}

function extractRawValue(field) {
  if (field === undefined || field === null) return null;
  if (typeof field === "number") return isFinite(field) ? field : null;
  if (typeof field === "object" && field.raw !== undefined) {
    return isFinite(field.raw) ? field.raw : null;
  }
  return null;
}

function formatFloat(shares) {
  if (shares === null || shares === undefined) return "N/A";
  if (shares >= 1e9) return `${(shares / 1e9).toFixed(1)}B`;
  if (shares >= 1e6) return `${(shares / 1e6).toFixed(1)}M`;
  if (shares >= 1e3) return `${(shares / 1e3).toFixed(0)}K`;
  return String(Math.round(shares));
}

function formatVolume(vol) {
  if (!vol) return "0";
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(0)}K`;
  return String(vol);
}

// ═══════════════════════════════════════════════════════════════════
// DEFAULT TICKER-UNIVERSUM (utökat med kända float-runners)
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_SQUEEZE_WATCHLIST = [
  // Kända höga short interest + låg float
  "GME", "AMC", "KOSS", "BBIG", "ATER", "SPRT", "IRNT", "PROG",
  "CLOV", "WISH", "WKHS", "GOEV", "NKLA",
  // Biotech med squeeze-potential (låg float + binära katalysatorer)
  "VXRT", "TNXP", "INO", "HUMA", "CATX", "TSHA", "RCKT", "IOVA",
  // AI/Quantum (hög retail-intresse, potentiell squeeze)
  "RGTI", "QUBT", "QBTS", "IONQ", "BBAI", "SOUN", "ARQQ",
  // EV/Clean energy
  "PLUG", "FCEL", "BLNK", "CHPT", "EVGO", "PSNY", "REE",
  // Cannabis (högt short interest historiskt)
  "TLRY", "CGC", "SNDL",
  // Momentum/meme -- ofta squeeze-targets
  "ACHR", "LUNR", "JOBY", "RKLB", "DNA", "ASTS",
  // Mining/Resources
  "MARA", "RIOT",
  // Micro-cap float runners
  "LODE", "ONDS", "OPTT", "GEVO", "TELL",
  // Övrigt
  "NIO", "LCID", "OPEN", "SOFI", "HIMS", "QS",
];

// ═══════════════════════════════════════════════════════════════════
// Express API-routes (importeras i index.js)
// ═══════════════════════════════════════════════════════════════════

function registerFloatRoutes(app) {

  /**
   * GET /api/float/scan
   * Kör float + short squeeze-scanning på default watchlist eller custom tickers.
   * Query params:
   *   tickers (valfri) - kommaseparerad lista, ex: "GME,AMC,BBAI"
   *   enrich  (valfri) - "true" för att berika med v10-data (långsammare)
   */
  app.get("/api/float/scan", async (req, res) => {
    try {
      const tickerInput = req.query.tickers;
      const tickers = tickerInput
        ? tickerInput.split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
        : DEFAULT_SQUEEZE_WATCHLIST;

      const enrich = req.query.enrich !== "false";

      const result = await runFloatSqueezeScan(tickers, {
        enrichTopCandidates: enrich,
        enrichLimit: 15,
      });

      res.json({
        success: true,
        scanDate: new Date().toISOString(),
        stats: result.stats,
        candidates: result.candidates.map(c => ({
          ticker: c.ticker,
          name: c.name,
          price: c.price,
          volume: c.volume,
          avgVolume: c.avgVolume,
          marketCap: c.marketCap,
          exchange: c.exchange,

          // Float
          floatShares: c.floatShares,
          floatFormatted: formatFloat(c.floatShares),
          sharesOutstanding: c.sharesOutstanding,

          // Short
          sharesShort: c.sharesShort,
          shortPercentOfFloat: c.shortPercentOfFloat,
          daysToCover: c.shortRatio,
          sharesShortPriorMonth: c.sharesShortPriorMonth || null,
          dateShortInterest: c.dateShortInterest || null,

          // Beräknade
          floatRotation: c.floatRotation,

          // Squeeze-analys
          squeezeScore: c.squeezeScore,
          squeezeLevel: c.squeezeLevel,
          squeezeFactors: c.squeezeFactors,
          meetsShortCriteria: c.meetsShortCriteria,
          meetsDtcCriteria: c.meetsDtcCriteria,
          hasHighFloatRotation: c.hasHighFloatRotation,
          meetsAllCriteria: c.meetsAllCriteria,

          triggerReason: c.triggerReason,
          dataSource: c.dataSource,
          dataQualityWarnings: c.dataQualityWarnings,
        })),
        dataQuality: result.dataQualityLog,
      });
    } catch (err) {
      console.error("[Float API] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/float/squeeze-candidates
   * Returnerar bara squeeze-kandidater (score >= 60).
   */
  app.get("/api/float/squeeze-candidates", async (req, res) => {
    try {
      const tickerInput = req.query.tickers;
      const tickers = tickerInput
        ? tickerInput.split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
        : DEFAULT_SQUEEZE_WATCHLIST;

      const result = await runFloatSqueezeScan(tickers, {
        enrichTopCandidates: true,
        enrichLimit: 20,
      });

      const squeezers = result.candidates.filter(c =>
        c.squeezeLevel === "SQUEEZE_KANDIDAT" || c.squeezeLevel === "STARK_SQUEEZE"
      );

      res.json({
        success: true,
        scanDate: new Date().toISOString(),
        count: squeezers.length,
        candidates: squeezers.map(c => ({
          ticker: c.ticker,
          name: c.name,
          price: c.price,
          floatShares: c.floatShares,
          floatFormatted: formatFloat(c.floatShares),
          shortPercentOfFloat: c.shortPercentOfFloat,
          daysToCover: c.shortRatio,
          floatRotation: c.floatRotation,
          squeezeScore: c.squeezeScore,
          squeezeLevel: c.squeezeLevel,
          squeezeFactors: c.squeezeFactors,
          triggerReason: c.triggerReason,
          volume: c.volume,
          avgVolume: c.avgVolume,
          dataQualityWarnings: c.dataQualityWarnings,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/float/rotation-leaders
   * Returnerar tickers sorterade efter float rotation (högst först).
   * Float rotation > 1x = hela floaten har handlats minst 1 gång idag.
   */
  app.get("/api/float/rotation-leaders", async (req, res) => {
    try {
      const tickerInput = req.query.tickers;
      const tickers = tickerInput
        ? tickerInput.split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
        : DEFAULT_SQUEEZE_WATCHLIST;

      const result = await runFloatSqueezeScan(tickers, {
        enrichTopCandidates: false, // Snabbare, bara bulk
      });

      const leaders = result.candidates
        .filter(c => c.floatRotation !== null && c.floatRotation > 0)
        .sort((a, b) => b.floatRotation - a.floatRotation);

      res.json({
        success: true,
        count: leaders.length,
        leaders: leaders.map(c => ({
          ticker: c.ticker,
          name: c.name,
          price: c.price,
          floatShares: c.floatShares,
          floatFormatted: formatFloat(c.floatShares),
          volume: c.volume,
          volumeFormatted: formatVolume(c.volume),
          floatRotation: c.floatRotation,
          floatRotationFormatted: `${c.floatRotation.toFixed(2)}x`,
          shortPercentOfFloat: c.shortPercentOfFloat,
          squeezeScore: c.squeezeScore,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/float/detail/:ticker
   * Detaljerad float + short-data för en enskild ticker (v10 quoteSummary).
   */
  app.get("/api/float/detail/:ticker", async (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();

      // Hämta både v7 och v10 data
      const [bulkMap, detailed] = await Promise.all([
        fetchBulkFloatData([ticker]),
        fetchDetailedFloatData(ticker),
      ]);

      const v7Data = bulkMap.get(ticker);
      if (!v7Data) {
        return res.status(404).json({ error: `Ticker ${ticker} hittades inte` });
      }

      // Slå ihop v7 + v10
      const merged = { ...v7Data };
      if (detailed) {
        if (detailed.floatShares !== null) merged.floatShares = detailed.floatShares;
        if (detailed.sharesOutstanding !== null) merged.sharesOutstanding = detailed.sharesOutstanding;
        if (detailed.sharesShort !== null) merged.sharesShort = detailed.sharesShort;
        if (detailed.shortRatio !== null) merged.shortRatio = detailed.shortRatio;
        if (detailed.shortPercentOfFloat !== null) merged.shortPercentOfFloat = detailed.shortPercentOfFloat;
        merged.sharesShortPriorMonth = detailed.sharesShortPriorMonth;
        merged.dateShortInterest = detailed.dateShortInterest;
        merged.dataSource = "yahoo_v7+v10_combined";

        // Räkna om
        if (merged.floatShares && merged.floatShares > 0 && merged.volume) {
          merged.floatRotation = merged.volume / merged.floatShares;
        }
      }

      const squeeze = calculateSqueezeScore(merged);

      // Short interest-trend (jämför med förra månaden)
      let shortTrend = null;
      if (merged.sharesShort !== null && merged.sharesShortPriorMonth !== null && merged.sharesShortPriorMonth > 0) {
        const change = merged.sharesShort - merged.sharesShortPriorMonth;
        const changePct = (change / merged.sharesShortPriorMonth) * 100;
        shortTrend = {
          current: merged.sharesShort,
          priorMonth: merged.sharesShortPriorMonth,
          change,
          changePct,
          direction: change > 0 ? "ÖKANDE" : change < 0 ? "MINSKANDE" : "OFÖRÄNDRAD",
          dateReported: merged.dateShortInterest,
        };
      }

      res.json({
        success: true,
        ticker,
        name: merged.name,
        price: merged.price,
        volume: merged.volume,
        avgVolume: merged.avgVolume,
        marketCap: merged.marketCap,

        float: {
          floatShares: merged.floatShares,
          floatFormatted: formatFloat(merged.floatShares),
          sharesOutstanding: merged.sharesOutstanding,
          sharesOutstandingFormatted: formatFloat(merged.sharesOutstanding),
          insiderHeldPct: merged.floatShares !== null && merged.sharesOutstanding !== null && merged.sharesOutstanding > 0
            ? ((1 - merged.floatShares / merged.sharesOutstanding) * 100).toFixed(1) + "%"
            : null,
        },

        shortInterest: {
          sharesShort: merged.sharesShort,
          sharesShortFormatted: formatFloat(merged.sharesShort),
          shortPercentOfFloat: merged.shortPercentOfFloat,
          daysToCover: merged.shortRatio,
          trend: shortTrend,
        },

        floatRotation: {
          value: merged.floatRotation,
          formatted: merged.floatRotation !== null ? `${merged.floatRotation.toFixed(2)}x` : "N/A",
          interpretation: merged.floatRotation !== null
            ? merged.floatRotation >= 5 ? "EXTREMT -- hela floaten handlad 5+ gånger, explosiv potential"
            : merged.floatRotation >= 3 ? "MYCKET HÖG -- betydande float rotation"
            : merged.floatRotation >= 1 ? "HÖG -- hela floaten har roterats minst 1 gång"
            : merged.floatRotation >= 0.5 ? "MEDEL -- halva floaten handlad"
            : "LÅG"
            : "Ej beräkningsbar (float data saknas)",
        },

        squeeze: {
          score: squeeze.score,
          level: squeeze.squeezeLevel,
          factors: squeeze.factors,
        },

        dataSource: merged.dataSource,
        dataQualityWarnings: merged.dataQualityWarnings,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// CLI-stöd: node float-scanner.js --run-once
// ═══════════════════════════════════════════════════════════════════

if (process.argv.includes("--run-once")) {
  runFloatSqueezeScan(DEFAULT_SQUEEZE_WATCHLIST, {
    enrichTopCandidates: true,
    enrichLimit: 15,
  }).then(result => {
    console.log(`\nKlart. ${result.stats.squeezeCandidates} squeeze-kandidater hittade.`);
    process.exit(0);
  }).catch(e => {
    console.error("Float scanner error:", e);
    process.exit(1);
  });
}

module.exports = {
  runFloatSqueezeScan,
  fetchBulkFloatData,
  fetchDetailedFloatData,
  calculateSqueezeScore,
  identifySqueezeSetups,
  registerFloatRoutes,
  DEFAULT_SQUEEZE_WATCHLIST,
};
