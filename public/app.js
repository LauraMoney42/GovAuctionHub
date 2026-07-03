// GovAuctionHub frontend — marketplace grid + filters + map modal.
const $ = id => document.getElementById(id);
const state = { page: 1, category: '', items: [], total: 0, origin: null, userPos: null };
let map = null, debounceT = null, loadSeq = 0, metaSeq = 0;

const fmt$ = v => v == null ? null : '$' + Number(v).toLocaleString();
// Real-estate listings may show an asking/minimum ("Starting bid") rather than an actual bid.
const priceLabel = l => l.currentBid == null ? null
  : (l.isStartingBid ? `<span style="font-size:.75em;color:var(--muted)">Starting bid</span> ${fmt$(l.currentBid)}` : fmt$(l.currentBid));
const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
// Government-supplied HTML descriptions: strip scripts/styles and inline handlers.
const sanitize = html => (html || '')
  .replace(/<\s*(script|style|iframe)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|\S+)/gi, '');

// Photos are resolved through our server-side proxy (the raw GSA imageURL
// requires auth); items without an auctionId fall back to the raw URL.
const imgSrc = l => l.auctionId ? `/api/img/${l.auctionId}` : l.image;

function daysLeft(endDate) {
  if (!endDate) return null;
  const diff = (new Date(endDate + 'T23:59:59') - new Date()) / 86400000;
  if (diff < 0) return 'Ended';
  if (diff < 1) return 'Ends today';
  return `${Math.ceil(diff)}d left`;
}

function params(page) {
  const p = new URLSearchParams();
  const set = (k, v) => v && p.set(k, v);
  set('q', $('search').value.trim());
  set('category', state.category);
  set('state', $('state').value);
  set('status', $('status').value);
  set('min', $('min').value);
  set('max', $('max').value);
  set('sort', $('sort').value);
  const zip = $('zip').value.trim();
  if (/^\d{5}$/.test(zip)) { set('zip', zip); set('radius', $('radius').value); }
  p.set('page', page);
  return p;
}

async function load(reset = true) {
  if (reset) state.page = 1;
  // Sequence guard: rapid filter changes fire overlapping fetches; only the
  // latest request may render, or a slow stale response overwrites fresh results.
  const seq = ++loadSeq;
  const res = await fetch('/api/listings?' + params(state.page));
  const data = await res.json();
  if (seq !== loadSeq) return; // a newer request superseded this one
  state.items = reset ? data.items : state.items.concat(data.items);
  state.total = data.total;
  state.origin = data.origin;
  render();
  loadMeta(); // facet counts follow the active filters (not awaited)
}

function render() {
  const near = state.origin ? ` near ${state.origin.city}, ${state.origin.state} ${state.origin.zip}` : '';
  $('resultbar').textContent = `${state.total.toLocaleString()} listings${near}`;
  if (!state.items.length) {
    $('grid').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted)">
      <div style="font-size:2.5rem;margin-bottom:10px">🔍</div>
      <div style="font-weight:600;margin-bottom:6px">No listings match these filters</div>
      <div style="font-size:.9rem">Try another category, a wider radius, or clearing the state filter.<br>
      The counts next to each filter show what's available in your current view.</div></div>`;
    $('more').classList.add('hidden');
    return;
  }
  $('grid').innerHTML = state.items.map((l, i) => {
    const dl = daysLeft(l.endDate);
    const soon = dl === 'Ends today' || dl === '1d left';
    const img = imgSrc(l);
    return `
    <div class="card" data-i="${i}">
      <div class="imgwrap">
        ${img ? `<img loading="lazy" src="${esc(img)}" onerror="this.parentNode.innerHTML='<div class=noimg>🏛️</div>'">` : '<div class="noimg">🏛️</div>'}
        <span class="badge ${l.status}">${l.status === 'preview' ? 'PREVIEW' : 'LIVE'}</span>
      </div>
      <div class="cbody">
        <div class="cprice">${priceLabel(l) ?? '<span class="nobid">No bids yet</span>'}</div>
        <div class="ctitle">${esc(l.title)}</div>
        <div class="cloc">📍 ${esc(l.city)}, ${esc(l.state)}${l.distance != null ? ` · ${l.distance} mi` : ''}</div>
        <div class="cend ${soon ? 'soon' : ''}">${dl ?? ''}${l.bidders ? ` · ${l.bidders} bidder${l.bidders > 1 ? 's' : ''}` : ''}</div>
      </div>
    </div>`;
  }).join('');
  $('more').classList.toggle('hidden', state.items.length >= state.total);
  document.querySelectorAll('.card').forEach(c =>
    c.addEventListener('click', () => openModal(state.items[Number(c.dataset.i)])));
}

