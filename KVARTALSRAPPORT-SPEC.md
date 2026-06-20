# Kravspecifikation: Kvartalsrapportanalys

> Version 1.0 | 2026-06-20
> Tillhor Aktieanalys-plattformen (c:\Users\Danie\Desktop\eth)

---

## 1. SYFTE

Bygga en automatiserad pipeline som hamtar, parsar och analyserar kvartalsrapporter (10-Q) och arsredovisningar (10-K) for aktier i plattformens bevakningsuniversum. Malet ar att ge anvandaren strukturerad, handlingsbar information fran varje rapport -- inte bara siffror utan trender, avvikelser och varningsflaggor.

---

## 2. DATAKALLOR & API:er

### 2.1 SEC EDGAR (primar -- gratis, ingen nyckel)

| Egenskap | Detalj |
|---|---|
| **Bas-URL** | `https://efts.sec.gov/LATEST/` |
| **Full-Text Search** | `https://efts.sec.gov/LATEST/search-index?q=...` |
| **Company Filings** | `https://data.sec.gov/submissions/CIK{cik}.json` |
| **XBRL Facts** | `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json` |
| **Rate limit** | 10 req/sek (User-Agent-header kravs) |
| **Kostnad** | Gratis |
| **CORS** | Nej -- krav backend-proxy |

**Relevanta endpoints:**

```
# Hamta alla filings for ett bolag (via CIK-nummer)
GET https://data.sec.gov/submissions/CIK0000320193.json
# -> recent.filings[] med form, filingDate, accessionNumber, primaryDocument

# Hamta XBRL-fakta (alla rapporterade nyckeltal historiskt)
GET https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json
# -> facts.us-gaap.Revenue, facts.us-gaap.NetIncomeLoss, etc.

# Sok filings med fritext
GET https://efts.sec.gov/LATEST/search-index?q=%22revenue%22&dateRange=custom&startdt=2026-01-01&enddt=2026-06-20&forms=10-Q

# Hamta specifik filing-dokument
GET https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}
```

### 2.2 Financial Modeling Prep (FMP) -- strukturerad data

| Egenskap | Detalj |
|---|---|
| **Sajt** | https://site.financialmodelingprep.com |
| **Gratis tier** | 250 req/dag |
| **API-nyckel** | Kravs (gratis registrering) |
| **Earnings Calendar** | Ja -- kommande rapportdatum |
| **Income Statement** | Kvartalsvis och arlig |
| **Balance Sheet** | Kvartalsvis och arlig |
| **Cash Flow** | Kvartalsvis och arlig |

**Relevanta endpoints:**

```
# Earnings-kalender (kommande rapporter)
GET https://financialmodelingprep.com/api/v3/earning_calendar?from=2026-06-20&to=2026-07-20&apikey=KEY

# Income Statement (kvartalsvis)
GET https://financialmodelingprep.com/api/v3/income-statement/AAPL?period=quarter&limit=8&apikey=KEY

# Balance Sheet (kvartalsvis)
GET https://financialmodelingprep.com/api/v3/balance-sheet-statement/AAPL?period=quarter&limit=8&apikey=KEY

# Cash Flow Statement (kvartalsvis)
GET https://financialmodelingprep.com/api/v3/cash-flow-statement/AAPL?period=quarter&limit=8&apikey=KEY

# Earnings Surprises (historiska beats/misses)
GET https://financialmodelingprep.com/api/v3/earnings-surprises/AAPL?apikey=KEY

# Key Metrics (kvartalsvis: P/E, P/B, EV/EBITDA, ROE, etc)
GET https://financialmodelingprep.com/api/v3/key-metrics/AAPL?period=quarter&limit=8&apikey=KEY
```

### 2.3 Alpha Vantage (komplement)

```
# Earnings (kvartalsvis EPS, estimate, surprise)
GET https://www.alphavantage.co/query?function=EARNINGS&symbol=AAPL&apikey=KEY

# Overview (P/E, EPS, market cap, etc)
GET https://www.alphavantage.co/query?function=OVERVIEW&symbol=AAPL&apikey=KEY
```

### 2.4 REKOMMENDERAD API-STRATEGI

| Data | Primar kalla | Fallback |
|---|---|---|
| Earnings-kalender | FMP | Alpha Vantage |
| Kvartalsresultat (income statement) | FMP | SEC EDGAR XBRL |
| Balansrakning | FMP | SEC EDGAR XBRL |
| Kassaflodesanalys | FMP | SEC EDGAR XBRL |
| Earnings surprises | FMP | Alpha Vantage |
| MD&A-text (kvalitativ analys) | SEC EDGAR (10-Q dokument) | -- |
| Riskfaktorer (text) | SEC EDGAR (10-Q dokument) | -- |

