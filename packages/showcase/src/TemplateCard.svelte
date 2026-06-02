<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    compileProgrammaticSpanTsx,
    createDefaultProgrammaticSpanSettings,
    ensureProgrammaticSpanLayoutEngineReady,
    evaluateProgrammaticSpanFrame,
    type ProgrammaticSpanCompileResult,
    type ProgrammaticSpanSettings,
    type ProgrammaticSpanSpec,
    type ProgrammaticVisual,
    type TemplateAsset
  } from '@mont-templates/runtime';
  import {
    drawProgrammaticFrameToCanvas,
    loadTemplateFonts,
    resolveTemplateAssetUrl
  } from '@mont-templates/preview-renderer';
  import TemplatePlayerControls from '@mont-templates/preview-renderer/TemplatePlayerControls.svelte';

  type ShowcaseTemplateCardData = {
    id: string;
    title: string;
    category: string;
    kind: string;
    tags: string[];
    assets?: TemplateAsset[];
    source: string;
    sourceUrl: string;
    studioUrl: string;
  };

  export let template: ShowcaseTemplateCardData;
  export let assetUrlModules: Record<string, string> = {};

  let canvas: HTMLCanvasElement;
  let lastSource = '';
  let compileResult: ProgrammaticSpanCompileResult = compileProgrammaticSpanTsx('');
  let spec: ProgrammaticSpanSpec | null = null;
  let settings: ProgrammaticSpanSettings = {};
  let playheadMs = 0;
  let playing = false;
  let previewActive = false;
  let layoutEngineReady = false;
  let layoutEngineError = '';
  let layoutEngineStarted = false;
  let assetLoadRevision = 0;
  let loadedFontKey = '';
  let destroyed = false;

  onDestroy(() => {
    destroyed = true;
  });

  $: if (previewActive) startLayoutEngine();
  $: if (previewActive && template.source !== lastSource) {
    compileSource(template.source);
  }
  $: activeFontKey = previewActive ? templateFontKey(template.assets) : '';
  $: if (activeFontKey) loadFontsOnce(activeFontKey);
  $: frame = previewActive && spec
    ? evaluatePreviewFrame(spec, playheadMs, settings, layoutEngineReady)
    : { visuals: [] as ProgrammaticVisual[] };
  $: if (previewActive && canvas && spec && assetLoadRevision >= 0) {
    drawProgrammaticFrameToCanvas(canvas, frame.visuals, {
      width: spec.width,
      height: spec.height,
      background: '#0f172a',
      resolveAssetUrl: (assetIdOrUrl) => resolveTemplateAssetUrl(template.assets, assetIdOrUrl, assetUrlModules, {
        preferPublicUrl: !import.meta.env.DEV
      }),
      onAssetLoad: () => {
        assetLoadRevision += 1;
      }
    });
  }

  function startLayoutEngine(): void {
    if (layoutEngineStarted) return;
    layoutEngineStarted = true;
    ensureProgrammaticSpanLayoutEngineReady()
      .then(() => {
        if (destroyed) return;
        layoutEngineReady = true;
      })
      .catch((error) => {
        if (!destroyed) layoutEngineError = error instanceof Error ? error.message : String(error);
      });
  }

  function compileSource(source: string): void {
    lastSource = source;
    compileResult = compileProgrammaticSpanTsx(source);
    spec = compileResult.spec;
    settings = spec ? createDefaultProgrammaticSpanSettings(spec.settings) : {};
    playheadMs = spec?.editModeTimeMs ?? 0;
    playing = false;
  }

  function loadFontsOnce(fontKey: string): void {
    if (fontKey === loadedFontKey) return;
    loadedFontKey = fontKey;
    void loadTemplateFonts(template.assets, (assetIdOrUrl) => resolveTemplateAssetUrl(template.assets, assetIdOrUrl, assetUrlModules, {
      preferPublicUrl: !import.meta.env.DEV
    })).then(() => {
      if (!destroyed) assetLoadRevision += 1;
    });
  }

  function templateFontKey(assets: TemplateAsset[] | undefined): string {
    return (assets ?? [])
      .filter((asset) => asset.kind === 'font')
      .map((asset) => `${asset.id}:${asset.localPath ?? ''}:${asset.publicUrl ?? ''}:${asset.fontFamily ?? ''}:${asset.fontWeight ?? ''}`)
      .join('|') || 'no-fonts';
  }

  function evaluatePreviewFrame(
    nextSpec: ProgrammaticSpanSpec,
    nextPlayheadMs: number,
    nextSettings: ProgrammaticSpanSettings,
    _layoutEngineReady: boolean
  ) {
    return evaluateProgrammaticSpanFrame(nextSpec, nextPlayheadMs, {}, nextSettings);
  }

  function togglePreviewPlayback(): void {
    if (!previewActive) {
      activatePreview(true);
      return;
    }
    if (!spec) return;
    playing = !playing;
  }

  function activatePreview(shouldPlay = false): void {
    previewActive = true;
    if (shouldPlay) {
      requestAnimationFrame(() => {
        playing = true;
      });
    }
  }

  function pausePreview(): void {
    playing = false;
  }

  function handleCanvasKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    togglePreviewPlayback();
  }
</script>

<article class="template-card">
  <div class="preview-frame">
    {#if !previewActive}
      <button
        class="preview-placeholder"
        type="button"
        aria-label={`Load ${template.title} preview`}
        on:pointerenter={() => activatePreview(true)}
        on:focus={() => activatePreview(true)}
        on:click={() => activatePreview(true)}
      >
        <span>Load preview</span>
      </button>
    {:else if spec}
      <canvas
        bind:this={canvas}
        role="button"
        tabindex="0"
        aria-label={`${template.title} preview, ${playing ? 'playing' : 'paused'}`}
        on:pointerenter={() => activatePreview(true)}
        on:pointerleave={pausePreview}
        on:blur={pausePreview}
        on:click={togglePreviewPlayback}
        on:keydown={handleCanvasKeydown}
      ></canvas>
    {:else}
      <div class="preview-error">
        <strong>Preview unavailable</strong>
        <span>{compileResult.diagnostics[0]?.message ?? layoutEngineError ?? 'Template did not compile.'}</span>
      </div>
    {/if}
  </div>
  <div class="preview-transport">
    <TemplatePlayerControls
      bind:playheadMs
      bind:playing
      durationMs={spec?.durationMs ?? 1}
      disabled={!previewActive || !spec}
      loop
    />
  </div>
  <div class="template-body">
    <div>
      <h3>{template.title}</h3>
      <p>{template.category} · {template.kind}</p>
    </div>
    <div class="tag-row">
      {#each template.tags as tag}
        <span>{tag}</span>
      {/each}
    </div>
    <div class="template-actions">
      <a href={template.sourceUrl}>Source</a>
      <a href={template.studioUrl}>Open in Studio</a>
    </div>
  </div>
</article>
