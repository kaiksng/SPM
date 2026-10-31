import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrl, assertDedicatedTarget, projectId } from "./integration-environment.mjs";

const database = "postgresql://postgres@127.0.0.1:55322/postgres";
test("accepts only the dedicated local target", () => {
  assert.doesNotThrow(() => assertDedicatedTarget(apiUrl, database, projectId));
});
for (const [label, api, db, project] of [
  ["hosted API", "https://example.supabase.co", database, projectId],
  ["development API", "http://127.0.0.1:54321", database, projectId],
  ["hosted database", apiUrl, "postgresql://postgres@example.com:55322/postgres", projectId],
  ["development database", apiUrl, database.replace("55322", "54322"), projectId],
  ["another Docker project", apiUrl, database, "connectsphere"],
  ["connection options", apiUrl, `${database}?host=example.com`, projectId],
  ["malformed database", apiUrl, "not-a-database-url", projectId],
]) {
  test(`rejects ${label} before any connection`, () => {
    assert.throws(() => assertDedicatedTarget(api, db, project), /target rejected/);
  });
}
