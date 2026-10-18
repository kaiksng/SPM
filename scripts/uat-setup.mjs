// Runs one UAT setup file against the database in SUPABASE_DB_URL (.env.local).
// Usage: pnpm uat:setup spm88_tc013
// See tests/uat_data/README.md. Never prints the connection string.
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });

const name = process.argv[2] ?? "";
if (!/^[a-z0-9]+_tc\d{3}$/.test(name)) {
  console.error("Give a case name like spm88_tc013 (see tests/uat_data/README.md).");
  process.exit(2);
}

const file = path.join(root, "tests", "uat_data", `${name}_setup.sql`);
if (!existsSync(file)) {
  console.error(`No setup file for ${name} in tests/uat_data/.`);
  process.exit(2);
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    "SUPABASE_DB_URL is not set. Add the Session pooler connection string to .env.local " +
      "at the repo root (see tests/uat_data/README.md, One-time setup).",
  );
  process.exit(2);
}

let host;
try {
  host = new URL(connectionString).hostname;
} catch {
  console.error("SUPABASE_DB_URL in .env.local is not a valid connection string.");
  process.exit(2);
}

const sql = readFileSync(file, "utf8");
const header = (label) =>
  sql.split("\n").find((line) => line.startsWith(`-- ${label}:`))?.slice(label.length + 4).trim() ?? "none";

console.log(`Case:        ${sql.split("\n")[0].replace(/^--\s*/, "")}`);
console.log(`Restores:    ${header("Records restored")}`);
console.log(`Removes:     ${header("Must-not-exist conditions enforced")}`);
console.log(`Database:    ${host}`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question("Continue? (y/N) ")).trim().toLowerCase();
rl.close();
if (answer !== "y") {
  console.log("Stopped. Nothing was changed.");
  process.exit(0);
}

const local = host === "localhost" || host === "127.0.0.1";
const client = new pg.Client({
  connectionString,
  ssl: local ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  // One call, so the file's BEGIN/COMMIT and any guard exception apply to all of it.
  await client.query(sql);
  console.log(`Done: ${name} starting state restored`);
} catch (error) {
  console.error(`Setup failed, nothing was changed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
