if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Datakällor: CoinGecko (pris/historik/marknad), Binance (oberoende prisjämförelse),
// alternative.me (Crypto Fear & Greed Index), DefiLlama (TVL/staking) och Owlracle (gas).
const COINGECKO_BASE = "/api/coingecko";
const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT";
const BINANCE_24HR_URL = "https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT";
const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=365";
const FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1";
const DEFILLAMA_CHAINS_URL = "https://api.llama.fi/v2/chains";
const DEFILLAMA_YIELDS_URL = "https://yields.llama.fi/pools";
const OWLRACLE_GAS_URL = "https://api.owlracle.info/v4/eth/gas";
const COINGECKO_CORRELATION_URL = `${COINGECKO_BASE}/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,btc&include_24hr_change=true`;
const COINGECKO_GLOBAL_URL = `${COINGECKO_BASE}/global`;
const CRYPTOCOMPARE_NEWS_URL = "https://min-api.cryptocompare.com/data/v2/news/?categories=ETH&lang=EN";

const REFRESH_SECONDS = 60;

const els = {
  priceUsd:       document.getElementById("price-usd"),
  priceSek:       document.getElementById("price-sek"),
  priceBinance:   document.getElementById("price-binance"),
  change24h:      document.getElementById("change-24h"),
  lastUpdated:    document.getElementById("last-updated"),
  countdown:      document.getElementById("countdown"),
  sentimentGauge: document.getElementById("sentiment-gauge"),
  sentimentLabel: document.getElementById("sentiment-label"),
  sentimentDesc:  document.getElementById("sentiment-desc"),
  signalBadge:    document.getElementById("signal-badge"),
  signalReasons:  document.getElementById("signal-reasons"),
  sma7:           document.getElementById("sma7"),
  sma25:          document.getElementById("sma25"),
  rsi:            document.getElementById("rsi"),
  ema12:          document.getElementById("ema12"),
  ema26:          document.getElementById("ema26"),
  macdVal:        document.getElementById("macd-val"),
  bbUpper:        document.getElementById("bb-upper"),
  bbMid:          document.getElementById("bb-mid"),
  bbLower:        document.getElementById("bb-lower"),
  volumeTrend:    document.getElementById("volume-trend"),
  marketCap:      document.getElementById("market-cap"),
  volume24h:      document.getElementById("volume-24h"),
  change7d:       document.getElementById("change-7d"),
  change30d:      document.getElementById("change-30d"),
  athPrice:       document.getElementById("ath-price"),
  athDistance:    document.getElementById("ath-distance"),
  // DeFi & Staking
  defiTvl:          document.getElementById("defi-tvl"),
  defiTvlChange:    document.getElementById("defi-tvl-change"),
  stakingList:      document.getElementById("staking-list"),
  // Layer 2 Ekosystem
  l2TotalTvl:       document.getElementById("l2-total-tvl"),
  l2Bar:            document.getElementById("l2-bar"),
  l2Legend:         document.getElementById("l2-legend"),
  // Gas Tracker
  gasLoad:          document.getElementById("gas-load"),
  gasLow:           document.getElementById("gas-low"),
  gasAvg:           document.getElementById("gas-avg"),
  gasHigh:          document.getElementById("gas-high"),
  gasTransferCost:  document.getElementById("gas-transfer-cost"),
  // Utbrottsanalys
  breakoutBadge:    document.getElementById("breakout-badge"),
  breakoutDesc:     document.getElementById("breakout-desc"),
  resistanceList:   document.getElementById("resistance-list"),
  supportList:      document.getElementById("support-list"),
  entryPrice:       document.getElementById("entry-price"),
  stopLoss:         document.getElementById("stop-loss"),
  takeProfit:       document.getElementById("take-profit"),
  riskReward:       document.getElementById("risk-reward"),
  ma50:             document.getElementById("ma50"),
  ma200:            document.getElementById("ma200"),
  volConfirm:       document.getElementById("vol-confirm"),
  volLevelBadge:    document.getElementById("vol-level-badge"),
  volRvolSummary:   document.getElementById("vol-rvol-summary"),
  volRvolValue:     document.getElementById("vol-rvol-value"),
  vol7dTrend:       document.getElementById("vol-7d-trend"),
  volDirection:     document.getElementById("vol-direction"),
  volInsight:       document.getElementById("vol-insight"),
  volTendency:      document.getElementById("vol-tendency"),
  volQuickBadge:    document.getElementById("vol-quick-badge"),
  volQuickValue:    document.getElementById("vol-quick-value"),
  volQuickDetail:   document.getElementById("vol-quick-detail"),
  volQuickCompare:  document.getElementById("vol-quick-compare"),
  headerVolText:    document.getElementById("header-vol-text"),
  priceSourceNote:  document.getElementById("price-source-note"),
  // ETH vs Marknaden (Korrelation)
  ethbtcRatio:      document.getElementById("ethbtc-ratio"),
  ethbtcChange:     document.getElementById("ethbtc-change"),
  btcPrice:         document.getElementById("btc-price"),
  domBtc:           document.getElementById("dom-btc"),
  domEth:           document.getElementById("dom-eth"),
  domOther:         document.getElementById("dom-other"),
  domBtcPct:        document.getElementById("dom-btc-pct"),
  domEthPct:        document.getElementById("dom-eth-pct"),
  domOtherPct:      document.getElementById("dom-other-pct"),
  // Prisalarm
  alarmPriceInput:  document.getElementById("alarm-price-input"),
  alarmDirection:   document.getElementById("alarm-direction"),
  alarmAddBtn:      document.getElementById("alarm-add-btn"),
  alarmRsiLow:      document.getElementById("alarm-rsi-low"),
  alarmRsiHigh:     document.getElementById("alarm-rsi-high"),
  alarmCount:       document.getElementById("alarm-count"),
  alarmList:        document.getElementById("alarm-list"),
  alarmTriggered:   document.getElementById("alarm-triggered"),
  alarmTriggeredText: document.getElementById("alarm-triggered-text"),
  // Roadmap & Nyheter
  newsList:         document.getElementById("news-list"),
  // Prisprognos
  forecastContent:  document.getElementById("forecast-content"),
  // VWAP & Fibonacci
  vwapValue:        document.getElementById("vwap-value"),
  vwapSignal:       document.getElementById("vwap-signal"),
  fibLevels:        document.getElementById("fib-levels"),
  // ETH Tokenomics
  supplyCirculating:  document.getElementById("supply-circulating"),
  supplyTotal:        document.getElementById("supply-total"),
  supplyStakingRatio: document.getElementById("supply-staking-ratio"),
  supplyNetIssuance:  document.getElementById("supply-net-issuance"),
  // Staking Dashboard
  stakingTotalEth:    document.getElementById("staking-total-eth"),
  stakingRatioPct:    document.getElementById("staking-ratio-pct"),
  stakingBestApy:     document.getElementById("staking-best-apy"),
  stakingSecurity:    document.getElementById("staking-security"),
};

const fmtUsd   = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSek   = (n) => `${n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr`;
const fmtPct   = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const fmtLarge = (n) => {
  if (n == null || isNaN(n)) return "–";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}Md`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}Mn`;
  return `$${n.toLocaleString("en-US")}`;
};

// ─── Volymklassificering (enhetlig RVOL-skala) ─────────────────────────────

function computeRvol20(volumes) {
  if (!volumes || volumes.length < 21) return null;
  const todayVol = volumes[volumes.length - 1];
  const avg20 = volumes.slice(volumes.length - 21, volumes.length - 1).reduce((a, b) => a + b, 0) / 20;
  return avg20 > 0 ? todayVol / avg20 : null;
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
  if (pct < 70) return `Jämfört med snittet senaste 20 dagarna: bara ${pct}% – alltså lugnare än vanligt.`;
  if (pct <= 130) return `Jämfört med snittet senaste 20 dagarna: ${pct}% – ungefär en normal dag.`;
  if (pct <= 200) return `Jämfört med snittet senaste 20 dagarna: ${pct}% – mer aktivt än vanligt.`;
  return `Jämfört med snittet senaste 20 dagarna: ${pct}% – mycket mer aktivt än vanligt.`;
}

function formatPriceDirectionPlain(change24h) {
  if (typeof change24h !== "number") return { text: "Okänd riktning", cssClass: "vol-normal" };
  if (change24h > 0.5) return { text: `Priset stiger (${fmtPct(change24h)} senaste 24h)`, cssClass: "up" };
  if (change24h < -0.5) return { text: `Priset faller (${fmtPct(change24h)} senaste 24h)`, cssClass: "down" };
  return { text: "Priset är stabilt (±0,5% senaste 24h)", cssClass: "vol-normal" };
}

function computeVolumeTendency(volumes) {
  if (!volumes || volumes.length < 11) return null;
  const recent5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const prev5 = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
  if (prev5 <= 0) return null;
  const changePct = ((recent5 - prev5) / prev5) * 100;
  if (changePct > 15) {
    return {
      dir: "rising",
      label: "Ökar",
      cssClass: "vol-trend-up",
      text: `Handeln ökar – ${fmtPct(changePct)} mer de senaste 5 dagarna jämfört med veckan innan.`,
    };
  }
  if (changePct < -15) {
    return {
      dir: "falling",
      label: "Minskar",
      cssClass: "vol-trend-down",
      text: `Handeln minskar – ${fmtPct(changePct)} färre affärer de senaste 5 dagarna jämfört med veckan innan.`,
    };
  }
  return {
    dir: "stable",
    label: "Stabil",
    cssClass: "vol-trend-stable",
    text: "Handeln ligger still – ungefär samma nivå hela veckan.",
  };
}