// ---------- filter sidebar ----------
// Counts are contextual: the server computes each facet under the other active
// filters, so with State=AR selected the category list shows AR-only counts
// (and the selected category/state stays visible even at 0).
async function loadMeta() {
  const seq = ++metaSeq;
  const p = params(1); p.delete('page'); p.delete('sort');
  const m = await (await fetch('/api/meta?' + p)).json();
  if (seq !== metaSeq) return; // stale

  const cats = new Map(m.categories);
  if (state.category && !cats.has(state.category)) cats.set(state.category, 0);
  $('cats').innerHTML =
    `<button class="cat ${!state.category ? 'on' : ''}" data-c="">All categories <span class="n">${m.total}</span></button>` +
    [...cats.entries()].map(([c, n]) =>
      `<button class="cat ${state.category === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)} <span class="n">${n}</span></button>`).join('');
  document.querySelectorAll('.cat').forEach(b => b.addEventListener('click', () => {
    state.category = b.dataset.c;
    document.querySelectorAll('.cat').forEach(x => x.classList.toggle('on', x === b));
    load();
  }));

  const sel = $('state');
  const cur = sel.value;
  const states = new Map(m.states);
  if (cur && !states.has(cur)) states.set(cur, 0);
  sel.innerHTML = '<option value="">All states</option>' +
    [...states.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([s, n]) => `<option value="${esc(s)}">${esc(s)} (${n})</option>`).join('');
  sel.value = cur;
  $('meta').textContent = `Sources: ${m.sources.map(([s, n]) => `${s} (${n})`).join(', ')} · updated ${new Date(m.fetchedAt).toLocaleTimeString()}`;
}

// ---------- detail modal with map ----------
function openModal(l) {
  $('mtitle').textContent = l.title;
  const img = imgSrc(l);
  $('mimg').src = img || '';
  $('mimg').style.display = img ? '' : 'none';
  $('mprice').innerHTML = priceLabel(l) ?? '<span style="font-size:1rem;color:var(--muted)">No bids yet</span>';
  $('mfacts').innerHTML = [
    `<span>📍 <b>${esc(l.city)}, ${esc(l.state)} ${esc(l.zip || '')}</b>${l.distance != null ? ` — ${l.distance} mi from you` : ''}</span>`,
    l.address ? `<span>${esc(l.address)}</span>` : '',
    `<span>Status: <b>${esc(l.status)}</b> · Ends: <b>${esc(l.endDate || '?')}</b> ${daysLeft(l.endDate) ? '(' + daysLeft(l.endDate) + ')' : ''}</span>`,
    l.bidders != null ? `<span>Bidders: <b>${l.bidders}</b>${l.hasReserve ? ' · Has reserve' : ''}</span>` : '',
    `<span>Source: <b>${esc(l.source)}</b>${l.agency ? ' · ' + esc(l.agency) : ''}</span>`,
  ].filter(Boolean).join('');
  $('mlink').href = l.url;
  $('mdesc').innerHTML = sanitize(l.description);
  $('modal').classList.remove('hidden');

  // Map: item pin + user pin (geolocation, falling back to entered ZIP origin).
  setTimeout(() => {
    if (map) { map.remove(); map = null; }
    if (l.lat == null) { $('mmap').innerHTML = '<div style="padding:20px;color:var(--muted)">No location data for this item</div>'; return; }
    map = L.map('mmap').setView([l.lat, l.lng], 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    L.marker([l.lat, l.lng]).addTo(map).bindPopup(`<b>Item:</b> ${esc(l.city)}, ${esc(l.state)}`).openPopup();
    const from = state.userPos || (state.origin ? { lat: state.origin.lat, lng: state.origin.lng } : null);
    if (from) {
      L.circleMarker([from.lat, from.lng], { radius: 7, color: '#1a73e8', fillOpacity: .9 }).addTo(map).bindPopup('You');
      L.polyline([[from.lat, from.lng], [l.lat, l.lng]], { color: '#1a73e8', dashArray: '6 8' }).addTo(map);
      map.fitBounds([[from.lat, from.lng], [l.lat, l.lng]], { padding: [30, 30] });
    }
  }, 60);

  // Google Maps directions: origin omitted → Google uses the device's live location.
  $('gmaps').onclick = () => {
    const dest = encodeURIComponent(l.address ? `${l.address}, ${l.city}, ${l.state} ${l.zip || ''}` : `${l.lat},${l.lng}`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank');
  };
}

$('mclose').addEventListener('click', () => $('modal').classList.add('hidden'));
$('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('modal').classList.add('hidden'); });

// ---------- wiring ----------
const reload = () => load(true);
['sort', 'state', 'status', 'radius'].forEach(id => $(id).addEventListener('change', reload));
['min', 'max'].forEach(id => $(id).addEventListener('change', reload));
$('search').addEventListener('input', () => { clearTimeout(debounceT); debounceT = setTimeout(reload, 350); });
$('zip').addEventListener('input', () => {
  const z = $('zip').value.trim();
  if (z.length === 0 || /^\d{5}$/.test(z)) { clearTimeout(debounceT); debounceT = setTimeout(reload, 350); }
});
$('more').addEventListener('click', () => { state.page++; load(false); });
$('refresh').addEventListener('click', async () => {
  $('refresh').textContent = 'Refreshing…';
  await fetch('/api/refresh', { method: 'POST' });
  await Promise.all([loadMeta(), load()]);
  $('refresh').textContent = '↻ Refresh source data';
});

// Ask for browser location once (used for the modal map "You" pin).
navigator.geolocation?.getCurrentPosition(
  p => { state.userPos = { lat: p.coords.latitude, lng: p.coords.longitude }; },
  () => {}, { timeout: 5000 });

load(); // renders the grid, then refreshes facet counts via loadMeta()
