// GovAuctionHub — local aggregator server.
// Pulls listings from registered connectors, caches them on disk, and serves
// a filterable/sortable JSON API plus the static marketplace UI in /public.
const express = require('express');
const fs = require('fs');
const path = require('path');
const zipcodes = require('zipcodes');
const connectors = require('./connectors');

const PORT = process.env.PORT || 4600;
const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');
const CACHE_TTL_MS = 30 * 60 * 1000; // refresh at most every 30 min

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

let cache = { fetchedAt: 0, listings: [] };

// ---------- ingestion ----------
async function refresh(force = false) {
  // Pick up a cache.json written by an external run (npm run fetch / cron)
  // while the server is up — disk wins if it's newer than memory.
  try {
    const disk = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (disk.fetchedAt > cache.fetchedAt && disk.listings?.length) cache = disk;
  } catch { /* no disk cache */ }
  if (!force && Date.now() - cache.fetchedAt < CACHE_TTL_MS && cache.listings.length) return cache;
  const results = await Promise.allSettled(connectors.map(c => c.fetchListings()));
  const listings = [];
  let anyOk = false;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      anyOk = true;
      listings.push(...r.value);
    } else {
      console.error(`[refresh] ${connectors[i].name} failed:`, r.reason.message);
      // Partial failure (e.g. rate limit): keep that source's last good
      // listings instead of dropping them from the pool.
      listings.push(...cache.listings.filter(l => l.source === connectors[i].name));
    }
  });
  if (anyOk) {
    cache = { fetchedAt: Date.now(), listings };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  }
  return cache;
}

function loadDiskCache() {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (c.listings?.length) cache = c;
  } catch { /* no cache yet */ }
}

// ---------- query API ----------
// Shared filter pipeline. `skip` lets /api/meta compute proper facet counts:
// a facet's own dimension is excluded from its count query (standard faceting),
// so with State=AR selected, category counts reflect "AR only" and state
// counts reflect "all states under the other filters".
function queryListings(query, skip = {}) {
  const { q, category, state, status } = query;
  const radius = Number(query.radius) || 0;
  const min = query.min !== undefined && query.min !== '' ? Number(query.min) : null;
  const max = query.max !== undefined && query.max !== '' ? Number(query.max) : null;
  const origin = query.zip ? zipcodes.lookup(String(query.zip).slice(0, 5)) : null;

  let items = cache.listings.map(l => {
    let distance = null;
    if (origin && l.lat != null) {
      distance = Math.round(zipcodes.distance(origin.zip, l.zip) ?? haversine(origin, l));
    }
    return { ...l, distance };
  });

  if (q) {
    const needle = q.toLowerCase();
    items = items.filter(l => (l.title + ' ' + l.description + ' ' + l.city + ' ' + l.state).toLowerCase().includes(needle));
  }
  if (category && !skip.category) items = items.filter(l => l.category === category);
  if (state && !skip.state) items = items.filter(l => l.state === state);
  if (status) items = items.filter(l => l.status === status);
  if (min != null) items = items.filter(l => (l.currentBid ?? 0) >= min);
  if (max != null) items = items.filter(l => (l.currentBid ?? 0) <= max);
  if (origin && radius > 0) items = items.filter(l => l.distance != null && l.distance <= radius);
  return { items, origin };
}

