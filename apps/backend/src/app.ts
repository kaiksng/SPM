import cors from "cors";
import express from "express";

import { errorHandler } from "./middleware/error-handler";
import { eventSubmissionsRouter } from "./routes/event-submissions.route";
import { healthRouter } from "./routes/health.route";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/events", eventSubmissionsRouter);

  app.use(errorHandler);

  return app;
}
