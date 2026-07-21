# ticket-helper

Decision-support tool for spotting concerts/events likely to have strong resale
value, so you know when and how urgently to buy. **Strictly manual purchasing —
this project never buys, checks out, or automates a purchase on your behalf.**

## Status

Built: Ticketmaster Discovery API client, the watchlist, venue-capacity
lookup table, the full scoring engine (capacity-vs-popularity, onsale
urgency, price tier, transferability, composite score), presale search
links + a place to save codes you find yourself, the web dashboard, and a
cron-friendly refresh entrypoint.

Not built yet: auto-discovery of trending/newly-announced tours (item 2 from
the original plan — the watchlist covers "artists I'm tracking," not
"artists I'm not tracking yet"). SeatGeek's client exists but is
catalog-only now (see Notes) — not wired into scoring.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `TICKETMASTER_API_KEY` — free key from https://developer.ticketmaster.com/
- `SEATGEEK_CLIENT_ID` / `SEATGEEK_CLIENT_SECRET` — free from https://seatgeek.com/build/api/access-info (catalog lookups only, see Notes)

## Everyday workflow

```bash
npm run watchlist -- add "Artist Name" ["optional notes"]   # seed artists you care about
npm run watchlist -- refresh                                # fetch/update events + auto-fill new venue capacities
npm run venues -- missing                                   # anything Wikidata couldn't find, for manual entry
npm run venues -- set "Venue Name" "City" <capacity>
npm run score                                                # ranked list, with each event's id
npm run presale -- links <eventId>                           # search links for that show
npm run presale -- set <eventId> <code> ["source"]           # save a code you found yourself
```

## Watchlist

```bash
npm run watchlist -- add "Artist Name" ["optional notes"]
npm run watchlist -- list
npm run watchlist -- remove "Artist Name"
npm run watchlist -- refresh
```

`add` resolves the artist to a specific Ticketmaster attraction id right away
(filters out tribute acts/cover bands) and captures their total upcoming-show
count (tour scale, used in scoring). `refresh` fetches current events for
every entry and always re-resolves the attraction so tour scale stays
current, not just to fill in a missing id.

## Venue capacity

```bash
npm run venues -- set "Venue Name" "City" <capacity> ["notes"]
npm run venues -- list
npm run venues -- missing
```

Ticketmaster doesn't expose venue capacity, so it's a table keyed by venue
name + city, filled in two ways:

- **Auto-fill (default)** — every `npm run watchlist -- refresh` (and
  `npm run refresh`) automatically looks up any newly-seen venue on
  Wikidata (property P1083, "capacity"), disambiguating generic names
  (e.g. "Armory") by preferring a search result whose description mentions
  the venue's city. Found or not, the attempt is recorded so an unlisted
  venue isn't re-queried every refresh — worst case it silently stays
  unknown, it never guesses a number.
- **Manual override** — `npm run venues -- set "Venue Name" "City" <capacity>
  ["notes"]` always takes precedence and is never touched by auto-fill.

`npm run venues -- missing` lists venues still without a capacity, flagging
whether Wikidata already checked (and came up empty — needs manual entry)
or hasn't been attempted yet. `npm run venues -- list` shows each venue's
source (`[manual]` or `[wikidata]`).

## Scoring

```bash
npm run score
```

Ranks every fetched event by a composite 0-100 score:

- **Capacity vs. popularity** (60% weight) — popularity is a Ticketmaster-only
  proxy (presale-phase count + the artist's total upcoming shows), scored
  against venue capacity: high popularity in a small room scores high, the
  same popularity in a stadium scores low.
- **Price tier** (40% weight) — cheap face value + a narrow min/max spread
  (promoter hasn't already skimmed demand via VIP/platinum tiers) signals
  more resale headroom.
- **Transferability** — a keyword scan over Ticketmaster's free-text event
  notes for restriction language (non-transferable, ID required, Verified
  Fan, etc.). A match zeroes the score outright; there's no structured field
  for this, so treat "likely-transferable" as a default, not a guarantee.
- **Onsale urgency** — shown per event but *not* part of the ranking, since
  it's about timing ("act now" vs "sale ended" vs "opens in N days"), not
  resale potential.

When capacity or price data is missing, the score gracefully falls back to
whichever signal is available rather than going blank — the `basis:` label
on each row shows how many signals actually backed it.

All weights/caps in `src/services/scoring.ts` are first-pass heuristics,
meant to be retuned once you've checked scores against real outcomes.

## Presale codes and search links

```bash
npm run presale -- links <eventId>
npm run presale -- set <eventId> <code> ["source"]
npm run presale -- list
```

There's no API for presale codes. `links` builds one-click search URLs
(official site, X/Twitter, Reddit) from the artist name — constructed
searches, not resolved lookups, since guessing an artist's actual domain or
subreddit is worse than a one-click search. `set` saves a code once you've
found one yourself. Event ids are printed under each row in `npm run score`.

## Dashboard

```bash
npm run dev      # auto-restarts on file changes
# or
npm run server   # plain run
```

Opens at `http://localhost:4310` (configurable via `PORT`). A single page:
watchlist chips at the top, then every fetched event ranked by composite
score, sortable by clicking any column header. Each row has Ticketmaster /
official-site / X / Reddit links and an inline form to save a presale code
directly from the browser (same `presale_codes` table the CLI uses — either
one stays in sync with the other). It's a static page hitting a small JSON
API (`GET /api/events`, `GET /api/watchlist`, `POST /api/presale/:eventId`)
backed by the same scoring logic as `npm run score`, so the two never drift
out of sync with each other.

## Scheduled refresh

```bash
npm run refresh
```

Refreshes every watchlist artist's events (same work as
`npm run watchlist -- refresh`) with cron-friendly behavior: timestamped
log lines, continues past a single artist's failure instead of aborting the
whole run (verified by forcing a real API failure — one bad artist reports
an error, the rest still complete), and exits with status 1 if anything
errored so cron/log-monitoring can flag it. Scores are computed on demand,
not cached, so this is the only step that needs to run on a schedule —
`npm run score` and the dashboard always reflect whatever's currently in
the database.

To run it automatically, add a crontab entry with absolute paths (cron's
`PATH` is minimal and won't find `node`/`npm` otherwise — find yours with
`which node` and `which npm`):

```bash
mkdir -p logs
crontab -e
```

```cron
# every 6 hours
0 */6 * * * cd /Users/oskarlukac/ticket-helper && /opt/homebrew/bin/npm run refresh >> logs/refresh.log 2>&1
```

The `cd` matters: `.env` and the SQLite database are both resolved relative
to the working directory, and cron doesn't run from your project folder by
default. Adjust the schedule to taste — presale windows can open with very
little notice, so if you're chasing a specific onsale, running it more
often (or just running `npm run refresh` by hand) makes sense.

## Notes

- Uses Node's built-in `node:sqlite` module (stable, no native build step) —
  requires Node >= 22.5.0.
- No automated resale pricing: SeatGeek's free API tier is catalog-only
  (events/performers/venues), and no legitimate free API exposes real-time
  resale pricing — that's restricted to paid business partnerships across
  SeatGeek, StubHub, VividSeats, and TickPick. This tool doesn't scrape
  those sites. Instead: the score flags promising shows using Ticketmaster
  data alone, `npm run presale -- links` gives one-click searches to
  spot-check real resale prices yourself, and `npm run presale -- set` (or
  the dashboard, once built) is where you log what you actually find —
  building your own price history over time, entirely within ToS since it's
  data you collected.
- `npm run typecheck` — type-check without emitting.
