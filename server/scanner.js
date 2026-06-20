const db = require("./db");
const { analyzeUnusualVolume } = require("./unusualVolume");
const { fetchFullUniverse, filterMomentum, filterBreakout, filterAnomaly } = require("./universe-scanner");
let enrichWithInsiderData;
try {
  ({ enrichWithInsiderData } = require("./insider-scanner"));
} catch (e) {
  enrichWithInsiderData = null;
}

const CONFIG = {
  fmpKey: process.env.FMP_KEY || "",
  twelveDataKey: process.env.TWELVE_DATA_KEY || "88ccfc3a414c4f16b4e1ab32dfddf5b2",
  maxHitsPerDay: 15,
  minPrice: 0.10,
  maxPrice: 10.00,
};

async function fetchJson(url, headers) {
  const opts = {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...(headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  };
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Yahoo Finance Auth (crumb + cookie) ─────────────────────────
// Required since ~2023 for v7/v10 endpoints

let yahooCrumb = null;
let yahooCookie = null;

async function getYahooAuth() {
  if (yahooCrumb && yahooCookie) return { crumb: yahooCrumb, cookie: yahooCookie };

  try {
    // Step 1: Get cookie from Yahoo
    const cookieRes = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "manual",
    });
    const setCookieHeader = cookieRes.headers.get("set-cookie") || "";
    yahooCookie = setCookieHeader.split(";")[0] || "";

    // Step 2: Get crumb using cookie
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Cookie: yahooCookie,
      },
    });
    if (crumbRes.ok) {
      yahooCrumb = await crumbRes.text();
      console.log("  [Yahoo Auth] Got crumb successfully");
      return { crumb: yahooCrumb, cookie: yahooCookie };
    }
  } catch (e) {
    console.log("  [Yahoo Auth] Failed:", e.message);
  }

  return null;
}

