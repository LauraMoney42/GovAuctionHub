// Connector: GSA Auctions (official public API via api.data.gov).
// Docs: https://gsa.github.io/auctions_api/  — one GET returns every live listing.
// DEMO_KEY works (30 req/hr) since a single request fetches the whole dataset;
// set GSA_API_KEY for a personal key from https://api.data.gov/signup/
const zipcodes = require('zipcodes');
const { categorize } = require('../lib/categorize');

const API_KEY = process.env.GSA_API_KEY || 'DEMO_KEY';
const URL = `https://api.gsa.gov/assets/gsaauctions/v2/auctions?api_key=${API_KEY}&format=JSON`;

// GSA zips sometimes arrive malformed (e.g. "85007null") — keep first 5 digits.
const cleanZip = z => (String(z || '').match(/^\d{5}/) || [null])[0];

async function fetchListings() {
  const res = await fetch(URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GSA API ${res.status}`);
  const { Results } = await res.json();
  return normalize(Results);
}

// Exported separately so raw API dumps can be (re)normalized offline.
function normalize(Results) {
  return (Results || []).map(r => {
    const zip = cleanZip(r.propertyZip) || cleanZip(r.locationZip);
    const geo = zip ? zipcodes.lookup(zip) : null;
    const title = (r.itemName || '').trim();
    return {
      id: `gsa-${r.saleNo}-${r.lotNo}`,
      source: 'GSA Auctions',
      title,
      category: categorize(title, (r.lotInfo || '').slice(0, 300)),
      description: r.lotInfo || '',
      image: r.imageURL || null,
      currentBid: r.highBidAmount != null ? Number(r.highBidAmount) : null,
      bidders: r.biddersCount != null ? Number(r.biddersCount) : null,
      hasReserve: !!r.reserve,
      status: (r.auctionStatus || '').toLowerCase(), // 'active' | 'preview'
      startDate: r.aucStartDt || null,
      endDate: r.aucEndDt || null,
      city: (r.propertyCity || '').trim(),
      state: (r.propertyState || '').trim(),
      zip,
      lat: geo ? geo.latitude : null,
      lng: geo ? geo.longitude : null,
      address: [r.propertyAddr1, r.propertyAddr2, r.propertyAddr3].filter(Boolean).join(', '),
      url: r.itemDescURL || 'https://www.gsaauctions.gov/',
      agency: r.agencyName || null,
      // Numeric auction id (from ".../auctions/preview/367875") — used by the
      // /api/img proxy to resolve presigned photo URLs from the PPMS API.
      auctionId: (String(r.itemDescURL || '').match(/\/(\d+)$/) || [])[1] || null,
    };
  });
}

module.exports = { name: 'GSA Auctions', fetchListings, normalize };