---

## 3. VILKA NYCKELTAL SKA ANALYSERAS

### 3.1 Per kvartalsrapport -- Automatisk extraktion

| Nyckeltal | Kalla | Signalvarde |
|---|---|---|
| **Revenue** | Income Statement | Tillvaxt QoQ och YoY |
| **Revenue vs Estimate** | Earnings Surprises | Beat/Miss och storlek |
| **Gross Margin** | Income Statement | Trend (forbattring/forsarming) |
| **Operating Income** | Income Statement | Lonsamhetstrend |
| **Net Income** | Income Statement | Resultat vs forvantning |
| **EPS (Actual vs Estimate)** | Earnings Surprises | Beat/miss magnitude |
| **Operating Cash Flow** | Cash Flow Statement | Kassaflodesgeneration |
| **Free Cash Flow** | Cash Flow Statement | FCF = OCF - CapEx |
| **Total Debt** | Balance Sheet | Skuldsattning |
| **Cash & Equivalents** | Balance Sheet | Likviditet |
| **Current Ratio** | Key Metrics | Kortsiktig betalningsformaga |
| **Shares Outstanding** | Balance Sheet | Utspadning over tid |

### 3.2 Haledda nyckeltal (beraknas av systemet)

| Nyckeltal | Formel | Varfor |
|---|---|---|
| Revenue Growth QoQ | (Q_n - Q_n-1) / Q_n-1 | Sekventiell tillvaxt |
| Revenue Growth YoY | (Q_n - Q_n-4) / Q_n-4 | Arsbaserad tillvaxt |
| Gross Margin % | Gross Profit / Revenue | Skalbarhet |
| Operating Margin % | Operating Income / Revenue | Operationell effektivitet |
| Net Margin % | Net Income / Revenue | Slutlig lonsamhet |
| FCF Margin % | FCF / Revenue | Kassaflodeseffektivitet |
| Debt/Equity | Total Debt / Shareholders Equity | Balansrisk |
| Burn Rate (manader) | Cash / Monthly Operating Cash Burn | Runway for forlustbolag |
| EPS Surprise % | (Actual - Estimate) / abs(Estimate) | Beat/miss magnitude |
| Piotroski F-Score | 9 binara tester | Overgrippande finansiell styrka |

### 3.3 Trendanalys (over 8 kvartal)

For varje nyckeltal, berakna:
- **Trend:** Stigande / Fallande / Flat (linjar regression pa 4-8 kvartal)
- **Acceleration:** Forbattras trenden eller avtar den?
- **Avvikelse:** Avviker senaste kvartalet kraftigt fran trenden?
- **Sasongseffekt:** Jamfor alltid med samma kvartal foregaende ar (YoY)

---

## 4. KVALITATIV ANALYS (TEXT-PARSING)

### 4.1 MD&A (Management's Discussion and Analysis)

Extrahera och analysera fran 10-Q:
- **Tonanalys:** Har ledningens ton andrats fran forra kvartalet? (mer optimistisk/pessimistisk)
- **Nyckelord-flaggning:** Sok efter: "uncertainty", "headwinds", "challenging", "accelerating", "record", "exceeded"
- **Guidance:** Har bolaget hojt, sankt eller behallitt sin guidance?
- **Segment-performance:** Vilka segment vaxer/krymper?

### 4.2 Riskfaktorer

- **Nya risker:** Har nya riskfaktorer tillkommit sedan forra 10-Q?
- **Andrad formulering:** Har befintliga risker fatt skarpt sprak?
- **Regulatory risk:** FDA, SEC, antitrust-omnamnanden
- **Going concern:** Flagga OMEDELBART om "going concern" eller "substantial doubt" namns

### 4.3 Fotnoter

- **Off-balance-sheet:** Dolda skulder, operating leases (pre-ASC 842)
- **Related Party Transactions:** Transaktioner med insiders
- **Litigation:** Pagaende rattsprocesser och potentiella forlikningar
- **Accounting Changes:** Andrade redovisningsprinciper som paverkar jamforbarhet

---

## 5. UI-SPECIFIKATION

### 5.1 Ny sektion i stocks.html: Kvartalsrapport-kort

Laggs till i detaljvyn (stock-detail-overlay) mellan fundamental data och nyheter:

