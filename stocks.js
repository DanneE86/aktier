// ================================================================
// STOCKS.JS -- Aktieanalys med tekniska indikatorer
// Datakallor: Twelve Data (kurser/TA), Finnhub (nyheter), Alpha Vantage (fundamental)
// ================================================================

// ── API-nycklar ────────────────────────────────────────────────────
// Registrera gratis pa respektive tjanst for att aktivera live-data:
//   Twelve Data:   https://twelvedata.com/pricing  (gratis tier, 800 credits/dag)
//   Finnhub:       https://finnhub.io/register     (gratis tier, 60 req/min)
//   Alpha Vantage: https://www.alphavantage.co/support/#api-key (gratis, 25 req/dag)
//
// Byt ut "demo" mot din riktiga nyckel. Sa lange vardet ar "demo"
// visas aktielistan med hardkodad data men utan live-kurser.
const API_KEYS = {
  twelveData:   "demo",
  finnhub:      "demo",
  alphaVantage: "demo"
};

function hasApiKey(provider) {
  return API_KEYS[provider] && API_KEYS[provider] !== "demo" && API_KEYS[provider].length > 4;
}

// ── Konstanter ─────────────────────────────────────────────────────

const REFRESH_SECONDS = 300; // 5 min

// ── Hardkodade aktielistor ─────────────────────────────────────────

const SHORT_TERM_PICKS = [
  {
    name: "Norion Bank",
    ticker: "NORION:STO",
    tickerDisplay: "NORION",
    market: "SE",
    sector: "Finans",
    recommendation: "KOP",
    timeHorizon: "1-4 veckor",
    motivation: "Analytikerkonsensus Kop (2 av 2) med snittriktkurs 68 SEK fran ~51 SEK (+31% uppsida). " +
                "52v-range 42-74 SEK -- kursen handlas i nedre delen. Omvarderingspotential efter notering.",
    targetPrice: 68,
    stopLossPercent: 12,
    riskLevel: "HOG",
    riskScore: 4
  },
  {
    name: "NVIDIA",
    ticker: "NVDA",
    tickerDisplay: "NVDA",
    market: "US",
    sector: "Teknologi / AI",
    recommendation: "KOP",
    timeHorizon: "2-4 veckor",
    motivation: "Konsensus Strong Buy fran 38 analytiker. Genomsnittlig riktkurs $306 mot kurs $210 ger 45% uppsida. " +
                "AI-infrastrukturboom driver fortsatt tillvaxt. P/E 31 ar historiskt lagt for NVDA.",
    targetPrice: 306,
    stopLossPercent: 8,
    riskLevel: "MEDEL",
    riskScore: 3
  },
  {
    name: "Volvo B",
    ticker: "VOLV-B:STO",
    tickerDisplay: "VOLV B",
    market: "SE",
    sector: "Industri / Fordon",
    recommendation: "KOP",
    timeHorizon: "2-4 veckor",
    motivation: "SEB hojer riktkurs till 365 SEK (kop). Handelsbanken riktkurs 380 SEK. " +
                "Lastbilsmarknaden vantas i tvaarig uppgang. Justerat rorelseresultat +19,6% 2026.",
    targetPrice: 365,
    stopLossPercent: 7,
    riskLevel: "LAG",
    riskScore: 2
  },
  {
    name: "Ericsson B",
    ticker: "ERIC-B:STO",
    tickerDisplay: "ERIC B",
    market: "SE",
    sector: "Telekom / 5G",
    recommendation: "BEHALL",
    timeHorizon: "1-4 veckor",
    motivation: "Kursen har natt tidigare riktkurs 110 SEK. Nordea hojer till 123 SEK (kop), " +
                "Barclays 85 SEK. Analytikerkonsensus ~103 SEK. 5G-utbyggnad accelererar men uppsidan ar begransad fran nuvarande nivaer (~112 SEK).",
    targetPrice: 123,
    stopLossPercent: 8,
    riskLevel: "MEDEL",
    riskScore: 3
  },
  {
    name: "Saab B",
    ticker: "SAAB-B:STO",
    tickerDisplay: "SAAB B",
    market: "SE",
    sector: "Forsvar / Industri",
    recommendation: "KOP",
    timeHorizon: "2-4 veckor",
    motivation: "SEB hojer riktkurs till 700 SEK. Analytikerkonsensus 574-610 SEK fran ~540 SEK (6-13% uppsida). " +
                "Rekordkvartal Q1 2026: +23,6% organisk tillvaxt, rorelseresultat +32%. " +
                "Europeisk forsvarssatsning driver ordern.",
    targetPrice: 590,
    stopLossPercent: 8,
    riskLevel: "MEDEL",
    riskScore: 3
  },
  {
    name: "BrightSpring Health",
    ticker: "BTSG",
    tickerDisplay: "BTSG",
    market: "US",
    sector: "Halsa / Vard",
    recommendation: "KOP",
    timeHorizon: "1-4 veckor",
    motivation: "Zacks Rank #1 (Strong Buy). Forsaljning +17% 2026, justerat resultat +64% 2026. " +
                "Community-baserad halsovard i stark tillvaxtttrend. Momentum-favorit bland analytiker.",
    targetPrice: null,
    stopLossPercent: 10,
    riskLevel: "MEDEL",
    riskScore: 3
  },
  {
    name: "Archer Aviation",
    ticker: "ACHR",
    tickerDisplay: "ACHR",
    market: "US",
    sector: "Flyg / eVTOL",
    recommendation: "KOP",
    timeHorizon: "1-4 veckor",
    motivation: "Konsensus Strong Buy fran 9 analytiker. Snittriktkurs $10.61 mot kurs ~$5.57 ger ~90% uppsida. " +
                "Needham riktkurs $9, hogsta $18. eVTOL-flygbranschen i tidig kommersiell fas. " +
                "Aktien under $10 -- spekulativ men med stor potential om FAA-certifiering gar i las.",
    targetPrice: 10.61,
    stopLossPercent: 15,
    riskLevel: "MYCKET HOG",
    riskScore: 5
  },
  {
    name: "Spero Therapeutics",
    ticker: "SPRO",
    tickerDisplay: "SPRO",
    market: "US",
    sector: "Biotech / Pharma",
    recommendation: "KOP",
    timeHorizon: "1-4 veckor",
    motivation: "FDA godkande Utebzi (tebipenem) 18 juni -- forsta orala karbapenem nagonsin. " +
                "Partnerskap med GSK for kommersialisering. Cash till 2028. " +
                "Unik produkt utan direkt konkurrent i sin klass. Kommersiell lansering vantas H2 2026.",
    targetPrice: 5.00,
    stopLossPercent: 20,
    riskLevel: "HOG",
    riskScore: 4
  },
  {
    name: "Tuya Inc",
    ticker: "TUYA",
    tickerDisplay: "TUYA",
    market: "US",
    sector: "Teknologi / IoT",
    recommendation: "KOP",
    timeHorizon: "2-8 veckor",
    motivation: "Lonsamt Q1 2026 (nettovinst $15.8M). Vinsttillvaxt +117%/ar senaste 3 aren " +
                "medan aktien bara stigit 7%/ar -- stor diskrepans. Analytikerkonsensus Strong Buy, " +
                "snittriktkurs $3.42 mot kurs ~$2.01 ger ~70% uppsida. IoT-plattform med global rackvidd.",
    targetPrice: 3.42,
    stopLossPercent: 15,
    riskLevel: "HOG",
    riskScore: 4
  },
  {
    name: "Opendoor Technologies",
    ticker: "OPEN",
    tickerDisplay: "OPEN",
    market: "US",
    sector: "Teknologi / Fastighet",
    recommendation: "KOP",
    timeHorizon: "1-2 veckor",
    motivation: "Russell 3000-inkludering 26 juni driver passivt indexkop. Aktien studsade +9% pa nyheten. " +
                "Diskuteras aktivt pa WallStreetBets. VARNING: WSB-sentimentet borjar svalna -- " +
                "risk for 'sell the news' efter 26 juni. Kortsiktig trade, inte langsiktigt innehav.",
    targetPrice: 5.50,
    stopLossPercent: 12,
    riskLevel: "HOG",
    riskScore: 4
  },
  {
    name: "Grab Holdings",
    ticker: "GRAB",
    tickerDisplay: "GRAB",
    market: "US",
    sector: "Teknologi / Superapp",
    recommendation: "BEHALL",
    timeHorizon: "1-4 veckor",
    motivation: "27 Buy-ratings, 0 Sell. Snittriktkurs $5.97 mot kurs ~$3.54 ger ~69% uppsida. " +
                "Sydostasiens ledande superapp (ridesharing, mat, finans). Forsta helarsvinsten 2025 ($268M). " +
                "VARNING: VD och institutionella investerare SALJER -- Form 4-filings visar konsekvent " +
                "insiderforsaljning juni 2026. Insiderforsaljning ar en stark varningssignal. " +
                "Avvakta tills insiderforsaljningen avtar.",
    targetPrice: 5.97,
    stopLossPercent: 15,
    riskLevel: "HOG",
    riskScore: 4
  },
  {
    name: "Humacyte",
    ticker: "HUMA",
    tickerDisplay: "HUMA",
    market: "US",
    sector: "Biotech / Medicinsk",
    recommendation: "KOP",
    timeHorizon: "1-4 veckor",
    motivation: "HOGRISK -- aktie under $1. Konsensus Strong Buy fran 8 analytiker. Snittriktkurs $6.44 mot kurs ~$0.92. " +
                "FDA-godkand produkt Symvess med >70% godkannandegrad fran sjukhus. " +
                "Planerar kompletterande BLA-ansokan till FDA H2 2026 (katalysator). " +
                "Ny marknad i Saudiarabien och Israel. Benchmark hojer riktkurs till $2.",
    targetPrice: 2.0,
    stopLossPercent: 25,
    riskLevel: "MYCKET HOG",
    riskScore: 5
  }
];

