if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// ================================================================
// TESLA.JS -- Köp/sälj-beslutsstöd för TSLA, byggt enligt samma motor
// som index.html/script.js (ETH) men porterat till en enskild aktie.
//
// Datakällor:
//   - Yahoo Finance (kurs + 1 års historik OHLCV) för all TA, proxat via
//     servern (server/index.js: /api/yahoo/chart) -- inget officiellt API
//     och ingen nyckel behövs, men Yahoo blockerar direkta browser-anrop
//     (CORS + kräver browser-liknande User-Agent), därav proxyn.
//   - Finnhub (nyheter, valfritt, kräver egen nyckel)
// Sentiment-siffran som visas är INTE hämtad från en extern
// Fear & Greed-källa (den finns inte fritt för enskilda aktier) --
// den är en lokal teknisk proxy, se computeLocalSentiment().
// ================================================================

// ── API-nycklar ────────────────────────────────────────────────────
// Kurs/historik (Yahoo Finance) kräver ingen nyckel -- fungerar direkt.
// Registrera gratis för att även aktivera nyheter:
//   Finnhub: https://finnhub.io/register (gratis tier, 60 req/min)
const API_KEYS = {
  finnhub: "demo",
};

function hasApiKey(provider) {
  return API_KEYS[provider] && API_KEYS[provider] !== "demo" && API_KEYS[provider].length > 4;
}

const TICKER = "TSLA";
const YAHOO_CHART_URL = `/api/yahoo/chart?symbol=${TICKER}&range=1y&interval=1d`;

const REFRESH_SECONDS = 300; // 5 min -- skonsamt mot Yahoo-proxyns 5-min server-cache

const els = {
  priceUsd:        document.getElementById("price-usd"),
  change24h:       document.getElementById("change-24h"),
  prevClose:       document.getElementById("prev-close"),
  week52Range:     document.getElementById("week52-range"),
  lastUpdated:     document.getElementById("last-updated"),
  countdown:       document.getElementById("countdown"),
  priceSourceNote: document.getElementById("price-source-note"),

  sentimentGauge:  document.getElementById("sentiment-gauge"),
  sentimentLabel:  document.getElementById("sentiment-label"),
  sentimentDesc:   document.getElementById("sentiment-desc"),

  signalBadge:     document.getElementById("signal-badge"),
  signalReasons:   document.getElementById("signal-reasons"),

  sma7:            document.getElementById("sma7"),
  sma25:           document.getElementById("sma25"),
  rsi:             document.getElementById("rsi"),
  ema12:           document.getElementById("ema12"),
  ema26:           document.getElementById("ema26"),
  macdVal:         document.getElementById("macd-val"),
  bbUpper:         document.getElementById("bb-upper"),
  bbMid:           document.getElementById("bb-mid"),
  bbLower:         document.getElementById("bb-lower"),
  volumeTrend:     document.getElementById("volume-trend"),

  volume24h:       document.getElementById("volume-24h"),
  avgVolume:       document.getElementById("avg-volume"),
  week52High:      document.getElementById("week52-high"),
  week52Low:       document.getElementById("week52-low"),

  breakoutBadge:   document.getElementById("breakout-badge"),
  breakoutDesc:    document.getElementById("breakout-desc"),
  resistanceList:  document.getElementById("resistance-list"),
  supportList:     document.getElementById("support-list"),
  entryPrice:      document.getElementById("entry-price"),
  stopLoss:        document.getElementById("stop-loss"),
  takeProfit:      document.getElementById("take-profit"),
  riskReward:      document.getElementById("risk-reward"),
  ma50:            document.getElementById("ma50"),
  ma200:           document.getElementById("ma200"),
  volConfirm:      document.getElementById("vol-confirm"),

  volLevelBadge:   document.getElementById("vol-level-badge"),
  volRvolSummary:  document.getElementById("vol-rvol-summary"),
  volRvolValue:    document.getElementById("vol-rvol-value"),
  vol7dTrend:      document.getElementById("vol-7d-trend"),
  volDirection:    document.getElementById("vol-direction"),
  volInsight:      document.getElementById("vol-insight"),
  volTendency:     document.getElementById("vol-tendency"),
  volQuickBadge:   document.getElementById("vol-quick-badge"),
  volQuickValue:   document.getElementById("vol-quick-value"),
  volQuickDetail:  document.getElementById("vol-quick-detail"),
  volQuickCompare: document.getElementById("vol-quick-compare"),
  headerVolText:   document.getElementById("header-vol-text"),

  vwapValue:       document.getElementById("vwap-value"),
  vwapSignal:      document.getElementById("vwap-signal"),
  fibLevels:       document.getElementById("fib-levels"),

  newsList:        document.getElementById("news-list"),

  // Portfölj (Tesla, TSLA)
  portfolioQty:        document.getElementById("portfolio-qty"),
  portfolioInvested:   document.getElementById("portfolio-invested"),
  portfolioAvg:        document.getElementById("portfolio-avg"),
  portfolioPrice:      document.getElementById("portfolio-price"),
  portfolioValue:      document.getElementById("portfolio-value"),
  portfolioPnl:        document.getElementById("portfolio-pnl"),
  portfolioUpdated:    document.getElementById("portfolio-updated"),
  portfolioTrades:     document.getElementById("portfolio-trades"),
  portfolioTradeDate:  document.getElementById("portfolio-trade-date"),
  portfolioTradeType:  document.getElementById("portfolio-trade-type"),
  portfolioTradeQty:   document.getElementById("portfolio-trade-qty"),
  portfolioTradePrice: document.getElementById("portfolio-trade-price"),
  portfolioTradeAdd:   document.getElementById("portfolio-trade-add"),
};

// ── Formatering ─────────────────────────────────────────────────────

const fmtUsd = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

// Aktievolym = antal aktier, INTE dollar -- egen formatterare (skiljer sig
// medvetet från en ev. dollar-baserad fmtLarge för att undvika att blanda ihop
// "omsatt belopp" med "antal handlade aktier").
const fmtShares = (n) => {
  if (n == null || isNaN(n)) return "–";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}Md`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return n.toLocaleString("en-US");
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API-fel (${res.status}) vid hämtning av ${url}`);
  return res.json();
}

// ─── Portfölj: Tesla (TSLA) ────────────────────────────────────────────────
// OBS: separat localStorage-nyckel från ETH-sidan, och startar TOM -- inga
// påhittade affärer. Användaren lägger själv in sina riktiga TSLA-köp/sälj.

const PORTFOLIO_STORAGE_KEY = "tesla_portfolio_trades_v1";
const DEFAULT_PORTFOLIO_TRADES = [];

function normalizePortfolioTrade(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type === "sell" ? "sell" : "buy";
  const qty = Number(raw.qty);
  const price = Number(raw.price);
  const amount = Number(raw.amount);
  if (!raw.date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: String(raw.date).slice(0, 10),
    type,
    qty,
    price,
    amount: Number.isFinite(amount) && amount > 0 ? amount : qty * price,
    manual: Boolean(raw.manual),
  };
}

function getPortfolioTrades() {
  try {
    const raw = JSON.parse(localStorage.getItem(PORTFOLIO_STORAGE_KEY));
    if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_PORTFOLIO_TRADES.map((t) => ({ ...t }));
    const trades = raw.map(normalizePortfolioTrade).filter(Boolean);
    return trades.length ? trades : DEFAULT_PORTFOLIO_TRADES.map((t) => ({ ...t }));
  } catch {
    return DEFAULT_PORTFOLIO_TRADES.map((t) => ({ ...t }));
  }
}

function savePortfolioTrades(trades) {
  try {
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(trades));
  } catch (e) {
    console.error("Kunde inte spara portföljtransaktioner:", e);
    alert("Kunde inte spara transaktionen. Lagringsutrymmet kan vara fullt.");
  }
}

function computePortfolioMetrics(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let qty = 0;
  let costBasis = 0;
  let realizedPnl = 0;

  for (const t of sorted) {
    if (t.type === "sell") {
      const sellQty = Math.min(t.qty, qty);
      if (sellQty <= 0) continue;
      const avgCost = costBasis / qty;
      const costOfSold = avgCost * sellQty;
      const proceeds = t.amount * (sellQty / t.qty);
      realizedPnl += proceeds - costOfSold;
      costBasis -= costOfSold;
      qty -= sellQty;
    } else {
      qty += t.qty;
      costBasis += t.amount;
    }
  }

  return {
    qty,
    costBasis,
    avgPrice: qty > 0 ? costBasis / qty : 0,
    realizedPnl,
  };
}

function renderPortfolioTrades() {
  if (!els.portfolioTrades) return;
  const trades = getPortfolioTrades().slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  els.portfolioTrades.textContent = "";

  if (trades.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "portfolio-empty";
    cell.textContent = "Inga transaktioner ännu -- lägg till din första TSLA-affär ovan";
    row.appendChild(cell);
    els.portfolioTrades.appendChild(row);
    return;
  }

  for (const t of trades) {
    const isSell = t.type === "sell";
    const row = document.createElement("tr");
    row.className = isSell ? "portfolio-row-sell" : "portfolio-row-buy";
    row.setAttribute("data-testid", `portfolio-row-${t.id}`);

    const typeCell = document.createElement("td");
    typeCell.innerHTML = `<span class="portfolio-type-badge ${isSell ? "portfolio-type-sell" : "portfolio-type-buy"}">${isSell ? "Sälj" : "Köp"}</span>`;

    const amountCell = document.createElement("td");
    amountCell.textContent = `${isSell ? "+" : "−"}${fmtUsd(t.amount)}`;

    const actionCell = document.createElement("td");
    actionCell.className = "portfolio-action-cell";
    if (t.manual) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "portfolio-remove-btn";
      removeBtn.textContent = "Ta bort";
      removeBtn.dataset.id = t.id;
      removeBtn.addEventListener("click", () => removePortfolioTrade(t.id));
      actionCell.appendChild(removeBtn);
    } else {
      actionCell.textContent = "–";
    }

    row.append(
      Object.assign(document.createElement("td"), { textContent: t.date }),
      typeCell,
      Object.assign(document.createElement("td"), { textContent: t.qty.toLocaleString("sv-SE") }),
      Object.assign(document.createElement("td"), { textContent: fmtUsd(t.price) }),
      amountCell,
      actionCell,
    );
    els.portfolioTrades.appendChild(row);
  }
}

function refreshPortfolioUi(currentPrice, timestamp) {
  renderPortfolioTrades();
  updatePortfolioSummary(currentPrice, timestamp);
}

