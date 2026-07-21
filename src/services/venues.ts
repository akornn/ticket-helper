import { lookupVenueCapacity } from "../sources/wikidata.js";
import { listNewVenues, recordWikidataAttempt } from "../db/venues.js";

export interface AutoFillResult {
  venueName: string;
  venueCity: string;
  capacity: number | null;
  matchedLabel: string | null;
}

/**
 * For every venue that's shown up in a fetched event but has no row in the
 * venues table yet (never manually set, never Wikidata-checked), tries a
 * Wikidata lookup and records the outcome either way — found or not — so a
 * venue Wikidata doesn't have isn't re-queried on every future refresh.
 * Manual entries (npm run venues -- set) always take precedence and are
 * untouched by this, since a manually-set venue already has a row and is
 * therefore never "new."
 */
export async function autoFillVenueCapacities(): Promise<AutoFillResult[]> {
  const newVenues = listNewVenues();
  const results: AutoFillResult[] = [];

  for (const venue of newVenues) {
    try {
      const { capacity, matchedLabel } = await lookupVenueCapacity(venue.venueName, venue.venueCity);
      recordWikidataAttempt(venue.venueName, venue.venueCity, capacity, matchedLabel);
      results.push({ venueName: venue.venueName, venueCity: venue.venueCity, capacity, matchedLabel });
    } catch (err) {
      // A Wikidata hiccup shouldn't block the rest of the refresh — leave this
      // venue unattempted so it's picked up again (as "new") on the next run.
      results.push({
        venueName: venue.venueName,
        venueCity: venue.venueCity,
        capacity: null,
        matchedLabel: err instanceof Error ? `error: ${err.message}` : "error",
      });
    }
  }

  return results;
}
