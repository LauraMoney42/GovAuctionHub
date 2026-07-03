// Derive a browse category from an item's name/description.
// The GSA Auctions API has no category field, so we classify by keywords.
// Order matters: earlier rules win (e.g. "Silverado" must hit Vehicles before
// the Jewelry rule sees "silver").
const RULES = [
  ['Vehicles', /\b(sedan|truck|van|bus(es)?|suv|pickup|4x4|ford|chevrolet|chevy|silverado|tahoe|dodge|ram \d|toyota|honda|nissan|jeep|wrangler|motorcycle|harley|ambulance|cruiser|f-?[12]50|f-?[34]50|express \d|caravan|malibu|fusion|taurus|impala|charger|durango|explorer|expedition|escape|equinox|colorado|sierra|yukon|suburban|transit|sprinter|automobile|vehicle)\b/i],
  ['Trailers & RVs', /\b(trailer|camper|rv|motorhome|fifth wheel)\b/i],
  ['Aircraft & Boats', /\b(aircraft|airplane|helicopter|cessna|beechcraft|boat|vessel|whaler|outboard|kayak|pontoon|jet ?ski)\b/i],
  ['Real Estate', /\b(real estate|real property|acres?|land parcel|parcel of|tract of|house|residence|former (post office|federal building)|lighthouse|building located)\b/i],
  ['Heavy Equipment', /\b(forklift|tractor|excavator|loader|backhoe|dozer|bulldozer|skid ?steer|crane|grader|mower|generator|compressor|welder|lathe|cnc|drill press|man ?lift|scissor lift|plow|sweeper|utv|atv|gator|toolcat|bobcat|john deere|jd |kubota|caterpillar|cat \d)\b/i],
  ['Electronics & Computers', /\b(computer|laptop|desktop|monitor|printer|copier|scanner|server|cisco|switch(es)?|router|network|phone|iphone|ipad|tablet|camera|tv|television|projector|dell|lenovo|toughbook|electronics|a\/?v |audio|radio|drone)\b/i],
  ['Medical & Lab', /\b(medical|hospital|stretcher|wheelchair|gurney|exam table|dental|x-?ray|ultrasound|defibrillator|microscope|centrifuge|lab(oratory)? |autoclave|incubator|analyzer)\b/i],
  ['Furniture & Office', /\b(desk|chair|table|cabinet|furniture|shelv|bookcase|cubicle|sofa|couch|credenza|file cab|locker|whiteboard|partition)\b/i],
  ['Tools & Hardware', /\b(tools?|wrench|saw|drill|ladder|hose|pump|hardware|toolbox|jack|grinder|sander|shop equipment)\b/i],
  ['Jewelry & Collectibles', /\b(jewelry|watch(es)?|rolex|coin|ring|necklace|bracelet|gold|silver|diamond|collectible|antique|artwork|painting)\b/i],
  ['Clothing & Gear', /\b(uniform|clothing|boots|jacket|apparel|backpack|vest|helmet)\b/i],
  ['Scrap & Materials', /\b(scrap|salvage|metals|tires?|batteries|pallets? of|lumber|pipe|cable|wire spool)\b/i],
  ['Kitchen & Appliances', /\b(refrigerator|freezer|oven|stove|microwave|dishwasher|washer|dryer|kitchen|tableware|mug|dispenser|ice machine)\b/i],
];

// Title is authoritative; only consult the (noisier) description when the
// title alone doesn't classify — descriptions often mention incidental terms
// like "truck removal required" that would miscategorize.
function categorize(title, description = '') {
  for (const [cat, re] of RULES) if (re.test(title)) return cat;
  for (const [cat, re] of RULES) if (re.test(description)) return cat;
  return 'Other';
}

module.exports = { categorize, CATEGORIES: RULES.map(r => r[0]).concat('Other') };
