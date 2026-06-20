/**
 * UNIVERSE SCANNER - Dynamisk scanning av HELA marknaden under $10
 *
 * Ersatter hardkodad watchlist med tre kompletterande datakallor:
 *
 * 1. Nasdaq Screener API (PRIMAR) - 2000-4000+ aktier, pris+volym+mcap
 *    Gratis, inget API-nyckel, returnerar alla NYSE/NASDAQ/AMEX-aktier
 *
 * 2. Yahoo Finance Screener API (SEKUNDAR) - Avancerade filter
 *    Gratis, kraver crumb/cookie, screener med POST body
 *
 * 3. Finviz HTML Screener (KOMPLEMENT) - Tekniska signaler
 *    Gratis, parsning av HTML-tabell, TA-filter
 *
 * Resultat: En deduplicerad lista pa 1500-4000 aktier under $10
 *           med pris, volym, market cap, forandring, sektor
 */

const fs = require("fs");
const path = require("path");

const CACHE_PATH = path.join(__dirname, "universe-cache.json");
const CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 timmar

// ============================================================
// METOD 1: NASDAQ SCREENER API (basta kallan)
// ============================================================
// Nasdaq.com:s frontend anropar detta API internt.
// Returnerar ALLA aktier pa NYSE, NASDAQ, AMEX med prisdata.
// Inget API-nyckel kravs. Limit=10000 ger allt.
// ============================================================

