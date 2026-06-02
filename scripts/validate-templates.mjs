import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  compileProgrammaticSpanTsx,
  createDefaultProgrammaticSpanSettings,
  evaluateProgrammaticSpanFrame
} from '../packages/runtime/dist/index.js';

const root = new URL('..', import.meta.url).pathname;
const registry = JSON.parse(await readFile(join(root, 'registry/community.json'), 'utf8'));
const failures = [];

for (const manifest of registry.templates) {
  const manifestPath = manifest.path ?? `templates/${manifest.kind}s/${manifest.id}/manifest.json`;
  const templatePath = manifestPath.replace(/manifest\.json$/, 'template.tsx');
  const source = await readFile(join(root, templatePath), 'utf8');
  const compileResult = compileProgrammaticSpanTsx(source);
  if (!compileResult.spec) {
    failures.push(`${manifest.id}: ${compileResult.diagnostics.map((diagnostic) => diagnostic.message).join('; ')}`);
    continue;
  }
  const spec = compileResult.spec;
  const compileErrors = compileResult.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (compileErrors.length) {
    failures.push(`${manifest.id}: compile errors: ${compileErrors.map((diagnostic) => diagnostic.message).join('; ')}`);
  }

  compareSets(`${manifest.id} manifest settings`, manifest.settings, spec.settings.map((setting) => setting.id));
  compareSets(`${manifest.id} manifest tokens`, manifest.tokens, spec.tokens.map((token) => token.id));

  const frame = evaluateProgrammaticSpanFrame(
    spec,
    spec.editModeTimeMs,
    {},
    createDefaultProgrammaticSpanSettings(spec.settings)
  );
  const frameErrors = frame.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (frameErrors.length) {
    failures.push(`${manifest.id}: frame errors: ${frameErrors.map((diagnostic) => diagnostic.message).join('; ')}`);
  }
  if (!frame.visuals.length) {
    failures.push(`${manifest.id}: evaluated frame has no visuals.`);
  }

  if (manifest.publishToShowcase && manifest.reviewStatus === 'approved' && manifest.ipRisk !== 'generic') {
    failures.push(`${manifest.id}: approved showcase templates must have generic IP risk.`);
  }
}

expectPathAllowed('templates/scenes/product-demo-card/template.tsx');
expectPathAllowed('templates/components/example/manifest.json');
expectPathRejected('../outside.tsx');
expectPathRejected('templates/../package.json');
expectPathRejected('templates/scenes/product-demo-card/output.js');
expectPathRejected('private/scenes/product-demo-card/template.tsx');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Validated ${registry.templates.length} template(s).`);

function compareSets(label, manifestItems, specItems) {
  const manifestSet = new Set(manifestItems);
  const specSet = new Set(specItems);
  const missing = specItems.filter((item) => !manifestSet.has(item));
  const extra = manifestItems.filter((item) => !specSet.has(item));
  if (missing.length) failures.push(`${label} missing: ${missing.join(', ')}`);
  if (extra.length) failures.push(`${label} extra: ${extra.join(', ')}`);
}

function validateStudioSavePath(input) {
  if (!input) throw new Error('Missing path.');
  const normalized = input.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  const parts = normalized.split('/');
  if (parts[0] !== 'templates') throw new Error('Path must start with templates/.');
  if (!new Set(['scenes', 'components', 'effects', 'packs']).has(parts[1] ?? '')) {
    throw new Error('Path must be inside templates/scenes, templates/components, templates/effects, or templates/packs.');
  }
  if (!new Set(['template.tsx', 'manifest.json', 'README.md']).has(parts.at(-1) ?? '')) {
    throw new Error('Only template.tsx, manifest.json, and README.md can be saved.');
  }
  if (parts.includes('..')) throw new Error('Path escapes templates/.');
  if (parts.length < 4) throw new Error('Path must include a template folder and filename.');
  return normalized;
}

function expectPathAllowed(path) {
  try {
    validateStudioSavePath(path);
  } catch (error) {
    failures.push(`Expected save path to be allowed: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function expectPathRejected(path) {
  try {
    validateStudioSavePath(path);
    failures.push(`Expected save path to be rejected: ${path}`);
  } catch {
    // Expected.
  }
}
