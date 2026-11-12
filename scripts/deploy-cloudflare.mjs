import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const configPath = "dist/server/wrangler.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));
const database = config.d1_databases?.find((binding) => binding.binding === "DB" && binding.database_id);

function run(args) {
  const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (database) {
  console.log(`Applying D1 migrations to ${database.database_name}…`);
  run(["d1", "migrations", "apply", database.database_name, "--remote", "--config", configPath]);
} else {
  console.warn("COLES_D1_DATABASE_ID was not provided at build time; deploying without forecast history storage.");
}

run(["deploy", "--config", configPath, "--keep-vars"]);
