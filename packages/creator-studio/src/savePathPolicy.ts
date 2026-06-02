const allowedTemplateKinds = new Set(['scenes', 'components', 'effects', 'packs']);
const allowedFileNames = new Set(['template.tsx', 'manifest.json', 'README.md']);

export function validateStudioSavePath(input: string | undefined): string {
  if (!input) throw new Error('Missing path.');
  const normalized = input.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  const parts = normalized.split('/');
  if (parts[0] !== 'templates') throw new Error('Path must start with templates/.');
  if (!allowedTemplateKinds.has(parts[1] ?? '')) {
    throw new Error('Path must be inside templates/scenes, templates/components, templates/effects, or templates/packs.');
  }
  if (!allowedFileNames.has(parts.at(-1) ?? '')) {
    throw new Error('Only template.tsx, manifest.json, and README.md can be saved.');
  }
  if (parts.includes('..')) throw new Error('Path escapes templates/.');
  if (parts.length < 4) throw new Error('Path must include a template folder and filename.');
  return normalized;
}
