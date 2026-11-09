// Live RSVP totals. Needs two environment variables set in Netlify:
//   NETLIFY_TOKEN = your personal access token (read-only use)
//   VIEW_KEY      = a private password only you know
const API = 'https://api.netlify.com/api/v1';
const SITE = process.env.SITE_DOMAIN; // set in Netlify environment variables

const json = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  const key = (event.queryStringParameters || {}).key || '';
  if (!process.env.VIEW_KEY || key !== process.env.VIEW_KEY) return json(401, { error: 'Wrong key' });
  if (!process.env.NETLIFY_TOKEN) return json(500, { error: 'NETLIFY_TOKEN is not set' });
  if (!SITE) return json(500, { error: 'SITE_DOMAIN is not set' });
  const h = { Authorization: 'Bearer ' + process.env.NETLIFY_TOKEN };

  try {
    const fr = await fetch(`${API}/sites/${SITE}/forms`, { headers: h });
    if (!fr.ok) return json(502, { error: 'Could not list forms (status ' + fr.status + ')' });
    const form = (await fr.json()).find(f => f.name === 'rsvp');
    if (!form) return json(404, { error: 'No form named rsvp found on this site yet' });

    let subs = [], page = 1, part;
    do {
      const r = await fetch(`${API}/forms/${form.id}/submissions?per_page=100&page=${page++}`, { headers: h });
      if (!r.ok) return json(502, { error: 'Could not read submissions (status ' + r.status + ')' });
      part = await r.json();
      subs = subs.concat(part);
    } while (part.length === 100 && page < 30);

    // one entry per email: keep the latest reply
    const map = new Map();
    subs.forEach(s => {
      const d = s.data || {};
      const email = String(d.email || '').toLowerCase().trim();
      const k = email || 'n:' + String(d.name || '').toLowerCase().trim();
      const t = Date.parse(s.created_at) || 0;
      const p = map.get(k);
      if (!p || t >= p.t) map.set(k, {
        t, name: d.name || '', email,
        attending: String(d.attending || '').toLowerCase().startsWith('y'),
        veg: parseInt(d.veg_meals) || 0, nonveg: parseInt(d.nonveg_meals) || 0,
        guess: d.guess || '', dietary: d.dietary || '', message: d.message || ''
      });
    });
    const guests = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    return json(200, { submissions: subs.length, guests, updated: new Date().toISOString() });
  } catch (e) {
    return json(500, { error: String(e.message || e) });
  }
};
