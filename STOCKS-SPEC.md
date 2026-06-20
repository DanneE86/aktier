# Kravspecifikation: Aktieanalys-sida (stocks.html)

> Version 1.0 | 2026-06-19
> Tillhör Ethereum Tracker-projektet (c:\Users\Danie\Desktop\eth)
> Filer att skapa: `stocks.html`, `stocks.js`, `stocks-style.css`

---

## 1. API-RESEARCH: Tillgangliga gratis aktie-API:er

### 1.1 REKOMMENDERAT PRIMARVAL: Twelve Data

| Egenskap | Detalj |
|---|---|
| **Sajt** | https://twelvedata.com |
| **Gratis tier** | 800 API-credits/dag, 8 anrop/minut |
| **API-nyckel** | Kravs (gratis registrering, inget kreditkort) |
| **Datadelay** | 4 timmars fordrojning pa aktiekurser |
| **Historisk data** | Full historik, 1 min till manatlig upplasning |
| **Tekniska indikatorer** | 100+ indikatorer beraknade serverside (SMA, EMA, RSI, MACD, Bollinger, ATR m.fl.) |
| **Fundamental data** | Earnings, financials (begransat pa fri plan) |
| **Svenska aktier** | JA -- stodd for OMX Stockholm via exchange-kod |
| **Ticker-format SE** | `VOLV-B:STO` eller `ATCO-A:STO` |
| **Ticker-format US** | `AAPL`, `NVDA`, `MSFT` |
| **Nyheter** | Nej pa fri plan |
| **CORS** | Ja, kan anropas fran frontend |

**Relevanta endpoints (Twelve Data):**

```
GET https://api.twelvedata.com/quote?symbol=VOLV-B:STO&apikey=KEY
GET https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&outputsize=200&apikey=KEY
GET https://api.twelvedata.com/sma?symbol=AAPL&interval=1day&time_period=50&apikey=KEY
GET https://api.twelvedata.com/rsi?symbol=AAPL&interval=1day&time_period=14&apikey=KEY
GET https://api.twelvedata.com/macd?symbol=AAPL&interval=1day&apikey=KEY
GET https://api.twelvedata.com/ema?symbol=AAPL&interval=1day&time_period=20&apikey=KEY
```

### 1.2 SEKUNDARVAL: Alpha Vantage

| Egenskap | Detalj |
|---|---|
| **Sajt** | https://www.alphavantage.co |
| **Gratis tier** | 25 anrop/dag, 5 anrop/minut |
| **API-nyckel** | Kravs (gratis registrering) |
| **Datadelay** | 15 minuter |
| **Svenska aktier** | JA -- tickerformat `STO:VOLV-B` |
| **Fundamental data** | P/E, EPS, market cap via OVERVIEW-endpoint |
| **Begransning** | Mycket lag daglig grans (25/dag) -- laggs som fallback |

**Relevanta endpoints (Alpha Vantage):**

```
GET https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=STO:VOLV-B&apikey=KEY
GET https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=AAPL&outputsize=compact&apikey=KEY
GET https://www.alphavantage.co/query?function=OVERVIEW&symbol=AAPL&apikey=KEY
GET https://www.alphavantage.co/query?function=RSI&symbol=AAPL&interval=daily&time_period=14&series_type=close&apikey=KEY
```

### 1.3 TERTIARVAL: Finnhub (for realtidskurser + nyheter)

| Egenskap | Detalj |
|---|---|
| **Sajt** | https://finnhub.io |
| **Gratis tier** | 60 anrop/minut |
| **API-nyckel** | Kravs (gratis registrering) |
| **Datadelay** | 20 minuters fordrojning (US), realtid via WebSocket |
| **Svenska aktier** | NEJ pa fri plan (kravs Premium for internationella borser) |
| **Nyheter** | JA -- Company News-endpoint finns pa fri plan |
| **Fundamental data** | Begransad (basic financials) |

**Relevanta endpoints (Finnhub):**

```
GET https://finnhub.io/api/v1/quote?symbol=AAPL&token=KEY
GET https://finnhub.io/api/v1/company-news?symbol=AAPL&from=2026-06-01&to=2026-06-19&token=KEY
GET https://finnhub.io/api/v1/stock/metric?symbol=AAPL&metric=all&token=KEY
```

### 1.4 TILLVAL: Financial Modeling Prep (FMP)

| Egenskap | Detalj |
|---|---|
| **Sajt** | https://site.financialmodelingprep.com |
| **Gratis tier** | 250 anrop/dag |
| **Svenska aktier** | NEJ (US-only pa fri plan) |
| **Fundamental data** | Omfattande: income statement, balance sheet, ratios |

### 1.5 BORTSORTERADE

| API | Anledning |
|---|---|
| **Yahoo Finance** | Inget officiellt API sedan 2017. Inofficiella scrapers blockeras aktivt, CAPTCHA-krav, kan inte anvandas fran ren frontend. |
| **Polygon.io** | Inget gratis tier. Borjar pa $99/man. |

### 1.6 REKOMMENDERAD API-STRATEGI

Anvand **Twelve Data som primarAPI** for:
- Aktuella kurser (quote)
- Historisk kursdata (time_series)
- Tekniska indikatorer (sma, ema, rsi, macd) -- beraknas serverside, sparar credits

Anvand **Finnhub som komplement** for:
- Aktienyheter (company-news) -- bara for US-aktier
- Extra fundamental data

Anvand **Alpha Vantage som fallback** for:
- Fundamental data (OVERVIEW-endpoint) -- P/E, EPS, market cap
- Om Twelve Data-credits ar slut