```html
<!-- Kvartalsrapport-analys -->
<div id="detail-earnings-section" class="detail-earnings-section">
  <h3 class="ta-subtitle">Kvartalsrapporter</h3>

  <!-- Nasta rapport -->
  <div class="earnings-next-report">
    <span class="label">Nasta rapport</span>
    <span id="detail-next-earnings" class="value">--</span>
    <span id="detail-earnings-countdown" class="earnings-countdown">--</span>
  </div>

  <!-- Senaste 4 kvartal -->
  <div class="earnings-history">
    <h4 class="earnings-subtitle">Senaste 4 kvartalen</h4>
    <table class="earnings-table" id="detail-earnings-table">
      <thead>
        <tr>
          <th>Kvartal</th>
          <th>Revenue</th>
          <th>Rev YoY</th>
          <th>EPS</th>
          <th>EPS Est</th>
          <th>Surprise</th>
          <th>Gross M%</th>
          <th>FCF</th>
        </tr>
      </thead>
      <tbody>
        <!-- Renderas dynamiskt -->
      </tbody>
    </table>
  </div>

  <!-- Trendvisualisering -->
  <div class="earnings-trends">
    <h4 class="earnings-subtitle">Trender (8 kvartal)</h4>
    <canvas id="earnings-revenue-chart" height="150"></canvas>
    <canvas id="earnings-margin-chart" height="150"></canvas>
  </div>

  <!-- Scorecard -->
  <div class="earnings-scorecard">
    <h4 class="earnings-subtitle">Kvartalsrapport-signal</h4>
    <div id="detail-earnings-scorecard" class="signal-scorecard">
      <!-- Signal-items renderas dynamiskt -->
    </div>
  </div>

  <!-- Beat/Miss-historik -->
  <div class="earnings-beat-history">
    <h4 class="earnings-subtitle">Earnings Surprise-historik</h4>
    <div id="detail-beat-streak" class="beat-streak">
      <!-- Renderas: gronn cirkel = beat, rod = miss, gra = inline -->
    </div>
  </div>
</div>
```

### 5.2 CSS for kvartalsrapport-sektionen

```css
/* ── Kvartalsrapport-analys ────────────────── */

.detail-earnings-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #2b3252;
}

.earnings-next-report {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #151929;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #2b3252;
}

.earnings-countdown {
  margin-left: auto;
  font-size: 0.82rem;
  font-weight: 700;
  color: #f4d35e;
  background: rgba(241, 196, 15, 0.12);
  padding: 3px 10px;
  border-radius: 999px;
}

.earnings-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  margin-bottom: 16px;
}

.earnings-table th {
  text-align: left;
  color: #8b91ab;
  font-weight: 600;
  padding: 6px 8px;
  border-bottom: 1px solid #2b3252;
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.earnings-table td {
  padding: 8px;
  color: #c7cdf0;
  border-bottom: 1px solid rgba(43, 50, 82, 0.4);
}

.earnings-table .beat {
  color: #4ce081;
  font-weight: 700;
}

.earnings-table .miss {
  color: #ff6f61;
  font-weight: 700;
}

.earnings-subtitle {
  font-size: 0.85rem;
  font-weight: 700;
  color: #c7cdf0;
  margin: 16px 0 8px;
}

.beat-streak {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.beat-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 700;
}

.beat-dot-beat {
  background: rgba(46, 204, 113, 0.2);
  color: #4ce081;
  border: 1px solid #2ecc71;
}

.beat-dot-miss {
  background: rgba(231, 76, 60, 0.2);
  color: #ff6f61;
  border: 1px solid #e74c3c;
}

.beat-dot-inline {
  background: rgba(154, 160, 180, 0.15);
  color: #9aa0b4;
  border: 1px solid #9aa0b4;
}
```

### 5.3 Kvartalsrapport-signal (scorecard)

Berakna en sammanvagd signal baserad pa:

| Signal | Vikt | Positiv | Negativ |
|---|---|---|---|
| EPS Surprise | 25% | Beat >5% | Miss >5% |
| Revenue Growth YoY | 20% | >10% | Negativ |
| Gross Margin Trend | 15% | Forbattras | Forsamras |
| FCF | 15% | Positivt och vaxande | Negativt |
| Beat Streak | 10% | 3+ kvartal i rad beat | 2+ miss i rad |
| Guidance | 15% | Hojd guidance | Sankt guidance |

Resultat: **STARK RAPPORT** / **GODKAND** / **SVAG RAPPORT** / **VARNINGSFLAGGA**

---

## 6. JAVASCRIPT-SPECIFIKATION

### 6.1 Nya funktioner i stocks.js

```javascript
// ── Kvartalsrapport-funktioner ───────────────

async function fetchEarningsCalendar(ticker) {
  // FMP: Nasta rapportdatum
  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?symbol=${ticker}&apikey=${API_KEYS.fmp}`;
  const res = await fetch(url);
  return await res.json();
}

