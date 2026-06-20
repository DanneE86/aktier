// Datakällor: CoinGecko (pris/historik/marknad), Binance (oberoende prisjämförelse),
// alternative.me (Crypto Fear & Greed Index), DefiLlama (TVL/staking) och Owlracle (gas).
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT";
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

// Rullande MA-serie (null för punkter med otillräcklig historik)
function rollingMa(values, period) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    return values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
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
  // Sorterar på styrka: fler kontakter + nyligare = starkare nivå
  return clusters
    .map(c => ({ ...c, score: c.touches + c.lastIdx / totalLen }))
    .sort((a, b) => b.score - a.score);
}

function analyzeBreakout(prices, volumes, currentPrice) {
  // lookback=3 hittar fler lokala extrempunkter (11-dagars fönster → 7-dagars)
  const { maxima, minima } = findLocalExtremes(prices, 3);
  const n = prices.length;

  const allResistance = clusterLevels(maxima, n);
  const allSupport    = clusterLevels(minima, n);

  // Aktiva motståndsnivåer: sorterade närmast-först
  const resistanceLevels = allResistance
    .filter(c => c.price > currentPrice * 1.005)
    .sort((a, b) => a.price - b.price)
    .slice(0, 6);

  // Aktiva stödnivåer: sorterade närmast-först (högst pris under nuvarande)
  const rawSupport = allSupport
    .filter(c => c.price < currentPrice * 0.995)
    .sort((a, b) => b.price - a.price) // närmast först
    .slice(0, 6);

  // Dynamiska stödnivåer från glidande medelvärden (agerar ofta som stöd)
  const ma50val  = sma(prices, 50);
  const ma200val = sma(prices, 200);
  const dynamicSupport = [];
  if (ma50val  && ma50val  < currentPrice * 0.995) dynamicSupport.push({ price: ma50val,  label: "MA50",  touches: null });
  if (ma200val && ma200val < currentPrice * 0.995) dynamicSupport.push({ price: ma200val, label: "MA200", touches: null });

  // Senaste 20-dagars lägsta (kortsiktigt stöd)
  const low20d = Math.min(...prices.slice(-20));
  if (low20d < currentPrice * 0.995) {
    dynamicSupport.push({ price: low20d, label: "20d-lägsta", touches: null });
  }

  // Slå ihop och sortera närmast-först
  const supportLevels = [
    ...rawSupport,
    ...dynamicSupport.filter(d => !rawSupport.some(s => Math.abs(s.price - d.price) / d.price < 0.02)),
  ].sort((a, b) => b.price - a.price).slice(0, 8);

  // Bruten motståndsnivå: pris har nyligen (senaste 7 dagarna) passerat uppåt
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

function renderBreakoutAnalysis(ba, prices, currentPrice) {
  const ma50val  = sma(prices, 50);
  const ma200val = sma(prices, 200);

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
  const volPct = (ba.volRatio * 100).toFixed(0);
  els.volConfirm.textContent = `${ba.isVolumeConfirmed ? "✓ Hög" : "✗ Normal/låg"} · ${volPct}% av 20d-snitt`;
  els.volConfirm.className = `value ${ba.isVolumeConfirmed ? "up" : "down"}`;

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

function renderSourcesCard(latestSma7, latestSma25, latestRsi, sentimentValue, latestEma12, latestEma26, bb, currentPrice, binancePrice) {
  // ── Källstatus ──────────────────────────────────────────────────────────
  // CoinGecko: blandat om indikatorerna pekar åt olika håll
  const cgSignals = [
    latestSma7 && latestSma25 ? (latestSma7 > latestSma25 ? 1 : -1) : 0,
    latestRsi ? (latestRsi < 30 ? 1 : latestRsi > 70 ? -1 : 0) : 0,
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
    if (sentimentValue <= 24)      { sentEl.textContent = `Positiv (${sentimentValue}/100 – Extrem rädsla)`; sentEl.className = "src-badge src-positive"; }
    else if (sentimentValue >= 76) { sentEl.textContent = `Negativ (${sentimentValue}/100 – Extrem girighet)`; sentEl.className = "src-badge src-negative"; }
    else if (sentimentValue >= 55) { sentEl.textContent = `Neutral/negativ (${sentimentValue}/100)`; sentEl.className = "src-badge src-mixed"; }
    else                           { sentEl.textContent = `Neutral (${sentimentValue}/100)`; sentEl.className = "src-badge src-neutral"; }
  }

  // ── Signalscorecard per indikator ──────────────────────────────────────
  const scorecard = document.getElementById("signal-scorecard");
  scorecard.textContent = "";

  const items = [
    {
      label: "SMA (Glidande medelvärde)",
      value: latestSma7 && latestSma25 ? `${fmtUsd(latestSma7)} / ${fmtUsd(latestSma25)}` : "–",
      score: latestSma7 && latestSma25 ? (latestSma7 > latestSma25 ? 1 : -1) : 0,
      signalText: latestSma7 && latestSma25 ? (latestSma7 > latestSma25 ? "▲ Positiv (golden cross)" : "▼ Negativ (death cross)") : "–",
    },
    {
      label: "RSI (Köpt/sålt-nivå)",
      value: latestRsi ? latestRsi.toFixed(1) : "–",
      score: latestRsi ? (latestRsi < 30 ? 1 : latestRsi > 70 ? -1 : 0) : 0,
      signalText: latestRsi
        ? (latestRsi < 30 ? "▲ Positiv (översåld)" : latestRsi > 70 ? "▼ Negativ (överköpt)" : "● Neutral")
        : "–",
    },
    {
      label: "MACD (EMA12 vs EMA26)",
      value: latestEma12 && latestEma26 ? `${latestEma12 > latestEma26 ? "+" : ""}${(latestEma12 - latestEma26).toFixed(2)}` : "–",
      score: latestEma12 && latestEma26 ? (latestEma12 > latestEma26 ? 1 : -1) : 0,
      signalText: latestEma12 && latestEma26 ? (latestEma12 > latestEma26 ? "▲ Positiv (bullish)" : "▼ Negativ (bearish)") : "–",
    },
    {
      label: "Bollinger Bands (20d)",
      value: bb && currentPrice ? `${(bb.upper - bb.lower > 0 ? ((currentPrice - bb.lower) / (bb.upper - bb.lower) * 100).toFixed(0) : "50")}% i bandet` : "–",
      score: bb && currentPrice ? (currentPrice < bb.lower ? 1 : currentPrice > bb.upper ? -1 : 0) : 0,
      signalText: bb && currentPrice
        ? (currentPrice < bb.lower ? "▲ Positiv (under nedre band)" : currentPrice > bb.upper ? "▼ Negativ (över övre band)" : "● Neutral (inom band)")
        : "–",
    },
    {
      label: "Fear & Greed (Sentiment)",
      value: typeof sentimentValue === "number" ? `${sentimentValue}/100` : "–",
      score: typeof sentimentValue === "number" ? (sentimentValue <= 24 ? 1 : sentimentValue >= 76 ? -1 : 0) : 0,
      signalText: typeof sentimentValue === "number"
        ? (sentimentValue <= 24 ? "▲ Positiv (extrem rädsla)" : sentimentValue >= 76 ? "▼ Negativ (extrem girighet)" : "● Neutral")
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

function buildSignal(latestSma7, latestSma25, latestRsi, change24h, sentimentValue, latestEma12, latestEma26, bb, currentPrice) {
  const reasons = [];
  let score = 0;

  if (latestSma7 !== null && latestSma25 !== null) {
    if (latestSma7 > latestSma25) {
      score += 1;
      reasons.push({ score: 1, text: `▲ SMA7 (${fmtUsd(latestSma7)}) > SMA25 (${fmtUsd(latestSma25)}) → uppåttrend, "golden cross".` });
    } else {
      score -= 1;
      reasons.push({ score: -1, text: `▼ SMA7 (${fmtUsd(latestSma7)}) < SMA25 (${fmtUsd(latestSma25)}) → nedåttrend, "death cross".` });
    }
  }

  if (latestRsi !== null) {
    if (latestRsi < 30) {
      score += 1;
      reasons.push({ score: 1, text: `▲ RSI ${latestRsi.toFixed(1)} (under 30) → översåld, möjlig rekyl uppåt.` });
    } else if (latestRsi > 70) {
      score -= 1;
      reasons.push({ score: -1, text: `▼ RSI ${latestRsi.toFixed(1)} (över 70) → överköpt, möjlig rekyl nedåt.` });
    } else {
      reasons.push({ score: 0, text: `● RSI ${latestRsi.toFixed(1)} → neutralt läge (30–70).` });
    }
  }

  if (latestEma12 !== null && latestEma26 !== null) {
    if (latestEma12 > latestEma26) {
      score += 1;
      reasons.push({ score: 1, text: `▲ EMA12 (${fmtUsd(latestEma12)}) > EMA26 (${fmtUsd(latestEma26)}) → positiv momentum, MACD bullish.` });
    } else {
      score -= 1;
      reasons.push({ score: -1, text: `▼ EMA12 (${fmtUsd(latestEma12)}) < EMA26 (${fmtUsd(latestEma26)}) → negativ momentum, MACD bearish.` });
    }
  }

  if (bb !== null && currentPrice !== null) {
    if (currentPrice < bb.lower) {
      score += 1;
      reasons.push({ score: 1, text: `▲ Pris (${fmtUsd(currentPrice)}) under Bollingers nedre band (${fmtUsd(bb.lower)}) → potentiellt översålt.` });
    } else if (currentPrice > bb.upper) {
      score -= 1;
      reasons.push({ score: -1, text: `▼ Pris (${fmtUsd(currentPrice)}) över Bollingers övre band (${fmtUsd(bb.upper)}) → potentiellt överköpt.` });
    } else {
      const bbRange = bb.upper - bb.lower;
      const pct = bbRange > 0 ? ((currentPrice - bb.lower) / bbRange * 100).toFixed(0) : "50";
      reasons.push({ score: 0, text: `● Pris inom Bollingers band (${pct}% från nedre kant) → neutralt.` });
    }
  }

  if (typeof sentimentValue === "number") {
    if (sentimentValue <= 24) {
      score += 1;
      reasons.push({ score: 1, text: `▲ Sentiment: Extrem rädsla (${sentimentValue}/100) → contrarian köpsignal.` });
    } else if (sentimentValue >= 76) {
      score -= 1;
      reasons.push({ score: -1, text: `▼ Sentiment: Extrem girighet (${sentimentValue}/100) → varningssignal om möjlig topp.` });
    } else {
      reasons.push({ score: 0, text: `● Sentiment: ${sentimentValue}/100 → varken extrem rädsla eller girighet.` });
    }
  }

  if (typeof change24h === "number") {
    reasons.push({ score: 0, text: `ℹ 24h prisförändring: ${fmtPct(change24h)}.` });
  }
  reasons.push({ score: 0, text: "⚠ Historiska mönster är inga garantier för framtida utveckling." });

  const bullCount = reasons.filter(r => r.score > 0).length;
  const bearCount = reasons.filter(r => r.score < 0).length;
  const summary   = `${bullCount} köp, ${bearCount} sälj`;

  if (score >= 3)       setSignal("buy",  `Möjligt köpläge  ·  ${summary}`, reasons);
  else if (score <= -3) setSignal("sell", `Möjligt säljläge  ·  ${summary}`, reasons);
  else                  setSignal("hold", `Avvakta / neutralt  ·  ${summary}`, reasons);
}

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
  lastUpdated: "2026-06-19",
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
    }
  }
};

const FORECAST_WEIGHTS = {
  7:   { A: 0.25, B: 0.35, C: 0.40, D: 0 },
  30:  { A: 0.30, B: 0.30, C: 0.30, D: 0.10 },
  365: { A: 0.20, B: 0.20, C: 0.20, D: 0.40 },
  730: { A: 0.15, B: 0.15, C: 0.15, D: 0.55 },
};

function forecastLinearRegression(prices, daysAhead) {
  const n = prices.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += prices[i];
    sumXY += i * prices[i]; sumXX += i * i;
  }
  const xMean = sumX / n;
  const yMean = sumY / n;
  const SSxx = sumXX - n * xMean * xMean;
  const SSxy = sumXY - n * xMean * yMean;
  if (SSxx === 0) return null;
  const slope = SSxy / SSxx;
  const intercept = yMean - slope * xMean;
  const forecastDay = n + daysAhead;
  const forecastPrice = intercept + slope * forecastDay;
  // Residual standard error
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    ssRes += Math.pow(prices[i] - predicted, 2);
  }
  const residualStd = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
  const margin = residualStd * Math.sqrt(1 + 1 / n + Math.pow(forecastDay - xMean, 2) / SSxx) * 1.96;
  return {
    price: forecastPrice,
    upper: forecastPrice + margin,
    lower: Math.max(0, forecastPrice - margin),
  };
}

