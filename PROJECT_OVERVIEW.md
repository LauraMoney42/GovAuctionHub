# GovAuctionHub

A local, Facebook-Marketplace-style search UI over **live US government auction listings**, aggregated from official public APIs (no scraping).

## Quick start

```bash
npm install          # once
npm start            # server + UI at http://localhost:4600
npm run fetch        # pull fresh data WITHOUT the server (cron-friendly)
```

The UI also has a **"↻ Refresh source data"** button (sidebar) that re-pulls all sources on demand.

## What it does

- **Aggregates** live listings (~600 from GSA Auctions — every participating federal agency — plus ~19 current properties from RealEstateSales.gov) into one normalized pool, cached in `data/cache.json`.
- **Search & filter**: keyword, category (auto-derived: Vehicles, Electronics, Real Estate, Heavy Equipment, …), state, price range, auction status, and **distance from any ZIP code** (offline zip→lat/lng database).
- **Sort**: ending soonest, price high↔low, nearest first, most bidders.
- **Photo-forward cards** — images resolved through a local proxy (see below).
- **Detail popup**: full description/specs, bid info, a **map showing your location → item** (Leaflet/OpenStreetMap), a **"Route in Google Maps"** button (opens turn-by-turn from your live location, no API key needed), and a direct **"Bid on official site"** link.

## Architecture

```
connectors/          one module per data source → normalized Listing[]
  gsa.js             GSA Auctions API (api.data.gov) — DEMO_KEY or $GSA_API_KEY
  realestatesales.js RealEstateSales.gov federal real property (public-domain .gov page; no API
                     exists, so we call the site's own AJAX pagination endpoint directly to get
                     all current listings in one request instead of just page 1)
  index.js           registry; add new sources here
lib/
  categorize.js      keyword rules → browse categories (title first, then description)
scripts/
  fetch-data.js      standalone CLI pull → data/cache.json (for cron)
server.js            Express: /api/listings (filter/sort/paginate), /api/meta,
                     /api/refresh, /api/img/:id (photo proxy), serves public/
public/              vanilla JS marketplace UI (no build step)
data/cache.json      listing cache (30-min TTL; disk reloaded if newer, so cron
                     updates are picked up by a running server)
```

### The photo proxy (`/api/img/:auctionId`)
The bulk GSA API's `imageURL` requires auth (401). The public gsaauctions.gov site instead uses two **open PPMS endpoints**; we replicate that server-side:
1. `GET ppms.gov/gw/auction/.../getAuction/{id}` → S3 object key + precise lat/lng (used to upgrade the listing's map pin from zip-centroid accuracy)
2. `POST ppms.gov/gw/common/.../storage/presigned-urls` → 60-min presigned S3 URL
3. `302` the browser to S3. Cached 45 min per item.

### Data sources — policy
Only **official public APIs**. GovDeals / Public Surplus / Municibid have no public APIs and prohibit scraping in their ToS, so they are *not* ingested; the connector registry (`connectors/index.js`) is the single place to plug in new sources if official feeds become available. A directory of all legit gov auction sites lives at `../gov_auction_sites.csv`.

## Scheduled refresh (cron)

```cron
*/30 * * * * cd /Users/macair/Documents/GIT/GovAuctionHub && /usr/local/bin/node scripts/fetch-data.js >> data/fetch.log 2>&1
```
(`which node` to confirm the node path; on this machine node is v25 via the default PATH.)

## Config

| Env var       | Default    | Notes                                             |
|---------------|------------|---------------------------------------------------|
| `PORT`        | 4600       | UI/API port                                       |
| `GSA_API_KEY` | `DEMO_KEY` | Free personal key: https://api.data.gov/signup/ (DEMO_KEY = 30 req/hr, plenty since one request fetches everything) |
