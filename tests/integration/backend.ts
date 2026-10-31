import { createApp } from "../../apps/backend/src/app";

/** Real Express application; no index.ts, dotenv files or normal dev server. */
export async function startIntegrationBackend() {
  if (
    process.env.SUPABASE_URL !== process.env.VITE_SUPABASE_URL ||
    !process.env.INTEGRATION_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY !== process.env.INTEGRATION_SERVICE_ROLE_KEY
  ) {
    throw new Error("Integration backend must use the dedicated local stack's credentials.");
  }
  const server = createApp().listen(55398, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections();
    });
  };
}
