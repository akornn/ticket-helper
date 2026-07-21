import {
  addArtistToWatchlist,
  removeArtistFromWatchlist,
  getWatchlist,
  refreshWatchlistEvents,
} from "../services/watchlist.js";
import { autoFillVenueCapacities } from "../services/venues.js";

function usage(): never {
  console.error(
    [
      "Usage:",
      '  npm run watchlist -- add "Artist Name" ["optional notes"]',
      "  npm run watchlist -- list",
      '  npm run watchlist -- remove "Artist Name"',
      "  npm run watchlist -- refresh",
    ].join("\n"),
  );
  process.exit(1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "add": {
      const [artistName, notes] = rest;
      if (!artistName) usage();
      const result = await addArtistToWatchlist(artistName, notes ?? null);
      console.log(`Added "${artistName}" to watchlist.`);
      if (result.resolvedTo) {
        console.log(
          `Resolved to Ticketmaster attraction "${result.resolvedTo}"` +
            (result.exactMatch ? "" : " (best guess, no exact name match — verify this is correct)"),
        );
      } else {
        console.log("Could not resolve a Ticketmaster attraction yet — will retry on next refresh.");
      }
      break;
    }

    case "list": {
      const entries = getWatchlist();
      if (entries.length === 0) {
        console.log("Watchlist is empty.");
        break;
      }
      for (const e of entries) {
        console.log(
          `- ${e.artistName}` +
            (e.ticketmasterAttractionId ? `  [${e.ticketmasterAttractionId}]` : "  [unresolved]") +
            (e.notes ? `  — ${e.notes}` : ""),
        );
      }
      break;
    }

    case "remove": {
      const [artistName] = rest;
      if (!artistName) usage();
      const removed = removeArtistFromWatchlist(artistName);
      console.log(removed ? `Removed "${artistName}".` : `"${artistName}" was not on the watchlist.`);
      break;
    }

    case "refresh": {
      const results = await refreshWatchlistEvents();
      if (results.length === 0) {
        console.log("Watchlist is empty — nothing to refresh.");
        break;
      }
      for (const r of results) {
        const suffix = r.status === "error" ? `: ${r.error}` : "";
        console.log(`- ${r.artistName}: ${r.status} (${r.eventCount} event(s))${suffix}`);
      }

      const autoFilled = await autoFillVenueCapacities();
      if (autoFilled.length > 0) {
        console.log("\nVenue capacity auto-fill (Wikidata):");
        for (const v of autoFilled) {
          console.log(
            `- ${v.venueName}, ${v.venueCity}: ` +
              (v.capacity !== null ? `${v.capacity} (${v.matchedLabel})` : "not found"),
          );
        }
      }
      break;
    }

    default:
      usage();
  }
}

main().catch((err) => {
  console.error("Watchlist command failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