function updatePortfolioSummary(currentPrice, timestamp) {
  if (!els.portfolioQty) return;
  const metrics = computePortfolioMetrics(getPortfolioTrades());

  els.portfolioQty.textContent = metrics.qty.toLocaleString("sv-SE");
  els.portfolioInvested.textContent = metrics.qty > 0 ? fmtUsd(metrics.costBasis) : fmtUsd(0);
  els.portfolioAvg.textContent = metrics.qty > 0 ? fmtUsd(metrics.avgPrice) : "–";

  if (currentPrice == null) {
    els.portfolioPrice.textContent = "–";
    els.portfolioValue.textContent = metrics.qty > 0 ? "–" : fmtUsd(0);
    els.portfolioPnl.textContent = metrics.realizedPnl !== 0
      ? `${metrics.realizedPnl >= 0 ? "+" : ""}${fmtUsd(Math.abs(metrics.realizedPnl))} (realiserat)`
      : "–";
    return;
  }

  els.portfolioPrice.textContent = fmtUsd(currentPrice);

  if (metrics.qty > 0) {
    const value = metrics.qty * currentPrice;
    const unrealized = value - metrics.costBasis;
    const totalPnl = unrealized + metrics.realizedPnl;
    const pnlPct = metrics.costBasis > 0 ? (unrealized / metrics.costBasis) * 100 : 0;
    const up = totalPnl >= 0;

    els.portfolioValue.textContent = fmtUsd(value);
    const pnlText = metrics.realizedPnl !== 0
      ? `${up ? "+" : ""}${fmtUsd(Math.abs(totalPnl))} (${fmtPct(pnlPct)}, varav ${fmtUsd(Math.abs(metrics.realizedPnl))} realiserat)`
      : `${up ? "+" : ""}${fmtUsd(Math.abs(unrealized))} (${fmtPct(pnlPct)})`;
    els.portfolioPnl.textContent = pnlText;
    els.portfolioPnl.className = `value ${up ? "up" : "down"}`;
  } else {
    els.portfolioValue.textContent = fmtUsd(0);
    const up = metrics.realizedPnl >= 0;
    els.portfolioPnl.textContent = `${up ? "+" : ""}${fmtUsd(Math.abs(metrics.realizedPnl))} (realiserat)`;
    els.portfolioPnl.className = `value ${up ? "up" : "down"}`;
  }

  if (els.portfolioUpdated && timestamp) {
    const when = new Date(timestamp).toLocaleString("sv-SE");
    els.portfolioUpdated.textContent = `Kurs senast uppdaterad: ${when}`;
  }
}

function addPortfolioTradeFromForm() {
  const date = els.portfolioTradeDate?.value;
  const type = els.portfolioTradeType?.value === "sell" ? "sell" : "buy";
  const qty = parseFloat(String(els.portfolioTradeQty?.value || "").replace(",", "."));
  const price = parseFloat(String(els.portfolioTradePrice?.value || "").replace(",", "."));

  if (!date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
    alert("Fyll i datum, antal och kurs.");
    return;
  }

  const metrics = computePortfolioMetrics(getPortfolioTrades());
  if (type === "sell" && qty > metrics.qty) {
    alert(`Du kan max sälja ${metrics.qty.toLocaleString("sv-SE")} st (ditt nuvarande innehav).`);
    return;
  }

  const trade = normalizePortfolioTrade({
    id: `m-${Date.now()}`,
    date,
    type,
    qty,
    price,
    amount: qty * price,
    manual: true,
  });
  if (!trade) return;

  const trades = getPortfolioTrades();
  trades.push(trade);
  savePortfolioTrades(trades);

  if (els.portfolioTradeQty) els.portfolioTradeQty.value = "";
  if (els.portfolioTradePrice) els.portfolioTradePrice.value = "";
  refreshPortfolioUi(lastPortfolioPrice, lastPortfolioTimestamp);
}

function removePortfolioTrade(id) {
  if (!id || !confirm("Ta bort denna transaktion?")) return;
  const trades = getPortfolioTrades().filter((t) => t.id !== id);
  savePortfolioTrades(trades);
  refreshPortfolioUi(lastPortfolioPrice, lastPortfolioTimestamp);
}

function initPortfolioForm() {
  if (els.portfolioTradeDate) {
    els.portfolioTradeDate.value = new Date().toISOString().slice(0, 10);
  }
  els.portfolioTradeAdd?.addEventListener("click", addPortfolioTradeFromForm);
}

let lastPortfolioPrice = null;
let lastPortfolioTimestamp = null;

// ─── Volymklassificering (samma RVOL-skala som ETH-sidan) ─────────────────

let lastQuoteVolume24h = null; // "dagens" volym (aktier), föredraget från /quote (realtid) framför historikens sista stapel

// Aktiemarknaden handlas inte 24/7 som krypto -- en dagsprogress baserad på
// UTC-dygnet (som ETH-sidan använder) skulle ge fel RVOL under handelsdagen.
// Denna funktion uppskattar hur stor andel av NYSE/NASDAQ-handelsdagen
// (09:30-16:00 New York-tid) som gått, för att skala en ofullständig dagsstapel.
function getUsMarketDayProgress() {
  const now = new Date();
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    }).formatToParts(now);
  } catch {
    return 1; // Kan inte avgöra -- anta att dagens stapel är komplett (säkrast, undviker att blåsa upp RVOL)
  }
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 1;

  if (map.weekday === "Sat" || map.weekday === "Sun") return 1; // Marknaden stängd -- senaste stapeln är en avslutad session

  const minutesNow   = hour * 60 + minute;
  const marketOpen   = 9 * 60 + 30;
  const marketClose  = 16 * 60;

  if (minutesNow < marketOpen)  return 0.02; // Pre-market, ingen handel ännu idag
  if (minutesNow >= marketClose) return 1;   // Marknaden stängd för dagen -- full dagsvolym
  return Math.max((minutesNow - marketOpen) / (marketClose - marketOpen), 0.05);
}

function computeRvol20(volumes, quoteVolumeToday = lastQuoteVolume24h) {
  if (!volumes || volumes.length < 21) return null;
  const avg20 = volumes.slice(volumes.length - 21, volumes.length - 1).reduce((a, b) => a + b, 0) / 20;
  if (avg20 <= 0) return null;

  if (quoteVolumeToday != null && quoteVolumeToday > 0) {
    return quoteVolumeToday / avg20;
  }

  const todayVol = volumes[volumes.length - 1];
  const dayProgress = Math.max(getUsMarketDayProgress(), 0.05);
  return (todayVol / dayProgress) / avg20;
}

function computeVolTrend7(volumes) {
  if (!volumes || volumes.length < 8) return null;
  const todayVol = volumes[volumes.length - 1];
  const avg7 = volumes.slice(volumes.length - 8, volumes.length - 1).reduce((a, b) => a + b, 0) / 7;
  if (avg7 <= 0) return null;
  return { ratio: todayVol / avg7, pct: ((todayVol - avg7) / avg7) * 100 };
}

function classifyVolume(rvol) {
  if (rvol == null || isNaN(rvol)) {
    return {
      level: "unknown", label: "–", plainLabel: "Väntar på data", shortHint: "",
      cssClass: "vol-unknown", signalScore: 0, confirmsBreakout: false,
    };
  }
  if (rvol >= 4.0) {
    return {
      level: "extreme", label: "Extrem", plainLabel: "Extremt hög volym",
      shortHint: "Ovanligt mycket handel – något stort kan vara på gång",
      cssClass: "vol-extreme", signalScore: 0, confirmsBreakout: true,
    };
  }
  if (rvol >= 2.0) {
    return {
      level: "high", label: "Hög", plainLabel: "Hög volym",
      shortHint: "Mycket mer handel än vanligt – prisrörelsen är mer trovärdig",
      cssClass: "vol-high", signalScore: 2, confirmsBreakout: true,
    };
  }
  if (rvol >= 1.3) {
    return {
      level: "elevated", label: "Lite högre", plainLabel: "Lite högre än vanligt",
      shortHint: "Fler köp och sälj än en normal dag",
      cssClass: "vol-elevated", signalScore: 1, confirmsBreakout: rvol >= 1.5,
    };
  }
  if (rvol >= 0.7) {
    return {
      level: "normal", label: "Normal", plainLabel: "Normal volym",
      shortHint: "Ungefär som en vanlig handelsdag",
      cssClass: "vol-normal", signalScore: 0, confirmsBreakout: false,
    };
  }
  return {
    level: "low", label: "Låg", plainLabel: "Låg volym",
    shortHint: "Färre köp och sälj än vanligt – marknaden är lugn",
    cssClass: "vol-low", signalScore: -1, confirmsBreakout: false,
  };
}

function formatVolumeComparePlain(rvol) {
  if (rvol == null) return "";
  const pct = Math.round(rvol * 100);
  if (pct < 70) return `Jämfört med snittet senaste 20 handelsdagarna: bara ${pct}% – alltså lugnare än vanligt.`;
  if (pct <= 130) return `Jämfört med snittet senaste 20 handelsdagarna: ${pct}% – ungefär en normal dag.`;
  if (pct <= 200) return `Jämfört med snittet senaste 20 handelsdagarna: ${pct}% – mer aktivt än vanligt.`;
  return `Jämfört med snittet senaste 20 handelsdagarna: ${pct}% – mycket mer aktivt än vanligt.`;
}

function formatPriceDirectionPlain(changeDay) {
  if (typeof changeDay !== "number") return { text: "Okänd riktning", cssClass: "vol-normal" };
  if (changeDay > 0.5) return { text: `Priset stiger (${fmtPct(changeDay)} idag)`, cssClass: "up" };
  if (changeDay < -0.5) return { text: `Priset faller (${fmtPct(changeDay)} idag)`, cssClass: "down" };
  return { text: "Priset är stabilt (±0,5% idag)", cssClass: "vol-normal" };
}

function computeVolumeTendency(volumes) {
  if (!volumes || volumes.length < 11) return null;
  const recent5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const prev5 = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
  if (prev5 <= 0) return null;
  const changePct = ((recent5 - prev5) / prev5) * 100;
  if (changePct > 15) {
    return {
      dir: "rising", label: "Ökar", cssClass: "vol-trend-up",
      text: `Handeln ökar – ${fmtPct(changePct)} mer de senaste 5 handelsdagarna jämfört med veckan innan.`,
    };
  }
  if (changePct < -15) {
    return {
      dir: "falling", label: "Minskar", cssClass: "vol-trend-down",
      text: `Handeln minskar – ${fmtPct(changePct)} färre affärer de senaste 5 handelsdagarna jämfört med veckan innan.`,
    };
  }
  return {
    dir: "stable", label: "Stabil", cssClass: "vol-trend-stable",
    text: "Handeln ligger still – ungefär samma nivå hela veckan.",
  };
}

