/**
 * US-börs (NYSE/Nasdaq) – enkel kalender i Eastern Time.
 */

const MARKET_CLOSE_HOUR_ET = 16;

function formatDateET(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function getETClock(date = new Date()) {
  const hour = Number(date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }));
  const minute = Number(date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    minute: "2-digit",
  }));
  const weekday = date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  return { hour, minute, minutesSinceMidnight: hour * 60 + minute, weekday };
}

function isWeekendDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function isTradingDay(dateStr) {
  return !isWeekendDate(dateStr);
}

/** Har målhandelsdagens session stängt och kan resultat mätas? */
function canVerifyTargetDate(targetDate, now = new Date()) {
  if (!targetDate) {
    return { ok: false, reason: "Saknar målhandelsdag" };
  }

  if (!isTradingDay(targetDate)) {
    return { ok: false, reason: `${targetDate} är en helg – börsen är stängd` };
  }

  const todayET = formatDateET(now);
  const clock = getETClock(now);

  if (targetDate > todayET) {
    const dayName = isWeekendDate(todayET) ? "helgen" : "idag";
    return {
      ok: false,
      reason: `Målhandelsdag ${targetDate} har inte stängt än – börsen är stängd ${dayName}`,
    };
  }

  if (targetDate === todayET && clock.minutesSinceMidnight < MARKET_CLOSE_HOUR_ET * 60) {
    return {
      ok: false,
      reason: "Börsen är öppen – verifiera efter stängning 16:00 ET",
    };
  }

  return { ok: true };
}

/** Resultat ska visas – annars väntar vi på handelsdag. */
function isRocketResultReady(prediction, rocket) {
  if (!rocket || !rocket.result) return false;
  if (rocket.result.status === "pending" || rocket.result.status === "market_closed") return false;
  const check = canVerifyTargetDate(prediction?.target_date);
  return check.ok;
}

function timestampToDateET(ts) {
  return new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

module.exports = {
  formatDateET,
  getETClock,
  isWeekendDate,
  isTradingDay,
  canVerifyTargetDate,
  isRocketResultReady,
  timestampToDateET,
  MARKET_CLOSE_HOUR_ET,
};
