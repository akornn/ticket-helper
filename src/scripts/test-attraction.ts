import { searchAttractions, searchEvents, mapEventToRecord } from "../sources/ticketmaster.js";
import { upsertEvents, listEvents } from "../db/events.js";

/**
 * Resolve an artist name to a Ticketmaster attraction id, then fetch only
 * that attraction's real events (filters out tribute acts / cover bands
 * that a plain keyword search picks up).
 * Usage: npm run attraction:test -- "Artist Name"
 */
async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: npm run attraction:test -- "Artist Name"');
    process.exit(1);
  }

  console.log(`Resolving attractions for: "${name}"`);
  const attractions = await searchAttractions(name);

  if (attractions.length === 0) {
    console.log("No matching attractions found.");
    return;
  }

  console.log(`\nCandidates:`);
  for (const a of attractions) {
    console.log(`- ${a.id}  ${a.name}`);
  }

  const exactMatch = attractions.find((a) => a.name.toLowerCase() === name.toLowerCase());
  const chosen = exactMatch ?? attractions[0];
  console.log(`\nUsing: ${chosen.name} (${chosen.id})${exactMatch ? "" : " [best guess, no exact match]"}`);

  const rawEvents = await searchEvents({ attractionId: chosen.id, size: 20 });

  if (rawEvents.length === 0) {
    console.log("No events found for this attraction.");
    return;
  }

  const records = rawEvents.map((raw) => mapEventToRecord(raw, "watchlist"));

  console.log(`\nFound ${records.length} event(s):\n`);
  for (const r of records) {
    console.log(
      `- ${r.eventDate.slice(0, 10)}  ${r.artistName} @ ${r.venueName}, ${r.venueCity}` +
        `  [onsale: ${r.onsaleStart ?? "?"}]` +
        `  [$${r.priceMin ?? "?"}-${r.priceMax ?? "?"}]`,
    );
  }

  upsertEvents(records);
  console.log(`\nSaved to local database. Total events stored: ${listEvents().length}`);
}

main().catch((err) => {
  console.error("Attraction test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