function getVolumeAction(cls, rvol, changeDay, tendency) {
  if (cls.level === "unknown") {
    return rvol == null
      ? "Vi visar hur mycket som handlats idag. För att säga om det är lågt eller högt behöver vi några dagars historik."
      : "Inte tillräckligt med data för att bedöma volymen.";
  }

  const priceUp = typeof changeDay === "number" && changeDay > 0.5;
  const priceDown = typeof changeDay === "number" && changeDay < -0.5;

  if (cls.level === "low") {
    if (priceUp) return "Priset går upp men få handlar. Det kan vara en svag rörelse som inte håller – vänta tills fler börjar köpa innan du agerar.";
    if (priceDown) return "Priset går ner men få handlar. Nedgången kanske inte är så allvarlig – eller så väntar marknaden. Var försiktig.";
    return "Marknaden är lugn. Inte mycket köp eller sälj just nu – inget bråttom att agera.";
  }
  if (cls.level === "normal") {
    if (tendency?.dir === "rising" && priceUp) {
      return "Normal handel idag, men fler och fler handlar varje dag och priset stiger. Ett tidigt tecken – håll koll.";
    }
    return "Vanlig handelsdag. Prisrörelser är varken extra starka eller extra svaga.";
  }
  if (cls.level === "elevated") {
    if (priceUp) return "Fler handlar än vanligt och priset stiger. Ett positivt tecken – men sätt gärna en stop-loss om du köper.";
    if (priceDown) return "Fler handlar än vanligt och priset faller. Säljare är aktiva – var försiktig med att köpa.";
    return "Fler handlar än vanligt men priset rör sig knappt. Någon stor spelare kan bygga position – avvakta.";
  }
  if (cls.level === "high") {
    if (priceUp) return "Mycket handel och stigande pris. Många tror på uppgång – en starkare signal än vid låg volym.";
    if (priceDown) return "Mycket handel och fallande pris. Många säljer – nedgången är mer trovärdig.";
    return "Mycket handel men priset står still. Marknaden är aktiv men osäker – vänta på riktning.";
  }
  if (priceUp) return "Extremt mycket handel och stigande pris. Kolla nyheter – något kan ha hänt. Kan vara start eller slut på en stor rörelse.";
  if (priceDown) return "Extremt mycket handel och fallande pris. Många paniksäljer eller tar hem vinst. Var extra försiktig med köp.";
  return "Extremt mycket handel utan tydlig riktning. Något stort pågår – vänta tills det klarnar.";
}

function formatVolHandelStatus(rvol) {
  const cls = classifyVolume(rvol);
  if (rvol == null) return { text: "Laddar…", cssClass: "vol-unknown" };
  const volPct = Math.round(rvol * 100);
  if (cls.level === "extreme" || cls.level === "high") return { text: `Ja – hög handel (${volPct}% av normalt)`, cssClass: cls.cssClass };
  if (cls.level === "elevated") return { text: `Lite högre handel (${volPct}% av normalt)`, cssClass: cls.cssClass };
  if (cls.level === "low") return { text: `Nej – låg handel (${volPct}% av normalt)`, cssClass: cls.cssClass };
  return { text: `Måttlig handel (${volPct}% av normalt)`, cssClass: cls.cssClass };
}

function renderHeaderVolStatus(rvol) {
  const status = formatVolHandelStatus(rvol);
  if (els.headerVolText) {
    els.headerVolText.textContent = status.text;
    els.headerVolText.className = `header-vol-text ${status.cssClass}`;
  }
}

function renderVolumeAnalysis(volumes, changeDay) {
  const rvol = computeRvol20(volumes);
  const cls = classifyVolume(rvol);
  const trend7 = computeVolTrend7(volumes);
  const tendency = computeVolumeTendency(volumes);
  const action = getVolumeAction(cls, rvol, changeDay, tendency);

  if (els.volLevelBadge) {
    els.volLevelBadge.textContent = cls.plainLabel;
    els.volLevelBadge.className = `vol-badge ${cls.cssClass}`;
  }
  if (els.volRvolSummary) els.volRvolSummary.textContent = cls.shortHint || formatVolumeComparePlain(rvol);
  if (els.volRvolValue) {
    els.volRvolValue.textContent = rvol != null ? formatVolumeComparePlain(rvol) : "–";
    els.volRvolValue.className = `value ${cls.cssClass}`;
  }
  if (els.vol7dTrend && trend7) {
    const pct = Math.round(trend7.ratio * 100);
    els.vol7dTrend.textContent = `Senaste veckan: ${pct}% av veckosnittet (${fmtPct(trend7.pct)} ${trend7.pct >= 0 ? "mer" : "mindre"} än snittet)`;
    els.vol7dTrend.className = `value ${trend7.pct >= 0 ? "vol-elevated" : "vol-low"}`;
  } else if (els.vol7dTrend) {
    els.vol7dTrend.textContent = "Inte tillräckligt med data";
    els.vol7dTrend.className = "value";
  }
  if (els.volDirection) {
    const dir = formatPriceDirectionPlain(changeDay);
    els.volDirection.textContent = dir.text;
    els.volDirection.className = `value ${dir.cssClass}`;
  }
  if (els.volInsight) els.volInsight.textContent = `Vad betyder det? ${action}`;
  if (els.volTendency && tendency) {
    els.volTendency.textContent = `Trend: ${tendency.text}`;
    els.volTendency.className = `vol-tendency ${tendency.cssClass}`;
  } else if (els.volTendency) {
    els.volTendency.textContent = "";
    els.volTendency.className = "vol-tendency";
  }

  renderHeaderVolStatus(rvol);
  return { rvol, cls, trend7, tendency };
}

function renderVolQuickBox(volumes, quoteVolumeToday, changeDay) {
  const rvol = computeRvol20(volumes, quoteVolumeToday);
  const cls = classifyVolume(rvol);
  const action = getVolumeAction(cls, rvol, changeDay, computeVolumeTendency(volumes));

  if (els.volQuickBadge) {
    els.volQuickBadge.textContent = cls.plainLabel;
    els.volQuickBadge.className = `vol-badge ${cls.cssClass}`;
  }
  if (els.volQuickValue) {
    if (quoteVolumeToday != null) {
      els.volQuickValue.textContent = `${fmtShares(quoteVolumeToday)} aktier`;
      els.volQuickValue.className = `vol-quick-value ${cls.cssClass}`;
    } else {
      els.volQuickValue.textContent = "–";
      els.volQuickValue.className = "vol-quick-value";
    }
  }
  if (els.volQuickCompare) {
    els.volQuickCompare.textContent = rvol != null
      ? formatVolumeComparePlain(rvol)
      : (cls.shortHint || "Räknar ut om handeln är låg, normal eller hög…");
  }
  if (els.volQuickDetail) els.volQuickDetail.textContent = action;

  renderHeaderVolStatus(rvol);
}

// ─── Tekniska indikatorfunktioner (identiska med ETH-sidans referensimpl.) ─

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function arrayMin(arr) {
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < min) min = arr[i];
  return min;
}

function arrayMax(arr) {
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  return max;
}

function rollingMa(values, period) {
  const result = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i < period - 1) {
      result[i] = null;
    } else {
      if (i >= period) sum -= values[i - period];
      result[i] = sum / period;
    }
  }
  return result;
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let val = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) val = values[i] * k + val * (1 - k);
  return val;
}

// RSI: >70 = överköpt, <30 = översåld
function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  const recent = values.slice(values.length - (period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i] - recent[i - 1];
    if (d >= 0) gains += d; else losses += Math.abs(d);
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function bollingerBands(values, period = 20) {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mid, 2), 0) / period);
  return { upper: mid + 2 * std, mid, lower: mid - 2 * std };
}

function vwap(prices, volumes) {
  if (!prices.length || prices.length !== volumes.length) return null;
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < prices.length; i++) {
    cumPV += prices[i] * volumes[i];
    cumV += volumes[i];
  }
  return cumV > 0 ? cumPV / cumV : null;
}

function fibonacciLevels(prices, lookback = 90) {
  if (prices.length < 2) return [];
  const slice = prices.slice(-Math.min(lookback, prices.length));
  const high = arrayMax(slice);
  const low = arrayMin(slice);
  const diff = high - low;
  if (diff === 0) return [];

  const ratios = [
    { ratio: 0,     label: "0% (Botten)" },
    { ratio: 0.236, label: "23.6%" },
    { ratio: 0.382, label: "38.2%" },
    { ratio: 0.5,   label: "50%" },
    { ratio: 0.618, label: "61.8%" },
    { ratio: 0.786, label: "78.6%" },
    { ratio: 1,     label: "100% (Topp)" },
  ];

  return ratios.map(({ ratio, label }) => ({ level: ratio, price: low + diff * ratio, label }));
}

// ─── Utbrottsanalys ────────────────────────────────────────────────────────

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

