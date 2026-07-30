import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  engines: { node: string };
};
const requiredNode = packageJson.engines.node;
const actualNode = process.versions.node;

if (actualNode !== requiredNode) {
  console.error(`Node ${requiredNode} is required; found ${actualNode}.`);
  process.exit(1);
}

console.log(`Node ${actualNode}`);