async function fetchNasdaqUniverse() {
  console.log("  [Universe] Nasdaq Screener API - hamtar hela marknaden...");

  const baseUrl = "https://api.nasdaq.com/api/screener/stocks";
  const params = new URLSearchParams({
    tableonly: "true",
    limit: "10000",      // Nasdaq returnerar max ~8000
    offset: "0",
    download: "true",    // Ger CSV-liknande komplett data
  });

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/market-activity/stocks/screener",
  };

  try {
    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`Nasdaq API HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    const rows = json?.data?.rows || json?.data?.table?.rows || [];

    if (rows.length === 0) {
      // Prova alternativt format - ibland returneras som "data.headers" + "data.rows"
      const tableData = json?.data;
      if (tableData && Array.isArray(tableData)) {
        return parseNasdaqRows(tableData);
      }
      console.log("  [Universe] Nasdaq: tom respons, provar CSV-format...");
      return await fetchNasdaqCSV();
    }

    const stocks = parseNasdaqRows(rows);
    console.log(`  [Universe] Nasdaq: ${stocks.length} aktier under $10 (av ${rows.length} totalt)`);
    return stocks;

  } catch (err) {
    console.log(`  [Universe] Nasdaq API error: ${err.message}`);
    // Fallback: prova CSV-download
    return await fetchNasdaqCSV();
  }
}

function parseNasdaqRows(rows) {
  const stocks = [];

  for (const row of rows) {
    try {
      // Nasdaq API-format: row kan vara objekt med nycklar
      const symbol = (row.symbol || row.Symbol || row.ticker || "").trim();
      const name = (row.name || row.Name || row.company || "").trim();

      // Pris kan vara string med $ eller ren siffra
      let priceStr = row.lastsale || row.lastSale || row.Last || row.price || "0";
      if (typeof priceStr === "string") priceStr = priceStr.replace(/[$,]/g, "");
      const price = parseFloat(priceStr);

      if (!symbol || isNaN(price) || price <= 0) continue;
      if (price > 10 || price < 0.10) continue;

      // Filtrera bort warrants, units, etc.
      if (symbol.length > 5) continue;
      if (/[^A-Z]/i.test(symbol)) continue;
      if (/warrant|right|unit|%|etf|fund|note|bond/i.test(name)) continue;

      // Volym
      let vol = row.volume || row.Volume || 0;
      if (typeof vol === "string") vol = parseInt(vol.replace(/,/g, ""), 10);
      vol = vol || 0;

      // Market cap
      let mcap = row.marketCap || row.MarketCap || row.market_cap || 0;
      if (typeof mcap === "string") {
        mcap = mcap.replace(/[$,]/g, "");
        if (mcap.endsWith("B")) mcap = parseFloat(mcap) * 1e9;
        else if (mcap.endsWith("M")) mcap = parseFloat(mcap) * 1e6;
        else if (mcap.endsWith("K")) mcap = parseFloat(mcap) * 1e3;
        else mcap = parseFloat(mcap) || 0;
      }

      // Prisforandring
      let changePct = row.pctchange || row.netchange_pct || row.change_pct || "0";
      if (typeof changePct === "string") changePct = parseFloat(changePct.replace(/[%,]/g, "")) || 0;

      // Sektor/industri
      const sector = row.sector || row.Sector || "";
      const industry = row.industry || row.Industry || "";
      const country = row.country || row.Country || "";

      // Uteslut icke-US bolag
      if (country && !/united states|usa|us/i.test(country) && country !== "") {
        // Lat inte vara for strikt - manga saknar country
      }

      stocks.push({
        ticker: symbol.toUpperCase(),
        name,
        price,
        changePct: typeof changePct === "number" ? changePct : 0,
        volume: vol,
        marketCap: typeof mcap === "number" ? mcap : 0,
        sector: sector || industry || "",
        source: "nasdaq",
      });
    } catch (e) {
      // Skip felaktiga rader
    }
  }

  return stocks;
}

// Fallback: Nasdaq CSV-download
async function fetchNasdaqCSV() {
  console.log("  [Universe] Provar Nasdaq CSV download...");
  try {
    const url = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&download=true";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Origin": "https://www.nasdaq.com",
        "Referer": "https://www.nasdaq.com/",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // CSV-format kan vara under data.rows eller data.headers+data.rows
    const rows = json?.data?.rows || [];
    const stocks = parseNasdaqRows(rows);
    console.log(`  [Universe] Nasdaq CSV: ${stocks.length} aktier under $10`);
    return stocks;
  } catch (err) {
    console.log(`  [Universe] Nasdaq CSV fallback error: ${err.message}`);
    return [];
  }
}


// ============================================================
// METOD 2: YAHOO FINANCE SCREENER (POST API)
// ============================================================
// Yahoo:s interna screener-endpoint accepterar POST med filter.
// Returnerar upp till 250 per request, med pagination.
// Kraver crumb + cookie for autentisering.
// ============================================================

async function fetchYahooUniverseScreener() {
  console.log("  [Universe] Yahoo Finance Screener API...");

  try {
    // Steg 1: Hamta cookie
    const cookieRes = await fetch("https://fc.yahoo.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "manual",
    });
    const setCookie = cookieRes.headers.get("set-cookie") || "";
    const cookie = setCookie.split(";")[0] || "";

    if (!cookie) {
      console.log("  [Universe] Yahoo: Ingen cookie, skippar");
      return [];
    }

    // Steg 2: Hamta crumb
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Cookie: cookie,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!crumbRes.ok) {
      console.log("  [Universe] Yahoo: Kunde inte hamta crumb");
      return [];
    }
    const crumb = await crumbRes.text();

    // Steg 3: Kor screener med POST - aktier $0.10-$10, US, sorterat pa volym
    const allStocks = [];
    const batchSize = 250;
    const maxResults = 2500; // Max 10 sidor

    for (let offset = 0; offset < maxResults; offset += batchSize) {
      try {
        const screenerBody = {
          offset,
          size: batchSize,
          sortField: "intradaymarketcap",
          sortType: "DESC",
          quoteType: "EQUITY",
          query: {
            operator: "AND",
            operands: [
              {
                operator: "OR",
                operands: [
                  { operator: "EQ", operands: ["exchange", "NMS"] },   // NASDAQ
                  { operator: "EQ", operands: ["exchange", "NYQ"] },   // NYSE
                  { operator: "EQ", operands: ["exchange", "ASE"] },   // AMEX
                  { operator: "EQ", operands: ["exchange", "NCM"] },   // NASDAQ Capital Market
                  { operator: "EQ", operands: ["exchange", "NGM"] },   // NASDAQ Global Market
                ],
              },
              { operator: "GT", operands: ["intradayprice", 0.10] },
              { operator: "LT", operands: ["intradayprice", 10.01] },
              { operator: "EQ", operands: ["region", "us"] },
            ],
          },
          userId: "",
          userIdType: "guid",
        };

        const screenerUrl = `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(crumb)}&lang=en-US&region=US&formatted=false&corsDomain=finance.yahoo.com`;

        const res = await fetch(screenerUrl, {
          method: "POST",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/json",
            Cookie: cookie,
          },
          body: JSON.stringify(screenerBody),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          console.log(`  [Universe] Yahoo screener HTTP ${res.status} vid offset ${offset}`);
          break;
        }

        const data = await res.json();
        const quotes = data?.finance?.result?.[0]?.quotes || [];
        const total = data?.finance?.result?.[0]?.total || 0;

        if (quotes.length === 0) break;

        for (const q of quotes) {
          const price = q.regularMarketPrice;
          if (!price || price < 0.10 || price > 10) continue;

          const sym = q.symbol;
          if (!sym || sym.includes(".") || sym.includes("-") || sym.length > 5) continue;
          if (/warrant|right|unit|%|etf|fund/i.test(q.shortName || "")) continue;

          allStocks.push({
            ticker: sym.toUpperCase(),
            name: q.shortName || q.longName || sym,
            price,
            changePct: q.regularMarketChangePercent || 0,
            volume: q.regularMarketVolume || 0,
            avgVolume: q.averageDailyVolume3Month || 0,
            marketCap: q.marketCap || 0,
            sector: "",
            fiftyTwoWeekLow: q.fiftyTwoWeekLow || 0,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || 0,
            source: "yahoo_screener",
          });
        }

        console.log(`  [Universe] Yahoo screener: offset ${offset}, got ${quotes.length} (total: ${total})`);

        // Om vi har alla
        if (offset + batchSize >= total) break;

        // Rate limit: 200ms paus
        await new Promise(r => setTimeout(r, 200));

      } catch (e) {
        console.log(`  [Universe] Yahoo screener error vid offset ${offset}: ${e.message}`);
        break;
      }
    }

    console.log(`  [Universe] Yahoo screener totalt: ${allStocks.length} aktier under $10`);
    return allStocks;

  } catch (err) {
    console.log(`  [Universe] Yahoo screener error: ${err.message}`);
    return [];
  }
}


// ============================================================
// METOD 3: FINVIZ HTML SCREENER (komplement for TA-signaler)
// ============================================================
// Finviz.com/screener.ashx returnerar HTML med tabeller.
// Gratis for grundlaggande filter. Parsning av HTML-tabell.
// Ger aktier med TA-signaler (breakouts, unusual volume, etc.)
// ============================================================

async function fetchFinvizScreener() {
  console.log("  [Universe] Finviz HTML screener...");
  const allStocks = [];

  // Finviz filter-parametrar (f=):
  // sh_price_u10 = Price Under $10
  // sh_price_o0.5 = Price Over $0.50
  // sh_avgvol_o200 = Avg Volume Over 200K
  // geo_usa = Country: USA
  // v=111 = Overview-tabell
  // r=1,21,41... = Pagination (20 per sida)
  const filters = "sh_price_u10,sh_avgvol_o200,geo_usa";

  for (let page = 1; page <= 40; page++) {  // Max 800 rader (20 per sida)
    const startRow = (page - 1) * 20 + 1;
    const url = `https://finviz.com/screener.ashx?v=111&f=${filters}&r=${startRow}`;

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.log(`  [Universe] Finviz HTTP ${res.status} vid sida ${page}`);
        break;
      }

      const html = await res.text();
      const stocks = parseFinvizHTML(html);

      if (stocks.length === 0) break; // Inga fler sidor

      allStocks.push(...stocks);

      // Paus for att inte bli blockerad
      await new Promise(r => setTimeout(r, 300));

    } catch (e) {
      console.log(`  [Universe] Finviz error sida ${page}: ${e.message}`);
      break;
    }
  }

  console.log(`  [Universe] Finviz: ${allStocks.length} aktier under $10`);
  return allStocks;
}

