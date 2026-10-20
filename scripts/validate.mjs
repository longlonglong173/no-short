import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

function readJson(relativePath) {
  const absolutePath = resolve(root, relativePath);

  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath}: file is missing`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON (${error.message})`);
    return null;
  }
}

function expect(condition, message) {
  if (!condition) errors.push(message);
}

const portable = readJson("plugin.json");
const codexMarketplace = readJson(".agents/plugins/marketplace.json");
const packageJson = readJson("package.json");
const mcp = readJson("mcp.json");
const usagePackage = readJson("packages/usage/runtime-manifest.json");
const usageSourcePackage = readJson("packages/usage/package.json");

const manifests = [
  ["plugin.json", portable],
  ["package.json", packageJson]
];

for (const [path, manifest] of manifests) {
  if (!manifest) continue;
  expect(manifest.name === "no-short", `${path}: name must be "no-short"`);
  expect(
    typeof manifest.version === "string" && /^\d+\.\d+\.\d+$/.test(manifest.version),
    `${path}: version must use x.y.z semantic versioning`
  );
  expect(
    typeof manifest.description === "string" && manifest.description.trim().length > 0,
    `${path}: description must not be empty`
  );
}

if (portable && packageJson) {
  for (const field of ["name", "version", "description"]) {
    const values = new Set([
      portable[field],
      packageJson[field]
    ]);
    expect(values.size === 1, `manifests: ${field} must stay in sync`);
  }
}

expect(
  portable?.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "plugin.json: unsupported or missing Agent Plugins schema"
);

expect(mcp?.$schema === "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", "mcp.json: MCP schema is required");
const usageServer = mcp?.mcpServers?.["no-short-usage"];
expect(usageServer?.type === "stdio" && usageServer?.command === "sh", "mcp.json: usage must use a portable bare shell command for the local launcher");
expect(usageServer?.args?.[0] === "${PLUGIN_ROOT}/scripts/launch-usage-mcp.sh", "mcp.json: launcher must be relative to PLUGIN_ROOT");
expect(portable?.extensions?.["com.openai"]?.requires_local_executor === true, "usage: Desktop local execution must be declared");
expect(usageSourcePackage?.version === packageJson?.version, "usage: source package/root versions must match");
expect(usagePackage?.version === portable?.version && usagePackage?.ccusageVersion === "20.0.34", "usage: plugin/runtime versions and pinned ccusage must match");
for (const target of ["darwin-arm64", "darwin-x64"]) {
  const item = usagePackage?.platforms?.[target];
  expect(/^[0-9a-f]{64}$/.test(item?.sha256 ?? ""), `usage: ${target} archive checksum is required`);
  expect(item?.url === `https://github.com/longlonglong173/no-short/releases/download/v${portable?.version}/no-short-usage-${target}.tar.gz`, `usage: ${target} must use an exact release URL`);
  for (const name of ["no-short-usage", "ccusage"]) {
    const expected = item?.binaries?.[name];
    expect(/^[0-9a-f]{64}$/.test(expected ?? ""), `usage: ${target}/${name} checksum is required`);
    const binary = resolve(root, "packages/usage/runtime", target, name);
    if (existsSync(binary)) expect(createHash("sha256").update(readFileSync(binary)).digest("hex") === expected, `usage: ${target}/${name} differs from its pinned checksum`);
  }
}

const codexEntry = codexMarketplace?.plugins?.find(
  (plugin) => plugin.name === "no-short"
);
expect(Boolean(codexEntry), ".agents/plugins/marketplace.json: no-short entry is missing");
expect(
  codexEntry?.source?.source === "local" && codexEntry?.source?.path === "./",
  ".agents/plugins/marketplace.json: local source must point to \"./\""
);
expect(
  codexEntry?.policy?.installation && codexEntry?.policy?.authentication,
  ".agents/plugins/marketplace.json: installation and authentication policies are required"
);
expect(
  typeof codexEntry?.category === "string" && codexEntry.category.length > 0,
  ".agents/plugins/marketplace.json: category is required"
);

expect(!existsSync(resolve(root, "skills")), "skills/: reusable skills belong in no-short-skills, not the Usage package");
expect(!existsSync(resolve(root, ".claude-plugin")), ".claude-plugin/: the skills wrapper belongs in no-short-skills");
expect(portable?.extensions?.["com.openai"]?.interface?.displayName === "No Short Usage", "plugin.json: product display name must be No Short Usage");
expect((portable?.extensions?.["com.openai"]?.interface?.shortDescription?.length ?? 0) <= 30, "plugin.json: shortDescription must be at most 30 characters");

for (const warning of warnings) console.warn(`WARN  ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`\nValidation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`OK    manifests and marketplaces are consistent`);
console.log("OK    Usage MCP/runtime configuration validated; skills are distributed separately");