async function yahooFetch(url) {
  const auth = await getYahooAuth();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  if (auth) {
    headers.Cookie = auth.cookie;
    url += (url.includes("?") ? "&" : "?") + "crumb=" + encodeURIComponent(auth.crumb);
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── KILL FILTERS ────────────────────────────────────────────────

function applyKillFilters(stock) {
  const reasons = [];
  if (stock.price < CONFIG.minPrice) reasons.push(`Price below $${CONFIG.minPrice}`);
  if (stock.price > CONFIG.maxPrice) reasons.push(`Price above $${CONFIG.maxPrice}`);
  if (stock.name && /warrant|right|unit|%|etf|fund/i.test(stock.name)) reasons.push("Not common stock");
  if (stock.ticker && stock.ticker.length > 5) reasons.push("Likely warrant/unit ticker");
  return reasons;
}

// ── RISK SCORING (1-5) ─────────────────────────────────────────

function calculateRiskScore(stock) {
  let score = 2;
  const flags = [];

  if (stock.price < 1) { score += 2; flags.push("Penny stock (under $1)"); }
  else if (stock.price < 3) { score += 1; flags.push("Micro-price ($1-3)"); }

  if (stock.changePct && Math.abs(stock.changePct) > 30) {
    score += 1; flags.push("Extreme daily move (>30%)");
  }

  if (stock.marketCap && stock.marketCap > 0 && stock.marketCap < 50e6) {
    score += 1; flags.push("Micro-cap (<$50M)");
  }

  return { score: Math.min(score, 5), flags };
}

function calculateConfidence(hit) {
  let score = 30;
  const absPct = Math.abs(hit.changePct || 0);
  if (absPct > 20) score += 25;
  else if (absPct > 10) score += 15;
  else if (absPct > 5) score += 8;

  if (hit.volume > 10e6) score += 15;
  else if (hit.volume > 5e6) score += 10;
  else if (hit.volume > 1e6) score += 5;

  if (hit.price >= 1 && hit.price <= 5) score += 5;
  if (hit.scannerType === "catalyst") score += 15;
  if (hit.scannerType === "momentum") score += 5;
  return Math.min(score, 100);
}

function getPriceTier(price) {
  if (price < 1) return "Under $1";
  if (price < 5) return "$1-$5";
  return "$5-$10";
}

function formatVolume(vol) {
  if (!vol) return "0";
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + "B";
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + "M";
  if (vol >= 1e3) return (vol / 1e3).toFixed(0) + "K";
  return String(vol);
}

// ── SCREENER 1: Yahoo Finance – Gainers, Losers, Most Active ────
// Returns 100+ stocks per category, free, no API key

async function runYahooScreener() {
  console.log("  [Yahoo] Scanning gainers, losers & most active...");
  const hits = [];

  const categories = [
    { name: "day_gainers", label: "Top gainer" },
    { name: "day_losers", label: "Top loser" },
    { name: "most_actives", label: "Most active" },
  ];

  for (const cat of categories) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/${cat.name}?count=100`;
      const data = await yahooFetch(url);

      const quotes = data?.finance?.result?.[0]?.quotes || [];
      console.log(`  [Yahoo] ${cat.name}: ${quotes.length} stocks returned`);

      for (const q of quotes) {
        const price = q.regularMarketPrice;
        if (!price || price < CONFIG.minPrice || price > CONFIG.maxPrice) continue;
        if (!q.symbol || q.symbol.includes(".") || q.symbol.includes("-")) continue;

        const changePct = q.regularMarketChangePercent || 0;
        const volume = q.regularMarketVolume || 0;
        const avgVol = q.averageDailyVolume3Month || 0;
        const relVol = avgVol > 0 ? volume / avgVol : 0;

        const isBigMove = Math.abs(changePct) >= 3;
        const isHighVol = relVol > 2;

        hits.push({
          ticker: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price,
          changePct,
          volume,
          avgVolume: avgVol,
          relativeVolume: relVol,
          marketCap: q.marketCap || 0,
          exchange: q.exchange || "US",
          sector: "",
          scannerType: (isBigMove || isHighVol) ? "momentum" : "watchlist",
          triggerReason: buildYahooReason(cat.label, price, changePct, volume, relVol),
        });
      }
    } catch (e) {
      console.log(`  [Yahoo] ${cat.name} error:`, e.message);
    }
  }

  return hits;
}

function buildYahooReason(label, price, changePct, volume, relVol) {
  const tier = getPriceTier(price);
  const parts = [`${label}: ${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`];
  if (volume > 0) parts.push(`Vol: ${formatVolume(volume)}`);
  if (relVol > 2) parts.push(`${relVol.toFixed(1)}x normalvolym`);
  parts.push(tier);
  return parts.join(" | ");
}

// ── SCREENER 2: Yahoo Finance trending tickers ──────────────────

async function runYahooTrending() {
  console.log("  [Yahoo] Checking trending tickers...");
  const hits = [];

  try {
    const url = "https://query1.finance.yahoo.com/v1/finance/trending/US?count=50";
    const data = await yahooFetch(url);

    const tickers = data?.finance?.result?.[0]?.quotes || [];
    console.log(`  [Yahoo] ${tickers.length} trending tickers`);

    // Get quotes for trending tickers that might be sub-$10
    for (const q of tickers) {
      const sym = q.symbol;
      if (!sym || sym.includes(".") || sym.includes("-") || sym.length > 5) continue;

      try {
        const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`;
        const chartData = await yahooFetch(chartUrl);
        const result = chartData?.chart?.result?.[0];
        if (!result?.meta) continue;

        const price = result.meta.regularMarketPrice;
        if (!price || price < CONFIG.minPrice || price > CONFIG.maxPrice) continue;

        const prevClose = result.meta.previousClose || result.meta.chartPreviousClose;
        const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

        hits.push({
          ticker: sym,
          name: sym,
          price,
          changePct,
          volume: result.meta.regularMarketVolume || 0,
          avgVolume: 0,
          exchange: result.meta.exchangeName || "US",
          sector: "",
          scannerType: "trending",
          triggerReason: `Trending | ${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}% | ${getPriceTier(price)}`,
        });
      } catch (e) { /* skip */ }
    }
  } catch (e) {
    console.log("  [Yahoo] Trending error:", e.message);
  }

  return hits;
}

// ── CIK-to-Ticker mapping cache ────────────────────────────────
// SEC provides a JSON mapping of all company tickers at sec.gov
let cikTickerMap = null;
let cikTickerMapExpiry = 0;

async function getCikTickerMap() {
  const now = Date.now();
  if (cikTickerMap && now < cikTickerMapExpiry) return cikTickerMap;

  const secHeaders = {
    "User-Agent": "StockScanner/1.0 (daniel86.ekstrom@gmail.com)",
    Accept: "application/json",
  };

  try {
    const data = await fetchJson(
      "https://www.sec.gov/files/company_tickers.json",
      secHeaders
    );
    // Format: { "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }
    cikTickerMap = new Map();
    for (const key of Object.keys(data)) {
      const entry = data[key];
      const cik = String(entry.cik_str);
      cikTickerMap.set(cik, {
        ticker: entry.ticker,
        name: entry.title,
      });
    }
    cikTickerMapExpiry = now + 6 * 60 * 60 * 1000; // Cache 6h
    console.log(`  [SEC] Loaded CIK-to-ticker map: ${cikTickerMap.size} entries`);
  } catch (e) {
    console.log(`  [SEC] Failed to load CIK-ticker map: ${e.message}`);
    if (!cikTickerMap) cikTickerMap = new Map();
  }

  return cikTickerMap;
}

