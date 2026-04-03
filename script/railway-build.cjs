const fs = require("fs");
const { execSync } = require("child_process");

// On Railway, dist/ is already committed — skip the full tsx build
// which deletes dist/ and rebuilds (can fail due to memory/deps).
// Locally or in other CI, fall through to the real build.
if (fs.existsSync("dist/index.cjs")) {
  console.log("dist/index.cjs exists — skipping build (using pre-built bundle)");
  process.exit(0);
}

console.log("dist not found — running full build...");
execSync("npx tsx script/build.ts", { stdio: "inherit" });
