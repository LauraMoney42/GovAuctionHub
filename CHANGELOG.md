# Changelog

## 2026-07-03 14:00
- Facet counts are now context-aware (marketplace-style): category counts reflect the selected state/zip/search, state dropdown only lists states that match the other filters — eliminates "AR (39) + Real Estate (12) = 0 results" dead-ends
- /api/meta now accepts the same filter params as /api/listings (each facet excludes its own dimension, standard faceting)
- Added friendly empty-state message when no listings match
- Files affected: server.js, public/app.js

## 2026-07-03 13:50
- Added Real Estate category with live data: new RealEstateSales.gov connector (12 federal properties — homes, commercial, land; public-domain .gov HTML, no API exists)
- "Starting bid" now labeled distinctly from an actual current bid
- Robustness: when one source fails (e.g. GSA DEMO_KEY 429 rate limit), its last good listings are kept instead of dropped — in both server refresh and scripts/fetch-data.js
- gsa.js now exports normalize() so raw API dumps can be re-normalized offline (used to rebuild cache during the rate-limit window)
- Files affected: connectors/{realestatesales,index,gsa}.js, server.js, scripts/fetch-data.js, public/app.js

## 2026-07-03 13:35
- Full validation pass (9 API checks + browser walkthrough of every feature)
- Fixed race condition: rapid filter changes could render stale results / double-append pages; added request sequence guard in load()
- Files affected: public/app.js

## 2026-07-03 13:30
- Initial build of GovAuctionHub: marketplace-style search UI over live government auction data
- GSA Auctions API connector (595 listings), keyword categorizer, zip-distance filtering (offline zip DB)
- Express API: /api/listings (q/category/state/zip/radius/price/status/sort/paging), /api/meta, /api/refresh
- Photo proxy /api/img/:id replicating gsaauctions.gov's public PPMS presigned-URL flow (bulk-API image links are auth-gated); opportunistically upgrades listings with precise lat/lng
- Frontend: card grid with photos, category/state/price/status filters, sort, detail modal with Leaflet map (you → item) + Google Maps directions link + official bid link
- Standalone `npm run fetch` (scripts/fetch-data.js) for cron; running server auto-reloads a newer disk cache
- Verified end-to-end in browser: grid photos, 72762-radius filter (18 vehicles near Springdale), modal map route Springdale → Greenbrier AR
- Files affected: server.js, connectors/{gsa,index}.js, lib/categorize.js, scripts/fetch-data.js, public/{index.html,app.js,styles.css}, package.json
