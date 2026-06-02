import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(repoRoot, 'dist');

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
await cp(join(repoRoot, 'packages/showcase/dist'), distRoot, { recursive: true });
await mkdir(join(distRoot, 'studio'), { recursive: true });
await cp(join(repoRoot, 'packages/creator-studio/dist'), join(distRoot, 'studio'), { recursive: true });

console.log('Built Netlify site: Showcase at /, Studio at /studio/.');
