import { refreshWatchlistEvents } from "../services/watchlist.js";
import { autoFillVenueCapacities } from "../services/venues.js";

/**
 * Unattended cron entrypoint: refreshes every watchlist artist's events,
 * then auto-fills capacity for any newly-seen venue via Wikidata. Scores
 * are computed on demand (by npm run score / the dashboard), not cached,
 * so there's nothing else to refresh.
 *
 * Exits 1 if any artist errored (so cron/log monitoring can flag it), but
 * still processes every other artist first — see refreshWatchlistEvents.
 * Usage: npm run refresh
 */
async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Starting watchlist refresh...`);

  const results = await refreshWatchlistEvents();

  if (results.length === 0) {
    console.log("Watchlist is empty — nothing to refresh.");
    return;
  }

  let fetchedEvents = 0;
  let errorCount = 0;

  for (const r of results) {
    const suffix = r.status === "error" ? `: ${r.error}` : "";
    console.log(`- ${r.artistName}: ${r.status} (${r.eventCount} event(s))${suffix}`);
    fetchedEvents += r.eventCount;
    if (r.status === "error") errorCount++;
  }

  const autoFilled = await autoFillVenueCapacities();
  if (autoFilled.length > 0) {
    console.log("\nVenue capacity auto-fill (Wikidata):");
    for (const v of autoFilled) {
      console.log(
        `- ${v.venueName}, ${v.venueCity}: ` + (v.capacity !== null ? `${v.capacity} (${v.matchedLabel})` : "not found"),
      );
    }
  }

  const finishedAt = new Date().toISOString();
  console.log(
    `[${finishedAt}] Done. ${results.length} artist(s), ${fetchedEvents} event(s) fetched, ${errorCount} error(s).`,
  );

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Refresh failed:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
