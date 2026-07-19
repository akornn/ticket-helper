import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { env } from "../config/env.js";
import { scoreAllEvents, type ScoredEvent } from "../services/rank.js";
import { getWatchlist } from "../services/watchlist.js";
import { setPresaleCode } from "../db/presaleCodes.js";
import { getEventById } from "../db/events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function toApiEvent(scored: ScoredEvent) {
  const { event, capacityVsPopularity, urgency, priceTier, transferability, composite, presaleCode, searchLinks } =
    scored;

  return {
    id: event.id,
    name: event.name,
    artistName: event.artistName,
    venueName: event.venueName,
    venueCity: event.venueCity,
    eventDate: event.eventDate,
    onsaleStart: event.onsaleStart,
    presaleStart: event.presaleStart,
    priceMin: event.priceMin,
    priceMax: event.priceMax,
    currency: event.currency,
    ticketmasterUrl: event.ticketmasterUrl,
    score: composite.score,
    basis: composite.basis,
    capacityVsPopularity: capacityVsPopularity.signal,
    capacity: capacityVsPopularity.capacity,
    priceTierSignal: priceTier.signal,
    urgencyStatus: urgency.status,
    urgencyDaysUntil: urgency.daysUntilNextWindow,
    restricted: transferability.status === "restricted",
    restrictedMatch: transferability.matchedPhrase,
    presaleCode: presaleCode?.code ?? null,
    presaleSource: presaleCode?.source ?? null,
    searchLinks,
  };
}

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

app.get("/api/events", (_req, res) => {
  res.json(scoreAllEvents().map(toApiEvent));
});

app.get("/api/watchlist", (_req, res) => {
  res.json(getWatchlist());
});

app.post("/api/presale/:eventId", (req, res) => {
  const { eventId } = req.params;
  const { code, source } = req.body ?? {};

  if (!getEventById(eventId)) {
    res.status(404).json({ error: `No event found with id "${eventId}"` });
    return;
  }
  if (typeof code !== "string" || code.trim() === "") {
    res.status(400).json({ error: "code is required" });
    return;
  }

  const saved = setPresaleCode(eventId, code.trim(), typeof source === "string" && source.trim() ? source.trim() : null);
  res.json(saved);
});

app.listen(env.port, () => {
  console.log(`Ticket Helper dashboard running at http://localhost:${env.port}`);
});
