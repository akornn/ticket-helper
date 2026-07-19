import { setVenueCapacity, listVenues, listUnknownVenues } from "../db/venues.js";

function usage(): never {
  console.error(
    [
      "Usage:",
      '  npm run venues -- set "Venue Name" "City" <capacity> ["optional notes"]',
      "  npm run venues -- list",
      "  npm run venues -- missing",
    ].join("\n"),
  );
  process.exit(1);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "set": {
      const [venueName, venueCity, capacityStr, notes] = rest;
      if (!venueName || !venueCity || !capacityStr) usage();
      const capacity = Number(capacityStr);
      if (!Number.isFinite(capacity) || capacity <= 0) {
        console.error(`Invalid capacity: "${capacityStr}"`);
        process.exit(1);
      }
      const venue = setVenueCapacity(venueName, venueCity, capacity, notes ?? null);
      console.log(`Saved: ${venue.venueName}, ${venue.venueCity} — capacity ${venue.capacity}`);
      break;
    }

    case "list": {
      const venues = listVenues();
      if (venues.length === 0) {
        console.log("No venues on file yet.");
        break;
      }
      for (const v of venues) {
        console.log(
          `- ${v.venueName}, ${v.venueCity}: ${v.capacity ?? "?"}` + (v.notes ? `  — ${v.notes}` : ""),
        );
      }
      break;
    }

    case "missing": {
      const missing = listUnknownVenues();
      if (missing.length === 0) {
        console.log("Every venue seen in fetched events has a capacity on file.");
        break;
      }
      console.log(`${missing.length} venue(s) missing capacity (most-seen first):\n`);
      for (const m of missing) {
        console.log(`- ${m.venueName}, ${m.venueCity}  (${m.eventCount} event(s) fetched)`);
      }
      break;
    }

    default:
      usage();
  }
}

main();