**Budget per session (Twelve Data):**
- 13 aktier x 4 endpoints (quote + time_series + rsi + macd) = 52 credits
- Laddas vid sidvisning + vid klick pa detaljer
- 800 credits/dag rackar for ~15 fullstandiga laddningar

---

## 2. HARDKODADE AKTIELISTOR MED REKOMMENDATIONER

### 2.1 KORTSIKTIGA PICKS (1 vecka -- 1 manad)

```javascript
const SHORT_TERM_PICKS = [
  {
    name: "Norion Bank",
    ticker: "NORION:STO",
    tickerDisplay: "NORION",
    market: "SE",
    sector: "Finans",
    recommendation: "KOP",
    timeHorizon: "1-4 veckor",
    motivation: "Extremt stark momentum -- +222% pa en vecka, 12 135 nya agare pa Avanza. " +
                "Ny bankaktie med omvarderingspotential efter notering. Hog handelsvolym signalerar institutionellt intresse.",
    targetPrice: null, // Ny aktie, ej tillrackligt med analytikerdata
    stopLossPercent: 15,
    riskLevel: "HOG",
    riskScore: 5 // 1-5, 5=hogst
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
    targetPrice: 250, // USD, konservativt kortsiktigt
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
    targetPrice: 365, // SEK
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
    recommendation: "KOP",
    timeHorizon: "1-3 veckor",
    motivation: "SEB riktkurs 110 SEK (kop), nuvarande kurs runt 84 SEK ger 31% uppsida. " +
                "5G-utbyggnad accelererar globalt. 5 av 11 analytiker har kop.",
    targetPrice: 110, // SEK
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
    motivation: "SEB hojer riktkurs till 700 SEK. Konsensus 625 SEK ger 16% uppsida fran 536 SEK. " +
                "Rekordkvartal Q1 2026: +23,6% organisk tillvaxt, rorelseresultat +32%. " +
                "Europeisk forsvarssatsning driver ordern.",
    targetPrice: 625, // SEK (konsensus)
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
  }
];
```

### 2.2 LANGSIKTIGA PICKS (1-5+ ar)

```javascript
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
    targetPrice: null, // Investmentbolag -- varderas pa substansvarde
    stopLossPercent: null, // Langsiktig -- ingen stopp-loss
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
    targetPrice: 140, // SEK
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
    targetPrice: 194, // SEK
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
    targetPrice: 570, // USD
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
    targetPrice: null, // Buy-and-hold
    stopLossPercent: null,
    riskLevel: "MYCKET LAG",
    riskScore: 1,
    isDividendStock: true,
    dividendYield: "2.7%"
  },
  {
    name: "Johnson & Johnson",
    ticker: "JNJ",
    tickerDisplay: "JNJ",
    market: "US",
    sector: "Halsoyard / Pharma",
    recommendation: "KOP",
    timeHorizon: "5+ ar",
    motivation: "30+ ar av utdelningshojningar. Senaste hojning april 2026: +3,1% till $1,34/kvartal. " +
                "Direktavkastning 2,4%. Diversifierad halsovardsjatte med stabil intjaning. " +
                "Defensiv kvalitetsaktie for all-weather-portfolj.",
    targetPrice: null, // Buy-and-hold
    stopLossPercent: null,
    riskLevel: "MYCKET LAG",
    riskScore: 1,
    isDividendStock: true,
    dividendYield: "2.4%"
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
    targetPrice: 313, // USD
    stopLossPercent: null,
    riskLevel: "LAG",
    riskScore: 1,
    isDividendStock: false
  }
];
```

---

## 3. DETALJERAD UI/UX-SPECIFIKATION

### 3.1 Design System (matchande ETH Tracker)

#### Farger (exakt fran befintlig style.css)

```css
/* Bakgrunder */
--bg-body:           linear-gradient(180deg, #0f1320 0%, #1a1f33 100%);
--bg-card:           #1c2236;
--bg-card-inner:     #151929;
--border-card:       #2b3252;
--border-subtle:     #1a2040;

/* Text */
--text-primary:      #e7e9f0;
--text-secondary:    #c7cdf0;
--text-muted:        #9aa0b4;
--text-label:        #8b91ab;

/* Accent */
--accent-blue:       #6dd5ed;
--accent-purple:     #8a9cff;
--gradient-heading:  linear-gradient(90deg, #8a9cff, #6dd5ed);

/* Signal-farger */
--color-buy:         #4ce081;  /* gron */
--color-buy-bg:      rgba(46, 204, 113, 0.18);
--color-buy-border:  #2ecc71;

--color-sell:        #ff6f61;  /* rod */
--color-sell-bg:     rgba(231, 76, 60, 0.18);
--color-sell-border: #e74c3c;

--color-hold:        #f4d35e;  /* gul */
--color-hold-bg:     rgba(241, 196, 15, 0.15);
--color-hold-border: #f1c40f;

/* Typsnitt */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

#### Gemensamma komponenter som ATERANVANDS

- `.card` -- kortbakgrund med border-radius: 14px
- `.card h2` -- kortrubrik
- `.label` -- liten uppercase etikett
- `.price-small` -- sekundarvardes-typsnitt
- `.indicators` / `.indicator` -- flexbox-grid for indikatorer
- `.signal-badge` -- rund signal-knapp (kop/salj/behall)
- `.signal-buy`, `.signal-sell`, `.signal-hold` -- signalfarger
- `.disclaimer` -- varningstext
- `.ta-badge` -- liten badge for "TA"
- `.forecast-tab` / `.forecast-tab-active` -- fliknavigering

### 3.2 HTML-STRUKTUR: stocks.html

```html
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aktieanalys - Kop/Salj-signaler & Teknisk Analys</title>
  <link rel="stylesheet" href="style.css">        <!-- Gemensam bas -->
  <link rel="stylesheet" href="stocks-style.css">  <!-- Aktiesidans egna stilar -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3"></script>
