<script lang="ts">
  import { type CommunityRegistry } from '@mont-templates/runtime';
  import TemplateCard from './TemplateCard.svelte';
  import registry from '../../../registry/community.json';
  import readme from '../../../README.md?raw';
  import authoring from '../../../docs/authoring.md?raw';
  import legalPolicy from '../../../docs/legal-template-policy.md?raw';
  import architecture from '../../../docs/repository-architecture.md?raw';

  const templateSourceModules = import.meta.glob('../../../templates/**/template.tsx', {
    eager: true,
    query: '?raw',
    import: 'default'
  }) as Record<string, string>;
  const templateAssetUrlModules = import.meta.glob('../../../templates/**/assets/**/*', {
    eager: true,
    query: '?url',
    import: 'default'
  }) as Record<string, string>;

  const docs = [
    { title: 'Getting started', body: readme },
    { title: 'Authoring DSL', body: authoring },
    { title: 'Legal/IP policy', body: legalPolicy },
    { title: 'Repository architecture', body: architecture }
  ];

  const communityRegistry = registry as CommunityRegistry;
  const normalizedTemplateAssetUrls = Object.fromEntries(
    Object.entries(templateAssetUrlModules).map(([path, url]) => [
      path.replace(/^\.\.\/\.\.\/\.\.\//, ''),
      url
    ])
  );

  const templates = communityRegistry.templates
    .filter((template) => template.publishToShowcase && template.reviewStatus === 'approved' && template.ipRisk === 'generic')
    .map((template) => {
      const manifestPath = template.path ?? `templates/${template.kind}s/${template.id}/manifest.json`;
      const templatePath = manifestPath.replace(/manifest\.json$/, 'template.tsx');
      return {
        ...template,
        templatePath,
        source: templateSourceModules[`../../../${templatePath}`] ?? '',
        sourceUrl: githubSourceUrl(templatePath),
        studioUrl: studioUrl(template.id)
      };
    });

  function githubSourceUrl(path: string): string {
    return `https://github.com/satansdeer/mont-programmatic-templates/blob/main/${path}`;
  }

  function studioUrl(templateId: string): string {
    const encodedTemplateId = encodeURIComponent(templateId);
    if (import.meta.env.DEV) return `http://localhost:4310/?template=${encodedTemplateId}`;
    const basePath = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    return `${basePath}studio/?template=${encodedTemplateId}`;
  }
</script>

<svelte:head>
  <title>Mont Programmatic Templates</title>
  <meta
    name="description"
    content="Open community templates, runtime, and authoring studio for Mont programmatic spans."
  />
</svelte:head>

<header class="hero">
  <nav>
    <strong>Mont Programmatic Templates</strong>
    <div>
      <a href="#templates">Templates</a>
      <a href="#docs">Docs</a>
      <a href="https://github.com/satansdeer/mont-programmatic-templates">GitHub</a>
    </div>
  </nav>
  <div class="hero-copy">
    <h1>Programmatic span templates for product motion graphics</h1>
    <p>
      Community-authored TSX scenes, reusable components, settings manifests, and deterministic previews for Mont.
    </p>
  </div>
</header>

<main>
  <section id="templates" class="section">
    <div class="section-heading">
      <h2>Approved templates</h2>
      <p>{templates.length} public template{templates.length === 1 ? '' : 's'} in the community registry.</p>
    </div>
    <div class="template-grid">
      {#each templates as template}
        <TemplateCard
          {template}
          assetUrlModules={normalizedTemplateAssetUrls}
        />
      {/each}
    </div>
  </section>

  <section id="docs" class="section docs-section">
    <div class="section-heading">
      <h2>Docs</h2>
      <p>Static authoring notes bundled with the public repository.</p>
    </div>
    <div class="docs-grid">
      {#each docs as doc}
        <article class="doc-card">
          <h3>{doc.title}</h3>
          <pre>{doc.body}</pre>
        </article>
      {/each}
    </div>
  </section>
</main>
