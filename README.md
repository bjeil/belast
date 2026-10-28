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

**Data, personvern og sky-sync**
- Data lagres **lokalt** i nettleseren (IndexedDB) – appen fungerer offline
- Data **synkroniseres til Supabase** (sky), slik at flere enheter (f.eks. far og sønn)
  ser og oppdaterer samme logg
- Innlogging via Supabase Auth med delt brukernavn/passord (se under)
- Første gangs samtykke til lagring av data vises ved første innlogging (GDPR)
- Eksport: **JSON-backup** (lokal gjenoppretting), **CSV** (Excel / deling) og
  **JSON-eksport av alle data fra skyen**
- Sletting: mulig å slette kun lokale data, eller **alle data både lokalt og i skyen**

## Innlogging

- Brukernavn: `cbl`
- Passord: `Fotball33`

Innloggingen går via Supabase Auth. Internt mappes brukernavnet `cbl` til
e-posten `cbl@belast.app` (se `src/lib/supabase.ts`). For å endre passord: gå til
Supabase Dashboard → Authentication → Users, eller bruk "glemt passord"-flyten
(når e-postbekreftelse er av).

## Supabase-oppsett (gjøres én gang)

1. Opprett prosjekt på [supabase.com](https://supabase.com)
2. Kjør SQL-skriptet `supabase/schema.sql` i **SQL Editor** (lager tabell, RLS-policyer,
   realtime og slette-funksjon)
3. Gå til **Authentication → Providers → Email** og **fjern haken for "Confirm email"**
4. Gå til **Authentication → Users → Add user**:
   - Email: `cbl@belast.app`
   - Password: `Fotball33`
   - Kryss av for **"Auto Confirm User"**
5. Sett følgende i `src/lib/supabase.ts` (eller som miljøvariabler
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`):
   - Project URL
   - anon public key

> Anon-nøkkelen er offentlig ved design – all databeskyttelse skjer via
> Row Level Security (RLS), slik at brukere kun ser egne data.

## Hvordan synkronisering fungerer

- **Lokal først**: hver endring lagres i IndexedDB med en "dirty"-flagg, og skyves
  til Supabase i bakgrunnen
- **Pull**: ved innlogging og ved endringer fra andre enheter hentes nyere data ned
- **Sletting**: slettede dager markeres med tombstone (`deleted = true`) slik at
  sletting også synkroniseres
- **Konflikter**: ved samtidig redigering av samme dag vinner siste skriver
  (etter `updated_at`); den tapende versjonen arkiveres og vises i Innstillinger
- **Realtime**: endringer fra andre enheter trigges automatisk via Supabase realtime
- Indikator i toppmenyen viser synkroniseringsstatus (synkronisert / synkroniserer /
  feil / offline)

## Komme i gang

```bash
npm install
npm run dev      # utviklingsserver
npm test         # enhetstester
npm run build    # produksjonsbygg i dist/
npm run preview  # forhåndsvisning av bygget
```

## Hosting (GitHub Pages)

Appen hostes automatisk på **GitHub Pages** ved hver push til `main`:

- URL: `https://bjeil.github.io/belast/`
- Workflow: `.github/workflows/deploy-pages.yml` (bygg + deploy)
- CI kjører tester og bygg ved hver push/PR: `.github/workflows/ci.yml`

Forutsetning: repoet må være **public** (gratis GitHub Pages). Ønsker du privat
repo senere, bytt til Cloudflare Pages eller Netlify (støtter private repoer gratis).

## Bruk som app på telefonen

Appen er en **PWA**: åpne den i Safari (iOS) eller Chrome (Android) og velg
"Legg til på startskjermen". Den fungerer også offline etter første besøk.

### Ta vare på dataene

1. Gå til **Innstillinger → Data og sikkerhetskopi**
2. Trykk **"Last ned backup (JSON)"** jevnlig – filen inneholder alle lokale dager
3. Ved bytte av telefon: installer appen på nytt, logg inn, og bruk
   **"Importer backup (JSON)"** – eller la sky-synkroniseringen hente dataene automatisk
4. **CSV-eksport** gir en tabell du kan dele med andre eller analysere videre
   (Excel, Numbers, Google Sheets)
5. **"Eksporter alle data fra skyen (JSON)"** henter hele loggen fra Supabase

## Feilsøking

**"Feil brukernavn eller passord" selv om det er riktig?**
Du kjører sannsynligvis en **gammel versjon** av appen (fra før sky-sync). Sjekk
versjonsnummeret nederst på innloggingsskjermen eller i Innstillinger — det skal stå
dagens dato. Slik får du den nye versjonen:

- **Hvis appen er lagt til på startskjermen (PWA)**: avinstaller/ fjern ikonet,
  åpne `https://bjeil.github.io/belast/` på nytt i nettleseren, logg inn, og legg
  til på startskjermen på nytt.
- **iPhone (Safari)**: lukk alle faner med appen, gå til Innstillinger → Safari →
  "Tøm logg og nettsteddata" (eller bruk en privat fane for å teste først).
- **Android (Chrome)**: lukk appen helt, gå til chrome://settings → Personvern →
  "Tøm nettleserdata" → velg «Cachede bilder og filer», eller trykk lenge på
  app-ikonet → «Appinfo» → «Lagring» → «Tøm hurtigbuffer».
- **Laptop**: hard-refresh med `Ctrl+F5` (Windows) eller `Cmd+Shift+R` (Mac).

**Synk-feil?** Sjekk synk-indikatoren i toppmenyen. Appen fungerer alltid offline —
endringer lagres lokalt og synkroniseres når nettet er tilbake.

## Teknologi

React 18 + TypeScript + Vite + Tailwind CSS, Dexie (IndexedDB), Recharts (grafer),
date-fns (norsk locale), vite-plugin-pwa, Vitest, Supabase (auth + Postgres + realtime).
