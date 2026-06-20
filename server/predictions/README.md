# Prediktioner & Verifiering

Denna mapp sparar scanner-prediktioner för att kunna verifiera om de stämmer.

## Format
- `YYYY-MM-DD-weekday.json` - prediktioner för den dagen
- Varje fil innehåller: prediktionsdatum, entry/stop/target, katalysator
- Verifiering görs genom att jämföra mot faktiskt pris vid market close

## Aktiva prediktioner
- `2026-06-23-monday.json` - VD:ns måndagspicks (skapad 2026-06-19)

## Verifieringsprocess
1. På måndagen (23 juni), kör scannern och hämta stängningspriser
2. Jämför mot entry-range, stop-loss och targets
3. Markera varje pick som: HIT TARGET 1, HIT TARGET 2, STOPPED OUT, eller FLAT
