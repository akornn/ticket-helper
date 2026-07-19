import { resolvePerformer, searchEvents, mapEventToPriceSnapshot } from "../sources/seatgeek.js";

/**
 * Manual smoke test for the SeatGeek client.
 * Usage: npm run seatgeek:test -- "Artist Name"
 */
async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: npm run seatgeek:test -- "Artist Name"');
    process.exit(1);
  }

  console.log(`Resolving SeatGeek performer for: "${name}"`);
  const match = await resolvePerformer(name);

  if (!match) {
    console.log("No matching performer found.");
    return;
  }

  console.log(
    `Using: ${match.name} (slug: ${match.slug})` +
      (match.exact ? "" : " [best guess, no exact match]"),
  );

  const rawEvents = await searchEvents({ performerSlug: match.slug, perPage: 20 });

  if (rawEvents.length === 0) {
    console.log("No events found for this performer.");
    return;
  }

  const snapshots = rawEvents.map(mapEventToPriceSnapshot);

  console.log(`\nFound ${snapshots.length} event(s):\n`);
  for (const s of snapshots) {
    console.log(
      `- ${s.eventDate?.slice(0, 10) ?? "?"}  ${s.title} @ ${s.venueName ?? "?"}, ${s.venueCity ?? "?"}` +
        `  [median $${s.medianPrice ?? "?"} | low $${s.lowestPrice ?? "?"} | listings ${s.listingCount ?? "?"}]`,
    );
  }
}

main().catch((err) => {
  console.error("SeatGeek test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
