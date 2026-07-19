import { scoreAllEvents, type ScoredEvent } from "../services/rank.js";
import type { UrgencyResult } from "../services/scoring.js";

function formatUrgency(u: UrgencyResult): string {
  switch (u.status) {
    case "on-sale-now":
      return "on sale NOW (opened recently)";
    case "on-sale-open":
      return "on sale (open a while)";
    case "upcoming":
      return `opens in ${u.daysUntilNextWindow}d (urgency ${u.urgency})`;
    case "sale-ended":
      return "sale ended";
    case "unknown":
      return "onsale date unknown";
  }
}

function formatBasis(basis: string[]): string {
  if (basis.length === 0) return "no signal";
  if (basis.length === 1) return `${basis[0]} only`;
  return basis.join(" + ");
}

function printRow({ event, capacityVsPopularity, urgency, priceTier, transferability, composite }: ScoredEvent) {
  const date = event.eventDate.slice(0, 10);
  const where = `${event.venueName}, ${event.venueCity}`;
  const urgencyStr = formatUrgency(urgency);
  const priceStr = priceTier.signal === null ? "price unknown" : `price tier ${priceTier.signal}`;
  const capacityStr =
    capacityVsPopularity.signal === null ? "capacity unknown" : `capacity-vs-pop ${capacityVsPopularity.signal}`;
  const restrictedTag =
    transferability.status === "restricted"
      ? `  ⚠ RESTRICTED (matched "${transferability.matchedPhrase}" — verify manually)`
      : "";
  const scoreLabel = composite.score === null ? "??" : String(composite.score).padStart(3, " ");

  console.log(
    `- [${scoreLabel}]  ${date}  ${event.artistName} @ ${where}` +
      `  (${capacityStr}, ${priceStr}, basis: ${formatBasis(composite.basis)})` +
      `  [${urgencyStr}]${restrictedTag}` +
      `\n         id: ${event.id}  (npm run presale -- links ${event.id})`,
  );
}

/**
 * Ranks fetched events by the composite resale-quality score (capacity-vs-
 * popularity + price tier, gated to 0 by transferability restrictions).
 * Onsale urgency is shown alongside but deliberately excluded from the
 * ranking — see computeCompositeScore for why.
 * Usage: npm run score
 */
function main() {
  const scored = scoreAllEvents();
  if (scored.length === 0) {
    console.log("No events in the database yet — run a fetch first (e.g. npm run watchlist -- refresh).");
    return;
  }

  console.log(`Scored ${scored.length} event(s):\n`);
  scored.forEach(printRow);
}

main();
