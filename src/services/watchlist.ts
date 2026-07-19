import { resolveAttraction, searchEvents, mapEventToRecord } from "../sources/ticketmaster.js";
import {
  addWatchlistEntry,
  setWatchlistResolution,
  listWatchlistEntries,
  removeWatchlistEntry,
} from "../db/watchlist.js";
import { upsertEvents } from "../db/events.js";
import type { WatchlistEntry, EventRecord } from "../types/index.js";

export interface AddResult {
  entry: WatchlistEntry;
  resolvedTo: string | null;
  exactMatch: boolean;
}

/** Add an artist to the watchlist and try to resolve their Ticketmaster attraction id up front. */
export async function addArtistToWatchlist(artistName: string, notes: string | null = null): Promise<AddResult> {
  const entry = addWatchlistEntry(artistName, notes);

  const match = await resolveAttraction(artistName);
  if (match) {
    setWatchlistResolution(artistName, match.id, match.upcomingEventsTotal);
  }

  return {
    entry: match
      ? { ...entry, ticketmasterAttractionId: match.id, upcomingEventsTotal: match.upcomingEventsTotal }
      : entry,
    resolvedTo: match?.name ?? null,
    exactMatch: match?.exact ?? false,
  };
}

export function removeArtistFromWatchlist(artistName: string): boolean {
  return removeWatchlistEntry(artistName);
}

export function getWatchlist(): WatchlistEntry[] {
  return listWatchlistEntries();
}

export interface RefreshResult {
  artistName: string;
  status: "fetched" | "resolved-now" | "unresolved" | "no-events" | "error";
  eventCount: number;
  error?: string;
}

/**
 * Fetch and persist events for every watchlist entry. Always re-resolves the
 * attraction (not just for entries missing an id) so upcomingEventsTotal —
 * the tour-scale input to the popularity signal — stays current as tours
 * add or drop dates.
 *
 * Each entry is isolated in its own try/catch: this runs unattended from
 * cron, so one artist hitting a transient API error (rate limit, timeout)
 * must not abort the rest of the watchlist.
 */
export async function refreshWatchlistEvents(): Promise<RefreshResult[]> {
  const entries = listWatchlistEntries();
  const results: RefreshResult[] = [];

  for (const entry of entries) {
    try {
      let attractionId = entry.ticketmasterAttractionId;
      const justResolved = !attractionId;

      const match = await resolveAttraction(entry.artistName);
      if (match) {
        setWatchlistResolution(entry.artistName, match.id, match.upcomingEventsTotal);
        attractionId = match.id;
      }

      if (!attractionId) {
        results.push({ artistName: entry.artistName, status: "unresolved", eventCount: 0 });
        continue;
      }

      const rawEvents = await searchEvents({ attractionId, size: 50 });
      const records: EventRecord[] = rawEvents.map((raw) => mapEventToRecord(raw, "watchlist"));

      if (records.length > 0) {
        upsertEvents(records);
      }

      results.push({
        artistName: entry.artistName,
        status: records.length > 0 ? (justResolved ? "resolved-now" : "fetched") : "no-events",
        eventCount: records.length,
      });
    } catch (err) {
      results.push({
        artistName: entry.artistName,
        status: "error",
        eventCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
