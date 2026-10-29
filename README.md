# Belast 🛡️⚽

Loggfør treningshverdagen – laget i Viking FK-tema
(mørk marineblå `#132436`, gull `#DBC067`, hvit, Viking-rød `#72121C` til varsler).

## Hva appen gjør

**Loggføring (med etterregistrering)**
- Hver dag kan du registrere type trening (kamp/trening akademi, styrketrening,
  egentrening, annet – flere kan kombineres per dag) eller hviledag
- **Kategoriene er brukerstyrte**: legg til, gi nytt navn eller fjern verdier for
  «type trening» og «smertested» under Innstillinger → Kategorier. Fjernede kategorier
  beholdes i historikken (vises som «utgått»)
- Opplevd treningsbelastning 1–10 (slider)
- Varighet i minutter – med **hurtigtaster for 30/60/90 min** eller fri inntasting
- **Søvnkvalitet 1–10** og **næringskvalitet 1–10** (valgfrie slidere, kan fjernes)
- Skader/vondter: kroppsdel + smertenivå 1–10 + kommentar
- Månedskalender med fargekoding – trykk på **hvilken som helst tidligere dag** for å
  etterregistrere eller rette

**Ukeplanlegger**
- Lag et vilkårlig antall ukeplaner (mandag–søndag) for å planlegge treningsopplegget
- Per dag: planlagte økter med type trening (brukerens kategorier), planlagt
  belastning (1–10), tid i minutter og fritekst-kommentar i liten skrift
- **Favoritt-planer** kan merkes med ★ og sorteres øverst i listen
- Hver plan har en **dashboard-oppsummering**: antall økter, total planlagt tid
  (timer/minutter) og total planlagt belastning
- Planer synkroniseres til skyen og følger med i backup/eksport

**Statistikk**
- Nøkkeltall for 7 / 30 / 90 dager / hele perioden: antall økter (per type),
  total og snitt belastning, **total treningstid**, total smerte, dager med smerte,
  **snitt søvnscore** og **snitt næringsscore**
- **ACWR** (akutt:kronisk belastningsforhold, 7 vs 28 dager) med grønn/gul/rød sone
- Trendlinjer for belastning, smerte, **søvn og næring** samt treningstid
  (minutter) per dag – søvn og næring vises som stiplete linjer i samme diagram,
  søylediagram per uke
- Kalender-heatmap over belastning (rød ring = smerte registrert)
- Smerte per kroppsdel, scatter-plot belastning vs smerte
- Registreringsstreak og belastningsendring vs forrige periode
- Smertevarsel ved smerte ≥ 6 flere dager på rad
- **Loggtabell**: knapp på statistikksiden viser en tabell over alle datoer de
  siste 30 dagene – dato, ukedag (man–søn), treningstid (timer), belastning (score),
  **søvn (score)**, **næring (score)** og smerte (score)

**Utseende**
- Mørkt tema (Viking FK) eller **lyst tema** – byttes under Innstillinger → Utseende

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

**Visningsnavn** (valgfritt): sett `player_name` i brukerens `user_metadata`
i Supabase Dashboard → Authentication → Users → (brukeren) → User Metadata.
Navnet vises i toppmenyen og på hjem-siden.

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

## Migrasjon av eksisterende Supabase-database

Har du allerede en database kjørende (opprettet før søvn/næring ble lagt til),
må du legge til to nye kolonner i tabellen `day_entries`. Dette gjøres én gang:

1. Gå til **Supabase Dashboard → SQL Editor**
2. Kjør migrasjonsskriptet `supabase/migrations/001_add_sleep_nutrition.sql`
   (innholdet under – idempotent, trygt å kjøre flere ganger):

```sql
alter table public.day_entries
  add column if not exists sleep_score int check (sleep_score between 1 and 10);

alter table public.day_entries
  add column if not exists nutrition_score int check (nutrition_score between 1 and 10);
```

3. Verifiser i **Table Editor → day_entries** at kolonnene `sleep_score` og
   `nutrition_score` nå finnes. Eksisterende rader får `NULL` (ikke registrert).

> Nye installasjoner trenger ikke dette – `supabase/schema.sql` lager kolonnene
> automatisk.

