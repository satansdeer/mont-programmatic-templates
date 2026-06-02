<script lang="ts">
  import { onMount } from 'svelte';
  import {
    compileProgrammaticSpanTsx,
    createDefaultProgrammaticSpanSettings,
    ensureProgrammaticSpanLayoutEngineReady,
    evaluateProgrammaticSpanFrame,
    type ProgrammaticSpanCompileResult,
    type ProgrammaticSpanLiteral,
    type ProgrammaticSpanNode,
    type ProgrammaticSpanSetting,
    type ProgrammaticSpanSettings,
    type ProgrammaticSpanSpec,
    type ProgrammaticVisual,
    type CommunityRegistry
  } from '@mont-templates/runtime';
  import {
    buildEditOverlayConnections,
    buildEditOverlayHandles,
    drawProgrammaticFrameToCanvas,
    type ProgrammaticEditOverlayHandle
  } from '@mont-templates/preview-renderer';
  import TemplatePlayerControls from '@mont-templates/preview-renderer/TemplatePlayerControls.svelte';
  import { assertBrandSafeManifest, type TemplateManifest } from '@mont-templates/template-sdk';
  import registry from '../../../registry/community.json';

  const templateSourceModules = import.meta.glob('../../../templates/**/template.tsx', {
    eager: true,
    query: '?raw',
    import: 'default'
  }) as Record<string, string>;

  type StudioTemplate = TemplateManifest & {
    manifestPath: string;
    templatePath: string;
    source: string;
  };

  type DragState = {
    handle: ProgrammaticEditOverlayHandle;
    mode: 'point' | 'frame-move' | 'frame-resize';
    originX: number;
    originY: number;
    startValue: Record<string, ProgrammaticSpanLiteral>;
    pointerId: number;
  };

  const communityRegistry = registry as CommunityRegistry;

  const templates: StudioTemplate[] = communityRegistry.templates.map((manifest) => {
    const manifestPath = manifest.path ?? `templates/${manifest.kind}s/${manifest.id}/manifest.json`;
    const templatePath = manifestPath.replace(/manifest\.json$/, 'template.tsx');
    return {
      ...manifest,
      manifestPath,
      templatePath,
      source: templateSourceModules[`../../../${templatePath}`] ?? ''
    };
  });

  const requestedTemplateId = new URLSearchParams(window.location.search).get('template');
  const initialTemplate = templates.find((template) => template.id === requestedTemplateId) ?? templates[0];
  let selectedTemplateId = initialTemplate?.id ?? '';
  let source = initialTemplate?.source ?? '';
  let compileResult: ProgrammaticSpanCompileResult = compileProgrammaticSpanTsx(source);
  let spec: ProgrammaticSpanSpec | null = compileResult.spec;
  let settings: ProgrammaticSpanSettings = spec ? createDefaultProgrammaticSpanSettings(spec.settings) : {};
  let playheadMs = spec?.editModeTimeMs ?? 0;
  let playing = false;
  let editMode = false;
  let saveStatus = 'Unsaved';
  let lastCompiledSource = '';
  let lastSpecId = spec?.id ?? '';
  let canvas: HTMLCanvasElement;
  let overlaySvg: SVGSVGElement;
  let dragState: DragState | null = null;
  let layoutEngineReady = false;
  let layoutEngineError = '';

  onMount(() => {
    let cancelled = false;
    ensureProgrammaticSpanLayoutEngineReady()
      .then(() => {
        if (!cancelled) {
          layoutEngineReady = true;
          settings = { ...settings };
        }
      })
      .catch((error) => {
        if (!cancelled) layoutEngineError = error instanceof Error ? error.message : String(error);
      });
    return () => {
      cancelled = true;
    };
  });

  $: selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? initialTemplate;
  $: if (source !== lastCompiledSource) {
    compileSource();
  }
  $: frame = spec
    ? evaluateStudioFrame(spec, playheadMs, settings, layoutEngineReady)
    : { visuals: [] as ProgrammaticVisual[], effects: [], diagnostics: [] };
  $: allDiagnostics = [
    ...compileResult.diagnostics,
    ...(layoutEngineError && specHasLayoutNode(spec?.root)
      ? [{ severity: 'warning' as const, message: layoutEngineError }]
      : []),
    ...frame.diagnostics
  ];
  $: editHandles = spec ? buildEditOverlayHandles(spec.settings, settings, frame.visuals) : [];
  $: editConnections = buildEditOverlayConnections(editHandles);
  $: if (canvas && spec) {
    drawProgrammaticFrameToCanvas(canvas, frame.visuals, {
      width: spec.width,
      height: spec.height,
      background: '#0f172a'
    });
  }

  function evaluateStudioFrame(
    nextSpec: ProgrammaticSpanSpec,
    nextPlayheadMs: number,
    nextSettings: ProgrammaticSpanSettings,
    _layoutEngineReady: boolean
  ) {
    return evaluateProgrammaticSpanFrame(nextSpec, nextPlayheadMs, {}, nextSettings);
  }

  function compileSource(): void {
    lastCompiledSource = source;
    compileResult = compileProgrammaticSpanTsx(source);
    const nextSpec = compileResult.spec;
    if ((nextSpec?.id ?? '') !== lastSpecId) {
      settings = nextSpec ? createDefaultProgrammaticSpanSettings(nextSpec.settings) : {};
      playheadMs = nextSpec?.editModeTimeMs ?? 0;
      lastSpecId = nextSpec?.id ?? '';
    } else if (nextSpec) {
      const defaults = createDefaultProgrammaticSpanSettings(nextSpec.settings);
      settings = { ...defaults, ...settings };
      playheadMs = Math.min(playheadMs, nextSpec.durationMs);
    }
    spec = nextSpec;
    saveStatus = 'Unsaved';
  }

  function selectTemplate(): void {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;
    source = template.source;
    saveStatus = 'Loaded';
  }

  function updateSetting(id: string, value: ProgrammaticSpanLiteral): void {
    settings = { ...settings, [id]: value };
    saveStatus = 'Unsaved settings';
  }

  function updateSettingField(id: string, field: string, value: number): void {
    const current = literalRecord(settings[id]);
    updateSetting(id, { ...current, [field]: value });
  }

  async function saveTemplate(): Promise<void> {
    if (!selectedTemplate) return;
    saveStatus = 'Saving...';
    try {
      assertBrandSafeManifest(selectedTemplate);
      const response = await fetch('/__studio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedTemplate.templatePath,
          content: source
        })
      });
      const result = await response.json() as { ok: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? 'Save failed');
      selectedTemplate.source = source;
      saveStatus = 'Saved';
    } catch (error) {
      saveStatus = error instanceof Error ? error.message : String(error);
    }
  }

  function beginOverlayDrag(
    event: PointerEvent,
    handle: ProgrammaticEditOverlayHandle,
    mode: DragState['mode']
  ): void {
    const current = literalRecord(settings[handle.settingId]);
    dragState = {
      handle,
      mode,
      originX: handle.kind === 'point' ? handle.x - finiteNumber(current.x, 0) : handle.x - finiteNumber(current.x, 0),
      originY: handle.kind === 'point' ? handle.y - finiteNumber(current.y, 0) : handle.y - finiteNumber(current.y, 0),
      startValue: current,
      pointerId: event.pointerId
    };
    overlaySvg?.setPointerCapture(event.pointerId);
  }

  function moveOverlayDrag(event: PointerEvent): void {
    if (!dragState || !spec) return;
    const scenePoint = pointerToScene(event);
    if (!scenePoint) return;
    if (dragState.mode === 'point') {
      updateSetting(dragState.handle.settingId, {
        ...dragState.startValue,
        x: Math.round(scenePoint.x - dragState.originX),
        y: Math.round(scenePoint.y - dragState.originY)
      });
    } else if (dragState.mode === 'frame-move' && dragState.handle.kind === 'frame') {
      updateSetting(dragState.handle.settingId, {
        ...dragState.startValue,
        x: Math.round(scenePoint.x - dragState.originX),
        y: Math.round(scenePoint.y - dragState.originY)
      });
    } else if (dragState.mode === 'frame-resize' && dragState.handle.kind === 'frame') {
      updateSetting(dragState.handle.settingId, {
        ...dragState.startValue,
        width: Math.max(8, Math.round(scenePoint.x - dragState.handle.x)),
        height: Math.max(8, Math.round(scenePoint.y - dragState.handle.y))
      });
    }
  }

  function endOverlayDrag(event: PointerEvent): void {
    if (!dragState) return;
    overlaySvg?.releasePointerCapture(event.pointerId);
    dragState = null;
  }

  function pointerToScene(event: PointerEvent): { x: number; y: number } | null {
    if (!overlaySvg || !spec) return null;
    const rect = overlaySvg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * spec.width,
      y: ((event.clientY - rect.top) / rect.height) * spec.height
    };
  }

  function settingFieldValue(id: string, field: string): ProgrammaticSpanLiteral | undefined {
    return literalRecord(settings[id])[field];
  }

  function settingSummary(setting: ProgrammaticSpanSetting): string {
    if (setting.overlay) return setting.overlay === 'frame' ? 'Overlay frame' : 'Overlay point';
    return setting.type;
  }

  function literalRecord(value: ProgrammaticSpanLiteral | undefined): Record<string, ProgrammaticSpanLiteral> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function specHasLayoutNode(node: ProgrammaticSpanNode | undefined): boolean {
    if (!node) return false;
    if (node.kind === 'v-stack' || node.kind === 'h-stack' || node.kind === 'bento') return true;
    return node.children.some((child) => specHasLayoutNode(child));
  }

  function finiteNumber(value: ProgrammaticSpanLiteral | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  function colorValue(value: ProgrammaticSpanLiteral | undefined): string {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#14b8a6';
  }

  function formatSeconds(ms: number): string {
    return `${(ms / 1000).toFixed(2)}s`;
  }
</script>

<svelte:head>
  <title>Mont Template Creator Studio</title>
</svelte:head>

<div class="studio">
  <header class="topbar">
    <div>
      <h1>Mont Template Creator Studio</h1>
      <p>{spec ? `${spec.width}x${spec.height} · ${formatSeconds(spec.durationMs)} · ${frame.visuals.length} visuals` : 'Invalid TSX source'}</p>
    </div>
    <div class="topbar-actions">
      <label>
        <span>Template</span>
        <select bind:value={selectedTemplateId} on:change={selectTemplate}>
          {#each templates as template}
            <option value={template.id}>{template.title}</option>
          {/each}
        </select>
      </label>
      <button type="button" class:active={editMode} on:click={() => (editMode = !editMode)}>
        Edit overlays ({editHandles.length})
      </button>
      <button type="button" on:click={saveTemplate}>Save TSX</button>
      <span class="save-status">{saveStatus}</span>
    </div>
  </header>

  <main class="workspace">
    <section class="editor" aria-label="Template source and settings">
      <div class="panel-header">
        <strong>Source</strong>
        <span>{compileResult.diagnostics.filter((item) => item.severity === 'error').length} errors</span>
      </div>
      <textarea bind:value={source} spellcheck="false" aria-label="Template TSX source"></textarea>

      <div class="diagnostics" aria-label="Diagnostics">
        {#if allDiagnostics.length}
          {#each allDiagnostics.slice(0, 6) as diagnostic}
            <div class={`diagnostic diagnostic-${diagnostic.severity}`}>
              <strong>{diagnostic.severity}</strong>
              <span>{diagnostic.path ? `${diagnostic.path}: ` : ''}{diagnostic.message}</span>
            </div>
          {/each}
        {:else}
          <div class="empty">No diagnostics</div>
        {/if}
      </div>

      <details open class="settings-panel">
        <summary>Declarative settings ({spec?.settings.length ?? 0})</summary>
        {#if spec?.settings.length}
          <div class="settings-list">
            {#each spec.settings as setting}
              <div class="setting">
                <div class="setting-label">
                  <strong>{setting.label ?? setting.id}</strong>
                  <span>{settingSummary(setting)}</span>
                </div>
                {#if setting.type === 'boolean'}
                  <input
                    type="checkbox"
                    checked={Boolean(settings[setting.id])}
                    on:change={(event) => updateSetting(setting.id, (event.currentTarget as HTMLInputElement).checked)}
                  />
                {:else if setting.type === 'number'}
                  <input
                    type="number"
                    min={setting.min}
                    max={setting.max}
                    step={setting.step ?? 'any'}
                    value={finiteNumber(settings[setting.id], 0)}
                    on:input={(event) => updateSetting(setting.id, Number((event.currentTarget as HTMLInputElement).value))}
                  />
                {:else if setting.type === 'color'}
                  <input
                    type="color"
                    value={colorValue(settings[setting.id])}
                    on:input={(event) => updateSetting(setting.id, (event.currentTarget as HTMLInputElement).value)}
                  />
                {:else if setting.type === 'select'}
                  <select
                    value={String(settings[setting.id] ?? '')}
                    on:change={(event) => updateSetting(setting.id, (event.currentTarget as HTMLSelectElement).value)}
                  >
                    {#each setting.options?.length ? setting.options : [String(setting.default ?? '')] as option}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                {:else if setting.type === 'point'}
                  <div class="setting-grid">
                    <label>
                      <span>X</span>
                      <input
                        type="number"
                        value={finiteNumber(settingFieldValue(setting.id, 'x'), 0)}
                        on:input={(event) => updateSettingField(setting.id, 'x', Number((event.currentTarget as HTMLInputElement).value))}
                      />
                    </label>
                    <label>
                      <span>Y</span>
                      <input
                        type="number"
                        value={finiteNumber(settingFieldValue(setting.id, 'y'), 0)}
                        on:input={(event) => updateSettingField(setting.id, 'y', Number((event.currentTarget as HTMLInputElement).value))}
                      />
                    </label>
                  </div>
                {:else if setting.type === 'rect'}
                  <div class="setting-grid rect-grid">
                    {#each ['x', 'y', 'width', 'height'] as field}
                      <label>
                        <span>{field}</span>
                        <input
                          type="number"
                          value={finiteNumber(settingFieldValue(setting.id, field), 0)}
                          on:input={(event) => updateSettingField(setting.id, field, Number((event.currentTarget as HTMLInputElement).value))}
                        />
                      </label>
                    {/each}
                  </div>
                {:else}
                  <input
                    type="text"
                    value={String(settings[setting.id] ?? '')}
                    on:input={(event) => updateSetting(setting.id, (event.currentTarget as HTMLInputElement).value)}
                  />
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty">No editable settings</div>
        {/if}
      </details>
    </section>

    <section class="preview" aria-label="Template preview">
      <div class="panel-header">
        <strong>Preview</strong>
      </div>
      <div class="stage-shell">
        <div class="stage" style={`aspect-ratio: ${spec?.width ?? 16} / ${spec?.height ?? 9};`}>
          <canvas bind:this={canvas} aria-label="Programmatic span preview"></canvas>
          {#if editMode && spec}
            <svg
              bind:this={overlaySvg}
              class="edit-overlay"
              viewBox={`0 0 ${spec.width} ${spec.height}`}
              role="presentation"
              on:pointermove={moveOverlayDrag}
              on:pointerup={endOverlayDrag}
              on:pointercancel={endOverlayDrag}
            >
              {#each editConnections as connection}
                <line
                  class="edit-connection"
                  x1={connection.x1}
                  y1={connection.y1}
                  x2={connection.x2}
                  y2={connection.y2}
                />
              {/each}
              {#each editHandles as handle}
                {#if handle.kind === 'frame'}
                  <g>
                    <rect
                      class="frame-hit"
                      x={handle.x}
                      y={handle.y}
                      width={handle.width}
                      height={handle.height}
                      role="presentation"
                      on:pointerdown={(event) => beginOverlayDrag(event, handle, 'frame-move')}
                    />
                    <rect class="frame-outline" x={handle.x} y={handle.y} width={handle.width} height={handle.height} />
                    <rect
                      class="resize-handle"
                      x={handle.x + handle.width - 12}
                      y={handle.y + handle.height - 12}
                      width="24"
                      height="24"
                      role="presentation"
                      on:pointerdown={(event) => beginOverlayDrag(event, handle, 'frame-resize')}
                    />
                    <text class="handle-label" x={handle.x} y={Math.max(18, handle.y - 10)}>{handle.label}</text>
                  </g>
                {:else}
                  <g>
                    <line class="point-crosshair" x1={handle.x - 18} y1={handle.y} x2={handle.x + 18} y2={handle.y} />
                    <line class="point-crosshair" x1={handle.x} y1={handle.y - 18} x2={handle.x} y2={handle.y + 18} />
                    <circle
                      class="point-hit"
                      cx={handle.x}
                      cy={handle.y}
                      r="20"
                      role="presentation"
                      on:pointerdown={(event) => beginOverlayDrag(event, handle, 'point')}
                    />
                    <circle class="point-dot" cx={handle.x} cy={handle.y} r="7" />
                    <text class="handle-label" x={handle.x + 14} y={handle.y - 12}>{handle.label}</text>
                  </g>
                {/if}
              {/each}
            </svg>
          {/if}
        </div>
      </div>
      <div class="transport">
        <TemplatePlayerControls
          bind:playheadMs
          bind:playing
          durationMs={spec?.durationMs ?? 1}
          disabled={!spec}
          loop
        />
      </div>
    </section>
  </main>
</div>
