// P2000-dashboard backend
// -------------------------------------------------------------
// Haalt periodiek meldingen op van de RSS-feeds van 112-nu.nl (per hulpdienst:
// brandweer, ambulance, politie, traumaheli, KNRM, weg), parst ze naar een
// vast formaat, en serveert ze als JSON via /api/meldingen. Serveert ook de
// frontend.
//
// LET OP: er bestaat geen officiele publieke "112-API". Dit gebruikt de
// publieke P2000-doorstuurfeeds van 112-nu.nl. Gebruik is toegestaan mits een
// zichtbare link naar 112-nu.nl aanwezig blijft (zie de footer van
// public/index.html) en binnen hun fair-use beleid.
// -------------------------------------------------------------

const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');
const CITIES = require('./cities');
const REGIOS = require('./regios');

// Sommige RSS-bronnen (waaronder deze) geven tijden soms door zonder correcte
// tijdzone-informatie, waardoor alles consequent een vast aantal uren verschilt
// van de werkelijke tijd. Zie je dat (bijv. steeds precies 2 uur verschil,
// zelfs nadat de frontend al expliciet op Europe/Amsterdam is gezet), zet dit
// dan op het aantal uren dat gecorrigeerd moet worden (bijv. -2 of 2).
const PUBDATE_CORRECTIE_UUR = 0;

const app = express();
const parser = new Parser();
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL_MS = 30_000; // elke 30 sec verversen (respecteer fair-use van de bron)
const MAX_BUFFER = 500; // aantal meldingen dat we in het geheugen bewaren

// 112-nu.nl biedt losse RSS-feeds per hulpdienst (zie https://112-nu.nl/rss.html).
// Gebruik toegestaan mits minimaal 1 zichtbare link naar 112-nu.nl op de pagina
// (zie de footer van client/public/index.html) en binnen hun fair-use beleid.
const DISCIPLINES = {
  brandweer:  { label: 'Brandweer',  color: '#e8462f', url: 'https://112-nu.nl/brandweer/rss' },
  ambulance:  { label: 'Ambulance',  color: '#8bc63e', url: 'https://112-nu.nl/ambulance/rss' },
  politie:    { label: 'Politie',    color: '#2f6fe8', url: 'https://112-nu.nl/politie/rss' },
  traumaheli: { label: 'Traumaheli', color: '#c060e8', url: 'https://112-nu.nl/trauma-helikopter/rss' },
  knrm:       { label: 'KNRM',       color: '#e89b2f', url: 'https://112-nu.nl/knrm/rss' },
  weg:        { label: 'Weg',        color: '#4fb8c4', url: 'https://112-nu.nl/weg/rss' },
};

// normalized index (spatie- en streepjesvarianten) zodat een plaats-slug uit de
// melding-URL (bv. "capelle-aan-den-ijssel") de juiste coordinaten uit cities.js vindt
const CITY_INDEX = new Map();
for (const [naam, coords] of Object.entries(CITIES)) {
  CITY_INDEX.set(naam.toLowerCase(), coords);
  CITY_INDEX.set(naam.toLowerCase().replace(/\s+/g, '-'), coords);
}

let buffer = []; // meest recente meldingen, nieuwste eerst
const seen = new Set(); // dedupe op basis van link/guid

