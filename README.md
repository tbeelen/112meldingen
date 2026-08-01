# 112 Meldingen &mdash; live P2000 dashboard

Een dashboard met kaart, lijst en filters voor live meldingen van de Nederlandse
hulpdiensten (brandweer, ambulance, politie, KNRM), gebaseerd op het **P2000-netwerk**.

## Belangrijk om te weten vooraf

- Er bestaat geen officiële, publieke "112-API". Wat wél publiek beschikbaar is,
  is het **P2000-pagernetwerk**: het systeem waarmee meldkamers hulpdiensten
  oproepen. Dit project gebruikt de bekende hobbyfeed `feeds.livep2000.nl` die
  door meerdere Nederlandse P2000-projecten wordt gebruikt.
- Deze feed is bedoeld voor **persoonlijk, niet-commercieel gebruik**. Check dat
  zelf nog even en respecteer de voorwaarden van de bron.
- Een browser kan zo'n feed meestal niet rechtstreeks ophalen (CORS). Daarom
  bestaat dit project uit twee delen: een **backend** die de feed ophaalt en
  omzet naar JSON, en een **frontend** (het dashboard) die daarmee praat.
- Berichten bevatten meestal geen exacte coördinaten, alleen een plaatsnaam.
  De backend herkent plaatsnamen uit een woordenboek (`server/cities.js`) en
  valt terug op het midden van de regio als een plaats niet herkend wordt.
  Vul die lijst gerust aan met plaatsen uit jouw eigen regio.
- Het herkennen van het type hulpdienst en de prioriteit (A1/A2/P1&hellip;) gebeurt
  met simpele patroonherkenning in de berichttekst. Zodra je de app live hebt
  draaien zie je de echte berichtformattering en kun je `detectDiscipline` en
  `detectPrioriteit` in `server/server.js` verfijnen.

## Installeren en draaien

Vereist: [Node.js](https://nodejs.org) 18 of hoger.

```bash
cd server
npm install
npm start
```

Open daarna **http://localhost:3000** &mdash; de server serveert zowel de API
(`/api/meldingen`) als het dashboard zelf.

Het duurt een paar seconden voordat de eerste meldingen binnenkomen (de server
haalt bij het opstarten meteen alle 25 regio's op, en daarna elke 20 seconden).

## Online zetten

Om de site voor anderen (of vanaf je telefoon) bereikbaar te maken, zet je de
`server`-map op een hostingdienst die Node.js draait, bijvoorbeeld:

- **Render.com** of **Railway.app** (gratis tier, eenvoudig: koppel de map, "Start
  Command" = `npm start`)
- Een eigen VPS met bijvoorbeeld `pm2` om het proces in leven te houden

Zet de omgevingsvariabele `PORT` als je platform een specifieke poort vereist
(de meeste platforms doen dit automatisch).

## Aanpassen

- **Filters/kleuren per hulpdienst**: `server/server.js` (object `DISCIPLINES`)
  en dezelfde kleuren in `client/index.html` (CSS-variabelen).
- **Regio's**: `server/regios.js`.
- **Plaatsnaam-herkenning**: `server/cities.js` &mdash; voeg plaatsen toe als
  `'plaatsnaam': [breedtegraad, lengtegraad]`.
- **Ververssnelheid**: `POLL_INTERVAL_MS` in `server/server.js` (backend) en het
  interval onderaan `client/index.html` (frontend, hoe vaak de pagina de API bevraagt).

## Projectstructuur

```
p2000-dashboard/
├── server/
│   ├── server.js       Express-app: haalt de feed op, parst, serveert JSON + frontend
│   ├── regios.js        De 25 veiligheidsregio's met middelpunt-coördinaten
│   ├── cities.js         Woordenboek plaatsnaam → coördinaten
│   └── package.json
└── client/
    └── index.html       Het dashboard (kaart, ticker, lijst, filters)
```