const LONG_TERM_PICKS = [
  {
    name: "Investor B",
    ticker: "INVE-B:STO",
    tickerDisplay: "INVE B",
    market: "SE",
    sector: "Investmentbolag",
    recommendation: "KOP",
    timeHorizon: "3-5 ar",
    motivation: "Sveriges storsta investmentbolag med 515 000+ agare pa Avanza. " +
                "Diversifierad portfolj med Atlas Copco, ABB, SEB m.fl. " +
                "Historiskt stabil substansrabatt ger exponering mot kvalitetsbolag till rabatt. " +
                "Utdelning okar stabilt arligen.",
    targetPrice: null,
    stopLossPercent: null,
    riskLevel: "LAG",
    riskScore: 1,
    isDividendStock: false
  },
  {
    name: "Handelsbanken A",
    ticker: "SHB-A:STO",
    tickerDisplay: "SHB A",
    market: "SE",
    sector: "Bank / Finans",
    recommendation: "KOP",
    timeHorizon: "2-5 ar",
    motivation: "Prognostiserad direktavkastning over 10% (ordinarie + extra utdelning 14-17 SEK/aktie). " +
                "DNB Carnegie pekar ut SHB som sarskilt intressant bland storbankerna. " +
                "P/E-tal 10,2 -- lagt for sektorn. Pagar effektivisering av kontorsnat.",
    targetPrice: 140,
    stopLossPercent: null,
    riskLevel: "LAG",
    riskScore: 1,
    isDividendStock: true,
    dividendYield: "10-12%"
  },
  {
    name: "Atlas Copco A",
    ticker: "ATCO-A:STO",
    tickerDisplay: "ATCO A",
    market: "SE",
    sector: "Industri / Kompressorer",
    recommendation: "KOP",
    timeHorizon: "3-5 ar",
    motivation: "Handelsbanken upprepar kop med riktkurs 190 SEK (konsensus 194 SEK). " +
                "Ledande indikatorer signalerar tydlig uppgang under 2026 for Vacuum-segmentet. " +
                "Forvantad vinsttillvaxt ~10% arligen 2026-2027. Varldsledande position.",
    targetPrice: 194,
    stopLossPercent: null,
    riskLevel: "LAG",
    riskScore: 1,
    isDividendStock: false
  },
  {
    name: "Microsoft",
    ticker: "MSFT",
    tickerDisplay: "MSFT",
    market: "US",
    sector: "Teknologi / Moln / AI",
    recommendation: "KOP",
    timeHorizon: "3-5 ar",
    motivation: "Konsensus Strong Buy fran 55 analytiker (53 kop, 0 salj). " +
                "Genomsnittlig riktkurs $570 (kurs ~$412). Azure + AI Copilot driver molntillvaxt. " +
                "Dominerar foretagssegmentet. Stabil kassaflodesmaskin.",
    targetPrice: 570,
    stopLossPercent: null,
    riskLevel: "LAG",
    riskScore: 1,
    isDividendStock: false
  },
  {
    name: "Coca-Cola",
    ticker: "KO",
    tickerDisplay: "KO",
    market: "US",
    sector: "Konsumentvaror / Dryck",
    recommendation: "KOP",
    timeHorizon: "5+ ar",
    motivation: "Dividend King -- 64 ar i rad med hojd utdelning. Direktavkastning 2,7% (vs S&P 500: 1,1%). " +
                "Senaste hojning feb 2026: +4% till $0,53/aktie. " +
                "Overpresterande vs Magnificent Seven 2026. Ultimat defensiv kvalitetsaktie.",
    targetPrice: null,
    stopLossPercent: null,
    riskLevel: "MYCKET LAG",
    riskScore: 0,
    isDividendStock: true,
    dividendYield: "2.7%"
  },
  {
    name: "Johnson & Johnson",
    ticker: "JNJ",
    tickerDisplay: "JNJ",
    market: "US",
    sector: "Hälsovård / Pharma",
    recommendation: "KOP",
    timeHorizon: "5+ ar",
    motivation: "Dividend King -- 64 ar i rad med hojd utdelning. Senaste hojning april 2026: +3,1% till $1,34/kvartal. " +
                "Direktavkastning 2,2%. Diversifierad halsovardsjatte med stabil intjaning. " +
                "Defensiv kvalitetsaktie for all-weather-portfolj.",
    targetPrice: null,
    stopLossPercent: null,
    riskLevel: "MYCKET LAG",
    riskScore: 0,
    isDividendStock: true,
    dividendYield: "2.2%"
  },
  {
    name: "Apple",
    ticker: "AAPL",
    tickerDisplay: "AAPL",
    market: "US",
    sector: "Teknologi / Konsumentelektronik",
    recommendation: "KOP",
    timeHorizon: "3-5 ar",
    motivation: "Konsensus Buy fran 48 analytiker. Genomsnittlig riktkurs $313. " +
                "Citi hojer riktkurs till $315 fran $245. Tjenstesegmentet vaxer snabbt (Services revenue). " +
                "Ekosystem-las ger exceptionell kundlojalitet och marginaler.",
    targetPrice: 313,
    stopLossPercent: null,
    riskLevel: "LAG",
    riskScore: 1,
    isDividendStock: false
  }
];

// ── Scanner backend URL ───────────────────────────────────────────

const SCANNER_API = "http://localhost:3000/api";

// ── Applikationstillstand ──────────────────────────────────────────

let currentHorizon = "short";
let currentMarket  = "all";
let currentSort    = "signal";
const priceCache   = {};
const taCache      = {};
let scannerHits    = [];
let scannerTier    = "all";
let scannerType    = "all";
let rocketData     = null;
let yesterdayRocketData = null;
let rocketHistory  = [];
let tabRequestId   = 0;

// ── Rate limiter (Twelve Data: max 8 req/min) ─────────────────────

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }
  async waitForSlot() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.timestamps[0]) + 100;
      await new Promise((resolve) => { setTimeout(resolve, waitTime); });
    }
    this.timestamps.push(Date.now());
  }
}

const twelveDataLimiter = new RateLimiter(8, 60000);

// ── Cache med TTL ─────────────────────────────────────────────────

const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCached(key) {
  const entry = apiCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  apiCache.set(key, { data: data, ts: Date.now() });
}

function pruneCache() {
  var now = Date.now();
  for (var entry of apiCache) {
    if (now - entry[1].ts > CACHE_TTL) apiCache.delete(entry[0]);
  }
}

// ── Visuell felhantering ──────────────────────────────────────────

function showErrorToast(message) {
  var existing = document.getElementById("error-toast");
  if (existing) existing.remove();

  var toast = document.createElement("div");
  toast.id = "error-toast";
  toast.setAttribute("role", "alert");
  toast.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:9999;padding:12px 20px;" +
    "border-radius:10px;background:rgba(231,76,60,0.95);color:#fff;font-size:0.88rem;" +
    "font-weight:600;max-width:380px;box-shadow:0 4px 20px rgba(0,0,0,0.4);" +
    "animation:fadeInUp 0.3s ease;cursor:pointer";
  toast.textContent = message;
  toast.addEventListener("click", function() { toast.remove(); });
  document.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 8000);
}

// ── Formateringsfunktioner ────────────────────────────────────────

function fmtPrice(n, market) {
  if (n == null || isNaN(n)) return "--";
  if (market === "SE") {
    return n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
  }
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return "--";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtLarge(n) {
  if (n == null || isNaN(n)) return "--";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(1) + "Md";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(1) + "Mn";
  return "$" + n.toLocaleString("en-US");
}

// ── API-funktioner (Twelve Data) ──────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("API-fel (" + res.status + ") vid hamtning av " + url);
  return res.json();
}

async function fetchTwelveDataQuote(ticker) {
  const cacheKey = "quote:" + ticker;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await twelveDataLimiter.waitForSlot();
  const url = "https://api.twelvedata.com/quote?symbol=" + encodeURIComponent(ticker) +
              "&apikey=" + API_KEYS.twelveData;
  const data = await fetchJson(url);
  if (data.code) throw new Error(data.message || "Twelve Data API-fel");
  if (!data.close && !data.symbol) throw new Error("Ingen kursdata returnerad");
  setCache(cacheKey, data);
  return data;
}

async function fetchTwelveDataTimeSeries(ticker, outputsize = 120) {
  const cacheKey = "ts:" + ticker + ":" + outputsize;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await twelveDataLimiter.waitForSlot();
  const url = "https://api.twelvedata.com/time_series?symbol=" + encodeURIComponent(ticker) +
              "&interval=1day&outputsize=" + outputsize + "&apikey=" + API_KEYS.twelveData;
  const data = await fetchJson(url);
  if (data.code) throw new Error(data.message || "Twelve Data API-fel");
  if (!data.values || !Array.isArray(data.values)) throw new Error("Ingen tidsseriedata returnerad");
  setCache(cacheKey, data);
  return data;
}

async function fetchTwelveDataRSI(ticker) {
  const cacheKey = "rsi:" + ticker;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await twelveDataLimiter.waitForSlot();
  const url = "https://api.twelvedata.com/rsi?symbol=" + encodeURIComponent(ticker) +
              "&interval=1day&time_period=14&apikey=" + API_KEYS.twelveData;
  const data = await fetchJson(url);
  if (data.code) throw new Error(data.message || "Twelve Data API-fel");
  if (!data.values || !data.values[0]) throw new Error("Inget RSI-data returnerat");
  const val = parseFloat(data.values[0].rsi);
  if (isNaN(val)) throw new Error("Ogiltigt RSI-varde");
  setCache(cacheKey, val);
  return val;
}

async function fetchTwelveDataMACD(ticker) {
  const cacheKey = "macd:" + ticker;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await twelveDataLimiter.waitForSlot();
  const url = "https://api.twelvedata.com/macd?symbol=" + encodeURIComponent(ticker) +
              "&interval=1day&apikey=" + API_KEYS.twelveData;
  const data = await fetchJson(url);
  if (data.code) throw new Error(data.message || "Twelve Data API-fel");
  if (!data.values || !data.values[0]) throw new Error("Inget MACD-data returnerat");
  const result = {
    macd: parseFloat(data.values[0].macd),
    signal: parseFloat(data.values[0].macd_signal),
    histogram: parseFloat(data.values[0].macd_hist)
  };
  if (isNaN(result.macd) || isNaN(result.signal) || isNaN(result.histogram)) {
    throw new Error("Ogiltiga MACD-varden");
  }
  setCache(cacheKey, result);
  return result;
}

async function fetchTwelveDataSMA(ticker, timePeriod) {
  const cacheKey = "sma:" + ticker + ":" + timePeriod;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await twelveDataLimiter.waitForSlot();
  const url = "https://api.twelvedata.com/sma?symbol=" + encodeURIComponent(ticker) +
              "&interval=1day&time_period=" + timePeriod + "&apikey=" + API_KEYS.twelveData;
  const data = await fetchJson(url);
  if (data.code) throw new Error(data.message || "Twelve Data API-fel");
  if (!data.values || !data.values[0]) throw new Error("Inget SMA-data returnerat");
  const val = parseFloat(data.values[0].sma);
  if (isNaN(val)) throw new Error("Ogiltigt SMA-varde");
  setCache(cacheKey, val);
  return val;
}

async function fetchTwelveDataEMA(ticker, timePeriod) {
  const cacheKey = "ema:" + ticker + ":" + timePeriod;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await twelveDataLimiter.waitForSlot();
  const url = "https://api.twelvedata.com/ema?symbol=" + encodeURIComponent(ticker) +
              "&interval=1day&time_period=" + timePeriod + "&apikey=" + API_KEYS.twelveData;
  const data = await fetchJson(url);
  if (data.code) throw new Error(data.message || "Twelve Data API-fel");
  if (!data.values || !data.values[0]) throw new Error("Inget EMA-data returnerat");
  const val = parseFloat(data.values[0].ema);
  if (isNaN(val)) throw new Error("Ogiltigt EMA-varde");
  setCache(cacheKey, val);
  return val;
}

// ── API-funktioner (Finnhub -- nyheter, bara US) ──────────────────

async function fetchFinnhubNews(ticker) {
  if (!hasApiKey("finnhub")) return [];
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const url = "https://finnhub.io/api/v1/company-news?symbol=" + encodeURIComponent(ticker) +
              "&from=" + weekAgo + "&to=" + today + "&token=" + API_KEYS.finnhub;
  try {
    return await fetchJson(url);
  } catch (e) {
    console.warn("Finnhub-fel for " + ticker + ":", e.message);
    return [];
  }
}

// ── Yahoo Finance (gratis, ingen API-nyckel) ────────────────────

const YAHOO_CORS_PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?url="
];

const yahooQuoteCache = {};

function toYahooTicker(twelveDataTicker) {
  if (twelveDataTicker.endsWith(":STO")) {
    return twelveDataTicker.replace(":STO", ".ST");
  }
  return twelveDataTicker;
}

async function fetchYahooQuote(ticker) {
  const yahooTicker = toYahooTicker(ticker);
  const yahooUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(yahooTicker) +
    "?interval=1d&range=5d&includePrePost=false";

  for (let i = 0; i < YAHOO_CORS_PROXIES.length; i++) {
    const proxyUrl = YAHOO_CORS_PROXIES[i] + encodeURIComponent(yahooUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }

      const data = await res.json();
      const result = data && data.chart && data.chart.result && data.chart.result[0];
      if (!result || !result.meta) {
        throw new Error("Ingen data i svaret");
      }

      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const previousClose = meta.previousClose || meta.chartPreviousClose;
      const currency = meta.currency || (ticker.endsWith(":STO") ? "SEK" : "USD");

      if (price == null || isNaN(price)) {
        throw new Error("Ogiltigt pris");
      }

      const change = previousClose ? price - previousClose : 0;
      const changePercent = previousClose ? (change / previousClose) * 100 : 0;

      return {
        price: price,
        previousClose: previousClose || null,
        change: change,
        changePercent: changePercent,
        currency: currency
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn("Yahoo Finance proxy " + (i + 1) + " misslyckades for " + yahooTicker + ":", err.message);
      if (i === YAHOO_CORS_PROXIES.length - 1) {
        return null;
      }
    }
  }
  return null;
}

