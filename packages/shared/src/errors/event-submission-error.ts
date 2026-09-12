/**
 * Thrown when an event request submission is rejected, whether by local zod
 * validation or by the backend (PB-03 AC06). `fieldErrors` mirrors the shape
 * EventRequestForm already uses for local validation failures — path.join(".")
 * -> message — so a server-side rejection highlights fields the same way a
 * local one does.
 */
export class EventSubmissionError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "EventSubmissionError";
  }
}