function clusterLevels(points, totalLen, tolerance = 0.02) {
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

function findConsolidationZones(prices, windowSize = 10, maxRange = 0.06) {
  const zones = [];
  for (let i = 0; i <= prices.length - windowSize; i++) {
    const w = prices.slice(i, i + windowSize);
    const hi = arrayMax(w);
    const lo = arrayMin(w);
    const mid = (hi + lo) / 2;
    if ((hi - lo) / mid < maxRange) zones.push({ price: mid, idx: i + Math.floor(windowSize / 2) });
  }
  return zones;
}

function findVolumeProfile(prices, volumes, numBins = 15) {
  if (!volumes || volumes.length < 10) return [];
  const lo = arrayMin(prices);
  const hi = arrayMax(prices);
  if (hi === lo) return [];
  const binSize = (hi - lo) / numBins;
  const bins = Array.from({ length: numBins }, (_, i) => ({
    price: lo + binSize * (i + 0.5), volume: 0, lastDataIdx: 0,
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
    if (b.volume <= avgVol * 1.2) continue;
    const strength = Math.round(b.volume / avgVol);
    for (let k = 0; k < strength; k++) points.push({ price: b.price, idx: b.lastDataIdx });
  }
  return points;
}

function analyzeBreakout(prices, volumes, currentPrice, ma50val, ma200val) {
  const { maxima, minima } = findLocalExtremes(prices, 3);
  const n = prices.length;

  const shortLen    = Math.min(30, prices.length);
  const shortPrices = prices.slice(-shortLen);
  const shortOffset = prices.length - shortLen;
  const shortExtremes = findLocalExtremes(shortPrices, 2);
  const shortMinima = shortExtremes.minima.map(p => ({ price: p.price, idx: p.idx + shortOffset }));
  const shortMaxima = shortExtremes.maxima.map(p => ({ price: p.price, idx: p.idx + shortOffset }));

  const microLen    = Math.min(14, prices.length);
  const microPrices = prices.slice(-microLen);
  const microOffset = prices.length - microLen;
  const microExtremes = findLocalExtremes(microPrices, 1);
  const microMinima = microExtremes.minima.map(p => ({ price: p.price, idx: p.idx + microOffset }));
  const microMaxima = microExtremes.maxima.map(p => ({ price: p.price, idx: p.idx + microOffset }));

  const recentLen    = Math.min(90, prices.length);
  const recentPrices = prices.slice(-recentLen);
  const recentVols   = volumes.slice(-recentLen);
  const idxOffset    = prices.length - recentLen;

  const consolZones = findConsolidationZones(recentPrices).map(z => ({ price: z.price, idx: z.idx + idxOffset }));
  const volProfile  = findVolumeProfile(recentPrices, recentVols).map(v => ({ price: v.price, idx: v.idx + idxOffset }));

  const allResPoints = [...maxima, ...shortMaxima, ...microMaxima, ...consolZones.filter(z => z.price > currentPrice), ...volProfile.filter(v => v.price > currentPrice)];
  const allSupPoints = [...minima, ...shortMinima, ...microMinima, ...consolZones.filter(z => z.price < currentPrice), ...volProfile.filter(v => v.price < currentPrice)];
  const allResistance = clusterLevels(allResPoints, n);
  const allSupport    = clusterLevels(allSupPoints, n);

  const resistanceLevels = allResistance
    .filter(c => c.price > currentPrice * 1.005)
    .sort((a, b) => a.price - b.price)
    .slice(0, 6);

  const rawSupport = allSupport
    .filter(c => c.price < currentPrice * 0.995)
    .sort((a, b) => b.price - a.price)
    .slice(0, 6);

  const dynamicSupport = [];
  if (ma50val  && ma50val  < currentPrice * 0.995) dynamicSupport.push({ price: ma50val,  label: "MA50",  touches: null });
  if (ma200val && ma200val < currentPrice * 0.995) dynamicSupport.push({ price: ma200val, label: "MA200", touches: null });

  const low7d = arrayMin(prices.slice(-7));
  if (low7d < currentPrice * 0.995) dynamicSupport.push({ price: low7d, label: "7d-lägsta", touches: null });
  const low20d = arrayMin(prices.slice(-20));
  if (low20d < currentPrice * 0.995) dynamicSupport.push({ price: low20d, label: "20d-lägsta", touches: null });

  const supportLevels = [
    ...rawSupport,
    ...dynamicSupport.filter(d => !rawSupport.some(s => Math.abs(s.price - d.price) / d.price < 0.02)),
  ].sort((a, b) => b.price - a.price).slice(0, 8);

  const pricesLast7 = prices.slice(-7);
  const minLast7    = arrayMin(pricesLast7);

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
    resistanceLevels, supportLevels, breakoutLevel,
    nearestResistance: nearestR,
    nearestSupport: supportLevels[0] || null,
    approachingResistance: approaching ? nearestR : null,
    volRatio, isVolumeConfirmed: volRatio >= 1.5, avgVol20, todayVol,
  };
}

function renderBreakoutAnalysis(ba, currentPrice, ma50val, ma200val) {
  if (ma50val) {
    const above = currentPrice > ma50val;
    els.ma50.textContent = `${fmtUsd(ma50val)} · Pris ${above ? "ÖVER ▲" : "UNDER ▼"}`;
    els.ma50.className = `value ${above ? "up" : "down"}`;
  } else {
    els.ma50.textContent = "Otillräcklig data";
  }
  if (ma200val) {
    const above = currentPrice > ma200val;
    els.ma200.textContent = `${fmtUsd(ma200val)} · Pris ${above ? "ÖVER ▲" : "UNDER ▼"}`;
    els.ma200.className = `value ${above ? "up" : "down"}`;
  } else {
    els.ma200.textContent = "Otillräcklig data (behöver 200d historik)";
  }

  const volStatus = formatVolHandelStatus(ba.volRatio);
  els.volConfirm.textContent = volStatus.text;
  els.volConfirm.className = `value ${volStatus.cssClass}`;
  renderHeaderVolStatus(ba.volRatio);

  const fillList = (el, levels, isResistance) => {
    el.textContent = "";
    if (!levels.length) {
      const emptyLi = document.createElement("li");
      emptyLi.style.color = "#8b91ab";
      emptyLi.textContent = "Inga tydliga nivåer";
      el.appendChild(emptyLi);
      return;
    }
    levels.forEach(lv => {
      const li   = document.createElement("li");
      const dist = isResistance
        ? ((lv.price - currentPrice) / currentPrice * 100).toFixed(1)
        : ((currentPrice - lv.price) / currentPrice * 100).toFixed(1);

      const priceSpan = document.createElement("span");
      priceSpan.textContent = fmtUsd(lv.price);
      li.appendChild(priceSpan);

      if (lv.label) {
        const distSpan = document.createElement("span");
        distSpan.className = "level-strength";
        distSpan.textContent = `${isResistance ? "+" : "-"}${dist}%`;
        li.appendChild(document.createTextNode(" "));
        li.appendChild(distSpan);
        const dynSpan = document.createElement("span");
        dynSpan.className = "level-dynamic";
        dynSpan.textContent = lv.label;
        li.appendChild(document.createTextNode(" "));
        li.appendChild(dynSpan);
      } else {
        const dots = "●".repeat(Math.min(lv.touches, 4));
        const strSpan = document.createElement("span");
        strSpan.className = "level-strength";
        strSpan.textContent = `${isResistance ? "+" : "-"}${dist}% · ${dots} (${lv.touches} kontakt${lv.touches > 1 ? "er" : ""})`;
        li.appendChild(strSpan);
      }
      el.appendChild(li);
    });
  };
  fillList(els.resistanceList, ba.resistanceLevels, true);
  fillList(els.supportList,    ba.supportLevels,    false);

  function showPlan(entryText, stop, target, entryNum) {
    els.entryPrice.textContent = entryText;
    const base = entryNum ?? currentPrice;
    if (stop != null) {
      els.stopLoss.textContent  = `${fmtUsd(stop)} (${fmtPct((stop - base) / base * 100)})`;
      els.stopLoss.className    = "value down";
    }
    if (target != null) {
      els.takeProfit.textContent = `${fmtUsd(target)} (${fmtPct((target - base) / base * 100)})`;
      els.takeProfit.className   = "value up";
      if (stop != null && base !== stop) {
        const rr = (target - base) / (base - stop);
        els.riskReward.textContent = isFinite(rr) && rr > 0 ? `1 : ${rr.toFixed(1)}` : "–";
        els.riskReward.className   = `value ${isFinite(rr) && rr >= 2 ? "up" : ""}`;
      }
    }
  }

  if (ba.breakoutLevel && ba.isVolumeConfirmed) {
    els.breakoutBadge.textContent = "UTBROTT UPPÅT ✓  Volymbekräftat";
    els.breakoutBadge.className   = "breakout-badge breakout-confirmed";
    els.breakoutDesc.textContent  =
      `Priset har stängt över motståndsnivån ${fmtUsd(ba.breakoutLevel.price)} med hög volym ` +
      `(${(ba.volRatio * 100).toFixed(0)}% av 20d-snitt). Den gamla motståndsnivån bör nu agera stöd. ` +
      `Klassisk setup för köp – placera stopp-loss strax under den brutna nivån.`;
    const stop   = ba.breakoutLevel.price * 0.98;
    const target = ba.resistanceLevels[0]?.price ?? currentPrice + (currentPrice - stop) * 2;
    showPlan(fmtUsd(currentPrice), stop, target, currentPrice);
  } else if (ba.breakoutLevel && !ba.isVolumeConfirmed) {
    els.breakoutBadge.textContent = "MÖJLIGT UTBROTT ⚠  Låg volym – risk för fakeout";
    els.breakoutBadge.className   = "breakout-badge breakout-possible";
    els.breakoutDesc.textContent  =
      `Priset är ovanför ${fmtUsd(ba.breakoutLevel.price)} men volymen är bara ` +
      `${(ba.volRatio * 100).toFixed(0)}% av 20-dagarssnittet. Invänta volymbekräftelse ` +
      `(>150% av snittet) innan du kliver in – låg volym ökar risken för falskt utbrott.`;
    const stop   = ba.breakoutLevel.price * 0.98;
    const target = ba.resistanceLevels[0]?.price ?? currentPrice + (currentPrice - stop) * 2;
    showPlan(`${fmtUsd(currentPrice)} – invänta volym`, stop, target, currentPrice);
  } else if (ba.approachingResistance) {
    const dist = ((ba.approachingResistance.price - currentPrice) / currentPrice * 100).toFixed(1);
    els.breakoutBadge.textContent = `BEVAKNING – Närmar sig motstånd  (+${dist}%)`;
    els.breakoutBadge.className   = "breakout-badge breakout-approaching";
    els.breakoutDesc.textContent  =
      `Priset är ${dist}% under motståndsnivån ${fmtUsd(ba.approachingResistance.price)} ` +
      `(${ba.approachingResistance.touches} kontakt${ba.approachingResistance.touches > 1 ? "er" : ""}). ` +
      `Invänta tydlig dagsstängning ovanför nivån med hög volym innan du agerar.`;
    const entry  = ba.approachingResistance.price * 1.01;
    const stop   = ba.approachingResistance.price * 0.98;
    const nextR  = ba.resistanceLevels[1];
    const target = nextR ? nextR.price : entry + (entry - stop) * 2;
    showPlan(`${fmtUsd(entry)} (vid bekräftat utbrott)`, stop, target, entry);
  } else {
    els.breakoutBadge.textContent = "Ingen utbrott-signal just nu";
    els.breakoutBadge.className   = "breakout-badge breakout-none";
    els.breakoutDesc.textContent  =
      "Inget tydligt utbrott identifierat. Bevaka om priset närmar sig en motståndsnivå med ökande volym.";
    const stop   = ba.nearestSupport?.price ?? null;
    const target = ba.nearestResistance?.price ?? null;
    showPlan(fmtUsd(currentPrice), stop, target, currentPrice);
  }
}

// ─── Divergens (RSI/MACD mot pris) ────────────────────────────────────────

function emaSeries(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period) return result;
  let val = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = val;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    val = values[i] * k + val * (1 - k);
    result[i] = val;
  }
  return result;
}