function capitalize(str) {
  return str.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// De melding-URL van 112-nu.nl heeft het formaat:
// https://112-nu.nl/melding/{id}/{plaats}/{straat?}/{beschrijving}.html
function parseUrl(link) {
  try {
    const pathname = new URL(link).pathname; // /melding/12345/plaats/straat/beschrijving.html
    const delen = pathname.split('/').filter(Boolean); // ['melding','12345','plaats',...,'beschrijving.html']
    if (delen[0] !== 'melding') return null;
    const id = delen[1];
    const plaatsSlug = delen[2];
    const beschrijvingSlug = (delen[delen.length - 1] || '').replace(/\.html$/, '');
    const straatSlug = delen.length > 4 ? delen[3] : null;
    return { id, plaatsSlug, straatSlug, beschrijvingSlug };
  } catch {
    return null;
  }
}

function parseSpoed(beschrijvingSlug) {
  if (!beschrijvingSlug) return null;
  if (beschrijvingSlug.includes('zeer-grote-spoed')) return 'zeer grote spoed';
  if (beschrijvingSlug.includes('grote-spoed')) return 'grote spoed';
  if (beschrijvingSlug.includes('geen-spoed')) return 'geen spoed';
  if (beschrijvingSlug.includes('met-spoed')) return 'spoed';
  return null;
}

function vindCoords(plaatsSlug) {
  if (!plaatsSlug) return null;
  const hit = CITY_INDEX.get(plaatsSlug.toLowerCase());
  return hit || null;
}

function vindRegio(lat, lon) {
  if (lat == null || lon == null) return null;
  let beste = null;
  let kleinsteAfstand = Infinity;
  for (const regio of REGIOS) {
    const afstand = Math.hypot(regio.lat - lat, regio.lon - lon);
    if (afstand < kleinsteAfstand) { kleinsteAfstand = afstand; beste = regio.naam; }
  }
  return beste;
}

async function fetchDiscipline(key, config) {
  try {
    const feed = await parser.parseURL(config.url);
    return (feed.items || []).map((item) => {
      const info = parseUrl(item.link || '');
      const plaats = info?.plaatsSlug ? capitalize(info.plaatsSlug) : null;
      const straat = info?.straatSlug ? capitalize(info.straatSlug) : null;
      const spoed = parseSpoed(info?.beschrijvingSlug);
      const coords = info?.plaatsSlug ? vindCoords(info.plaatsSlug) : null;
      const tekst = item.title || item.contentSnippet || '(geen tekst beschikbaar)';
      const regioNaam = coords ? vindRegio(coords[0], coords[1]) : null;
      let tijd = item.pubDate ? new Date(item.pubDate) : new Date();
      if (PUBDATE_CORRECTIE_UUR !== 0) {
        tijd = new Date(tijd.getTime() + PUBDATE_CORRECTIE_UUR * 60 * 60 * 1000);
      }

      return {
        id: item.guid || item.link || `${key}-${item.pubDate}-${tekst.slice(0, 20)}`,
        tijd: tijd.toISOString(),
        tekst,
        plaats,
        straat,
        regioNaam,
        discipline: key,
        disciplineLabel: config.label,
        kleur: config.color,
        spoed,
        lat: coords ? coords[0] : null,
        lon: coords ? coords[1] : null,
        link: item.link || null,
        benaderdeLocatie: !coords, // true als de plaats niet in ons woordenboek stond
      };
    });
  } catch (err) {
    console.error(`Kon feed voor ${config.label} niet ophalen:`, err.message);
    return [];
  }
}

async function pollAlleFeeds() {
  const results = await Promise.all(
    Object.entries(DISCIPLINES).map(([key, config]) => fetchDiscipline(key, config))
  );
  const nieuw = results.flat();

  let toegevoegd = 0;
  for (const melding of nieuw) {
    if (!seen.has(melding.id)) {
      seen.add(melding.id);
      buffer.unshift(melding);
      toegevoegd++;
    }
  }
  buffer.sort((a, b) => new Date(b.tijd) - new Date(a.tijd));
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(0, MAX_BUFFER);
  if (seen.size > MAX_BUFFER * 3) {
    const ids = buffer.map((m) => m.id);
    seen.clear();
    ids.forEach((id) => seen.add(id));
  }
  if (toegevoegd > 0) console.log(`[${new Date().toLocaleTimeString()}] ${toegevoegd} nieuwe melding(en), buffer=${buffer.length}`);
}

const DISCIPLINES_PUBLIC = Object.fromEntries(
  Object.entries(DISCIPLINES).map(([key, { label, color }]) => [key, { label, color }])
);

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/meldingen', (req, res) => {
  let result = buffer;
  const { discipline, regio, zoek, sinds } = req.query;

  if (discipline) {
    const keys = String(discipline).split(',');
    result = result.filter((m) => keys.includes(m.discipline));
  }
  if (regio) {
    const namen = String(regio).split(',');
    result = result.filter((m) => m.regioNaam && namen.includes(m.regioNaam));
  }
  if (zoek) {
    const q = String(zoek).toLowerCase();
    result = result.filter(
      (m) => m.tekst.toLowerCase().includes(q) || (m.plaats || '').toLowerCase().includes(q)
    );
  }
  if (sinds) {
    const sindsDate = new Date(sinds);
    result = result.filter((m) => new Date(m.tijd) > sindsDate);
  }

  res.json({
    aantal: result.length,
    laatsteUpdate: new Date().toISOString(),
    disciplines: DISCIPLINES_PUBLIC,
    regios: REGIOS.map((r) => r.naam),
    meldingen: result,
  });
});

app.get('/api/status', (req, res) => {
  res.json({ ok: true, bufferGrootte: buffer.length, pollIntervalMs: POLL_INTERVAL_MS });
});

app.listen(PORT, () => {
  console.log(`P2000-dashboard backend draait op http://localhost:${PORT}`);
  pollAlleFeeds();
  setInterval(pollAlleFeeds, POLL_INTERVAL_MS);
});
