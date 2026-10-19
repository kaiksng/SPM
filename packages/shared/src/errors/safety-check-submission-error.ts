import type { ReadinessOutstandingItem } from "../domain/readiness";

/**
 * Thrown when a safety-check submission is rejected because the event is not
 * Ready (AC05). Unlike EventSubmissionError this isn't keyed by form field —
 * outstandingItems are checklist line items (a venue booking, an equipment
 * requirement), each with its own code and message.
 */
export class SafetyCheckSubmissionError extends Error {
  constructor(
    message: string,
    public readonly outstandingItems?: ReadinessOutstandingItem[],
  ) {
    super(message);
    this.name = "SafetyCheckSubmissionError";
  }
}
