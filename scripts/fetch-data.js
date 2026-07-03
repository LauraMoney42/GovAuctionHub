#!/usr/bin/env node
// Standalone data pull — same connectors as the server, no server needed.
//   node scripts/fetch-data.js        (or: npm run fetch)
// Writes data/cache.json, which the server picks up on next start/request.
// Cron example (every 30 min):
//   */30 * * * * cd /path/to/GovAuctionHub && /usr/local/bin/node scripts/fetch-data.js >> data/fetch.log 2>&1
const fs = require('fs');
const path = require('path');
const connectors = require('../connectors');

(async () => {
  const t0 = Date.now();
  console.log(`[${new Date().toISOString()}] fetching from ${connectors.length} connector(s)…`);
  const out = path.join(__dirname, '..', 'data', 'cache.json');
  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(out, 'utf8')).listings || []; } catch { /* no cache */ }

  const results = await Promise.allSettled(connectors.map(c => c.fetchListings()));
  const listings = [];
  let anyOk = false;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  ✓ ${connectors[i].name}: ${r.value.length} listings`);
      anyOk = true;
      listings.push(...r.value);
    } else {
      // Partial failure (rate limit, outage): carry forward that source's
      // last good listings rather than dropping them.
      const kept = prev.filter(l => l.source === connectors[i].name);
      console.error(`  ✗ ${connectors[i].name}: ${r.reason.message} — kept ${kept.length} cached listings`);
      listings.push(...kept);
    }
  });
  if (!anyOk) { console.error('All sources failed — keeping existing cache.'); process.exit(1); }
  fs.writeFileSync(out, JSON.stringify({ fetchedAt: Date.now(), listings }));
  console.log(`Wrote ${listings.length} listings to ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
