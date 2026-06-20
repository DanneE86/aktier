/**
 * INSIDER FLOW SCANNER
 * ====================
 * Bevakar insidertransaktioner (Form 4) for aktier under $10.
 * Identifierar open market purchases och cluster-kop (3+ insiders inom 30 dagar).
 *
 * Datakallor:
 *   1. Finnhub API (primar) -- strukturerad JSON, gratis 60 req/min
 *   2. OpenInsider scraping (komplement) -- cluster buys + screener
 *   3. SEC EDGAR EFTS (komplement) -- nya Form 4 filings
 *
 * Akademisk grund: Insider-clustering i small caps outperformar med 7-13% arligen
 * (Lakonishok & Lee 2001; Jeng, Metrick & Zeckhauser 2003)
 */

const CONFIG = {
  finnhubKey: process.env.FINNHUB_KEY || "",
  maxPrice: 10.0,
  minPrice: 0.1,
  lookbackDays: 30,            // Hur langt bakatt vi letar efter insiderkop
  clusterThreshold: 3,         // Min antal insiders for cluster-signal
  clusterWindowDays: 30,       // Tidsfonster for cluster-detektion
  significantBuyUsd: 50000,    // Kop over detta belopp flaggas som "significant"
  largeBuyUsd: 100000,         // Kop over detta belopp flaggas som "large"
  finnhubRateLimit: 55,        // Max anrop/minut (marginal under 60)
  userAgent: "StockScanner/1.0 (daniel86.ekstrom@gmail.com)",
};

// ── UTILITY ────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

