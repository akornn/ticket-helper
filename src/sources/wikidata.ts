const API_URL = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "ticket-helper/0.1 (personal decision-support tool; no automated purchasing)";
const CAPACITY_PROPERTY = "P1083"; // Wikidata's "capacity" property

interface WBSearchResult {
  id: string;
  label?: string;
  description?: string;
}

interface WBSearchResponse {
  search?: WBSearchResult[];
}

interface WBClaimValue {
  amount?: string;
}

interface WBClaim {
  mainsnak?: { datavalue?: { value?: WBClaimValue } };
}

interface WBEntity {
  claims?: Record<string, WBClaim[]>;
}

interface WBGetEntitiesResponse {
  entities?: Record<string, WBEntity>;
}

async function wdFetch<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API_URL);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Wikidata API error ${res.status}`);
  }
  return (await res.json()) as T;
}

async function searchEntities(query: string): Promise<WBSearchResult[]> {
  const data = await wdFetch<WBSearchResponse>({
    action: "wbsearchentities",
    search: query,
    language: "en",
    type: "item",
    limit: "5",
  });
  return data.search ?? [];
}

async function getCapacityClaim(qid: string): Promise<number | null> {
  const data = await wdFetch<WBGetEntitiesResponse>({
    action: "wbgetentities",
    ids: qid,
    props: "claims",
  });

  const claims = data.entities?.[qid]?.claims?.[CAPACITY_PROPERTY];
  const amount = claims?.[0]?.mainsnak?.datavalue?.value?.amount;
  if (!amount) return null;

  const n = Number(amount.replace("+", ""));
  return Number.isFinite(n) ? n : null;
}

export interface WikidataCapacityResult {
  capacity: number | null;
  matchedEntityId: string | null;
  matchedLabel: string | null;
}

/**
 * Looks up a venue's capacity via Wikidata's "capacity" property (P1083).
 * Disambiguates generic venue names (e.g. "Armory," "The Dome") by
 * preferring a search result whose description mentions the venue's city;
 * falls back to the top result if none mention it. Returns capacity: null
 * (not a thrown error) when nothing is found — that's an expected, common
 * outcome for smaller venues Wikidata simply doesn't have.
 */
export async function lookupVenueCapacity(venueName: string, venueCity: string): Promise<WikidataCapacityResult> {
  const candidates = await searchEntities(venueName);
  if (candidates.length === 0) {
    return { capacity: null, matchedEntityId: null, matchedLabel: null };
  }

  const cityMatch = candidates.find((c) => c.description?.toLowerCase().includes(venueCity.toLowerCase()));
  const chosen = cityMatch ?? candidates[0];

  const capacity = await getCapacityClaim(chosen.id);
  return { capacity, matchedEntityId: chosen.id, matchedLabel: chosen.label ?? chosen.id };
}