function rsiSeries(values, period = 14) {
  const result = new Array(values.length).fill(null);
  for (let i = period; i < values.length; i++) {
    const win = values.slice(i - period, i + 1);
    let gains = 0, losses = 0;
    for (let j = 1; j < win.length; j++) {
      const d = win[j] - win[j - 1];
      if (d >= 0) gains += d; else losses += Math.abs(d);
    }
    const avgGain = gains / period, avgLoss = losses / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function findDivergence(indicatorSeries, extremes, indicatorLabel) {
  let bearish = null;
  if (extremes.maxima.length >= 2) {
    const [a, b] = extremes.maxima.slice(-2);
    const indA = indicatorSeries[a.idx], indB = indicatorSeries[b.idx];
    if (b.price > a.price && indA != null && indB != null && indB < indA) {
      bearish = { label: indicatorLabel, fromIdx: a.idx, toIdx: b.idx, fromPrice: a.price, toPrice: b.price, fromInd: indA, toInd: indB };
    }
  }
  let bullish = null;
  if (extremes.minima.length >= 2) {
    const [a, b] = extremes.minima.slice(-2);
    const indA = indicatorSeries[a.idx], indB = indicatorSeries[b.idx];
    if (b.price < a.price && indA != null && indB != null && indB > indA) {
      bullish = { label: indicatorLabel, fromIdx: a.idx, toIdx: b.idx, fromPrice: a.price, toPrice: b.price, fromInd: indA, toInd: indB };
    }
  }
  return { bearish, bullish };
}

function computeDivergenceSignal(prices, labels, lookback = 90) {
  if (!prices || prices.length < 40) {
    return { type: "none", confidence: "low", messages: ["Otillräcklig prishistorik för divergensanalys."] };
  }

  const start = Math.max(0, prices.length - lookback);
  const priceSlice = prices.slice(start);
  const labelSlice = (labels || []).slice(start);

  const rsiSer    = rsiSeries(priceSlice, 14);
  const ema12Ser  = emaSeries(priceSlice, 12);
  const ema26Ser  = emaSeries(priceSlice, 26);
  const macdSer   = priceSlice.map((_, i) => (ema12Ser[i] != null && ema26Ser[i] != null) ? ema12Ser[i] - ema26Ser[i] : null);

  const extremes = findLocalExtremes(priceSlice, 5);
  const rsiDiv  = findDivergence(rsiSer, extremes, "RSI");
  const macdDiv = findDivergence(macdSer, extremes, "MACD");

  const fmtDate = (idx) => labelSlice[idx] || `dag ${idx}`;
  const fmtInd  = (label, v) => label === "MACD" ? fmtUsd(v) : v.toFixed(1);

  const bearishHits = [rsiDiv.bearish, macdDiv.bearish].filter(Boolean);
  const bullishHits = [rsiDiv.bullish, macdDiv.bullish].filter(Boolean);

  if (bearishHits.length > 0) {
    const messages = bearishHits.map(h =>
      `▼ ${h.label}-divergens: priset steg (${fmtUsd(h.fromPrice)} → ${fmtUsd(h.toPrice)}, ${fmtDate(h.fromIdx)} → ${fmtDate(h.toIdx)}) men ${h.label} föll (${fmtInd(h.label, h.fromInd)} → ${fmtInd(h.label, h.toInd)}) → varning för topp.`
    );
    return { type: "bearish", confidence: bearishHits.length === 2 ? "high" : "medium", messages };
  }
  if (bullishHits.length > 0) {
    const messages = bullishHits.map(h =>
      `▲ ${h.label}-divergens: priset föll (${fmtUsd(h.fromPrice)} → ${fmtUsd(h.toPrice)}, ${fmtDate(h.fromIdx)} → ${fmtDate(h.toIdx)}) men ${h.label} steg (${fmtInd(h.label, h.fromInd)} → ${fmtInd(h.label, h.toInd)}) → varning för botten.`
    );
    return { type: "bullish", confidence: bullishHits.length === 2 ? "high" : "medium", messages };
  }
  return { type: "none", confidence: "low", messages: ["Ingen RSI/MACD-divergens upptäckt i de senaste 90 handelsdagarnas svängningar just nu."] };
}

function renderDivergenceCard(div) {
  const action     = document.getElementById("divergence-action");
  const badge      = document.getElementById("divergence-badge");
  const detail     = document.getElementById("divergence-detail");
  const card       = document.getElementById("divergence-card");
  const headerPill = document.getElementById("header-divergence-pill");
  const headerText = document.getElementById("header-divergence-text");
  if (!badge || !detail) return;

  detail.textContent = "";
  div.messages.forEach(msg => {
    const li = document.createElement("li");
    li.textContent = msg;
    li.className = div.type === "bearish" ? "reason-bear" : div.type === "bullish" ? "reason-bull" : "reason-neutral";
    detail.appendChild(li);
  });

  const confLabel = div.confidence === "high" ? "Hög" : "Medel";

  if (div.type === "bearish") {
    if (action) { action.textContent = "▼ SÄLJ"; action.className = "divergence-action action-sell"; }
    badge.textContent = `Bearish divergens – möjlig topp (${confLabel} konfidensgrad)`;
    badge.className = "signal-badge signal-sell";
    if (headerText) { headerText.textContent = "▼ SÄLJ (möjlig topp)"; headerText.className = "header-vol-text down"; }
    if (card) card.classList.add("divergence-active");
    if (headerPill) headerPill.classList.add("divergence-pulse");
  } else if (div.type === "bullish") {
    if (action) { action.textContent = "▲ KÖP"; action.className = "divergence-action action-buy"; }
    badge.textContent = `Bullish divergens – möjlig botten (${confLabel} konfidensgrad)`;
    badge.className = "signal-badge signal-buy";
    if (headerText) { headerText.textContent = "▲ KÖP (möjlig botten)"; headerText.className = "header-vol-text up"; }
    if (card) card.classList.add("divergence-active");
    if (headerPill) headerPill.classList.add("divergence-pulse");
  } else {
    if (action) { action.textContent = "● BEHÅLL / AVVAKTA"; action.className = "divergence-action action-hold"; }
    badge.textContent = "Ingen divergens just nu";
    badge.className = "signal-badge signal-none";
    if (headerText) { headerText.textContent = "● Behåll"; headerText.className = "header-vol-text vol-unknown"; }
    if (card) card.classList.remove("divergence-active");
    if (headerPill) headerPill.classList.remove("divergence-pulse");
  }
}

// ─── Sentiment (LOKAL TEKNISK PROXY -- ingen extern källa) ────────────────
// Det finns inget fritt tillgängligt "Fear & Greed"-index för enskilda
// aktier motsvarande alternative.me:s kryptoindex. Istället beräknas en
// egen 0-100-proxy från data vi redan har för TSLA:
//   - RSI (14) väger 50% -- redan en 0-100-skala för köpt/sålt-nivå
//   - Bollinger-bandposition väger 30% -- var i volatilitetsbandet ligger priset
//   - Kort volatilitetsspik (10d vs 60d stdev av dagsavkastning) väger 20% --
//     en volatilitetsspik i kombination med nyligen fallande/stigande pris
//     tolkas som panik/eufori, annars neutral
// Samma contrarian-tolkning som ETH-sidan: lågt värde = rädsla (möjligt
// köpläge), högt värde = girighet (varningssignal).
function computeLocalSentiment(prices, latestRsi, bb, currentPrice) {
  if (latestRsi == null || bb == null || currentPrice == null || !prices || prices.length < 15) return null;

  const rsiComponent = Math.max(0, Math.min(100, latestRsi));

  const bbRange = bb.upper - bb.lower;
  const bbPosRaw = bbRange > 0 ? (currentPrice - bb.lower) / bbRange : 0.5;
  const bbComponent = Math.max(0, Math.min(1, bbPosRaw)) * 100;

  let volComponent = 50;
  if (prices.length >= 61) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    const stdev = (arr) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    };
    const shortVol = stdev(returns.slice(-10));
    const longVol  = stdev(returns.slice(-60));
    const volRatio = longVol > 0 ? shortVol / longVol : 1;
    const recentReturnPct = ((prices[prices.length - 1] - prices[prices.length - 11]) / prices[prices.length - 11]) * 100;

    if (volRatio > 1.3 && recentReturnPct < 0) volComponent = 10; // volatilitetsspik + fallande pris → panik
    else if (volRatio > 1.3 && recentReturnPct > 0) volComponent = 90; // volatilitetsspik + stigande pris → eufori
  }

  const raw = rsiComponent * 0.5 + bbComponent * 0.3 + volComponent * 0.2;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

function classifySentiment(value) {
  if (value <= 24) return { cls: "extreme-fear",  label: "Extrem rädsla",  hint: "Tekniska indikatorer pekar mot stark pessimism – kan historiskt vara ett köpläge (\"var girig när andra är rädda\")." };
  if (value <= 44) return { cls: "fear",           label: "Rädsla",         hint: "Tekniska indikatorer lutar åt försiktighet/pessimism." };
  if (value <= 55) return { cls: "neutral",        label: "Neutral",        hint: "Varken särskilt översålt eller överköpt just nu." };
  if (value <= 75) return { cls: "greed",          label: "Girighet",       hint: "Tekniska indikatorer är optimistiska – risk för överdrivet entusiasm." };
  return             { cls: "extreme-greed",       label: "Extrem girighet", hint: "Starkt överköpt – historiskt en varningssignal om möjlig topp." };
}

function renderSentiment(sentimentValue) {
  if (typeof sentimentValue !== "number") {
    els.sentimentGauge.textContent  = "?";
    els.sentimentGauge.className    = "sentiment-gauge sentiment-loading";
    els.sentimentLabel.textContent  = "Otillräcklig data";
    return;
  }
  const info = classifySentiment(sentimentValue);
  els.sentimentGauge.textContent  = String(sentimentValue);
  els.sentimentGauge.className    = `sentiment-gauge sentiment-${info.cls}`;
  els.sentimentLabel.textContent  = `${info.label} (${sentimentValue}/100)`;
  els.sentimentDesc.innerHTML     =
    `${info.hint} <em>Beräknad lokalt (teknisk proxy) — ej hämtad från en extern Fear &amp; Greed-källa.</em>`;
}

// ─── Köp/Sälj-signal (6 viktade faktorer) ─────────────────────────────────

function setSignal(type, label, reasons) {
  els.signalBadge.textContent = label;
  els.signalBadge.className = `signal-badge signal-${type}`;
  els.signalReasons.textContent = "";
  reasons.forEach(r => {
    const li = document.createElement("li");
    li.textContent = r.text;
    li.className = r.score > 0 ? "reason-bull" : r.score < 0 ? "reason-bear" : "reason-neutral";
    els.signalReasons.appendChild(li);
  });
}

function renderSourcesCard(latestRsi, sentimentValue, latestEma12, latestEma26, bb, currentPrice, volumes, divergence, liveQuoteOk, newsStatus) {
  const yEl = document.getElementById("src-yahoo");
  if (yEl) {
    if (liveQuoteOk) { yEl.textContent = "OK"; yEl.className = "src-badge src-positive"; }
    else              { yEl.textContent = "Delvis (ingen live-kurs)"; yEl.className = "src-badge src-mixed"; }
  }

  const sentEl = document.getElementById("src-sentiment");
  if (sentEl) {
    if (typeof sentimentValue === "number") { sentEl.textContent = `Beräknad lokalt (${sentimentValue}/100)`; sentEl.className = "src-badge src-positive"; }
    else { sentEl.textContent = "Otillräcklig data"; sentEl.className = "src-badge src-mixed"; }
  }

  const finnEl = document.getElementById("src-finnhub");
  if (finnEl) {
    if (newsStatus === "ok")        { finnEl.textContent = "OK"; finnEl.className = "src-badge src-positive"; }
    else if (newsStatus === "none") { finnEl.textContent = "Ingen nyckel/data"; finnEl.className = "src-badge src-neutral"; }
    else                            { finnEl.textContent = "Fel"; finnEl.className = "src-badge src-negative"; }
  }

  const scorecard = document.getElementById("signal-scorecard");
  scorecard.textContent = "";

  const macdVal = latestEma12 && latestEma26 ? ((latestEma12 - latestEma26) / latestEma26) * 100 : null;
  const bbPos = bb && currentPrice && (bb.upper - bb.lower) > 0 ? (currentPrice - bb.lower) / (bb.upper - bb.lower) : null;
  const rvol = computeRvol20(volumes);
  const volCls = classifyVolume(rvol);

  const items = [
    {
      label: "MACD Momentum",
      value: macdVal !== null ? `${macdVal > 0 ? "+" : ""}${macdVal.toFixed(2)}%` : "–",
      score: macdVal !== null ? (macdVal > 1.5 ? 2 : macdVal > 0.3 ? 1 : macdVal < -1.5 ? -2 : macdVal < -0.3 ? -1 : 0) : 0,
      signalText: macdVal !== null
        ? (macdVal > 1.5 ? "▲▲ Stark bullish" : macdVal > 0.3 ? "▲ Svagt bullish" : macdVal < -1.5 ? "▼▼ Stark bearish" : macdVal < -0.3 ? "▼ Svagt bearish" : "● Neutral")
        : "–",
    },
    {
      label: "RSI (Köpt/sålt-nivå)",
      value: latestRsi ? latestRsi.toFixed(1) : "–",
      score: latestRsi ? (latestRsi < 20 ? 2 : latestRsi < 35 ? 1 : latestRsi > 80 ? -2 : latestRsi > 65 ? -1 : 0) : 0,
      signalText: latestRsi
        ? (latestRsi < 20 ? "▲▲ Extremt översåld" : latestRsi < 35 ? "▲ Översåld" : latestRsi > 80 ? "▼▼ Extremt överköpt" : latestRsi > 65 ? "▼ Överköpt" : latestRsi >= 50 ? "● Svagt bullish" : "● Svagt bearish")
        : "–",
    },
    {
      label: "Bollinger Bands (20d)",
      value: bbPos !== null ? `${(bbPos * 100).toFixed(0)}% i bandet` : "–",
      score: bb && currentPrice ? (currentPrice < bb.lower ? 2 : bbPos < 0.2 ? 1 : currentPrice > bb.upper ? -2 : bbPos > 0.8 ? -1 : 0) : 0,
      signalText: bb && currentPrice
        ? (currentPrice < bb.lower ? "▲▲ Under nedre band" : bbPos < 0.2 ? "▲ Nära nedre band" : currentPrice > bb.upper ? "▼▼ Över övre band" : bbPos > 0.8 ? "▼ Nära övre band" : "● Inom band")
        : "–",
    },
    {
      label: "Sentiment (teknisk proxy)",
      value: typeof sentimentValue === "number" ? `${sentimentValue}/100` : "–",
      score: typeof sentimentValue === "number" ? (sentimentValue <= 15 ? 2 : sentimentValue <= 30 ? 1 : sentimentValue >= 85 ? -2 : sentimentValue >= 70 ? -1 : 0) : 0,
      signalText: typeof sentimentValue === "number"
        ? (sentimentValue <= 15 ? "▲▲ Extrem panik" : sentimentValue <= 30 ? "▲ Rädsla" : sentimentValue >= 85 ? "▼▼ Extrem eufori" : sentimentValue >= 70 ? "▼ Girighet" : "● Neutral")
        : "–",
    },
    {
      label: "Handelsvolym",
      value: rvol != null ? `${Math.round(rvol * 100)}% av normalt · ${volCls.plainLabel}` : "–",
      score: volCls.signalScore,
      signalText: rvol != null
        ? (volCls.level === "low" ? "● Låg – få handlar" : volCls.level === "normal" ? "● Normal dag" : volCls.level === "elevated" ? "▲ Lite mer än vanligt" : volCls.level === "high" ? "▲▲ Hög – trovärdig rörelse" : "▲▲ Extremt mycket handel")
        : "–",
    },
    {
      label: "RSI/MACD-divergens",
      value: divergence
        ? (divergence.type === "none" ? "Ingen" : divergence.type === "bearish" ? "Bearish (möjlig topp)" : "Bullish (möjlig botten)")
        : "–",
      score: divergence ? (divergence.type === "bearish" ? -2 : divergence.type === "bullish" ? 2 : 0) : 0,
      signalText: divergence
        ? (divergence.type === "bearish" ? "▼▼ Varnar för topp" : divergence.type === "bullish" ? "▲▲ Varnar för botten" : "● Ingen divergens")
        : "–",
    },
  ];

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "sc-item";
    const cls = item.score > 0 ? "sc-bull" : item.score < 0 ? "sc-bear" : "sc-neut";
    const labelSpan = document.createElement("span");
    labelSpan.className = "sc-label";
    labelSpan.textContent = item.label;
    const valueSpan = document.createElement("span");
    valueSpan.className = "sc-value";
    valueSpan.textContent = item.value;
    const signalSpan = document.createElement("span");
    signalSpan.className = `sc-signal ${cls}`;
    signalSpan.textContent = item.signalText;
    div.appendChild(labelSpan);
    div.appendChild(valueSpan);
    div.appendChild(signalSpan);
    scorecard.appendChild(div);
  });
}