function parseFinvizHTML(html) {
  const stocks = [];

  // Finviz overview-tabell (v=111) har rader i <table class="screener_table">
  // Kolumner: No. | Ticker | Company | Sector | Industry | Country | Market Cap | P/E | Price | Change | Volume
  //
  // Regex-strategi: hitta rader med ticker-lankar i screener-tabellen
  // Formatet: <a href="quote.ashx?t=TICKER" class="screener-link-primary">TICKER</a>

  // Hitta alla ticker-lankar
  const tickerRegex = /<a[^>]*href="quote\.ashx\?t=([A-Z]+)"[^>]*class="screener-link-primary"[^>]*>\1<\/a>/g;
  let match;
  const tickers = [];

  while ((match = tickerRegex.exec(html)) !== null) {
    tickers.push(match[1]);
  }

  if (tickers.length === 0) {
    // Alternativt format - ibland ar det screener-link (inte -primary)
    const altRegex = /href="quote\.ashx\?t=([A-Z]{1,5})"/g;
    while ((match = altRegex.exec(html)) !== null) {
      if (!tickers.includes(match[1])) tickers.push(match[1]);
    }
  }

  // Mer robust: extrahera hela tabellrader
  // Finviz tabellrader har klassen "screener-body-table-nw"
  // Vi provar att extrahera data fran td-element
  const rowRegex = /<tr[^>]*>\s*<td[^>]*>\d+<\/td>\s*<td[^>]*><a[^>]*>([A-Z]{1,5})<\/a><\/td>\s*<td[^>]*><a[^>]*>([^<]*)<\/a><\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*><[^>]*>([^<]*)<\/[^>]*><\/td>\s*<td[^>]*><[^>]*>([^<]*)<\/[^>]*><\/td>\s*<td[^>]*><[^>]*>([^<]*)<\/[^>]*><\/td>/g;

  while ((match = rowRegex.exec(html)) !== null) {
    const [, ticker, company, sector, industry, country, mcapStr, peStr, priceStr, changeStr, volStr] = match;

    let price = parseFloat(priceStr);
    if (isNaN(price) || price < 0.10 || price > 10) continue;

    let volume = 0;
    if (volStr) {
      const v = volStr.replace(/,/g, "");
      volume = parseInt(v, 10) || 0;
    }

    let marketCap = 0;
    if (mcapStr) {
      const m = mcapStr.replace(/[$,]/g, "");
      if (m.endsWith("B")) marketCap = parseFloat(m) * 1e9;
      else if (m.endsWith("M")) marketCap = parseFloat(m) * 1e6;
      else if (m.endsWith("K")) marketCap = parseFloat(m) * 1e3;
    }

    let changePct = parseFloat((changeStr || "0").replace(/%/g, "")) || 0;

    stocks.push({
      ticker: ticker.toUpperCase(),
      name: company,
      price,
      changePct,
      volume,
      marketCap,
      sector: sector || industry || "",
      source: "finviz",
    });
  }

  // Fallback: om regex inte matchade, extrahera atminstone tickers
  if (stocks.length === 0 && tickers.length > 0) {
    for (const t of tickers) {
      stocks.push({
        ticker: t.toUpperCase(),
        name: t,
        price: 0, // Behover berikas
        changePct: 0,
        volume: 0,
        marketCap: 0,
        sector: "",
        source: "finviz_ticker_only",
      });
    }
  }

  return stocks;
}


