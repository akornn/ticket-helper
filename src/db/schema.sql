CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_name TEXT NOT NULL UNIQUE,
  ticketmaster_attraction_id TEXT,
  -- Total upcoming events for the resolved attraction, per Ticketmaster's
  -- attraction lookup — a tour-scale proxy for the popularity signal.
  upcoming_events_total INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  venue_city TEXT,
  venue_capacity INTEGER,
  event_date TEXT NOT NULL,
  onsale_start TEXT,
  onsale_end TEXT,
  presale_start TEXT,
  presale_end TEXT,
  price_min REAL,
  price_max REAL,
  currency TEXT,
  -- Number of presale phases (fan club, Verified Fan, card-member, etc.) —
  -- a per-show demand-intensity proxy for the popularity signal.
  presale_phase_count INTEGER,
  -- Raw text from Ticketmaster's info/pleaseNote fields — the only place
  -- transfer/resale restrictions show up; scanned for restriction keywords.
  restriction_notes TEXT,
  ticketmaster_url TEXT NOT NULL,
  discovered_via TEXT NOT NULL CHECK (discovered_via IN ('watchlist', 'auto-discovery')),
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_event_date ON events (event_date);
CREATE INDEX IF NOT EXISTS idx_events_artist_name ON events (artist_name);

-- events.venue_capacity is left unpopulated (Ticketmaster doesn't expose it);
-- capacity is looked up from this table by (venue_name, venue_city) instead.
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_name TEXT NOT NULL,
  venue_city TEXT NOT NULL,
  capacity INTEGER,
  -- 'manual' (npm run venues -- set) or 'wikidata' (auto-fill). Null if capacity is still unknown.
  capacity_source TEXT,
  -- Set the first time auto-fill attempts this venue, whether or not it found
  -- a capacity — so a venue Wikidata doesn't have isn't re-queried every refresh.
  wikidata_checked_at TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (venue_name, venue_city)
);

CREATE TABLE IF NOT EXISTS price_comps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'seatgeek',
  median_resale_price REAL,
  lowest_resale_price REAL,
  face_value_estimate REAL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_comps_event_id ON price_comps (event_id);

CREATE TABLE IF NOT EXISTS scores (
  event_id TEXT PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  score REAL NOT NULL,
  resale_ratio_signal REAL,
  capacity_signal REAL,
  urgency_signal REAL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS presale_codes (
  event_id TEXT PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  code TEXT,
  source TEXT,
  saved_at TEXT
);