async function fetchJson(url, headers = {}) {
  const opts = {
    headers: {
      "User-Agent": CONFIG.userAgent,
      Accept: "application/json",
      ...headers,
    },
    signal: AbortSignal.timeout(15000),
  };
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ── TRANSACTION CODE DEFINITIONS ───────────────────────────────

const TRANSACTION_CODES = {
  P: { type: "purchase", meaningful: true, label: "Open market purchase" },
  S: { type: "sale", meaningful: true, label: "Open market sale" },
  M: { type: "exercise", meaningful: false, label: "Option exercise" },
  A: { type: "award", meaningful: false, label: "Grant/award" },
  F: { type: "tax", meaningful: false, label: "Tax withholding" },
  G: { type: "gift", meaningful: false, label: "Gift" },
  D: { type: "disposition", meaningful: false, label: "Disposition to issuer" },
  I: { type: "discretionary", meaningful: false, label: "Discretionary transaction" },
  C: { type: "conversion", meaningful: false, label: "Conversion of derivative" },
  J: { type: "other", meaningful: false, label: "Other acquisition/disposition" },
};

function isPurchase(code) {
  return code === "P";
}

function isMeaningful(code) {
  return TRANSACTION_CODES[code]?.meaningful === true;
}

// ── LAYER 1: FINNHUB API ───────────────────────────────────────
// Hamtar insidertransaktioner per ticker via Finnhub REST API
// Gratis: 60 anrop/min, max 100 transaktioner per anrop

async function fetchFinnhubInsiderData(symbol) {
  if (!CONFIG.finnhubKey) {
    return null;
  }

  const fromDate = getDateStr(CONFIG.lookbackDays);
  const toDate = getDateStr(0);
  const url =
    `https://finnhub.io/api/v1/stock/insider-transactions` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&from=${fromDate}` +
    `&to=${toDate}` +
    `&token=${CONFIG.finnhubKey}`;

  try {
    const data = await fetchJson(url);
    return data?.data || [];
  } catch (e) {
    console.log(`  [Finnhub] Error for ${symbol}: ${e.message}`);
    return [];
  }
}

/**
 * Batch-hamtar insiderdata for en lista med tickers.
 * Respekterar Finnhub rate limit (60 req/min).
 */
async function batchFetchInsiderData(tickers) {
  if (!CONFIG.finnhubKey) {
    console.log("  [Finnhub] Ingen API-nyckel -- hoppar over Finnhub-lager");
    return new Map();
  }

  console.log(`  [Finnhub] Hamtar insiderdata for ${tickers.length} tickers...`);
  const results = new Map();
  let requestCount = 0;
  const startTime = Date.now();

  for (const ticker of tickers) {
    // Rate limiting: max 55 requests per minut (marginal)
    if (requestCount > 0 && requestCount % CONFIG.finnhubRateLimit === 0) {
      const elapsed = Date.now() - startTime;
      const waitTime = Math.max(0, 60000 - elapsed);
      if (waitTime > 0) {
        console.log(`  [Finnhub] Rate limit -- vantar ${(waitTime / 1000).toFixed(0)}s...`);
        await sleep(waitTime);
      }
    }

    const transactions = await fetchFinnhubInsiderData(ticker);
    if (transactions && transactions.length > 0) {
      results.set(ticker, transactions);
    }
    requestCount++;

    // Liten fordrojning mellan anrop
    await sleep(100);
  }

  console.log(`  [Finnhub] Klar: ${results.size}/${tickers.length} tickers hade insiderdata`);
  return results;
}

// ── LAYER 2: OPENINSIDER SCRAPING ──────────────────────────────
// Scrapar OpenInsiders screener och cluster buys-sida

/**
 * Scrapar OpenInsiders screener for open market purchases under $10.
 * Returnerar ratt HTML-tabell som parsas med regex (inga beroenden).
 *
 * OBS: OpenInsider returnerar HTML, inte JSON.
 * Vi parser tabellrader med regex (enklare an att lossa cheerio-beroende).
 */
async function scrapeOpenInsiderPurchases() {
  console.log("  [OpenInsider] Scrapar senaste open market purchases under $10...");

  // URL-parametrar (reverse-engineered fran openinsider.com/screener):
  // ph=10    -> max pris $10
  // fd=30    -> senaste 30 dagarna
  // xp=1    -> exkludera option exercise (purchases only!)
  // xs=1    -> exkludera sales
  // cnt=500 -> max 500 resultat
  const url =
    "http://openinsider.com/screener" +
    "?s=&o=&pl=&ph=10&ll=&lh=&fd=30&fdr=&td=0&tdr=" +
    "&fdlyl=&fdlyh=&daysago=&xp=1&xs=1&vl=&vh=&ocl=&och=" +
    "&sic1=-1&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=" +
    "&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=0&cnt=500&page=1";

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": CONFIG.userAgent },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    return parseOpenInsiderTable(html);
  } catch (e) {
    console.log(`  [OpenInsider] Scraping error: ${e.message}`);
    return [];
  }
}

/**
 * Scrapar OpenInsiders cluster buys-sida (redan aggregerade).
 * Cluster buys = 3+ insiders som koper i samma bolag inom kort tid.
 */
async function scrapeOpenInsiderClusterBuys() {
  console.log("  [OpenInsider] Scrapar cluster buys...");

  const url = "http://openinsider.com/latest-cluster-buys";

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": CONFIG.userAgent },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    return parseOpenInsiderTable(html);
  } catch (e) {
    console.log(`  [OpenInsider] Cluster buys error: ${e.message}`);
    return [];
  }
}

/**
 * Parser en OpenInsider HTML-tabell.
 * OpenInsiders tabeller har konsekvent format med <td>-element.
 * Kolumnordning (typ):
 *   0: X (checkbox)
 *   1: Filing Date
 *   2: Trade Date
 *   3: Ticker
 *   4: Company Name
 *   5: Insider Name
 *   6: Title
 *   7: Trade Type
 *   8: Price
 *   9: Qty
 *  10: Owned
 *  11: deltaOwn (% forandring)
 *  12: Value
 */
function parseOpenInsiderTable(html) {
  const results = [];

  // Hitta alla tabellrader i tinytable (OpenInsiders tabell-klass)
  const tableMatch = html.match(/<table[^>]*class="[^"]*tinytable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    console.log("  [OpenInsider] Ingen tabell hittad i HTML");
    return results;
  }

  const tableHtml = tableMatch[1];
  // Matcha alla <tr> som innehaller <td> (inte header-rader med <th>)
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];
    // Skippa header-rader
    if (rowHtml.includes("<th")) continue;

    // Extrahera alla <td>-varden
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      // Strip HTML-taggar fran cellinnehall
      const text = cellMatch[1].replace(/<[^>]+>/g, "").trim();
      cells.push(text);
    }

    // OpenInsider-tabeller har minst 10 kolumner
    if (cells.length < 10) continue;

    // Extrahera ticker fran kolumn 3 (kan vara inbaddad i en <a>-tagg)
    const tickerMatch = rowHtml.match(/<a[^>]*href="\/[A-Z]+"[^>]*>([A-Z]+)<\/a>/i);
    const ticker = tickerMatch ? tickerMatch[1].toUpperCase() : cells[3]?.toUpperCase();
    if (!ticker || ticker.length > 5) continue;

    // Parsa numeriska varden
    const filingDate = cells[1] || "";
    const tradeDate = cells[2] || "";
    const companyName = cells[4] || ticker;
    const insiderName = cells[5] || "Unknown";
    const insiderTitle = cells[6] || "";
    const tradeType = cells[7] || "";
    const priceStr = (cells[8] || "").replace(/[$,]/g, "");
    const qtyStr = (cells[9] || "").replace(/[+,]/g, "");
    const valueStr = (cells[12] || cells[11] || "").replace(/[$,+]/g, "");

    const price = parseFloat(priceStr) || 0;
    const qty = parseInt(qtyStr) || 0;
    const value = parseInt(valueStr) || 0;

    // Filtrera: bara under $10 och med positiv kvantitet (kop)
    if (price > CONFIG.maxPrice || price < CONFIG.minPrice) continue;
    if (qty <= 0) continue;

    results.push({
      ticker,
      companyName,
      insiderName,
      insiderTitle,
      tradeType,
      filingDate,
      tradeDate,
      price,
      quantity: qty,
      value: value || price * qty,
      source: "openinsider",
    });
  }

  console.log(`  [OpenInsider] Parsade ${results.length} kop-transaktioner`);
  return results;
}

// ── LAYER 3: SEC EDGAR FORM 4 FILINGS ─────────────────────────
// Anvander EFTS-endpointen for att hitta nya Form 4-filings

async function fetchSECForm4Filings() {
  console.log("  [SEC EDGAR] Soker nya Form 4-filings senaste 2 dagarna...");

  const today = getDateStr(0);
  const twoDaysAgo = getDateStr(2);
  const url =
    `https://efts.sec.gov/LATEST/search-index` +
    `?forms=4` +
    `&dateRange=custom` +
    `&startdt=${twoDaysAgo}` +
    `&enddt=${today}` +
    `&from=0&size=100`;

  try {
    const data = await fetchJson(url, {
      "User-Agent": CONFIG.userAgent,
    });

    const filings = [];
    if (data?.hits?.hits) {
      for (const hit of data.hits.hits) {
        const src = hit._source || {};
        let tickers = src.tickers || src.ticker;
        if (!tickers) continue;
        if (!Array.isArray(tickers)) tickers = [tickers];

        for (const ticker of tickers) {
          if (!ticker || ticker.length > 5 || ticker.includes("-")) continue;
          filings.push({
            ticker: ticker.toUpperCase(),
            entityName: src.entity_name || ticker,
            filingDate: src.file_date || today,
            cik: src.cik || "",
            source: "sec_edgar",
          });
        }
      }
    }

    console.log(`  [SEC EDGAR] Hittade ${filings.length} tickers med Form 4-filings`);
    return filings;
  } catch (e) {
    console.log(`  [SEC EDGAR] Error: ${e.message}`);
    return [];
  }
}

// ── ANALYS: CLUSTER-DETEKTION ──────────────────────────────────

/**
 * Analyserar insidertransaktioner och identifierar cluster-kop.
 *
 * Cluster-kop = 3+ UNIKA insiders som koper (open market purchase)
 * i samma bolag inom 30 dagar.
 *
 * Returnerar en array av InsiderSignal-objekt, sorterade efter signalstyrka.
 */
function analyzeInsiderSignals(finnhubData, openInsiderData = []) {
  // Bygg en sammanlagd bild per ticker
  const tickerMap = new Map();

  // Process Finnhub-data
  for (const [ticker, transactions] of finnhubData) {
    if (!tickerMap.has(ticker)) {
      tickerMap.set(ticker, { purchases: [], sales: [], allTransactions: [] });
    }
    const entry = tickerMap.get(ticker);

    for (const tx of transactions) {
      const normalized = {
        ticker,
        insiderName: tx.name || "Unknown",
        insiderTitle: "",
        transactionCode: tx.transactionCode || "",
        price: tx.transactionPrice || 0,
        shares: Math.abs(tx.change || 0),
        sharesAfter: tx.share || 0,
        filingDate: tx.filingDate || "",
        transactionDate: tx.transactionDate || "",
        value: Math.abs((tx.change || 0) * (tx.transactionPrice || 0)),
        source: "finnhub",
      };

      entry.allTransactions.push(normalized);
      if (isPurchase(tx.transactionCode)) {
        entry.purchases.push(normalized);
      } else if (tx.transactionCode === "S") {
        entry.sales.push(normalized);
      }
    }
  }

  // Process OpenInsider-data
  for (const oi of openInsiderData) {
    if (!tickerMap.has(oi.ticker)) {
      tickerMap.set(oi.ticker, { purchases: [], sales: [], allTransactions: [] });
    }
    const entry = tickerMap.get(oi.ticker);
    const normalized = {
      ticker: oi.ticker,
      insiderName: oi.insiderName,
      insiderTitle: oi.insiderTitle,
      transactionCode: "P",
      price: oi.price,
      shares: oi.quantity,
      sharesAfter: 0,
      filingDate: oi.filingDate,
      transactionDate: oi.tradeDate,
      value: oi.value,
      source: "openinsider",
    };
    entry.purchases.push(normalized);
    entry.allTransactions.push(normalized);
  }

  // Analysera varje ticker
  const signals = [];

  for (const [ticker, data] of tickerMap) {
    const purchases = data.purchases;
    if (purchases.length === 0) continue;

    // Rakna unika insiders som kopt
    const uniqueBuyers = new Set(purchases.map((p) => p.insiderName));
    const uniqueBuyerCount = uniqueBuyers.size;

    // Total kopvolym
    const totalBuyValue = purchases.reduce((sum, p) => sum + p.value, 0);
    const totalShares = purchases.reduce((sum, p) => sum + p.shares, 0);
    const avgPrice = totalBuyValue / totalShares || 0;

    // Cluster-detektion: 3+ unika insiders inom clusterWindowDays
    const isCluster = uniqueBuyerCount >= CONFIG.clusterThreshold;

    // Storsta enskilda kop
    const largestBuy = purchases.reduce(
      (max, p) => (p.value > max.value ? p : max),
      purchases[0]
    );

    // Kolla om CEO/CFO ar bland koparna
    const hasCxO = purchases.some((p) => {
      const title = (p.insiderTitle || p.insiderName || "").toUpperCase();
      return (
        title.includes("CEO") ||
        title.includes("CFO") ||
        title.includes("COO") ||
        title.includes("CHIEF") ||
        title.includes("PRESIDENT")
      );
    });

    // Kolla om det ar directors
    const hasDirectors = purchases.some((p) => {
      const title = (p.insiderTitle || "").toUpperCase();
      return title.includes("DIRECTOR") || title.includes("DIR");
    });

    // Kolla 10%+ owners
    const hasTenPctOwner = purchases.some((p) => {
      const title = (p.insiderTitle || "").toUpperCase();
      return title.includes("10%") || title.includes("TEN PERCENT");
    });

    // Antal forsaljningar (for balans-analys)
    const totalSellValue = data.sales.reduce((sum, s) => sum + Math.abs(s.value || 0), 0);
    const buyToSellRatio =
      totalSellValue > 0 ? totalBuyValue / totalSellValue : totalBuyValue > 0 ? Infinity : 0;

    // Berakna signalstyrka (0-100)
    let signalStrength = 0;
    const signalReasons = [];

    // Cluster-kop: stark signal
    if (isCluster) {
      signalStrength += 35;
      signalReasons.push(
        `CLUSTER: ${uniqueBuyerCount} unika insiders kopte inom ${CONFIG.clusterWindowDays} dagar`
      );
    } else if (uniqueBuyerCount >= 2) {
      signalStrength += 15;
      signalReasons.push(`${uniqueBuyerCount} insiders kopte`);
    } else {
      signalStrength += 5;
    }

    // CEO/CFO-kop: stark signal
    if (hasCxO) {
      signalStrength += 25;
      signalReasons.push("CEO/CFO bland koparna");
    }

    // Directors-kop
    if (hasDirectors) {
      signalStrength += 10;
      signalReasons.push("Director(s) bland koparna");
    }

    // Stort kop (>$100K): stark signal
    if (totalBuyValue >= CONFIG.largeBuyUsd) {
      signalStrength += 20;
      signalReasons.push(`Stort kop: $${formatValue(totalBuyValue)}`);
    } else if (totalBuyValue >= CONFIG.significantBuyUsd) {
      signalStrength += 10;
      signalReasons.push(`Significant kop: $${formatValue(totalBuyValue)}`);
    }

    // Kop/salj-ratio
    if (buyToSellRatio > 5) {
      signalStrength += 5;
      signalReasons.push("Stark kop-dominans (>5:1 ratio)");
    }

    // 10% owner
    if (hasTenPctOwner) {
      signalStrength += 10;
      signalReasons.push("10%+ agare bland koparna");
    }

    signalStrength = Math.min(signalStrength, 100);

    signals.push({
      ticker,
      signalStrength,
      signalType: isCluster ? "cluster_buy" : "insider_buy",
      uniqueBuyerCount,
      totalBuyValue,
      totalShares,
      avgPrice,
      isCluster,
      hasCxO,
      hasDirectors,
      hasTenPctOwner,
      largestBuy: {
        insiderName: largestBuy.insiderName,
        value: largestBuy.value,
        shares: largestBuy.shares,
        date: largestBuy.transactionDate || largestBuy.filingDate,
      },
      buyers: [...uniqueBuyers],
      purchases,
      signalReasons,
      buyToSellRatio,
      totalSellValue,
    });
  }

  // Sortera: cluster forst, sedan efter signalstyrka
  signals.sort((a, b) => {
    if (a.isCluster !== b.isCluster) return b.isCluster ? 1 : -1;
    return b.signalStrength - a.signalStrength;
  });

  return signals;
}

function formatValue(val) {
  if (val >= 1e6) return (val / 1e6).toFixed(1) + "M";
  if (val >= 1e3) return (val / 1e3).toFixed(0) + "K";
  return String(Math.round(val));
}

// ── MAIN INSIDER SCAN ──────────────────────────────────────────

/**
 * Kor en fullstandig insiderscan.
 *
 * @param {string[]} tickersToScan - Lista pa tickers att soka insiderdata for
 *                                   (fran scannerns befintliga databas)
 * @returns {object} - Resultat med signals, clusterBuys, summary
 */
async function runInsiderScan(tickersToScan = []) {
  const startTime = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`INSIDER FLOW SCANNER - ${new Date().toISOString()}`);
  console.log(`Soker insiderkop for ${tickersToScan.length} tickers (sub-$10)`);
  console.log(`${"=".repeat(60)}\n`);

  // Layer 1: Finnhub (om API-nyckel finns)
  const finnhubData = await batchFetchInsiderData(tickersToScan);

  // Layer 2: OpenInsider scraping (alltid tillganglig)
  let openInsiderPurchases = [];
  let openInsiderClusters = [];
  try {
    openInsiderPurchases = await scrapeOpenInsiderPurchases();
    openInsiderClusters = await scrapeOpenInsiderClusterBuys();
  } catch (e) {
    console.log(`  [OpenInsider] Overgripande error: ${e.message}`);
  }

  // Layer 3: SEC EDGAR Form 4 (nya filings for bredare tackning)
  const secForm4Filings = await fetchSECForm4Filings();

  // Analysera alla insidersignaler
  const allOpenInsider = [...openInsiderPurchases, ...openInsiderClusters];
  const signals = analyzeInsiderSignals(finnhubData, allOpenInsider);

  // Filtrera signaler
  const clusterBuys = signals.filter((s) => s.isCluster);
  const significantBuys = signals.filter(
    (s) => !s.isCluster && s.signalStrength >= 30
  );
  const allBuys = signals.filter((s) => s.signalStrength >= 10);

  // Nya Form 4-tickers som inte redan ar i var bevakning
  const existingTickers = new Set(tickersToScan.map((t) => t.toUpperCase()));
  const newForm4Tickers = secForm4Filings
    .filter((f) => !existingTickers.has(f.ticker))
    .map((f) => f.ticker);
  const uniqueNewTickers = [...new Set(newForm4Tickers)];

  const duration = Date.now() - startTime;

  // Sammanfattning
  console.log(`\n${"=".repeat(60)}`);
  console.log(`INSIDER SCAN KLAR pa ${(duration / 1000).toFixed(1)}s`);
  console.log(`  Finnhub: ${finnhubData.size} tickers med data`);
  console.log(`  OpenInsider: ${openInsiderPurchases.length} kop + ${openInsiderClusters.length} cluster-poster`);
  console.log(`  SEC EDGAR: ${secForm4Filings.length} nya Form 4-filings`);
  console.log(`  Totalt: ${signals.length} signaler, ${clusterBuys.length} cluster-kop`);
  console.log(`${"=".repeat(60)}\n`);

  if (clusterBuys.length > 0) {
    console.log("CLUSTER-KOP (starkaste signalerna):");
    console.log("-".repeat(70));
    for (const cb of clusterBuys) {
      console.log(
        `  [${cb.signalStrength}] ${cb.ticker.padEnd(7)} ` +
          `${cb.uniqueBuyerCount} insiders | $${formatValue(cb.totalBuyValue)} totalt | ` +
          `${cb.signalReasons.slice(0, 2).join(" | ")}`
      );
    }
    console.log();
  }

  if (significantBuys.length > 0) {
    console.log("SIGNIFICANT INSIDER-KOP:");
    console.log("-".repeat(70));
    for (const sb of significantBuys.slice(0, 10)) {
      console.log(
        `  [${sb.signalStrength}] ${sb.ticker.padEnd(7)} ` +
          `${sb.uniqueBuyerCount} insider(s) | $${formatValue(sb.totalBuyValue)} | ` +
          `${sb.signalReasons.slice(0, 2).join(" | ")}`
      );
    }
    console.log();
  }

  return {
    signals: allBuys,
    clusterBuys,
    significantBuys,
    newForm4Tickers: uniqueNewTickers,
    summary: {
      finnhubTickers: finnhubData.size,
      openInsiderPurchases: openInsiderPurchases.length,
      openInsiderClusters: openInsiderClusters.length,
      secForm4Filings: secForm4Filings.length,
      totalSignals: signals.length,
      clusterBuyCount: clusterBuys.length,
      significantBuyCount: significantBuys.length,
      durationMs: duration,
      scanDate: getDateStr(0),
    },
  };
}

