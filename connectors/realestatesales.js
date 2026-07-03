// Connector: realestatesales.gov — GSA's federal real property auction site.
// No JSON API exists; the listing page is server-rendered HTML. As an official
// US government site its content is public domain (unlike private platforms
// whose ToS forbid scraping), so we parse the public listings page directly —
// one polite request per refresh (~30 min).
const zipcodes = require('zipcodes');

const PAGE = 'https://realestatesales.gov/our-listing/';
const UA = { 'User-Agent': 'Mozilla/5.0 (GovAuctionHub local aggregator)' };

const m1 = (s, re) => (s.match(re) || [])[1] || null;

async function fetchListings() {
  const res = await fetch(PAGE, { headers: UA });
  if (!res.ok) throw new Error(`realestatesales.gov ${res.status}`);
  const html = (await res.text()).replace(/\s+/g, ' ');

  // Each property card is a div.itemm block; split and parse fields per card.
  const cards = html.split('class="itemm"').slice(1);
  return cards.map(card => {
    const id = m1(card, /property_id=(\d+)/);
    if (!id) return null;
    const title = m1(card, /<h2>(.*?)<\/h2>/)?.trim();
    const address = m1(card, /<h5 title="([^"]*)"/)?.trim();
    // h5 tail after the <br>/<\/span> holds "City, ST 12345"
    const locMatch = card.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})/);
    const [, city, state, zip] = locMatch || [];
    const geo = zip ? zipcodes.lookup(zip) : null;
    const bid = m1(card, /(?:Current|Starting) Bid\s*<span>\s*\$([\d,]+)/);
    const isCurrent = /Current Bid/.test(card);
    const subtype = m1(card, /class="blue-bg">\s*<h3>\s*([^<]+?)\s*<\/h3>/)?.trim(); // Residential | Commercial | Land/Lots
    const saleType = m1(card, /<li>\s*<h3>\s*([^<]+?)\s*<\/h3>/)?.trim();            // Online Auction | Sealed Bid Auction

    return {
      id: `res-${id}`,
      source: 'RealEstateSales.gov',
      title: title || address || `Federal property #${id}`,
      category: 'Real Estate',
      description: `<p><b>${subtype || 'Property'}</b> — ${saleType || 'Auction'}</p><p>${address || ''}, ${city || ''}, ${state || ''} ${zip || ''}</p><p>Full details, documents, and bidding on RealEstateSales.gov.</p>`,
      image: m1(card, /class="slide-img" src="([^"]+)"/),
      // Starting Bid = asking/minimum, not an actual bid — keep price for sorting
      // either way, but only label it a bid when the site says "Current Bid".
      currentBid: bid ? Number(bid.replace(/,/g, '')) : null,
      isStartingBid: !!bid && !isCurrent,
      bidders: null,
      hasReserve: false,
      status: /Now Bidding/.test(card) ? 'active' : 'preview',
      startDate: (m1(card, /data-start-date="([^"]+)"/) || '').slice(0, 10) || null,
      endDate: (m1(card, /data-end-date="([^"]+)"/) || '').slice(0, 10) || null,
      city: (city || '').trim(),
      state: state || '',
      zip: zip || null,
      lat: geo ? geo.latitude : null,
      lng: geo ? geo.longitude : null,
      address: address || '',
      url: `https://realestatesales.gov/asset-details/?property_id=${id}`,
      agency: 'GSA Real Property Disposition',
      auctionId: null, // images come straight from CloudFront, no proxy needed
    };
  }).filter(Boolean);
}

module.exports = { name: 'RealEstateSales.gov', fetchListings };
