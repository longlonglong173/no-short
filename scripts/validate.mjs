import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function parseFrontmatter(relativePath) {
  const content = readFileSync(resolve(root, relativePath), "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    errors.push(`${relativePath}: missing YAML frontmatter`);
    return null;
  }

  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (!field) continue;

    let value = field[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[field[1]] = value;
  }

  return { content, fields };
}

const portable = readJson("plugin.json");
const claudePlugin = readJson(".claude-plugin/plugin.json");
const claudeMarketplace = readJson(".claude-plugin/marketplace.json");
const codexMarketplace = readJson(".agents/plugins/marketplace.json");
const packageJson = readJson("package.json");

const manifests = [
  ["plugin.json", portable],
  [".claude-plugin/plugin.json", claudePlugin],
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

if (portable && claudePlugin && packageJson) {
  for (const field of ["name", "version", "description"]) {
    const values = new Set([
      portable[field],
      claudePlugin[field],
      packageJson[field]
    ]);
    expect(values.size === 1, `manifests: ${field} must stay in sync`);
  }
}

expect(
  portable?.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "plugin.json: unsupported or missing Agent Plugins schema"
);

const claudeEntry = claudeMarketplace?.plugins?.find(
  (plugin) => plugin.name === "no-short"
);
expect(Boolean(claudeEntry), ".claude-plugin/marketplace.json: no-short entry is missing");
expect(claudeEntry?.source === "./", ".claude-plugin/marketplace.json: source must be \"./\"");
expect(
  claudeMarketplace?.name === "no-short",
  ".claude-plugin/marketplace.json: marketplace name must be \"no-short\""
);
expect(
  claudeEntry?.version === portable?.version,
  ".claude-plugin/marketplace.json: version must match plugin.json"
);

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

const skillsDirectory = resolve(root, "skills");
expect(existsSync(skillsDirectory), "skills/: directory is missing");

let skillCount = 0;
if (existsSync(skillsDirectory)) {
  const entries = readdirSync(skillsDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const relativePath = `skills/${entry.name}/SKILL.md`;
    if (!existsSync(resolve(root, relativePath))) {
      errors.push(`${relativePath}: file is missing`);
      continue;
    }

    skillCount += 1;
    const parsed = parseFrontmatter(relativePath);
    if (!parsed) continue;

    const { content, fields } = parsed;
    expect(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) && entry.name.length < 64,
      `${relativePath}: folder name must be kebab-case and shorter than 64 characters`
    );
    expect(fields.name === entry.name, `${relativePath}: frontmatter name must match its folder`);
    expect(
      typeof fields.description === "string" && fields.description.trim().length >= 20,
      `${relativePath}: description must be at least 20 characters`
    );
    expect(
      !/\b(TODO|TBD|your skill|replace me)\b/i.test(content),
      `${relativePath}: unfinished scaffold text found`
    );
  }
}

if (skillCount === 0) {
  warnings.push("skills/: no skills found; choose and add the first skill before public release");
}

for (const warning of warnings) console.warn(`WARN  ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`\nValidation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`OK    manifests and marketplaces are consistent`);
console.log(`OK    ${skillCount} skill(s) validated`);
