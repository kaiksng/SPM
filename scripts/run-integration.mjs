import { spawn } from "node:child_process";
import { cp, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { apiUrl, assertDedicatedTarget, projectId, root, runtime, testConfig } from "./integration-environment.mjs";

const args = process.argv.slice(2);
if (Number(process.versions.node.split(".")[0]) !== 24) {
  throw new Error("Integration tests require Node 24, matching .nvmrc. Select Node 24 before running pnpm.");
}
if (args.some((arg) => !["--database", "--failure-probe"].includes(arg)) || args.length > 1) {
  throw new Error("Use no arguments, --database, or --failure-probe.");
}
// Do not inherit any application's hosted connection settings or dotenv file.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(SUPABASE_|VITE_|PG|DATABASE_URL$|INTEGRATION_)/.test(key),
));
env.TZ = "Asia/Singapore";
let runningChild;
// Reject the active operation, then let finally stop the dedicated stack.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { runningChild?.kill("SIGTERM"); });
}

async function command(commandArgs, { capture = false, extraEnv = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", commandArgs, {
      cwd: root, env: { ...env, ...extraEnv },
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    runningChild = child;
    let output = "";
    let errors = "";
    child.stdout?.on("data", (data) => { output += data; });
    child.stderr?.on("data", (data) => { errors += data; });
    child.on("error", reject);
    child.on("close", (code) => {
      runningChild = undefined;
      if (code === 0) resolve(output);
      else {
        // Supabase start/status can print keys. Show SQL diagnostics only.
        const diagnostics = `${output}\n${errors}`.split("\n")
          .filter((line) => /error|failed|SQLSTATE|At statement|Try rerunning/i.test(line))
          .map((line) => line.replace(/eyJ[A-Za-z0-9_.-]+|sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted]"))
          .join("\n");
        reject(new Error(`${commandArgs.slice(0, 4).join(" ")} failed (${code}). ${diagnostics}`));
      }
    });
  });
}

const cli = (...args) => command(["exec", "supabase", "--workdir", runtime, ...args], { capture: true });
async function requireFreePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`Test port ${port} is occupied; no database has been reset. Stop the conflicting service first.`)));
    server.listen(port, "0.0.0.0", () => server.close(resolve));
  });
}

await mkdir(runtime, { recursive: true });
// A failed exclusive open must never remove another run's lock.
const lock = await open(path.join(runtime, "run.lock"), "wx");
let started = false;
try {
  await command(["exec", "node", "--test", "scripts/integration-environment.test.mjs"]);
  for (const port of [55320, 55321, 55322, 55324, 55398]) await requireFreePort(port);
  const config = testConfig();
  const sourceConfig = await readFile(path.join(root, "supabase/config.toml"), "utf8");
  if (!sourceConfig.includes("major_version = 17")) throw new Error("Update the integration Postgres version to match the source config first.");
  await rm(path.join(runtime, "supabase"), { recursive: true, force: true });
  await mkdir(path.join(runtime, "supabase"), { recursive: true });
  await writeFile(path.join(runtime, "supabase/config.toml"), config);
  await cp(path.join(root, "supabase/migrations"), path.join(runtime, "supabase/migrations"), { recursive: true });
  await cp(path.join(root, "supabase/tests"), path.join(runtime, "supabase/tests"), { recursive: true });
  assertDedicatedTarget(apiUrl, "postgresql://postgres@127.0.0.1:55322/postgres", projectId);
  console.log(`Starting disposable ${projectId} (API 55321, Postgres 55322).`);
  started = true;
  await cli("start");
  const status = JSON.parse(await cli("status", "-o", "json"));
  assertDedicatedTarget(status.API_URL, status.DB_URL, projectId);
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("Dedicated stack returned no test credentials.");
  console.log("Resetting only the dedicated integration database to current migrations.");
  await cli("db", "reset", "--local", "--no-seed");
  if (args.includes("--database")) {
    process.stdout.write(await cli("test", "db"));
  } else {
    await command(["exec", "vitest", "run", "--config", "vitest.integration.config.ts"], {
      extraEnv: {
        VITE_SUPABASE_URL: status.API_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
        // Test-only backend listener; never use the normal dev server.
        VITE_BACKEND_URL: "http://127.0.0.1:55398",
        SUPABASE_URL: status.API_URL,
        SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
        INTEGRATION_PROJECT_ID: projectId,
        INTEGRATION_DATABASE_URL: status.DB_URL,
        INTEGRATION_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
        INTEGRATION_FAILURE_PROBE: args.includes("--failure-probe") ? "1" : "0",
      },
    });
  }
} finally {
  try {
    if (started) {
      console.log("Removing only the disposable integration containers and volumes.");
      await cli("stop", "--no-backup");
    }
  } finally {
    await lock.close();
    await rm(path.join(runtime, "run.lock"), { force: true });
  }
}
