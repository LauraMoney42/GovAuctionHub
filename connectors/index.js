// Connector registry. Each connector exports { name, fetchListings() -> Listing[] }.
// To add a source (state surplus feed, another federal API, a CSV drop, ...),
// create a module with the same shape and add it here. Listings from all
// connectors are merged into one normalized pool.
//
// NOTE: GovDeals / Public Surplus / Municibid have no public APIs and their
// terms of service prohibit scraping — those stay as outbound links in the UI
// rather than ingested data, unless/until an official feed is available.
module.exports = [
  require('./gsa'),
  require('./realestatesales'),
];