</head>
<body>
  <div class="container">

    <!-- ===== NAVIGATION ===== -->
    <nav class="nav-bar">
      <a href="index.html" class="nav-link">
        <span class="nav-icon">Xi</span> ETH Tracker
      </a>
      <a href="stocks.html" class="nav-link nav-link-active">
        <span class="nav-icon">$</span> Aktieanalys
      </a>
    </nav>

    <!-- ===== HEADER ===== -->
    <header>
      <h1>Aktieanalys</h1>
      <p class="subtitle">Kop/salj-signaler, tekniska indikatorer & bevakningslista for svenska och amerikanska aktier</p>
    </header>

    <!-- ===== API-STATUS ===== -->
    <section id="api-status-card" class="card">
      <div class="api-status-row">
        <span class="label">Datakalla</span>
        <span id="api-status-badge" class="src-badge src-neutral">Ansluter...</span>
        <span class="label" style="margin-left:auto">Senast uppdaterad</span>
        <span id="stocks-last-updated" class="price-small">--</span>
      </div>
      <p class="auto-refresh">
        Data fordrojd ~4 timmar (Twelve Data gratis-tier) -- nasta uppdatering om <span id="stocks-countdown">300</span> s
      </p>
    </section>

    <!-- ===== FLIKNAVIGERING: TIDSHORISONT ===== -->
    <section class="card" id="horizon-card">
      <div class="stock-tabs">
        <button class="stock-tab stock-tab-active" data-horizon="short">
          Kortsiktig (1v-1m)
        </button>
        <button class="stock-tab" data-horizon="long">
          Langsiktig (ar)
        </button>
      </div>

      <!-- FILTER-RAD -->
      <div class="stock-filters">
        <div class="filter-group">
          <span class="label">Marknad</span>
          <div class="filter-buttons">
            <button class="filter-btn filter-btn-active" data-market="all">Alla</button>
            <button class="filter-btn" data-market="SE">Sverige</button>
            <button class="filter-btn" data-market="US">USA</button>
          </div>
        </div>
        <div class="filter-group">
          <span class="label">Sortera</span>
          <select id="sort-select" class="alarm-select">
            <option value="signal">Signal (kop forst)</option>
            <option value="risk">Riskniva (lagst forst)</option>
            <option value="sector">Sektor (A-O)</option>
            <option value="name">Namn (A-O)</option>
          </select>
        </div>
      </div>
    </section>

    <!-- ===== AKTIELISTA ===== -->
    <section id="stock-list-section">
      <!-- Renderas dynamiskt av stocks.js -->
      <!-- Varje aktie renderas som ett .stock-card (se nedan) -->
    </section>

    <!-- ===== DETALJVY (MODAL / EXPANDERAD) ===== -->
    <section id="stock-detail-overlay" class="stock-detail-overlay" style="display:none">
      <div class="stock-detail-container card">
        <button id="detail-close-btn" class="detail-close-btn">X Stang</button>

        <!-- Rubrik -->
        <div class="detail-header">
          <div>
            <h2 id="detail-name">--</h2>
            <span id="detail-ticker" class="detail-ticker">--</span>
            <span id="detail-market-badge" class="detail-market-badge">--</span>
            <span id="detail-sector" class="detail-sector">--</span>
          </div>
          <div class="detail-price-block">
            <span id="detail-price" class="price">--</span>
            <span id="detail-change" class="price-small">--</span>
          </div>
        </div>

        <!-- Signal -->
        <div class="detail-signal-row">
          <span id="detail-signal-badge" class="signal-badge signal-loading">--</span>
          <div class="detail-signal-meta">
            <span class="label">Tidshorisont</span>
            <span id="detail-time-horizon" class="price-small">--</span>
            <span class="label">Riskniva</span>
            <span id="detail-risk-level" class="price-small">--</span>
          </div>
        </div>

        <!-- Motivering -->
        <div class="detail-motivation-card">
          <h3 class="ta-subtitle">Motivering</h3>
          <p id="detail-motivation">--</p>
          <div class="detail-targets">
            <div class="indicator">
              <span class="label">Riktkurs</span>
              <span id="detail-target-price" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">Stop-Loss</span>
              <span id="detail-stop-loss" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">Uppsida</span>
              <span id="detail-upside" class="value">--</span>
            </div>
          </div>
        </div>

        <!-- Prisgraf -->
        <div class="detail-chart-section">
          <h3 class="ta-subtitle">Prishistorik (6 manader) <span class="ta-badge">TA</span></h3>
          <canvas id="detail-chart" height="200"></canvas>
        </div>

        <!-- Tekniska indikatorer -->
        <div class="detail-ta-section">
          <h3 class="ta-subtitle">Tekniska indikatorer <span class="ta-badge">TA</span></h3>
          <div class="indicators">
            <div class="indicator">
              <span class="label">SMA 20</span>
              <span id="detail-sma20" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">SMA 50</span>
              <span id="detail-sma50" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">EMA 12</span>
              <span id="detail-ema12" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">EMA 26</span>
              <span id="detail-ema26" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">RSI (14)</span>
              <span id="detail-rsi" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">MACD</span>
              <span id="detail-macd" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">MACD Signal</span>
              <span id="detail-macd-signal" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">MACD Histogram</span>
              <span id="detail-macd-hist" class="value">--</span>
            </div>
          </div>

          <!-- TA-signal-sammanfattning -->
          <div class="detail-ta-summary">
            <h3 class="ta-subtitle">TA-signalsammanfattning</h3>
            <div id="detail-ta-scorecard" class="signal-scorecard">
              <!-- Renderas dynamiskt -->
            </div>
          </div>
        </div>

        <!-- Stod/Motstand -->
        <div class="detail-levels-section">
          <h3 class="ta-subtitle">Stod & Motstand</h3>
          <div class="ta-grid">
            <div class="ta-col">
              <h3 class="ta-subtitle support-color">Stod (Support)</h3>
              <ul id="detail-support-list" class="levels-list"></ul>
            </div>
            <div class="ta-col">
              <h3 class="ta-subtitle resist-color">Motstand (Resistance)</h3>
              <ul id="detail-resistance-list" class="levels-list"></ul>
            </div>
          </div>
        </div>

        <!-- Fundamental data -->
        <div class="detail-fundamental-section">
          <h3 class="ta-subtitle">Fundamental Data</h3>
          <div class="indicators">
            <div class="indicator">
              <span class="label">P/E-tal</span>
              <span id="detail-pe" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">EPS</span>
              <span id="detail-eps" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">Marknadsvarde</span>
              <span id="detail-market-cap" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">52v High</span>
              <span id="detail-52w-high" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">52v Low</span>
              <span id="detail-52w-low" class="value">--</span>
            </div>
            <div class="indicator">
              <span class="label">Volym (snitt)</span>
              <span id="detail-avg-volume" class="value">--</span>
            </div>
          </div>
        </div>

        <!-- Nyheter (bara US-aktier via Finnhub) -->
        <div id="detail-news-section" class="detail-news-section">
          <h3 class="ta-subtitle">Senaste nyheter</h3>
          <ul id="detail-news-list" class="news-list">
            <li class="news-loading">Laddar nyheter...</li>
          </ul>
        </div>

        <!-- Disclaimer -->
        <p class="disclaimer">
          OBS: Detta ar INTE finansiell radgivning. Alla rekommendationer ar baserade pa
          tekniska indikatorer och offentlig analytikerdata. Gor alltid din egen research (DYOR)
          innan du investerar. Historisk avkastning garanterar inte framtida resultat.
        </p>
      </div>
    </section>

    <!-- ===== DATAKALLOR ===== -->
    <section class="card" id="stocks-sources-card">
      <h2>Datakallor & API:er</h2>
      <table class="sources-table">
        <thead>
          <tr>
            <th>Kalla</th>
            <th>Data</th>
            <th>Grans (gratis)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><a href="https://twelvedata.com" target="_blank" rel="noopener">Twelve Data</a></td>
            <td>Kurser, historik, tekniska indikatorer</td>
            <td>800 credits/dag</td>
            <td><span id="src-twelvedata" class="src-badge src-neutral">--</span></td>
          </tr>
          <tr>
            <td><a href="https://finnhub.io" target="_blank" rel="noopener">Finnhub</a></td>
            <td>Nyheter (US-aktier)</td>
            <td>60 req/min</td>
            <td><span id="src-finnhub" class="src-badge src-neutral">--</span></td>
          </tr>
          <tr>
            <td><a href="https://www.alphavantage.co" target="_blank" rel="noopener">Alpha Vantage</a></td>
            <td>Fundamental data (fallback)</td>
            <td>25 req/dag</td>
            <td><span id="src-alphavantage" class="src-badge src-neutral">--</span></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ===== FOOTER ===== -->
    <footer>
      <p>
        Kallor:
        <a href="https://twelvedata.com" target="_blank" rel="noopener">Twelve Data</a> (kurser & indikatorer),
        <a href="https://finnhub.io" target="_blank" rel="noopener">Finnhub</a> (nyheter) och
        <a href="https://www.alphavantage.co" target="_blank" rel="noopener">Alpha Vantage</a> (fundamental data)
        -- alla med gratis API-nycklar.
      </p>
    </footer>
  </div>

  <script src="stocks.js"></script>
