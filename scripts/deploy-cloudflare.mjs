import { spawnSync } from "node:child_process";

const configPath = "dist/server/wrangler.json";
const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "deploy", "--config", configPath, "--keep-vars"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
