/**
 * Local news feeds.
 *
 * The old "local" mode was a single Google News search for "<place> local
 * news", which returns whatever Google decides is local — mangled titles, no
 * images, and no way to tell a city newsroom from a national outlet quoting
 * the city's name. These are direct RSS feeds from newsrooms that actually
 * cover a place, matched to the user's saved location.
 *
 * Coverage comes in two levels:
 *  - `metro`: a newsroom covering one city or metro area.
 *  - `state`: a statewide newsroom. Nearly every US state has one, so a user
 *    anywhere gets real local journalism even if their city has no dedicated
 *    outlet in this list.
 *
 * Dead or moved feeds are skipped (Promise.allSettled) and Google News stays
 * as a backstop, so over-including costs nothing but a failed request.
 */

export interface LocalFeed {
  url: string;
  source: string;
  /** For bias lookup and the outlet profile page. */
  domain: string;
  level: "metro" | "state";
  /** Lowercase city/metro names this newsroom covers. */
  cities?: string[];
  /** Lowercase US state names this newsroom covers. */
  states?: string[];
}

/* ------------------------------------------------------------------ *
 * Metro newsrooms
 * ------------------------------------------------------------------ */

const METRO: LocalFeed[] = [
  // New York
  { url: "https://gothamist.com/feed", source: "Gothamist", domain: "gothamist.com", level: "metro", cities: ["new york", "new york city", "brooklyn", "queens", "the bronx", "bronx", "staten island", "manhattan"] },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/NYRegion.xml", source: "The New York Times", domain: "nytimes.com", level: "metro", cities: ["new york", "new york city", "brooklyn", "queens", "bronx", "the bronx", "manhattan", "staten island", "yonkers", "newark"] },
  { url: "https://www.thecity.nyc/feed/", source: "THE CITY", domain: "thecity.nyc", level: "metro", cities: ["new york", "new york city", "brooklyn", "queens", "bronx", "the bronx", "manhattan", "staten island"] },

  // Los Angeles / Southern California
  { url: "https://laist.com/feed", source: "LAist", domain: "laist.com", level: "metro", cities: ["los angeles", "long beach", "pasadena", "glendale", "burbank", "santa monica", "anaheim", "irvine", "santa ana"] },
  { url: "https://www.latimes.com/local/rss2.0.xml", source: "Los Angeles Times", domain: "latimes.com", level: "metro", cities: ["los angeles", "long beach", "pasadena", "glendale", "burbank", "santa monica", "anaheim", "irvine", "santa ana", "riverside", "san bernardino"] },
  { url: "https://voiceofsandiego.org/feed/", source: "Voice of San Diego", domain: "voiceofsandiego.org", level: "metro", cities: ["san diego", "chula vista", "oceanside", "escondido", "carlsbad"] },

  // San Francisco Bay Area
  { url: "https://missionlocal.org/feed/", source: "Mission Local", domain: "missionlocal.org", level: "metro", cities: ["san francisco", "daly city"] },
  { url: "https://sfstandard.com/feed/", source: "The San Francisco Standard", domain: "sfstandard.com", level: "metro", cities: ["san francisco", "daly city", "south san francisco"] },
  { url: "https://oaklandside.org/feed/", source: "The Oaklandside", domain: "oaklandside.org", level: "metro", cities: ["oakland", "alameda", "emeryville", "piedmont"] },
  { url: "https://www.berkeleyside.org/feed", source: "Berkeleyside", domain: "berkeleyside.org", level: "metro", cities: ["berkeley", "albany", "el cerrito"] },
  { url: "https://sanjosespotlight.com/feed/", source: "San José Spotlight", domain: "sanjosespotlight.com", level: "metro", cities: ["san jose", "san josé", "santa clara", "sunnyvale", "cupertino", "milpitas"] },

  // Chicago
  { url: "https://blockclubchicago.org/feed/", source: "Block Club Chicago", domain: "blockclubchicago.org", level: "metro", cities: ["chicago", "evanston", "oak park", "cicero", "skokie"] },
  { url: "https://chicago.suntimes.com/feed", source: "Chicago Sun-Times", domain: "suntimes.com", level: "metro", cities: ["chicago", "evanston", "oak park", "cicero", "naperville", "aurora", "joliet"] },

  // Boston
  { url: "https://www.wbur.org/feed", source: "WBUR", domain: "wbur.org", level: "metro", cities: ["boston", "cambridge", "somerville", "quincy", "newton", "brookline", "worcester"] },

  // Philadelphia
  { url: "https://whyy.org/feed/", source: "WHYY", domain: "whyy.org", level: "metro", cities: ["philadelphia", "camden", "chester", "upper darby", "cherry hill"] },

  // Washington DC
  { url: "https://dcist.com/feed", source: "DCist", domain: "dcist.com", level: "metro", cities: ["washington", "washington d.c.", "arlington", "alexandria", "bethesda", "silver spring"] },

  // Baltimore
  { url: "https://www.thebaltimorebanner.com/arc/outboundfeeds/rss/", source: "The Baltimore Banner", domain: "thebaltimorebanner.com", level: "metro", cities: ["baltimore", "towson", "columbia"] },

  // Pittsburgh
  { url: "https://www.publicsource.org/feed/", source: "PublicSource", domain: "publicsource.org", level: "metro", cities: ["pittsburgh", "allegheny"] },

  // Detroit
  { url: "https://www.bridgedetroit.com/feed/", source: "BridgeDetroit", domain: "bridgedetroit.com", level: "metro", cities: ["detroit", "dearborn", "warren", "southfield", "hamtramck"] },

  // Cleveland
  { url: "https://signalcleveland.org/feed/", source: "Signal Cleveland", domain: "signalcleveland.org", level: "metro", cities: ["cleveland", "lakewood", "parma", "euclid"] },

  // Minneapolis–St. Paul
  { url: "https://www.minnpost.com/feed/", source: "MinnPost", domain: "minnpost.com", level: "metro", cities: ["minneapolis", "saint paul", "st. paul", "st paul", "bloomington", "edina"] },
  { url: "https://sahanjournal.com/feed/", source: "Sahan Journal", domain: "sahanjournal.com", level: "metro", cities: ["minneapolis", "saint paul", "st. paul", "st paul"] },

  // Denver
  { url: "https://denverite.com/feed/", source: "Denverite", domain: "denverite.com", level: "metro", cities: ["denver", "aurora", "lakewood", "boulder", "englewood"] },

  // Seattle / Portland
  { url: "https://www.seattletimes.com/feed/", source: "The Seattle Times", domain: "seattletimes.com", level: "metro", cities: ["seattle", "bellevue", "tacoma", "everett", "kent", "renton", "kirkland"] },
  { url: "https://www.opb.org/feed/", source: "OPB", domain: "opb.org", level: "metro", cities: ["portland", "beaverton", "gresham", "hillsboro", "salem", "eugene"] },

  // Texas metros
  { url: "https://www.austinmonitor.com/feed/", source: "Austin Monitor", domain: "austinmonitor.com", level: "metro", cities: ["austin", "round rock", "cedar park", "pflugerville"] },
  { url: "https://www.houstonchronicle.com/rss/feed/News-270.php", source: "Houston Chronicle", domain: "houstonchronicle.com", level: "metro", cities: ["houston", "pasadena", "sugar land", "katy", "the woodlands"] },
  { url: "https://dallasexpress.com/feed/", source: "The Dallas Express", domain: "dallasexpress.com", level: "metro", cities: ["dallas", "fort worth", "arlington", "plano", "irving", "garland", "frisco"] },

  // Atlanta / Miami / Phoenix / Las Vegas
  { url: "https://atlantaciviccircle.org/feed/", source: "Atlanta Civic Circle", domain: "atlantaciviccircle.org", level: "metro", cities: ["atlanta", "decatur", "sandy springs", "marietta", "roswell"] },
  { url: "https://www.miamiherald.com/news/local/?widgetName=rssfeed&widgetContentId=712015&getXmlFeed=true", source: "Miami Herald", domain: "miamiherald.com", level: "metro", cities: ["miami", "miami beach", "hialeah", "coral gables", "fort lauderdale", "hollywood"] },
  { url: "https://www.phoenixnewtimes.com/feed", source: "Phoenix New Times", domain: "phoenixnewtimes.com", level: "metro", cities: ["phoenix", "mesa", "scottsdale", "tempe", "chandler", "glendale", "gilbert", "peoria"] },
  { url: "https://thenevadaindependent.com/feed", source: "The Nevada Independent", domain: "thenevadaindependent.com", level: "metro", cities: ["las vegas", "henderson", "north las vegas", "reno", "sparks", "carson city"] },

  // New Orleans / Nashville / St. Louis / Kansas City
  { url: "https://veritenews.org/feed/", source: "Verite News", domain: "veritenews.org", level: "metro", cities: ["new orleans", "metairie", "kenner", "baton rouge"] },
  { url: "https://www.nashvillebanner.com/feed/", source: "Nashville Banner", domain: "nashvillebanner.com", level: "metro", cities: ["nashville", "murfreesboro", "franklin", "brentwood"] },
  { url: "https://www.stlpr.org/feed", source: "St. Louis Public Radio", domain: "stlpr.org", level: "metro", cities: ["st. louis", "st louis", "saint louis", "clayton", "florissant"] },
  { url: "https://www.kcur.org/feed", source: "KCUR", domain: "kcur.org", level: "metro", cities: ["kansas city", "overland park", "olathe", "independence", "lee's summit"] },

  // Honolulu / Anchorage / San Juan-adjacent
  { url: "https://www.civilbeat.org/feed/", source: "Honolulu Civil Beat", domain: "civilbeat.org", level: "metro", cities: ["honolulu", "pearl city", "hilo", "kailua", "kaneohe"] },
  { url: "https://alaskapublic.org/feed/", source: "Alaska Public Media", domain: "alaskapublic.org", level: "metro", cities: ["anchorage", "fairbanks", "juneau"] },
];