// ── INTEGRATION MED BEFINTLIG SCANNER ──────────────────────────

/**
 * Berikar scanner-hits med insider-signaler.
 * Anropas fran scanner.js efter att huvudscannen ar klar.
 *
 * @param {Array} scannerHits - Befintliga scanner_hits fran db
 * @returns {Array} - Berikade hits med insider_signal-falt
 */
async function enrichWithInsiderData(scannerHits) {
  // Extrahera unika tickers fran befintliga hits
  const tickers = [...new Set(scannerHits.map((h) => h.ticker))];

  if (tickers.length === 0) {
    console.log("  [Insider] Inga tickers att berika");
    return scannerHits;
  }

  // Kor insiderscan (begransat till vara tickers)
  const insiderResult = await runInsiderScan(tickers);

  // Skapa lookup-map
  const signalMap = new Map();
  for (const sig of insiderResult.signals) {
    signalMap.set(sig.ticker, sig);
  }

  // Berika varje hit
  const enriched = scannerHits.map((hit) => {
    const signal = signalMap.get(hit.ticker);
    if (!signal) return hit;

    return {
      ...hit,
      insider_signal: signal.signalType,
      insider_strength: signal.signalStrength,
      insider_buyers: signal.uniqueBuyerCount,
      insider_total_value: signal.totalBuyValue,
      insider_is_cluster: signal.isCluster,
      insider_has_cxo: signal.hasCxO,
      insider_reasons: signal.signalReasons.join(" | "),
      // Hoj confidence_score om insider-signal ar stark
      confidence_score: Math.min(
        100,
        (hit.confidence_score || 30) + Math.round(signal.signalStrength * 0.5)
      ),
    };
  });

  // Lagg till nya tickers fran OpenInsider som inte redan finns
  const existingTickers = new Set(enriched.map((h) => h.ticker));
  for (const sig of insiderResult.clusterBuys) {
    if (!existingTickers.has(sig.ticker)) {
      enriched.push({
        ticker: sig.ticker,
        name: sig.ticker,
        price: sig.avgPrice,
        change_pct: 0,
        volume: 0,
        scanner_type: "insider_cluster",
        trigger_reason: `INSIDER CLUSTER: ${sig.uniqueBuyerCount} insiders kopte $${formatValue(sig.totalBuyValue)} | ${sig.signalReasons[0] || ""}`,
        risk_score: 2,
        risk_flags: "[]",
        confidence_score: Math.min(100, 40 + Math.round(sig.signalStrength * 0.5)),
        insider_signal: "cluster_buy",
        insider_strength: sig.signalStrength,
        insider_buyers: sig.uniqueBuyerCount,
        insider_total_value: sig.totalBuyValue,
        insider_is_cluster: true,
        insider_has_cxo: sig.hasCxO,
        insider_reasons: sig.signalReasons.join(" | "),
        scan_date: getDateStr(0),
        price_tier:
          sig.avgPrice < 1
            ? "Under $1"
            : sig.avgPrice < 5
              ? "$1-$5"
              : "$5-$10",
      });
    }
  }

  return enriched;
}

// ── STANDALONE EXECUTION ───────────────────────────────────────

if (process.argv.includes("--run-insider")) {
  // Exempel-tickers for standalone-test
  const testTickers = [
    "SNDL", "VXRT", "TNXP", "INO", "HUMA", "GEVO", "WKHS", "NKLA",
    "ACHR", "GRAB", "PLUG", "FCEL", "IOVA", "KULR", "NIO", "LCID",
    "RKLB", "SOUN", "SOFI", "HIMS", "MARA", "RIOT",
  ];

  runInsiderScan(testTickers)
    .then((result) => {
      console.log("\nJSON-resultat:");
      console.log(JSON.stringify(result.summary, null, 2));
      process.exit(0);
    })
    .catch((e) => {
      console.error("Insider scan error:", e);
      process.exit(1);
    });
}

module.exports = {
  runInsiderScan,
  enrichWithInsiderData,
  batchFetchInsiderData,
  scrapeOpenInsiderPurchases,
  scrapeOpenInsiderClusterBuys,
  fetchSECForm4Filings,
  analyzeInsiderSignals,
  CONFIG,
};