// ============================================================
// HUVUD-FUNKTION: Hamta hela universumet
// ============================================================

async function fetchFullUniverse(options = {}) {
  const {
    useCache = true,
    maxPrice = 10.00,
    minPrice = 0.10,
    minVolume = 10000,  // $10K daglig dollar-volym minimum
  } = options;

  // Kolla cache forst
  if (useCache) {
    const cached = readCache();
    if (cached) {
      console.log(`  [Universe] Anvander cache (${cached.stocks.length} aktier, ${cached.age} min gammal)`);
      return cached.stocks;
    }
  }

  console.log("\n  [Universe] ============================================");
  console.log("  [Universe] DYNAMISK UNIVERSUMSSCANNING STARTAR");
  console.log(`  [Universe] Prisintervall: $${minPrice} - $${maxPrice}`);
  console.log("  [Universe] ============================================\n");

  // Kor alla kallor parallellt
  const [nasdaqStocks, yahooStocks, finvizStocks] = await Promise.allSettled([
    fetchNasdaqUniverse(),
    fetchYahooUniverseScreener(),
    fetchFinvizScreener(),
  ]);

  const nasdaq = nasdaqStocks.status === "fulfilled" ? nasdaqStocks.value : [];
  const yahoo = yahooStocks.status === "fulfilled" ? yahooStocks.value : [];
  const finviz = finvizStocks.status === "fulfilled" ? finvizStocks.value : [];

  console.log(`\n  [Universe] Radata: Nasdaq=${nasdaq.length}, Yahoo=${yahoo.length}, Finviz=${finviz.length}`);

  // Deduplicera - Nasdaq ar primar, Yahoo och Finviz kompletterar
  const tickerMap = new Map();

  // Nasdaq forst (mest palitlig prisdata)
  for (const s of nasdaq) {
    tickerMap.set(s.ticker, s);
  }

  // Yahoo kompletterar och overskriver med battre data (har avgVolume etc)
  for (const s of yahoo) {
    const existing = tickerMap.get(s.ticker);
    if (!existing) {
      tickerMap.set(s.ticker, s);
    } else {
      // Berika befintlig med Yahoo-data
      if (s.avgVolume) existing.avgVolume = s.avgVolume;
      if (s.fiftyTwoWeekLow) existing.fiftyTwoWeekLow = s.fiftyTwoWeekLow;
      if (s.fiftyTwoWeekHigh) existing.fiftyTwoWeekHigh = s.fiftyTwoWeekHigh;
      if (s.changePct && !existing.changePct) existing.changePct = s.changePct;
      if (s.marketCap && !existing.marketCap) existing.marketCap = s.marketCap;
      existing.source += "+yahoo";
    }
  }

  // Finviz - bara lagg till saknade
  for (const s of finviz) {
    if (!tickerMap.has(s.ticker) && s.price > 0) {
      tickerMap.set(s.ticker, s);
    }
  }

  // Kvalitetsfilter
  const universe = [];
  let filtered = 0;

  for (const [ticker, stock] of tickerMap) {
    // Prisfilter
    if (stock.price < minPrice || stock.price > maxPrice) { filtered++; continue; }

    // Dollar-volym filter ($10K minimum = handelsbar)
    const dollarVol = (stock.volume || 0) * stock.price;
    if (stock.volume > 0 && dollarVol < minVolume) { filtered++; continue; }

    // Namfilter - ta bort skrap
    if (stock.name && /warrant|right|unit|%|etf|etf|fund|note|bond|preferred|debenture/i.test(stock.name)) {
      filtered++;
      continue;
    }

    // Ticker-filter
    if (ticker.length > 5 || /[^A-Z]/.test(ticker)) { filtered++; continue; }

    universe.push(stock);
  }

  console.log(`  [Universe] Dedup: ${tickerMap.size} unika -> ${universe.length} efter filter (${filtered} borttagna)`);

  // Spara cache
  writeCache(universe);

  return universe;
}


