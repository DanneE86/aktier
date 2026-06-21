/**
 * Yahoo Finance auth (crumb + cookie) – krävs sedan ~2023 för v7/v8-endpoints.
 */

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
    console.warn("[Yahoo Auth] Failed:", e.message);
  }
  return null;
}

async function yahooFetchJson(url) {
  const auth = await getYahooAuth();
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  let fetchUrl = url;
  if (auth) {
    headers.Cookie = auth.cookie;
    fetchUrl += (url.includes("?") ? "&" : "?") + "crumb=" + encodeURIComponent(auth.crumb);
  }
  const res = await fetch(fetchUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const { timestampToDateET } = require("./market-utils");

/** Stängningskurs på en specifik handelsdag (ET). */
async function fetchYahooCloseOnDate(ticker, dateStr) {
  const start = Math.floor(new Date(dateStr + "T05:00:00-05:00").getTime() / 1000) - 86400 * 14;
  const end = Math.floor(new Date(dateStr + "T23:59:59-05:00").getTime() / 1000) + 86400;
  const chartUrl =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?interval=1d&period1=${start}&period2=${end}`;
  const data = await yahooFetchJson(chartUrl);
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (timestampToDateET(timestamps[i]) === dateStr && closes[i] != null) {
      return closes[i];
    }
  }
  return null;
}

/** Hämta stängningskurser för flera tickers på samma dag. */
async function fetchYahooClosesOnDate(tickers, dateStr) {
  const unique = [...new Set(tickers.filter(Boolean))];
  const closes = {};
  await Promise.all(unique.map(async ticker => {
    try {
      const price = await fetchYahooCloseOnDate(ticker, dateStr);
      if (price != null) closes[ticker] = price;
    } catch (e) {
      console.warn(`[Yahoo Close] ${ticker} ${dateStr}:`, e.message);
    }
  }));
  return closes;
}

/** Hämta kurser för tickers – batch quote med fallback till chart per ticker. */
async function fetchYahooQuotes(tickers) {
  const unique = [...new Set(tickers.filter(Boolean))];
  if (unique.length === 0) return [];

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${unique.join(",")}`;
    const data = await yahooFetchJson(url);
    const quotes = data?.quoteResponse?.result || [];
    if (quotes.length > 0) return quotes;
  } catch (e) {
    console.warn("[Yahoo Quotes] Batch failed:", e.message);
  }

  const quotes = [];
  for (const ticker of unique) {
    try {
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
      const data = await yahooFetchJson(chartUrl);
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (price != null) {
        quotes.push({ symbol: ticker, regularMarketPrice: price });
      }
    } catch (e) {
      console.warn(`[Yahoo Quotes] Chart fallback failed for ${ticker}:`, e.message);
    }
  }
  return quotes;
}

module.exports = {
  yahooFetchJson,
  fetchYahooQuotes,
  fetchYahooCloseOnDate,
  fetchYahooClosesOnDate,
  getYahooAuth,
};