// Extract CIK from EDGAR accession number in _id
// Format: "0001234567-24-000123:filing.htm" -> CIK = "1234567"
function extractCikFromId(id) {
  if (!id) return null;
  const match = id.match(/^0*(\d+)-\d{2}-\d+/);
  return match ? match[1] : null;
}

// ── SCREENER 3: SEC EDGAR 8-K filings ───────────────────────────
// EFTS full-text search API (efts.sec.gov/LATEST/search-index):
//   Required params: q (search query -- cannot be empty)
//   Optional: forms, dateRange, startdt, enddt, from, size
//   Response: Elasticsearch format { hits: { total: { value }, hits: [{ _id, _source }] } }
//   _source: entity_name, form_type, file_date, file_description, period_of_report
//   NOTE: _source does NOT contain ticker symbols -- requires CIK-to-ticker mapping

async function runSECScreen() {
  console.log("  [SEC] Scanning EDGAR for recent 8-K filings...");
  const hits = [];
  const edgarHeaders = {
    "User-Agent": "StockScanner/1.0 (daniel86.ekstrom@gmail.com)",
    Accept: "application/json",
  };

  try {
    // Step 1: Load CIK-to-ticker mapping
    const tickerMap = await getCikTickerMap();

    const today = getTodayDate();
    const twoDaysAgo = getDateDaysAgo(2);

    // Step 2: Query EFTS for recent 8-K filings
    // q parameter is REQUIRED -- use '"8-K"' as search term
    // forms parameter filters by form type
    const params = new URLSearchParams({
      q: '"8-K"',
      forms: "8-K",
      dateRange: "custom",
      startdt: twoDaysAgo,
      enddt: today,
      from: "0",
      size: "50",
    });

    const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;
    console.log(`  [SEC] EFTS query: forms=8-K, date=${twoDaysAgo} to ${today}`);
    const data = await fetchJson(url, edgarHeaders);

    const totalHits = data?.hits?.total?.value || 0;
    console.log(`  [SEC] EFTS returned ${totalHits} total 8-K filings`);

    if (data?.hits?.hits) {
      for (const filing of data.hits.hits) {
        const src = filing._source || {};
        const filingId = filing._id || "";

        // Step 3: Resolve ticker via CIK from accession number
        const cik = extractCikFromId(filingId);
        const mapped = cik ? tickerMap.get(cik) : null;

        let ticker = mapped?.ticker || null;
        let entityName = src.entity_name || mapped?.name || "";

        // Fallback: try display_names if available
        if (!ticker && src.display_names && Array.isArray(src.display_names)) {
          for (const dn of src.display_names) {
            const m = dn.match(/\(([A-Z]{1,5})\)/);
            if (m) { ticker = m[1]; break; }
          }
        }

        // Skip if we cannot resolve a ticker
        if (!ticker) continue;
        if (ticker.length > 5 || ticker.includes("-")) continue;

        hits.push({
          ticker,
          name: entityName || ticker,
          price: 0,
          changePct: 0,
          exchange: "US",
          sector: "",
          scannerType: "catalyst",
          triggerReason: `8-K: ${src.file_description || "Material event"} (${src.file_date || today})`,
        });
      }
    }

    // Deduplicate: same company can file multiple 8-Ks
    const uniqueMap = new Map();
    for (const h of hits) {
      if (!uniqueMap.has(h.ticker)) uniqueMap.set(h.ticker, h);
    }
    const uniqueHits = [...uniqueMap.values()];
    console.log(`  [SEC] Found ${uniqueHits.length} unique tickers from 8-K filings`);
    return uniqueHits;

  } catch (e) {
    console.log("  [SEC] EDGAR error:", e.message);
  }

  return hits;
}

// ── SCREENER 4: FMP Bulk Screener (if key available) ────────────

async function runFMPScreener() {
  if (!CONFIG.fmpKey) return [];
  console.log("  [FMP] Running bulk screener...");
  const hits = [];

  try {
    const url = `https://financialmodelingprep.com/api/v3/stock-screener?` +
      `priceMoreThan=${CONFIG.minPrice}&priceLowerThan=${CONFIG.maxPrice}` +
      `&volumeMoreThan=100000&isActivelyTrading=true&isEtf=false&isFund=false` +
      `&country=US&limit=500&apikey=${CONFIG.fmpKey}`;
    const stocks = await fetchJson(url);
    console.log(`  [FMP] Screener returned ${stocks.length} stocks`);

    for (const s of stocks) {
      const price = s.price || 0;
      if (price < CONFIG.minPrice || price > CONFIG.maxPrice) continue;
      hits.push({
        ticker: s.symbol, name: s.companyName || s.symbol, price,
        changePct: 0, volume: s.volume || 0, avgVolume: 0,
        marketCap: s.marketCap || 0, exchange: s.exchangeShortName || "US",
        sector: s.sector || "", scannerType: "watchlist",
        triggerReason: `${getPriceTier(price)} | ${s.sector || "N/A"} | MCap: ${formatVolume(s.marketCap || 0)}`,
      });
    }
  } catch (e) { console.log("  [FMP] Error:", e.message); }

  return hits;
}