async function fetchIncomeStatement(ticker, quarters = 8) {
  // FMP: Kvartalsvis income statement
  const url = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?period=quarter&limit=${quarters}&apikey=${API_KEYS.fmp}`;
  const res = await fetch(url);
  return await res.json();
}

async function fetchBalanceSheet(ticker, quarters = 8) {
  const url = `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?period=quarter&limit=${quarters}&apikey=${API_KEYS.fmp}`;
  const res = await fetch(url);
  return await res.json();
}

async function fetchCashFlowStatement(ticker, quarters = 8) {
  const url = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${ticker}?period=quarter&limit=${quarters}&apikey=${API_KEYS.fmp}`;
  const res = await fetch(url);
  return await res.json();
}

async function fetchEarningsSurprises(ticker) {
  const url = `https://financialmodelingprep.com/api/v3/earnings-surprises/${ticker}?apikey=${API_KEYS.fmp}`;
  const res = await fetch(url);
  return await res.json();
}

function analyzeQuarterlyReport(income, balance, cashflow, surprises) {
  // Berakna alla harledda nyckeltal
  // Identifiera trender over 8 kvartal
  // Generera scorecard-signal
  // Returnera strukturerat analysobjekt
}

function calculateEarningsSignal(analysis) {
  // Vag samman alla signaler till en overgrippande signal
  // Returnera: { signal, score, details[] }
}

function renderEarningsSection(analysis, nextEarningsDate) {
  // Rendera tabell, grafer, scorecard och beat-streak
}
```

---

## 7. BACKEND-KRAV (server/db.js)

### 7.1 SEC EDGAR Proxy

Lagg till en proxy-endpoint i Express-servern for att krinnga CORS:

```javascript
// SEC EDGAR kravs backend-proxy (ingen CORS)
app.get('/api/sec/filings/:cik', async (req, res) => {
  const url = `https://data.sec.gov/submissions/CIK${req.params.cik}.json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'StockAnalyzer/1.0 (daniel86.ekstrom@gmail.com)' }
  });
  const data = await response.json();
  res.json(data);
});

app.get('/api/sec/xbrl/:cik', async (req, res) => {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${req.params.cik}.json`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'StockAnalyzer/1.0 (daniel86.ekstrom@gmail.com)' }
  });
  const data = await response.json();
  res.json(data);
});
```

### 7.2 Caching

- Cachea kvartalsrapporter i 24 timmar (data andras inte efter publicering)
- Cachea earnings-kalender i 6 timmar
- Cachea XBRL-data i 24 timmar

---

## 8. IMPLEMENTERINGSORDNING

1. **Steg 1:** Lagg till FMP API-nyckel i API_KEYS-konfigurationen
2. **Steg 2:** Skapa SEC EDGAR proxy-endpoints i server/db.js
3. **Steg 3:** Implementera fetchEarningsCalendar, fetchIncomeStatement, etc
4. **Steg 4:** Implementera analyzeQuarterlyReport med nyckeltal och trender
5. **Steg 5:** Implementera calculateEarningsSignal (scorecard)
6. **Steg 6:** Bygga UI: kvartalsrapport-tabell i detaljvyn
7. **Steg 7:** Bygga revenue/margin-trendgrafer (Chart.js)
8. **Steg 8:** Bygga beat/miss-streak-visualisering
9. **Steg 9:** Integrera med befintlig detaljvy (openDetailView)

---

## 9. AGENTINTEGRATION

| Agent | Roll i kvartalsrapportanalys |
|---|---|
| **Fundamental Research Analyst** | Laser och tolkar MD&A, riskfaktorer, fotnoter |
| **SEC Filing Monitor** | Flaggar nar ny 10-Q/10-K publiceras |
| **Data Scientist Kvant** | Beraknar F-Score, Z-Score, trendmodeller |
| **PO Value Fundamental** | Prioriterar vilka nyckeltal som visas |
| **Portfolio Watchdog** | Triggar alert om rapport avviker kraftigt |
| **Senior Dev Finansiell** | Implementerar parsning och berakningar |

---

## 10. DATAKVALITET & BEGRANSNINGAR

- FMP gratis tier: 250 req/dag -- racker for ~30 fullstandiga kvartalsanalyser/dag
- SEC EDGAR: 10 req/sek -- racker for batched hamtning
- XBRL-data kan saknas for mindre bolag (micro-caps)
- Kvalitativ analys (MD&A-tonanalys) kraver manuell bedamning av agent
- Earnings estimates kan saknas for small-caps utan analytikerbevakning