/* ------------------------------------------------------------------ *
 * Statewide newsrooms
 * ------------------------------------------------------------------ *
 * Most of these are States Newsroom affiliates — nonprofit, nonpartisan
 * statehouse newsrooms on a common platform, which is why the feed URLs share
 * a shape. The rest are long-running independents (Texas Tribune, CalMatters,
 * VTDigger, WyoFile, Mississippi Today, CT Mirror, Spotlight PA's peers).
 */

const state = (
  stateName: string,
  source: string,
  domain: string,
  path = "/feed/",
): LocalFeed => ({
  url: `https://${domain}${path}`,
  source,
  domain,
  level: "state",
  states: [stateName.toLowerCase()],
});

const STATE: LocalFeed[] = [
  state("Alabama", "Alabama Reflector", "alabamareflector.com"),
  state("Alaska", "Alaska Beacon", "alaskabeacon.com"),
  state("Arizona", "Arizona Mirror", "azmirror.com"),
  state("Arkansas", "Arkansas Advocate", "arkansasadvocate.com"),
  state("California", "CalMatters", "calmatters.org"),
  state("Colorado", "The Colorado Sun", "coloradosun.com"),
  state("Connecticut", "The Connecticut Mirror", "ctmirror.org"),
  state("Delaware", "Spotlight Delaware", "spotlightdelaware.org"),
  state("District of Columbia", "The DC Line", "thedcline.org"),
  state("Florida", "Florida Phoenix", "floridaphoenix.com"),
  state("Georgia", "Georgia Recorder", "georgiarecorder.com"),
  state("Hawaii", "Honolulu Civil Beat", "civilbeat.org"),
  state("Idaho", "Idaho Capital Sun", "idahocapitalsun.com"),
  state("Illinois", "Capitol News Illinois", "capitolnewsillinois.com"),
  state("Indiana", "Indiana Capital Chronicle", "indianacapitalchronicle.com"),
  state("Iowa", "Iowa Capital Dispatch", "iowacapitaldispatch.com"),
  state("Kansas", "Kansas Reflector", "kansasreflector.com"),
  state("Kentucky", "Kentucky Lantern", "kentuckylantern.com"),
  state("Louisiana", "Louisiana Illuminator", "lailluminator.com"),
  state("Maine", "Maine Morning Star", "mainemorningstar.com"),
  state("Maryland", "Maryland Matters", "marylandmatters.org"),
  state("Massachusetts", "CommonWealth Beacon", "commonwealthbeacon.org"),
  state("Michigan", "Michigan Advance", "michiganadvance.com"),
  state("Minnesota", "Minnesota Reformer", "minnesotareformer.com"),
  state("Mississippi", "Mississippi Today", "mississippitoday.org"),
  state("Missouri", "Missouri Independent", "missouriindependent.com"),
  state("Montana", "Daily Montanan", "dailymontanan.com"),
  state("Nebraska", "Nebraska Examiner", "nebraskaexaminer.com"),
  state("Nevada", "Nevada Current", "nevadacurrent.com"),
  state("New Hampshire", "New Hampshire Bulletin", "newhampshirebulletin.com"),
  state("New Jersey", "New Jersey Monitor", "newjerseymonitor.com"),
  state("New Mexico", "Source New Mexico", "sourcenm.com"),
  state("New York", "New York Focus", "nysfocus.com"),
  state("North Carolina", "NC Newsline", "ncnewsline.com"),
  state("North Dakota", "North Dakota Monitor", "northdakotamonitor.com"),
  state("Ohio", "Ohio Capital Journal", "ohiocapitaljournal.com"),
  state("Oklahoma", "Oklahoma Voice", "oklahomavoice.com"),
  state("Oregon", "Oregon Capital Chronicle", "oregoncapitalchronicle.com"),
  state("Pennsylvania", "Pennsylvania Capital-Star", "penncapital-star.com"),
  state("Rhode Island", "Rhode Island Current", "rhodeislandcurrent.com"),
  state("South Carolina", "SC Daily Gazette", "scdailygazette.com"),
  state("South Dakota", "South Dakota Searchlight", "southdakotasearchlight.com"),
  state("Tennessee", "Tennessee Lookout", "tennesseelookout.com"),
  state("Texas", "The Texas Tribune", "texastribune.org", "/feeds/main/"),
  state("Utah", "Utah News Dispatch", "utahnewsdispatch.com"),
  state("Vermont", "VTDigger", "vtdigger.org"),
  state("Virginia", "Virginia Mercury", "virginiamercury.com"),
  state("Washington", "Washington State Standard", "washingtonstatestandard.com"),
  state("West Virginia", "West Virginia Watch", "westvirginiawatch.com"),
  state("Wisconsin", "Wisconsin Examiner", "wisconsinexaminer.com"),
  state("Wyoming", "WyoFile", "wyofile.com"),
];