// ── SCREENER 5: DYNAMIC UNIVERSE SCAN ──────────────────────────
// Replaces hardcoded 70-ticker watchlist with full market scan.
// Fetches 1500-4000+ stocks dynamically from Nasdaq API + Yahoo
// Screener API + Finviz, then enriches top candidates via Yahoo v7.

async function runUniverseScan() {
  console.log("  [Universe] Dynamisk scanning av HELA marknaden under $10...");
  const hits = [];

  try {
    // Steg 1: Hamta hela universumet (Nasdaq + Yahoo Screener + Finviz)
    const universe = await fetchFullUniverse({
      useCache: true,
      maxPrice: CONFIG.maxPrice,
      minPrice: CONFIG.minPrice,
    });

    console.log(`  [Universe] ${universe.length} aktier i universumet`);

    // Steg 2: Identifiera intressanta kandidater fran universumsdata
    const momentumCandidates = filterMomentum(universe);
    const breakoutCandidates = filterBreakout(universe);
    const anomalyCandidates = filterAnomaly(universe);

    console.log(`  [Universe] Momentum: ${momentumCandidates.length}, Breakout: ${breakoutCandidates.length}, Anomali: ${anomalyCandidates.length}`);

    // Steg 3: Samla alla kandidater som behover berikad realtidsdata
    const candidateMap = new Map();

    for (const s of momentumCandidates) candidateMap.set(s.ticker, { ...s, _reason: "momentum" });
    for (const s of breakoutCandidates) {
      if (!candidateMap.has(s.ticker)) candidateMap.set(s.ticker, { ...s, _reason: "breakout" });
      else candidateMap.get(s.ticker)._reason += "+breakout";
    }
    for (const s of anomalyCandidates) {
      if (!candidateMap.has(s.ticker)) candidateMap.set(s.ticker, { ...s, _reason: "anomaly" });
      else candidateMap.get(s.ticker)._reason += "+anomaly";
    }

    // Lagg till topp-aktier sorterat pa volym
    const byVolume = [...universe]
      .filter(s => s.volume > 500000)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 200);

    for (const s of byVolume) {
      if (!candidateMap.has(s.ticker)) {
        candidateMap.set(s.ticker, { ...s, _reason: "high_volume" });
      }
    }

    const candidates = [...candidateMap.values()];
    console.log(`  [Universe] ${candidates.length} kandidater att berika med Yahoo v7`);

    // Steg 4: Berika kandidaterna med realtidsdata fran Yahoo v7 bulk quote
    const tickers = candidates.map(c => c.ticker);
    const batchSize = 100;

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const symbols = batch.join(",");

      try {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
        const data = await yahooFetch(url);
        const quotes = data?.quoteResponse?.result || [];
        console.log(`  [Universe] Yahoo berika batch ${Math.floor(i/batchSize)+1}: ${quotes.length} svar`);

        for (const q of quotes) {
          const price = q.regularMarketPrice;
          if (!price || price < CONFIG.minPrice || price > CONFIG.maxPrice) continue;
          if (!q.symbol) continue;

          const changePct = q.regularMarketChangePercent || 0;
          const volume = q.regularMarketVolume || 0;
          const avgVol = q.averageDailyVolume3Month || 0;
          const relVol = avgVol > 0 ? volume / avgVol : 0;
          const isBigMove = Math.abs(changePct) >= 3;
          const isHighVol = relVol > 2;

          const volAnalysis = analyzeUnusualVolume(q);
          const candidate = candidateMap.get(q.symbol);
          const reason = candidate?._reason || "universe";

          hits.push({
            ticker: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price,
            changePct,
            volume,
            avgVolume: avgVol,
            relativeVolume: relVol,
            marketCap: q.marketCap || 0,
            exchange: q.exchange || "US",
            sector: "",
            floatShares: q.floatShares || 0,
            shortPercentOfFloat: q.shortPercentOfFloat || 0,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow || 0,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || 0,
            unusualVolumeScore: volAnalysis.unusualVolumeScore,
            unusualVolumeSignal: volAnalysis.signal,
            scannerType: (isBigMove || isHighVol || volAnalysis.signal !== "normal")
              ? "momentum"
              : reason.includes("breakout") ? "breakout"
              : reason.includes("anomaly") ? "anomaly"
              : "watchlist",
            triggerReason: buildBulkReason(price, changePct, volume, relVol, q, volAnalysis),
          });
        }
      } catch (e) {
        console.log(`  [Universe] Yahoo berika batch error:`, e.message);
      }
    }

    // Steg 5: Lagg till aktier fran universumet som INTE berikades
    const enrichedTickers = new Set(hits.map(h => h.ticker));
    for (const s of universe) {
      if (enrichedTickers.has(s.ticker)) continue;
      if (!s.price || s.price < CONFIG.minPrice || s.price > CONFIG.maxPrice) continue;

      hits.push({
        ticker: s.ticker,
        name: s.name || s.ticker,
        price: s.price,
        changePct: s.changePct || 0,
        volume: s.volume || 0,
        avgVolume: s.avgVolume || 0,
        relativeVolume: 0,
        marketCap: s.marketCap || 0,
        exchange: "US",
        sector: s.sector || "",
        scannerType: "watchlist",
        triggerReason: `Universe | $${s.price.toFixed(2)} | ${s.sector || "N/A"} | ${getPriceTier(s.price)}`,
      });
    }

  } catch (e) {
    console.log(`  [Universe] Error: ${e.message}`);
    console.log(`  [Universe] Fallback till minimal watchlist...`);
    return await runFallbackWatchlist();
  }

  console.log(`  [Universe] Totalt: ${hits.length} aktier fran dynamisk scanning`);
  return hits;
}

