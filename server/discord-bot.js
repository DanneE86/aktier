/**
 * Discord Bot – Aktieanalys & Raketprediktion
 *
 * Kommandon:
 *   !raketer        – Dagens raketprediktioner
 *   !scan           – Kör marknadsscanning
 *   !status         – Backend-status och senaste scan
 *   !aktier         – Kortsiktiga aktietips
 *   !historik       – Rakethistorik med resultat
 *   !pris TICKER    – Aktuell kurs för en ticker
 *   !hjälp          – Visa alla kommandon
 *
 * Setup:
 *   1. Skapa bot på https://discord.com/developers/applications
 *   2. Sätt DISCORD_BOT_TOKEN i .env
 *   3. Bjud in boten till din server med Message Content intent
 *   4. npm run discord
 */

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const path = require("path");

// Ladda .env om den finns
try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch (e) {
  // dotenv inte installerat – använda process.env direkt
}

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error("\n❌ DISCORD_BOT_TOKEN saknas!");
  console.error("   1. Skapa en bot på https://discord.com/developers/applications");
  console.error("   2. Skapa filen server/.env med: DISCORD_BOT_TOKEN=din-token-här");
  console.error("   3. Kör: npm run discord\n");
  process.exit(1);
}

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ── Hjälpfunktioner ──────────────────────────────────────────────