function buildSignal(latestRsi, changeDay, sentimentValue, latestEma12, latestEma26, bb, currentPrice, volumes, divergence) {
  const reasons = [];
  let score = 0;
  const maxScore = 12;

  // 1) MACD-histogram — graderat efter avstånd
  if (latestEma12 !== null && latestEma26 !== null) {
    const macdLine = latestEma12 - latestEma26;
    const macdPct = (macdLine / latestEma26) * 100;
    if (macdPct > 1.5) {
      score += 2;
      reasons.push({ score: 2, text: `▲▲ MACD starkt positiv (${macdPct.toFixed(2)}%) → stark bullish momentum.` });
    } else if (macdPct > 0.3) {
      score += 1;
      reasons.push({ score: 1, text: `▲ MACD positiv (${macdPct.toFixed(2)}%) → svagt bullish momentum.` });
    } else if (macdPct < -1.5) {
      score -= 2;
      reasons.push({ score: -2, text: `▼▼ MACD starkt negativ (${macdPct.toFixed(2)}%) → stark bearish momentum.` });
    } else if (macdPct < -0.3) {
      score -= 1;
      reasons.push({ score: -1, text: `▼ MACD negativ (${macdPct.toFixed(2)}%) → svagt bearish momentum.` });
    } else {
      reasons.push({ score: 0, text: `● MACD nära noll (${macdPct.toFixed(2)}%) → inget tydligt momentum.` });
    }
  }

  // 2) RSI — graderad skala
  if (latestRsi !== null) {
    if (latestRsi < 20) {
      score += 2;
      reasons.push({ score: 2, text: `▲▲ RSI ${latestRsi.toFixed(1)} (under 20) → extremt översåld, stark köpsignal.` });
    } else if (latestRsi < 35) {
      score += 1;
      reasons.push({ score: 1, text: `▲ RSI ${latestRsi.toFixed(1)} (under 35) → översåld zon.` });
    } else if (latestRsi > 80) {
      score -= 2;
      reasons.push({ score: -2, text: `▼▼ RSI ${latestRsi.toFixed(1)} (över 80) → extremt överköpt, stark säljsignal.` });
    } else if (latestRsi > 65) {
      score -= 1;
      reasons.push({ score: -1, text: `▼ RSI ${latestRsi.toFixed(1)} (över 65) → överköpt zon.` });
    } else if (latestRsi >= 50) {
      score += 0.3;
      reasons.push({ score: 0.3, text: `● RSI ${latestRsi.toFixed(1)} → svagt bullish (över 50).` });
    } else {
      score -= 0.3;
      reasons.push({ score: -0.3, text: `● RSI ${latestRsi.toFixed(1)} → svagt bearish (under 50).` });
    }
  }

  // 3) Bollinger Bands — kontinuerlig position
  if (bb !== null && currentPrice !== null) {
    const bbRange = bb.upper - bb.lower;
    const bbPos = bbRange > 0 ? (currentPrice - bb.lower) / bbRange : 0.5;
    if (currentPrice < bb.lower) {
      score += 2;
      reasons.push({ score: 2, text: `▲▲ Pris (${fmtUsd(currentPrice)}) under Bollingers nedre band (${fmtUsd(bb.lower)}) → starkt översålt.` });
    } else if (bbPos < 0.2) {
      score += 1;
      reasons.push({ score: 1, text: `▲ Pris nära nedre Bollinger (${(bbPos * 100).toFixed(0)}%) → potentiellt översålt.` });
    } else if (currentPrice > bb.upper) {
      score -= 2;
      reasons.push({ score: -2, text: `▼▼ Pris (${fmtUsd(currentPrice)}) över Bollingers övre band (${fmtUsd(bb.upper)}) → starkt överköpt.` });
    } else if (bbPos > 0.8) {
      score -= 1;
      reasons.push({ score: -1, text: `▼ Pris nära övre Bollinger (${(bbPos * 100).toFixed(0)}%) → potentiellt överköpt.` });
    } else {
      reasons.push({ score: 0, text: `● Pris mitt i Bollingers band (${(bbPos * 100).toFixed(0)}%) → neutralt.` });
    }
  }

  // 4) Sentiment (lokal teknisk proxy) — graderad, contrarian-tolkning
  if (typeof sentimentValue === "number") {
    if (sentimentValue <= 15) {
      score += 2;
      reasons.push({ score: 2, text: `▲▲ Sentiment (teknisk proxy): Extrem panik (${sentimentValue}/100) → stark contrarian köpsignal.` });
    } else if (sentimentValue <= 30) {
      score += 1;
      reasons.push({ score: 1, text: `▲ Sentiment (teknisk proxy): Rädsla (${sentimentValue}/100) → contrarian köpsignal.` });
    } else if (sentimentValue >= 85) {
      score -= 2;
      reasons.push({ score: -2, text: `▼▼ Sentiment (teknisk proxy): Extrem eufori (${sentimentValue}/100) → stark contrarian säljsignal.` });
    } else if (sentimentValue >= 70) {
      score -= 1;
      reasons.push({ score: -1, text: `▼ Sentiment (teknisk proxy): Girighet (${sentimentValue}/100) → varningssignal.` });
    } else {
      reasons.push({ score: 0, text: `● Sentiment (teknisk proxy): ${sentimentValue}/100 → neutralt.` });
    }
  }

  // 5) Volymindikator — bekräftar rådande trend
  const baseScore = score;
  if (volumes && volumes.length >= 21) {
    const volRatio = computeRvol20(volumes);
    if (volRatio != null) {
      const volCls = classifyVolume(volRatio);
      const trendDir = typeof changeDay === "number" ? (changeDay > 0 ? 1 : changeDay < 0 ? -1 : 0) : (baseScore > 0 ? 1 : baseScore < 0 ? -1 : 0);
      if (volCls.level === "high" || volCls.level === "extreme") {
        if (trendDir !== 0) {
          const volScore = trendDir * 2;
          score += volScore;
          reasons.push({ score: volScore, text: `${volScore > 0 ? "▲▲" : "▼▼"} Mycket handel (${Math.round(volRatio * 100)}% av normalt) → ${trendDir > 0 ? "uppgången" : "nedgången"} är mer trovärdig.` });
        } else {
          reasons.push({ score: 0, text: `● Mycket handel (${Math.round(volRatio * 100)}% av normalt) men priset rör sig knappt.` });
        }
      } else if (volCls.level === "elevated") {
        if (trendDir !== 0) {
          const volScore = trendDir;
          score += volScore;
          reasons.push({ score: volScore, text: `${volScore > 0 ? "▲" : "▼"} Mer handel än vanligt (${Math.round(volRatio * 100)}%) → stödjer ${trendDir > 0 ? "uppgång" : "nedgång"}.` });
        } else {
          reasons.push({ score: 0, text: `● Mer handel än vanligt (${Math.round(volRatio * 100)}% av normalt).` });
        }
      } else if (volCls.level === "low") {
        reasons.push({ score: 0, text: `● Låg handel (${Math.round(volRatio * 100)}% av normalt) → svag signal, var försiktig.` });
      } else {
        reasons.push({ score: 0, text: `● Normal handel (${Math.round(volRatio * 100)}% av normalt).` });
      }
    }
  }

  // 6) RSI/MACD-divergens — starkaste reversal-signalen, vägs tungt
  if (divergence && divergence.type !== "none") {
    const divScore = divergence.type === "bullish" ? 2 : -2;
    score += divScore;
    reasons.push({
      score: divScore,
      text: divergence.type === "bullish"
        ? "▲▲ RSI/MACD-divergens → priset gör lägre bottnar men indikatorn gör det inte → varning för vändning uppåt."
        : "▼▼ RSI/MACD-divergens → priset gör högre toppar men indikatorn gör det inte → varning för vändning nedåt.",
    });
  }

  if (typeof changeDay === "number") {
    reasons.push({ score: 0, text: `ℹ Dagens prisförändring: ${fmtPct(changeDay)}.` });
  }
  reasons.push({ score: 0, text: "⚠ Historiska mönster är inga garantier för framtida utveckling." });

  const normalized = Math.round(Math.max(-100, Math.min(100, (score / maxScore) * 100)));
  const bullCount = reasons.filter(r => r.score > 0).length;
  const bearCount = reasons.filter(r => r.score < 0).length;

  let type, label;
  if (normalized >= 50) { type = "buy"; label = `Starkt köpläge (${normalized})`; }
  else if (normalized >= 20) { type = "buy"; label = `Köpläge (${normalized})`; }
  else if (normalized <= -50) { type = "sell"; label = `Starkt säljläge (${normalized})`; }
  else if (normalized <= -20) { type = "sell"; label = `Säljläge (${normalized})`; }
  else if (normalized > 5) { type = "hold"; label = `Svagt positivt (${normalized})`; }
  else if (normalized < -5) { type = "hold"; label = `Svagt negativt (${normalized})`; }
  else { type = "hold"; label = `Neutralt (${normalized})`; }

  const summary = `${bullCount} köp, ${bearCount} sälj`;
  setSignal(type, `${label}  ·  ${summary}`, reasons);
}