### Migrasjon 2: historikk på alle tabeller (SCD2)

Har du allerede en database kjørende (opprettet før historikk ble innført), må du
legge til historikktabeller og triggere. Dette gjøres én gang:

1. Gå til **Supabase Dashboard → SQL Editor**
2. Kjør migrasjonsskriptet `supabase/migrations/002_add_history_scd2.sql`
   (idempotent, trygt å kjøre flere ganger)
3. Verifiser i **Table Editor** at tabellene `day_entries_history`,
   `categories_history` og `week_plans_history` nå finnes, og at kolonnen
   `valid_from` er satt på eksisterende rader i `day_entries`, `categories`
   og `week_plans`

> Nye installasjoner trenger ikke dette – `supabase/schema.sql` lager historikk
> automatisk.

## Hvordan historikk fungerer (SCD2)

Alle tre tabeller (`day_entries`, `categories`, `week_plans`) har nå full
historikk i egne `*_history`-tabeller. Appen forholder seg **kun** til de
aktive tabellene – historikken skrives automatisk av database-triggere:

- Hver historikkrad er **én versjon** av en rad, med gyldighetsintervall
  `[valid_from, valid_to)`
- Ved **INSERT** settes `valid_from` automatisk (tilsvarer `updated_at`)
- Ved **UPDATE** arkiveres forrige versjon i historikk med
  `valid_to = ny updated_at` – den nye versjonen blir aktiv
- Ved **DELETE** arkiveres siste versjon, slik at sletting også bevares
- Appen skriver aldri til historikken – kun trigger-funksjonen gjør det
  (`security definer`); brukere har kun lesetilgang via RLS
- **GDPR**: «Slett alle data» (`delete_all_my_data()`) sletter nå både aktive
  rader og historikk for brukeren

Eksempel på spørring – «hva sto det for en dag, på et gitt tidspunkt?»:

```sql
select * from public.day_entries_history
where user_id = auth.uid() and date = '2026-01-15'
  and valid_from <= '2026-01-20T00:00:00Z'
  and valid_to   >  '2026-01-20T00:00:00Z';
```

## Hvordan synkronisering fungerer

- **Lokal først**: hver endring lagres i IndexedDB med en "dirty"-flagg, og skyves
  til Supabase i bakgrunnen
- **Pull**: ved innlogging og ved endringer fra andre enheter hentes nyere data ned
- **Sletting**: slettede dager markeres med tombstone (`deleted = true`) slik at
  sletting også synkroniseres
- **Konflikter**: ved samtidig redigering av samme dag vinner siste skriver
  (etter `updated_at`); den tapende versjonen arkiveres og vises i Innstillinger
- **Realtime**: endringer fra andre enheter trigges automatisk via Supabase realtime
- **Kategorier** synkroniseres på samme måte (egen tabell `categories` i Supabase)
- **Historikk**: hver endring arkiveres automatisk i `*_history`-tabellene
  (SCD2) – appen trenger ikke å vite om det
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

**Appen henger på «Synkroniserer…», eller viser bare bakgrunnen etter oppdatering?**
Dette skjer hvis en IndexedDB-oppgradering blokkeres fordi en annen instans fortsatt
har databasen åpen. Løsning:

- **Lukk alle faner** med appen (også PWA-appen på startskjermen — sveip den bort
  fra app-oversikten), åpne appen på nytt.
- **iPhone (Safari/PWA)**: lukk alle faner, gå til Innstillinger → Safari →
  «Tøm logg og nettsteddata», legg appen til på startskjermen på nytt.
- **Android (Chrome)**: lukk appen helt, trykk lenge på ikonet → Appinfo → Lagring →
  «Tøm hurtigbuffer», åpne på nytt.

Appen nullstiller seg selv ved neste oppstart hvis den oppdager en låst database,
og data hentes ned fra skyen igjen ved innlogging.

## Teknologi

React 18 + TypeScript + Vite + Tailwind CSS, Dexie (IndexedDB), Recharts (grafer),
date-fns (norsk locale), vite-plugin-pwa, Vitest, Supabase (auth + Postgres + realtime).
