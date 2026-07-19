import { listEvents } from "../db/events.js";
import { getVenueCapacity } from "../db/venues.js";
import { getWatchlistEntryByName } from "../db/watchlist.js";
import { getPresaleCode } from "../db/presaleCodes.js";
import { buildPresaleSearchLinks, type PresaleSearchLinks } from "./links.js";
import {
  computeCapacityVsPopularitySignal,
  computeOnsaleUrgency,
  computePriceTierSignal,
  computeTransferability,
  computeCompositeScore,
  type CapacityVsPopularityResult,
  type UrgencyResult,
  type PriceTierResult,
  type TransferabilityResult,
  type CompositeScoreResult,
} from "./scoring.js";
import type { EventRecord, PresaleCode } from "../types/index.js";

export interface ScoredEvent {
  event: EventRecord;
  capacityVsPopularity: CapacityVsPopularityResult;
  urgency: UrgencyResult;
  priceTier: PriceTierResult;
  transferability: TransferabilityResult;
  composite: CompositeScoreResult;
  presaleCode: PresaleCode | null;
  searchLinks: PresaleSearchLinks;
}

/** Computes every signal for one event — the single source of truth shared by the CLI and the dashboard server. */
export function scoreEvent(event: EventRecord): ScoredEvent {
  const capacity = getVenueCapacity(event.venueName, event.venueCity);
  const upcomingEventsTotal = getWatchlistEntryByName(event.artistName)?.upcomingEventsTotal ?? null;

  const capacityVsPopularity = computeCapacityVsPopularitySignal({
    capacity,
    presalePhaseCount: event.presalePhaseCount,
    upcomingEventsTotal,
  });
  const urgency = computeOnsaleUrgency({
    presaleStart: event.presaleStart,
    presaleEnd: event.presaleEnd,
    onsaleStart: event.onsaleStart,
    onsaleEnd: event.onsaleEnd,
  });
  const priceTier = computePriceTierSignal({
    priceMin: event.priceMin,
    priceMax: event.priceMax,
  });
  const transferability = computeTransferability(event.restrictionNotes);
  const composite = computeCompositeScore({ capacityVsPopularity, priceTier, transferability });

  return {
    event,
    capacityVsPopularity,
    urgency,
    priceTier,
    transferability,
    composite,
    presaleCode: getPresaleCode(event.id),
    searchLinks: buildPresaleSearchLinks(event.artistName),
  };
}

/** All fetched events, scored and sorted by composite score descending (unscored/null last). */
export function scoreAllEvents(): ScoredEvent[] {
  return listEvents()
    .map(scoreEvent)
    .sort((a, b) => (b.composite.score ?? -1) - (a.composite.score ?? -1));
}
