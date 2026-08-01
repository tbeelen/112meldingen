// P2000-dashboard backend
// -------------------------------------------------------------
// Haalt periodiek meldingen op van feeds.livep2000.nl (de publieke
// RSS-feed van het P2000-pagernetwerk dat door brandweer, ambulance,
// politie en KNRM wordt gebruikt), parst ze naar een vast formaat, en
// serveert ze als JSON via /api/meldingen. Serveert ook de frontend.
//
// LET OP: er bestaat geen officiele publieke "112-API". Dit gebruikt
// de bekende hobby-/doorstuurfeed van P2000. Gebruik is doorgaans
// alleen toegestaan voor persoonlijk/niet-commercieel gebruik -
// controleer de voorwaarden van de bron en respecteer die.
// -------------------------------------------------------------

const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const path = require('path');
const REGIOS = require('./regios');
const CITIES = require('./cities');

const app = express();
const parser = new Parser();
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL_MS = 20_000; // elke 20 sec verversen
const MAX_BUFFER = 500; // aantal meldingen dat we in het geheugen bewaren

// discipline-codes zoals gebruikt door feeds.livep2000.nl (d=1,2,3,4)
const DISCIPLINES = {
  1: { key: 'brandweer', label: 'Brandweer', color: '#e8462f' },
  2: { key: 'ambulance', label: 'Ambulance', color: '#8bc63e' },
  3: { key: 'politie',   label: 'Politie',   color: '#2f6fe8' },
  4: { key: 'knrm',      label: 'KNRM',      color: '#e89b2f' },
};

let buffer = []; // meest recente meldingen, nieuwste eerst
const seen = new Set(); // dedupe op basis van link/guid

function findCity(text) {
  const lower = text.toLowerCase();
  let best = null;
  for (const name of Object.keys(CITIES)) {
    if (lower.includes(name)) {
      if (!best || name.length > best.length) best = name;
    }
  }
  return best ? { naam: best, coords: CITIES[best] } : null;
}

function detectDiscipline(text, fallbackId) {
  const upper = text.toUpperCase();
  if (/BRAND|BRW/.test(upper)) return DISCIPLINES[1];
  if (/AMBU|A1|A2/.test(upper)) return DISCIPLINES[2];
  if (/POLITIE|POL\b/.test(upper)) return DISCIPLINES[3];
  if (/KNRM|REDDING/.test(upper)) return DISCIPLINES[4];
  return DISCIPLINES[fallbackId] || DISCIPLINES[1];
}

function detectPrioriteit(text) {
  const m = text.match(/\b([ABP][12])\b/i);
  return m ? m[1].toUpperCase() : null;
}

async function fetchRegio(regio, disciplineIds) {
  const url = `https://feeds.livep2000.nl?r=${regio.id}&d=${disciplineIds.join(',')}`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).map((item) => {
      const rawText = `${item.title || ''} ${item.contentSnippet || item.content || ''}`.trim();
      const city = findCity(rawText);
      const discipline = detectDiscipline(rawText, disciplineIds[0]);
      const prioriteit = detectPrioriteit(rawText);
      const coords = city ? city.coords : [regio.lat, regio.lon];
      return {
        id: item.guid || item.link || `${regio.id}-${item.pubDate}-${rawText.slice(0, 20)}`,
        tijd: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        tekst: rawText || '(geen tekst beschikbaar)',
        regioId: regio.id,
        regioNaam: regio.naam,
        plaats: city ? capitalize(city.naam) : null,
        discipline: discipline.key,
        disciplineLabel: discipline.label,
        kleur: discipline.color,
        prioriteit,
        lat: coords[0],
        lon: coords[1],
        benaderdeLocatie: !city, // true als we terugvielen op het regio-middelpunt
      };
    });
  } catch (err) {
    console.error(`Kon feed voor regio ${regio.naam} (${regio.id}) niet ophalen:`, err.message);
    return [];
  }
}

function capitalize(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function pollAlleRegios() {
  const alleDisciplines = Object.keys(DISCIPLINES).map(Number);
  const results = await Promise.all(REGIOS.map((regio) => fetchRegio(regio, alleDisciplines)));
  const nieuw = results.flat();

  let toegevoegd = 0;
  for (const melding of nieuw) {
    if (!seen.has(melding.id)) {
      seen.add(melding.id);
      buffer.unshift(melding);
      toegevoegd++;
    }
  }
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(0, MAX_BUFFER);
  // seen-set ook begrenzen zodat die niet oneindig groeit
  if (seen.size > MAX_BUFFER * 3) {
    const ids = buffer.map((m) => m.id);
    seen.clear();
    ids.forEach((id) => seen.add(id));
  }
  if (toegevoegd > 0) console.log(`[${new Date().toLocaleTimeString()}] ${toegevoegd} nieuwe melding(en), buffer=${buffer.length}`);
}

app.use(cors());
app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('/api/meldingen', (req, res) => {
  let result = buffer;
  const { regio, discipline, zoek, sinds } = req.query;

  if (regio) {
    const regioIds = String(regio).split(',').map(Number);
    result = result.filter((m) => regioIds.includes(m.regioId));
  }
  if (discipline) {
    const keys = String(discipline).split(',');
    result = result.filter((m) => keys.includes(m.discipline));
  }
  if (zoek) {
    const q = String(zoek).toLowerCase();
    result = result.filter((m) => m.tekst.toLowerCase().includes(q));
  }
  if (sinds) {
    const sindsDate = new Date(sinds);
    result = result.filter((m) => new Date(m.tijd) > sindsDate);
  }

  res.json({
    aantal: result.length,
    laatsteUpdate: new Date().toISOString(),
    regios: REGIOS,
    disciplines: DISCIPLINES,
    meldingen: result,
  });
});

app.get('/api/status', (req, res) => {
  res.json({ ok: true, bufferGrootte: buffer.length, pollIntervalMs: POLL_INTERVAL_MS });
});

app.listen(PORT, () => {
  console.log(`P2000-dashboard backend draait op http://localhost:${PORT}`);
  pollAlleRegios();
  setInterval(pollAlleRegios, POLL_INTERVAL_MS);
});