</body>
</html>
```

### 3.3 AKTIEKORT-MALL (renderas dynamiskt)

Varje aktie i listan renderas som foljande HTML-fragment:

```html
<div class="stock-card card" data-ticker="NVDA" data-market="US" data-sector="Teknologi / AI">
  <!-- Rad 1: Huvud -->
  <div class="stock-card-header">
    <div class="stock-card-info">
      <span class="stock-card-name">NVIDIA</span>
      <span class="stock-card-ticker">NVDA</span>
      <span class="stock-card-market-badge stock-market-us">US</span>
    </div>
    <div class="stock-card-price-col">
      <span class="stock-card-price">$210.33</span>
      <span class="stock-card-change up">+2.4%</span>
    </div>
  </div>

  <!-- Rad 2: Signal + metadata -->
  <div class="stock-card-signal-row">
    <span class="signal-badge signal-buy">KOP</span>
    <span class="stock-card-sector">Teknologi / AI</span>
    <span class="stock-card-risk risk-medium">Medel risk</span>
  </div>

  <!-- Rad 3: Kort motivering -->
  <p class="stock-card-motivation">
    Konsensus Strong Buy fran 38 analytiker. Riktkurs $306...
  </p>

  <!-- Rad 4: Snabb-indikatorer -->
  <div class="stock-card-indicators">
    <div class="stock-mini-indicator">
      <span class="label">RSI</span>
      <span class="stock-mini-value" id="mini-rsi-NVDA">--</span>
    </div>
    <div class="stock-mini-indicator">
      <span class="label">Riktkurs</span>
      <span class="stock-mini-value">$250</span>
    </div>
    <div class="stock-mini-indicator">
      <span class="label">Stop-Loss</span>
      <span class="stock-mini-value">$193</span>
    </div>
    <div class="stock-mini-indicator">
      <span class="label">P/E</span>
      <span class="stock-mini-value" id="mini-pe-NVDA">--</span>
    </div>
  </div>

  <!-- Rad 5: Utdelning (bara for utdelningsaktier) -->
  <!-- <div class="stock-card-dividend">
    <span class="label">Direktavkastning</span>
    <span class="stock-dividend-value">2.7%</span>
  </div> -->

  <!-- CTA -->
  <button class="stock-card-detail-btn" data-ticker="NVDA">Visa detaljerad analys</button>
