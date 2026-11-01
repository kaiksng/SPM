import { createServer, type Server } from "node:http";
import { afterAll, beforeAll } from "vitest";

/**
 * One loopback server for a whole route test file. `request(createApp())`
 * opens and closes a new server for every request; under load (Docker, a
 * busy laptop, CI) that churn showed up as 5s timeouts, `socket hang up` and
 * `Parse Error`. Call at the top of a file, after `createApp` is imported,
 * and pass the returned getter to supertest: `request(server())`.
 */
export function useAppServer(createApp: () => Parameters<typeof createServer>[1]) {
  let server: Server;

  beforeAll(async () => {
    server = createServer(createApp());
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeIdleConnections();
    });
  });

  return () => server;
}
