import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

vi.mock("../lib/supabase-service-client", () => ({
  getServiceClient: () => ({ auth: { getUser: getUserMock } }),
}));

const { requireAuth } = await import("./auth");
const { errorHandler } = await import("./error-handler");

const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";

// A protected route behind requireAuth, with the app's real error handler,
// so a rejected request gets the same response every backend route gives.
function protectedApp() {
  const app = express();
  const handler = vi.fn((req: express.Request, res: express.Response) => {
    res.json({ userId: req.userId });
  });
  app.get("/protected", requireAuth, handler);
  app.use(errorHandler);
  return { app, handler };
}

beforeEach(() => {
  getUserMock.mockReset();
});

// SPM-13 AC03: an unauthenticated user cannot use any protected action.
describe("requireAuth", () => {
  it("SPM-13 AC03: rejects a request with no token without asking Supabase", async () => {
    const { app, handler } = protectedApp();

    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("You must sign in to continue");
    expect(getUserMock).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a header that is not a Bearer token", async () => {
    const { app, handler } = protectedApp();

    const response = await request(app).get("/protected").set("Authorization", "Basic dXNlcjpwYXNz");

    expect(response.status).toBe(401);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("SPM-13 AC03: rejects an expired or invalid token that Supabase does not accept", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT: token is expired" } });
    const { app, handler } = protectedApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer expired-token");

    expect(getUserMock).toHaveBeenCalledWith("expired-token");
    expect(response.status).toBe(401);
    // The caller gets the generic message, never Supabase's own reason.
    expect(response.body.error).toBe("You must sign in to continue");
    expect(JSON.stringify(response.body)).not.toContain("expired");
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a token for which Supabase returns no user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { app, handler } = protectedApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer orphan-token");

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets a request with a valid token through, as that user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    const { app, handler } = protectedApp();

    const response = await request(app).get("/protected").set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: USER_ID });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