// ─── Prisgraf ──────────────────────────────────────────────────────────────

let chart = null;

function renderChart(labels, prices, supportLevels = [], resistanceLevels = []) {
  const canvas = document.getElementById("priceChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (chart) chart.destroy();

  const ma50data  = rollingMa(prices, 50);
  const ma200data = rollingMa(prices, 200);

  const annotations = {};
  resistanceLevels.slice(0, 4).forEach((r, i) => {
    const tag = r.label ?? (r.touches ? `${r.touches}x` : "R");
    annotations[`r${i}`] = {
      type: "line", yMin: r.price, yMax: r.price,
      borderColor: "rgba(255,111,97,0.7)", borderWidth: 1, borderDash: [6, 4],
      label: {
        display: true, content: `R ${fmtUsd(r.price)} (${tag})`, position: "end",
        color: "#ff6f61", backgroundColor: "rgba(15,19,32,0.88)",
        font: { size: 10, weight: "700" }, padding: { x: 5, y: 2 },
      },
    };
  });
  supportLevels.slice(0, 5).forEach((s, i) => {
    const tag = s.label ?? (s.touches ? `${s.touches}x` : "S");
    annotations[`s${i}`] = {
      type: "line", yMin: s.price, yMax: s.price,
      borderColor: "rgba(76,224,129,0.7)", borderWidth: 1, borderDash: [6, 4],
      label: {
        display: true, content: `S ${fmtUsd(s.price)} (${tag})`, position: "start",
        color: "#4ce081", backgroundColor: "rgba(15,19,32,0.88)",
        font: { size: 10, weight: "700" }, padding: { x: 5, y: 2 },
      },
    };
  });

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "TSLA-pris", data: prices, borderColor: "#6dd5ed", backgroundColor: "rgba(109,213,237,0.07)", fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2, order: 1 },
        { label: "MA50", data: ma50data, borderColor: "#f4d35e", borderDash: [5, 4], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5, order: 2 },
        { label: "MA200", data: ma200data, borderColor: "#ff6f61", borderDash: [5, 4], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5, order: 3 },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#c7cdf0", usePointStyle: true, pointStyleWidth: 18 } },
        annotation: { annotations },
      },
      scales: {
        x: { ticks: { color: "#8b91ab", maxTicksLimit: 10 }, grid: { color: "#2b3252" } },
        y: { ticks: { color: "#8b91ab" }, grid: { color: "#2b3252" } },
      },
    },
  });
}

// ─── Nyheter (Finnhub, valfritt) ───────────────────────────────────────────

function timeAgo(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "just nu";
  if (diff < 3600) return `${Math.floor(diff / 60)} min sedan`;
  if (diff < 86400) { const h = Math.floor(diff / 3600); return `${h} ${h === 1 ? "timme" : "timmar"} sedan`; }
  if (diff < 604800) { const d = Math.floor(diff / 86400); return `${d} ${d === 1 ? "dag" : "dagar"} sedan`; }
  return new Date(timestamp * 1000).toLocaleDateString("sv-SE");
}

async function loadNews() {
  if (!els.newsList) return "none";
  if (!hasApiKey("finnhub")) {
    els.newsList.textContent = "";
    const li = document.createElement("li");
    li.className = "news-loading";
    li.textContent = "Nyheter kräver en gratis Finnhub API-nyckel (se API_KEYS i tesla.js).";
    els.newsList.appendChild(li);
    return "none";
  }
  try {
    const today   = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const url = `https://finnhub.io/api/v1/company-news?symbol=${TICKER}&from=${weekAgo}&to=${today}&token=${API_KEYS.finnhub}`;
    const articles = await fetchJson(url);
    const list = Array.isArray(articles) ? articles.slice(0, 5) : [];

    els.newsList.textContent = "";
    if (list.length === 0) {
      const li = document.createElement("li");
      li.className = "news-loading";
      li.textContent = "Inga nyheter tillgängliga senaste veckan";
      els.newsList.appendChild(li);
      return "ok";
    }

    list.forEach((article, idx) => {
      const li = document.createElement("li");
      li.setAttribute("data-testid", `news-row-${idx}`);
      const link = document.createElement("a");
      link.href = article.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.className = "news-link";
      link.textContent = article.headline;

      const meta = document.createElement("div");
      meta.className = "news-meta";
      const sourceSpan = document.createElement("span");
      sourceSpan.className = "news-source";
      sourceSpan.textContent = article.source || "Okänd källa";
      const timeSpan = document.createElement("span");
      timeSpan.className = "news-time";
      timeSpan.textContent = timeAgo(article.datetime);
      meta.appendChild(sourceSpan);
      meta.appendChild(timeSpan);

      li.appendChild(link);
      li.appendChild(meta);
      els.newsList.appendChild(li);
    });
    return "ok";
  } catch (e) {
    console.error("Finnhub-fel:", e);
    els.newsList.textContent = "";
    const li = document.createElement("li");
    li.className = "news-loading";
    li.textContent = "Kunde inte hämta nyheter";
    els.newsList.appendChild(li);
    return "error";
  }
}

// ─── Datahämtning (Yahoo Finance, via server-proxy) ────────────────────────

async function fetchYahooChart() {
  const data = await fetchJson(YAHOO_CHART_URL);
  const result = data?.chart?.result?.[0];
  if (!result || !Array.isArray(result.timestamp)) throw new Error("Ingen kursdata returnerad från Yahoo Finance");
  return result;
}

