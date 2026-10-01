import cors from "cors";
import express from "express";

import { errorHandler } from "./middleware/error-handler";
<<<<<<< Updated upstream
=======
import { eventClarificationsRouter } from "./routes/event-clarifications.route";
import { eventDecisionsRouter } from "./routes/event-decisions.route";
import { eventReassignmentRouter } from "./routes/event-reassignment.route";
import { eventSubmissionsRouter } from "./routes/event-submissions.route";
>>>>>>> Stashed changes
import { healthRouter } from "./routes/health.route";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.use("/health", healthRouter);
<<<<<<< Updated upstream
=======
  app.use("/events", eventSubmissionsRouter);
  app.use(eventClarificationsRouter);
  app.use(eventDecisionsRouter);
  app.use(eventReassignmentRouter);
  app.use(venueBookingDecisionsRouter);
  app.use(venueSuggestionsRouter);
>>>>>>> Stashed changes

  app.use(errorHandler);

  return app;
}
