import type { SQLInputValue } from "node:sqlite";
import { getDb } from "./client.js";
import type { WatchlistEntry } from "../types/index.js";

function mapRow(row: Record<string, unknown>): WatchlistEntry {
  return {
    id: row.id as number,
    artistName: row.artist_name as string,
    ticketmasterAttractionId: row.ticketmaster_attraction_id as string | null,
    upcomingEventsTotal: row.upcoming_events_total as number | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
  };
}

export function addWatchlistEntry(artistName: string, notes: string | null = null): WatchlistEntry {
  const db = getDb();
  db.prepare(
    `INSERT INTO watchlist (artist_name, notes) VALUES (@artistName, @notes)
     ON CONFLICT (artist_name) DO UPDATE SET notes = excluded.notes`,
  ).run({ artistName, notes } satisfies Record<string, SQLInputValue>);

  return getWatchlistEntryByName(artistName)!;
}

export function setWatchlistResolution(
  artistName: string,
  attractionId: string,
  upcomingEventsTotal: number | null,
): void {
  getDb()
    .prepare(
      `UPDATE watchlist
       SET ticketmaster_attraction_id = @attractionId, upcoming_events_total = @upcomingEventsTotal
       WHERE artist_name = @artistName`,
    )
    .run({ attractionId, upcomingEventsTotal, artistName } satisfies Record<string, SQLInputValue>);
}

export function removeWatchlistEntry(artistName: string): boolean {
  const result = getDb()
    .prepare(`DELETE FROM watchlist WHERE artist_name = @artistName`)
    .run({ artistName } satisfies Record<string, SQLInputValue>);
  return Number(result.changes) > 0;
}

export function listWatchlistEntries(): WatchlistEntry[] {
  const rows = getDb().prepare(`SELECT * FROM watchlist ORDER BY artist_name ASC`).all() as Record<
    string,
    unknown
  >[];
  return rows.map(mapRow);
}

export function getWatchlistEntryByName(artistName: string): WatchlistEntry | null {
  const row = getDb()
    .prepare(`SELECT * FROM watchlist WHERE artist_name = @artistName`)
    .get({ artistName } satisfies Record<string, SQLInputValue>) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}
