# Belast 🛡️⚽

Loggfør treningshverdagen – laget i Viking FK-tema
(mørk marineblå `#132436`, gull `#DBC067`, hvit, Viking-rød `#72121C` til varsler).

## Hva appen gjør

**Loggføring (med etterregistrering)**
- Hver dag kan du registrere type trening: kamp/trening med sonelag, kamp/trening
  med Hana, egentrening, hviledag eller annet (flere kan kombineres per dag)
- Opplevd treningsbelastning 1–10 (slider)
- Varighet i minutter (valgfritt)
- Skader/vondter: kroppsdel (rygg, hofte, lår, kne, legg, fot, annet) + smertenivå 1–10 + kommentar
- Månedskalender med fargekoding – trykk på **hvilken som helst tidligere dag** for å
  etterregistrere eller rette

**Statistikk**
- Nøkkeltall for 7 / 30 / 90 dager / hele perioden: antall økter (per type),
  total og snitt belastning, total smerte, dager med smerte
- **ACWR** (akutt:kronisk belastningsforhold, 7 vs 28 dager) med grønn/gul/rød sone
- Trendlinjer for belastning og smerte, søylediagram per uke
- Kalender-heatmap over belastning (rød ring = smerte registrert)
- Smerte per kroppsdel, scatter-plot belastning vs smerte
- Registreringsstreak og belastningsendring vs forrige periode
- Smertevarsel ved smerte ≥ 6 flere dager på rad

**Data og personvern**
- All data lagres **kun lokalt** i nettleseren (IndexedDB) – ingen sky, ingen konto, ingen sporing
- Innlogging med brukernavn/passord (lokalt, passord lagres kun som SHA-256-hash i koden)
- Eksport: **JSON-backup** (for gjenoppretting) og **CSV** (for Excel / deling med trener eller fysio)

## Innlogging

- Brukernavn: `viking`
- Passord: `Viking1899`

> Endre ved å generere ny hash: `printf 'NyttPassord' | sha256sum`, og sett den i
> `src/lib/auth.ts` (konstant `AUTH_PASS_HASH`). Brukernavnet ligger i `AUTH_USER`.

## Komme i gang

```bash
npm install
npm run dev      # utviklingsserver
npm test         # enhetstester
npm run build    # produksjonsbygg i dist/
npm run preview  # forhåndsvisning av bygget
```

## Bruk som app på telefonen

Appen er en **PWA**: åpne den i Safari (iOS) eller Chrome (Android) og velg
"Legg til på startskjermen". Den fungerer også offline etter første besøk.

### Ta vare på dataene

1. Gå til **Innstillinger → Data og sikkerhetskopi**
2. Trykk **"Last ned backup (JSON)"** jevnlig – filen inneholder alle dager
3. Ved bytte av telefon: installer appen på nytt, logg inn, og bruk
   **"Importer backup (JSON)"**
4. **CSV-eksport** gir en tabell du kan dele med andre eller analysere videre
   (Excel, Numbers, Google Sheets)

## Teknologi

React 18 + TypeScript + Vite + Tailwind CSS, Dexie (IndexedDB), Recharts (grafer),
date-fns (norsk locale), vite-plugin-pwa, Vitest.
