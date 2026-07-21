import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;

  mkdirSync(dirname(env.dbPath), { recursive: true });
  db = new DatabaseSync(env.dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  const schema = readFileSync(`${__dirname}/schema.sql`, "utf-8");
  db.exec(schema);

  // CREATE TABLE IF NOT EXISTS won't add new columns to an already-existing
  // table, so newly introduced columns get backfilled here instead.
  ensureColumn(db, "events", "presale_phase_count", "INTEGER");
  ensureColumn(db, "events", "restriction_notes", "TEXT");
  ensureColumn(db, "watchlist", "upcoming_events_total", "INTEGER");
  ensureColumn(db, "venues", "capacity_source", "TEXT");
  ensureColumn(db, "venues", "wikidata_checked_at", "TEXT");

  return db;
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
