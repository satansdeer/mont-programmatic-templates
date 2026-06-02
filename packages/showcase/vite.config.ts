import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/mont-programmatic-templates/' : '/',
  plugins: [svelte()],
  server: {
    fs: {
      allow: [repoRoot]
    }
  }
});
