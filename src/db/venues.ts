import type { SQLInputValue } from "node:sqlite";
import { getDb } from "./client.js";
import type { VenueRecord } from "../types/index.js";

function mapRow(row: Record<string, unknown>): VenueRecord {
  return {
    id: row.id as number,
    venueName: row.venue_name as string,
    venueCity: row.venue_city as string,
    capacity: row.capacity as number | null,
    capacitySource: row.capacity_source as "manual" | "wikidata" | null,
    wikidataCheckedAt: row.wikidata_checked_at as string | null,
    notes: row.notes as string | null,
    updatedAt: row.updated_at as string,
  };
}

export function setVenueCapacity(
  venueName: string,
  venueCity: string,
  capacity: number,
  notes: string | null = null,
): VenueRecord {
  getDb()
    .prepare(
      `INSERT INTO venues (venue_name, venue_city, capacity, capacity_source, notes, updated_at)
       VALUES (@venueName, @venueCity, @capacity, 'manual', @notes, datetime('now'))
       ON CONFLICT (venue_name, venue_city) DO UPDATE SET
         capacity = excluded.capacity,
         capacity_source = excluded.capacity_source,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
    )
    .run({ venueName, venueCity, capacity, notes } satisfies Record<string, SQLInputValue>);

  return getVenue(venueName, venueCity)!;
}

/** Records a Wikidata auto-fill attempt — whether or not it found a capacity — so it isn't retried every refresh. */
export function recordWikidataAttempt(
  venueName: string,
  venueCity: string,
  capacity: number | null,
  matchedLabel: string | null,
): VenueRecord {
  const notes = capacity !== null && matchedLabel ? `Wikidata: ${matchedLabel}` : null;

  getDb()
    .prepare(
      `INSERT INTO venues (venue_name, venue_city, capacity, capacity_source, notes, wikidata_checked_at, updated_at)
       VALUES (@venueName, @venueCity, @capacity, @capacitySource, @notes, datetime('now'), datetime('now'))
       ON CONFLICT (venue_name, venue_city) DO UPDATE SET
         capacity = excluded.capacity,
         capacity_source = excluded.capacity_source,
         notes = excluded.notes,
         wikidata_checked_at = excluded.wikidata_checked_at,
         updated_at = excluded.updated_at`,
    )
    .run({
      venueName,
      venueCity,
      capacity,
      capacitySource: capacity !== null ? "wikidata" : null,
      notes,
    } satisfies Record<string, SQLInputValue>);

  return getVenue(venueName, venueCity)!;
}

export function getVenue(venueName: string, venueCity: string): VenueRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM venues WHERE venue_name = @venueName AND venue_city = @venueCity`)
    .get({ venueName, venueCity } satisfies Record<string, SQLInputValue>) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRow(row) : null;
}

export function getVenueCapacity(venueName: string, venueCity: string): number | null {
  return getVenue(venueName, venueCity)?.capacity ?? null;
}

export function listVenues(): VenueRecord[] {
  const rows = getDb().prepare(`SELECT * FROM venues ORDER BY venue_city ASC, venue_name ASC`).all() as Record<
    string,
    unknown
  >[];
  return rows.map(mapRow);
}

export interface UnknownVenue {
  venueName: string;
  venueCity: string;
  eventCount: number;
  wikidataChecked: boolean;
}

/** Venues seen in fetched events that have no capacity on file yet — includes ones Wikidata already checked and came up empty. */
export function listUnknownVenues(): UnknownVenue[] {
  const rows = getDb()
    .prepare(
      `SELECT e.venue_name AS venueName, e.venue_city AS venueCity, COUNT(*) AS eventCount,
              MAX(v.wikidata_checked_at IS NOT NULL) AS wikidataChecked
       FROM events e
       LEFT JOIN venues v ON v.venue_name = e.venue_name AND v.venue_city = e.venue_city
       WHERE v.capacity IS NULL
       GROUP BY e.venue_name, e.venue_city
       ORDER BY eventCount DESC`,
    )
    .all() as Record<string, unknown>[];

  return rows.map((row) => ({
    venueName: row.venueName as string,
    venueCity: row.venueCity as string,
    eventCount: Number(row.eventCount),
    wikidataChecked: Boolean(row.wikidataChecked),
  }));
}

export interface NewVenue {
  venueName: string;
  venueCity: string;
}

/** Venues seen in fetched events with no row in the venues table at all yet — never attempted, manually or via Wikidata. */
export function listNewVenues(): NewVenue[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT e.venue_name AS venueName, e.venue_city AS venueCity
       FROM events e
       LEFT JOIN venues v ON v.venue_name = e.venue_name AND v.venue_city = e.venue_city
       WHERE v.id IS NULL`,
    )
    .all() as Record<string, unknown>[];

  return rows.map((row) => ({
    venueName: row.venueName as string,
    venueCity: row.venueCity as string,
  }));
}