async function apiFetch(endpoint, options) {
  const url = BACKEND_URL + endpoint;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function riskEmoji(score) {
  if (score <= 1) return "🟢";
  if (score <= 2) return "🟢";
  if (score <= 3) return "🟡";
  if (score <= 4) return "🟠";
  return "🔴";
}

function changeColor(pct) {
  return pct >= 0 ? 0x2ecc71 : 0xe74c3c;
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.substring(0, len - 3) + "..." : str;
}

// ── Kommandon ────────────────────────────────────────────────────

async function cmdRaketer(message) {
  try {
    const data = await apiFetch("/api/rockets/today");

    if (!data.rockets || data.rockets.length === 0) {
      return message.reply("🚀 Inga raketer genererade ännu. Kör `!scan` först, sedan `!generera`.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🚀 Morgondagens Raketer")
      .setDescription(
        `**Prediktionsdatum:** ${data.prediction_date}\n` +
        `**Måldag:** ${data.target_date}\n` +
        `**Universum:** ${data.scanner_universe} aktier | **Kandidater:** ${data.candidates_scored}`
      )
      .setColor(0xf4d35e)
      .setTimestamp();

    data.rockets.forEach((r, i) => {
      const chg = r.change_today >= 0 ? "+" + r.change_today.toFixed(1) : r.change_today.toFixed(1);
      const flags = (r.risk_flags || []).join(", ");

      embed.addFields({
        name: `#${i + 1} ${r.name} (${r.ticker})`,
        value:
          `💰 **$${(r.price_at_prediction || 0).toFixed(2)}** (${chg}% idag)\n` +
          `🎯 Raket-score: **${r.rocket_score}** | Konfidens: ${r.confidence_score}/100\n` +
          `${riskEmoji(r.risk_score)} Risk: ${r.risk_score}/5 | Vol: ${formatNum(r.volume)} (${(r.relative_volume || 0).toFixed(1)}x)\n` +
          `📋 ${truncate(r.trigger_reason, 150)}` +
          (flags ? `\n⚠️ ${flags}` : ""),
        inline: false,
      });
    });

    embed.setFooter({ text: "⚠️ INTE finansiell rådgivning. DYOR." });
    return message.reply({ embeds: [embed] });
  } catch (e) {
    return message.reply("❌ Kunde inte hämta raketer: " + e.message + "\nÄr backend igång? (`!status`)");
  }
}

async function cmdScan(message) {
  const reply = await message.reply("⏳ Skannar marknaden... (kan ta 1-2 min)");
  try {
    const data = await apiFetch("/api/scanner/run", { method: "POST" });
    await reply.edit(`✅ Scanning klar! Hittade **${data.count}** aktier.\nAnvänd \`!raketer\` för att se prediktioner.`);
  } catch (e) {
    await reply.edit("❌ Scanning misslyckades: " + e.message);
  }
}

async function cmdGenerera(message) {
  const reply = await message.reply("⏳ Genererar raketprediktioner...");
  try {
    const data = await apiFetch("/api/rockets/generate", { method: "POST" });
    if (!data.rockets || data.rockets.length === 0) {
      return reply.edit("⚠️ Inga kvalificerade raketer hittades. Kör `!scan` för att uppdatera data.");
    }
    const tickers = data.rockets.map((r, i) => `#${i + 1} **${r.ticker}** ($${(r.price_at_prediction || 0).toFixed(2)}) – Score: ${r.rocket_score}`);
    await reply.edit(
      `🚀 **${data.rockets.length} raketer genererade!**\n` +
      `Måldag: ${data.target_date}\n\n` +
      tickers.join("\n") +
      `\n\nAnvänd \`!raketer\` för fullständig analys.`
    );
  } catch (e) {
    await reply.edit("❌ Kunde inte generera: " + e.message);
  }
}

async function cmdStatus(message) {
  try {
    const stats = await apiFetch("/api/scanner/stats");
    const embed = new EmbedBuilder()
      .setTitle("📊 Backend-status")
      .setColor(0x6dd5ed)
      .addFields(
        { name: "Senaste scan", value: stats.lastScan ? stats.lastScan.scan_date + " " + stats.lastScan.scan_time : "Aldrig", inline: true },
        { name: "Dagens träffar", value: String(stats.todayHits), inline: true },
        { name: "Prisintervall", value: stats.config.priceRange, inline: true },
      )
      .setTimestamp();

    if (stats.lastScan) {
      embed.addFields(
        { name: "Aktier skannade", value: String(stats.lastScan.stocks_scanned || 0), inline: true },
        { name: "Exkluderade (pump)", value: String(stats.todayKilled || 0), inline: true },
      );
    }

    return message.reply({ embeds: [embed] });
  } catch (e) {
    return message.reply("❌ Backend offline. Starta med: `cd server && npm start`");
  }
}

async function cmdAktier(message) {
  // Kortsiktiga picks från stocks.js – vi hämtar från scanner/today
  try {
    const data = await apiFetch("/api/scanner/today?limit=5");
    if (!data.hits || data.hits.length === 0) {
      return message.reply("📋 Inga scanner-träffar idag. Kör `!scan` för att skanna.");
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Topp 5 Scanner-träffar idag")
      .setColor(0x8a9cff)
      .setTimestamp();

    data.hits.forEach((h, i) => {
      const chg = (h.change_pct || 0) >= 0 ? "+" + (h.change_pct || 0).toFixed(1) : (h.change_pct || 0).toFixed(1);
      embed.addFields({
        name: `${i + 1}. ${h.name || h.ticker} (${h.ticker})`,
        value:
          `💰 $${(h.price || 0).toFixed(2)} (${chg}%)\n` +
          `${riskEmoji(h.risk_score)} Risk: ${h.risk_score || 3}/5 | Konf: ${h.confidence_score || 0}/100\n` +
          `${truncate(h.trigger_reason, 120)}`,
        inline: false,
      });
    });

    embed.setFooter({ text: "⚠️ INTE finansiell rådgivning. DYOR." });
    return message.reply({ embeds: [embed] });
  } catch (e) {
    return message.reply("❌ Kunde inte hämta aktier: " + e.message);
  }
}

async function cmdHistorik(message) {
  try {
    const data = await apiFetch("/api/rockets/history");
    if (!data.predictions || data.predictions.length === 0) {
      return message.reply("📜 Ingen rakethistorik ännu.");
    }

    const embed = new EmbedBuilder()
      .setTitle("📜 Rakethistorik")
      .setColor(0xf4d35e)
      .setTimestamp();

    data.predictions.slice(0, 10).forEach((pred) => {
      const tickers = (pred.rockets || []).map(r => {
        if (r.result) {
          const icon = r.result.was_correct ? "✅" : "❌";
          return `${icon} ${r.ticker} (${r.result.change_pct >= 0 ? "+" : ""}${r.result.change_pct.toFixed(1)}%)`;
        }
        return `⏳ ${r.ticker}`;
      }).join("\n");

      let summary = "";
      if (pred.summary) {
        summary = `\n📊 Träffgrad: **${pred.summary.hit_rate}%** | Snitt: ${pred.summary.avg_change >= 0 ? "+" : ""}${pred.summary.avg_change}%`;
      }

      embed.addFields({
        name: `${pred.prediction_date} → ${pred.target_date || "?"}`,
        value: tickers + summary,
        inline: false,
      });
    });

    return message.reply({ embeds: [embed] });
  } catch (e) {
    return message.reply("❌ Kunde inte hämta historik: " + e.message);
  }
}

async function cmdPris(message, ticker) {
  if (!ticker) return message.reply("❓ Ange en ticker: `!pris NVDA`");

  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await apiFetch(`/api/rockets/prices?tickers=${encodeURIComponent(ticker.toUpperCase())}&date=${today}`);
    const prices = data.prices || {};
    const info = prices[ticker.toUpperCase()];

    if (!info) {
      return message.reply(`❌ Kunde inte hitta kursdata för **${ticker.toUpperCase()}**.`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`💰 ${ticker.toUpperCase()} – Kursdata`)
      .setColor(info.current && info.open ? changeColor(info.current - info.open) : 0x6dd5ed)
      .addFields(
        { name: "Öppning", value: info.open != null ? `$${info.open.toFixed(2)}` : "—", inline: true },
        { name: "Stängning", value: info.close != null ? `$${info.close.toFixed(2)}` : "—", inline: true },
        { name: "Aktuell", value: info.current != null ? `$${info.current.toFixed(2)}` : "—", inline: true },
      )
      .setTimestamp()
      .setFooter({ text: "Data: Yahoo Finance" });

    if (info.current != null && info.open != null) {
      const dayChg = ((info.current - info.open) / info.open * 100);
      embed.addFields({
        name: "Dagförändring",
        value: `${dayChg >= 0 ? "📈 +" : "📉 "}${dayChg.toFixed(2)}%`,
        inline: true,
      });
    }

    return message.reply({ embeds: [embed] });
  } catch (e) {
    return message.reply("❌ Kunde inte hämta pris: " + e.message);
  }
}

function cmdHjalp(message) {
  const embed = new EmbedBuilder()
    .setTitle("🤖 Aktiebot – Kommandon")
    .setColor(0x6dd5ed)
    .addFields(
      { name: "🚀 `!raketer`", value: "Visa dagens raketprediktioner", inline: true },
      { name: "🔍 `!scan`", value: "Kör marknadsscanning", inline: true },
      { name: "⚡ `!generera`", value: "Generera nya raketer", inline: true },
      { name: "📋 `!aktier`", value: "Topp 5 scanner-träffar", inline: true },
      { name: "📜 `!historik`", value: "Rakethistorik & resultat", inline: true },
      { name: "💰 `!pris TICKER`", value: "Kurs för specifik aktie", inline: true },
      { name: "📊 `!status`", value: "Backend-status", inline: true },
      { name: "❓ `!hjälp`", value: "Visa detta meddelande", inline: true },
    )
    .setFooter({ text: "⚠️ Inte finansiell rådgivning. Investera alltid ansvarsfullt." });

  return message.reply({ embeds: [embed] });
}

function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n || 0);
}

// ── Meddelandehantering ──────────────────────────────────────────

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();

  switch (cmd) {
    case "raketer":
    case "rockets":
      return cmdRaketer(message);

    case "scan":
    case "skanna":
      return cmdScan(message);

    case "generera":
    case "generate":
      return cmdGenerera(message);

    case "status":
      return cmdStatus(message);

    case "aktier":
    case "stocks":
    case "tips":
      return cmdAktier(message);

    case "historik":
    case "history":
      return cmdHistorik(message);

    case "pris":
    case "price":
    case "kurs":
      return cmdPris(message, args[1]);

    case "hjälp":
    case "hjalp":
    case "help":
      return cmdHjalp(message);

    default:
      // Ignorera okända kommandon
      break;
  }
});

// ── Startup ──────────────────────────────────────────────────────

client.once("ready", () => {
  console.log(`\n🤖 Discord-bot online: ${client.user.tag}`);
  console.log(`   Backend: ${BACKEND_URL}`);
  console.log(`   Kommandon: !raketer, !scan, !aktier, !pris, !status, !hjälp\n`);

  client.user.setActivity("!hjälp | Aktieanalys", { type: 3 });
});

client.login(TOKEN);
