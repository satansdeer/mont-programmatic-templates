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
  validateManifestAssets(manifest, manifestPath);

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
  validateFrameAssetRefs(manifest, frame.visuals);

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

function validateManifestAssets(manifest, manifestPath) {
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const ids = new Set();
  const templateFolder = manifestPath.replace(/\/manifest\.json$/, '');
  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') {
      failures.push(`${manifest.id}: asset entries must be objects.`);
      continue;
    }
    if (!asset.id || typeof asset.id !== 'string') {
      failures.push(`${manifest.id}: asset entry is missing id.`);
      continue;
    }
    if (ids.has(asset.id)) failures.push(`${manifest.id}: duplicate asset id "${asset.id}".`);
    ids.add(asset.id);
    if (!new Set(['font', 'image', 'video', 'lottie', 'model3d', 'audio', 'sprite', 'other']).has(asset.kind)) {
      failures.push(`${manifest.id}: asset "${asset.id}" has unsupported kind "${asset.kind}".`);
    }
    if (!asset.localPath && !asset.publicUrl) {
      failures.push(`${manifest.id}: asset "${asset.id}" needs localPath or publicUrl.`);
    }
    if (asset.localPath) {
      const normalized = String(asset.localPath).replace(/\\/g, '/');
      if (!normalized.startsWith(`${templateFolder}/assets/`) || normalized.includes('..')) {
        failures.push(`${manifest.id}: asset "${asset.id}" localPath must stay inside ${templateFolder}/assets/.`);
      }
    }
    if (asset.publicUrl && !/^https:\/\//.test(String(asset.publicUrl))) {
      failures.push(`${manifest.id}: asset "${asset.id}" publicUrl must be HTTPS.`);
    }
  }
}

function validateFrameAssetRefs(manifest, visuals) {
  const assetIds = new Set((Array.isArray(manifest.assets) ? manifest.assets : []).map((asset) => asset.id));
  for (const visual of flattenVisuals(visuals)) {
    if (!new Set(['image', 'lottie', 'model3d']).has(visual.type)) continue;
    const attributes = visual.attributes instanceof Map
      ? Object.fromEntries(visual.attributes.entries())
      : visual.attributes ?? {};
    if (attributes.kind === 'cursor') continue;
    const src = typeof attributes.src === 'string' ? attributes.src : '';
    if (!src || isDirectAssetUrl(src)) continue;
    if (!assetIds.has(src)) {
      failures.push(`${manifest.id}: visual "${visual.id}" references missing asset "${src}".`);
    }
  }
}

function flattenVisuals(visuals) {
  return visuals.flatMap((visual) => [visual, ...flattenVisuals(visual.children ?? [])]);
}

function isDirectAssetUrl(value) {
  return /^(?:https?:|data:|blob:|\/)/.test(value);
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
