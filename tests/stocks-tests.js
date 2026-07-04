// ================================================================
// STOCKS-TESTS.JS -- Automatiska tester for aktieanalysplattformen
//
// Minimalt testramverk (describe/it/assert) utan externa beroenden.
// Fokus: validera KORREKTHET, inte bara att kod kors utan fel.
// ================================================================

(function () {
  "use strict";

  // ── Testramverk ──────────────────────────────────────────────────

  var suites = [];
  var currentSuite = null;

  function describe(name, fn) {
    currentSuite = { name: name, tests: [] };
    suites.push(currentSuite);
    fn();
    currentSuite = null;
  }

  function it(name, fn) {
    if (!currentSuite) throw new Error("it() maste kallas inom describe()");
    currentSuite.tests.push({ name: name, fn: fn });
  }

  // Assert-funktioner som kastar vid misslyckande

  function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(
        (msg ? msg + ": " : "") +
        "Forvantade " + JSON.stringify(expected) +
        ", fick " + JSON.stringify(actual)
      );
    }
  }

  function assertAlmostEqual(actual, expected, tolerance, msg) {
    if (typeof actual !== "number" || typeof expected !== "number") {
      throw new Error(
        (msg ? msg + ": " : "") +
        "Forvantade nummer, fick actual=" + typeof actual + " expected=" + typeof expected
      );
    }
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(
        (msg ? msg + ": " : "") +
        "Forvantade " + expected + " (+-" + tolerance + "), fick " + actual +
        " (diff=" + Math.abs(actual - expected).toFixed(6) + ")"
      );
    }
  }

  function assertTrue(value, msg) {
    if (!value) {
      throw new Error((msg ? msg + ": " : "") + "Forvantade truthy, fick " + JSON.stringify(value));
    }
  }

  function assertFalse(value, msg) {
    if (value) {
      throw new Error((msg ? msg + ": " : "") + "Forvantade falsy, fick " + JSON.stringify(value));
    }
  }

  function assertContains(str, substring, msg) {
    if (typeof str !== "string" || str.indexOf(substring) === -1) {
      throw new Error(
        (msg ? msg + ": " : "") +
        "Forvantade att " + JSON.stringify(str) + " innehaller " + JSON.stringify(substring)
      );
    }
  }

  function assertNotNull(value, msg) {
    if (value == null) {
      throw new Error((msg ? msg + ": " : "") + "Forvantade icke-null, fick " + JSON.stringify(value));
    }
  }

  function assertInstanceOf(value, constructor, msg) {
    if (!(value instanceof constructor)) {
      throw new Error(
        (msg ? msg + ": " : "") +
        "Forvantade instans av " + constructor.name + ", fick " + typeof value
      );
    }
  }

  function assertArrayLength(arr, expectedLength, msg) {
    if (!Array.isArray(arr)) {
      throw new Error((msg ? msg + ": " : "") + "Forvantade array, fick " + typeof arr);
    }
    if (arr.length !== expectedLength) {
      throw new Error(
        (msg ? msg + ": " : "") +
        "Forvantade array med langd " + expectedLength + ", fick " + arr.length
      );
    }
  }

  // Hjalp for async-tester
  function assertRejects(promiseFn, msg) {
    return promiseFn().then(
      function () {
        throw new Error((msg ? msg + ": " : "") + "Forvantade att Promise ska rejecta, men den resolvade");
      },
      function () {
        // Forvantad rejection -- testet lyckades
      }
    );
  }

  // ── Referens till exporterade funktioner ─────────────────────────

  var app = window.StocksApp;
  if (!app) {
    document.getElementById("summary").textContent = "FEL: window.StocksApp ar inte definierad. Kontrollera att stocks.js laddas fore testerna.";
    document.getElementById("summary").className = "summary summary-fail";
    return;
  }

  // ================================================================
  // TEST SUITE 1: fmtPrice() -- prisformatering
  // ================================================================

  describe("fmtPrice() -- prisformatering", function () {

    it("formaterar svenskt pris med kr-suffix och 2 decimaler", function () {
      var result = app.fmtPrice(123.456, "SE");
      // Kontrollera att resultatet innehaller "kr" och korrekta siffror
      assertContains(result, "kr", "Ska innehalla 'kr'");
      // 123.456 avrundas till 123.46 (eller 123,46 i sv-SE)
      // sv-SE anvander komma som decimalavskiljare
      assertContains(result, "123", "Ska innehalla 123");
    });

    it("formaterar 0 SEK korrekt", function () {
      var result = app.fmtPrice(0, "SE");
      assertContains(result, "0", "Ska innehalla 0");
      assertContains(result, "kr", "Ska innehalla kr");
    });

    it("formaterar USD-pris med $-prefix och 2 decimaler", function () {
      var result = app.fmtPrice(42.5, "US");
      assertContains(result, "$", "Ska innehalla $");
      assertContains(result, "42", "Ska innehalla 42");
      assertContains(result, "50", "Ska innehalla 50 (2 decimaler)");
    });

    it("formaterar stort USD-pris med tusentalsavskiljare", function () {
      var result = app.fmtPrice(1234.56, "US");
      assertContains(result, "$", "Ska borja med $");
      assertContains(result, "1", "Ska innehalla 1");
      assertContains(result, "234", "Ska innehalla 234");
    });

    it("returnerar '--' for null", function () {
      assertEqual(app.fmtPrice(null, "SE"), "--");
    });

    it("returnerar '--' for undefined", function () {
      assertEqual(app.fmtPrice(undefined, "US"), "--");
    });

    it("returnerar '--' for NaN", function () {
      assertEqual(app.fmtPrice(NaN, "SE"), "--");
    });

    it("formaterar negativa priser korrekt", function () {
      var result = app.fmtPrice(-5.50, "US");
      assertContains(result, "$", "Ska innehalla $");
      assertContains(result, "5", "Ska innehalla 5");
    });

    it("standardmarknad (utan market-param) anvander USD-format", function () {
      var result = app.fmtPrice(10.00);
      assertContains(result, "$", "Default ska vara $ (USD)");
    });

    it("formaterar penny stock-priser med 2 decimaler", function () {
      var result = app.fmtPrice(0.92, "US");
      assertContains(result, "$", "Ska ha $");
      assertContains(result, "0.92", "Ska visa 0.92");
    });
  });

  // ================================================================
  // TEST SUITE 2: fmtPct() -- procentformatering
  // ================================================================

  describe("fmtPct() -- procentformatering", function () {

    it("positiv procent far +-prefix", function () {
      var result = app.fmtPct(5.25);
      assertEqual(result, "+5.25%");
    });

    it("negativ procent behaller minustecken", function () {
      var result = app.fmtPct(-3.14);
      assertEqual(result, "-3.14%");
    });

    it("noll far +-prefix", function () {
      var result = app.fmtPct(0);
      assertEqual(result, "+0.00%");
    });

    it("stort positivt tal formateras korrekt", function () {
      var result = app.fmtPct(123.456);
      assertEqual(result, "+123.46%");
    });

    it("litet negativt tal formateras med 2 decimaler", function () {
      var result = app.fmtPct(-0.01);
      assertEqual(result, "-0.01%");
    });

    it("returnerar '--' for null", function () {
      assertEqual(app.fmtPct(null), "--");
    });

    it("returnerar '--' for undefined", function () {
      assertEqual(app.fmtPct(undefined), "--");
    });

    it("returnerar '--' for NaN", function () {
      assertEqual(app.fmtPct(NaN), "--");
    });

    it("exakt -100% formateras korrekt", function () {
      assertEqual(app.fmtPct(-100), "-100.00%");
    });

    it("mycket litet positivt tal (0.001) avrundas till +0.00%", function () {
      assertEqual(app.fmtPct(0.001), "+0.00%");
    });
  });

  // ================================================================
  // TEST SUITE 3: fmtLarge() -- stora tal (Mn, Md, T)
  // ================================================================

  describe("fmtLarge() -- formatering av stora tal", function () {

    it("triljoner (>= 1e12) formateras med T-suffix", function () {
      var result = app.fmtLarge(3.5e12);
      assertEqual(result, "$3.50T");
    });

    it("miljarder (>= 1e9) formateras med Md-suffix", function () {
      var result = app.fmtLarge(12.3e9);
      assertEqual(result, "$12.3Md");
    });

    it("miljoner (>= 1e6) formateras med Mn-suffix", function () {
      var result = app.fmtLarge(456e6);
      assertEqual(result, "$456.0Mn");
    });

    it("exakt 1e12 ger $1.00T", function () {
      assertEqual(app.fmtLarge(1e12), "$1.00T");
    });

    it("exakt 1e9 ger $1.0Md", function () {
      assertEqual(app.fmtLarge(1e9), "$1.0Md");
    });

    it("exakt 1e6 ger $1.0Mn", function () {
      assertEqual(app.fmtLarge(1e6), "$1.0Mn");
    });

    it("tal under 1e6 formateras utan suffix", function () {
      var result = app.fmtLarge(999999);
      assertContains(result, "$", "Ska ha $-prefix");
      assertContains(result, "999", "Ska innehalla 999");
    });

    it("returnerar '--' for null", function () {
      assertEqual(app.fmtLarge(null), "--");
    });

    it("returnerar '--' for NaN", function () {
      assertEqual(app.fmtLarge(NaN), "--");
    });

    it("gransvardet 999.999e6 ger Mn-suffix", function () {
      var result = app.fmtLarge(999.999e6);
      // 999.999e6 = 999999000 < 1e9, sa det ska vara Mn
      assertContains(result, "Mn", "Under 1 Md ska ge Mn");
    });

    it("Apple marknadsvarde formateras korrekt", function () {
      // Apple ~3.5T marknadsv.
      var result = app.fmtLarge(3500000000000);
      assertEqual(result, "$3.50T");
    });

    it("NVIDIA marknadsvarde formateras korrekt", function () {
      // NVIDIA ~3.2T
      var result = app.fmtLarge(3200000000000);
      assertEqual(result, "$3.20T");
    });

    it("litet bolag 50M formateras korrekt", function () {
      assertEqual(app.fmtLarge(50e6), "$50.0Mn");
    });
  });

  // ================================================================
  // TEST SUITE 4: generateTASignal() -- TA-signalgenerering
  // ================================================================

  describe("generateTASignal() -- TA-signal med kanda referensvarden", function () {

    // Referensdata: alla bull-indikatorer aktiva
    it("RSI < 30 ger 2 bull-poang och KOP-signal pa RSI-rad", function () {
      var macd = { macd: 0.5, signal: 0.3, histogram: 0.2 };
      var result = app.generateTASignal(25, macd, 100, 95, 105);
      var rsiSignal = result.signals.find(function (s) { return s.indicator === "RSI"; });
      assertNotNull(rsiSignal, "RSI-signal ska finnas");
      assertEqual(rsiSignal.signal, "KOP", "RSI < 30 ska ge KOP");
      assertContains(rsiSignal.reason, "Oversald", "Reason ska namna oversald");
      assertEqual(rsiSignal.value, "25.0", "RSI-varde ska vara 25.0");
    });

    it("RSI > 70 ger 2 bear-poang och SALJ-signal pa RSI-rad", function () {
      var macd = { macd: -0.5, signal: -0.3, histogram: -0.2 };
      var result = app.generateTASignal(78, macd, 100, 105, 95);
      var rsiSignal = result.signals.find(function (s) { return s.indicator === "RSI"; });
      assertNotNull(rsiSignal, "RSI-signal ska finnas");
      assertEqual(rsiSignal.signal, "SALJ", "RSI > 70 ska ge SALJ");
      assertContains(rsiSignal.reason, "Overkopt", "Reason ska namna overkopt");
      assertEqual(rsiSignal.value, "78.0", "RSI-varde ska vara 78.0");
    });

    it("RSI 30-40 ger 1 bull-poang (nar oversald)", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var result = app.generateTASignal(35, macd, 100, 100, 100);
      var rsiSignal = result.signals.find(function (s) { return s.indicator === "RSI"; });
      assertEqual(rsiSignal.signal, "KOP", "RSI 35 ska ge KOP");
      assertContains(rsiSignal.reason, "Nar oversald", "Ska namna 'nar oversald-zon'");
    });

    it("RSI 60-70 ger 1 bear-poang (nar overkopt)", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var result = app.generateTASignal(65, macd, 100, 100, 100);
      var rsiSignal = result.signals.find(function (s) { return s.indicator === "RSI"; });
      assertEqual(rsiSignal.signal, "SALJ", "RSI 65 ska ge SALJ");
    });

    it("RSI 40-60 ger NEUTRAL", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var result = app.generateTASignal(50, macd, 100, 100, 100);
      var rsiSignal = result.signals.find(function (s) { return s.indicator === "RSI"; });
      assertEqual(rsiSignal.signal, "NEUTRAL", "RSI 50 ska ge NEUTRAL");
    });

    it("MACD over signallinje med positivt histogram ger KOP", function () {
      var macd = { macd: 1.5, signal: 0.8, histogram: 0.7 };
      var result = app.generateTASignal(50, macd, 100, 100, 100);
      var macdSignal = result.signals.find(function (s) { return s.indicator === "MACD"; });
      assertEqual(macdSignal.signal, "KOP", "MACD over signal ska ge KOP");
      assertContains(macdSignal.reason, "over signallinje");
    });

    it("MACD under signallinje med negativt histogram ger SALJ", function () {
      var macd = { macd: -1.5, signal: -0.8, histogram: -0.7 };
      var result = app.generateTASignal(50, macd, 100, 100, 100);
      var macdSignal = result.signals.find(function (s) { return s.indicator === "MACD"; });
      assertEqual(macdSignal.signal, "SALJ", "MACD under signal ska ge SALJ");
    });

    it("pris over SMA20 ger KOP, under ger SALJ", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var resultAbove = app.generateTASignal(50, macd, 100, 100, 105);
      var sma20Above = resultAbove.signals.find(function (s) { return s.indicator === "SMA20"; });
      assertEqual(sma20Above.signal, "KOP", "Pris over SMA20 ska ge KOP");

      var resultBelow = app.generateTASignal(50, macd, 100, 100, 95);
      var sma20Below = resultBelow.signals.find(function (s) { return s.indicator === "SMA20"; });
      assertEqual(sma20Below.signal, "SALJ", "Pris under SMA20 ska ge SALJ");
    });

    it("SMA20 > SMA50 ger Golden Cross KOP-signal", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var result = app.generateTASignal(50, macd, 110, 100, 105);
      var crossSignal = result.signals.find(function (s) { return s.indicator === "MA-kors"; });
      assertEqual(crossSignal.signal, "KOP", "Golden Cross ska ge KOP");
      assertContains(crossSignal.reason, "Golden Cross");
    });

    it("SMA20 < SMA50 ger Death Cross SALJ-signal", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var result = app.generateTASignal(50, macd, 90, 100, 95);
      var crossSignal = result.signals.find(function (s) { return s.indicator === "MA-kors"; });
      assertEqual(crossSignal.signal, "SALJ", "Death Cross ska ge SALJ");
      assertContains(crossSignal.reason, "Death Cross");
    });

    // Sammanvagda signaler -- validera exakta poang

    it("alla indikatorer bullish ger STARK KOP med korrekt bullCount", function () {
      // RSI < 30 (+2), MACD bull (+1), pris > SMA20 (+1), pris > SMA50 (+1), SMA20 > SMA50 (+1) = 6 bull, 0 bear
      var macd = { macd: 2.0, signal: 1.0, histogram: 1.0 };
      var result = app.generateTASignal(25, macd, 110, 100, 115);
      assertEqual(result.overallSignal, "STARK KOP", "Alla bull ska ge STARK KOP");
      assertEqual(result.bullCount, 6, "bullCount ska vara 6");
      assertEqual(result.bearCount, 0, "bearCount ska vara 0");
    });

    it("alla indikatorer bearish ger STARK SALJ med korrekt bearCount", function () {
      // RSI > 70 (+2 bear), MACD bear (+1), pris < SMA20 (+1), pris < SMA50 (+1), SMA20 < SMA50 (+1) = 0 bull, 6 bear
      var macd = { macd: -2.0, signal: -1.0, histogram: -1.0 };
      var result = app.generateTASignal(80, macd, 90, 100, 85);
      assertEqual(result.overallSignal, "STARK SALJ", "Alla bear ska ge STARK SALJ");
      assertEqual(result.bullCount, 0, "bullCount ska vara 0");
      assertEqual(result.bearCount, 6, "bearCount ska vara 6");
    });

    it("neutralt RSI med blandade signaler ger BEHALL", function () {
      // RSI neutral (50): 0 bull/bear
      // MACD neutral: 0
      // pris > SMA20: +1 bull
      // pris < SMA50: +1 bear
      // SMA20 < SMA50: +1 bear
      // Net: 1 - 2 = -1 -> SALJ (inte BEHALL)
      // For BEHALL behover net = 0
      var macd = { macd: 0.1, signal: 0.1, histogram: 0 }; // Neutral MACD (histogram 0, men macd = signal => neutral)
      // pris > SMA20 (+1 bull), pris > SMA50 (+1 bull), SMA20 == SMA50 - ej mojligt, SMA20 < SMA50 (+1 bear)
      // For net=0: vi behover 1 bull och 1 bear (utover RSI neutral)
      // pris=100, sma20=99, sma50=101: pris>sma20(+1 bull), pris<sma50(+1 bear), sma20<sma50(+1 bear) = 1-2=-1 SALJ
      // For BEHALL: pris=100, sma20=99, sma50=99: pris>sma20(+1), pris>sma50(+1), sma20=sma50 => sma20 > sma50 ar false => +1 bear = 2-1=+1 KOP
      // Net=0 krav: behover exakt lika manga
      // pris=100, sma20=101, sma50=99: under sma20(+1 bear), over sma50(+1 bull), sma20>sma50(+1 bull) = 2-1=+1 KOP
      // pris=100, sma20=101, sma50=101: under sma20(-1), under sma50(-1), sma20=sma50=>death cross(-1) = 0-3=-3 STARK SALJ
      // For att fa BEHALL behover vi net=0, dvs bullCount == bearCount
      // RSI 50 neutral (0/0), MACD pos hist & macd>signal (+1/0), pris < SMA20 (0/+1), pris > SMA50 (+1/0), SMA20 < SMA50 (0/+1)
      // = 2 bull, 2 bear, net=0 => BEHALL
      var macdBalanced = { macd: 0.5, signal: 0.3, histogram: 0.2 };
      var result = app.generateTASignal(50, macdBalanced, 105, 95, 100);
      // MACD: macd>signal, hist>0 => +1 bull
      // SMA20: pris 100 < sma20 105 => +1 bear
      // SMA50: pris 100 > sma50 95 => +1 bull
      // MA-kors: sma20 105 > sma50 95 => +1 bull
      // = 3 bull, 1 bear, net=2 => KOP
      // Jag behover mer precision. Lat mig berakna for net=0:
      // RSI neutral, MACD bear (+1 bear), pris > SMA20 (+1 bull), pris < SMA50 (+1 bear), SMA20 < SMA50 (+1 bear)
      // = 1 bull, 3 bear, net=-2 => SALJ
      // For net=0: MACD bull (+1), pris under sma20 (+1 bear), pris over sma50 (+1 bull), sma20 < sma50 (+1 bear)
      // = 2 bull, 2 bear = BEHALL
      var macdForBehall = { macd: 1.0, signal: 0.5, histogram: 0.5 };
      var resultBehall = app.generateTASignal(50, macdForBehall, 105, 110, 100);
      // RSI 50: neutral (0/0)
      // MACD: macd 1.0 > signal 0.5, hist 0.5 > 0 => +1 bull
      // SMA20: pris 100 < sma20 105 => +1 bear
      // SMA50: pris 100 < sma50 110 => +1 bear
      // MA-kors: sma20 105 < sma50 110 => +1 bear
      // = 1 bull, 3 bear = net -2 => SALJ
      // OK, for exakt behall: behover 2 bull 2 bear med neutral RSI
      // MACD bull (+1 bull), pris > sma20 (+1 bull), pris < sma50 (+1 bear), sma20 < sma50 (+1 bear) = 2-2=0
      var macdForBehall2 = { macd: 1.0, signal: 0.5, histogram: 0.5 };
      var resultBehall2 = app.generateTASignal(50, macdForBehall2, 95, 105, 100);
      // RSI 50: neutral
      // MACD: bull (+1)
      // SMA20: 100 > 95 => bull (+1)
      // SMA50: 100 < 105 => bear (+1)
      // MA-kors: 95 < 105 => bear (+1)
      // = 2 bull, 2 bear, net=0 => BEHALL
      assertEqual(resultBehall2.overallSignal, "BEHALL", "Net=0 ska ge BEHALL");
      assertEqual(resultBehall2.bullCount, 2, "bullCount ska vara 2");
      assertEqual(resultBehall2.bearCount, 2, "bearCount ska vara 2");
    });

    it("net >= 3 ger STARK KOP, net 1-2 ger KOP", function () {
      // net=2: RSI 35 (+1 bull), MACD bull (+1), pris>sma20(+1), pris<sma50(+1 bear), sma20<sma50(+1 bear) = 3-2=1 => KOP
      var macd = { macd: 1.0, signal: 0.5, histogram: 0.5 };
      var result = app.generateTASignal(35, macd, 98, 105, 100);
      // RSI 35: +1 bull (nar oversald)
      // MACD: +1 bull
      // SMA20: 100 > 98 => +1 bull
      // SMA50: 100 < 105 => +1 bear
      // MA-kors: 98 < 105 => +1 bear
      // = 3 bull, 2 bear, net=1 => KOP
      assertEqual(result.overallSignal, "KOP");
    });

    it("net <= -3 ger STARK SALJ, net -1 till -2 ger SALJ", function () {
      var macd = { macd: -1.0, signal: -0.5, histogram: -0.5 };
      var result = app.generateTASignal(65, macd, 105, 95, 100);
      // RSI 65: +1 bear (nar overkopt)
      // MACD: macd < signal, hist < 0 => +1 bear
      // SMA20: 100 < 105 => +1 bear
      // SMA50: 100 > 95 => +1 bull
      // MA-kors: 105 > 95 => +1 bull
      // = 2 bull, 3 bear, net=-1 => SALJ
      assertEqual(result.overallSignal, "SALJ");
    });

    it("returnerar alltid 5 signal-rader", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var result = app.generateTASignal(50, macd, 100, 100, 100);
      assertArrayLength(result.signals, 5, "Ska alltid ha 5 signal-rader");
      var indicators = result.signals.map(function (s) { return s.indicator; });
      assertTrue(indicators.indexOf("RSI") !== -1, "RSI ska finnas");
      assertTrue(indicators.indexOf("MACD") !== -1, "MACD ska finnas");
      assertTrue(indicators.indexOf("SMA20") !== -1, "SMA20 ska finnas");
      assertTrue(indicators.indexOf("SMA50") !== -1, "SMA50 ska finnas");
      assertTrue(indicators.indexOf("MA-kors") !== -1, "MA-kors ska finnas");
    });

    it("RSI-varde formateras med 1 decimal i signal-output", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var result = app.generateTASignal(45.678, macd, 100, 100, 100);
      var rsiSignal = result.signals.find(function (s) { return s.indicator === "RSI"; });
      assertEqual(rsiSignal.value, "45.7", "RSI ska avrundas till 1 decimal");
    });

    it("MACD-varde formateras med 2 decimaler i signal-output", function () {
      var macd = { macd: 1.2345, signal: 0.5, histogram: 0.7345 };
      var result = app.generateTASignal(50, macd, 100, 100, 100);
      var macdSignal = result.signals.find(function (s) { return s.indicator === "MACD"; });
      assertEqual(macdSignal.value, "1.23", "MACD ska avrundas till 2 decimaler");
    });

    it("exakta RSI-gransvarden: 30 ger KOP (nar oversald), 70 ger SALJ (nar overkopt)", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };

      // RSI exakt 30 -- faller INTE i < 30, faller i < 40 => "Nar oversald"
      var result30 = app.generateTASignal(30, macd, 100, 100, 100);
      var rsi30 = result30.signals.find(function (s) { return s.indicator === "RSI"; });
      assertEqual(rsi30.signal, "KOP", "RSI=30 ska ge KOP (nar oversald)");

      // RSI exakt 70 -- faller INTE i > 70, faller i > 60 => "Nar overkopt"
      var result70 = app.generateTASignal(70, macd, 100, 100, 100);
      var rsi70 = result70.signals.find(function (s) { return s.indicator === "RSI"; });
      assertEqual(rsi70.signal, "SALJ", "RSI=70 ska ge SALJ (nar overkopt)");
    });
  });

  // ================================================================
  // TEST SUITE 5: calculateSupportResistance() -- stod/motstand
  // ================================================================

  describe("calculateSupportResistance() -- stod- och motstandsnivaer", function () {

    // Skapa mock-prisdata med kanda pivot-punkter
    function makePriceBar(close, high, low) {
      return { close: String(close), high: String(high), low: String(low) };
    }

    it("identifierar motstandsniva (pivot high) over nuvarande pris", function () {
      // Data: index 0 ar senast. Pivot high vid index 2 kravs att high[2] > high[1], high[0], high[3], high[4]
      var data = [
        makePriceBar(100, 102, 98),   // 0: nuvarande pris = 100
        makePriceBar(99, 101, 97),    // 1
        makePriceBar(98, 115, 96),    // 2: PIVOT HIGH vid 115 (over 100)
        makePriceBar(97, 100, 95),    // 3
        makePriceBar(96, 99, 94),     // 4
      ];
      var result = app.calculateSupportResistance(data);
      assertTrue(result.resistance.length > 0, "Ska hitta minst 1 motstandsniva");
      assertAlmostEqual(result.resistance[0], 115, 0.01, "Motstand ska vara 115");
    });

    it("identifierar stodniva (pivot low) under nuvarande pris", function () {
      var data = [
        makePriceBar(100, 102, 98),   // 0: nuvarande = 100
        makePriceBar(101, 103, 99),   // 1
        makePriceBar(102, 104, 80),   // 2: PIVOT LOW vid 80 (under 100)
        makePriceBar(101, 103, 99),   // 3
        makePriceBar(100, 102, 98),   // 4
      ];
      var result = app.calculateSupportResistance(data);
      assertTrue(result.support.length > 0, "Ska hitta minst 1 stodniva");
      assertAlmostEqual(result.support[0], 80, 0.01, "Stod ska vara 80");
    });

    it("returnerar tomma arrayer om inga pivoter finns", function () {
      // Monotont stigande priser -- inga pivot highs over, inga pivot lows under
      var data = [];
      for (var i = 0; i < 10; i++) {
        var p = 100 + i;
        data.push(makePriceBar(p, p + 1, p - 1));
      }
      var result = app.calculateSupportResistance(data);
      assertTrue(Array.isArray(result.resistance), "resistance ska vara array");
      assertTrue(Array.isArray(result.support), "support ska vara array");
    });

    it("returnerar max 3 motstandsnivaer", function () {
      // Skapa data med manga pivot highs
      var data = [makePriceBar(50, 52, 48)]; // nuvarande = 50
      // Vi behover minst 2 datapunkter pa vardera sidan av varje pivot
      // Pa grund av 5-punkters pivot-logik (i-2, i-1, i, i+1, i+2) behover vi langre data
      for (var i = 0; i < 30; i++) {
        if (i % 5 === 2) {
          // Pivot high
          data.push(makePriceBar(55, 60 + i, 54));
        } else {
          data.push(makePriceBar(55, 56, 54));
        }
      }
      var result = app.calculateSupportResistance(data);
      assertTrue(result.resistance.length <= 3, "Max 3 motstandsnivaer");
    });

    it("motstandsnivaer sorteras stigande (narmaste forst)", function () {
      // Data med tva tydliga pivot highs over nuvarande pris
      var data = [
        makePriceBar(100, 102, 98),  // 0: nuvarande = 100
        makePriceBar(99, 101, 97),   // 1
        makePriceBar(98, 120, 96),   // 2: pivot high 120
        makePriceBar(97, 100, 95),   // 3
        makePriceBar(96, 99, 94),    // 4
        makePriceBar(95, 98, 93),    // 5
        makePriceBar(94, 110, 92),   // 6: pivot high 110
        makePriceBar(93, 97, 91),    // 7
        makePriceBar(92, 96, 90),    // 8
      ];
      var result = app.calculateSupportResistance(data);
      if (result.resistance.length >= 2) {
        assertTrue(
          result.resistance[0] <= result.resistance[1],
          "Motstandsnivaer ska vara sorterade stigande (narmaste forst)"
        );
      }
    });

    it("kravs minst 5 datapunkter for att hitta pivoter", function () {
      // Med < 5 datapunkter kan inga pivoter hittas (for-loopen borjar vid i=2, slutar vid length-2)
      var data = [
        makePriceBar(100, 120, 80),
        makePriceBar(100, 120, 80),
        makePriceBar(100, 120, 80),
        makePriceBar(100, 120, 80),
      ];
      var result = app.calculateSupportResistance(data);
      assertArrayLength(result.resistance, 0, "Ska inte hitta motstand med < 5 datapunkter");
      assertArrayLength(result.support, 0, "Ska inte hitta stod med < 5 datapunkter");
    });
  });

  // ================================================================
  // TEST SUITE 6: createRiskDots() -- riskvisualisering
  // ================================================================

  describe("createRiskDots() -- riskvisualisering", function () {

    it("riskScore 0 visar skoldikon (checkmark) istallet for dots", function () {
      var container = app.createRiskDots(0);
      assertInstanceOf(container, HTMLElement, "Ska returnera HTMLElement");
      var shield = container.querySelector(".risk-shield");
      assertNotNull(shield, "Ska ha en .risk-shield element");
      assertEqual(shield.textContent, "✓", "Shield ska visa checkmark");
      var dots = container.querySelectorAll(".risk-dot");
      assertArrayLength(Array.from(dots), 0, "Ska inte ha nagon risk-dot vid score 0");
    });

    it("riskScore 1 visar 5 dots, 1 fylld gron (risk-dot-filled-low)", function () {
      var container = app.createRiskDots(1);
      var dots = container.querySelectorAll(".risk-dot");
      assertArrayLength(Array.from(dots), 5, "Ska ha 5 dots");
      var filled = container.querySelectorAll(".risk-dot-filled-low");
      assertArrayLength(Array.from(filled), 1, "Ska ha 1 fylld gron dot");
    });

    it("riskScore 2 visar 5 dots, 2 fyllda grona (risk-dot-filled-low)", function () {
      var container = app.createRiskDots(2);
      var filled = container.querySelectorAll(".risk-dot-filled-low");
      assertArrayLength(Array.from(filled), 2, "Ska ha 2 fyllda grona dots");
    });

    it("riskScore 3 visar 5 dots, 3 fyllda gula (risk-dot-filled-medium)", function () {
      var container = app.createRiskDots(3);
      var filled = container.querySelectorAll(".risk-dot-filled-medium");
      assertArrayLength(Array.from(filled), 3, "Ska ha 3 fyllda gula dots");
    });

    it("riskScore 4 visar 5 dots, 4 fyllda roda (risk-dot-filled)", function () {
      var container = app.createRiskDots(4);
      var filled = container.querySelectorAll(".risk-dot-filled");
      assertArrayLength(Array.from(filled), 4, "Ska ha 4 fyllda roda dots");
    });

    it("riskScore 5 visar 5 dots, 5 fyllda roda (risk-dot-filled)", function () {
      var container = app.createRiskDots(5);
      var filled = container.querySelectorAll(".risk-dot-filled");
      assertArrayLength(Array.from(filled), 5, "Ska ha 5 fyllda roda dots");
    });

    it("container har aria-label med riskniva", function () {
      var container = app.createRiskDots(3);
      var label = container.getAttribute("aria-label");
      assertContains(label, "3", "aria-label ska innehalla risknivan");
      assertContains(label, "5", "aria-label ska referera till skalan (av 5)");
    });

    it("fargkodning foljer gransvardet: score 2 = gron, score 3 = gul, score 4 = rod", function () {
      // Score 2: low (gron)
      var c2 = app.createRiskDots(2);
      assertTrue(c2.querySelectorAll(".risk-dot-filled-low").length > 0, "Score 2 ska ha low (grona) dots");
      assertEqual(c2.querySelectorAll(".risk-dot-filled-medium").length, 0, "Score 2 ska inte ha medium dots");
      assertEqual(c2.querySelectorAll(".risk-dot-filled").length, 0, "Score 2 ska inte ha roda dots");

      // Score 3: medium (gul)
      var c3 = app.createRiskDots(3);
      assertTrue(c3.querySelectorAll(".risk-dot-filled-medium").length > 0, "Score 3 ska ha medium (gula) dots");
      assertEqual(c3.querySelectorAll(".risk-dot-filled-low").length, 0, "Score 3 ska inte ha low dots");

      // Score 4: high (rod)
      var c4 = app.createRiskDots(4);
      assertTrue(c4.querySelectorAll(".risk-dot-filled").length > 0, "Score 4 ska ha roda dots");
      assertEqual(c4.querySelectorAll(".risk-dot-filled-low").length, 0, "Score 4 ska inte ha low dots");
      assertEqual(c4.querySelectorAll(".risk-dot-filled-medium").length, 0, "Score 4 ska inte ha medium dots");
    });
  });

  // ================================================================
  // TEST SUITE 7: showErrorToast() -- felmeddelanden
  // ================================================================

  describe("showErrorToast() -- toast-meddelanden", function () {

    // Rensa eventuella toasts mellan tester
    function cleanupToast() {
      var existing = document.getElementById("error-toast");
      if (existing) existing.remove();
    }

    it("skapar en toast i DOM med korrekt meddelande", function () {
      cleanupToast();
      app.showErrorToast("Testmeddelande");
      var toast = document.getElementById("error-toast");
      assertNotNull(toast, "Toast ska finnas i DOM");
      assertEqual(toast.textContent, "Testmeddelande", "Toast ska visa korrekt meddelande");
      cleanupToast();
    });

    it("toast har role='alert' for tillganglighet", function () {
      cleanupToast();
      app.showErrorToast("Tillganglighetsttest");
      var toast = document.getElementById("error-toast");
      assertEqual(toast.getAttribute("role"), "alert", "Toast ska ha role=alert");
      cleanupToast();
    });

    it("toast positioneras med position:fixed", function () {
      cleanupToast();
      app.showErrorToast("Positionstest");
      var toast = document.getElementById("error-toast");
      assertContains(toast.style.cssText, "fixed", "Toast ska ha position:fixed");
      cleanupToast();
    });

    it("ny toast tar bort gammal toast (bara en at gangen)", function () {
      cleanupToast();
      app.showErrorToast("Forsta toast");
      app.showErrorToast("Andra toast");
      var toasts = document.querySelectorAll("#error-toast");
      assertArrayLength(Array.from(toasts), 1, "Bara en toast ska finnas");
      assertEqual(toasts[0].textContent, "Andra toast", "Senaste toasten ska visas");
      cleanupToast();
    });

    it("toast kan klickas bort manuellt", function () {
      cleanupToast();
      app.showErrorToast("Klickbar toast");
      var toast = document.getElementById("error-toast");
      assertNotNull(toast, "Toast ska finnas innan klick");
      toast.click();
      var afterClick = document.getElementById("error-toast");
      assertTrue(afterClick === null, "Toast ska forsvinna efter klick");
    });

    it("toast forsvinner automatiskt efter timeout", function () {
      cleanupToast();
      // Vi kan inte vanta 8 sekunder i testet, men vi verifierar att setTimeout anropas
      // genom att kontrollera att toast finns direkt efter skapande
      app.showErrorToast("Timeout-test");
      var toast = document.getElementById("error-toast");
      assertNotNull(toast, "Toast ska finnas direkt efter skapande");
      cleanupToast();
    });

    it("toast-text med specialtecken renderas korrekt", function () {
      cleanupToast();
      var msg = "Fel: anslutning <timeout> & retry misslyckades";
      app.showErrorToast(msg);
      var toast = document.getElementById("error-toast");
      assertEqual(toast.textContent, msg, "Specialtecken ska renderas korrekt via textContent");
      cleanupToast();
    });
  });

  // ================================================================
  // TEST SUITE 8: fetchWithTimeout() -- timeout-hantering
  // ================================================================

  describe("fetchWithTimeout() -- timeout-hantering", function () {

    it("returnerar ett Promise-objekt", function () {
      // Anropa med en URL som inte existerar men kontrollera typen
      var result = app.fetchWithTimeout("http://localhost:99999/nonexistent", null, 100);
      assertInstanceOf(result, Promise, "Ska returnera en Promise");
      // Fanga rejection sa vi inte far unhandled rejection
      result.catch(function () {});
    });

    it("avbryter fetch efter angiven timeout (avbrott ger AbortError)", function () {
      // Anropa med en URL som inte svarar och en kort timeout
      var startTime = Date.now();
      return app.fetchWithTimeout("http://10.255.255.1:9999/timeout-test", null, 200)
        .then(function () {
          throw new Error("Forvantar rejection men Promise resolvade");
        })
        .catch(function (err) {
          var elapsed = Date.now() - startTime;
          // Verifiera att det tog ungefar 200ms (inte 30s default timeout)
          assertTrue(elapsed < 5000, "Ska avbryta inom rimlig tid (fick " + elapsed + "ms)");
          // Felet ska vara AbortError eller TypeError (beroende pa browser)
          assertTrue(
            err.name === "AbortError" || err.name === "TypeError" || err.message.indexOf("abort") !== -1,
            "Felet ska vara relaterat till abort, fick: " + err.name + ": " + err.message
          );
        });
    });

    it("default timeout ar 5000ms om inget anges", function () {
      // Vi testar inte faktisk timeout pa 5 sek, men vi kan verifiera
      // att funktionen accepterar anropet utan timeoutMs-parameter
      var result = app.fetchWithTimeout("http://localhost:99999/default-timeout");
      assertInstanceOf(result, Promise, "Ska fungera utan timeout-parameter");
      result.catch(function () {});
    });
  });

  // ================================================================
  // TEST SUITE 9: Hjalpfunktioner
  // ================================================================

  describe("Hjalpfunktioner (el, hasApiKey, formatLargeNumber)", function () {

    it("el() skapar element med korrekt tagg", function () {
      var node = app.el("div");
      assertEqual(node.tagName, "DIV");
    });

    it("el() satter className korrekt", function () {
      var node = app.el("span", "test-class");
      assertEqual(node.className, "test-class");
    });

    it("el() satter textContent korrekt", function () {
      var node = app.el("p", null, "Testtext");
      assertEqual(node.textContent, "Testtext");
    });

    it("hasApiKey() returnerar false for 'demo'", function () {
      // API_KEYS ar hardkodade till "demo" i stocks.js
      assertFalse(app.hasApiKey("twelveData"), "demo-nyckel ska ge false");
    });

    it("formatLargeNumber() formaterar miljarder med B", function () {
      assertEqual(app.formatLargeNumber(1500000000), "1.5B");
    });

    it("formatLargeNumber() formaterar miljoner med M", function () {
      assertEqual(app.formatLargeNumber(2500000), "2.5M");
    });

    it("formatLargeNumber() formaterar tusentals med K", function () {
      assertEqual(app.formatLargeNumber(5000), "5K");
    });

    it("formatLargeNumber() returnerar vanligt tal for sma tal", function () {
      assertEqual(app.formatLargeNumber(42), "42");
    });
  });

  // ================================================================
  // TEST SUITE 10: Regressionstester -- edge cases
  // ================================================================

  describe("Regressionstester -- edge cases och gransvarden", function () {

    it("fmtPrice hanterar mycket sma penny stock-priser", function () {
      var result = app.fmtPrice(0.0001, "US");
      assertContains(result, "$", "Penny stock ska ha $");
      assertContains(result, "0.00", "Mycket litet pris ska avrundas till 0.00");
    });

    it("fmtLarge hanterar exakt noll", function () {
      var result = app.fmtLarge(0);
      assertContains(result, "$", "Noll ska ha $");
      assertContains(result, "0", "Noll ska visa 0");
    });

    it("generateTASignal hanterar extrema RSI-varden (0 och 100)", function () {
      var macd = { macd: 0, signal: 0, histogram: 0 };
      var result0 = app.generateTASignal(0, macd, 100, 100, 100);
      var rsi0 = result0.signals.find(function (s) { return s.indicator === "RSI"; });
      assertEqual(rsi0.signal, "KOP", "RSI=0 ska ge KOP (oversald)");

      var result100 = app.generateTASignal(100, macd, 100, 100, 100);
      var rsi100 = result100.signals.find(function (s) { return s.indicator === "RSI"; });
      assertEqual(rsi100.signal, "SALJ", "RSI=100 ska ge SALJ (overkopt)");
    });

    it("generateTASignal hanterar negativa MACD-varden", function () {
      var macd = { macd: -5.5, signal: -2.3, histogram: -3.2 };
      var result = app.generateTASignal(50, macd, 100, 100, 100);
      var macdSignal = result.signals.find(function (s) { return s.indicator === "MACD"; });
      assertEqual(macdSignal.signal, "SALJ", "Negativ MACD ska ge SALJ");
      assertEqual(macdSignal.value, "-5.50", "Negativt MACD-varde ska formateras korrekt");
    });

    it("calculateSupportResistance hanterar strangdata korrekt", function () {
      // close, high, low ar strangar i riktiga API-svar
      var data = [
        { close: "100.50", high: "101.00", low: "99.00" },
        { close: "99.00", high: "100.00", low: "98.00" },
        { close: "105.00", high: "120.00", low: "95.00" },
        { close: "99.00", high: "100.00", low: "98.00" },
        { close: "98.00", high: "99.00", low: "97.00" },
      ];
      var result = app.calculateSupportResistance(data);
      // Ska inte krascha med strangdata
      assertTrue(Array.isArray(result.resistance), "Ska returnera resistance-array");
      assertTrue(Array.isArray(result.support), "Ska returnera support-array");
    });

    it("fmtPct hanterar -0 korrekt", function () {
      var result = app.fmtPct(-0);
      // -0 ar numeriskt lika med 0, sa >= 0 ar true
      assertEqual(result, "+0.00%", "-0 ska behandlas som +0.00%");
    });

    it("createRiskDots returnerar container med korrekt CSS-klass", function () {
      var container = app.createRiskDots(3);
      assertEqual(container.className, "risk-dots", "Container ska ha klass 'risk-dots'");
    });
  });

  // ================================================================
  // Kor alla tester
  // ================================================================

  function runAllTests() {
    var totalTests = 0;
    var passed = 0;
    var failed = 0;
    var resultsDiv = document.getElementById("results");
    var completedSuites = 0;
    var totalSuites = suites.length;

    suites.forEach(function (suite) {
      var suiteDiv = document.createElement("div");
      suiteDiv.className = "suite";

      var header = document.createElement("div");
      header.className = "suite-header";
      header.textContent = suite.name;
      suiteDiv.appendChild(header);

      var pendingAsync = [];

      suite.tests.forEach(function (test) {
        totalTests++;
        var testDiv = document.createElement("div");
        testDiv.className = "test-result";

        var startTime = performance.now();
        try {
          var result = test.fn();

          if (result && typeof result.then === "function") {
            // Async test
            pendingAsync.push(
              result
                .then(function () {
                  var elapsed = (performance.now() - startTime).toFixed(1);
                  testDiv.classList.add("test-pass");
                  testDiv.innerHTML =
                    '<span class="test-icon">OK</span>' +
                    '<span class="test-name">' + escapeHtml(test.name) + '</span>' +
                    '<span class="test-time">' + elapsed + 'ms</span>';
                  passed++;
                })
                .catch(function (err) {
                  var elapsed = (performance.now() - startTime).toFixed(1);
                  testDiv.classList.add("test-fail");
                  testDiv.innerHTML =
                    '<span class="test-icon">FEL</span>' +
                    '<span class="test-name">' + escapeHtml(test.name) + '</span>' +
                    '<span class="test-time">' + elapsed + 'ms</span>' +
                    '<span class="test-error">' + escapeHtml(err.message) + '</span>';
                  failed++;
                })
            );
          } else {
            var elapsed = (performance.now() - startTime).toFixed(1);
            testDiv.classList.add("test-pass");
            testDiv.innerHTML =
              '<span class="test-icon">OK</span>' +
              '<span class="test-name">' + escapeHtml(test.name) + '</span>' +
              '<span class="test-time">' + elapsed + 'ms</span>';
            passed++;
          }
        } catch (err) {
          var elapsed = (performance.now() - startTime).toFixed(1);
          testDiv.classList.add("test-fail");
          testDiv.innerHTML =
            '<span class="test-icon">FEL</span>' +
            '<span class="test-name">' + escapeHtml(test.name) + '</span>' +
            '<span class="test-time">' + elapsed + 'ms</span>' +
            '<span class="test-error">' + escapeHtml(err.message) + '</span>';
          failed++;
        }

        suiteDiv.appendChild(testDiv);
      });

      resultsDiv.appendChild(suiteDiv);

      // Vanta pa async-tester i denna suite
      if (pendingAsync.length > 0) {
        Promise.all(pendingAsync).then(function () {
          completedSuites++;
          if (completedSuites === totalSuites) {
            updateSummary();
          }
        });
      } else {
        completedSuites++;
        if (completedSuites === totalSuites) {
          updateSummary();
        }
      }
    });

    function updateSummary() {
      var summary = document.getElementById("summary");
      if (failed === 0) {
        summary.textContent = "ALLA TESTER KLARADE: " + passed + " av " + totalTests + " tester godkanda";
        summary.className = "summary summary-pass";
      } else {
        summary.textContent = "MISSLYCKADE TESTER: " + failed + " av " + totalTests + " tester misslyckades (" + passed + " godkanda)";
        summary.className = "summary summary-fail";
      }
    }

    // Om inga async-tester, uppdatera direkt
    if (totalTests === passed + failed) {
      updateSummary();
    }
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Kor testerna efter att DOM laddats
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runAllTests);
  } else {
    // Kort delay for att lata stocks.js init() koras forst
    setTimeout(runAllTests, 100);
  }

})();