async function loadAllQuotes() {
  const allStocks = SHORT_TERM_PICKS.concat(LONG_TERM_PICKS);
  let loaded = 0;
  let failed = 0;

  updateApiStatus("yahoo-loading");

  for (let i = 0; i < allStocks.length; i++) {
    const stock = allStocks[i];

    // Visa laddningsindikator pa kortet
    const safeTicker = stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
    const priceEl = document.getElementById("card-price-" + safeTicker);
    if (priceEl && priceEl.textContent === "--") {
      priceEl.textContent = "Laddar...";
      priceEl.className = "stock-card-price loading-pulse";
    }

    try {
      const quote = await fetchYahooQuote(stock.ticker);
      if (quote) {
        yahooQuoteCache[stock.ticker] = quote;

        // Uppdatera priceCache med kompatibelt format for detaljvyn
        priceCache[stock.ticker] = {
          close: String(quote.price),
          percent_change: String(quote.changePercent)
        };

        updateStockCardPriceYahoo(stock.ticker, quote, stock.market);
        loaded++;
      } else {
        // Visa att pris ej kunde hamtas
        const priceElFail = document.getElementById("card-price-" + safeTicker);
        if (priceElFail) {
          priceElFail.textContent = "Kurs ej tillganglig";
          priceElFail.className = "stock-card-price";
        }
        failed++;
      }
    } catch (err) {
      console.warn("Fel vid hamtning av " + stock.ticker + ":", err.message);
      const priceElErr = document.getElementById("card-price-" + safeTicker);
      if (priceElErr) {
        priceElErr.textContent = "Kurs ej tillganglig";
        priceElErr.className = "stock-card-price";
      }
      failed++;
    }

    // Liten delay mellan anrop for att inte overbelasta proxyn
    if (i < allStocks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (loaded > 0) {
    updateApiStatus("yahoo-ok");
  } else if (failed > 0 && loaded === 0) {
    updateApiStatus("yahoo-error");
    showErrorToast("Kunde inte hämta kurser. Kontrollera din internetanslutning eller försök igen om en stund.");
  }
}

function updateStockCardPriceYahoo(ticker, quote, market) {
  const safeTicker = ticker.replace(/[^a-zA-Z0-9]/g, "_");
  const priceEl = document.getElementById("card-price-" + safeTicker);
  const changeEl = document.getElementById("card-change-" + safeTicker);

  if (!priceEl || !quote) return;

  const price = quote.price;
  const currency = quote.currency;

  // Formatera pris med valuta
  if (currency === "SEK") {
    priceEl.textContent = price.toLocaleString("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " kr";
  } else {
    priceEl.textContent = "$" + price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  priceEl.className = "stock-card-price";

  if (changeEl) {
    const pctChange = quote.changePercent;
    const absChange = quote.change;
    let changeText = "";

    if (currency === "SEK") {
      changeText = (absChange >= 0 ? "+" : "") +
        absChange.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
        " kr (" + fmtPct(pctChange) + ")";
    } else {
      changeText = (absChange >= 0 ? "+" : "") +
        "$" + Math.abs(absChange).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
        " (" + fmtPct(pctChange) + ")";
    }

    changeEl.textContent = changeText;
    changeEl.className = "stock-card-change " + (pctChange >= 0 ? "up" : "down");
  }
}

// ── API-funktioner (Alpha Vantage -- fundamental, fallback) ───────

async function fetchAlphaVantageOverview(ticker) {
  if (!hasApiKey("alphaVantage")) return null;
  const url = "https://www.alphavantage.co/query?function=OVERVIEW&symbol=" + encodeURIComponent(ticker) +
              "&apikey=" + API_KEYS.alphaVantage;
  try {
    return await fetchJson(url);
  } catch (e) {
    console.warn("Alpha Vantage-fel for " + ticker + ":", e.message);
    return null;
  }
}

// ── TA-berakningar ────────────────────────────────────────────────

function generateTASignal(rsi, macd, sma20, sma50, currentPrice) {
  let bullCount = 0;
  let bearCount = 0;
  const signals = [];

  // RSI
  if (rsi < 30) {
    bullCount += 2;
    signals.push({ indicator: "RSI", value: rsi.toFixed(1), signal: "KOP", reason: "Oversald (< 30)" });
  } else if (rsi < 40) {
    bullCount += 1;
    signals.push({ indicator: "RSI", value: rsi.toFixed(1), signal: "KOP", reason: "Nar oversald-zon" });
  } else if (rsi > 70) {
    bearCount += 2;
    signals.push({ indicator: "RSI", value: rsi.toFixed(1), signal: "SALJ", reason: "Overkopt (> 70)" });
  } else if (rsi > 60) {
    bearCount += 1;
    signals.push({ indicator: "RSI", value: rsi.toFixed(1), signal: "SALJ", reason: "Nar overkopt-zon" });
  } else {
    signals.push({ indicator: "RSI", value: rsi.toFixed(1), signal: "NEUTRAL", reason: "Neutral zon" });
  }

  // MACD
  if (macd.histogram > 0 && macd.macd > macd.signal) {
    bullCount += 1;
    signals.push({ indicator: "MACD", value: macd.macd.toFixed(2), signal: "KOP", reason: "MACD over signallinje" });
  } else if (macd.histogram < 0 && macd.macd < macd.signal) {
    bearCount += 1;
    signals.push({ indicator: "MACD", value: macd.macd.toFixed(2), signal: "SALJ", reason: "MACD under signallinje" });
  } else {
    signals.push({ indicator: "MACD", value: macd.macd.toFixed(2), signal: "NEUTRAL", reason: "Korsning nara" });
  }

  // SMA 20 vs pris
  if (currentPrice > sma20) {
    bullCount += 1;
    signals.push({ indicator: "SMA20", value: sma20.toFixed(2), signal: "KOP", reason: "Pris over SMA20" });
  } else {
    bearCount += 1;
    signals.push({ indicator: "SMA20", value: sma20.toFixed(2), signal: "SALJ", reason: "Pris under SMA20" });
  }

  // SMA 50 vs pris
  if (currentPrice > sma50) {
    bullCount += 1;
    signals.push({ indicator: "SMA50", value: sma50.toFixed(2), signal: "KOP", reason: "Pris over SMA50 (upptrend)" });
  } else {
    bearCount += 1;
    signals.push({ indicator: "SMA50", value: sma50.toFixed(2), signal: "SALJ", reason: "Pris under SMA50 (nedtrend)" });
  }

  // Golden/Death Cross
  if (sma20 > sma50) {
    bullCount += 1;
    signals.push({ indicator: "MA-kors", value: "", signal: "KOP", reason: "SMA20 > SMA50 (Golden Cross-tendenser)" });
  } else {
    bearCount += 1;
    signals.push({ indicator: "MA-kors", value: "", signal: "SALJ", reason: "SMA20 < SMA50 (Death Cross-tendenser)" });
  }

  // Sammanvagd signal
  const net = bullCount - bearCount;
  let overallSignal;
  if (net >= 3) overallSignal = "STARK KOP";
  else if (net >= 1) overallSignal = "KOP";
  else if (net <= -3) overallSignal = "STARK SALJ";
  else if (net <= -1) overallSignal = "SALJ";
  else overallSignal = "BEHALL";

  return { overallSignal: overallSignal, bullCount: bullCount, bearCount: bearCount, signals: signals };
}

function calculateSupportResistance(priceData) {
  const closes = priceData.map((d) => parseFloat(d.close));
  const highs = priceData.map((d) => parseFloat(d.high));
  const lows = priceData.map((d) => parseFloat(d.low));
  const current = closes[0];

  const pivotHighs = [];
  const pivotLows = [];

  for (let i = 2; i < closes.length - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] &&
        highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      pivotHighs.push(highs[i]);
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] &&
        lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      pivotLows.push(lows[i]);
    }
  }

  const resistance = pivotHighs
    .filter((p) => p > current)
    .sort((a, b) => a - b)
    .slice(0, 3);

  const support = pivotLows
    .filter((p) => p < current)
    .sort((a, b) => b - a)
    .slice(0, 3);

  return { resistance: resistance, support: support };
}

// ── DOM-hjalpar ───────────────────────────────────────────────────

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent != null) node.textContent = textContent;
  return node;
}

function clearChildren(parent) {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
}

// ── Filtrering & sortering ───────────────────────────────────────

function getActivePicks() {
  return currentHorizon === "short" ? SHORT_TERM_PICKS : LONG_TERM_PICKS;
}

function getFilteredStocks() {
  let picks = getActivePicks();

  // Marknad-filter
  if (currentMarket !== "all") {
    picks = picks.filter((s) => s.market === currentMarket);
  }

  // Sortering
  picks = picks.slice(); // kopia
  switch (currentSort) {
    case "signal": {
      const signalOrder = { "KOP": 0, "BEHALL": 1, "SALJ": 2 };
      picks.sort((a, b) => (signalOrder[a.recommendation] || 1) - (signalOrder[b.recommendation] || 1));
      break;
    }
    case "risk":
      picks.sort((a, b) => a.riskScore - b.riskScore);
      break;
    case "sector":
      picks.sort((a, b) => a.sector.localeCompare(b.sector, "sv"));
      break;
    case "name":
      picks.sort((a, b) => a.name.localeCompare(b.name, "sv"));
      break;
  }

  return picks;
}

// ── Risk-dots rendering ──────────────────────────────────────────

function createRiskDots(score) {
  var container = el("span", "risk-dots");
  container.setAttribute("aria-label", "Risknivå " + score + " av 5");
  if (score === 0) {
    var shield = el("span", "risk-shield");
    shield.textContent = "✓";
    shield.title = "Mycket låg risk";
    container.appendChild(shield);
    return container;
  }
  for (var i = 1; i <= 5; i++) {
    var dot = el("span", "risk-dot");
    if (i <= score) {
      if (score <= 2) dot.className += " risk-dot-filled-low";
      else if (score <= 3) dot.className += " risk-dot-filled-medium";
      else dot.className += " risk-dot-filled";
    }
    container.appendChild(dot);
  }
  return container;
}

// ── Aktiekort rendering ──────────────────────────────────────────

function renderStockCard(stock) {
  const signalClass = stock.recommendation === "KOP" ? "stock-card-buy" :
                      stock.recommendation === "SALJ" ? "stock-card-sell" : "stock-card-hold";

  const card = el("div", "stock-card card " + signalClass);
  card.dataset.ticker = stock.ticker;
  card.dataset.market = stock.market;

  // -- Rad 1: Header
  const header = el("div", "stock-card-header");

  const info = el("div", "stock-card-info");
  info.appendChild(el("span", "stock-card-name", stock.name));
  info.appendChild(el("span", "stock-card-ticker", stock.tickerDisplay));

  const marketBadge = el("span",
    "stock-card-market-badge " + (stock.market === "SE" ? "stock-market-se" : "stock-market-us"),
    stock.market);
  info.appendChild(marketBadge);
  header.appendChild(info);

  const priceCol = el("div", "stock-card-price-col");
  const priceSpan = el("span", "stock-card-price", "--");
  priceSpan.id = "card-price-" + stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
  priceCol.appendChild(priceSpan);

  const changeSpan = el("span", "stock-card-change", "");
  changeSpan.id = "card-change-" + stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
  priceCol.appendChild(changeSpan);
  header.appendChild(priceCol);

  card.appendChild(header);

  // -- Rad 2: Signal + metadata
  const signalRow = el("div", "stock-card-signal-row");

  const badgeClass = stock.recommendation === "KOP" ? "signal-buy" :
                     stock.recommendation === "SALJ" ? "signal-sell" : "signal-hold";
  const badge = el("span", "signal-badge " + badgeClass, stock.recommendation);
  badge.style.padding = "5px 14px";
  badge.style.fontSize = "0.85rem";
  signalRow.appendChild(badge);

  signalRow.appendChild(el("span", "stock-card-sector", stock.sector));
  signalRow.appendChild(el("span", "stock-card-horizon", stock.timeHorizon));

  // Risk badge
  const riskClass = stock.riskScore <= 2 ? "risk-low" :
                    stock.riskScore <= 3 ? "risk-medium" : "risk-high";
  const riskBadge = el("span", "stock-card-risk " + riskClass, stock.riskLevel);
  signalRow.appendChild(riskBadge);
  signalRow.appendChild(createRiskDots(stock.riskScore));

  card.appendChild(signalRow);

  // -- Rad 3: Motivering (trunkerad)
  const motivP = el("p", "stock-card-motivation", stock.motivation);
  card.appendChild(motivP);

  const showMoreBtn = el("button", "stock-card-show-more", "Visa mer");
  showMoreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (motivP.classList.contains("expanded")) {
      motivP.classList.remove("expanded");
      showMoreBtn.textContent = "Visa mer";
    } else {
      motivP.classList.add("expanded");
      showMoreBtn.textContent = "Visa mindre";
    }
  });
  card.appendChild(showMoreBtn);

  // -- Rad 4: Mini-indikatorer
  const indicators = el("div", "stock-card-indicators");

  // RSI
  const rsiInd = el("div", "stock-mini-indicator");
  rsiInd.appendChild(el("span", "label", "RSI"));
  const rsiVal = el("span", "stock-mini-value", "--");
  rsiVal.id = "mini-rsi-" + stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
  rsiInd.appendChild(rsiVal);
  indicators.appendChild(rsiInd);

  // Riktkurs
  if (stock.targetPrice != null) {
    const targetInd = el("div", "stock-mini-indicator");
    targetInd.appendChild(el("span", "label", "Riktkurs"));
    targetInd.appendChild(el("span", "stock-mini-value", fmtPrice(stock.targetPrice, stock.market)));
    indicators.appendChild(targetInd);
  }

  // Stop-Loss
  if (stock.stopLossPercent != null) {
    const slInd = el("div", "stock-mini-indicator");
    slInd.appendChild(el("span", "label", "Stop-Loss"));
    slInd.appendChild(el("span", "stock-mini-value", "-" + stock.stopLossPercent + "%"));
    indicators.appendChild(slInd);
  }

  card.appendChild(indicators);

  // -- Rad 5: Utdelning (om applicerbart)
  if (stock.isDividendStock && stock.dividendYield) {
    const divRow = el("div", "stock-card-dividend");
    divRow.appendChild(el("span", "stock-dividend-badge", "Utdelning"));
    divRow.appendChild(el("span", "label", "Direktavkastning"));
    divRow.appendChild(el("span", "stock-dividend-value", stock.dividendYield));
    card.appendChild(divRow);
  }

  // -- CTA
  const detailBtn = el("button", "stock-card-detail-btn", "Visa detaljerad analys");
  detailBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDetailView(stock);
  });
  card.appendChild(detailBtn);

  // Klick pa hela kortet oppnar detaljer
  card.addEventListener("click", () => {
    openDetailView(stock);
  });

  return card;
}