</div>
```

---

## 4. CSS-SPECIFIKATION: stocks-style.css

```css
/* ================================================================
   STOCKS-STYLE.CSS -- Aktieanalyssidans egna stilar
   Importeras EFTER style.css (bas-tema)
   ================================================================ */

/* ── Navigation ────────────────────────────────── */

.nav-bar {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border: 1px solid #2b3252;
  border-radius: 10px;
  overflow: hidden;
  background: #1c2236;
}

.nav-link {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  text-decoration: none;
  color: #8b91ab;
  font-weight: 600;
  font-size: 0.95rem;
  transition: background 0.2s, color 0.2s;
  border-right: 1px solid #2b3252;
}

.nav-link:last-child {
  border-right: none;
}

.nav-link:hover {
  background: rgba(109, 213, 237, 0.08);
  color: #c7cdf0;
}

.nav-link-active {
  background: rgba(109, 213, 237, 0.15);
  color: #6dd5ed;
}

.nav-icon {
  font-size: 1.2rem;
  font-weight: 800;
}

/* ── API Status ────────────────────────────────── */

.api-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Flikar: Tidshorisont ──────────────────────── */

.stock-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border: 1px solid #2b3252;
  border-radius: 8px;
  overflow: hidden;
}

.stock-tab {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: #8b91ab;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-family: inherit;
}

.stock-tab:not(:last-child) {
  border-right: 1px solid #2b3252;
}

.stock-tab:hover {
  background: rgba(109, 213, 237, 0.08);
  color: #c7cdf0;
}

.stock-tab-active {
  background: rgba(109, 213, 237, 0.15);
  color: #6dd5ed;
}

/* ── Filter ────────────────────────────────────── */

.stock-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-buttons {
  display: flex;
  gap: 0;
  border: 1px solid #2b3252;
  border-radius: 6px;
  overflow: hidden;
}

.filter-btn {
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: #8b91ab;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-family: inherit;
}

.filter-btn:not(:last-child) {
  border-right: 1px solid #2b3252;
}

.filter-btn:hover {
  background: rgba(138, 156, 255, 0.08);
  color: #c7cdf0;
}

.filter-btn-active {
  background: rgba(138, 156, 255, 0.15);
  color: #8a9cff;
}

/* ── Aktiekort ─────────────────────────────────── */

.stock-card {
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.stock-card:hover {
  border-color: #8a9cff;
  box-shadow: 0 6px 24px rgba(138, 156, 255, 0.15);
}

.stock-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.stock-card-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.stock-card-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #e7e9f0;
}

.stock-card-ticker {
  font-size: 0.82rem;
  font-weight: 600;
  color: #8a9cff;
  background: rgba(138, 156, 255, 0.12);
  padding: 2px 8px;
  border-radius: 4px;
}

.stock-card-market-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stock-market-se {
  background: rgba(109, 213, 237, 0.12);
  color: #6dd5ed;
  border: 1px solid #6dd5ed;
}

.stock-market-us {
  background: rgba(138, 156, 255, 0.12);
  color: #8a9cff;
  border: 1px solid #8a9cff;
}

.stock-card-price-col {
  text-align: right;
}

.stock-card-price {
  display: block;
  font-size: 1.3rem;
  font-weight: 700;
  color: #e7e9f0;
}

.stock-card-change {
  font-size: 0.85rem;
  font-weight: 600;
}

/* Signal-rad */
.stock-card-signal-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.stock-card-sector {
  font-size: 0.78rem;
  color: #9aa0b4;
}

.stock-card-risk {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}

.risk-low {
  background: rgba(46, 204, 113, 0.12);
  color: #4ce081;
  border: 1px solid #2ecc71;
}

.risk-medium {
  background: rgba(241, 196, 15, 0.12);
  color: #f4d35e;
  border: 1px solid #f1c40f;
}

.risk-high {
  background: rgba(231, 76, 60, 0.12);
  color: #ff6f61;
  border: 1px solid #e74c3c;
}

/* Motivering */
.stock-card-motivation {
  font-size: 0.85rem;
  color: #9aa0b4;
  line-height: 1.5;
  margin: 0 0 12px;
  /* Klipp text efter 2 rader */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Mini-indikatorer */
.stock-card-indicators {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
}

.stock-mini-indicator {
  min-width: 60px;
}

.stock-mini-value {
  display: block;
  font-size: 0.95rem;
  font-weight: 700;
  color: #c7cdf0;
}

/* Utdelning */
.stock-card-dividend {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(46, 204, 113, 0.08);
  border-radius: 6px;
  margin-bottom: 12px;
}

.stock-dividend-value {
  font-weight: 700;
  color: #4ce081;
}

/* Detail-knapp */
.stock-card-detail-btn {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #2b3252;
  background: #151929;
  color: #8a9cff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  font-family: inherit;
}

.stock-card-detail-btn:hover {
  background: rgba(138, 156, 255, 0.12);
  border-color: #8a9cff;
}

/* ── Detaljvy (overlay) ────────────────────────── */

.stock-detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 19, 32, 0.92);
  z-index: 1000;
  overflow-y: auto;
  padding: 20px;
}

.stock-detail-container {
  max-width: 860px;
  margin: 0 auto;
  position: relative;
}

