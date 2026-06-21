# Prediktioner & Verifiering

Denna mapp sparar scanner-prediktioner för att kunna verifiera om de stämmer.

## Format
- `YYYY-MM-DD-weekday.json` - VD/manuella måndagspicks
- `YYYY-MM-DD-morgondagens-raketer.json` - automatiska raket-picks (max 3, score ≥65, inga pump-flaggor)
- `rockets.json` - samlad historik för API

## Aktiva prediktioner
- `2026-06-23-monday.json` - VD:ns måndagspicks (skapad 2026-06-19)
- `*-morgondagens-raketer.json` - genereras vid varje `generateRockets()`-körning

## Verifieringsprocess
1. Efter målhandelsdagens stängning: `POST /api/rockets/verify` med `{ "date": "YYYY-MM-DD" }` (prediktionsdatum)
2. Jämför `price_at_prediction` mot stängningskurs
3. Raket träff: **+20%** | Stop-loss: **-8%** | Annars flat/up/down
4. Resultat sparas i `rockets.json` och i snapshot-filen under `verification`