function renderStockList() {
  const section = document.getElementById("stock-list-section");
  clearChildren(section);

  // Rocket mode
  if (currentHorizon === "rockets") {
    renderRocketList(section);
    return;
  }

  // Scanner mode
  if (currentHorizon === "scanner") {
    renderScannerList(section);
    return;
  }

  const stocks = getFilteredStocks();

  if (stocks.length === 0) {
    const emptyMsg = el("div", "card");
    emptyMsg.appendChild(el("p", "stock-card-sector", "Inga aktier matchar dina filter."));
    section.appendChild(emptyMsg);
    return;
  }

  // Info-ruta om API-nyckel saknas
  if (!hasApiKey("twelveData")) {
    const infoBox = el("div", "no-api-info");
    infoBox.appendChild(el("span", null, "Live-kurser hamtas via Yahoo Finance (ingen API-nyckel kravs). For teknisk analys (RSI, MACD, SMA), registrera en gratis nyckel pa twelvedata.com och uppdatera API_KEYS i stocks.js."));
    section.appendChild(infoBox);
  }

  stocks.forEach((stock) => {
    section.appendChild(renderStockCard(stock));
  });
}

// ── Scanner rendering ───────────────────────────────────────────

async function fetchScannerHits() {
  try {
    var url = SCANNER_API + "/scanner/today?limit=100";
    if (scannerTier !== "all") url += "&tier=" + scannerTier;
    if (scannerType !== "all") url += "&type=" + scannerType;
    var res = await fetchWithTimeout(url, null, 5000);
    if (!res.ok) throw new Error("Scanner API offline");
    var data = await res.json();
    scannerHits = data.hits || [];
    return data;
  } catch (e) {
    console.warn("Scanner API error:", e.message);
    scannerHits = [];
    return null;
  }
}

async function fetchScannerStats() {
  try {
    var res = await fetchWithTimeout(SCANNER_API + "/scanner/stats", null, 5000);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

async function triggerScan() {
  var btn = document.getElementById("scanner-run-btn");
  if (btn) { btn.textContent = "Scannar..."; btn.disabled = true; }
  try {
    var res = await fetchWithTimeout(SCANNER_API + "/scanner/run", { method: "POST" }, 30000);
    if (!res.ok) throw new Error("Scan failed");
    await fetchScannerHits();
    renderStockList();
    updateScannerStatus();
  } catch (e) {
    console.warn("Scan trigger error:", e.message);
    showErrorToast("Scanning misslyckades. Är backend-servern igång?");
  } finally {
    if (btn) { btn.textContent = "Kör scan nu"; btn.disabled = false; }
  }
}

async function updateScannerStatus() {
  const stats = await fetchScannerStats();
  const badge = document.getElementById("scanner-status-badge");
  const hitCount = document.getElementById("scanner-hit-count");
  const scannedCount = document.getElementById("scanner-scanned-count");

  if (stats && stats.lastScan) {
    badge.textContent = "Aktiv";
    badge.className = "src-badge src-positive";
    hitCount.textContent = String(stats.todayHits);
    scannedCount.textContent = String(stats.lastScan.stocks_scanned || 0);
  } else {
    badge.textContent = "Backend offline - starta med: cd server && npm start";
    badge.className = "src-badge src-negative";
    hitCount.textContent = "--";
    scannedCount.textContent = "--";
  }
}

function renderScannerList(section) {
  if (scannerHits.length === 0) {
    const emptyCard = el("div", "card");
    emptyCard.style.textAlign = "center";
    emptyCard.style.padding = "32px";
    const title = el("h3", "ta-subtitle", "Inga scanner-traffar an");
    const desc = el("p", "stock-card-sector");
    desc.textContent = "Starta backend-servern (cd server && npm start) och tryck 'Kor scan nu' for att scanna marknaden.";
    emptyCard.appendChild(title);
    emptyCard.appendChild(desc);
    section.appendChild(emptyCard);
    return;
  }

  // Filter by market if set
  let filtered = scannerHits;
  if (currentMarket !== "all") {
    filtered = filtered.filter((h) =>
      currentMarket === "US" ? !h.exchange.includes("STO") : h.exchange.includes("STO")
    );
  }

  // Sort
  switch (currentSort) {
    case "signal":
      filtered.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
      break;
    case "risk":
      filtered.sort((a, b) => (a.risk_score || 3) - (b.risk_score || 3));
      break;
    case "name":
      filtered.sort((a, b) => (a.name || a.ticker).localeCompare(b.name || b.ticker));
      break;
    default:
      filtered.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));
  }

  filtered.forEach((hit) => {
    section.appendChild(renderScannerCard(hit));
  });
}

function renderScannerCard(hit) {
  const riskScore = hit.risk_score || 3;
  const borderClass = riskScore <= 2 ? "stock-card-buy" : riskScore <= 3 ? "stock-card-hold" : "stock-card-sell";
  const card = el("div", "stock-card card " + borderClass);

  // Header
  const header = el("div", "stock-card-header");
  const info = el("div", "stock-card-info");
  info.appendChild(el("span", "stock-card-name", hit.name || hit.ticker));
  info.appendChild(el("span", "stock-card-ticker", hit.ticker));

  // Scanner type badge
  const typeBadge = el("span", "stock-card-market-badge stock-market-us");
  typeBadge.textContent = hit.scanner_type === "momentum" ? "MOMENTUM" : hit.scanner_type === "catalyst" ? "CATALYST" : hit.scanner_type.toUpperCase();
  typeBadge.style.background = hit.scanner_type === "momentum" ? "rgba(109,213,237,0.12)" : "rgba(244,211,94,0.12)";
  typeBadge.style.color = hit.scanner_type === "momentum" ? "#6dd5ed" : "#f4d35e";
  typeBadge.style.borderColor = hit.scanner_type === "momentum" ? "#6dd5ed" : "#f4d35e";
  info.appendChild(typeBadge);
  header.appendChild(info);

  const priceCol = el("div", "stock-card-price-col");
  priceCol.appendChild(el("span", "stock-card-price", "$" + (hit.price || 0).toFixed(2)));
  const changePct = hit.change_pct || 0;
  const changeSpan = el("span", "stock-card-change " + (changePct >= 0 ? "up" : "down"),
    (changePct >= 0 ? "+" : "") + changePct.toFixed(1) + "%");
  priceCol.appendChild(changeSpan);
  header.appendChild(priceCol);
  card.appendChild(header);

  // Risk row
  const riskRow = el("div", "stock-card-signal-row");
  const riskClass = riskScore <= 2 ? "risk-low" : riskScore <= 3 ? "risk-medium" : "risk-high";
  const riskLabel = riskScore <= 2 ? "Lag risk" : riskScore <= 3 ? "Medel risk" : "Hog risk";
  const riskBadge = el("span", "stock-card-risk " + riskClass, riskLabel + " (" + riskScore + "/5)");
  riskRow.appendChild(riskBadge);
  riskRow.appendChild(createRiskDots(riskScore));

  // Confidence
  const confBadge = el("span", "stock-card-sector", "Konfidens: " + (hit.confidence_score || 0) + "/100");
  riskRow.appendChild(confBadge);
  card.appendChild(riskRow);

  // Trigger reason
  const reason = el("p", "stock-card-motivation", hit.trigger_reason || "--");
  reason.style.webkitLineClamp = "3";
  card.appendChild(reason);

  // Risk flags
  const flags = Array.isArray(hit.risk_flags) ? hit.risk_flags : [];
  if (flags.length > 0) {
    const flagsRow = el("div", "scanner-risk-flags");
    flagsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px";
    flags.forEach((f) => {
      const flag = el("span", "");
      flag.style.cssText = "font-size:0.72rem;padding:2px 8px;border-radius:999px;background:rgba(231,76,60,0.1);color:#ff6f61;border:1px solid rgba(231,76,60,0.3)";
      flag.textContent = f;
      flagsRow.appendChild(flag);
    });
    card.appendChild(flagsRow);
  }

  // Mini indicators
  const indicators = el("div", "stock-card-indicators");
  const items = [
    ["Pris", "$" + (hit.price || 0).toFixed(2)],
    ["Typ", hit.scanner_type],
    ["Bors", hit.exchange || "--"],
  ];
  items.forEach(([label, value]) => {
    const ind = el("div", "stock-mini-indicator");
    ind.appendChild(el("span", "label", label));
    ind.appendChild(el("span", "stock-mini-value", value));
    indicators.appendChild(ind);
  });
  card.appendChild(indicators);

  // Detail button - opens in detail view with TA data
  const detailBtn = el("button", "stock-card-detail-btn", "Visa detaljerad analys");
  detailBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openDetailView({
      name: hit.name || hit.ticker,
      ticker: hit.ticker,
      tickerDisplay: hit.ticker,
      market: "US",
      sector: hit.sector || hit.scanner_type,
      recommendation: riskScore <= 2 ? "KOP" : riskScore <= 3 ? "BEHALL" : "SALJ",
      timeHorizon: hit.scanner_type === "momentum" ? "1-8 veckor" : "Beror pa katalysator",
      motivation: hit.trigger_reason || "",
      targetPrice: null,
      stopLossPercent: riskScore >= 4 ? 20 : 12,
      riskLevel: riskLabel,
      riskScore: riskScore,
    });
  });
  card.appendChild(detailBtn);

  card.addEventListener("click", () => detailBtn.click());

  return card;
}

// ── Raket-prediktion ──────────────────────────────────────────────

function fetchWithTimeout(url, options, timeoutMs) {
  var controller = new AbortController();
  var id = setTimeout(function() { controller.abort(); }, timeoutMs || 5000);
  var opts = Object.assign({}, options || {}, { signal: controller.signal });
  return fetch(url, opts).finally(function() { clearTimeout(id); });
}

async function fetchRockets() {
  try {
    var res = await fetchWithTimeout(SCANNER_API + "/rockets/today", null, 5000);
    if (!res.ok) return;
    rocketData = await res.json();
  } catch (e) {
    console.warn("Rocket fetch error:", e.message);
    rocketData = null;
  }
}

async function fetchRocketHistory() {
  try {
    var res = await fetchWithTimeout(SCANNER_API + "/rockets/history", null, 5000);
    if (!res.ok) return;
    var data = await res.json();
    rocketHistory = data.predictions || [];
  } catch (e) {
    console.warn("Rocket history fetch error:", e.message);
    rocketHistory = [];
  }
}

async function fetchYesterdayRockets() {
  try {
    var res = await fetchWithTimeout(SCANNER_API + "/rockets/yesterday", null, 5000);
    if (!res.ok) return;
    var data = await res.json();
    if (data.rockets && data.rockets.length > 0) {
      yesterdayRocketData = data;
    } else {
      yesterdayRocketData = null;
    }
  } catch (e) {
    console.warn("Yesterday rockets fetch error:", e.message);
    yesterdayRocketData = null;
  }
}

