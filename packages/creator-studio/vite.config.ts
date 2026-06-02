import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { validateStudioSavePath } from './src/savePathPolicy';

const repoRoot = normalize(fileURLToPath(new URL('../../', import.meta.url)));
const templateRoot = join(repoRoot, 'templates');

export default defineConfig({
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

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Request body is too large.'));
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}