.detail-close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid #2b3252;
  background: #151929;
  color: #ff6f61;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
  z-index: 10;
}

.detail-close-btn:hover {
  background: rgba(231, 76, 60, 0.15);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
  padding-right: 80px; /* plats for stangknapp */
}

.detail-ticker {
  font-size: 0.9rem;
  font-weight: 600;
  color: #8a9cff;
  margin-right: 8px;
}

.detail-market-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  margin-right: 8px;
}

.detail-sector {
  font-size: 0.82rem;
  color: #9aa0b4;
}

.detail-price-block {
  text-align: right;
}

.detail-signal-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.detail-signal-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.detail-motivation-card {
  background: #151929;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 16px;
  border: 1px solid #2b3252;
}

.detail-motivation-card p {
  color: #c7cdf0;
  font-size: 0.9rem;
  line-height: 1.6;
  margin: 0 0 12px;
}

.detail-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.detail-chart-section,
.detail-ta-section,
.detail-levels-section,
.detail-fundamental-section,
.detail-news-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #2b3252;
}

.detail-ta-summary {
  margin-top: 16px;
}

/* ── Responsiv ─────────────────────────────────── */

@media (max-width: 600px) {
  .stock-card-header {
    flex-direction: column;
    gap: 8px;
  }

  .stock-card-price-col {
    text-align: left;
  }

  .detail-header {
    flex-direction: column;
    padding-right: 50px;
  }

  .detail-price-block {
    text-align: left;
  }

  .stock-filters {
    flex-direction: column;
  }

  .nav-link {
    font-size: 0.82rem;
    padding: 10px 8px;
  }
}
```

---

## 5. JAVASCRIPT-SPECIFIKATION: stocks.js

### 5.1 ARKITEKTUR

```
stocks.js
|
|-- KONSTANTER
|   |-- API_KEYS (tomma strängar -- användaren fyller i)
|   |-- SHORT_TERM_PICKS[]  (hardkodade)
|   |-- LONG_TERM_PICKS[]   (hardkodade)
|   |-- REFRESH_SECONDS = 300 (5 min)
|
|-- TILLSTAND
|   |-- currentHorizon: "short" | "long"
|   |-- currentMarket: "all" | "SE" | "US"
|   |-- currentSort: "signal" | "risk" | "sector" | "name"
|   |-- priceCache: {}  -- sparar hämtade kurser
|   |-- taCache: {}     -- sparar TA-data
|
|-- API-FUNKTIONER
|   |-- fetchTwelveDataQuote(ticker)
|   |-- fetchTwelveDataTimeSeries(ticker, outputsize)
|   |-- fetchTwelveDataIndicator(ticker, indicator, params)
|   |-- fetchFinnhubNews(ticker)
|   |-- fetchAlphaVantageOverview(ticker)
|
|-- BERAKNINGSFUNKTIONER
|   |-- calculateSupportResistance(priceData)
|   |-- generateTASignal(rsi, macd, sma20, sma50, price)
|   |-- calculateStopLoss(price, percent)
|
|-- RENDERING
|   |-- renderStockList()
|   |-- renderStockCard(stock)
|   |-- openDetailView(stock)
|   |-- renderDetailChart(priceData, stock)
|   |-- renderTAScorecard(taData)
|   |-- renderNews(newsData)
|
|-- EVENT HANDLERS
|   |-- tabClick -> byt horizon, renderStockList()
|   |-- filterClick -> byt market, renderStockList()
|   |-- sortChange -> byt sort, renderStockList()
|   |-- cardClick -> openDetailView()
|   |-- closeClick -> stang detail overlay
|
|-- INIT
|   |-- loadAllQuotes() -- hamta kurser for alla synliga aktier
|   |-- startCountdown() -- uppdateringstimer
```

### 5.2 API-NYCKEL-KONFIGURATION

```javascript
// API-nycklar -- registrera gratis pa respektive tjanst
// Twelve Data: https://twelvedata.com/pricing (gratis tier)
// Finnhub:     https://finnhub.io/register (gratis tier)
// Alpha Vantage: https://www.alphavantage.co/support/#api-key (gratis)
const API_KEYS = {
  twelveData:   "DIN_TWELVE_DATA_NYCKEL",   // Kravs
  finnhub:      "DIN_FINNHUB_NYCKEL",        // Valfri (for nyheter)
  alphaVantage: "DIN_ALPHA_VANTAGE_NYCKEL"   // Valfri (for fundamental data)
};
```

### 5.3 DETALJERADE API-ANROPSFUNKTIONER

```javascript
// === TWELVE DATA ===

async function fetchTwelveDataQuote(ticker) {
  // Returnerar: { symbol, name, exchange, open, high, low, close,
  //               volume, previous_close, change, percent_change, ... }
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(ticker)}&apikey=${API_KEYS.twelveData}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code) throw new Error(data.message); // API-fel
  return data;
}

async function fetchTwelveDataTimeSeries(ticker, outputsize = 120) {
  // Returnerar: { values: [{ datetime, open, high, low, close, volume }, ...] }
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=${outputsize}&apikey=${API_KEYS.twelveData}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code) throw new Error(data.message);
  return data;
}

async function fetchTwelveDataRSI(ticker) {
  const url = `https://api.twelvedata.com/rsi?symbol=${encodeURIComponent(ticker)}&interval=1day&time_period=14&apikey=${API_KEYS.twelveData}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code) throw new Error(data.message);
  return parseFloat(data.values[0].rsi);
}

async function fetchTwelveDataMACD(ticker) {
  const url = `https://api.twelvedata.com/macd?symbol=${encodeURIComponent(ticker)}&interval=1day&apikey=${API_KEYS.twelveData}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code) throw new Error(data.message);
  return {
    macd: parseFloat(data.values[0].macd),
    signal: parseFloat(data.values[0].macd_signal),
    histogram: parseFloat(data.values[0].macd_hist)
  };
}