export const LOCAL_FEEDS: LocalFeed[] = [...METRO, ...STATE];

/* ------------------------------------------------------------------ *
 * Matching a saved location to feeds
 * ------------------------------------------------------------------ */

/** Two-letter abbreviations, so "Austin, TX" matches as well as "Austin, Texas". */
const STATE_BY_ABBR: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", dc: "district of columbia",
  fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois",
  in: "indiana", ia: "iowa", ks: "kansas", ky: "kentucky", la: "louisiana",
  me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan",
  mn: "minnesota", ms: "mississippi", mo: "missouri", mt: "montana",
  ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota",
  oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
  ri: "rhode island", sc: "south carolina", sd: "south dakota",
  tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont", va: "virginia",
  wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
};

export interface ParsedPlace {
  /** First segment: the city or locality. */
  city: string;
  /** Resolved full state name, when we can tell. */
  state?: string;
  /** Every comma-separated segment, lowercased. */
  parts: string[];
}

/**
 * Split a saved location string into something matchable. The geocoder gives
 * "Austin, Texas, United States"; users may also type "Austin, TX".
 */
export function parsePlace(place: string): ParsedPlace {
  const parts = place
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const city = parts[0] ?? "";

  let stateName: string | undefined;
  for (const p of parts.slice(1)) {
    const resolved = STATE_BY_ABBR[p] ?? (p.length > 2 ? p : undefined);
    // "united states" is a country, not a state — only accept known states.
    if (resolved && STATE.some((f) => f.states?.includes(resolved))) {
      stateName = resolved;
      break;
    }
  }
  // Washington, D.C. arrives as a city, and some geocoders omit the state.
  if (!stateName && (city === "washington" || parts.includes("washington, d.c.")))
    stateName = "district of columbia";

  return { city, state: stateName, parts };
}

/**
 * Feeds that cover a place, metro newsrooms first.
 *
 * A city match is the strongest signal; the statewide newsroom is always
 * appended, because "local" with nothing in it is worse than state coverage.
 */
export function selectLocalFeeds(place: string, cap = 10): LocalFeed[] {
  const { city, state: stateName, parts } = parsePlace(place);
  if (!city) return [];

  const metro = METRO.filter((f) =>
    f.cities?.some((c) => c === city || parts.includes(c)),
  );

  const statewide = stateName
    ? STATE.filter((f) => f.states?.includes(stateName))
    : [];

  // De-duplicate by domain: Civil Beat is both Honolulu's metro and Hawaii's
  // statewide newsroom, and we only want to fetch it once.
  const out: LocalFeed[] = [];
  const seen = new Set<string>();
  for (const f of [...metro, ...statewide]) {
    if (seen.has(f.domain)) continue;
    seen.add(f.domain);
    out.push(f);
  }
  return out.slice(0, cap);
}

/** True when we carry at least one real newsroom for this place. */
export function hasLocalCoverage(place: string): boolean {
  return selectLocalFeeds(place).length > 0;
}
