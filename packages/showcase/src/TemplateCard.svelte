<script lang="ts">
  import { onMount } from 'svelte';
  import {
    compileProgrammaticSpanTsx,
    createDefaultProgrammaticSpanSettings,
    ensureProgrammaticSpanLayoutEngineReady,
    evaluateProgrammaticSpanFrame,
    type ProgrammaticSpanCompileResult,
    type ProgrammaticSpanSettings,
    type ProgrammaticSpanSpec,
    type ProgrammaticVisual
  } from '@mont-templates/runtime';
  import { drawProgrammaticFrameToCanvas } from '@mont-templates/preview-renderer';
  import TemplatePlayerControls from '@mont-templates/preview-renderer/TemplatePlayerControls.svelte';

  type ShowcaseTemplateCardData = {
    id: string;
    title: string;
    category: string;
    kind: string;
    tags: string[];
    source: string;
    sourceUrl: string;
    studioUrl: string;
  };

  export let template: ShowcaseTemplateCardData;

  let canvas: HTMLCanvasElement;
  let lastSource = '';
  let compileResult: ProgrammaticSpanCompileResult = compileProgrammaticSpanTsx('');
  let spec: ProgrammaticSpanSpec | null = null;
  let settings: ProgrammaticSpanSettings = {};
  let playheadMs = 0;
  let playing = true;
  let layoutEngineReady = false;
  let layoutEngineError = '';

  onMount(() => {
    let cancelled = false;
    ensureProgrammaticSpanLayoutEngineReady()
      .then(() => {
        if (cancelled) return;
        layoutEngineReady = true;
      })
      .catch((error) => {
        if (!cancelled) layoutEngineError = error instanceof Error ? error.message : String(error);
      });
    return () => {
      cancelled = true;
    };
  });

  $: if (template.source !== lastSource) {
    compileSource(template.source);
  }
  $: frame = spec
    ? evaluatePreviewFrame(spec, playheadMs, settings, layoutEngineReady)
    : { visuals: [] as ProgrammaticVisual[] };
  $: if (canvas && spec) {
    drawProgrammaticFrameToCanvas(canvas, frame.visuals, {
      width: spec.width,
      height: spec.height,
      background: '#0f172a'
    });
  }

  function compileSource(source: string): void {
    lastSource = source;
    compileResult = compileProgrammaticSpanTsx(source);
    spec = compileResult.spec;
    settings = spec ? createDefaultProgrammaticSpanSettings(spec.settings) : {};
    playheadMs = spec?.editModeTimeMs ?? 0;
    playing = Boolean(spec);
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
    if (!spec) return;
    playing = !playing;
  }

  function handleCanvasKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    togglePreviewPlayback();
  }
</script>

<article class="template-card">
  <div class="preview-frame">
    {#if spec}
      <canvas
        bind:this={canvas}
        role="button"
        tabindex="0"
        aria-label={`${template.title} preview, ${playing ? 'playing' : 'paused'}`}
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
      disabled={!spec}
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
