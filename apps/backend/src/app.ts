import cors from "cors";
import express from "express";

import { errorHandler } from "./middleware/error-handler";
import { eventCancellationRouter } from "./routes/event-cancellation.route";
import { eventChangeRequestsRouter } from "./routes/event-change-requests.route";
import { eventClarificationsRouter } from "./routes/event-clarifications.route";
import { eventDecisionsRouter } from "./routes/event-decisions.route";
import { eventRegistrationsRouter } from "./routes/event-registrations.route";
import { eventSafetyCheckRouter } from "./routes/event-safety-check.route";
import { eventSubmissionsRouter } from "./routes/event-submissions.route";
import { healthRouter } from "./routes/health.route";
import { venueBookingDecisionsRouter } from "./routes/venue-booking-decisions.route";
import { venueBookingHoldRouter } from "./routes/venue-booking-hold.route";
import { venueBookingSubmissionsRouter } from "./routes/venue-booking-submissions.route";
import { venueManagementRouter } from "./routes/venue-management.route";
import { venueSuggestionsRouter } from "./routes/venue-suggestions.route";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/events", eventSubmissionsRouter);
  app.use("/events", eventSafetyCheckRouter);
  app.use(eventCancellationRouter);
  app.use(eventChangeRequestsRouter);
  app.use(eventClarificationsRouter);
  app.use(eventDecisionsRouter);
  app.use(eventRegistrationsRouter);
  app.use(venueBookingDecisionsRouter);
  app.use(venueBookingHoldRouter);
  app.use(venueBookingSubmissionsRouter);
  app.use(venueManagementRouter);
  app.use(venueSuggestionsRouter);

  app.use(errorHandler);

  return app;
}