// GET /api/listings?q=&category=&state=&zip=&radius=&min=&max=&status=&sort=&page=&per=
app.get('/api/listings', async (req, res) => {
  try {
    await refresh();
    const sort = req.query.sort || 'ending';
    const page = Math.max(1, Number(req.query.page) || 1);
    const per = Math.min(120, Number(req.query.per) || 48);
    const { items, origin } = queryListings(req.query);

    const sorters = {
      ending:    (a, b) => (a.endDate || '9999').localeCompare(b.endDate || '9999'),
      priceAsc:  (a, b) => (a.currentBid ?? Infinity) - (b.currentBid ?? Infinity),
      priceDesc: (a, b) => (b.currentBid ?? -1) - (a.currentBid ?? -1),
      distance:  (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
      bidders:   (a, b) => (b.bidders ?? -1) - (a.bidders ?? -1),
    };
    items.sort(sorters[sort] || sorters.ending);

    res.json({
      total: items.length,
      page, per,
      origin: origin ? { zip: origin.zip, city: origin.city, state: origin.state, lat: origin.latitude, lng: origin.longitude } : null,
      fetchedAt: cache.fetchedAt,
      items: items.slice((page - 1) * per, page * per),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Facet metadata for the filter sidebar. Accepts the same filter params as
// /api/listings so counts reflect the user's current context (e.g. with
// State=AR active, "Real Estate" shows how many AR real-estate items exist).
app.get('/api/meta', async (req, res) => {
  await refresh();
  const count = (list, key) => {
    const m = {};
    for (const l of list) if (l[key]) m[l[key]] = (m[l[key]] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const forCategories = queryListings(req.query, { category: true }).items;
  const forStates = queryListings(req.query, { state: true }).items;
  res.json({
    fetchedAt: cache.fetchedAt,
    total: forCategories.length,
    categories: count(forCategories, 'category'),
    states: count(forStates, 'state').sort((a, b) => a[0].localeCompare(b[0])),
    sources: count(cache.listings, 'source'),
  });
});

// ---------- image proxy ----------
// GSA's bulk API gives an imageURL that 401s without auth. The public
// gsaauctions.gov site instead resolves photos via two open PPMS endpoints:
//   GET  ppms.gov/.../auctions/getAuction/{id}   -> S3 key ("uri") + precise geo
//   POST ppms.gov/.../storage/presigned-urls     -> time-limited S3 URL
// We do the same here, lazily per item, and 302 the browser to S3.
const imgCache = new Map(); // auctionId -> { url, exp }
const PPMS = 'https://www.ppms.gov/gw';
const UA = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };

app.get('/api/img/:id', async (req, res) => {
  const id = req.params.id.replace(/\D/g, '');
  try {
    const hit = imgCache.get(id);
    if (hit && hit.exp > Date.now()) return hit.url ? res.redirect(hit.url) : res.sendStatus(404);

    const det = await (await fetch(`${PPMS}/auction/ppms/api/v1/auctions/getAuction/${id}`, { headers: UA })).json();

    // Free enrichment: getAuction has exact coordinates and end time — upgrade
    // the cached listing (zip centroids are ~city-level accuracy otherwise).
    const listing = cache.listings.find(l => l.auctionId === id);
    if (listing && det.location?.latitude) {
      listing.lat = det.location.latitude;
      listing.lng = det.location.longitude;
      if (det.endDate) listing.endDate = det.endDate.slice(0, 10);
    }

    if (!det.uri) { imgCache.set(id, { url: null, exp: Date.now() + 3600e3 }); return res.sendStatus(404); }
    const [signed] = await (await fetch(`${PPMS}/common/ppms/api/v1/storage/presigned-urls`, {
      method: 'POST',
      headers: { ...UA, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id, uri: det.uri, fileName: 'photo' }]),
    })).json();
    if (!signed?.presignedUrl) throw new Error('no presigned url');
    imgCache.set(id, { url: signed.presignedUrl, exp: Date.now() + 45 * 60e3 }); // S3 links live 60 min
    res.redirect(signed.presignedUrl);
  } catch (e) {
    imgCache.set(id, { url: null, exp: Date.now() + 10 * 60e3 });
    res.sendStatus(404);
  }
});

app.post('/api/refresh', async (_req, res) => {
  await refresh(true);
  res.json({ ok: true, total: cache.listings.length, fetchedAt: cache.fetchedAt });
});

// Fallback haversine (miles) for zips the zipcodes package can't pair.
function haversine(a, b) {
  const R = 3958.8, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.latitude), dLng = rad(b.lng - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

loadDiskCache();
app.listen(PORT, () => {
  console.log(`GovAuctionHub running at http://localhost:${PORT}`);
  refresh().then(c => console.log(`Loaded ${c.listings.length} listings`));
});
