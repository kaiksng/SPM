import cors from "cors";
import express from "express";

import { errorHandler } from "./middleware/error-handler";
import { eventClarificationsRouter } from "./routes/event-clarifications.route";
import { eventDecisionsRouter } from "./routes/event-decisions.route";
import { eventSubmissionsRouter } from "./routes/event-submissions.route";
import { healthRouter } from "./routes/health.route";
import { venueBookingDecisionsRouter } from "./routes/venue-booking-decisions.route";
import { venueSuggestionsRouter } from "./routes/venue-suggestions.route";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/events", eventSubmissionsRouter);
  app.use(eventClarificationsRouter);
  app.use(eventDecisionsRouter);
  app.use(venueBookingDecisionsRouter);
  app.use(venueSuggestionsRouter);

  app.use(errorHandler);

  return app;
}
