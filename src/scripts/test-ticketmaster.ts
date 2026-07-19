import { searchEvents, mapEventToRecord } from "../sources/ticketmaster.js";
import { upsertEvents, listEvents } from "../db/events.js";

/**
 * Manual smoke test for the Ticketmaster client.
 * Usage: npm run ticketmaster:test -- "Artist Name"
 * With no argument, searches broadly by classification (Music) instead.
 */
async function main() {
  const keyword = process.argv[2];

  console.log(
    keyword
      ? `Searching Ticketmaster for keyword: "${keyword}"`
      : "No keyword given, searching by default classification instead...",
  );

  const rawEvents = await searchEvents(
    keyword ? { keyword, size: 10 } : { classificationName: "Music", size: 10 },
  );

  if (rawEvents.length === 0) {
    console.log("No events found.");
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
  console.error("Ticketmaster test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