// Fallback om dynamisk scanning misslyckas helt
async function runFallbackWatchlist() {
  const fallback = [
    "VXRT","TNXP","INO","SNDL","GEVO","WKHS","NKLA","TELL",
    "ACHR","GRAB","PLUG","FCEL","KULR","TLRY","CGC","DNA",
    "ASTS","LUNR","JOBY","BBAI","QBTS","RGTI","QUBT",
    "NIO","LCID","RKLB","SOUN","MARA","RIOT","IONQ","SOFI","QS","BFLY",
  ];
  const hits = [];
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${fallback.join(",")}`;
    const data = await yahooFetch(url);
    const quotes = data?.quoteResponse?.result || [];
    for (const q of quotes) {
      const price = q.regularMarketPrice;
      if (!price || price < CONFIG.minPrice || price > CONFIG.maxPrice) continue;
      hits.push({
        ticker: q.symbol, name: q.shortName || q.symbol, price,
        changePct: q.regularMarketChangePercent || 0,
        volume: q.regularMarketVolume || 0, avgVolume: q.averageDailyVolume3Month || 0,
        relativeVolume: 0, marketCap: q.marketCap || 0, exchange: q.exchange || "US",
        sector: "", scannerType: "watchlist",
        triggerReason: `Fallback | ${getPriceTier(price)}`,
      });
    }
  } catch (e) { console.log("  [Fallback] Error:", e.message); }
  return hits;
}

function buildBulkReason(price, changePct, volume, relVol, q, volAnalysis) {
  const tier = getPriceTier(price);
  const parts = [];
  if (Math.abs(changePct) >= 3) {
    parts.push(`${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`);
  }
  if (volume > 0) parts.push(`Vol: ${formatVolume(volume)}`);
  if (relVol > 2) parts.push(`${relVol.toFixed(1)}x snittvolym`);
  if (volAnalysis && volAnalysis.signal === "pump_warning") {
    parts.push("PUMP-VARNING");
  } else if (volAnalysis && volAnalysis.signal === "extreme") {
    parts.push("EXTREM VOLYM");
  }
  if (q.floatShares && q.floatShares > 0 && volume > 0) {
    const floatRot = volume / q.floatShares;
    if (floatRot > 0.5) parts.push(`Float rotation: ${(floatRot * 100).toFixed(0)}%`);
  }
  if (q.shortPercentOfFloat && q.shortPercentOfFloat > 0.15) {
    parts.push(`Short: ${(q.shortPercentOfFloat * 100).toFixed(0)}% av float`);
  }
  if (q.fiftyTwoWeekLow && price <= q.fiftyTwoWeekLow * 1.1) {
    parts.push("Nara 52v-low");
  }
  if (q.fiftyTwoWeekHigh && price >= q.fiftyTwoWeekHigh * 0.9) {
    parts.push("Nara 52v-high");
  }
  parts.push(tier);
  return parts.join(" | ");
}

// ── SCREENER 6: Pre-market gap-up scanning ─────────────────────
// Uses Yahoo Finance v8 chart API with includePrePost=true to get
// pre-market quotes. Identifies gap-ups >5% over previous close.
// Best run between 04:00-09:30 ET (pre-market session).
//
// Yahoo v8 chart endpoint:
//   URL: https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
//   Params: interval=1m (or 2m/5m), range=1d, includePrePost=true
//   Response: chart.result[0].meta contains:
//     - regularMarketPrice (last regular session price)
//     - previousClose / chartPreviousClose (yesterday's close)
//     - preMarketPrice (current pre-market price, if in session)
//     - preMarketTime (timestamp of pre-market quote)
//     - regularMarketVolume, preMarketVolume
//
// Yahoo v7 quote endpoint also returns pre-market fields:
//   URL: https://query1.finance.yahoo.com/v7/finance/quote?symbols=X,Y,Z
//   Fields: preMarketPrice, preMarketChange, preMarketChangePercent,
//           regularMarketPreviousClose, preMarketTime

async function runPreMarketGapScan() {
  console.log("  [Pre-Market] Scanning for gap-ups >5%...");
  const hits = [];

  // Check if we're in pre-market hours (04:00-09:30 ET)
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = nowET.getHours();
  const minute = nowET.getMinutes();
  const isPreMarket = (hour >= 4 && (hour < 9 || (hour === 9 && minute <= 30)));

  if (!isPreMarket) {
    console.log(`  [Pre-Market] Outside pre-market hours (${hour}:${String(minute).padStart(2,"0")} ET). Skipping.`);
    return hits;
  }

  // Universe: watchlist + trending + recent momentum stocks
  const preMarketUniverse = [
    // Core penny/small-cap watchlist most likely to gap
    "VXRT","TNXP","INO","HUMA","SNDL","GEVO","WKHS","NKLA","TELL",
    "ACHR","GRAB","PLUG","FCEL","IOVA","KULR","CATX","LXRX","TSHA","RCKT",
    "TLRY","CGC","DNA","ASTS","LUNR","JOBY","BBAI","QBTS","RGTI","QUBT",
    "OPEN","CLOV","WISH","BLNK","GOEV","PSNY","XPEV",
    "NIO","LCID","RKLB","SOUN","BTSG","MNKD","VKTX","MARA","RIOT","IONQ",
    "SOFI","HIMS","QS","BFLY","BE","CHPT","EVGO","PTRA",
    "APLS","SMMT","VYGR","ARQQ","PRCT","STEM",
  ];

  const uniqueSymbols = [...new Set(preMarketUniverse.map(s => s.toUpperCase()))];

  // Method 1: Yahoo v7 quote endpoint -- returns preMarketPrice for all
  // symbols in one batch call (much more efficient than individual chart calls)
  const batchSize = 100;
  for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
    const batch = uniqueSymbols.slice(i, i + batchSize);
    const symbols = batch.join(",");

    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
      const data = await yahooFetch(url);
      const quotes = data?.quoteResponse?.result || [];
      console.log(`  [Pre-Market] Batch ${Math.floor(i/batchSize)+1}: ${quotes.length} quotes`);

      for (const q of quotes) {
        if (!q.symbol) continue;

        // Pre-market price from v7 quote
        const prePrice = q.preMarketPrice;
        const prevClose = q.regularMarketPreviousClose;

        // Skip if no pre-market data available
        if (!prePrice || !prevClose || prevClose <= 0) continue;

        // Only sub-$10 stocks
        if (prePrice < CONFIG.minPrice || prePrice > CONFIG.maxPrice) continue;

        // Calculate gap percentage
        const gapPct = ((prePrice - prevClose) / prevClose) * 100;

        // Filter: gap-up >5%
        if (gapPct < 5) continue;

        const preVolume = q.preMarketVolume || 0;
        const avgVol = q.averageDailyVolume3Month || 0;

        hits.push({
          ticker: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: prePrice,
          changePct: gapPct,
          volume: preVolume,
          avgVolume: avgVol,
          relativeVolume: 0, // pre-market volume not comparable to daily avg
          marketCap: q.marketCap || 0,
          exchange: q.exchange || "US",
          sector: "",
          scannerType: "premarket_gap",
          triggerReason: buildPreMarketReason(q.symbol, prePrice, prevClose, gapPct, preVolume),
        });
      }
    } catch (e) {
      console.log(`  [Pre-Market] Batch error: ${e.message}`);
    }
  }

  // Sort by gap size (largest first)
  hits.sort((a, b) => b.changePct - a.changePct);

  console.log(`  [Pre-Market] Found ${hits.length} gap-ups >5%`);
  if (hits.length > 0) {
    console.log("  [Pre-Market] Top gaps:");
    for (const h of hits.slice(0, 10)) {
      console.log(`    ${h.ticker.padEnd(7)} Pre: $${h.price.toFixed(2)} Gap: +${h.changePct.toFixed(1)}% Vol: ${formatVolume(h.volume)}`);
    }
  }

  return hits;
}

function buildPreMarketReason(symbol, prePrice, prevClose, gapPct, preVolume) {
  const parts = [
    `PRE-MARKET GAP +${gapPct.toFixed(1)}%`,
    `Pre: $${prePrice.toFixed(2)}`,
    `Prev close: $${prevClose.toFixed(2)}`,
  ];
  if (preVolume > 0) parts.push(`Pre-vol: ${formatVolume(preVolume)}`);
  parts.push(getPriceTier(prePrice));
  return parts.join(" | ");
}

// ── Standalone pre-market scanner (for scheduled early-morning runs) ──

async function runPreMarketScanStandalone() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PRE-MARKET GAP SCANNER - ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}\n`);

  const gaps = await runPreMarketGapScan();

  if (gaps.length === 0) {
    console.log("No gap-ups >5% found in pre-market.");
    return [];
  }

  // Score and save
  const today = getTodayDate();
  const scored = gaps.map((hit) => {
    const risk = calculateRiskScore(hit);
    return {
      ticker: hit.ticker, name: hit.name, price: hit.price,
      change_pct: hit.changePct || 0,
      volume: hit.volume || 0, avg_volume_20d: hit.avgVolume || 0,
      relative_volume: hit.relativeVolume || 0,
      market_cap: hit.marketCap || 0, sector: hit.sector || "",
      exchange: hit.exchange || "", scanner_type: "premarket_gap",
      trigger_reason: hit.triggerReason,
      risk_score: risk.score, risk_flags: JSON.stringify(risk.flags),
      confidence_score: calculateConfidence(hit) + 10, // Bonus for pre-market signal
      layers_triggered: 1, scan_date: today,
      price_tier: getPriceTier(hit.price),
    };
  });

  db.insertHits(scored);
  return scored;
}

