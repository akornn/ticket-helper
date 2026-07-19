import type { SQLInputValue } from "node:sqlite";
import { getDb } from "./client.js";
import type { PresaleCode } from "../types/index.js";

function mapRow(row: Record<string, unknown>): PresaleCode {
  return {
    eventId: row.event_id as string,
    code: row.code as string | null,
    source: row.source as string | null,
    savedAt: row.saved_at as string | null,
  };
}

export function setPresaleCode(eventId: string, code: string, source: string | null = null): PresaleCode {
  getDb()
    .prepare(
      `INSERT INTO presale_codes (event_id, code, source, saved_at)
       VALUES (@eventId, @code, @source, datetime('now'))
       ON CONFLICT (event_id) DO UPDATE SET
         code = excluded.code, source = excluded.source, saved_at = excluded.saved_at`,
    )
    .run({ eventId, code, source } satisfies Record<string, SQLInputValue>);

  return getPresaleCode(eventId)!;
}

export function getPresaleCode(eventId: string): PresaleCode | null {
  const row = getDb()
    .prepare(`SELECT * FROM presale_codes WHERE event_id = @eventId`)
    .get({ eventId } satisfies Record<string, SQLInputValue>) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export function listPresaleCodes(): PresaleCode[] {
  const rows = getDb().prepare(`SELECT * FROM presale_codes ORDER BY saved_at DESC`).all() as Record<
    string,
    unknown
  >[];
  return rows.map(mapRow);
}
