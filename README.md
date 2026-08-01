# 112 Meldingen &mdash; live P2000 dashboard

Een dashboard met kaart, lijst en filters voor live meldingen van de Nederlandse
hulpdiensten (brandweer, ambulance, politie, KNRM), gebaseerd op het **P2000-netwerk**.

## Belangrijk om te weten vooraf

- Er bestaat geen officiële, publieke "112-API". Wat wél publiek beschikbaar is,
  is het **P2000-pagernetwerk**: het systeem waarmee meldkamers hulpdiensten
  oproepen. Dit project gebruikt de RSS-feeds van **[112-nu.nl](https://112-nu.nl/rss.html)**
  per hulpdienst (brandweer, ambulance, politie, traumaheli, KNRM, weg).
  Een eerdere bron (`feeds.livep2000.nl`) die dit project gebruikte, bleek niet
  meer te bestaan &mdash; vandaar de overstap.
- **Gebruiksvoorwaarden van 112-nu.nl**: hun RSS-inhoud mag op je eigen website
  gebruikt worden (ook commercieel), **mits er minimaal 1 zichtbare link naar
  112-nu.nl op de pagina staat** (geen `rel="nofollow"`). Die link staat al in
  de footer van het dashboard &mdash; verwijder 'm niet. Daarnaast geldt een
  fair-use beleid: niet bedoeld om grote hoeveelheden data te verzamelen. De
  backend ververst daarom maar elke 30 seconden, en haalt alleen de 6
  hoofdfeeds op (niet honderden losse regio-feeds).
- Berichten bevatten geen exacte coördinaten, maar de melding-URL van 112-nu.nl
  bevat wel de plaatsnaam (en vaak straatnaam) als onderdeel van het pad, bijv.
  `112-nu.nl/melding/12345/steenwijk/buitensingel/...`. De backend leest die
  plaatsnaam uit de URL en koppelt 'm aan coördinaten via een woordenboek
  (`server/cities.js`). Staat een plaats er niet in, dan verschijnt de melding
  wél in de lijst maar niet op de kaart. Vul de lijst gerust aan.
- De "spoed"-aanduiding (spoed / grote spoed / zeer grote spoed / geen spoed)
  wordt ook uit de URL-slug gehaald. Werkt dit een keer niet zoals verwacht,
  kijk dan naar `parseSpoed()` in `server/server.js`.
- **Regiofilter**: 112-nu.nl biedt geen bevestigde losse RSS-feed per
  veiligheidsregio, dus de server bepaalt zelf de regio: op basis van de
  coördinaten van de herkende plaats wordt de dichtstbijzijnde van de 25
  veiligheidsregio's gekozen (`server/regios.js`). Dit is een benadering op
  basis van afstand tot het midden van elke regio, geen exacte
  gemeentegrens-opzoeking &mdash; in grensgevallen kan een plaats dus aan de
  net verkeerde regio worden toegekend.
- **Mobiel gebruik**: het dashboard is responsive; op smalle schermen komt de
  kaart boven de lijst te staan. Voor eigen, niet-openbaar gebruik volstaat dit
  prima. Een aparte native app is pas de moeite waard als je iets wilt dat een
  website niet kan, zoals push-meldingen bij nieuwe incidenten.

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

- **Feeds/kleuren per hulpdienst**: `server/server.js` (object `DISCIPLINES`,
  bevat ook de RSS-URL per dienst) en dezelfde kleuren in
  `server/public/index.html` (CSS-variabelen).
- **Plaatsnaam-herkenning**: `server/cities.js` &mdash; voeg plaatsen toe als
  `'plaatsnaam': [breedtegraad, lengtegraad]`. De sleutel moet overeenkomen met
  hoe de plaatsnaam in de 112-nu.nl-URL geschreven wordt (kleine letters,
  spaties/koppeltekens maakt niet uit, dat wordt genormaliseerd).
- **Ververssnelheid**: `POLL_INTERVAL_MS` in `server/server.js` (backend) en het
  interval onderaan `server/public/index.html` (frontend, hoe vaak de pagina de
  API bevraagt). Zet dit niet te laag i.v.m. het fair-use beleid van 112-nu.nl.

## Projectstructuur

```
p2000-dashboard/
└── server/
    ├── server.js         Express-app: haalt de feeds op, parst, serveert JSON + frontend
    ├── cities.js           Woordenboek plaatsnaam → coördinaten
    ├── regios.js           De 25 veiligheidsregio's, gebruikt om een regio af te leiden
    ├── package.json
    └── public/
        └── index.html      Het dashboard (kaart, ticker, lijst, filters)
```

Alles staat bewust binnen de map `server/`, zodat je die als "Root Directory"
kunt opgeven bij Render of Railway zonder dat er bestanden buiten die map
nodig zijn.