async function generateRockets() {
  var btn = document.querySelector("#stock-list-section .stock-card-detail-btn");
  if (btn) { btn.textContent = "Genererar..."; btn.disabled = true; }
  try {
    var res = await fetchWithTimeout(SCANNER_API + "/rockets/generate", { method: "POST" }, 15000);
    if (!res.ok) throw new Error("Generate failed");
    rocketData = await res.json();
    await fetchRocketHistory();
    await fetchYesterdayRockets();
    renderStockList();
  } catch (e) {
    console.warn("Rocket generate error:", e.message);
    showErrorToast("Kunde inte generera raketer. Är backend-servern igång? (cd server && npm start)");
  } finally {
    if (btn) { btn.textContent = "Generera nya raketer"; btn.disabled = false; }
  }
}

async function verifyRockets(date) {
  try {
    var res = await fetchWithTimeout(SCANNER_API + "/rockets/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: date }),
    }, 15000);
    if (!res.ok) {
      var errBody = {};
      try { errBody = await res.json(); } catch (_) {}
      showErrorToast(errBody.error || "Verifiering misslyckades (HTTP " + res.status + ")");
      return;
    }
    await fetchRocketHistory();
    await fetchYesterdayRockets();
    await fetchRockets();
    renderStockList();
  } catch (e) {
    console.warn("Rocket verify error:", e.message);
    showErrorToast("Kunde inte verifiera raketer. Backend offline?");
  }
}

function formatDateET(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function isWeekendDateStr(dateStr) {
  var d = new Date(dateStr + "T12:00:00Z");
  var day = d.getUTCDay();
  return day === 0 || day === 6;
}

function canVerifyTargetDateClient(targetDate) {
  if (!targetDate) return { ok: false, reason: "Saknar målhandelsdag" };
  if (isWeekendDateStr(targetDate)) {
    return { ok: false, reason: targetDate + " är en helg – börsen är stängd" };
  }
  var now = new Date();
  var todayET = formatDateET(now);
  var hourET = Number(now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }));
  var minuteET = Number(now.toLocaleString("en-US", { timeZone: "America/New_York", minute: "2-digit" }));
  var minutes = hourET * 60 + minuteET;
  if (targetDate > todayET) {
    return { ok: false, reason: "Målhandelsdag " + targetDate + " har inte stängt än – börsen är stängd" };
  }
  if (targetDate === todayET && minutes < 16 * 60) {
    return { ok: false, reason: "Börsen är öppen – verifiera efter stängning 16:00 ET" };
  }
  return { ok: true };
}

function isRocketResultVisible(targetDate, result) {
  if (!result || !targetDate) return false;
  if (result.status === "pending" || result.status === "market_closed") return false;
  return canVerifyTargetDateClient(targetDate).ok;
}

function createRocketExpandable(titleText, metaText, defaultOpen) {
  const details = el("details", "rocket-expandable card");
  if (defaultOpen) details.open = true;

  const summary = el("summary", "rocket-expandable-summary");
  const titleWrap = el("div", "rocket-expandable-title-wrap");
  titleWrap.appendChild(el("span", "rocket-expandable-title", titleText));
  if (metaText) {
    titleWrap.appendChild(el("span", "rocket-expandable-meta", metaText));
  }
  summary.appendChild(titleWrap);

  const actions = el("div", "rocket-expandable-actions");
  summary.appendChild(actions);

  const body = el("div", "rocket-expandable-body");
  details.appendChild(summary);
  details.appendChild(body);

  return { details, summary, actions, body };
}

function renderRocketList(section) {
  // Header
  const headerCard = el("div", "card");
  headerCard.style.cssText = "text-align:center;padding:24px";
  const title = el("h2", "ta-subtitle");
  title.textContent = "Morgondagens Raketer";
  title.style.cssText = "font-size:1.5rem;margin-bottom:8px;color:#f4d35e";
  headerCard.appendChild(title);
  const subtitle = el("p", "stock-card-sector");
  subtitle.textContent = "Topp 3 aktier under $10 med storst potential att stiga nasta handelsdag. Pump-flaggor uteslutna automatiskt.";
  headerCard.appendChild(subtitle);

  const btnRow = el("div", "");
  btnRow.style.cssText = "display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap";
  const genBtn = el("button", "stock-card-detail-btn");
  genBtn.textContent = "Generera nya raketer";
  genBtn.style.cssText = "width:auto;padding:8px 20px;background:linear-gradient(135deg,#f4d35e,#ee964b);color:#0a0a23;font-weight:700";
  genBtn.addEventListener("click", () => generateRockets());
  btnRow.appendChild(genBtn);
  headerCard.appendChild(btnRow);
  section.appendChild(headerCard);

  // Gårdagens tips (expanderbar)
  if (yesterdayRocketData && yesterdayRocketData.rockets && yesterdayRocketData.rockets.length > 0) {
    renderYesterdayRocketSection(section);
  }

  // Morgondagens raketer (expanderbar)
  const todayExpand = createRocketExpandable(
    "Morgondagens raketer",
    rocketData && rocketData.target_date ? "Mal: " + rocketData.target_date : null,
    true
  );
  section.appendChild(todayExpand.details);

  if (!rocketData || !rocketData.rockets || rocketData.rockets.length === 0) {
    var empty = el("div", "card");
    empty.style.cssText = "text-align:center;padding:32px";
    empty.appendChild(el("h3", "ta-subtitle", "Inga raketer genererade ännu"));
    var desc = el("p", "stock-card-sector");
    if (!rocketData) {
      desc.textContent = "Backend-servern verkar vara offline. Starta den med: cd server && npm start";
    } else {
      desc.textContent = "Klicka 'Generera nya raketer' efter att scannern har kört.";
    }
    empty.appendChild(desc);
    todayExpand.body.appendChild(empty);
  } else {
    const infoCard = el("div", "card");
    infoCard.style.cssText = "padding:16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px";
    const dateInfo = el("span", "stock-card-sector");
    dateInfo.textContent = "Prediktionsdatum: " + rocketData.prediction_date + " | Maldag: " + rocketData.target_date;
    infoCard.appendChild(dateInfo);
    const universeInfo = el("span", "stock-card-sector");
    universeInfo.textContent = "Universum: " + rocketData.scanner_universe + " aktier | Kandidater: " + rocketData.candidates_scored;
    if (rocketData.filters) {
      const filterInfo = el("span", "stock-card-sector");
      filterInfo.textContent = "Pump uteslutna: " + (rocketData.filters.excluded_pump_count || 0);
      infoCard.appendChild(filterInfo);
    }
    infoCard.appendChild(universeInfo);
    todayExpand.body.appendChild(infoCard);

    rocketData.rockets.forEach((rocket, i) => {
      todayExpand.body.appendChild(renderRocketCard(rocket, i + 1));
    });
  }

  // Historik (expanderbar lista)
  if (rocketHistory.length > 0) {
    const histExpand = createRocketExpandable(
      "Historik & resultat",
      rocketHistory.length + " dagar",
      false
    );
    section.appendChild(histExpand.details);

    rocketHistory.forEach(pred => {
      histExpand.body.appendChild(renderRocketHistoryCard(pred));
    });
  }
}

function renderYesterdayRocketSection(section) {
  const y = yesterdayRocketData;
  const meta = "Publicerade " + y.prediction_date + " · Gäller " + y.target_date +
    (y.target_day ? " (" + y.target_day + ")" : "") + " · " + y.rockets.length + " st";

  const expand = createRocketExpandable("Gårdagens tips", meta, true);
  expand.details.classList.add("rocket-yesterday-section");
  section.appendChild(expand.details);

  const hasVerified = y.verification && y.verification.result && !y.verification_pending;
  if (hasVerified) {
    const sum = y.verification.result;
    const rockets20 = sum.rockets_20pct != null ? sum.rockets_20pct : 0;
    const badge = el("span", "rocket-expandable-badge");
    badge.textContent = rockets20 + " raket +20% · Snitt " + (sum.avg_change >= 0 ? "+" : "") + sum.avg_change + "%";
    expand.actions.appendChild(badge);
  } else if (y.verification_pending || !canVerifyTargetDateClient(y.target_date).ok) {
    const badge = el("span", "rocket-expandable-badge");
    badge.style.cssText = "background:rgba(139,145,171,0.12);color:#8b91ab;border-color:rgba(139,145,171,0.3)";
    badge.textContent = "Börsen stängd";
    expand.actions.appendChild(badge);
  } else {
    const verifyBtn = el("button", "stock-card-detail-btn");
    verifyBtn.type = "button";
    verifyBtn.textContent = "Verifiera";
    verifyBtn.style.cssText = "width:auto;padding:4px 12px;font-size:0.8rem";
    verifyBtn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      verifyRockets(y.prediction_date);
    });
    expand.actions.appendChild(verifyBtn);
  }

  if (y.verification_message || !canVerifyTargetDateClient(y.target_date).ok) {
    const waitMsg = el("p", "stock-card-sector");
    waitMsg.style.cssText = "margin:0 4px 8px;font-size:0.82rem;color:#8b91ab";
    waitMsg.textContent = y.verification_message || canVerifyTargetDateClient(y.target_date).reason;
    expand.body.appendChild(waitMsg);
  }

  y.rockets.forEach(function(rocket, i) {
    expand.body.appendChild(renderRocketCard(rocket, i + 1, true, y.target_date));
  });
}