// ── Enrich SEC catalyst hits with Yahoo prices ──────────────────

async function enrichCatalystHits(hits) {
  console.log(`  [Enrich] Getting prices for ${hits.length} catalyst hits...`);
  const enriched = [];
  let count = 0;

  for (const hit of hits) {
    if (hit.price > 0) { enriched.push(hit); continue; }
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${hit.ticker}?interval=1d&range=1d`;
      const data = await yahooFetch(url);
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) continue;

      const price = meta.regularMarketPrice;
      if (price < CONFIG.minPrice || price > CONFIG.maxPrice) continue;

      const prevClose = meta.previousClose || meta.chartPreviousClose;
      hit.price = price;
      hit.changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
      hit.volume = meta.regularMarketVolume || 0;
      hit.triggerReason += ` | $${price.toFixed(2)} (${hit.changePct >= 0 ? "+" : ""}${hit.changePct.toFixed(1)}%)`;
      enriched.push(hit);
      count++;
      if (count >= 20) break; // limit proxy calls
    } catch (e) { /* skip */ }
  }

  console.log(`  [Enrich] Got prices for ${count} catalyst stocks`);
  return enriched;
}

// ── MAIN SCAN ───────────────────────────────────────────────────

async function runFullScan() {
  const startTime = Date.now();
  const today = getTodayDate();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`MARKET SCANNER - ${new Date().toISOString()}`);
  console.log(`Scanning ALL US stocks $${CONFIG.minPrice} - $${CONFIG.maxPrice}`);
  console.log(`${"=".repeat(60)}\n`);

  db.clearHitsForDate(today);

  // Run screeners (all free, no rate limits for Yahoo bulk)
  const yahooHits = await runYahooScreener();      // gainers/losers/active (300+ stocks)
  const bulkHits = await runUniverseScan();           // DYNAMIC: 1500-4000+ stocks from Nasdaq/Yahoo/Finviz
  const trendingHits = await runYahooTrending();    // trending tickers
  const secHits = await runSECScreen();             // SEC EDGAR 8-K filings
  const fmpHits = await runFMPScreener();           // FMP if key available
  const preMarketHits = await runPreMarketGapScan(); // Pre-market gap-ups >5%

  // Enrich SEC catalyst hits with prices
  const enrichedSec = await enrichCatalystHits(secHits.slice(0, 30));

  const allHits = [...yahooHits, ...bulkHits, ...trendingHits, ...enrichedSec, ...fmpHits, ...preMarketHits];
  console.log(`\nRaw total: ${allHits.length} (Yahoo screener: ${yahooHits.length}, Universe scan: ${bulkHits.length}, Trending: ${trendingHits.length}, SEC: ${enrichedSec.length}, FMP: ${fmpHits.length}, Pre-market: ${preMarketHits.length})`);

  // Deduplicate by ticker (keep version with highest abs change)
  const tickerMap = new Map();
  for (const hit of allHits) {
    const existing = tickerMap.get(hit.ticker);
    if (!existing || Math.abs(hit.changePct || 0) > Math.abs(existing.changePct || 0)) {
      tickerMap.set(hit.ticker, hit);
    }
  }
  const unique = [...tickerMap.values()];
  console.log(`After dedup: ${unique.length}`);

  // Kill filters
  let killed = 0;
  const survivors = [];
  for (const hit of unique) {
    const killReasons = applyKillFilters(hit);
    if (killReasons.length > 0) {
      killed++;
      db.insertKillLog(hit.ticker, killReasons.join("; "), today);
      continue;
    }
    survivors.push(hit);
  }
  console.log(`After kill filters: ${survivors.length} (killed: ${killed})`);

  // Score and rank ALL
  const scored = survivors.map((hit) => {
    const risk = calculateRiskScore(hit);
    return {
      ticker: hit.ticker, name: hit.name, price: hit.price,
      change_pct: hit.changePct || 0,
      volume: hit.volume || 0, avg_volume_20d: hit.avgVolume || 0,
      relative_volume: hit.relativeVolume || 0,
      market_cap: hit.marketCap || 0, sector: hit.sector || "",
      exchange: hit.exchange || "", scanner_type: hit.scannerType,
      trigger_reason: hit.triggerReason,
      risk_score: risk.score, risk_flags: JSON.stringify(risk.flags),
      confidence_score: calculateConfidence(hit),
      layers_triggered: 1, scan_date: today,
      price_tier: getPriceTier(hit.price),
    };
  });

  scored.sort((a, b) => b.confidence_score - a.confidence_score);

  // Enrich with insider data if available
  let finalScored = scored;
  if (enrichWithInsiderData) {
    try {
      console.log("  [Insider] Enriching top hits with insider data...");
      finalScored = await enrichWithInsiderData(scored);
    } catch (e) {
      console.log("  [Insider] Enrichment skipped:", e.message);
    }
  }

  // Save ALL results
  db.insertHits(finalScored);

  const duration = Date.now() - startTime;
  db.insertScanLog({
    scan_type: "full",
    stocks_scanned: unique.length,
    hits_found: allHits.length,
    hits_after_filter: scored.length,
    killed,
    duration_ms: duration,
    started_at: new Date(startTime).toISOString(),
  });

  // Summary
  const tiers = { "Under $1": 0, "$1-$5": 0, "$5-$10": 0 };
  const types = {};
  for (const h of scored) {
    tiers[h.price_tier] = (tiers[h.price_tier] || 0) + 1;
    types[h.scanner_type] = (types[h.scanner_type] || 0) + 1;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SCAN COMPLETE in ${(duration / 1000).toFixed(1)}s`);
  console.log(`Universe: ${unique.length} unique stocks scanned`);
  console.log(`Results: ${scored.length} passed filters`);
  console.log(`  Under $1: ${tiers["Under $1"] || 0} | $1-$5: ${tiers["$1-$5"] || 0} | $5-$10: ${tiers["$5-$10"] || 0}`);
  console.log(`  Momentum: ${types.momentum || 0} | Catalyst: ${types.catalyst || 0} | Trending: ${types.trending || 0} | Pre-market: ${types.premarket_gap || 0} | Watchlist: ${types.watchlist || 0}`);
  console.log(`${"=".repeat(60)}\n`);

  const top = scored.slice(0, 15);
  if (top.length > 0) {
    console.log("TOP 15 HITS:");
    console.log("-".repeat(90));
    for (const h of top) {
      const risk = h.risk_score <= 2 ? "[LOW ]" : h.risk_score <= 3 ? "[MED ]" : "[HIGH]";
      console.log(
        `  ${risk} ${h.ticker.padEnd(7)} $${h.price.toFixed(2).padStart(7)} ` +
        `${((h.change_pct >= 0 ? "+" : "") + h.change_pct.toFixed(1)).padStart(7)}% ` +
        `Vol:${formatVolume(h.volume).padStart(6)} ` +
        `Conf:${String(h.confidence_score).padStart(3)} ${h.price_tier.padEnd(8)} ${h.trigger_reason.substring(0, 35)}`
      );
    }
  }

  return scored;
}

function getTodayDate() { return new Date().toISOString().split("T")[0]; }
function getDateDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split("T")[0]; }

if (process.argv.includes("--run-once")) {
  runFullScan().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

if (process.argv.includes("--premarket")) {
  runPreMarketScanStandalone().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { runFullScan, runPreMarketScanStandalone, CONFIG };