function forecastHolts(prices, daysAhead) {
  const n = prices.length;
  if (n < 2) return null;
  const alpha = 0.3, beta = 0.1;
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
  const forecastPrice = level + trend * daysAhead;
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

  // Adjustment factor by horizon
  const adjustFactors = { 7: 0.2, 30: 0.3, 365: 0.4, 730: 0.5 };
  const adjustFactor = adjustFactors[daysAhead] || 0.3;
  const adjustedDaily = baseDailyReturn * (1 + trendMultiplier * adjustFactor);
  let forecastPrice = currentPrice * Math.pow(1 + adjustedDaily, daysAhead);

  // Clamp: 1 week max 1.3x, 1 month max 1.8x, 1 year max 3x, 2 years max 5x
  if (daysAhead <= 7) {
    forecastPrice = Math.min(forecastPrice, currentPrice * 1.3);
    forecastPrice = Math.max(forecastPrice, currentPrice * 0.7);
  } else if (daysAhead <= 30) {
    forecastPrice = Math.min(forecastPrice, currentPrice * 1.8);
    forecastPrice = Math.max(forecastPrice, currentPrice * 0.3);
  } else if (daysAhead >= 365 && daysAhead < 730) {
    forecastPrice = Math.min(forecastPrice, currentPrice * 3);
  } else if (daysAhead >= 730) {
    forecastPrice = Math.min(forecastPrice, currentPrice * 5);
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

function forecastConsensus(daysAhead) {
  const horizonData = ANALYST_FORECASTS.horizons[daysAhead];
  if (!horizonData) return null;
  const analysts = horizonData.analysts;
  if (!analysts || analysts.length === 0) return null;
  const avgPrice = analysts.reduce((s, a) => s + a.avg, 0) / analysts.length;
  const low = Math.min(...analysts.map(a => a.low));
  const high = Math.max(...analysts.map(a => a.high));
  return {
    price: avgPrice,
    upper: high,
    lower: Math.max(0, low),
    analysts: analysts,
    year: horizonData.year,
  };
}

function calculateForecasts(prices, currentPrice, indicators) {
  const horizons = [7, 30, 365, 730];
  const results = {};

  for (const daysAhead of horizons) {
    const weights = { ...FORECAST_WEIGHTS[daysAhead] };
    const methods = {};

    // Method A: Linear regression
    methods.A = forecastLinearRegression(prices, daysAhead);

    // Method B: Holt's exponential smoothing
    methods.B = forecastHolts(prices, daysAhead);

    // Method C: MA-momentum
    methods.C = forecastMomentum(prices, currentPrice, indicators, daysAhead);

    // Method D: Consensus (only for 365d and 730d effectively)
    methods.D = forecastConsensus(daysAhead);

    // Redistribute weights if a method returns null
    let totalWeight = 0;
    const activeWeights = {};
    for (const key of ["A", "B", "C", "D"]) {
      if (methods[key] != null) {
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

    // Sentiment adjustment
    const sentimentVal = indicators.sentimentValue;
    if (typeof sentimentVal === "number") {
      let sentAdj = 1;
      if (sentimentVal <= 20) sentAdj = 1.05;
      else if (sentimentVal >= 80) sentAdj = 0.95;
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

    // Confidence level
    const spreadPct = currentPrice > 0 ? (wUpper - wLower) / currentPrice * 100 : 100;
    let confidenceLevel, confidenceClass;
    if (spreadPct < 15) {
      confidenceLevel = "Hög"; confidenceClass = "forecast-conf-high";
    } else if (spreadPct < 40) {
      confidenceLevel = "Medel"; confidenceClass = "forecast-conf-medium";
    } else if (spreadPct < 80) {
      confidenceLevel = "Låg"; confidenceClass = "forecast-conf-low";
    } else {
      confidenceLevel = "Mycket låg"; confidenceClass = "forecast-conf-verylow";
    }

    // Confidence bar position (0-100)
    const confBarPct = Math.max(0, Math.min(100, 100 - spreadPct));

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
    return;
  }

  const currentPrice = lastCurrentPrice;

  // Price display: low | FORECAST | high
  const pricesRow = document.createElement("div");
  pricesRow.className = "forecast-prices";

  const lowBound = document.createElement("div");
  lowBound.className = "forecast-bound";
  const lowLabel = document.createElement("span");
  lowLabel.className = "forecast-bound-label";
  lowLabel.textContent = "Lägsta";
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
  mainSublabel.textContent = "Prognos";
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
  highLabel.textContent = "Högsta";
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
  };

  const methodsBox = document.createElement("div");
  methodsBox.className = "forecast-methods";
  const methodsTitle = document.createElement("div");
  methodsTitle.className = "forecast-methods-title";
  methodsTitle.textContent = "Metod-breakdown";
  methodsBox.appendChild(methodsTitle);

  for (const key of ["A", "B", "C", "D"]) {
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
    const allLow = Math.min(...fc.methods.D.analysts.map(a => a.low));
    const allHigh = Math.max(...fc.methods.D.analysts.map(a => a.high));
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

  // Disclaimer
  const disc = document.createElement("p");
  disc.className = "forecast-disclaimer";
  disc.textContent = "Prognoser baseras på historiska prisdata, tekniska indikatorer och analytikerestimat. " +
    "Kryptovalutor är extremt volatila och dessa prognoser är INTE finansiell rådgivning. " +
    "Gör alltid din egen research (DYOR) och investera bara pengar du har råd att förlora.";
  container.appendChild(disc);

  // Update chart with forecast data
  updateChartWithForecast(horizon, fc, currentPrice);
}

// Store original chart data for reset on tab switch
let chartHistLabels = null;
let chartHistDatasets = null;

function updateChartWithForecast(horizon, fc, currentPrice) {
  if (!chart) return;

  // Deep-clone a dataset, ensuring arrays are not shared references
  function cloneDataset(ds) {
    const copy = { ...ds, data: [...ds.data] };
    if (Array.isArray(ds.borderDash)) copy.borderDash = [...ds.borderDash];
    return copy;
  }

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
  for (let i = 0; i <= points; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + Math.round((i / points) * horizon));
    futureLabels.push(d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" }));
    const t = i / points;
    futurePrices.push(currentPrice + (fc.price - currentPrice) * t);
    futureUpper.push(currentPrice + (fc.upper - currentPrice) * t);
    futureLower.push(currentPrice + (fc.lower - currentPrice) * t);
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

async function loadBinancePrice() {
  try {
    const ticker = await fetchJson(BINANCE_TICKER_URL);
    lastBinancePrice = parseFloat(ticker.price);
    els.priceBinance.textContent = fmtUsd(lastBinancePrice);
  } catch {
    els.priceBinance.textContent = "Ej tillgängligt";
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
    const [simple, marketsArr, market, , sentimentValue, , , , ,] = await Promise.all([
      fetchJson(`${COINGECKO_BASE}/simple/price?ids=ethereum&vs_currencies=usd,sek&include_24hr_change=true&include_last_updated_at=true`),
      fetchJson(`${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=ethereum&per_page=1&page=1&price_change_percentage=7d,30d`),
      fetchJson(`${COINGECKO_BASE}/coins/ethereum/market_chart?vs_currency=usd&days=365&interval=daily`),
      loadBinancePrice(),
      loadSentiment(),
      loadDefi(),
      loadCorrelation(),
      loadNews(),
    ]);

    // 1) Aktuellt pris
    const eth          = simple.ethereum;
    const currentPrice = eth.usd;
    els.priceUsd.textContent   = fmtUsd(currentPrice);
    els.priceSek.textContent   = fmtSek(eth.sek);
    const change24h            = eth.usd_24h_change ?? 0;
    els.change24h.textContent  = fmtPct(change24h);
    els.change24h.className    = `price-small ${change24h >= 0 ? "up" : "down"}`;
    els.lastUpdated.textContent = new Date(eth.last_updated_at * 1000).toLocaleString("sv-SE");

    // Gas Tracker (behöver ETH-pris för USD-estimat)
    loadGas(currentPrice).catch(e => console.error("Gas Tracker-fel:", e));

    // 2) Marknadsinformation
    const md = marketsArr[0];
    if (md) {
      els.marketCap.textContent  = fmtLarge(md.market_cap);
      els.volume24h.textContent  = fmtLarge(md.total_volume);
      const c7  = md.price_change_percentage_7d_in_currency  ?? 0;
      const c30 = md.price_change_percentage_30d_in_currency ?? 0;
      els.change7d.textContent   = fmtPct(c7);
      els.change7d.className     = `value ${c7  >= 0 ? "up" : "down"}`;
      els.change30d.textContent  = fmtPct(c30);
      els.change30d.className    = `value ${c30 >= 0 ? "up" : "down"}`;
      els.athPrice.textContent   = fmtUsd(md.ath);
      const athDist              = md.ath_change_percentage ?? 0;
      els.athDistance.textContent = fmtPct(athDist);
      els.athDistance.className  = `value ${athDist >= 0 ? "up" : "down"}`;
    }

    // 3) 365-dagars historik → graf + indikatorer + utbrottsanalys
    const prices  = market.prices.map(([, p]) => p);
    const volumes = market.total_volumes.map(([, v]) => v);
    const labels  = market.prices.map(([ts]) =>
      new Date(ts).toLocaleDateString("sv-SE", { month: "short", day: "numeric" })
    );

    // Beräkna stöd/motstånd innan grafen ritas så linjerna syns direkt
    const ba = analyzeBreakout(prices, volumes, currentPrice);
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
      const todayVol = volumes[volumes.length - 1];
      const avg7     = volumes.slice(volumes.length - 8, volumes.length - 1).reduce((a, b) => a + b, 0) / 7;
      if (avg7 > 0) {
        const volChg   = ((todayVol - avg7) / avg7) * 100;
        els.volumeTrend.textContent = `${fmtPct(volChg)} vs 7-dagars snitt`;
        els.volumeTrend.className   = `value ${volChg >= 0 ? "up" : "down"}`;
      } else {
        els.volumeTrend.textContent = "Ingen volymdata";
      }
    }

    // 4) Källkort + signalscorecard
    renderSourcesCard(latestSma7, latestSma25, latestRsi, sentimentValue, latestEma12, latestEma26, bb, currentPrice, lastBinancePrice);

    // 5) Kombinerad köp/sälj-signal (5 faktorer)
    buildSignal(latestSma7, latestSma25, latestRsi, change24h, sentimentValue, latestEma12, latestEma26, bb, currentPrice);

    // 6) Utbrottsanalys (ba redan beräknad ovan)
    renderBreakoutAnalysis(ba, prices, currentPrice);

    // 7) Prisprognos (isolerad try-catch så att ett prognosfel inte bryter övrig funktionalitet)
    try {
      const forecastIndicators = {
        sma7: latestSma7, sma25: latestSma25,
        ema12: latestEma12, ema26: latestEma26,
        rsi: latestRsi, ma50: sma(prices, 50), ma200: sma(prices, 200),
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

    // 8) Kontrollera prisalarm
    checkAlarms(currentPrice, latestRsi);

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