function renderRocketCard(rocket, rank, isYesterday, targetDate) {
  const riskScore = rocket.risk_score || 3;
  const borderClass = riskScore <= 2 ? "stock-card-buy" : riskScore <= 3 ? "stock-card-hold" : "stock-card-sell";
  const card = el("div", "stock-card card " + borderClass);
  card.style.position = "relative";

  // Rank badge
  const rankBadge = el("div", "");
  rankBadge.textContent = "#" + rank;
  rankBadge.style.cssText = "position:absolute;top:12px;right:12px;background:linear-gradient(135deg,#f4d35e,#ee964b);color:#0a0a23;font-weight:800;font-size:1.2rem;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:1";
  card.appendChild(rankBadge);

  // Header
  const header = el("div", "stock-card-header");
  header.style.paddingRight = "48px";
  const info = el("div", "stock-card-info");
  info.appendChild(el("span", "stock-card-name", rocket.name));
  info.appendChild(el("span", "stock-card-ticker", rocket.ticker));

  const typeBadge = el("span", "stock-card-market-badge stock-market-us");
  typeBadge.textContent = (rocket.scanner_type || "momentum").toUpperCase();
  typeBadge.style.cssText = "background:rgba(244,211,94,0.15);color:#f4d35e;border-color:#f4d35e";
  info.appendChild(typeBadge);
  header.appendChild(info);

  const priceCol = el("div", "stock-card-price-col");
  priceCol.appendChild(el("span", "stock-card-price", "$" + (rocket.price_at_prediction || 0).toFixed(2)));
  const changePct = rocket.change_today || 0;
  const changeSpan = el("span", "stock-card-change " + (changePct >= 0 ? "up" : "down"),
    (changePct >= 0 ? "+" : "") + changePct.toFixed(1) + "% idag");
  priceCol.appendChild(changeSpan);
  header.appendChild(priceCol);
  card.appendChild(header);

  // Score row
  const scoreRow = el("div", "stock-card-signal-row");
  const scoreBadge = el("span", "stock-card-risk risk-low");
  scoreBadge.textContent = "Raket-score: " + rocket.rocket_score;
  scoreBadge.style.cssText = "background:rgba(244,211,94,0.12);color:#f4d35e;border-color:#f4d35e";
  scoreRow.appendChild(scoreBadge);

  const confBadge = el("span", "stock-card-sector", "Konfidens: " + (rocket.confidence_score || 0) + "/100");
  scoreRow.appendChild(confBadge);

  const riskClass = riskScore <= 2 ? "risk-low" : riskScore <= 3 ? "risk-medium" : "risk-high";
  const riskLabel = riskScore <= 2 ? "Lag risk" : riskScore <= 3 ? "Medel risk" : "Hog risk";
  scoreRow.appendChild(el("span", "stock-card-risk " + riskClass, riskLabel + " (" + riskScore + "/5)"));
  card.appendChild(scoreRow);

  // Trigger reason
  const reason = el("p", "stock-card-motivation", rocket.trigger_reason || "--");
  reason.style.webkitLineClamp = "3";
  card.appendChild(reason);

  // Volume info + mål/stop för gårdagens tips
  const volRow = el("div", "stock-card-indicators");
  const price = rocket.price_at_prediction || 0;
  const volItems = [
    ["Volym", rocket.volume > 0 ? formatLargeNumber(rocket.volume) : "--"],
    ["Rel. volym", (rocket.relative_volume || 0).toFixed(1) + "x"],
    ["Pris", "$" + price.toFixed(2)],
  ];
  if (rocket.target_20pct != null) {
    volItems.push(["Mål +20%", "$" + Number(rocket.target_20pct).toFixed(2)]);
  }
  if (rocket.stop_loss_8pct != null) {
    volItems.push(["Stop −8%", "$" + Number(rocket.stop_loss_8pct).toFixed(2)]);
  }
  volItems.forEach(([label, value]) => {
    const ind = el("div", "stock-mini-indicator");
    ind.appendChild(el("span", "label", label));
    ind.appendChild(el("span", "stock-mini-value", value));
    volRow.appendChild(ind);
  });
  card.appendChild(volRow);

  // Risk flags
  const flags = Array.isArray(rocket.risk_flags) ? rocket.risk_flags : [];
  if (flags.length > 0) {
    const flagsRow = el("div", "");
    flagsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:8px 0";
    flags.forEach(f => {
      const flag = el("span", "");
      flag.style.cssText = "font-size:0.72rem;padding:2px 8px;border-radius:999px;background:rgba(231,76,60,0.1);color:#ff6f61;border:1px solid rgba(231,76,60,0.3)";
      flag.textContent = f;
      flagsRow.appendChild(flag);
    });
    card.appendChild(flagsRow);
  }

  // Result if verified (inte under helg / fore malhandelsdag)
  if (isRocketResultVisible(targetDate, rocket.result)) {
    const resRow = el("div", "");
    const r = rocket.result;
    let label, bg, color;
    if (r.hit_20pct) {
      label = "RAKET +20% · " + (r.change_pct >= 0 ? "+" : "") + r.change_pct.toFixed(1) + "% · Stang: $" + r.current_price.toFixed(2);
      bg = "rgba(244,211,94,0.15);border:1px solid rgba(244,211,94,0.4)";
      color = "#f4d35e";
    } else if (r.hit_stop_loss) {
      label = "STOP-LOSS · " + r.change_pct.toFixed(1) + "% · Stang: $" + r.current_price.toFixed(2);
      bg = "rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3)";
      color = "#ff6f61";
    } else if (r.was_correct) {
      label = "UPP · +" + r.change_pct.toFixed(1) + "% · Stang: $" + r.current_price.toFixed(2);
      bg = "rgba(46,204,113,0.1);border:1px solid rgba(46,204,113,0.3)";
      color = "#2ecc71";
    } else {
      label = "NED · " + r.change_pct.toFixed(1) + "% · Stang: $" + r.current_price.toFixed(2);
      bg = "rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.3)";
      color = "#ff6f61";
    }
    resRow.style.cssText = "padding:10px;margin-top:8px;border-radius:8px;background:" + bg;
    const resText = el("span", "");
    resText.style.cssText = "font-weight:700;color:" + color;
    resText.textContent = label;
    resRow.appendChild(resText);
    card.appendChild(resRow);
  } else if (targetDate && !canVerifyTargetDateClient(targetDate).ok) {
    const pending = el("p", "stock-card-sector");
    pending.style.cssText = "margin-top:8px;font-size:0.8rem;color:#8b91ab";
    pending.textContent = canVerifyTargetDateClient(targetDate).reason;
    card.appendChild(pending);
  } else if (isYesterday && rocket.target_20pct != null) {
    const pending = el("p", "stock-card-sector");
    pending.style.cssText = "margin-top:8px;font-size:0.8rem";
    pending.textContent = "Väntar på verifiering efter stängning " + (yesterdayRocketData.target_date || "");
    card.appendChild(pending);
  }

  return card;
}

function renderRocketHistoryCard(pred) {
  const tickers = (pred.rockets || []).map(r => r.ticker).join(", ");
  const summaryMeta = (pred.rockets || []).length + " st" + (tickers ? " · " + tickers : "");

  const expand = createRocketExpandable(pred.prediction_date, summaryMeta, false);
  expand.details.classList.add("rocket-history-item");

  if (pred.summary && !pred.verification_pending && canVerifyTargetDateClient(pred.target_date).ok) {
    const rate = pred.summary.hit_rate;
    const badge = el("span", "rocket-expandable-badge");
    badge.style.color = rate >= 60 ? "#2ecc71" : rate >= 40 ? "#f4d35e" : "#ff6f61";
    badge.textContent = rate + "% ratt · Snitt " + (pred.summary.avg_change >= 0 ? "+" : "") + pred.summary.avg_change + "%";
    expand.actions.appendChild(badge);
  } else if (pred.verification_pending || !canVerifyTargetDateClient(pred.target_date).ok) {
    const badge = el("span", "rocket-expandable-badge");
    badge.style.cssText = "background:rgba(139,145,171,0.12);color:#8b91ab;border-color:rgba(139,145,171,0.3)";
    badge.textContent = "Börsen stängd";
    expand.actions.appendChild(badge);
  } else {
    const verifyBtn = el("button", "stock-card-detail-btn");
    verifyBtn.type = "button";
    verifyBtn.textContent = "Verifiera";
    verifyBtn.style.cssText = "width:auto;padding:4px 12px;font-size:0.8rem";
    verifyBtn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      verifyRockets(pred.prediction_date);
    });
    expand.actions.appendChild(verifyBtn);
  }

  const info = el("p", "stock-card-sector");
  info.textContent = "Maldag: " + (pred.target_date || "--") + " · Universum: " + (pred.scanner_universe || "--");
  expand.body.appendChild(info);

  (pred.rockets || []).forEach(function(rocket, i) {
    expand.body.appendChild(renderRocketCard(rocket, i + 1, false, pred.target_date));
  });

  return expand.details;
}

function formatLargeNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

// ── Uppdatera aktiekort med live-pris ─────────────────────────────

function updateStockCardPrice(ticker, quoteData) {
  const safeTicker = ticker.replace(/[^a-zA-Z0-9]/g, "_");
  const priceEl = document.getElementById("card-price-" + safeTicker);
  const changeEl = document.getElementById("card-change-" + safeTicker);

  if (!priceEl || !quoteData) return;

  const price = parseFloat(quoteData.close);
  const pctChange = parseFloat(quoteData.percent_change);
  const stock = SHORT_TERM_PICKS.concat(LONG_TERM_PICKS).find((s) => s.ticker === ticker);
  const market = stock ? stock.market : "US";

  if (!isNaN(price)) {
    priceEl.textContent = fmtPrice(price, market);
  }

  if (changeEl && !isNaN(pctChange)) {
    changeEl.textContent = fmtPct(pctChange);
    changeEl.className = "stock-card-change " + (pctChange >= 0 ? "up" : "down");
  }
}

// ── Detaljvy ─────────────────────────────────────────────────────

function openDetailView(stock) {
  const overlay = document.getElementById("stock-detail-overlay");
  overlay.style.display = "block";
  document.body.style.overflow = "hidden";

  // Fyll i basdata
  document.getElementById("detail-name").textContent = stock.name;
  document.getElementById("detail-ticker").textContent = stock.tickerDisplay;

  const marketBadge = document.getElementById("detail-market-badge");
  marketBadge.textContent = stock.market;
  marketBadge.className = "detail-market-badge " + (stock.market === "SE" ? "stock-market-se" : "stock-market-us");

  document.getElementById("detail-sector").textContent = stock.sector;

  // Pris fran cache
  const cached = priceCache[stock.ticker];
  if (cached) {
    document.getElementById("detail-price").textContent = fmtPrice(parseFloat(cached.close), stock.market);
    const pctChange = parseFloat(cached.percent_change);
    const changeEl = document.getElementById("detail-change");
    changeEl.textContent = fmtPct(pctChange);
    changeEl.className = "price-small " + (pctChange >= 0 ? "up" : "down");
  } else {
    document.getElementById("detail-price").textContent = "--";
    document.getElementById("detail-change").textContent = "";
  }

  // Signal badge
  const badgeClass = stock.recommendation === "KOP" ? "signal-buy" :
                     stock.recommendation === "SALJ" ? "signal-sell" : "signal-hold";
  const signalBadge = document.getElementById("detail-signal-badge");
  signalBadge.textContent = stock.recommendation;
  signalBadge.className = "signal-badge " + badgeClass;

  document.getElementById("detail-time-horizon").textContent = stock.timeHorizon;
  document.getElementById("detail-risk-level").textContent = stock.riskLevel;

  // Penny stock-varning
  var pennyWarning = document.getElementById("detail-penny-warning");
  if (pennyWarning) {
    var currentPrice = cached ? parseFloat(cached.close) : null;
    var isPenny = (currentPrice != null && currentPrice < 5) || stock.riskScore >= 5;
    pennyWarning.style.display = isPenny ? "block" : "none";
  }

  // Motivering
  document.getElementById("detail-motivation").textContent = stock.motivation;

  // Riktkurs, stop-loss, uppsida
  if (stock.targetPrice != null) {
    document.getElementById("detail-target-price").textContent = fmtPrice(stock.targetPrice, stock.market);
    if (cached) {
      const currentPrice = parseFloat(cached.close);
      const upside = ((stock.targetPrice - currentPrice) / currentPrice * 100);
      document.getElementById("detail-upside").textContent = fmtPct(upside);
      document.getElementById("detail-upside").className = "value " + (upside >= 0 ? "up" : "down");
    } else {
      document.getElementById("detail-upside").textContent = "--";
    }
  } else {
    document.getElementById("detail-target-price").textContent = "Ej satt";
    document.getElementById("detail-upside").textContent = "--";
  }

  if (stock.stopLossPercent != null) {
    document.getElementById("detail-stop-loss").textContent = "-" + stock.stopLossPercent + "%";
    if (cached) {
      const slPrice = parseFloat(cached.close) * (1 - stock.stopLossPercent / 100);
      document.getElementById("detail-stop-loss").textContent = fmtPrice(slPrice, stock.market) +
        " (-" + stock.stopLossPercent + "%)";
    }
  } else {
    document.getElementById("detail-stop-loss").textContent = "Ej satt (langsiktig)";
  }

  // Nollstall TA-varden
  const taFields = ["detail-sma20", "detail-sma50", "detail-ema12", "detail-ema26",
                     "detail-rsi", "detail-macd", "detail-macd-signal", "detail-macd-hist",
                     "detail-pe", "detail-eps", "detail-market-cap",
                     "detail-52w-high", "detail-52w-low", "detail-avg-volume"];
  taFields.forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.textContent = "--";
  });

  // Nollstall scorecard, levels, nyheter, chart
  if (detailChartInstance) {
    detailChartInstance.destroy();
    detailChartInstance = null;
  }
  clearChildren(document.getElementById("detail-ta-scorecard"));
  clearChildren(document.getElementById("detail-support-list"));
  clearChildren(document.getElementById("detail-resistance-list"));

  const newsList = document.getElementById("detail-news-list");
  clearChildren(newsList);
  newsList.appendChild(el("li", "news-loading", "Laddar..."));

  // Ladda detaljerad data asynkront
  loadAndRenderDetails(stock);
}