async function fetchTwelveDataSMA(ticker, timePeriod) {
  const url = `https://api.twelvedata.com/sma?symbol=${encodeURIComponent(ticker)}&interval=1day&time_period=${timePeriod}&apikey=${API_KEYS.twelveData}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code) throw new Error(data.message);
  return parseFloat(data.values[0].sma);
}

async function fetchTwelveDataEMA(ticker, timePeriod) {
  const url = `https://api.twelvedata.com/ema?symbol=${encodeURIComponent(ticker)}&interval=1day&time_period=${timePeriod}&apikey=${API_KEYS.twelveData}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code) throw new Error(data.message);
  return parseFloat(data.values[0].ema);
}

// === FINNHUB (nyheter, bara US) ===

async function fetchFinnhubNews(ticker) {
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${API_KEYS.finnhub}`;
  const res = await fetch(url);
  return await res.json(); // Array av { headline, url, source, datetime, summary }
}

// === ALPHA VANTAGE (fundamental, fallback) ===

async function fetchAlphaVantageOverview(ticker) {
  // Returnerar: { Symbol, Name, MarketCapitalization, PERatio, EPS,
  //               DividendYield, 52WeekHigh, 52WeekLow, ... }
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${API_KEYS.alphaVantage}`;
  const res = await fetch(url);
  return await res.json();
}
```

### 5.4 TA-SIGNALBERAKNING

```javascript
function generateTASignal(rsi, macd, sma20, sma50, currentPrice) {
  let bullCount = 0;
  let bearCount = 0;
  const signals = [];

  // RSI
  if (rsi < 30) {
    bullCount += 2; // Oversald -- stark kopsignal
    signals.push({ indicator: "RSI", value: rsi.toFixed(1), signal: "KOP", reason: "Oversald (< 30)" });
  } else if (rsi < 40) {
    bullCount += 1;
    signals.push({ indicator: "RSI", value: rsi.toFixed(1), signal: "KOP", reason: "Nar oversald-zon" });
  } else if (rsi > 70) {
    bearCount += 2; // Overkopt -- stark saljsignal
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

  // SMA 50 vs pris (tyngre vikt)
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

  return { overallSignal, bullCount, bearCount, signals };
}
```

### 5.5 STOD/MOTSTAND-BERAKNING

```javascript
function calculateSupportResistance(priceData) {
  // priceData = array av { high, low, close } fran time_series
  const closes = priceData.map(d => parseFloat(d.close));
  const highs = priceData.map(d => parseFloat(d.high));
  const lows = priceData.map(d => parseFloat(d.low));
  const current = closes[0]; // senaste

  // Hitta lokala toppar och bottnar (enkel pivot-metod)
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

  // Motstands: pivotHighs over nuvarande pris, sorterade narmost forst
  const resistance = pivotHighs
    .filter(p => p > current)
    .sort((a, b) => a - b)
    .slice(0, 3);

  // Stod: pivotLows under nuvarande pris, sorterade narmost forst
  const support = pivotLows
    .filter(p => p < current)
    .sort((a, b) => b - a)
    .slice(0, 3);

  return { resistance, support };
}
```

### 5.6 GRAF-RENDERING (Chart.js)

```javascript
function renderDetailChart(priceData, stock) {
  const ctx = document.getElementById("detail-chart").getContext("2d");

  // Vaand data (API returnerar nyast forst)
  const reversed = [...priceData].reverse();

  const labels = reversed.map(d => d.datetime);
  const prices = reversed.map(d => parseFloat(d.close));

  // Berakna SMA50 for overlay
  const sma50 = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < 49) { sma50.push(null); continue; }
    const slice = prices.slice(i - 49, i + 1);
    sma50.push(slice.reduce((a, b) => a + b, 0) / 50);
  }

  // Forstoras eller skapa chart
  if (window.detailChartInstance) {
    window.detailChartInstance.destroy();
  }

  window.detailChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
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
          data: sma50,
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
```

### 5.7 RATE-LIMITING & CACHING

```javascript
// Enkel rate-limiter for Twelve Data (8 req/min)
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  async waitForSlot() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.timestamps[0]) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.timestamps.push(Date.now());
  }
}

const twelveDataLimiter = new RateLimiter(8, 60000);

// Cache med TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}
```

### 5.8 LADDNINGSSEKVENS

```javascript
async function init() {
  // 1. Rendera aktielistan med hardkodade data (ingen API behövs)
  renderStockList();

  // 2. Hamta kurser for synliga aktier (sekventiellt pga rate limit)
  await loadQuotesForVisibleStocks();

  // 3. Starta countdown
  startCountdown();
}

async function loadQuotesForVisibleStocks() {
  const visibleStocks = getFilteredStocks();

  for (const stock of visibleStocks) {
    try {
      await twelveDataLimiter.waitForSlot();
      const quote = await fetchTwelveDataQuote(stock.ticker);
      priceCache[stock.ticker] = quote;
      updateStockCardPrice(stock.ticker, quote);
    } catch (err) {
      console.warn(`Kunde inte hamta kurs for ${stock.ticker}:`, err.message);
    }
  }

  updateApiStatus("OK");
}