// ============================================================
// CACHE-HANTERING
// ============================================================

function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    const cache = JSON.parse(raw);
    const ageMs = Date.now() - (cache.timestamp || 0);
    if (ageMs > CACHE_MAX_AGE_MS) return null;
    return {
      stocks: cache.stocks || [],
      age: Math.round(ageMs / 60000),
    };
  } catch (e) {
    return null;
  }
}

function writeCache(stocks) {
  try {
    const cache = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      count: stocks.length,
      stocks,
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf-8");
    console.log(`  [Universe] Cache sparad: ${stocks.length} aktier`);
  } catch (e) {
    console.log(`  [Universe] Cache-sparning misslyckades: ${e.message}`);
  }
}


// ============================================================
// UTILITY: Filtrera universumet med scanner-kriterier
// ============================================================

/**
 * Momentumfilter - hitta aktier med ovanlig aktivitet
 */
function filterMomentum(universe) {
  return universe.filter(s => {
    const relVol = (s.avgVolume && s.avgVolume > 0) ? s.volume / s.avgVolume : 0;
    const bigMove = Math.abs(s.changePct || 0) >= 5;
    const highVol = relVol >= 3;
    return bigMove || highVol;
  });
}

/**
 * Breakout-kandidater - nara 52v-high med volym
 */
function filterBreakout(universe) {
  return universe.filter(s => {
    if (!s.fiftyTwoWeekHigh || !s.price) return false;
    const nearHigh = s.price >= s.fiftyTwoWeekHigh * 0.95;
    const relVol = (s.avgVolume && s.avgVolume > 0) ? s.volume / s.avgVolume : 0;
    return nearHigh && relVol >= 2;
  });
}

/**
 * Value-kandidater - laga pris relativt market cap
 */
function filterValue(universe) {
  return universe.filter(s => {
    if (!s.marketCap) return false;
    return s.marketCap > 50e6 && s.price < 5;
  });
}

/**
 * Anomali-filter - hog volym utan stor prisforandring (ackumulering?)
 */
function filterAnomaly(universe) {
  return universe.filter(s => {
    const relVol = (s.avgVolume && s.avgVolume > 0) ? s.volume / s.avgVolume : 0;
    const smallMove = Math.abs(s.changePct || 0) < 3;
    return relVol >= 5 && smallMove;
  });
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  fetchFullUniverse,
  fetchNasdaqUniverse,
  fetchYahooUniverseScreener,
  fetchFinvizScreener,
  filterMomentum,
  filterBreakout,
  filterValue,
  filterAnomaly,
};
