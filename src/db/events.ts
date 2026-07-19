import type { SQLInputValue } from "node:sqlite";
import { getDb } from "./client.js";
import type { EventRecord } from "../types/index.js";

function toSqlParams(record: EventRecord): Record<string, SQLInputValue> {
  return record as unknown as Record<string, SQLInputValue>;
}

const UPSERT_SQL = `
  INSERT INTO events (
    id, name, artist_name, venue_name, venue_city, venue_capacity,
    event_date, onsale_start, onsale_end, presale_start, presale_end,
    price_min, price_max, currency, presale_phase_count, restriction_notes,
    ticketmaster_url, discovered_via, fetched_at
  ) VALUES (
    @id, @name, @artistName, @venueName, @venueCity, @venueCapacity,
    @eventDate, @onsaleStart, @onsaleEnd, @presaleStart, @presaleEnd,
    @priceMin, @priceMax, @currency, @presalePhaseCount, @restrictionNotes,
    @ticketmasterUrl, @discoveredVia, @fetchedAt
  )
  ON CONFLICT (id) DO UPDATE SET
    name = excluded.name,
    artist_name = excluded.artist_name,
    venue_name = excluded.venue_name,
    venue_city = excluded.venue_city,
    event_date = excluded.event_date,
    onsale_start = excluded.onsale_start,
    onsale_end = excluded.onsale_end,
    presale_start = excluded.presale_start,
    presale_end = excluded.presale_end,
    price_min = excluded.price_min,
    price_max = excluded.price_max,
    currency = excluded.currency,
    presale_phase_count = excluded.presale_phase_count,
    restriction_notes = excluded.restriction_notes,
    ticketmaster_url = excluded.ticketmaster_url,
    fetched_at = excluded.fetched_at;
`;

export function upsertEvent(record: EventRecord): void {
  getDb().prepare(UPSERT_SQL).run(toSqlParams(record));
}

export function upsertEvents(records: EventRecord[]): void {
  const db = getDb();
  const stmt = db.prepare(UPSERT_SQL);
  db.exec("BEGIN");
  try {
    for (const row of records) stmt.run(toSqlParams(row));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function mapRow(row: Record<string, unknown>): EventRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    artistName: row.artist_name as string,
    venueName: row.venue_name as string,
    venueCity: row.venue_city as string,
    venueCapacity: row.venue_capacity as number | null,
    eventDate: row.event_date as string,
    onsaleStart: row.onsale_start as string | null,
    onsaleEnd: row.onsale_end as string | null,
    presaleStart: row.presale_start as string | null,
    presaleEnd: row.presale_end as string | null,
    priceMin: row.price_min as number | null,
    priceMax: row.price_max as number | null,
    currency: row.currency as string | null,
    presalePhaseCount: row.presale_phase_count as number | null,
    restrictionNotes: row.restriction_notes as string | null,
    ticketmasterUrl: row.ticketmaster_url as string,
    discoveredVia: row.discovered_via as "watchlist" | "auto-discovery",
    fetchedAt: row.fetched_at as string,
  };
}

export function listEvents(): EventRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM events ORDER BY event_date ASC")
    .all() as Record<string, unknown>[];
  return rows.map(mapRow);
}

export function getEventById(id: string): EventRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM events WHERE id = @id")
    .get({ id } satisfies Record<string, SQLInputValue>) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}