async function loadAndRenderDetails(stock) {
  if (!hasApiKey("twelveData")) {
    // Ingen API-nyckel -- visa meddelande
    const scorecard = document.getElementById("detail-ta-scorecard");
    clearChildren(scorecard);
    scorecard.appendChild(el("p", "stock-card-sector",
      "Teknisk analys kravs API-nyckel. Registrera pa twelvedata.com for att aktivera."));

    const newsList = document.getElementById("detail-news-list");
    clearChildren(newsList);
    newsList.appendChild(el("li", "news-loading", "Nyheter kravs API-nyckel (Finnhub)."));
    return;
  }

  // SE-aktier: Twelve Data gratis-plan stodjer inte OMX Stockholm
  // Visa meddelande istallet for att forsoka hamta TA-data som ger 404
  if (stock.market === "SE") {
    const scorecard = document.getElementById("detail-ta-scorecard");
    clearChildren(scorecard);
    scorecard.appendChild(el("p", "stock-card-sector",
      "Teknisk analys ej tillganglig for svenska aktier (Twelve Data gratis-plan stodjer inte OMX Stockholm)."));

    const newsList = document.getElementById("detail-news-list");
    clearChildren(newsList);
    newsList.appendChild(el("li", "news-loading", "Nyheter ej tillgangliga for svenska aktier (kravs premium-API)."));
    return;
  }

  const ticker = stock.ticker;

  try {
    // Hamta all TA-data
    const results = await Promise.allSettled([
      fetchTwelveDataTimeSeries(ticker, 180),
      fetchTwelveDataRSI(ticker),
      fetchTwelveDataMACD(ticker),
      fetchTwelveDataSMA(ticker, 20),
      fetchTwelveDataSMA(ticker, 50),
      fetchTwelveDataEMA(ticker, 12),
      fetchTwelveDataEMA(ticker, 26)
    ]);

    const timeSeries = results[0].status === "fulfilled" ? results[0].value : null;
    const rsi        = results[1].status === "fulfilled" ? results[1].value : null;
    const macd       = results[2].status === "fulfilled" ? results[2].value : null;
    const sma20      = results[3].status === "fulfilled" ? results[3].value : null;
    const sma50      = results[4].status === "fulfilled" ? results[4].value : null;
    const ema12      = results[5].status === "fulfilled" ? results[5].value : null;
    const ema26      = results[6].status === "fulfilled" ? results[6].value : null;

    // Fyll i TA-varden
    if (sma20 != null) document.getElementById("detail-sma20").textContent = sma20.toFixed(2);
    if (sma50 != null) document.getElementById("detail-sma50").textContent = sma50.toFixed(2);
    if (ema12 != null) document.getElementById("detail-ema12").textContent = ema12.toFixed(2);
    if (ema26 != null) document.getElementById("detail-ema26").textContent = ema26.toFixed(2);
    if (rsi != null) {
      const rsiEl = document.getElementById("detail-rsi");
      rsiEl.textContent = rsi.toFixed(1);
      rsiEl.className = "value " + (rsi > 70 ? "down" : rsi < 30 ? "up" : "");
    }
    if (macd != null) {
      document.getElementById("detail-macd").textContent = macd.macd.toFixed(2);
      document.getElementById("detail-macd-signal").textContent = macd.signal.toFixed(2);
      const histEl = document.getElementById("detail-macd-hist");
      histEl.textContent = macd.histogram.toFixed(4);
      histEl.className = "value " + (macd.histogram >= 0 ? "up" : "down");
    }

    // TA-signal
    if (rsi != null && macd != null && sma20 != null && sma50 != null) {
      const currentPrice = priceCache[ticker] ? parseFloat(priceCache[ticker].close) : sma20;
      const taResult = generateTASignal(rsi, macd, sma20, sma50, currentPrice);
      renderTAScorecard(taResult);
    }

    // Stod/motstand
    if (timeSeries && timeSeries.values) {
      const levels = calculateSupportResistance(timeSeries.values);
      renderLevels(levels, stock.market);

      // Render graf
      renderDetailChart(timeSeries.values, stock);
    }

    // Cache TA-data
    taCache[ticker] = { rsi: rsi, macd: macd, sma20: sma20, sma50: sma50, ema12: ema12, ema26: ema26 };

  } catch (err) {
    console.warn("Fel vid laddning av detaljer for " + stock.name + ":", err.message);
  }

  // Nyheter (Finnhub, bara US)
  const newsListEl = document.getElementById("detail-news-list");
  clearChildren(newsListEl);
  if (stock.market === "US" && hasApiKey("finnhub")) {
    try {
      const news = await fetchFinnhubNews(stock.tickerDisplay);
      renderNews(news);
    } catch (e) {
      newsListEl.appendChild(el("li", "news-loading", "Kunde inte ladda nyheter."));
    }
  } else if (stock.market === "SE") {
    newsListEl.appendChild(el("li", "news-loading", "Nyheter ej tillgangliga for svenska aktier (kravs premium-API)."));
  } else {
    newsListEl.appendChild(el("li", "news-loading", "Nyheter kravs Finnhub API-nyckel."));
  }

  // Fundamental data (Alpha Vantage, bara US)
  if (stock.market === "US" && hasApiKey("alphaVantage")) {
    try {
      const fundamental = await fetchAlphaVantageOverview(stock.tickerDisplay);
      if (fundamental && fundamental.Symbol) {
        if (fundamental.PERatio && fundamental.PERatio !== "None")
          document.getElementById("detail-pe").textContent = fundamental.PERatio;
        if (fundamental.EPS && fundamental.EPS !== "None")
          document.getElementById("detail-eps").textContent = fundamental.EPS;
        if (fundamental.MarketCapitalization)
          document.getElementById("detail-market-cap").textContent = fmtLarge(parseFloat(fundamental.MarketCapitalization));
        if (fundamental["52WeekHigh"] && !isNaN(parseFloat(fundamental["52WeekHigh"])))
          document.getElementById("detail-52w-high").textContent = "$" + parseFloat(fundamental["52WeekHigh"]).toFixed(2);
        if (fundamental["52WeekLow"] && !isNaN(parseFloat(fundamental["52WeekLow"])))
          document.getElementById("detail-52w-low").textContent = "$" + parseFloat(fundamental["52WeekLow"]).toFixed(2);
      }
    } catch (e) {
      console.warn("Alpha Vantage-fel:", e.message);
    }
  }
}

// ── TA Scorecard rendering ───────────────────────────────────────

function renderTAScorecard(taResult) {
  const container = document.getElementById("detail-ta-scorecard");
  clearChildren(container);

  taResult.signals.forEach((sig) => {
    const item = el("div", "sc-item");
    item.appendChild(el("span", "sc-label", sig.indicator));
    if (sig.value) {
      item.appendChild(el("span", "sc-value", sig.value));
    }

    const sigClass = sig.signal === "KOP" ? "sc-bull" :
                     sig.signal === "SALJ" ? "sc-bear" : "sc-neut";
    const sigSpan = el("span", "sc-signal " + sigClass, sig.reason);
    item.appendChild(sigSpan);

    container.appendChild(item);
  });

  // Sammanfattad signal
  const summaryItem = el("div", "sc-item");
  summaryItem.style.borderWidth = "2px";
  summaryItem.appendChild(el("span", "sc-label", "SAMMANVAGD"));
  summaryItem.appendChild(el("span", "sc-value",
    "Bull: " + taResult.bullCount + " / Bear: " + taResult.bearCount));
  const overallClass = taResult.overallSignal.indexOf("KOP") !== -1 ? "sc-bull" :
                       taResult.overallSignal.indexOf("SALJ") !== -1 ? "sc-bear" : "sc-neut";
  summaryItem.appendChild(el("span", "sc-signal " + overallClass, taResult.overallSignal));
  container.appendChild(summaryItem);
}

// ── Stod/motstand rendering ─────────────────────────────────────

function renderLevels(levels, market) {
  const supportList = document.getElementById("detail-support-list");
  const resistanceList = document.getElementById("detail-resistance-list");
  clearChildren(supportList);
  clearChildren(resistanceList);

  if (levels.support.length === 0) {
    supportList.appendChild(el("li", "news-loading", "Inga stodnivan hittades"));
  } else {
    levels.support.forEach((price, i) => {
      const li = document.createElement("li");
      const nameSpan = el("span", null, "S" + (i + 1));
      const priceSpan = el("span", null, fmtPrice(price, market));
      li.appendChild(nameSpan);
      li.appendChild(priceSpan);
      supportList.appendChild(li);
    });
  }

  if (levels.resistance.length === 0) {
    resistanceList.appendChild(el("li", "news-loading", "Inga motstadsnivan hittades"));
  } else {
    levels.resistance.forEach((price, i) => {
      const li = document.createElement("li");
      const nameSpan = el("span", null, "R" + (i + 1));
      const priceSpan = el("span", null, fmtPrice(price, market));
      li.appendChild(nameSpan);
      li.appendChild(priceSpan);
      resistanceList.appendChild(li);
    });
  }
}

// ── Nyheter rendering ───────────────────────────────────────────

function renderNews(newsArr) {
  const list = document.getElementById("detail-news-list");
  clearChildren(list);

  if (!newsArr || newsArr.length === 0) {
    list.appendChild(el("li", "news-loading", "Inga nyheter hittades."));
    return;
  }

  const items = newsArr.slice(0, 5);
  items.forEach((article) => {
    const li = document.createElement("li");

    const link = document.createElement("a");
    link.className = "news-link";
    // Sanitera URL -- tillat bara http/https for att forebygga javascript:-XSS
    const articleUrl = String(article.url || "");
    if (articleUrl.match(/^https?:\/\//i)) {
      link.href = articleUrl;
    } else {
      link.href = "#";
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.headline || "Utan rubrik";
    li.appendChild(link);

    const meta = el("div", "news-meta");
    meta.appendChild(el("span", "news-source", String(article.source || "Okand kalla")));
    if (article.datetime && !isNaN(Number(article.datetime))) {
      const date = new Date(Number(article.datetime) * 1000);
      meta.appendChild(el("span", "news-time", date.toLocaleDateString("sv-SE")));
    }
    li.appendChild(meta);

    list.appendChild(li);
  });
}

// ── Chart.js graf ───────────────────────────────────────────────

let detailChartInstance = null;

function renderDetailChart(priceData, stock) {
  const canvas = document.getElementById("detail-chart");
  const ctx = canvas.getContext("2d");

  const reversed = priceData.slice().reverse();

  const labels = reversed.map((d) => d.datetime);
  const prices = reversed.map((d) => parseFloat(d.close));

  // Berakna SMA50 for overlay
  const sma50line = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < 49) { sma50line.push(null); continue; }
    let sum = 0;
    for (let j = i - 49; j <= i; j++) sum += prices[j];
    sma50line.push(sum / 50);
  }

  if (detailChartInstance) {
    detailChartInstance.destroy();
  }

  detailChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: stock.tickerDisplay,
          data: prices,
          borderColor: "#6dd5ed",
          backgroundColor: "rgba(109, 213, 237, 0.08)",
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.3
        },
        {
          label: "SMA 50",
          data: sma50line,
          borderColor: "#8a9cff",
          borderWidth: 1.5,
          borderDash: [6, 3],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { labels: { color: "#9aa0b4", font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#1c2236",
          borderColor: "#2b3252",
          borderWidth: 1,
          titleColor: "#e7e9f0",
          bodyColor: "#c7cdf0"
        }
      },
      scales: {
        x: {
          ticks: { color: "#8b91ab", maxTicksLimit: 8, font: { size: 10 } },
          grid: { color: "#1a2040" }
        },
        y: {
          ticks: { color: "#8b91ab", font: { size: 10 } },
          grid: { color: "#1a2040" }
        }
      }
    }
  });
}

// ── Detaljvy: stang ─────────────────────────────────────────────

function closeDetailView() {
  document.getElementById("stock-detail-overlay").style.display = "none";
  document.body.style.overflow = "";
  if (detailChartInstance) {
    detailChartInstance.destroy();
    detailChartInstance = null;
  }
}

// ── Ladda kurser for synliga aktier ─────────────────────────────

