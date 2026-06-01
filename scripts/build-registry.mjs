import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const templateRoot = join(root, "templates");
const registryPath = join(root, "registry", "community.json");

async function findManifestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findManifestFiles(path));
    } else if (entry.name === "manifest.json") {
      files.push(path);
    }
  }
  return files;
}

const manifests = [];
for (const file of await findManifestFiles(templateRoot)) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifests.push({
    ...manifest,
    path: relative(root, file).replace(/\\/g, "/")
  });
}

manifests.sort((left, right) => left.id.localeCompare(right.id));

await writeFile(
  registryPath,
  `${JSON.stringify({ schemaVersion: 1, templates: manifests }, null, 2)}\n`
);

console.log(`Built registry with ${manifests.length} template(s).`);
