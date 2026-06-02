import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { basename, dirname, extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { validateStudioSavePath } from './src/savePathPolicy';

const repoRoot = normalize(fileURLToPath(new URL('../../', import.meta.url)));
const templateRoot = join(repoRoot, 'templates');

export default defineConfig({
  base: process.env.STUDIO_BASE ?? '/',
  plugins: [svelte(), studioSavePlugin()],
  server: {
    fs: {
      allow: [repoRoot]
    }
  }
});

function studioSavePlugin(): Plugin {
  return {
    name: 'mont-template-studio-save',
    configureServer(server) {
      server.middlewares.use('/__studio/save', async (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end('Method not allowed');
          return;
        }

        try {
          const body = JSON.parse(await readBody(request)) as { path?: string; content?: string };
          const targetPath = validateTemplatePath(body.path);
          await mkdir(dirname(targetPath), { recursive: true });
          await writeFile(targetPath, body.content ?? '', 'utf8');
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, path: relative(repoRoot, targetPath).replace(/\\/g, '/') }));
        } catch (error) {
          response.statusCode = 400;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use('/__studio/upload-asset', async (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end('Method not allowed');
          return;
        }

        try {
          const body = JSON.parse(await readBody(request, 32_000_000)) as {
            manifestPath?: string;
            fileName?: string;
            contentType?: string;
            kind?: string;
            dataBase64?: string;
          };
          const manifestPath = validateTemplatePath(body.manifestPath);
          if (basename(manifestPath) !== 'manifest.json') throw new Error('Asset uploads must target a template manifest.');
          const fileName = safeAssetFileName(body.fileName);
          const templateDir = dirname(manifestPath);
          const targetPath = normalize(join(templateDir, 'assets', fileName));
          ensureInsideTemplates(targetPath);
          const data = Buffer.from(body.dataBase64 ?? '', 'base64');
          if (!data.length) throw new Error('Missing asset data.');
          await mkdir(dirname(targetPath), { recursive: true });
          await writeFile(targetPath, data);
          const localPath = relative(repoRoot, targetPath).replace(/\\/g, '/');
          const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
          const asset = {
            id: uniqueAssetId(manifest.assets, fileName),
            kind: allowedAssetKind(body.kind, body.contentType, fileName),
            fileName,
            contentType: body.contentType || contentTypeFromFileName(fileName),
            localPath
          };
          manifest.assets = upsertManifestAsset(manifest.assets, asset);
          await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: true, asset }));
        } catch (error) {
          response.statusCode = 400;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use('/__studio/asset', async (request, response) => {
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.end('Method not allowed');
          return;
        }

        try {
          const url = new URL(request.url ?? '', 'http://studio.local');
          const assetPath = String(url.searchParams.get('path') ?? '');
          const targetPath = validateTemplateAssetPath(assetPath);
          response.setHeader('Content-Type', contentTypeFromFileName(targetPath));
          response.end(await readFile(targetPath));
        } catch (error) {
          response.statusCode = 404;
          response.end(error instanceof Error ? error.message : String(error));
        }
      });
    }
  };
}

function validateTemplatePath(input: string | undefined): string {
  const normalizedInput = validateStudioSavePath(input);
  const targetPath = normalize(join(repoRoot, normalizedInput));
  const relativeToTemplates = relative(templateRoot, targetPath);
  if (relativeToTemplates.startsWith('..') || relativeToTemplates === '') {
    throw new Error('Path escapes templates/.');
  }
  return targetPath;
}

function validateTemplateAssetPath(input: string): string {
  const normalizedInput = input.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  const parts = normalizedInput.split('/');
  if (parts[0] !== 'templates') throw new Error('Asset path must start with templates/.');
  if (!parts.includes('assets')) throw new Error('Asset path must be inside a template assets folder.');
  const targetPath = normalize(join(repoRoot, normalizedInput));
  ensureInsideTemplates(targetPath);
  return targetPath;
}

function ensureInsideTemplates(targetPath: string): void {
  const relativeToTemplates = relative(templateRoot, targetPath);
  if (relativeToTemplates.startsWith('..') || relativeToTemplates === '') {
    throw new Error('Path escapes templates/.');
  }
}

function safeAssetFileName(input: string | undefined): string {
  const ext = extname(input ?? '').toLowerCase();
  const base = basename(input ?? 'asset').replace(ext, '');
  const safeBase = slug(base) || 'asset';
  const safeExt = ext.replace(/[^a-z0-9.]/g, '').slice(0, 12);
  return `${safeBase}${safeExt || '.bin'}`;
}

function uniqueAssetId(existing: unknown, fileName: string): string {
  const base = slug(fileName.replace(extname(fileName), '')) || 'asset';
  const used = new Set(Array.isArray(existing)
    ? existing.map((asset) => typeof asset === 'object' && asset !== null ? String((asset as { id?: unknown }).id ?? '') : '')
    : []);
  if (!used.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function upsertManifestAsset(existing: unknown, asset: Record<string, string>): Array<Record<string, unknown>> {
  const assets = Array.isArray(existing)
    ? existing.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];
  return [...assets.filter((item) => item.id !== asset.id), asset]
    .sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? '')));
}

function allowedAssetKind(kind: string | undefined, contentType: string | undefined, fileName: string): string {
  const normalized = kind && new Set(['font', 'image', 'video', 'lottie', 'model3d', 'audio', 'sprite', 'other']).has(kind)
    ? kind
    : '';
  if (normalized) return normalized;
  if ((contentType ?? '').startsWith('font/') || /\.(woff2?|ttf|otf)$/i.test(fileName)) return 'font';
  if ((contentType ?? '').startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(fileName)) return 'image';
  if ((contentType ?? '').startsWith('video/') || /\.(mp4|webm|mov)$/i.test(fileName)) return 'video';
  if (/\.json$/i.test(fileName) || contentType === 'application/json') return 'lottie';
  if (/\.(glb|gltf)$/i.test(fileName)) return 'model3d';
  return 'other';
}

function contentTypeFromFileName(fileName: string): string {
  if (/\.svg$/i.test(fileName)) return 'image/svg+xml';
  if (/\.png$/i.test(fileName)) return 'image/png';
  if (/\.jpe?g$/i.test(fileName)) return 'image/jpeg';
  if (/\.webp$/i.test(fileName)) return 'image/webp';
  if (/\.gif$/i.test(fileName)) return 'image/gif';
  if (/\.woff2$/i.test(fileName)) return 'font/woff2';
  if (/\.woff$/i.test(fileName)) return 'font/woff';
  if (/\.ttf$/i.test(fileName)) return 'font/ttf';
  if (/\.otf$/i.test(fileName)) return 'font/otf';
  if (/\.glb$/i.test(fileName)) return 'model/gltf-binary';
  if (/\.gltf$/i.test(fileName)) return 'model/gltf+json';
  if (/\.mp4$/i.test(fileName)) return 'video/mp4';
  if (/\.webm$/i.test(fileName)) return 'video/webm';
  return 'application/octet-stream';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
}

function readBody(request: IncomingMessage, maxBytes = 2_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('Request body is too large.'));
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}