async function loadQuotesForVisibleStocks() {
  if (!hasApiKey("twelveData")) {
    // Ingen Twelve Data-nyckel -- anvand Yahoo Finance istallet
    await loadAllQuotes();
    return;
  }

  const visibleStocks = getFilteredStocks();
  let loaded = 0;
  let failed = 0;

  for (let i = 0; i < visibleStocks.length; i++) {
    const stock = visibleStocks[i];

    if (stock.market === "SE") {
      // SE-aktier: Twelve Data stodjer inte OMX Stockholm pa gratis-plan
      // Anvand Yahoo Finance via CORS-proxy istallet
      var safeTickerSE = stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
      var priceElSE = document.getElementById("card-price-" + safeTickerSE);
      if (priceElSE && priceElSE.textContent === "--") {
        priceElSE.textContent = "Laddar...";
        priceElSE.className = "stock-card-price loading-pulse";
      }
      try {
        const quote = await fetchYahooQuote(stock.ticker);
        if (quote) {
          yahooQuoteCache[stock.ticker] = quote;
          priceCache[stock.ticker] = {
            close: String(quote.price),
            percent_change: String(quote.changePercent)
          };
          updateStockCardPriceYahoo(stock.ticker, quote, stock.market);
          loaded++;
        } else {
          const safeTicker = stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
          const priceEl = document.getElementById("card-price-" + safeTicker);
          if (priceEl) {
            priceEl.textContent = "Kurs ej tillganglig";
            priceEl.className = "stock-card-price";
          }
          failed++;
        }
      } catch (err) {
        console.warn("Yahoo-fel for " + stock.ticker + ":", err.message);
        if (priceElSE) {
          priceElSE.textContent = "Kurs ej tillganglig";
          priceElSE.className = "stock-card-price";
        }
        failed++;
      }
    } else {
      // US-aktier: anvand Twelve Data
      const safeTicker = stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
      const priceElUS = document.getElementById("card-price-" + safeTicker);
      if (priceElUS && priceElUS.textContent === "--") {
        priceElUS.textContent = "Laddar...";
        priceElUS.className = "stock-card-price loading-pulse";
      }
      try {
        const quote = await fetchTwelveDataQuote(stock.ticker);
        priceCache[stock.ticker] = quote;
        updateStockCardPrice(stock.ticker, quote);
        loaded++;
      } catch (err) {
        console.warn("Kunde inte hamta kurs for " + stock.ticker + ":", err.message);
        if (priceElUS) {
          priceElUS.textContent = "Kurs ej tillganglig";
          priceElUS.className = "stock-card-price";
        }
        failed++;
      }
    }
  }

  if (loaded > 0) {
    updateApiStatus("OK");
  } else if (failed > 0) {
    updateApiStatus("error");
  }
}

// ── Ladda RSI for synliga aktier (mini-indikator) ───────────────

async function loadRSIForVisibleStocks() {
  if (!hasApiKey("twelveData")) return;

  const visibleStocks = getFilteredStocks();
  for (let i = 0; i < visibleStocks.length; i++) {
    const stock = visibleStocks[i];

    // Skippa SE-aktier -- Twelve Data gratis-plan stodjer inte OMX Stockholm
    if (stock.market === "SE") {
      const safeTicker = stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
      const rsiEl = document.getElementById("mini-rsi-" + safeTicker);
      if (rsiEl) {
        rsiEl.textContent = "N/A";
        rsiEl.className = "stock-mini-value";
      }
      continue;
    }

    try {
      const rsi = await fetchTwelveDataRSI(stock.ticker);
      const safeTicker = stock.ticker.replace(/[^a-zA-Z0-9]/g, "_");
      const rsiEl = document.getElementById("mini-rsi-" + safeTicker);
      if (rsiEl && !isNaN(rsi)) {
        rsiEl.textContent = rsi.toFixed(1);
        rsiEl.className = "stock-mini-value " + (rsi > 70 ? "down" : rsi < 30 ? "up" : "");
      }
    } catch (err) {
      console.warn("RSI-fel for " + stock.ticker + ":", err.message);
    }
  }
}

// ── API-status ──────────────────────────────────────────────────

function updateApiStatus(status) {
  const badge = document.getElementById("api-status-badge");
  const srcTwelve = document.getElementById("src-twelvedata");

  if (status === "OK") {
    badge.textContent = "Twelve Data + Yahoo Finance (aktiv)";
    badge.className = "src-badge src-positive";
    srcTwelve.textContent = "OK";
    srcTwelve.className = "src-badge src-positive";
    document.getElementById("stocks-last-updated").textContent =
      new Date().toLocaleTimeString("sv-SE");
  } else if (status === "yahoo-ok") {
    badge.textContent = "Yahoo Finance (via proxy)";
    badge.className = "src-badge src-positive";
    srcTwelve.textContent = "Ej konfigurerad";
    srcTwelve.className = "src-badge src-neutral";
    document.getElementById("stocks-last-updated").textContent =
      new Date().toLocaleTimeString("sv-SE");
  } else if (status === "yahoo-loading") {
    badge.textContent = "Yahoo Finance -- hamtar kurser...";
    badge.className = "src-badge src-neutral";
    srcTwelve.textContent = "Ej konfigurerad";
    srcTwelve.className = "src-badge src-neutral";
  } else if (status === "yahoo-error") {
    badge.textContent = "Kurser ej tillgangliga -- proxy nere";
    badge.className = "src-badge src-negative";
    srcTwelve.textContent = "Ej konfigurerad";
    srcTwelve.className = "src-badge src-neutral";
  } else if (status === "demo") {
    badge.textContent = "Demo-lage (ingen API-nyckel)";
    badge.className = "src-badge src-mixed";
    srcTwelve.textContent = "Demo";
    srcTwelve.className = "src-badge src-mixed";
  } else if (status === "loading") {
    badge.textContent = "Ansluter...";
    badge.className = "src-badge src-neutral";
    srcTwelve.textContent = "Ansluter...";
    srcTwelve.className = "src-badge src-neutral";
  } else {
    badge.textContent = "Fel vid anslutning";
    badge.className = "src-badge src-negative";
    srcTwelve.textContent = "Fel";
    srcTwelve.className = "src-badge src-negative";
  }

  // Finnhub & Alpha Vantage status
  const srcFinnhub = document.getElementById("src-finnhub");
  if (hasApiKey("finnhub")) {
    srcFinnhub.textContent = "Konfigurerad";
    srcFinnhub.className = "src-badge src-positive";
  } else {
    srcFinnhub.textContent = "Ej konfigurerad";
    srcFinnhub.className = "src-badge src-neutral";
  }

  const srcAlpha = document.getElementById("src-alphavantage");
  if (hasApiKey("alphaVantage")) {
    srcAlpha.textContent = "Konfigurerad";
    srcAlpha.className = "src-badge src-positive";
  } else {
    srcAlpha.textContent = "Ej konfigurerad";
    srcAlpha.className = "src-badge src-neutral";
  }
}

// ── Countdown / Auto-refresh ────────────────────────────────────

let countdownValue = REFRESH_SECONDS;
let countdownInterval = null;

function startCountdown() {
  countdownValue = REFRESH_SECONDS;
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    countdownValue--;
    const cdEl = document.getElementById("stocks-countdown");
    if (cdEl) cdEl.textContent = countdownValue;

    if (countdownValue <= 0) {
      countdownValue = REFRESH_SECONDS;
      pruneCache();
      renderStockList();
      restoreCachedPrices();
      if (hasApiKey("twelveData")) {
        loadQuotesForVisibleStocks().then(() => {
          loadRSIForVisibleStocks();
        });
      } else {
        loadAllQuotes();
      }
    }
  }, 1000);
}

// ── Aterstall cachade priser efter omrendering ──────────────────

function restoreCachedPrices() {
  const stocks = getFilteredStocks();
  stocks.forEach(function(stock) {
    // Forsok Yahoo-cache forst (SE-aktier, eller alla i Yahoo-only-lage)
    var yahooCached = yahooQuoteCache[stock.ticker];
    if (yahooCached) {
      updateStockCardPriceYahoo(stock.ticker, yahooCached, stock.market);
      return;
    }
    // Forsok Twelve Data priceCache (US-aktier i hybrid-lage)
    var twelveCached = priceCache[stock.ticker];
    if (twelveCached) {
      updateStockCardPrice(stock.ticker, twelveCached);
    }
  });
}

// ── Event handlers ──────────────────────────────────────────────

function setupEventHandlers() {
  // Flikar (tidshorisont)
  document.querySelectorAll(".stock-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".stock-tab").forEach((t) => {
        t.classList.remove("stock-tab-active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("stock-tab-active");
      tab.setAttribute("aria-selected", "true");
      currentHorizon = tab.dataset.horizon;

      // Toggle scanner status section
      const scannerSection = document.getElementById("scanner-status-section");
      if (scannerSection) {
        scannerSection.style.display = currentHorizon === "scanner" ? "block" : "none";
      }
      // Hide filters for rockets (they don't apply)
      const filtersSection = document.querySelector(".stock-filters");
      if (filtersSection) {
        filtersSection.style.display = currentHorizon === "rockets" ? "none" : "";
      }

      var myRequestId = ++tabRequestId;

      if (currentHorizon === "rockets") {
        // Visa laddningstillstånd direkt
        var rocketSection = document.getElementById("stock-list-section");
        if (rocketSection) {
          clearChildren(rocketSection);
          var loadingCard = el("div", "card");
          loadingCard.style.cssText = "text-align:center;padding:32px";
          loadingCard.appendChild(el("p", "stock-card-sector loading-pulse", "Hämtar raketdata..."));
          rocketSection.appendChild(loadingCard);
        }
        Promise.all([fetchRockets(), fetchRocketHistory(), fetchYesterdayRockets()]).then(function() {
          if (tabRequestId !== myRequestId) return;
          renderStockList();
          if (!rocketData) {
            showErrorToast("Backend offline. Starta servern: cd server && npm start");
          }
        });
      } else if (currentHorizon === "scanner") {
        fetchScannerHits().then(function() {
          if (tabRequestId !== myRequestId) return;
          renderStockList();
          updateScannerStatus();
        });
      } else {
        renderStockList();
        restoreCachedPrices();
        if (hasApiKey("twelveData")) {
          loadQuotesForVisibleStocks().then(() => {
            loadRSIForVisibleStocks();
          });
        } else {
          loadAllQuotes();
        }
      }
    });
  });

  // Scanner run button
  const scanBtn = document.getElementById("scanner-run-btn");
  if (scanBtn) {
    scanBtn.addEventListener("click", () => triggerScan());
  }

  // Scanner tier filter
  document.querySelectorAll("[data-tier]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-tier]").forEach((b) => b.classList.remove("filter-btn-active"));
      btn.classList.add("filter-btn-active");
      scannerTier = btn.dataset.tier;
      fetchScannerHits().then(() => renderStockList());
    });
  });

  // Scanner type filter
  document.querySelectorAll("[data-scantype]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-scantype]").forEach((b) => b.classList.remove("filter-btn-active"));
      btn.classList.add("filter-btn-active");
      scannerType = btn.dataset.scantype;
      fetchScannerHits().then(() => renderStockList());
    });
  });

  // Marknad-filter
  document.querySelectorAll("[data-market]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-market]").forEach((b) => {
        b.classList.remove("filter-btn-active");
      });
      btn.classList.add("filter-btn-active");
      currentMarket = btn.dataset.market;
      renderStockList();
      restoreCachedPrices();
      if (hasApiKey("twelveData")) {
        loadQuotesForVisibleStocks().then(() => {
          loadRSIForVisibleStocks();
        });
      } else {
        loadAllQuotes();
      }
    });
  });

  // Sortering
  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentSort = sortSelect.value;
      renderStockList();
      restoreCachedPrices();
    });
  }

  // Stang detaljvy
  const closeBtn = document.getElementById("detail-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeDetailView);
  }

  // Stang med Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("stock-detail-overlay");
      if (overlay && overlay.style.display !== "none") {
        closeDetailView();
      }
    }
  });

  // Stang vid klick utanfor modal
  const overlay = document.getElementById("stock-detail-overlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeDetailView();
      }
    });
  }
}

// ── Init ────────────────────────────────────────────────────────

function init() {
  // 1. Rendera aktielistan med hardkodad data
  renderStockList();

  // 2. Setup event handlers
  setupEventHandlers();

  // 3. Visa API-status
  if (hasApiKey("twelveData")) {
    updateApiStatus("loading");
  } else {
    updateApiStatus("yahoo-loading");
  }

  // 4. Hamta kurser -- Twelve Data om nyckel finns, annars Yahoo Finance
  if (hasApiKey("twelveData")) {
    loadQuotesForVisibleStocks().then(() => {
      // 5. Hamta RSI for mini-indikatorer
      loadRSIForVisibleStocks();
    });
  } else {
    loadAllQuotes();
  }

  // 6. Starta countdown
  startCountdown();
}

// ── Exportera funktioner for testning ────────────────────────────
window.StocksApp = {
  fmtPrice: fmtPrice,
  fmtPct: fmtPct,
  fmtLarge: fmtLarge,
  generateTASignal: generateTASignal,
  calculateSupportResistance: calculateSupportResistance,
  createRiskDots: createRiskDots,
  showErrorToast: showErrorToast,
  fetchWithTimeout: fetchWithTimeout,
  el: el,
  clearChildren: clearChildren,
  hasApiKey: hasApiKey,
  formatLargeNumber: formatLargeNumber
};

// Starta applikationen
document.addEventListener("DOMContentLoaded", init);
