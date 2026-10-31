import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const projectId = `connectsphere-integration-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`;
export const runtime = path.join(root, ".integration-runtime");
export const apiUrl = "http://127.0.0.1:55321";

// Exact destinations, not just "localhost": the normal development stack
// must be protected too. Never accept a caller-supplied reset destination.
export function assertDedicatedTarget(api, database, project) {
  if (api !== apiUrl || project !== projectId) {
    throw new Error("Integration target rejected: expected the dedicated test project and API.");
  }
  let url;
  try { url = new URL(database); }
  catch { throw new Error("Integration target rejected: invalid test database URL."); }
  if (
    url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
    url.port !== "55322" || url.pathname !== "/postgres" ||
    url.username !== "postgres" || url.search || url.hash
  ) {
    throw new Error("Integration target rejected: expected the dedicated test database.");
  }
}

export function testConfig() {
  return `project_id = "${projectId}"
[api]
enabled = true
port = 55321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55322
shadow_port = 55320
major_version = 17
[db.migrations]
enabled = true
[db.seed]
enabled = false
sql_paths = []
[db.pooler]
enabled = false
port = 55329
[studio]
enabled = false
[realtime]
enabled = false
[local_smtp]
enabled = true
port = 55324
[storage]
enabled = true
[auth]
enabled = true
site_url = "http://127.0.0.1:55321"
enable_signup = true
minimum_password_length = 8
[auth.email]
enable_signup = true
enable_confirmations = false
[auth.rate_limit]
sign_in_sign_ups = 1000
token_refresh = 1000
[analytics]
enabled = false
port = 55327
[edge_runtime]
enabled = false
inspector_port = 8183
`;
}