async function loadStockDetails(stock) {
  // Anropas nar anvandaren klickar pa en aktie
  // Hamtar: time_series + RSI + MACD + SMA20 + SMA50 + EMA12 + EMA26
  // = 7 API-credits per aktie

  const ticker = stock.ticker;

  // Hamta parallellt med rate-limiting
  const [timeSeries, rsi, macd, sma20, sma50, ema12, ema26] = await Promise.all([
    (async () => { await twelveDataLimiter.waitForSlot(); return fetchTwelveDataTimeSeries(ticker, 180); })(),
    (async () => { await twelveDataLimiter.waitForSlot(); return fetchTwelveDataRSI(ticker); })(),
    (async () => { await twelveDataLimiter.waitForSlot(); return fetchTwelveDataMACD(ticker); })(),
    (async () => { await twelveDataLimiter.waitForSlot(); return fetchTwelveDataSMA(ticker, 20); })(),
    (async () => { await twelveDataLimiter.waitForSlot(); return fetchTwelveDataSMA(ticker, 50); })(),
    (async () => { await twelveDataLimiter.waitForSlot(); return fetchTwelveDataEMA(ticker, 12); })(),
    (async () => { await twelveDataLimiter.waitForSlot(); return fetchTwelveDataEMA(ticker, 26); })()
  ]);

  // Nyheter (bara US via Finnhub)
  let news = [];
  if (stock.market === "US" && API_KEYS.finnhub) {
    news = await fetchFinnhubNews(stock.tickerDisplay);
  }

  // Fundamental (via Alpha Vantage, bara US)
  let fundamental = null;
  if (stock.market === "US" && API_KEYS.alphaVantage) {
    fundamental = await fetchAlphaVantageOverview(stock.tickerDisplay);
  }

  return { timeSeries, rsi, macd, sma20, sma50, ema12, ema26, news, fundamental };
}
```

---

## 6. NAVIGATION: Andringar i befintliga filer

### 6.1 Lagg till i index.html (ETH Tracker)

Direkt efter `<div class="container">` och FORE `<header>`:

```html
<!-- Navigation -->
<nav class="nav-bar">
  <a href="index.html" class="nav-link nav-link-active">
    <span class="nav-icon">Xi</span> ETH Tracker
  </a>
  <a href="stocks.html" class="nav-link">
    <span class="nav-icon">$</span> Aktieanalys
  </a>
</nav>
```

### 6.2 Lagg till i style.css (befintlig)

Lagg till navigations-stilarna i slutet av style.css:

```css
/* ── Navigation ────────────────────────────────── */

.nav-bar {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border: 1px solid #2b3252;
  border-radius: 10px;
  overflow: hidden;
  background: #1c2236;
}

.nav-link {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  text-decoration: none;
  color: #8b91ab;
  font-weight: 600;
  font-size: 0.95rem;
  transition: background 0.2s, color 0.2s;
  border-right: 1px solid #2b3252;
}

.nav-link:last-child {
  border-right: none;
}

.nav-link:hover {
  background: rgba(109, 213, 237, 0.08);
  color: #c7cdf0;
}

.nav-link-active {
  background: rgba(109, 213, 237, 0.15);
  color: #6dd5ed;
}

.nav-icon {
  font-size: 1.2rem;
  font-weight: 800;
}
```

---

## 7. FILSAMMANFATTNING

| Fil | Andring | Storlek (uppskattat) |
|---|---|---|
| `stocks.html` | NY FIL | ~200 rader |
| `stocks.js` | NY FIL | ~600-800 rader |
| `stocks-style.css` | NY FIL | ~350 rader |
| `style.css` | REDIGERA -- lagg till nav-stilar | +30 rader |
| `index.html` | REDIGERA -- lagg till nav-bar | +10 rader |

---

## 8. IMPLEMENTERINGSORDNING

1. **Steg 1:** Lagg till navigation i `style.css` och `index.html`
2. **Steg 2:** Skapa `stocks-style.css` med alla aktiesidans stilar
3. **Steg 3:** Skapa `stocks.html` med fullstandig HTML-struktur
4. **Steg 4:** Skapa `stocks.js` med:
   - a) Hardkodade aktielistor (data)
   - b) Rendering-funktioner (ingen API behövs)
   - c) Flik/filter/sorteringslogik
   - d) Detaljvy med overlay
5. **Steg 5:** Integrera API-anrop:
   - a) Twelve Data kurser + indikatorer
   - b) Chart.js-grafer
   - c) TA-signalberakning
   - d) Stod/motstand
6. **Steg 6:** Lagg till Finnhub-nyheter (US-aktier)
7. **Steg 7:** Lagg till Alpha Vantage fundamental data (fallback)
8. **Steg 8:** Rate-limiting, caching, felhantering
9. **Steg 9:** Responsiv testning och finpolering

---

## 9. TEKNISKA KRAV

- **Ingen backend** -- allt kors i browsern
- **Ingen build-step** -- vanilla HTML/CSS/JS
- **Inga npm-paket** -- bara CDN-lankar (Chart.js)
- **API-nycklar** -- hardkodas som konstanter langst upp i stocks.js (anvandaren registrerar gratis nycklar)
- **LocalStorage** -- anvands for att cacha senaste kurser sa sidan visar nagot aven utan API
- **Graceful degradation** -- sidan ska fungera aven utan API-nycklar (visar hardkodade data utan realtidskurser)
- **Felhantering** -- varje API-anrop wrappas i try/catch, visar "--" vid fel
- **CORS** -- alla valda API:er stooder CORS fran frontend

---

## 10. DISCLAIMER-TEXT (ska finnas pa sidan)

```
OBS: Detta ar INTE finansiell radgivning. Rekommendationerna ar baserade pa tekniska indikatorer
och offentligt tillganglig analytikerdata. Alla investeringar innebar risk och historisk avkastning
ar ingen garanti for framtida resultat. Gor alltid din egen research (DYOR) innan du investerar.
Investera aldrig mer an du har rad att forlora.
```