function parseYahooChart(result) {
  const ts = result.timestamp;
  const quote = result.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  const rows = ts
    .map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      close: closes[i],
      volume: volumes[i],
    }))
    .filter(r => Number.isFinite(r.close));
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const meta = result.meta || {};
  return {
    prices: rows.map(r => r.close),
    volumes: rows.map(r => (Number.isFinite(r.volume) ? r.volume : 0)),
    labels: rows.map(r => r.date),
    meta: {
      price: Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : null,
      // OBS: meta.chartPreviousClose är INTE gårdagens stängning -- det är
      // stängningen dagen före det valda "range"-fönstret (t.ex. ett år
      // tillbaka vid range=1y). Använd den aldrig som dagsförändring; låt
      // anroparen falla tillbaka på näst-sista dagsstapeln i prishistoriken.
      previousClose: Number.isFinite(meta.previousClose) ? meta.previousClose : null,
      volume: Number.isFinite(meta.regularMarketVolume) ? meta.regularMarketVolume : null,
      week52High: Number.isFinite(meta.fiftyTwoWeekHigh) ? meta.fiftyTwoWeekHigh : null,
      week52Low: Number.isFinite(meta.fiftyTwoWeekLow) ? meta.fiftyTwoWeekLow : null,
    },
  };
}

async function loadData() {
  let chart = null;
  try {
    chart = await fetchYahooChart();
  } catch (err) {
    console.error("Yahoo Finance misslyckades:", err);
    els.signalBadge.textContent = "Kunde inte hämta historik – prova igen om en stund";
    els.signalBadge.className = "signal-badge signal-error";
    els.signalReasons.textContent = "";
    const li = document.createElement("li");
    li.textContent = "Yahoo Finance svarade inte med prishistorik. Detta kan bero på en tillfällig rate limit eller ett tillfälligt avbrott hos Yahoo.";
    els.signalReasons.appendChild(li);
    refreshPortfolioUi(lastPortfolioPrice, lastPortfolioTimestamp);
    return;
  }

  try {
    const { prices, volumes, labels, meta } = parseYahooChart(chart);
    if (prices.length < 40) {
      els.signalBadge.textContent = "Otillräcklig historik för analys";
      els.signalBadge.className = "signal-badge signal-error";
      return;
    }

    if (els.priceSourceNote) {
      els.priceSourceNote.textContent = meta.price == null ? "Live-kurs kunde inte hämtas – visar senaste dagsstängning istället." : "";
      els.priceSourceNote.style.display = meta.price == null ? "block" : "none";
    }

    // 1) Aktuellt pris & dagsförändring
    const currentPrice = meta.price != null ? meta.price : prices[prices.length - 1];
    let changeDay = (meta.price != null && meta.previousClose) ? ((meta.price - meta.previousClose) / meta.previousClose) * 100 : null;
    if (changeDay == null && prices.length >= 2) {
      const prev = prices[prices.length - 2];
      changeDay = prev > 0 ? ((currentPrice - prev) / prev) * 100 : 0;
    }
    changeDay = changeDay ?? 0;

    const prevCloseVal = meta.previousClose != null ? meta.previousClose : prices[prices.length - 2];

    els.priceUsd.textContent  = fmtUsd(currentPrice);
    els.change24h.textContent = fmtPct(changeDay);
    els.change24h.className   = `price-small ${changeDay >= 0 ? "up" : "down"}`;
    if (els.prevClose && Number.isFinite(prevCloseVal)) els.prevClose.textContent = fmtUsd(prevCloseVal);
    els.lastUpdated.textContent = new Date().toLocaleString("sv-SE");

    // 52-veckors intervall: föredra Yahoos fiftyTwoWeekHigh/Low, annars räkna från historiken
    let w52High = meta.week52High;
    let w52Low  = meta.week52Low;
    if (!Number.isFinite(w52High) || !Number.isFinite(w52Low)) {
      const lookback = Math.min(252, prices.length);
      const slice = prices.slice(-lookback);
      w52High = arrayMax(slice);
      w52Low  = arrayMin(slice);
    }
    if (els.week52Range) els.week52Range.textContent = `${fmtUsd(w52Low)} – ${fmtUsd(w52High)}`;
    if (els.week52High) els.week52High.textContent = fmtUsd(w52High);
    if (els.week52Low) els.week52Low.textContent = fmtUsd(w52Low);

    // Volym: föredra realtidsvolym från meta, annars sista dagsstapeln
    const quoteVolumeToday = meta.volume;
    lastQuoteVolume24h = quoteVolumeToday;
    if (els.volume24h) {
      const shownVol = quoteVolumeToday ?? volumes[volumes.length - 1];
      els.volume24h.textContent = `${fmtShares(shownVol)} aktier`;
    }
    if (els.avgVolume && volumes.length >= 21) {
      const avg20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
      els.avgVolume.textContent = `${fmtShares(avg20)} aktier`;
    }

    // 2) MA50/MA200, TA-indikatorer, breakout
    const ma50val  = sma(prices, 50);
    const ma200val = sma(prices, 200);
    const ba = analyzeBreakout(prices, volumes, currentPrice, ma50val, ma200val);
    renderChart(labels, prices, ba.supportLevels, ba.resistanceLevels);

    const latestSma7  = sma(prices, 7);
    const latestSma25 = sma(prices, 25);
    const latestRsi   = rsi(prices, 14);
    const latestEma12 = ema(prices, 12);
    const latestEma26 = ema(prices, 26);
    const bb          = bollingerBands(prices, 20);

    els.sma7.textContent  = latestSma7  != null ? fmtUsd(latestSma7)  : "Otillräcklig data";
    els.sma25.textContent = latestSma25 != null ? fmtUsd(latestSma25) : "Otillräcklig data";
    els.rsi.textContent   = latestRsi   != null ? latestRsi.toFixed(1) : "Otillräcklig data";
    els.ema12.textContent = latestEma12 != null ? fmtUsd(latestEma12) : "Otillräcklig data";
    els.ema26.textContent = latestEma26 != null ? fmtUsd(latestEma26) : "Otillräcklig data";

    if (latestEma12 && latestEma26) {
      const macdValue = latestEma12 - latestEma26;
      els.macdVal.textContent = `${macdValue >= 0 ? "+" : ""}${macdValue.toFixed(2)}`;
      els.macdVal.className   = `value ${macdValue >= 0 ? "up" : "down"}`;
    }
    if (bb) {
      els.bbUpper.textContent = fmtUsd(bb.upper);
      els.bbMid.textContent   = fmtUsd(bb.mid);
      els.bbLower.textContent = fmtUsd(bb.lower);
    }

    if (volumes.length >= 8) {
      const rvolNow = computeRvol20(volumes);
      const cls = classifyVolume(rvolNow);
      const trend7 = computeVolTrend7(volumes);
      if (trend7) {
        els.volumeTrend.textContent = `${cls.plainLabel} · ${Math.round(trend7.ratio * 100)}% av veckosnittet`;
        els.volumeTrend.className = `value ${cls.cssClass}`;
      }
    }

    renderVolumeAnalysis(volumes, changeDay);
    renderVolQuickBox(volumes, quoteVolumeToday, changeDay);

    // 3) VWAP & Fibonacci
    const latestVwap = vwap(prices, volumes);
    if (latestVwap != null) {
      els.vwapValue.textContent = fmtUsd(latestVwap);
      const vwapDiff = ((currentPrice - latestVwap) / latestVwap) * 100;
      const vwapAbove = currentPrice >= latestVwap;
      els.vwapSignal.textContent = `${vwapAbove ? "Över" : "Under"} VWAP (${fmtPct(vwapDiff)})`;
      els.vwapSignal.className = `value ${vwapAbove ? "up" : "down"}`;
    }

    const fibLevelsData = fibonacciLevels(prices, 90);
    if (fibLevelsData.length && els.fibLevels) {
      els.fibLevels.innerHTML = "";
      for (const fib of fibLevelsData) {
        const row = document.createElement("div");
        row.className = "fib-level";
        const isActive = Math.abs(currentPrice - fib.price) / fib.price < 0.03;
        const labelSpan = document.createElement("span");
        labelSpan.className = "fib-label";
        labelSpan.textContent = fib.label;
        const priceSpan = document.createElement("span");
        priceSpan.className = `fib-price${isActive ? " fib-active" : ""}`;
        priceSpan.textContent = fmtUsd(fib.price);
        row.appendChild(labelSpan);
        row.appendChild(priceSpan);
        if (isActive) row.classList.add("fib-active");
        els.fibLevels.appendChild(row);
      }
    }

    // 4) RSI/MACD-divergens (topp/botten-varning, senaste 90 handelsdagarna)
    const divergenceResult = computeDivergenceSignal(prices, labels);
    renderDivergenceCard(divergenceResult);

    // 5) Sentiment (lokal teknisk proxy)
    const sentimentValue = computeLocalSentiment(prices, latestRsi, bb, currentPrice);
    renderSentiment(sentimentValue);

    // 6) Nyheter (Finnhub, valfritt)
    const newsStatus = await loadNews();

    // 7) Källkort + signalscorecard
    renderSourcesCard(latestRsi, sentimentValue, latestEma12, latestEma26, bb, currentPrice, volumes, divergenceResult, meta.price != null, newsStatus);

    // 8) Kombinerad köp/sälj-signal (6 faktorer, graderad)
    buildSignal(latestRsi, changeDay, sentimentValue, latestEma12, latestEma26, bb, currentPrice, volumes, divergenceResult);

    // 9) Utbrottsanalys
    renderBreakoutAnalysis(ba, currentPrice, ma50val, ma200val);

    // 10) Uppdatera portföljvärde
    lastPortfolioPrice = currentPrice;
    lastPortfolioTimestamp = Date.now();
    refreshPortfolioUi(currentPrice, lastPortfolioTimestamp);

  } catch (err) {
    console.error(err);
    els.signalBadge.textContent = "Kunde inte hämta data";
    els.signalBadge.className   = "signal-badge signal-error";
    els.signalReasons.textContent = "";
    const errLi = document.createElement("li");
    errLi.textContent = `${err.message}. Prova att ladda om om en liten stund (API:erna har ibland tillfälliga rate limits).`;
    els.signalReasons.appendChild(errLi);
    refreshPortfolioUi(lastPortfolioPrice, lastPortfolioTimestamp);
  }
}

let secondsLeft = REFRESH_SECONDS;
function tickCountdown() {
  secondsLeft -= 1;
  if (secondsLeft <= 0) { secondsLeft = REFRESH_SECONDS; loadData(); }
  if (els.countdown) els.countdown.textContent = String(secondsLeft);
}

initPortfolioForm();
renderPortfolioTrades();
loadData();
setInterval(tickCountdown, 1000);