function getVolumeAction(cls, rvol, change24h, tendency) {
  if (cls.level === "unknown") {
    return rvol == null
      ? "Vi visar hur mycket som handlats idag. För att säga om det är lågt eller högt behöver vi några dagars historik."
      : "Inte tillräckligt med data för att bedöma volymen.";
  }

  const priceUp = typeof change24h === "number" && change24h > 0.5;
  const priceDown = typeof change24h === "number" && change24h < -0.5;

  if (cls.level === "low") {
    if (priceUp) {
      return "Priset går upp men få handlar. Det kan vara en svag rörelse som inte håller – vänta tills fler börjar köpa innan du agerar.";
    }
    if (priceDown) {
      return "Priset går ner men få handlar. Nedgången kanske inte är så allvarlig – eller så väntar marknaden. Var försiktig.";
    }
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
  if (priceUp) {
    return "Extremt mycket handel och stigande pris. Kolla nyheter – något kan ha hänt. Kan vara start eller slut på en stor rörelse.";
  }
  if (priceDown) {
    return "Extremt mycket handel och fallande pris. Många paniksäljer eller tar hem vinst. Var extra försiktig med köp.";
  }
  return "Extremt mycket handel utan tydlig riktning. Något stort pågår – vänta tills det klarnar.";
}

function formatVolHandelStatus(rvol) {
  const cls = classifyVolume(rvol);
  if (rvol == null) {
    return { text: "Laddar…", cssClass: "vol-unknown" };
  }
  const volPct = Math.round(rvol * 100);
  if (cls.confirmsBreakout || cls.level === "high" || cls.level === "extreme") {
    return { text: `Ja – hög handel (${volPct}% av normalt)`, cssClass: cls.cssClass };
  }
  if (cls.level === "low") {
    return { text: `Nej – låg handel (${volPct}% av normalt)`, cssClass: cls.cssClass };
  }
  return { text: `Måttlig handel (${volPct}% av normalt)`, cssClass: cls.cssClass };
}

function renderHeaderVolStatus(rvol) {
  const status = formatVolHandelStatus(rvol);
  if (els.headerVolText) {
    els.headerVolText.textContent = status.text;
    els.headerVolText.className = `header-vol-text ${status.cssClass}`;
  }
}

function renderVolumeAnalysis(volumes, change24h, suffix = "d") {
  const rvol = computeRvol20(volumes);
  const cls = classifyVolume(rvol);
  const trend7 = computeVolTrend7(volumes);
  const tendency = computeVolumeTendency(volumes);
  const action = getVolumeAction(cls, rvol, change24h, tendency);

  if (els.volLevelBadge) {
    els.volLevelBadge.textContent = cls.plainLabel;
    els.volLevelBadge.className = `vol-badge ${cls.cssClass}`;
  }
  if (els.volRvolSummary) {
    els.volRvolSummary.textContent = cls.shortHint || formatVolumeComparePlain(rvol);
  }
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
    const dir = formatPriceDirectionPlain(change24h);
    els.volDirection.textContent = dir.text;
    els.volDirection.className = `value ${dir.cssClass}`;
  }
  if (els.volInsight) {
    els.volInsight.textContent = `Vad betyder det? ${action}`;
  }
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

function renderVolQuickBox(volumes, quoteVolume24h, change24h) {
  const rvol = computeRvol20(volumes);
  const cls = classifyVolume(rvol);
  const action = getVolumeAction(cls, rvol, change24h, computeVolumeTendency(volumes));

  if (els.volQuickBadge) {
    els.volQuickBadge.textContent = cls.plainLabel;
    els.volQuickBadge.className = `vol-badge ${cls.cssClass}`;
  }
  if (els.volQuickValue) {
    if (quoteVolume24h != null) {
      els.volQuickValue.textContent = fmtLarge(quoteVolume24h);
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
  if (els.volQuickDetail) {
    els.volQuickDetail.textContent = action;
  }

  renderHeaderVolStatus(rvol);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API-fel (${res.status}) vid hämtning av ${url}`);
  return res.json();
}

// ─── Tekniska indikatorfunktioner ──────────────────────────────────────────

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

// Rullande MA-serie (null för punkter med otillräcklig historik)
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

// EMA: nyare värden väger tyngre, reagerar snabbare på prisrörelser än SMA
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

// Bollinger Bands: pris relativt 20-dagars volatilitetsband (±2σ)
function bollingerBands(values, period = 20) {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mid, 2), 0) / period);
  return { upper: mid + 2 * std, mid, lower: mid - 2 * std };
}

// VWAP: volymviktat genomsnittspris
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

// Fibonacci Retracement: nyckelnivåer från senaste high/low
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

  return ratios.map(({ ratio, label }) => ({
    level: ratio,
    price: low + diff * ratio,
    label,
  }));
}

// ─── Utbrottsanalys ────────────────────────────────────────────────────────

// Hitta lokala toppar (motstånd) och bottnar (stöd) i prisserien.
// lookback = antal dagar på varje sida som måste vara lägre/högre.
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

// Gruppera nära liggande prisnivåer i kluster (samma zon inom tolerance%).
// Starka zoner = fler historiska kontakter.
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
  // Sorterar på styrka: fler kontakter + nyligare = starkare nivå
  return clusters
    .map(c => ({ ...c, score: c.touches + c.lastIdx / totalLen }))
    .sort((a, b) => b.score - a.score);
}

// Hitta konsolideringszoner – prisnivåer där priset rör sig sidleds.
// Returnerar råa { price, idx } punkter – clusterLevels gör klustringen.
function findConsolidationZones(prices, windowSize = 10, maxRange = 0.06) {
  const zones = [];
  for (let i = 0; i <= prices.length - windowSize; i++) {
    const w = prices.slice(i, i + windowSize);
    const hi = arrayMax(w);
    const lo = arrayMin(w);
    const mid = (hi + lo) / 2;
    if ((hi - lo) / mid < maxRange) {
      zones.push({ price: mid, idx: i + Math.floor(windowSize / 2) });
    }
  }
  return zones;
}

// Hitta volymprofil-nivåer – priszoner med ovanligt hög handelsvolym.
// Returnerar { price, idx } punkter viktade efter volymstyrka.
function findVolumeProfile(prices, volumes, numBins = 15) {
  if (!volumes || volumes.length < 10) return [];
  const lo = arrayMin(prices);
  const hi = arrayMax(prices);
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
    if (b.volume <= avgVol * 1.2) continue;
    const strength = Math.round(b.volume / avgVol);
    for (let k = 0; k < strength; k++) {
      points.push({ price: b.price, idx: b.lastDataIdx });
    }
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

  // Konsolideringszoner och volymprofil på senaste 90 dagar
  const recentLen    = Math.min(90, prices.length);
  const recentPrices = prices.slice(-recentLen);
  const recentVols   = volumes.slice(-recentLen);
  const idxOffset    = prices.length - recentLen;

  const consolZones = findConsolidationZones(recentPrices).map(z => ({ price: z.price, idx: z.idx + idxOffset }));
  const volProfile  = findVolumeProfile(recentPrices, recentVols).map(v => ({ price: v.price, idx: v.idx + idxOffset }));

  // Slå ihop alla källor till stöd/motstånd
  const allResPoints = [...maxima, ...shortMaxima, ...microMaxima, ...consolZones.filter(z => z.price > currentPrice), ...volProfile.filter(v => v.price > currentPrice)];
  const allSupPoints = [...minima, ...shortMinima, ...microMinima, ...consolZones.filter(z => z.price < currentPrice), ...volProfile.filter(v => v.price < currentPrice)];
  const allResistance = clusterLevels(allResPoints, n);
  const allSupport    = clusterLevels(allSupPoints, n);

  // Aktiva motståndsnivåer: sorterade närmast-först
  const resistanceLevels = allResistance
    .filter(c => c.price > currentPrice * 1.005)
    .sort((a, b) => a.price - b.price)
    .slice(0, 6);

  // Aktiva stödnivåer: sorterade närmast-först (högst pris under nuvarande)
  const rawSupport = allSupport
    .filter(c => c.price < currentPrice * 0.995)
    .sort((a, b) => b.price - a.price)
    .slice(0, 6);

  // Dynamiska stödnivåer från glidande medelvärden
  const dynamicSupport = [];
  if (ma50val  && ma50val  < currentPrice * 0.995) dynamicSupport.push({ price: ma50val,  label: "MA50",  touches: null });
  if (ma200val && ma200val < currentPrice * 0.995) dynamicSupport.push({ price: ma200val, label: "MA200", touches: null });

  const low7d = arrayMin(prices.slice(-7));
  if (low7d < currentPrice * 0.995) {
    dynamicSupport.push({ price: low7d, label: "7d-lägsta", touches: null });
  }
  const low20d = arrayMin(prices.slice(-20));
  if (low20d < currentPrice * 0.995) {
    dynamicSupport.push({ price: low20d, label: "20d-lägsta", touches: null });
  }

  const supportLevels = [
    ...rawSupport,
    ...dynamicSupport.filter(d => !rawSupport.some(s => Math.abs(s.price - d.price) / d.price < 0.02)),
  ].sort((a, b) => b.price - a.price).slice(0, 8);

  // Bruten motståndsnivå: pris har nyligen (senaste 7 dagarna) passerat uppåt
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

  // Volymanalys (20-dagars snitt)
  const vols     = volumes.slice(-21);
  const avgVol20 = vols.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  const todayVol = vols[vols.length - 1];
  const volRatio = avgVol20 > 0 ? todayVol / avgVol20 : 1;

  // Nærmar sig motstånd (inom 4%)
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
  };
}

function renderBreakoutAnalysis(ba, currentPrice, ma50val, ma200val) {
  // MA-trend
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

  // Volymbekräftelse
  const volStatus = formatVolHandelStatus(ba.volRatio);
  els.volConfirm.textContent = volStatus.text;
  els.volConfirm.className = `value ${volStatus.cssClass}`;
  renderHeaderVolStatus(ba.volRatio);

  // Motstånds- och stödlistor
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
        // Dynamisk nivå (MA50, MA200, 20d-lägsta)
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

  // Handelsstrategi
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
    // ── Bekräftat utbrott ──────────────────────────────────────────────────
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
    // ── Möjligt utbrott, låg volym ─────────────────────────────────────────
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
    // ── Nærmar sig motstånd ────────────────────────────────────────────────
    const dist = ((ba.approachingResistance.price - currentPrice) / currentPrice * 100).toFixed(1);
    els.breakoutBadge.textContent = `BEVAKNING – Nærmar sig motstånd  (+${dist}%)`;
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
    // ── Ingen signal ──────────────────────────────────────────────────────
    els.breakoutBadge.textContent = "Ingen utbrott-signal just nu";
    els.breakoutBadge.className   = "breakout-badge breakout-none";
    els.breakoutDesc.textContent  =
      "Inget tydligt utbrott identifierat. Bevaka om priset nærmar sig en motståndsnivå med ökande volym.";
    // Visar ändå referensnivåer för risk-hantering
    const stop   = ba.nearestSupport?.price ?? null;
    const target = ba.nearestResistance?.price ?? null;
    showPlan(fmtUsd(currentPrice), stop, target, currentPrice);
  }
}

// ─── Sentiment ─────────────────────────────────────────────────────────────

function classifySentiment(value) {
  if (value <= 24) return { cls: "extreme-fear",  label: "Extrem rädsla",  hint: "Marknaden är mycket pessimistisk – kan historiskt vara ett köpläge (\"var girig när andra är rädda\")." };
  if (value <= 44) return { cls: "fear",           label: "Rädsla",         hint: "Marknaden lutar åt försiktighet/pessimism." };
  if (value <= 55) return { cls: "neutral",        label: "Neutral",        hint: "Marknaden är varken särskilt rädd eller girig just nu." };
  if (value <= 75) return { cls: "greed",          label: "Girighet",       hint: "Marknaden är optimistisk – risk för överdrivet entusiasm." };
  return             { cls: "extreme-greed",       label: "Extrem girighet", hint: "Marknaden är mycket euforisk – historiskt en varningssignal om möjlig topp." };
}

// ─── Köp/Sälj-signal (5 faktorer) ─────────────────────────────────────────

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

function renderSourcesCard(latestRsi, sentimentValue, latestEma12, latestEma26, bb, currentPrice, binancePrice, volumes) {
  // ── Källstatus ──────────────────────────────────────────────────────────
  const cgSignals = [
    latestRsi ? (latestRsi < 35 ? 1 : latestRsi > 65 ? -1 : 0) : 0,
    latestEma12 && latestEma26 ? (latestEma12 > latestEma26 ? 1 : -1) : 0,
    bb && currentPrice ? (currentPrice < bb.lower ? 1 : currentPrice > bb.upper ? -1 : 0) : 0,
  ];
  const cgSum = cgSignals.reduce((a, b) => a + b, 0);
  const cgEl = document.getElementById("src-coingecko");
  if (cgSum >= 2)       { cgEl.textContent = "Positiv (fler köp)";  cgEl.className = "src-badge src-positive"; }
  else if (cgSum <= -2) { cgEl.textContent = "Negativ (fler sälj)"; cgEl.className = "src-badge src-negative"; }
  else                  { cgEl.textContent = "Blandad";             cgEl.className = "src-badge src-mixed"; }

  // Binance: positiv om pris stämmer överens med CoinGecko (ingen stor avvikelse)
  const bnEl = document.getElementById("src-binance");
  if (binancePrice && currentPrice) {
    const diff = Math.abs(binancePrice - currentPrice) / currentPrice * 100;
    if (diff < 0.3) { bnEl.textContent = `Stämmer (±${diff.toFixed(2)}%)`; bnEl.className = "src-badge src-positive"; }
    else            { bnEl.textContent = `Avviker ${diff.toFixed(2)}%`;     bnEl.className = "src-badge src-mixed"; }
  }

  // Sentiment
  const sentEl = document.getElementById("src-sentiment");
  if (typeof sentimentValue === "number") {
    if (sentimentValue <= 15)      { sentEl.textContent = `Stark positiv (${sentimentValue}/100 – Extrem panik)`; sentEl.className = "src-badge src-positive"; }
    else if (sentimentValue <= 30) { sentEl.textContent = `Positiv (${sentimentValue}/100 – Rädsla)`; sentEl.className = "src-badge src-positive"; }
    else if (sentimentValue >= 85) { sentEl.textContent = `Stark negativ (${sentimentValue}/100 – Extrem eufori)`; sentEl.className = "src-badge src-negative"; }
    else if (sentimentValue >= 70) { sentEl.textContent = `Negativ (${sentimentValue}/100 – Girighet)`; sentEl.className = "src-badge src-negative"; }
    else if (sentimentValue >= 55) { sentEl.textContent = `Neutral/negativ (${sentimentValue}/100)`; sentEl.className = "src-badge src-mixed"; }
    else                           { sentEl.textContent = `Neutral (${sentimentValue}/100)`; sentEl.className = "src-badge src-neutral"; }
  }

  // ── Signalscorecard per indikator ──────────────────────────────────────
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
      label: "Fear & Greed (Sentiment)",
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

function buildSignal(latestRsi, change24h, sentimentValue, latestEma12, latestEma26, bb, currentPrice, volumes) {
  const reasons = [];
  let score = 0;
  const maxScore = 10;

  // 1) MACD-histogram (ersätter dubblerad SMA+EMA) — graderat efter avstånd
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

  // 2) RSI — graderad skala med krypto-anpassade trösklar
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

  // 3) Bollinger Bands — kontinuerlig position istället för binär
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

  // 4) Sentiment — graderad med fler nivåer
  if (typeof sentimentValue === "number") {
    if (sentimentValue <= 15) {
      score += 2;
      reasons.push({ score: 2, text: `▲▲ Sentiment: Extrem panik (${sentimentValue}/100) → stark contrarian köpsignal.` });
    } else if (sentimentValue <= 30) {
      score += 1;
      reasons.push({ score: 1, text: `▲ Sentiment: Rädsla (${sentimentValue}/100) → contrarian köpsignal.` });
    } else if (sentimentValue >= 85) {
      score -= 2;
      reasons.push({ score: -2, text: `▼▼ Sentiment: Extrem eufori (${sentimentValue}/100) → stark contrarian säljsignal.` });
    } else if (sentimentValue >= 70) {
      score -= 1;
      reasons.push({ score: -1, text: `▼ Sentiment: Girighet (${sentimentValue}/100) → varningssignal.` });
    } else {
      reasons.push({ score: 0, text: `● Sentiment: ${sentimentValue}/100 → neutralt.` });
    }
  }

  // 5) Volymindikator — bekräftar rådande trend baserat på prisrörelse
  const baseScore = score;
  if (volumes && volumes.length >= 21) {
    const volRatio = computeRvol20(volumes);
    if (volRatio != null) {
      const volCls = classifyVolume(volRatio);
      const trendDir = typeof change24h === "number" ? (change24h > 0 ? 1 : change24h < 0 ? -1 : 0) : (baseScore > 0 ? 1 : baseScore < 0 ? -1 : 0);
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

  if (typeof change24h === "number") {
    reasons.push({ score: 0, text: `ℹ 24h prisförändring: ${fmtPct(change24h)}.` });
  }
  reasons.push({ score: 0, text: "⚠ Historiska mönster är inga garantier för framtida utveckling." });

  // Normalisera score till -100 / +100 skala
  const normalized = Math.round(Math.max(-100, Math.min(100, (score / maxScore) * 100)));
  const bullCount = reasons.filter(r => r.score > 0).length;
  const bearCount = reasons.filter(r => r.score < 0).length;
  const absNorm = Math.abs(normalized);

  let type, label;
  if (normalized >= 50) {
    type = "buy";
    label = `Starkt köpläge (${normalized})`;
  } else if (normalized >= 20) {
    type = "buy";
    label = `Köpläge (${normalized})`;
  } else if (normalized <= -50) {
    type = "sell";
    label = `Starkt säljläge (${normalized})`;
  } else if (normalized <= -20) {
    type = "sell";
    label = `Säljläge (${normalized})`;
  } else if (normalized > 5) {
    type = "hold";
    label = `Svagt positivt (${normalized})`;
  } else if (normalized < -5) {
    type = "hold";
    label = `Svagt negativt (${normalized})`;
  } else {
    type = "hold";
    label = `Neutralt (${normalized})`;
  }

  const summary = `${bullCount} köp, ${bearCount} sälj`;
  setSignal(type, `${label}  ·  ${summary}`, reasons);
}

// ─── Multi-timeframe TA ───────────────────────────────────────────────────

let rawPrices = null;
let rawVolumes = null;
let lastChange24h = 0;
let activeTimeframe = "1d";

function aggregateWeekly(prices, volumes) {
  const weeklyPrices = [];
  const weeklyVolumes = [];
  for (let i = 0; i < prices.length; i += 7) {
    const weekPrices = prices.slice(i, Math.min(i + 7, prices.length));
    const weekVols = volumes.slice(i, Math.min(i + 7, prices.length));
    weeklyPrices.push(weekPrices[weekPrices.length - 1]);
    weeklyVolumes.push(weekVols.reduce((a, b) => a + b, 0));
  }
  return { prices: weeklyPrices, volumes: weeklyVolumes };
}

function updateIndicatorsForTimeframe(tf) {
  if (!rawPrices || !rawVolumes) return;
  activeTimeframe = tf;

  let prices, volumes;
  const suffix = tf === "1w" ? "v" : "d";

  if (tf === "1w") {
    const agg = aggregateWeekly(rawPrices, rawVolumes);
    prices = agg.prices;
    volumes = agg.volumes;
  } else {
    prices = rawPrices;
    volumes = rawVolumes;
  }

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
  } else {
    els.macdVal.textContent = "Otillräcklig data";
    els.macdVal.className   = "value";
  }

  if (bb) {
    els.bbUpper.textContent = fmtUsd(bb.upper);
    els.bbMid.textContent   = fmtUsd(bb.mid);
    els.bbLower.textContent = fmtUsd(bb.lower);
  } else {
    els.bbUpper.textContent = "Otillräcklig data";
    els.bbMid.textContent   = "Otillräcklig data";
    els.bbLower.textContent = "Otillräcklig data";
  }

  if (volumes.length >= 8) {
    const trend7 = computeVolTrend7(volumes);
    if (trend7) {
      const rvol = computeRvol20(volumes);
      const cls = classifyVolume(rvol);
      els.volumeTrend.textContent = `${cls.plainLabel} · ${Math.round(trend7.ratio * 100)}% av veckosnittet`;
      els.volumeTrend.className = `value ${cls.cssClass}`;
    } else {
      els.volumeTrend.textContent = "Ingen volymdata";
      els.volumeTrend.className = "value";
    }
  } else {
    els.volumeTrend.textContent = "Otillräcklig data";
    els.volumeTrend.className = "value";
  }

  renderVolumeAnalysis(volumes, lastChange24h, suffix);

  // Uppdatera indikator-labels för vald tidsram
  const periodLabel = (n) => `${n} ${suffix === "v" ? "veckor" : "dagar"}`;
  const indicatorLabels = {
    sma7:       `SMA 7 ${periodLabel(7)}`,
    sma25:      `SMA 25 ${periodLabel(25)}`,
    rsi:        `RSI (14 ${suffix === "v" ? "veckor" : "perioder"})`,
    ema12:      `EMA 12 ${periodLabel(12)}`,
    ema26:      `EMA 26 ${periodLabel(26)}`,
    "macd-val": `MACD (EMA12 − EMA26)`,
    "bb-upper": `Bollinger Övre (20${suffix})`,
    "bb-mid":   `Bollinger Mitten (20${suffix})`,
    "bb-lower": `Bollinger Nedre (20${suffix})`,
  };

  for (const [id, text] of Object.entries(indicatorLabels)) {
    const el = document.getElementById(id);
    if (el) {
      const labelEl = el.closest(".indicator")?.querySelector(".label");
      if (labelEl) labelEl.textContent = text;
    }
  }

  // Uppdatera tab-styling
  document.querySelectorAll("#timeframe-tabs .timeframe-tab").forEach(tab => {
    if (tab.dataset.tf === tf) {
      tab.classList.add("timeframe-tab-active");
    } else {
      tab.classList.remove("timeframe-tab-active");
    }
  });
}

// Timeframe tab event listeners
document.querySelectorAll("#timeframe-tabs .timeframe-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    updateIndicatorsForTimeframe(tab.dataset.tf);
  });
});

// ─── Graf (med MA50 och MA200) ─────────────────────────────────────────────

let chart;
function renderChart(labels, prices, supportLevels = [], resistanceLevels = []) {
  const ctx = document.getElementById("priceChart").getContext("2d");
  if (chart) chart.destroy();
  // Reset forecast chart cache when fresh data arrives
  chartHistLabels = null;
  chartHistDatasets = null;

  const ma50data  = rollingMa(prices, 50);
  const ma200data = rollingMa(prices, 200);

  // Bygg horisontella annotationer för stöd- och motståndsnivåer
  const annotations = {};

  resistanceLevels.slice(0, 4).forEach((r, i) => {
    const tag = r.label ?? (r.touches ? `${r.touches}x` : "R");
    annotations[`r${i}`] = {
      type: "line",
      yMin: r.price, yMax: r.price,
      borderColor: "rgba(255,111,97,0.7)",
      borderWidth: 1,
      borderDash: [6, 4],
      label: {
        display: true,
        content: `R ${fmtUsd(r.price)} (${tag})`,
        position: "end",
        color: "#ff6f61",
        backgroundColor: "rgba(15,19,32,0.88)",
        font: { size: 10, weight: "700" },
        padding: { x: 5, y: 2 },
      },
    };
  });

  supportLevels.slice(0, 5).forEach((s, i) => {
    const tag = s.label ?? (s.touches ? `${s.touches}x` : "S");
    annotations[`s${i}`] = {
      type: "line",
      yMin: s.price, yMax: s.price,
      borderColor: "rgba(76,224,129,0.7)",
      borderWidth: 1,
      borderDash: [6, 4],
      label: {
        display: true,
        content: `S ${fmtUsd(s.price)} (${tag})`,
        position: "start",
        color: "#4ce081",
        backgroundColor: "rgba(15,19,32,0.88)",
        font: { size: 10, weight: "700" },
        padding: { x: 5, y: 2 },
      },
    };
  });

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "ETH-pris",
          data: prices,
          borderColor: "#6dd5ed",
          backgroundColor: "rgba(109,213,237,0.07)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
          order: 1,
        },
        {
          label: "MA50",
          data: ma50data,
          borderColor: "#f4d35e",
          borderDash: [5, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          order: 2,
        },
        {
          label: "MA200",
          data: ma200data,
          borderColor: "#ff6f61",
          borderDash: [5, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          order: 3,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#c7cdf0", usePointStyle: true, pointStyleWidth: 18 },
        },
        annotation: { annotations },
      },
      scales: {
        x: { ticks: { color: "#8b91ab", maxTicksLimit: 10 }, grid: { color: "#2b3252" } },
        y: { ticks: { color: "#8b91ab" }, grid: { color: "#2b3252" } },
      },
    },
  });
}

// ─── Prisprognos ──────────────────────────────────────────────────────────

const ANALYST_FORECASTS = {
  lastUpdated: "2026-07-12",
  horizons: {
    365: {
      analysts: [
        { name: "Changelly",          low: 1887, avg: 2663, high: 3385 },
        { name: "CoinCodex",          low: 1853, avg: 2565, high: 3319 },
        { name: "InvestingHaven",     low: 2200, avg: 4850, high: 7500 },
        { name: "Cryptopolitan",      low: 3101, avg: 3285, high: 3469 },
        { name: "PricePrediction.net", low: 3077, avg: 3259, high: 3442 },
      ],
      year: 2027
    },
    730: {
      analysts: [
        { name: "Changelly",          low: 2562, avg: 3341, high: 4531 },
        { name: "CoinCodex",          low: 2514, avg: 3052, high: 4079 },
        { name: "InvestingHaven",     low: 3500, avg: 5750, high: 8000 },
        { name: "Cryptopolitan",      low: 7284, avg: 7684, high: 8083 },
        { name: "PricePrediction.net", low: 7184, avg: 7578, high: 7972 },
      ],
      year: 2028
    },
    1460: {
      year: 2030,
      isRangeOutlook: true,
    }
  }
};

// Analytiker- och bankprognoser för ETH 2030 (sammanställt från offentliga källor, juli 2026).
// Spridda bedömningar — visas som intervall, inte som en enda "sanning".
const ANALYST_2030_OUTLOOK = {
  lastUpdated: "2026-07-12",
  year: 2030,
  intro:
    "Analytiker och banker är oense om ETH 2030. Tabellen visar fyra vanliga scenarier " +
    "med prisintervall i dollar — inte våra egna beräkningar.",
  scenarios: [
    {
      id: "conservative",
      label: "Konservativ",
      plainLabel: "Låg tillväxt",
      low: 2000,
      high: 3500,
      growthHint: "~5 % per år",
      sources: "Coinbase, CoinCodex, Binance m.fl.",
      plainText:
        "ETH växer långsamt, ungefär som en mogen tillgång. " +
        "Priset dubblas i bästa fall från dagens nivå.",
      cssClass: "forecast-scenario-bear",
    },
    {
      id: "moderate",
      label: "Realistisk",
      plainLabel: "Måttlig adoption",
      low: 8000,
      high: 12000,
      growthHint: "Stadig adoption",
      sources: "Vanliga analytiker och modeller",
      plainText:
        "ETH fortsätter växa i takt med ökad användning av DeFi, staking och Layer 2. " +
        "Det mest citerade mittintervallet bland analytiker.",
      cssClass: "forecast-scenario-base",
    },
    {
      id: "bullish",
      label: "Bullish",
      plainLabel: "Stark adoption",
      low: 15000,
      high: 25000,
      growthHint: "Hög efterfrågan",
      sources: "VanEck och bullish analytiker",
      plainText:
        "ETH blir en central del av det digitala finanssystemet. " +
        "Stark institutionell efterfrågan driver priset betydligt högre.",
      cssClass: "forecast-scenario-bull",
    },
    {
      id: "very_bullish",
      label: "Mycket bullish",
      plainLabel: "Extrem adoption",
      low: 22000,
      high: 40000,
      growthHint: "Reservtillgång",
      sources: "VanEck (basfall), Standard Chartered",
      plainText:
        "ETH ses som global digital reservtillgång, jämförbar med guld. " +
        "Extrema scenarier — låg sannolikhet men citeras av storbanker.",
      cssClass: "forecast-scenario-bull",
    },
  ],
};

const FORECAST_WEIGHTS = {
  7:   { A: 0.20, B: 0.25, C: 0.30, D: 0,    E: 0.25 },
  30:  { A: 0.20, B: 0.20, C: 0.25, D: 0.10, E: 0.25 },
  365: { A: 0.15, B: 0.15, C: 0.15, D: 0.40, E: 0.15 },
  730: { A: 0.10, B: 0.10, C: 0.10, D: 0.55, E: 0.15 },
};

// Horizons beyond 2 years have no real analyst-consensus data (method D), so weight
// shifts from trend-extrapolation (A/C) toward damped smoothing (B) and mean-reversion (E)
// as the horizon lengthens — the further out, the less a straight-line trend should count.
// Interpolation starts FROM the tabulated 2-year (730d) weights and eases toward a 10-year
// target, so flipping from the "2 år" to "3 år" tab fades D/A/C out smoothly instead of the
// weights snapping to an unrelated formula at the table boundary.
function getForecastWeights(daysAhead) {
  if (FORECAST_WEIGHTS[daysAhead]) return { ...FORECAST_WEIGHTS[daysAhead] };
  const start = FORECAST_WEIGHTS[730];
  // Mean-reversion (E) is capped well under "dominant" here: it anchors to a recent-history
  // average price, which pulls a multi-year forecast toward "no growth" rather than reflecting
  // a maturing asset's trend — a weak long-run anchor on its own. Regression (A) keeps a real
  // vote since, with its own confidence band and the shared plausibleMultiplier sanity clamp,
  // it's the method that actually represents "the trend continues," which is the more
  // defensible base case for a multi-year crypto forecast than reverting to last year's mean.
  const target = { A: 0.30, B: 0.20, C: 0.05, D: 0, E: 0.45 };
  const years = daysAhead / 365;
  const t = Math.max(0, Math.min(1, (years - 2) / 8)); // 0 at 2y, 1 at 10y
  const lerp = (a, b) => a + (b - a) * t;
  return {
    A: lerp(start.A, target.A),
    B: lerp(start.B, target.B),
    C: lerp(start.C, target.C),
    D: lerp(start.D, target.D),
    E: lerp(start.E, target.E),
  };
}

// Shared sanity bound used by any method that can, in principle, extrapolate without limit
// (log-linear regression, momentum compounding). Short horizons keep their tuned caps; from
// 1 year on the multiplier scales continuously with years (years=1 -> 3x, years=2 -> 5x).
function plausibleMultiplier(daysAhead) {
  if (daysAhead <= 7) return 1.3;
  if (daysAhead <= 30) return 1.8;
  const years = daysAhead / 365;
  return Math.min(25, 1 + years * 2);
}

// Yearly horizons (1-10 år) are shown as scenario ladders instead of statistical point
// forecasts: three assumed constant annual returns compounded from the live current price.
// This mirrors how long-range crypto outlooks are honestly framed — nobody can model a
// multi-year crypto price, but "what if it compounds at X%/yr" is a transparent calculation.
const SCENARIO_RATES = { bear: -0.10, base: 0.15, bull: 0.35 };

function buildAnalyst2030Forecast(currentPrice) {
  const realistic = ANALYST_2030_OUTLOOK.scenarios.find(s => s.id === "moderate");
  const conservative = ANALYST_2030_OUTLOOK.scenarios.find(s => s.id === "conservative");
  const extreme = ANALYST_2030_OUTLOOK.scenarios.find(s => s.id === "very_bullish");
  const mid = realistic ? (realistic.low + realistic.high) / 2 : 10000;
  return {
    price: mid,
    upper: extreme?.high ?? 40000,
    lower: conservative?.low ?? 2000,
    changePct: currentPrice > 0 ? ((mid - currentPrice) / currentPrice) * 100 : 0,
    isScenario: true,
    isAnalyst2030: true,
    daysAhead: 1460,
  };
}

function buildScenarioForecast(currentPrice, daysAhead) {
  if (daysAhead === 1460) return buildAnalyst2030Forecast(currentPrice);
  if (!(currentPrice > 0)) return null;
  const years = daysAhead / 365;
  const bear = currentPrice * Math.pow(1 + SCENARIO_RATES.bear, years);
  const base = currentPrice * Math.pow(1 + SCENARIO_RATES.base, years);
  const bull = currentPrice * Math.pow(1 + SCENARIO_RATES.bull, years);
  return {
    price: base,
    upper: bull,
    lower: bear,
    changePct: (base / currentPrice - 1) * 100,
    isScenario: true,
    daysAhead,
  };
}

const fmtUsdRound = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

function renderScenarioTable(container, currentPrice) {
  const startYear = new Date().getFullYear();
  const wrap = document.createElement("div");
  wrap.className = "forecast-scenario-wrap";

  const intro = document.createElement("p");
  intro.className = "forecast-scenario-intro";
  intro.textContent =
    `Utgångspunkt: ETH vid cirka ${fmtUsdRound(currentPrice)}. ` +
    "Tabellen visar tre scenarier med antagen årlig avkastning (−10 %, +15 %, +35 %).";
  wrap.appendChild(intro);

  const table = document.createElement("table");
  table.className = "forecast-scenario-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["År", "Björn (−10 %)", "Bas (+15 %)", "Tjur (+35 %)"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let year = 1; year <= 10; year++) {
    const tr = document.createElement("tr");
    const yearCell = document.createElement("td");
    yearCell.textContent = `${year} (${startYear + year})`;
    const bearCell = document.createElement("td");
    bearCell.textContent = fmtUsdRound(currentPrice * Math.pow(1 + SCENARIO_RATES.bear, year));
    bearCell.className = "forecast-scenario-bear";
    const baseCell = document.createElement("td");
    baseCell.textContent = fmtUsdRound(currentPrice * Math.pow(1 + SCENARIO_RATES.base, year));
    baseCell.className = "forecast-scenario-base";
    const bullCell = document.createElement("td");
    bullCell.textContent = fmtUsdRound(currentPrice * Math.pow(1 + SCENARIO_RATES.bull, year));
    bullCell.className = "forecast-scenario-bull";
    tr.appendChild(yearCell);
    tr.appendChild(bearCell);
    tr.appendChild(baseCell);
    tr.appendChild(bullCell);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);

  const note = document.createElement("p");
  note.className = "forecast-scenario-note";
  note.textContent =
    "Beräkningsexempel, inte prognoser. Kryptopriser rör sig sällan linjärt år för år.";
  wrap.appendChild(note);
  container.appendChild(wrap);
}

function render2030AnalystOutlook(container, currentPrice) {
  const wrap = document.createElement("div");
  wrap.className = "forecast-2030-wrap";

  const intro = document.createElement("p");
  intro.className = "forecast-2030-intro";
  intro.textContent = ANALYST_2030_OUTLOOK.intro;
  wrap.appendChild(intro);

  if (currentPrice > 0) {
    const today = document.createElement("p");
    today.className = "forecast-2030-today";
    today.textContent =
      `ETH idag: cirka ${fmtUsdRound(currentPrice)}. ` +
      "Prognoserna nedan är vad analytiker tror priset kan vara år 2030 — inte garanterat.";
    wrap.appendChild(today);
  }

  const table = document.createElement("table");
  table.className = "forecast-2030-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Scenario", "Pris 2030", "Källor", "Vad det betyder"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  ANALYST_2030_OUTLOOK.scenarios.forEach(sc => {
    const tr = document.createElement("tr");

    const labelCell = document.createElement("td");
    labelCell.className = "forecast-2030-label";
    labelCell.dataset.label = "Scenario";
    const strong = document.createElement("strong");
    strong.textContent = sc.plainLabel;
    strong.className = sc.cssClass;
    labelCell.appendChild(strong);
    const sub = document.createElement("span");
    sub.className = "forecast-2030-sublabel";
    sub.textContent = sc.growthHint;
    labelCell.appendChild(document.createElement("br"));
    labelCell.appendChild(sub);

    const rangeCell = document.createElement("td");
    rangeCell.className = sc.cssClass;
    rangeCell.dataset.label = "Pris 2030";
    rangeCell.textContent = `${fmtUsdRound(sc.low)} – ${fmtUsdRound(sc.high)}`;
    if (currentPrice > 0) {
      const multLow = (sc.low / currentPrice).toFixed(1);
      const multHigh = (sc.high / currentPrice).toFixed(1);
      const mult = document.createElement("span");
      mult.className = "forecast-2030-mult";
      mult.textContent = ` (${multLow}–${multHigh}× dagens pris)`;
      rangeCell.appendChild(mult);
    }

    const srcCell = document.createElement("td");
    srcCell.className = "forecast-2030-sources";
    srcCell.dataset.label = "Källor";
    srcCell.textContent = sc.sources;

    const textCell = document.createElement("td");
    textCell.className = "forecast-2030-plain";
    textCell.dataset.label = "Vad det betyder";
    textCell.textContent = sc.plainText;

    tr.appendChild(labelCell);
    tr.appendChild(rangeCell);
    tr.appendChild(srcCell);
    tr.appendChild(textCell);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  const realistic = ANALYST_2030_OUTLOOK.scenarios.find(s => s.id === "moderate");
  const summary = document.createElement("div");
  summary.className = "forecast-2030-summary";
  const sumStrong = document.createElement("strong");
  sumStrong.textContent = "Sammanfattning: ";
  summary.appendChild(sumStrong);
  summary.appendChild(document.createTextNode("De flesta analytiker landar mellan "));
  const sumRange = document.createElement("span");
  sumRange.className = "forecast-scenario-base";
  sumRange.textContent = `${fmtUsdRound(realistic.low)}–${fmtUsdRound(realistic.high)}`;
  summary.appendChild(sumRange);
  summary.appendChild(document.createTextNode(
    " år 2030. Extrema scenarier ($40 000+) finns men är ovanliga. " +
    "Spridningen visar hur osäkra långsiktiga kryptoprognoser är."
  ));
  wrap.appendChild(summary);

  const note = document.createElement("p");
  note.className = "forecast-scenario-note";
  note.textContent =
    "Källor: offentliga analytikerprognoser (Coinbase, CoinCodex, Binance, VanEck, Standard Chartered m.fl.). " +
    "Uppdaterad " + ANALYST_2030_OUTLOOK.lastUpdated + ". INTE finansiell rådgivning.";
  wrap.appendChild(note);
  container.appendChild(wrap);
}

function forecastLinearRegression(prices, daysAhead) {
  const n = prices.length;
  if (n < 2) return null;
  // Use log-linear regression to model percentage growth (prevents negative prices)
  const logPrices = prices.map(p => p > 0 ? Math.log(p) : null).filter(v => v !== null);
  const m = logPrices.length;
  if (m < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < m; i++) {
    sumX += i; sumY += logPrices[i];
    sumXY += i * logPrices[i]; sumXX += i * i;
  }
  const xMean = sumX / m;
  const yMean = sumY / m;
  const SSxx = sumXX - m * xMean * xMean;
  const SSxy = sumXY - m * xMean * yMean;
  if (SSxx === 0) return null;
  const slope = SSxy / SSxx;
  const intercept = yMean - slope * xMean;
  const forecastDay = m + daysAhead;
  const forecastPrice = Math.exp(intercept + slope * forecastDay);
  let ssRes = 0;
  for (let i = 0; i < m; i++) {
    const predicted = intercept + slope * i;
    ssRes += Math.pow(logPrices[i] - predicted, 2);
  }
  const residualStd = m > 2 ? Math.sqrt(ssRes / (m - 2)) : 0;
  const logMargin = residualStd * Math.sqrt(1 + 1 / m + Math.pow(forecastDay - xMean, 2) / SSxx) * 1.96;
  const rawUpper = Math.exp(Math.log(forecastPrice) + logMargin);
  const rawLower = Math.max(0, Math.exp(Math.log(forecastPrice) - logMargin));

  // Sanity clamp: a volatile short recent window can produce a slope that, compounded over
  // thousands of days, overflows to Infinity or an otherwise absurd magnitude — that would
  // silently corrupt the weighted blend since Infinity passes both the isNaN guard and the
  // "price > 0" active-method check downstream. Anchor to the last known price instead.
  const lastPrice = prices[prices.length - 1];
  if (!(lastPrice > 0) || !isFinite(forecastPrice)) {
    return isFinite(forecastPrice) ? { price: forecastPrice, upper: rawUpper, lower: rawLower } : null;
  }
  const maxMult = plausibleMultiplier(daysAhead);
  const clamp = v => Math.min(lastPrice * maxMult, Math.max(lastPrice / maxMult, v));
  return {
    price: clamp(forecastPrice),
    upper: clamp(rawUpper),
    lower: clamp(rawLower),
  };
}

function forecastHolts(prices, daysAhead) {
  const n = prices.length;
  if (n < 2) return null;
  const alpha = 0.3, beta = 0.1;
  // Dampen trend for long horizons to prevent runaway extrapolation. Multi-year horizons
  // ease the damping factor down continuously (instead of a stepped tier) so the trend
  // contribution's asymptote (sum = damping/(1-damping)) tightens smoothly from ~19 at 1y
  // to ~9 at 10y, with no visible jump between adjacent year tabs.
  let dampingFactor = 1.0;
  if (daysAhead >= 365) {
    const years = daysAhead / 365;
    const t = Math.max(0, Math.min(1, (years - 1) / 9)); // 0 at 1y, 1 at 10y
    dampingFactor = 0.95 - 0.05 * t;
  }
  const initEnd = Math.min(29, n - 1);
  let level = prices[0];
  let trend = (prices[initEnd] - prices[0]) / Math.min(30, n);
  const errors = [];
  for (let i = 1; i < n; i++) {
    const prevLevel = level;
    level = alpha * prices[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    const predicted = prevLevel + trend;
    errors.push(prices[i] - predicted);
  }
  let forecastPrice;
  if (dampingFactor < 1) {
    let dampedSum = 0;
    let dampPow = dampingFactor;
    for (let h = 0; h < daysAhead; h++) {
      dampedSum += dampPow;
      dampPow *= dampingFactor;
    }
    forecastPrice = level + trend * dampedSum;
  } else {
    forecastPrice = level + trend * daysAhead;
  }
  forecastPrice = Math.max(prices[n - 1] * 0.1, forecastPrice);
  const errorStd = errors.length > 0
    ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)
    : 0;
  const margin = errorStd * Math.sqrt(daysAhead) * 1.96;
  return {
    price: forecastPrice,
    upper: forecastPrice + margin,
    lower: Math.max(0, forecastPrice - margin),
  };
}

function forecastMomentum(prices, currentPrice, indicators, daysAhead) {
  const n = prices.length;
  if (n < 7) return null;

  // Trend score (-5 to +5)
  let trendScore = 0;
  if (indicators.sma7 != null && indicators.sma25 != null) {
    trendScore += indicators.sma7 > indicators.sma25 ? 1 : -1;
  }
  if (indicators.ema12 != null && indicators.ema26 != null) {
    trendScore += indicators.ema12 > indicators.ema26 ? 1 : -1;
  }
  if (indicators.ma50 != null) {
    trendScore += currentPrice > indicators.ma50 ? 1 : -1;
  }
  if (indicators.ma200 != null) {
    trendScore += currentPrice > indicators.ma200 ? 1 : -1;
  }
  if (indicators.rsi != null) {
    if (indicators.rsi < 30) trendScore += 1;
    else if (indicators.rsi > 70) trendScore -= 1;
  }

  const trendMultiplier = trendScore / 5;

  // Base daily return depends on horizon
  let baseDailyReturn;
  if (daysAhead <= 7 && n >= 7 && prices[n - 7] > 0) {
    baseDailyReturn = (prices[n - 1] / prices[n - 7] - 1) / 7;
  } else if (daysAhead <= 30 && n >= 30 && prices[n - 30] > 0) {
    baseDailyReturn = (prices[n - 1] / prices[n - 30] - 1) / 30;
  } else if (n >= 90 && prices[n - 90] > 0) {
    baseDailyReturn = (prices[n - 1] / prices[n - 90] - 1) / 90;
  } else if (prices[0] > 0) {
    baseDailyReturn = (prices[n - 1] / prices[0] - 1) / n;
  } else {
    baseDailyReturn = 0;
  }

  // Adjustment factor by horizon (known short horizons keep their tuned values). Momentum/trend
  // signals are inherently short-lived — a trend read from today's MA/RSI snapshot says
  // nothing reliable about 5-10 years out, so past 2 years the factor decays back down
  // instead of climbing, so a stale technical read doesn't get amplified the further out it's
  // extrapolated.
  const adjustFactors = { 7: 0.2, 30: 0.3, 365: 0.4, 730: 0.5 };
  const adjustFactor = adjustFactors[daysAhead] != null
    ? adjustFactors[daysAhead]
    : Math.max(0.15, 0.5 - ((daysAhead - 730) / 2920) * 0.35);
  const adjustedDaily = baseDailyReturn * (1 + trendMultiplier * adjustFactor);
  let forecastPrice = currentPrice * Math.pow(1 + adjustedDaily, daysAhead);

  // Clamp: 1 week max 1.3x, 1 month max 1.8x. From 1 year on, the max/min multiplier
  // scales continuously with years (years=1 -> 3x, years=2 -> 5x, matching the previous
  // fixed 1y/2y caps), with a symmetric downside floor to stop momentum blowing up to
  // near-zero over a decade of compounded negative daily returns.
  if (daysAhead <= 7) {
    forecastPrice = Math.min(forecastPrice, currentPrice * 1.3);
    forecastPrice = Math.max(forecastPrice, currentPrice * 0.7);
  } else if (daysAhead <= 30) {
    forecastPrice = Math.min(forecastPrice, currentPrice * 1.8);
    forecastPrice = Math.max(forecastPrice, currentPrice * 0.3);
  } else {
    const maxMult = plausibleMultiplier(daysAhead);
    forecastPrice = Math.min(forecastPrice, currentPrice * maxMult);
    forecastPrice = Math.max(forecastPrice, currentPrice / maxMult);
  }
  forecastPrice = Math.max(0, forecastPrice);

  // Volatility-based confidence bands
  const returns = [];
  for (let i = 1; i < n; i++) {
    if (prices[i - 1] > 0) returns.push(prices[i] / prices[i - 1] - 1);
  }
  const dailyVol = returns.length > 0
    ? Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length)
    : 0;
  const margin = currentPrice * dailyVol * Math.sqrt(daysAhead) * 1.96;

  return {
    price: forecastPrice,
    upper: forecastPrice + margin,
    lower: Math.max(0, forecastPrice - margin),
  };
}

function forecastMeanReversion(prices, currentPrice, daysAhead) {
  const n = prices.length;
  if (n < 30) return null;
  // For multi-year horizons, anchor the reversion target to as much price history as is
  // available. Note: the app currently fetches only ~365 days of history (see loadData's
  // market_chart?days=365 call), so in practice this reduces to the same 1-year window used
  // for shorter horizons — a genuinely longer "long-run mean" would require fetching more
  // history. This is a known limitation, not a multi-year average, despite reaching for `n`.
  const lookback = Math.min(n, daysAhead <= 30 ? 90 : daysAhead <= 730 ? 365 : n);
  const recent = prices.slice(-lookback).filter(p => p > 0);
  if (recent.length < 20) return null;
  const geoMean = Math.exp(recent.reduce((s, p) => s + Math.log(p), 0) / recent.length);
  const halfLife = daysAhead <= 7 ? 14 : daysAhead <= 30 ? 30 : daysAhead <= 365 ? 120
    : daysAhead <= 730 ? 200 : 200 * Math.sqrt(daysAhead / 730);
  const reversionSpeed = 1 - Math.exp(-daysAhead / halfLife);
  const forecastPrice = currentPrice + (geoMean - currentPrice) * reversionSpeed;
  const returns = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push(recent[i] / recent[i - 1] - 1);
  }
  const dailyVol = returns.length > 0
    ? Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length)
    : 0;
  const margin = currentPrice * dailyVol * Math.sqrt(daysAhead) * 1.2;
  return {
    price: Math.max(currentPrice * 0.1, forecastPrice),
    upper: forecastPrice + margin,
    lower: Math.max(0, forecastPrice - margin),
  };
}

function forecastConsensus(daysAhead) {
  const horizonData = ANALYST_FORECASTS.horizons[daysAhead];
  if (!horizonData) return null;
  const analysts = horizonData.analysts;
  if (!analysts || analysts.length === 0) return null;
  const avgPrice = analysts.reduce((s, a) => s + a.avg, 0) / analysts.length;
  const low = arrayMin(analysts.map(a => a.low));
  const high = arrayMax(analysts.map(a => a.high));
  return {
    price: avgPrice,
    upper: high,
    lower: Math.max(0, low),
    analysts: analysts,
    year: horizonData.year,
  };
}

// Horizons: 1 week, 1 month, then every year out to 10 years.
const FORECAST_HORIZONS = [7, 30, 365, 730, 1095, 1460, 1825, 2190, 2555, 2920, 3285, 3650];

function calculateForecasts(prices, currentPrice, indicators) {
  const horizons = FORECAST_HORIZONS;
  const results = {};

  for (const daysAhead of horizons) {
    // 3–10 år: scenario-ränta (björn/bas/tjur) sammansatt från live-priset — se SCENARIO_RATES.
    // 1–2 år behåller modellblandning + analytikerkonsensus. Vecka/månad oförändrat.
    if (daysAhead >= 1095) {
      const sc = buildScenarioForecast(currentPrice, daysAhead);
      if (sc) sc.consensus = forecastConsensus(daysAhead);
      results[daysAhead] = sc;
      continue;
    }

    const weights = getForecastWeights(daysAhead);
    const methods = {};

    // Method A: Linear regression
    methods.A = forecastLinearRegression(prices, daysAhead);

    // Method B: Holt's exponential smoothing
    methods.B = forecastHolts(prices, daysAhead);

    // Method C: MA-momentum
    methods.C = forecastMomentum(prices, currentPrice, indicators, daysAhead);

    // Method D: Consensus (only for 365d and 730d effectively)
    methods.D = forecastConsensus(daysAhead);

    // Method E: Mean-reversion
    methods.E = forecastMeanReversion(prices, currentPrice, daysAhead);

    // Method D (analyst consensus) is a fixed snapshot (see ANALYST_FORECASTS.lastUpdated)
    // that can grow stale as the actual price moves — if it disagrees wildly with the
    // trend/statistical methods, it would otherwise single-handedly drag the 1-2yr forecast
    // far from what the other four methods agree on, which then also causes a jarring cliff
    // once D disappears entirely beyond 2 years (no consensus data exists past that). Damp
    // D's weight smoothly the more it diverges from the median of the other methods, instead
    // of trusting a stale external estimate at full designed weight regardless of context.
    if (methods.D && methods.D.price > 0) {
      const others = ["A", "B", "C", "E"].map(k => methods[k]).filter(m => m && m.price > 0).map(m => m.price);
      if (others.length > 0) {
        others.sort((a, b) => a - b);
        const median = others[Math.floor(others.length / 2)];
        if (median > 0) {
          const logRatio = Math.abs(Math.log(methods.D.price / median));
          const damp = Math.max(0.08, Math.min(1, 0.22 / Math.max(logRatio, 0.001)));
          weights.D *= damp;
        }
      }
    }

    // Redistribute weights if a method returns null or gives non-positive price
    let totalWeight = 0;
    const activeWeights = {};
    for (const key of ["A", "B", "C", "D", "E"]) {
      if (methods[key] != null && methods[key].price > 0) {
        activeWeights[key] = weights[key];
        totalWeight += weights[key];
      }
    }

    if (totalWeight === 0) {
      results[daysAhead] = null;
      continue;
    }

    // Normalize weights
    for (const key in activeWeights) {
      activeWeights[key] = activeWeights[key] / totalWeight;
    }

    // Weighted combination
    let wPrice = 0, wUpper = 0, wLower = 0;
    for (const key in activeWeights) {
      const w = activeWeights[key];
      wPrice += methods[key].price * w;
      wUpper += methods[key].upper * w;
      wLower += methods[key].lower * w;
    }

    // Sentiment adjustment — today's Fear&Greed-style reading is a short-lived, mean-reverting
    // signal (its edge is contrarian bounces over days-to-weeks). Applying it as a flat +/-5%
    // at every horizon would imply today's mood forecasts price 10 years out; instead decay
    // its effect to zero by ~180 days so only short-horizon tabs are actually influenced by it.
    const sentimentVal = indicators.sentimentValue;
    if (typeof sentimentVal === "number") {
      let sentAdj = 1;
      if (sentimentVal <= 20) sentAdj = 1.05;
      else if (sentimentVal >= 80) sentAdj = 0.95;
      const decay = Math.max(0, 1 - daysAhead / 180);
      sentAdj = 1 + (sentAdj - 1) * decay;
      wPrice *= sentAdj;
      wUpper *= sentAdj;
      wLower *= sentAdj;
    }

    // Guard against NaN propagation from any method
    if (isNaN(wPrice) || isNaN(wUpper) || isNaN(wLower)) {
      results[daysAhead] = null;
      continue;
    }

    wPrice = Math.max(0, wPrice);
    wLower = Math.max(0, wLower);

    // Confidence level — crypto-adjusted thresholds per horizon
    const spreadPct = currentPrice > 0 ? (wUpper - wLower) / currentPrice * 100 : 100;
    const confThresholds = {
      7:   { high: 20, medium: 50,  low: 100 },
      30:  { high: 40, medium: 80,  low: 150 },
      365: { high: 80, medium: 150, low: 300 },
      730: { high: 100, medium: 200, low: 400 },
    };
    // Beyond 2 years there's no tuned table entry — widen the 1-year baseline thresholds
    // by sqrt(years) so a 10-year forecast isn't graded on the same bar as a 1-year one.
    let thresh = confThresholds[daysAhead];
    if (!thresh) {
      const scale = Math.sqrt(daysAhead / 365);
      const base = confThresholds[365];
      thresh = { high: base.high * scale, medium: base.medium * scale, low: base.low * scale };
    }
    let confidenceLevel, confidenceClass;
    if (spreadPct < thresh.high) {
      confidenceLevel = "Hög"; confidenceClass = "forecast-conf-high";
    } else if (spreadPct < thresh.medium) {
      confidenceLevel = "Medel"; confidenceClass = "forecast-conf-medium";
    } else if (spreadPct < thresh.low) {
      confidenceLevel = "Låg"; confidenceClass = "forecast-conf-low";
    } else {
      confidenceLevel = "Mycket låg"; confidenceClass = "forecast-conf-verylow";
    }

    // Hard cap: no matter how tight the model agreement looks on paper, nobody can have
    // "high confidence" in where a cryptocurrency trades 3-10 years out. This guards against
    // the confidence label overstating certainty for long horizons purely because the
    // (necessarily speculative) methods happen to agree with each other.
    const confRank = { "Hög": 3, "Medel": 2, "Låg": 1, "Mycket låg": 0 };
    const years = daysAhead / 365;
    const confCap = years > 5 ? "Låg" : years > 2 ? "Medel" : null;
    if (confCap && confRank[confidenceLevel] > confRank[confCap]) {
      confidenceLevel = confCap;
      confidenceClass = confCap === "Låg" ? "forecast-conf-low" : "forecast-conf-medium";
    }

    // Confidence bar position (0-100), scaled to crypto thresholds. Capped to stay
    // consistent with the (possibly downgraded) confidenceLevel above — otherwise the bar
    // could visually read as "near-high" while the badge next to it says "Låg".
    const confBarCeilings = { "Hög": 100, "Medel": 65, "Låg": 35, "Mycket låg": 15 };
    let confBarPct = Math.max(0, Math.min(100, 100 - (spreadPct / thresh.low) * 100));
    confBarPct = Math.min(confBarPct, confBarCeilings[confidenceLevel]);

    results[daysAhead] = {
      price: wPrice,
      upper: wUpper,
      lower: wLower,
      changePct: currentPrice > 0 ? ((wPrice - currentPrice) / currentPrice) * 100 : 0,
      confidenceLevel,
      confidenceClass,
      confBarPct,
      spreadPct,
      methods: {
        A: methods.A ? { price: methods.A.price, weight: activeWeights.A || 0 } : null,
        B: methods.B ? { price: methods.B.price, weight: activeWeights.B || 0 } : null,
        C: methods.C ? { price: methods.C.price, weight: activeWeights.C || 0 } : null,
        D: methods.D ? { price: methods.D.price, weight: activeWeights.D || 0, analysts: methods.D.analysts, year: methods.D.year } : null,
        E: methods.E ? { price: methods.E.price, weight: activeWeights.E || 0 } : null,
      },
      daysAhead,
    };
  }

  return results;
}

// Cache for tab switching without recalculation
let lastForecasts = null;
let lastCurrentPrice = null;
let activeForecastHorizon = 7;

function renderForecastCard(forecasts, currentPrice) {
  lastForecasts = forecasts;
  lastCurrentPrice = currentPrice;
  renderForecastTab(activeForecastHorizon);
}

function renderForecastTab(horizon) {
  activeForecastHorizon = horizon;
  const container = els.forecastContent;

  // Update active tab
  document.querySelectorAll(".forecast-tab").forEach(tab => {
    const h = parseInt(tab.dataset.horizon, 10);
    if (h === horizon) {
      tab.classList.add("forecast-tab-active");
    } else {
      tab.classList.remove("forecast-tab-active");
    }
  });

  if (!lastForecasts || !lastCurrentPrice) {
    container.textContent = "";
    const loading = document.createElement("div");
    loading.className = "forecast-loading";
    loading.textContent = "Laddar prognosdata...";
    container.appendChild(loading);
    return;
  }

  const fc = lastForecasts[horizon];
  container.textContent = "";

  if (!fc) {
    const unavail = document.createElement("div");
    unavail.className = "forecast-unavailable";
    unavail.textContent = "Prognos ej tillgänglig för denna horisont.";
    container.appendChild(unavail);
    resetChartToHistorical(); // clear any leftover forecast overlay from a previously selected tab
    return;
  }

  const currentPrice = lastCurrentPrice;

  // Target year label (helps orient the multi-year tabs, e.g. "Prognos för 2033")
  const targetYear = new Date().getFullYear() + Math.round(horizon / 365);
  if (horizon >= 365) {
    const yearLabel = document.createElement("div");
    yearLabel.className = "forecast-target-year";
    yearLabel.textContent = `Prognos för ${targetYear}`;
    container.appendChild(yearLabel);
  }

  // Price display: low | FORECAST | high
  const pricesRow = document.createElement("div");
  pricesRow.className = "forecast-prices";

  const lowBound = document.createElement("div");
  lowBound.className = "forecast-bound";
  const lowLabel = document.createElement("span");
  lowLabel.className = "forecast-bound-label";
  lowLabel.textContent = fc.isAnalyst2030 ? "Konservativ ($2k–3,5k)" : fc.isScenario ? "Björn −10 %/år" : "Lägsta";
  const lowVal = document.createElement("span");
  lowVal.className = "forecast-bound-low";
  lowVal.textContent = fmtUsd(fc.lower);
  lowBound.appendChild(lowLabel);
  lowBound.appendChild(lowVal);

  const divider1 = document.createElement("span");
  divider1.className = "forecast-price-divider";
  divider1.textContent = "|";

  const mainPrice = document.createElement("div");
  mainPrice.className = "forecast-price-main";
  const mainSublabel = document.createElement("span");
  mainSublabel.className = "forecast-price-sublabel";
  mainSublabel.textContent = fc.isAnalyst2030 ? "Realistiskt mitt ($10k)" : fc.isScenario ? "Bas +15 %/år" : "Prognos";
  const mainVal = document.createElement("span");
  mainVal.className = "forecast-price-value";
  mainVal.textContent = fmtUsd(fc.price);
  mainPrice.appendChild(mainSublabel);
  mainPrice.appendChild(mainVal);

  const divider2 = document.createElement("span");
  divider2.className = "forecast-price-divider";
  divider2.textContent = "|";

  const highBound = document.createElement("div");
  highBound.className = "forecast-bound";
  const highLabel = document.createElement("span");
  highLabel.className = "forecast-bound-label";
  highLabel.textContent = fc.isAnalyst2030 ? "Mycket bullish (upp till $40k)" : fc.isScenario ? "Tjur +35 %/år" : "Högsta";
  const highVal = document.createElement("span");
  highVal.className = "forecast-bound-high";
  highVal.textContent = fmtUsd(fc.upper);
  highBound.appendChild(highLabel);
  highBound.appendChild(highVal);

  pricesRow.appendChild(lowBound);
  pricesRow.appendChild(divider1);
  pricesRow.appendChild(mainPrice);
  pricesRow.appendChild(divider2);
  pricesRow.appendChild(highBound);
  container.appendChild(pricesRow);

  // Change from current price
  const changeRow = document.createElement("div");
  changeRow.className = "forecast-change";
  const changeVal = document.createElement("span");
  changeVal.className = "forecast-change-value";
  changeVal.textContent = fmtPct(fc.changePct);
  changeVal.classList.add(fc.changePct >= 0 ? "up" : "down");
  const changeLbl = document.createElement("span");
  changeLbl.className = "forecast-change-label";
  changeLbl.textContent = "från nuvarande pris";
  changeRow.appendChild(changeVal);
  changeRow.appendChild(changeLbl);
  container.appendChild(changeRow);

  if (fc.isAnalyst2030) {
    render2030AnalystOutlook(container, currentPrice);
  } else if (fc.isScenario) {
    renderScenarioTable(container, currentPrice);
  }

  // Confidence badge, method breakdown and confidence bar are statistical-model concepts —
  // they only render on the model-based tabs (1 vecka / 1 månad). Scenario tabs are plain
  // compounding examples with no statistical confidence to express.
  if (!fc.isScenario) {
  // Confidence badge
  const confRow = document.createElement("div");
  confRow.className = "forecast-confidence-row";
  const confBadge = document.createElement("span");
  confBadge.className = `forecast-confidence-badge ${fc.confidenceClass}`;
  confBadge.textContent = `Konfidens: ${fc.confidenceLevel}`;
  const confSpread = document.createElement("span");
  confSpread.style.cssText = "font-size:0.75rem;color:#8b91ab";
  confSpread.textContent = `(spridning ${fc.spreadPct.toFixed(0)}%)`;
  confRow.appendChild(confBadge);
  confRow.appendChild(confSpread);
  container.appendChild(confRow);

  // Method breakdown
  const methodNames = {
    A: "Linjär regression",
    B: "Holt's utjämning",
    C: "MA-momentum",
    D: "Konsensus",
    E: "Mean-reversion",
  };

  const methodsBox = document.createElement("div");
  methodsBox.className = "forecast-methods";
  const methodsTitle = document.createElement("div");
  methodsTitle.className = "forecast-methods-title";
  methodsTitle.textContent = "Metod-breakdown";
  methodsBox.appendChild(methodsTitle);

  for (const key of ["A", "B", "C", "D", "E"]) {
    const m = fc.methods[key];
    if (!m) continue;
    const row = document.createElement("div");
    row.className = "forecast-method-row";
    const name = document.createElement("span");
    name.className = "forecast-method-name";
    name.textContent = methodNames[key];
    const price = document.createElement("span");
    price.className = "forecast-method-price";
    price.textContent = fmtUsd(m.price);
    const weight = document.createElement("span");
    weight.className = "forecast-method-weight";
    weight.textContent = `${(m.weight * 100).toFixed(0)}%`;
    row.appendChild(name);
    row.appendChild(price);
    row.appendChild(weight);
    methodsBox.appendChild(row);
  }
  container.appendChild(methodsBox);

  // Confidence bar
  const barContainer = document.createElement("div");
  barContainer.className = "forecast-bar-container";
  const barLabels = document.createElement("div");
  barLabels.className = "forecast-bar-labels";
  const barLblLow = document.createElement("span");
  barLblLow.textContent = "Låg konfidens";
  const barLblHigh = document.createElement("span");
  barLblHigh.textContent = "Hög konfidens";
  barLabels.appendChild(barLblLow);
  barLabels.appendChild(barLblHigh);
  const bar = document.createElement("div");
  bar.className = "forecast-bar";
  const marker = document.createElement("div");
  marker.className = "forecast-bar-marker";
  marker.style.left = `${fc.confBarPct}%`;
  bar.appendChild(marker);
  barContainer.appendChild(barLabels);
  barContainer.appendChild(bar);
  container.appendChild(barContainer);

  // Beyond 2 years there is no real analyst-consensus data — say so explicitly instead
  // of silently omitting the table, so users don't mistake the absence for an error.
  if (horizon > 730) {
    const noConsensus = document.createElement("p");
    noConsensus.className = "forecast-no-consensus";
    noConsensus.textContent = "Ingen analytikerkonsensus finns publicerad så här långt fram — 1 och 2-årsflikarna " +
      "vägs delvis mot externa analytikerestimat, vilket kan göra att siffran här skiljer sig från grannflikarna. " +
      "Denna prognos bygger enbart på modellextrapolering (trend, utjämning, momentum och mean-reversion) " +
      "och blir kraftigt mer osäker ju längre fram i tiden den pekar.";
    container.appendChild(noConsensus);
  }

  // Consensus section (only for 365d and 730d)
  if ((horizon === 365 || horizon === 730) && fc.methods.D && fc.methods.D.analysts) {
    const consBox = document.createElement("div");
    consBox.className = "forecast-consensus";
    const consTitle = document.createElement("div");
    consTitle.className = "forecast-consensus-title";
    consTitle.textContent = `Analytikerkonsensusprognos ${fc.methods.D.year}`;
    consBox.appendChild(consTitle);

    const table = document.createElement("table");
    table.className = "forecast-consensus-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Analytiker", "Lägsta", "Snitt", "Högsta", "Position"].forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const allLow = arrayMin(fc.methods.D.analysts.map(a => a.low));
    const allHigh = arrayMax(fc.methods.D.analysts.map(a => a.high));
    const range = allHigh - allLow;

    fc.methods.D.analysts.forEach(analyst => {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.textContent = analyst.name;
      const tdLow = document.createElement("td");
      tdLow.textContent = fmtUsd(analyst.low);
      tdLow.style.color = "#ff6f61";
      const tdAvg = document.createElement("td");
      tdAvg.textContent = fmtUsd(analyst.avg);
      tdAvg.style.fontWeight = "700";
      const tdHigh = document.createElement("td");
      tdHigh.textContent = fmtUsd(analyst.high);
      tdHigh.style.color = "#4ce081";

      // Position indicator
      const tdPos = document.createElement("td");
      const posBar = document.createElement("div");
      posBar.className = "forecast-position-bar";
      if (range > 0) {
        const fillLeft = ((analyst.low - allLow) / range) * 100;
        const fillWidth = ((analyst.high - analyst.low) / range) * 100;
        const fill = document.createElement("div");
        fill.className = "forecast-position-fill";
        fill.style.left = `${fillLeft}%`;
        fill.style.width = `${fillWidth}%`;
        posBar.appendChild(fill);
        const dot = document.createElement("div");
        dot.className = "forecast-position-dot";
        dot.style.left = `${((analyst.avg - allLow) / range) * 100}%`;
        posBar.appendChild(dot);
      }
      tdPos.appendChild(posBar);

      tr.appendChild(tdName);
      tr.appendChild(tdLow);
      tr.appendChild(tdAvg);
      tr.appendChild(tdHigh);
      tr.appendChild(tdPos);
      tbody.appendChild(tr);
    });

    // Current price row
    if (currentPrice > 0) {
      const trCur = document.createElement("tr");
      const tdCurName = document.createElement("td");
      tdCurName.textContent = "Nuvarande pris";
      tdCurName.style.color = "#6dd5ed";
      tdCurName.style.fontWeight = "700";
      const tdCurVal = document.createElement("td");
      tdCurVal.colSpan = 4;
      tdCurVal.textContent = fmtUsd(currentPrice);
      tdCurVal.style.color = "#6dd5ed";
      tdCurVal.style.fontWeight = "700";
      trCur.appendChild(tdCurName);
      trCur.appendChild(tdCurVal);
      tbody.appendChild(trCur);
    }

    table.appendChild(tbody);
    consBox.appendChild(table);
    const consDate = document.createElement("div");
    consDate.style.cssText = "font-size:0.72rem;color:#8b91ab;margin-top:6px;text-align:right";
    consDate.textContent = `Senast uppdaterad: ${ANALYST_FORECASTS.lastUpdated}`;
    consBox.appendChild(consDate);
    container.appendChild(consBox);
  }

  } // end !fc.isScenario

  // Disclaimer
  const disc = document.createElement("p");
  disc.className = "forecast-disclaimer";
  disc.textContent = fc.isAnalyst2030
    ? "Analytikerprognoser är spekulativa och spridda — ingen vet var ETH står 2030. " +
      "Intervallen speglar vad banker och analysfirmor publicerat, inte vår egen modell. " +
      "Detta är INTE finansiell rådgivning. Gör alltid din egen research (DYOR)."
    : fc.isScenario
    ? "Scenarierna ovan är ren sammansatt ränta från dagens pris — beräkningsexempel, inte prognoser. " +
      "Ingen modell kan tillförlitligt förutsäga kryptopriser flera år fram i tiden. " +
      "Detta är INTE finansiell rådgivning. Gör alltid din egen research (DYOR)."
    : horizon > 730
    ? "Prognoser för flera år framåt bygger enbart på matematisk extrapolering av historiska prisrörelser, " +
      "utan någon fundamental analys (nätverksbruk, staking, adoption) — och är EXTREMT osäkra. Ingen modell " +
      "kan tillförlitligt förutsäga kryptopriser flera år fram i tiden. Detta är INTE finansiell rådgivning. " +
      "Gör alltid din egen research (DYOR) och investera bara pengar du har råd att förlora."
    : "Prognoser baseras på historiska prisdata, tekniska indikatorer och analytikerestimat. " +
      "Kryptovalutor är extremt volatila och dessa prognoser är INTE finansiell rådgivning. " +
      "Gör alltid din egen research (DYOR) och investera bara pengar du har råd att förlora.";
  container.appendChild(disc);

  // Update chart with forecast data
  updateChartWithForecast(horizon, fc, currentPrice);
}

// Store original chart data for reset on tab switch
let chartHistLabels = null;
let chartHistDatasets = null;

// Deep-clone a dataset, ensuring arrays are not shared references
function cloneDataset(ds) {
  const copy = { ...ds, data: [...ds.data] };
  if (Array.isArray(ds.borderDash)) copy.borderDash = [...ds.borderDash];
  return copy;
}

// Reset the chart to historical-only data (no forecast overlay). Used both as the first step
// of drawing a new forecast, and standalone when a horizon has no forecast to show at all —
// otherwise the previously-selected tab's forecast line would linger on screen.
function resetChartToHistorical() {
  if (!chart || !chartHistLabels) return;
  chart.data.labels = [...chartHistLabels];
  chart.data.datasets = chartHistDatasets.map(cloneDataset);
  if (chart.options.plugins.annotation.annotations.todayLine) {
    delete chart.options.plugins.annotation.annotations.todayLine;
  }
  chart.update();
}

function updateChartWithForecast(horizon, fc, currentPrice) {
  if (!chart) return;

  // Save original historical data on first call
  if (!chartHistLabels) {
    chartHistLabels = [...chart.data.labels];
    chartHistDatasets = chart.data.datasets
      .filter(ds => !ds._isForecast)
      .map(cloneDataset);
  }

  // Reset to historical state
  const histLen = chartHistLabels.length;
  chart.data.labels = [...chartHistLabels];
  chart.data.datasets = chartHistDatasets.map(cloneDataset);

  // Generate future date labels
  const lastDate = new Date();
  const futureLabels = [];
  const futurePrices = [];
  const futureUpper = [];
  const futureLower = [];

  // Number of interpolation points
  const points = Math.min(horizon, 60);
  // Multi-year horizons repeat the same "month day" label every lap around the calendar
  // (e.g. "jan 4" appearing 10 times over a decade) unless the year is included.
  const dateFormat = horizon > 365 ? { year: "numeric", month: "short" } : { month: "short", day: "numeric" };
  for (let i = 0; i <= points; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + Math.round((i / points) * horizon));
    futureLabels.push(d.toLocaleDateString("sv-SE", dateFormat));
    const t = i / points;
    if (fc.isScenario) {
      const years = horizon / 365;
      const elapsedYears = t * years;
      futurePrices.push(currentPrice * Math.pow(1 + SCENARIO_RATES.base, elapsedYears));
      futureUpper.push(currentPrice * Math.pow(1 + SCENARIO_RATES.bull, elapsedYears));
      futureLower.push(currentPrice * Math.pow(1 + SCENARIO_RATES.bear, elapsedYears));
    } else {
      futurePrices.push(currentPrice + (fc.price - currentPrice) * t);
      futureUpper.push(currentPrice + (fc.upper - currentPrice) * t);
      futureLower.push(currentPrice + (fc.lower - currentPrice) * t);
    }
  }

  // Extend labels with future dates
  const allLabels = [...chartHistLabels, ...futureLabels.slice(1)];
  chart.data.labels = allLabels;

  // Pad existing datasets with nulls for the forecast period
  const forecastLen = futureLabels.length - 1;
  chart.data.datasets.forEach(ds => {
    if (!ds._isForecast) {
      for (let i = 0; i < forecastLen; i++) ds.data.push(null);
    }
  });

  // Forecast line: bridge from last historical to forecast
  const forecastLineData = new Array(histLen - 1).fill(null);
  forecastLineData.push(currentPrice); // Connect at last historical point
  futurePrices.slice(1).forEach(p => forecastLineData.push(p));

  const forecastUpperData = new Array(histLen - 1).fill(null);
  forecastUpperData.push(currentPrice);
  futureUpper.slice(1).forEach(p => forecastUpperData.push(p));

  const forecastLowerData = new Array(histLen - 1).fill(null);
  forecastLowerData.push(currentPrice);
  futureLower.slice(1).forEach(p => forecastLowerData.push(p));

  // Forecast line dataset
  chart.data.datasets.push({
    label: "Prognos",
    data: forecastLineData,
    borderColor: "#b388ff",
    borderDash: [6, 4],
    fill: false,
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 2,
    order: 0,
    _isForecast: true,
  });

  // Confidence band (upper)
  chart.data.datasets.push({
    label: "Konfidensband (ovre)",
    data: forecastUpperData,
    borderColor: "rgba(179, 136, 255, 0.3)",
    backgroundColor: "rgba(179, 136, 255, 0.08)",
    fill: "+1",
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 1,
    order: 0,
    _isForecast: true,
  });

  // Confidence band (lower)
  chart.data.datasets.push({
    label: "Konfidensband (nedre)",
    data: forecastLowerData,
    borderColor: "rgba(179, 136, 255, 0.3)",
    backgroundColor: "rgba(179, 136, 255, 0.08)",
    fill: false,
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 1,
    order: 0,
    _isForecast: true,
  });

  // Add "Idag" annotation
  const annotations = chart.options.plugins.annotation.annotations;
  annotations.todayLine = {
    type: "line",
    xMin: histLen - 1,
    xMax: histLen - 1,
    borderColor: "rgba(179, 136, 255, 0.6)",
    borderWidth: 1,
    borderDash: [4, 4],
    label: {
      display: true,
      content: "Idag",
      position: "start",
      color: "#b388ff",
      backgroundColor: "rgba(15,19,32,0.88)",
      font: { size: 10, weight: "700" },
      padding: { x: 5, y: 2 },
    },
  };

  chart.update();
}

// Tab click handler
document.querySelectorAll(".forecast-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const horizon = parseInt(tab.dataset.horizon, 10);
    renderForecastTab(horizon);
  });
});

// ─── Datahämtning ──────────────────────────────────────────────────────────

let lastBinancePrice = null;
let lastBestStakingApy = null;

async function loadBinance24h() {
  try {
    const data = await fetchJson(BINANCE_24HR_URL);
    const result = {
      price: parseFloat(data.lastPrice),
      changePct: parseFloat(data.priceChangePercent),
      quoteVolume: parseFloat(data.quoteVolume),
      volume: parseFloat(data.volume),
    };
    lastBinancePrice = result.price;
    els.priceBinance.textContent = fmtUsd(result.price);
    return result;
  } catch {
    els.priceBinance.textContent = "Ej tillgängligt";
    return null;
  }
}

async function loadBinancePrice() {
  return loadBinance24h();
}

async function loadBinanceHistory() {
  try {
    const klines = await fetchJson(BINANCE_KLINES_URL);
    return {
      prices: klines.map((k) => parseFloat(k[4])),
      volumes: klines.map((k) => parseFloat(k[7])),
      timestamps: klines.map((k) => k[0]),
      labels: klines.map((k) =>
        new Date(k[0]).toLocaleDateString("sv-SE", { month: "short", day: "numeric" })
      ),
    };
  } catch (e) {
    console.error("Binance klines misslyckades:", e);
    return null;
  }
}

async function loadSentiment() {
  try {
    const data  = await fetchJson(FEAR_GREED_URL);
    const entry = data.data?.[0];
    const value = parseInt(entry?.value, 10);
    if (isNaN(value)) {
      throw new Error("Ogiltigt sentimentvärde från API");
    }
    const info  = classifySentiment(value);
    els.sentimentGauge.textContent  = String(value);
    els.sentimentGauge.className    = `sentiment-gauge sentiment-${info.cls}`;
    els.sentimentLabel.textContent  = `${info.label} (${value}/100)`;
    els.sentimentDesc.textContent   = info.hint;
    return value;
  } catch {
    els.sentimentGauge.textContent  = "?";
    els.sentimentGauge.className    = "sentiment-gauge sentiment-loading";
    els.sentimentLabel.textContent  = "Kunde inte hämta sentiment";
    els.sentimentDesc.textContent   = "Crypto Fear & Greed Index gick inte att hämta just nu.";
    return null;
  }
}

// ─── Layer 2 TVL Breakdown ────────────────────────────────────────────────

const L2_CHAINS = [
  { name: "Arbitrum One", color: "#28A0F0" },
  { name: "Optimism",     color: "#FF0420" },
  { name: "Base",         color: "#0052FF" },
  { name: "zkSync Era",   color: "#8C8DFC" },
  { name: "Polygon zkEVM", color: "#8247E5" },
];

function renderL2Breakdown(chains) {
  const matched = L2_CHAINS
    .map(l2 => {
      const chain = chains.find(c => c.name === l2.name);
      return chain ? { name: l2.name, color: l2.color, tvl: chain.tvl ?? 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.tvl - a.tvl);

  if (matched.length === 0) {
    els.l2TotalTvl.textContent = "Ej tillgangligt";
    return;
  }

  const totalL2 = matched.reduce((sum, c) => sum + c.tvl, 0);
  els.l2TotalTvl.textContent = fmtLarge(totalL2);

  els.l2Bar.textContent = "";
  els.l2Legend.textContent = "";

  matched.forEach(chain => {
    const pct = totalL2 > 0 ? (chain.tvl / totalL2) * 100 : 0;

    const seg = document.createElement("div");
    seg.className = "l2-segment";
    seg.style.width = `${pct}%`;
    seg.style.backgroundColor = chain.color;
    seg.textContent = pct > 8 ? `${pct.toFixed(1)}%` : "";
    els.l2Bar.appendChild(seg);

    const item = document.createElement("span");
    item.className = "l2-legend-item";
    const dot = document.createElement("span");
    dot.className = "l2-dot";
    dot.style.backgroundColor = chain.color;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(` ${chain.name} ${fmtLarge(chain.tvl)} (${pct.toFixed(1)}%)`));
    els.l2Legend.appendChild(item);
  });
}

// ─── DeFi & Staking (DefiLlama) ───────────────────────────────────────────

async function loadDefi() {
  const srcEl = document.getElementById("src-defillama");
  try {
    const [chains, pools] = await Promise.all([
      fetchJson(DEFILLAMA_CHAINS_URL),
      fetchJson(DEFILLAMA_YIELDS_URL),
    ]);

    // TVL för Ethereum-kedjan
    const ethChain = chains.find(c => c.name === "Ethereum");
    if (ethChain) {
      els.defiTvl.textContent = fmtLarge(ethChain.tvl);
      // TVL-förändring (1 dag) – kan finnas som chainTvls-data via gecko_id
      // DefiLlama /v2/chains ger inte change direkt, men vi kan räkna baklänges
      // om tokenSymbol finns. Alternativt: visa absolut TVL.
      // DefiLlama ger inte 1d change i /v2/chains – kontrollera om fältet finns
      if (typeof ethChain.change_1d === "number") {
        const chg = ethChain.change_1d;
        els.defiTvlChange.textContent = fmtPct(chg);
        els.defiTvlChange.className = `price-small ${chg >= 0 ? "up" : "down"}`;
      } else {
        els.defiTvlChange.textContent = "–";
      }
    } else {
      els.defiTvl.textContent = "Ej tillgängligt";
      els.defiTvlChange.textContent = "–";
    }

    // Layer 2 TVL Breakdown (använder samma chains-data)
    renderL2Breakdown(chains);

    // Top 5 staking-protokoll på Ethereum
    const poolsData = Array.isArray(pools?.data) ? pools.data : [];
    const stakingPools = poolsData
      .filter(p =>
        p.chain === "Ethereum" &&
        p.category &&
        p.category.toLowerCase().includes("staking") &&
        typeof p.apy === "number" &&
        p.apy > 0
      )
      .sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0))
      .slice(0, 5);

    // Spara bästa APY för staking dashboard
    const allStakingApys = poolsData
      .filter(p =>
        p.chain === "Ethereum" &&
        p.category &&
        p.category.toLowerCase().includes("staking") &&
        typeof p.apy === "number" &&
        p.apy > 0 &&
        p.apy < 100
      )
      .map(p => p.apy);
    lastBestStakingApy = allStakingApys.length > 0 ? Math.max(...allStakingApys) : null;

    els.stakingList.textContent = "";
    if (stakingPools.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.className = "staking-loading";
      emptyLi.textContent = "Inga staking-protokoll hittades";
      els.stakingList.appendChild(emptyLi);
    } else {
      stakingPools.forEach(p => {
        const li = document.createElement("li");
        const nameSpan = document.createElement("span");
        nameSpan.className = "staking-name";
        nameSpan.textContent = `${p.project} · ${p.symbol}`;
        const apySpan = document.createElement("span");
        apySpan.className = "staking-apy";
        apySpan.textContent = `${p.apy.toFixed(2)}% APY`;
        li.appendChild(nameSpan);
        li.appendChild(apySpan);
        els.stakingList.appendChild(li);
      });
    }

    srcEl.textContent = "OK";
    srcEl.className = "src-badge src-positive";
  } catch {
    els.defiTvl.textContent = "Ej tillgängligt";
    els.defiTvlChange.textContent = "–";
    els.stakingList.textContent = "";
    const errLiDefi = document.createElement("li");
    errLiDefi.className = "staking-loading";
    errLiDefi.textContent = "Kunde inte hämta DeFi-data";
    els.stakingList.appendChild(errLiDefi);
    srcEl.textContent = "Fel";
    srcEl.className = "src-badge src-negative";
  }
}

// ─── Gas Tracker (Owlracle) ───────────────────────────────────────────────

async function loadGas(ethPriceUsd) {
  const srcEl = document.getElementById("src-owlracle");
  try {
    const data = await fetchJson(OWLRACLE_GAS_URL);

    // Owlracle /v4/eth/gas returnerar speeds[] med gasPrice i Gwei
    const speeds = Array.isArray(data.speeds) ? data.speeds : [];
    if (speeds.length === 0) {
      els.gasLow.textContent  = "–";
      els.gasAvg.textContent  = "–";
      els.gasHigh.textContent = "–";
      els.gasLoad.textContent = "Ingen data";
      els.gasLoad.className   = "gas-load gas-load-unknown";
      els.gasTransferCost.textContent = "–";
      srcEl.textContent = "Ingen data";
      srcEl.className = "src-badge src-mixed";
      return;
    }
    const low  = speeds.find(s => s.acceptance >= 0.35 && s.acceptance < 0.7) || speeds[0];
    const avg  = speeds.find(s => s.acceptance >= 0.7 && s.acceptance < 0.95) || speeds[Math.floor(speeds.length / 2)];
    const high = speeds.find(s => s.acceptance >= 0.95) || speeds[speeds.length - 1];

    const lowGwei  = low  ? low.gasPrice  : null;
    const avgGwei  = avg  ? avg.gasPrice  : null;
    const highGwei = high ? high.gasPrice  : null;

    els.gasLow.textContent  = lowGwei  != null ? lowGwei.toFixed(1)  : "–";
    els.gasAvg.textContent  = avgGwei  != null ? avgGwei.toFixed(1)  : "–";
    els.gasHigh.textContent = highGwei != null ? highGwei.toFixed(1) : "–";

    // Belastningsindikator baserad på genomsnittligt gas-pris
    if (avgGwei != null) {
      let loadCls, loadText;
      if (avgGwei < 20) {
        loadCls  = "gas-load-low";
        loadText = "Låg belastning";
      } else if (avgGwei < 60) {
        loadCls  = "gas-load-medium";
        loadText = "Normal belastning";
      } else {
        loadCls  = "gas-load-high";
        loadText = "Hög belastning";
      }
      els.gasLoad.textContent = `${loadText} (${avgGwei.toFixed(1)} Gwei)`;
      els.gasLoad.className   = `gas-load ${loadCls}`;
    }

    // Estimerad ETH-överföringskostnad (21 000 gas) i USD
    if (avgGwei != null && ethPriceUsd) {
      const costEth = (21000 * avgGwei * 1e-9);
      const costUsd = costEth * ethPriceUsd;
      els.gasTransferCost.textContent = `${fmtUsd(costUsd)} (${costEth.toFixed(6)} ETH)`;
    } else {
      els.gasTransferCost.textContent = "–";
    }

    srcEl.textContent = "OK";
    srcEl.className = "src-badge src-positive";
  } catch {
    els.gasLow.textContent  = "–";
    els.gasAvg.textContent  = "–";
    els.gasHigh.textContent = "–";
    els.gasLoad.textContent = "Ej tillgängligt";
    els.gasLoad.className   = "gas-load gas-load-unknown";
    els.gasTransferCost.textContent = "–";
    srcEl.textContent = "Fel";
    srcEl.className = "src-badge src-negative";
  }
}

// ─── Ethereum Roadmap & Nyheter (CryptoCompare) ──────────────────────────

function timeAgo(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60)     return "just nu";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} min sedan`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} ${h === 1 ? "timme" : "timmar"} sedan`;
  }
  if (diff < 604800) {
    const d = Math.floor(diff / 86400);
    return `${d} ${d === 1 ? "dag" : "dagar"} sedan`;
  }
  return new Date(timestamp * 1000).toLocaleDateString("sv-SE");
}

async function loadNews() {
  const srcEl = document.getElementById("src-cryptocompare");
  try {
    const data = await fetchJson(CRYPTOCOMPARE_NEWS_URL);
    const articles = Array.isArray(data?.Data) ? data.Data.slice(0, 5) : [];

    els.newsList.textContent = "";

    if (articles.length === 0) {
      const emptyNewsLi = document.createElement("li");
      emptyNewsLi.className = "news-loading";
      emptyNewsLi.textContent = "Inga nyheter tillgängliga";
      els.newsList.appendChild(emptyNewsLi);
      srcEl.textContent = "Ingen data";
      srcEl.className = "src-badge src-mixed";
      return;
    }

    articles.forEach(article => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = article.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.className = "news-link";
      link.textContent = article.title;

      const meta = document.createElement("div");
      meta.className = "news-meta";
      const sourceSpan = document.createElement("span");
      sourceSpan.className = "news-source";
      sourceSpan.textContent = article.source_info?.name || article.source || "Okänd källa";
      const timeSpan = document.createElement("span");
      timeSpan.className = "news-time";
      timeSpan.textContent = timeAgo(article.published_on);
      meta.appendChild(sourceSpan);
      meta.appendChild(timeSpan);

      li.appendChild(link);
      li.appendChild(meta);
      els.newsList.appendChild(li);
    });

    srcEl.textContent = "OK";
    srcEl.className = "src-badge src-positive";
  } catch {
    els.newsList.textContent = "";
    const errLiNews = document.createElement("li");
    errLiNews.className = "news-loading";
    errLiNews.textContent = "Kunde inte hämta nyheter";
    els.newsList.appendChild(errLiNews);
    srcEl.textContent = "Fel";
    srcEl.className = "src-badge src-negative";
  }
}

// ─── ETH vs Marknaden (Korrelation & Dominans) ───────────────────────────

async function loadCorrelation() {
  const srcEl = document.getElementById("src-coingecko-global");
  try {
    const [priceData, globalData] = await Promise.all([
      fetchJson(COINGECKO_CORRELATION_URL),
      fetchJson(COINGECKO_GLOBAL_URL),
    ]);

    // ETH/BTC-ratio
    const ethBtc = priceData.ethereum?.btc;
    if (ethBtc != null) {
      els.ethbtcRatio.textContent = `${ethBtc.toFixed(6)} BTC`;
    }

    // ETH/BTC 24h-förändring (ETH 24h change i USD minus BTC 24h change → approximation)
    const ethChange24 = priceData.ethereum?.usd_24h_change;
    const btcChange24 = priceData.bitcoin?.usd_24h_change;
    if (ethChange24 != null && btcChange24 != null) {
      const ratioChange = ethChange24 - btcChange24;
      els.ethbtcChange.textContent = fmtPct(ratioChange);
      els.ethbtcChange.className = `price-small ${ratioChange >= 0 ? "up" : "down"}`;
    }

    // BTC-pris som referens
    const btcUsd = priceData.bitcoin?.usd;
    if (btcUsd != null) {
      els.btcPrice.textContent = fmtUsd(btcUsd);
    }

    // Marknadsdominans
    const mcp = globalData.data?.market_cap_percentage;
    if (mcp) {
      const btcDom = mcp.btc ?? 0;
      const ethDom = mcp.eth ?? 0;
      const otherDom = Math.max(0, 100 - btcDom - ethDom);

      els.domBtc.style.width   = `${btcDom}%`;
      els.domEth.style.width   = `${ethDom}%`;
      els.domOther.style.width = `${otherDom}%`;

      // Visa procent i segmentet om tillräckligt brett
      els.domBtc.textContent   = btcDom > 8 ? `${btcDom.toFixed(1)}%` : "";
      els.domEth.textContent   = ethDom > 8 ? `${ethDom.toFixed(1)}%` : "";
      els.domOther.textContent = otherDom > 8 ? `${otherDom.toFixed(1)}%` : "";

      els.domBtcPct.textContent   = `${btcDom.toFixed(1)}%`;
      els.domEthPct.textContent   = `${ethDom.toFixed(1)}%`;
      els.domOtherPct.textContent = `${otherDom.toFixed(1)}%`;
    }

    srcEl.textContent = "OK";
    srcEl.className = "src-badge src-positive";
  } catch {
    els.ethbtcRatio.textContent  = "Ej tillgängligt";
    els.ethbtcChange.textContent = "–";
    els.btcPrice.textContent     = "–";
    srcEl.textContent = "Fel";
    srcEl.className = "src-badge src-negative";
  }
}

// ─── Prisalarm & Browser Notifications ────────────────────────────────────

const ALARM_STORAGE_KEY = "eth_price_alarms";
const MAX_ALARMS = 10;

function getAlarms() {
  try {
    const raw = JSON.parse(localStorage.getItem(ALARM_STORAGE_KEY));
    if (!Array.isArray(raw)) return [];
    // Validera varje alarm-objekt mot injection/korrupt data
    return raw.filter(a =>
      a && typeof a === "object" &&
      (typeof a.price === "number" || a.rsiTag) &&
      ["above", "below"].includes(a.direction)
    );
  } catch {
    return [];
  }
}

function saveAlarms(alarms) {
  try {
    localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarms));
  } catch (e) {
    console.error("Kunde inte spara alarm till localStorage:", e);
    alert("Kunde inte spara alarmet. Lagringsutrymmet kan vara fullt.");
  }
}

function renderAlarmList() {
  const alarms = getAlarms();
  els.alarmCount.textContent = `${alarms.length}/${MAX_ALARMS}`;
  els.alarmList.textContent = "";

  if (alarms.length === 0) {
    const emptyAlarmLi = document.createElement("li");
    emptyAlarmLi.className = "alarm-empty";
    emptyAlarmLi.textContent = "Inga aktiva alarm";
    els.alarmList.appendChild(emptyAlarmLi);
    return;
  }

  alarms.forEach((alarm, idx) => {
    const li = document.createElement("li");
    const infoSpan = document.createElement("span");
    infoSpan.className = "alarm-info";

    const dirBadge = document.createElement("span");
    dirBadge.className = "alarm-direction-badge";
    const removeBtn = document.createElement("button");
    removeBtn.className = "alarm-remove-btn";
    removeBtn.dataset.idx = String(idx);
    removeBtn.textContent = "Ta bort";

    if (alarm.rsiTag) {
      // RSI-alarm visas med RSI-badge istället för dummypriset
      dirBadge.classList.add(alarm.rsiTag === "RSI<30" ? "alarm-dir-below" : "alarm-dir-above");
      dirBadge.textContent = alarm.rsiTag === "RSI<30" ? "RSI<30" : "RSI>70";
      const rsiBadge = document.createElement("span");
      rsiBadge.className = "alarm-rsi-badge";
      rsiBadge.textContent = alarm.rsiTag === "RSI<30" ? "Översåld" : "Överköpt";
      infoSpan.appendChild(dirBadge);
      infoSpan.appendChild(document.createTextNode(" "));
      infoSpan.appendChild(rsiBadge);
    } else {
      dirBadge.classList.add(alarm.direction === "above" ? "alarm-dir-above" : "alarm-dir-below");
      dirBadge.textContent = alarm.direction === "above" ? "Över" : "Under";
      const priceNum = typeof alarm.price === "number" && isFinite(alarm.price) ? alarm.price : 0;
      infoSpan.appendChild(dirBadge);
      infoSpan.appendChild(document.createTextNode(" " + fmtUsd(priceNum)));
    }

    li.appendChild(infoSpan);
    li.appendChild(removeBtn);
    els.alarmList.appendChild(li);
  });

  // Bind remove-knappar
  els.alarmList.querySelectorAll(".alarm-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.idx, 10);
      const a = getAlarms();
      a.splice(i, 1);
      saveAlarms(a);
      renderAlarmList();
    });
  });
}

function addAlarm(price, direction, rsiTag) {
  const alarms = getAlarms();
  if (alarms.length >= MAX_ALARMS) {
    alert(`Max ${MAX_ALARMS} aktiva alarm. Ta bort ett befintligt alarm först.`);
    return;
  }
  if (!rsiTag && (!price || isNaN(price) || price <= 0 || !isFinite(price) || price > 1e8)) {
    alert("Ange ett giltigt pris (mellan 0 och 100 000 000 USD).");
    return;
  }
  alarms.push({ price, direction, rsiTag: rsiTag || null, createdAt: Date.now() });
  saveAlarms(alarms);
  renderAlarmList();
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

function sendNotification(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>%CE%9E</text></svg>" });
  }
}

function checkAlarms(currentPrice, currentRsi) {
  const alarms = getAlarms();
  let triggered = false;
  let triggerText = "";

  // Filtrera bort triggade alarm (pris + RSI) i ett enda pass
  const remaining = alarms.filter(alarm => {
    // RSI-alarm kontrolleras via rsiTag, inte prisgränsen
    if (alarm.rsiTag && currentRsi != null) {
      if (alarm.rsiTag === "RSI<30" && currentRsi < 30) {
        triggered = true;
        triggerText = `RSI ${currentRsi.toFixed(1)} (under 30 – översåld)`;
        sendNotification("ETH RSI-alarm", triggerText);
        return false;
      }
      if (alarm.rsiTag === "RSI>70" && currentRsi > 70) {
        triggered = true;
        triggerText = `RSI ${currentRsi.toFixed(1)} (över 70 – överköpt)`;
        sendNotification("ETH RSI-alarm", triggerText);
        return false;
      }
      return true; // RSI-alarm ej triggat, behåll
    }

    // Vanligt prisalarm
    let isTriggered = false;
    if (alarm.direction === "above" && currentPrice >= alarm.price) {
      isTriggered = true;
    } else if (alarm.direction === "below" && currentPrice <= alarm.price) {
      isTriggered = true;
    }

    if (isTriggered) {
      triggered = true;
      const dirText = alarm.direction === "above" ? "över" : "under";
      triggerText = `Pris ${dirText} ${fmtUsd(alarm.price)} (nu: ${fmtUsd(currentPrice)})`;
      sendNotification("ETH Prisalarm", triggerText);
      return false;
    }
    return true;
  });

  if (triggered) {
    saveAlarms(remaining);
    renderAlarmList();
    // Visa visuell indikator
    els.alarmTriggered.style.display = "flex";
    els.alarmTriggeredText.textContent = triggerText;
    setTimeout(() => { els.alarmTriggered.style.display = "none"; }, 10000);
  }
}

function initAlarmUI() {
  renderAlarmList();

  els.alarmAddBtn.addEventListener("click", async () => {
    const price = parseFloat(els.alarmPriceInput.value);
    const direction = els.alarmDirection.value;
    const perm = await requestNotificationPermission();
    if (perm === "denied") {
      alert("Browser-notifikationer är blockerade. Alarm fungerar ändå visuellt, men du får inga push-notiser. Tillåt notifikationer i webbläsarens inställningar.");
    }
    addAlarm(price, direction, null);
    els.alarmPriceInput.value = "";
  });

  els.alarmRsiLow.addEventListener("click", async () => {
    // RSI < 30 alarm – använd ett fiktivt högt pris som aldrig triggas av prischeck
    // RSI-kontroll sker separat i checkAlarms
    const perm = await requestNotificationPermission();
    if (perm === "denied") {
      alert("Browser-notifikationer är blockerade. Alarm fungerar ändå visuellt.");
    }
    addAlarm(0.01, "below", "RSI<30");
  });

  els.alarmRsiHigh.addEventListener("click", async () => {
    const perm = await requestNotificationPermission();
    if (perm === "denied") {
      alert("Browser-notifikationer är blockerade. Alarm fungerar ändå visuellt.");
    }
    addAlarm(999999, "above", "RSI>70");
  });
}

// Initiera alarm-UI direkt
initAlarmUI();

async function loadData() {
  try {
    // Parallellhämtar alla datakällor för att minimera laddningstid.
    // 365 dagars historik krävs för MA200 och säkrare motstånd/stöddetektering.
    // Promise.allSettled säkerställer att enskilda API-fel inte kraschar hela dashboarden.
    const results = await Promise.allSettled([
      fetchJson(`${COINGECKO_BASE}/simple/price?ids=ethereum&vs_currencies=usd,sek&include_24hr_change=true&include_last_updated_at=true`),
      fetchJson(`${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=ethereum&per_page=1&page=1&price_change_percentage=7d,30d`),
      fetchJson(`${COINGECKO_BASE}/coins/ethereum/market_chart?vs_currency=usd&days=365&interval=daily`),
      loadBinance24h(),
      loadSentiment(),
      loadDefi(),
      loadCorrelation(),
      loadNews(),
    ]);

    const settled = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      const names = ["simple/price", "markets", "market_chart", "binance", "sentiment", "defi", "correlation", "news"];
      console.error(`API-anrop ${names[i]} misslyckades:`, r.reason);
      return null;
    });

    let simple         = settled[0];
    let marketsArr     = settled[1];
    let market         = settled[2];
    const binance24h   = settled[3];
    const sentimentValue = settled[5];

    // Binance-fallback när CoinGecko rate-limitar (429)
    let usingBinanceFallback = false;
    if (!simple?.ethereum && binance24h?.price) {
      usingBinanceFallback = true;
      simple = {
        ethereum: {
          usd: binance24h.price,
          sek: null,
          usd_24h_change: binance24h.changePct,
          last_updated_at: Math.floor(Date.now() / 1000),
        },
      };
    }
    if (!market) {
      const binHist = await loadBinanceHistory();
      if (binHist) {
        market = {
          prices: binHist.timestamps.map((ts, i) => [ts, binHist.prices[i]]),
          total_volumes: binHist.timestamps.map((ts, i) => [ts, binHist.volumes[i]]),
        };
        usingBinanceFallback = true;
      }
    }
    if (!marketsArr?.[0] && binance24h) {
      marketsArr = [{
        market_cap: null,
        total_volume: binance24h.quoteVolume,
        price_change_percentage_7d_in_currency: null,
        price_change_percentage_30d_in_currency: null,
        ath: null,
        ath_change_percentage: null,
        circulating_supply: null,
        total_supply: null,
      }];
      usingBinanceFallback = true;
    }

    // Om kritiska datakällor misslyckades helt, visa felmeddelande
    if (!simple?.ethereum) {
      els.signalBadge.textContent = "Ofullständig data – kunde inte hämta pris";
      els.signalBadge.className   = "signal-badge signal-error";
    } else if (usingBinanceFallback) {
      els.signalBadge.textContent = "Live-data via Binance (CoinGecko tillfälligt otillgänglig)";
      els.signalBadge.className   = "signal-badge signal-hold";
    } else if (!market) {
      els.signalBadge.textContent = "Ofullständig data – vissa API:er svarar inte";
      els.signalBadge.className   = "signal-badge signal-error";
    }

    // 1) Aktuellt pris
    const eth          = simple?.ethereum;
    const currentPrice = eth?.usd ?? null;
    const change24h    = eth?.usd_24h_change ?? 0;
    lastChange24h = change24h;
    if (eth) {
      els.priceUsd.textContent   = fmtUsd(currentPrice);
      els.priceSek.textContent   = eth.sek != null ? fmtSek(eth.sek) : "– (Binance-fallback)";
      els.change24h.textContent  = fmtPct(change24h);
      els.change24h.className    = `price-small ${change24h >= 0 ? "up" : "down"}`;
      els.lastUpdated.textContent = eth.last_updated_at
        ? new Date(eth.last_updated_at * 1000).toLocaleString("sv-SE")
        : new Date().toLocaleString("sv-SE");
    }
    if (els.priceSourceNote) {
      els.priceSourceNote.textContent = usingBinanceFallback
        ? "Pris & volym via Binance – CoinGecko rate limit aktiv"
        : "";
      els.priceSourceNote.style.display = usingBinanceFallback ? "block" : "none";
    }

    // Gas Tracker (behöver ETH-pris för USD-estimat)
    if (currentPrice) loadGas(currentPrice).catch(e => console.error("Gas Tracker-fel:", e));

    // 2) Marknadsinformation
    const md = marketsArr?.[0];
    let quoteVolume24h = binance24h?.quoteVolume ?? md?.total_volume ?? null;
    if (md) {
      if (md.market_cap != null) els.marketCap.textContent = fmtLarge(md.market_cap);
      els.volume24h.textContent  = fmtLarge(md.total_volume ?? quoteVolume24h);
      if (md.price_change_percentage_7d_in_currency != null) {
        const c7 = md.price_change_percentage_7d_in_currency;
        els.change7d.textContent = fmtPct(c7);
        els.change7d.className = `value ${c7 >= 0 ? "up" : "down"}`;
      }
      if (md.price_change_percentage_30d_in_currency != null) {
        const c30 = md.price_change_percentage_30d_in_currency;
        els.change30d.textContent = fmtPct(c30);
        els.change30d.className = `value ${c30 >= 0 ? "up" : "down"}`;
      }
      if (md.ath != null) {
        els.athPrice.textContent = fmtUsd(md.ath);
        const athDist = md.ath_change_percentage ?? 0;
        els.athDistance.textContent = fmtPct(athDist);
        els.athDistance.className = `value ${athDist >= 0 ? "up" : "down"}`;
      }

      // ETH Tokenomics (supply-data finns i /coins/markets response)
      const circ = md.circulating_supply;
      const total = md.total_supply;
      if (circ) {
        els.supplyCirculating.textContent = `${(circ / 1e6).toFixed(2)}M ETH`;
      }
      if (total) {
        els.supplyTotal.textContent = `${(total / 1e6).toFixed(2)}M ETH`;
      }
      if (circ && total && total > 0) {
        const stakingPct = ((total - circ) / total) * 100;
        els.supplyStakingRatio.textContent = stakingPct > 0.01 ? `~${stakingPct.toFixed(1)}%` : "~0%";
      }
      if (circ && total) {
        const netChange = total - circ;
        const isDeflationary = netChange < 0;
        els.supplyNetIssuance.textContent = isDeflationary ? "Deflationär (burn > issuance)" : "Svagt inflationär";
        els.supplyNetIssuance.className = `value ${isDeflationary ? "up" : ""}`;
      }

      // Staking Dashboard
      if (circ && total && total > circ) {
        const estimatedStaked = total - circ;
        const stakingRatio = (estimatedStaked / total) * 100;

        els.stakingTotalEth.textContent = `~${(estimatedStaked / 1e6).toFixed(2)}M ETH`;

        els.stakingRatioPct.textContent = `${stakingRatio.toFixed(1)}%`;
        els.stakingRatioPct.className = `value ${stakingRatio > 25 ? "up" : ""}`;

        if (lastBestStakingApy != null) {
          els.stakingBestApy.textContent = `${lastBestStakingApy.toFixed(2)}%`;
          els.stakingBestApy.className = "value up";
        }

        if (stakingRatio > 30) {
          els.stakingSecurity.textContent = "Stark";
          els.stakingSecurity.className = "value staking-security-strong";
        } else if (stakingRatio >= 20) {
          els.stakingSecurity.textContent = "God";
          els.stakingSecurity.className = "value staking-security-good";
        } else {
          els.stakingSecurity.textContent = "Lag";
          els.stakingSecurity.className = "value staking-security-low";
        }
      }
    }

    if (quoteVolume24h) {
      renderVolQuickBox([], quoteVolume24h, change24h);
    }

    // 3) 365-dagars historik -> graf + indikatorer + utbrottsanalys
    let prices = [], volumes = [], labels = [];
    let ba = null, latestSma7 = null, latestSma25 = null, latestRsi = null;
    let latestEma12 = null, latestEma26 = null, bb = null;
    let ma50val = null, ma200val = null;

    if (market) {
      prices  = market.prices.map(([, p]) => p);
      volumes = market.total_volumes.map(([, v]) => v);
      labels  = market.prices.map(([ts]) =>
        new Date(ts).toLocaleDateString("sv-SE", { month: "short", day: "numeric" })
      );

      // Spara rådata för multi-timeframe TA-växlare
      rawPrices = prices;
      rawVolumes = volumes;

      // Beräkna MA50/MA200 en gång – används av breakout, rendering och prognos
      ma50val  = sma(prices, 50);
      ma200val = sma(prices, 200);

      // Beräkna stöd/motstånd innan grafen ritas så linjerna syns direkt
      ba = analyzeBreakout(prices, volumes, currentPrice, ma50val, ma200val);
      renderChart(labels, prices, ba.supportLevels, ba.resistanceLevels);

      latestSma7  = sma(prices, 7);
      latestSma25 = sma(prices, 25);
      latestRsi   = rsi(prices, 14);
      latestEma12 = ema(prices, 12);
      latestEma26 = ema(prices, 26);
      bb          = bollingerBands(prices, 20);

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
        const rvol = computeRvol20(volumes);
        const cls = classifyVolume(rvol);
        const trend7 = computeVolTrend7(volumes);
        if (trend7) {
          els.volumeTrend.textContent = `${cls.plainLabel} · ${Math.round(trend7.ratio * 100)}% av veckosnittet`;
          els.volumeTrend.className = `value ${cls.cssClass}`;
        }
      }

      renderVolumeAnalysis(volumes, lastChange24h, "d");
      renderVolQuickBox(volumes, quoteVolume24h, lastChange24h);

      if (md && volumes.length >= 21) {
        const rvol = computeRvol20(volumes);
        const cls = classifyVolume(rvol);
        els.volume24h.textContent = `${fmtLarge(md.total_volume ?? quoteVolume24h)} · ${cls.plainLabel}`;
      }

      // 3b) VWAP & Fibonacci
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
    }

    // 4) Källkort + signalscorecard
    renderSourcesCard(latestRsi, sentimentValue, latestEma12, latestEma26, bb, currentPrice, lastBinancePrice, volumes);

    // 5) Kombinerad köp/sälj-signal (5 faktorer, graderad)
    buildSignal(latestRsi, change24h, sentimentValue, latestEma12, latestEma26, bb, currentPrice, volumes);

    // 6) Utbrottsanalys (ba redan beräknad ovan)
    if (ba) renderBreakoutAnalysis(ba, currentPrice, ma50val, ma200val);

    // 7) Prisprognos (isolerad try-catch så att ett prognosfel inte bryter övrig funktionalitet)
    if (market && currentPrice) {
      try {
        const forecastIndicators = {
          sma7: latestSma7, sma25: latestSma25,
          ema12: latestEma12, ema26: latestEma26,
          rsi: latestRsi, ma50: ma50val, ma200: ma200val,
          bb: bb, sentimentValue: sentimentValue
        };
        const forecasts = calculateForecasts(prices, currentPrice, forecastIndicators);
        renderForecastCard(forecasts, currentPrice);
      } catch (forecastErr) {
        console.error("Prognosberäkning misslyckades:", forecastErr);
        els.forecastContent.textContent = "";
        const errDiv = document.createElement("div");
        errDiv.className = "forecast-unavailable";
        errDiv.textContent = "Kunde inte beräkna prognoser. Datan uppdateras vid nästa cykel.";
        els.forecastContent.appendChild(errDiv);
      }
    }

    // 8) Kontrollera prisalarm
    if (currentPrice) checkAlarms(currentPrice, latestRsi);

  } catch (err) {
    console.error(err);
    els.signalBadge.textContent = "Kunde inte hämta data";
    els.signalBadge.className   = "signal-badge signal-error";
    els.signalReasons.textContent = "";
    const errLi = document.createElement("li");
    errLi.textContent = `${err.message}. Prova att ladda om om en liten stund (API:erna har ibland tillfälliga rate limits).`;
    els.signalReasons.appendChild(errLi);
  }
}

let secondsLeft = REFRESH_SECONDS;
function tickCountdown() {
  secondsLeft -= 1;
  if (secondsLeft <= 0) { secondsLeft = REFRESH_SECONDS; loadData(); }
  els.countdown.textContent = String(secondsLeft);
}

loadData();
setInterval(tickCountdown, 1000);
