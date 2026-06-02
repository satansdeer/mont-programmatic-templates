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
    type CommunityRegistry,
    type TemplateAsset
  } from '@mont-templates/runtime';
  import {
    buildEditOverlayConnections,
    buildEditOverlayHandles,
    drawProgrammaticFrameToCanvas,
    loadTemplateFonts,
    resolveTemplateAssetUrl,
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
  const templateAssetUrlModules = import.meta.glob('../../../templates/**/assets/**/*', {
    eager: true,
    query: '?url',
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
  let assetUploadStatus = 'No asset upload yet';
  let assetLoadRevision = 0;
  let assetRevision = 0;
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
  $: selectedTemplateAssets = templateAssets(selectedTemplate, assetRevision);
  $: if (source !== lastCompiledSource) {
    compileSource();
  }
  $: if (selectedTemplate) {
    void loadSelectedTemplateFonts(selectedTemplate);
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
  $: if (canvas && spec && assetLoadRevision >= 0) {
    drawProgrammaticFrameToCanvas(canvas, frame.visuals, {
      width: spec.width,
      height: spec.height,
      background: '#0f172a',
      resolveAssetUrl: (assetIdOrUrl) => resolveSelectedTemplateAssetUrl(assetIdOrUrl),
      onAssetLoad: () => {
        assetLoadRevision += 1;
      }
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
    assetLoadRevision += 1;
  }

  function templateAssets(template: StudioTemplate | undefined, _revision: number): TemplateAsset[] {
    return template?.assets ?? [];
  }

  function resolveSelectedTemplateAssetUrl(assetIdOrUrl: string): string | null {
    return resolveTemplateAssetUrl(selectedTemplate?.assets, assetIdOrUrl, localAssetUrls(), {
      devAssetBaseUrl: import.meta.env.DEV ? '/__studio/asset?path=' : undefined
    });
  }

  async function loadSelectedTemplateFonts(template: StudioTemplate): Promise<void> {
    try {
      await loadTemplateFonts(template.assets, (assetIdOrUrl) => resolveTemplateAssetUrl(template.assets, assetIdOrUrl, localAssetUrls(), {
        devAssetBaseUrl: import.meta.env.DEV ? '/__studio/asset?path=' : undefined
      }));
      assetLoadRevision += 1;
    } catch (error) {
      assetUploadStatus = `Font load failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function localAssetUrls(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, url] of Object.entries(templateAssetUrlModules)) {
      const normalized = path.replace(/^\.\.\/\.\.\/\.\.\//, '');
      out[normalized] = url;
    }
    return out;
  }

  async function uploadAsset(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !selectedTemplate) return;
    if (!import.meta.env.DEV) {
      assetUploadStatus = 'Uploads are available only in local Studio dev mode.';
      return;
    }
    assetUploadStatus = `Uploading ${file.name}...`;
    try {
      const dataBase64 = await fileToBase64(file);
      const response = await fetch('/__studio/upload-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifestPath: selectedTemplate.manifestPath,
          fileName: file.name,
          contentType: file.type || contentTypeFromName(file.name),
          kind: assetKindFromFile(file.name, file.type),
          dataBase64
        })
      });
      const result = await response.json() as { ok: boolean; asset?: TemplateAsset; error?: string };
      if (!result.ok || !result.asset) throw new Error(result.error ?? 'Upload failed');
      selectedTemplate.assets = upsertAsset(selectedTemplate.assets ?? [], result.asset);
      assetRevision += 1;
      assetLoadRevision += 1;
      assetUploadStatus = `Uploaded ${result.asset.id}. Use asset("${result.asset.id}") in TSX.`;
    } catch (error) {
      assetUploadStatus = error instanceof Error ? error.message : String(error);
    }
  }

  function upsertAsset(assets: TemplateAsset[], asset: TemplateAsset): TemplateAsset[] {
    const rest = assets.filter((item) => item.id !== asset.id);
    return [...rest, asset].sort((left, right) => left.id.localeCompare(right.id));
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result ?? '');
        resolve(value.includes(',') ? value.split(',').pop() ?? '' : value);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  }

  function assetKindFromFile(name: string, contentType: string): TemplateAsset['kind'] {
    if (contentType.startsWith('font/') || /\.(woff2?|ttf|otf)$/i.test(name)) return 'font';
    if (contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(name)) return 'image';
    if (contentType.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(name)) return 'video';
    if (/\.json$/i.test(name) || contentType === 'application/json') return 'lottie';
    if (/\.(glb|gltf)$/i.test(name)) return 'model3d';
    return 'other';
  }

  function contentTypeFromName(name: string): string {
    if (/\.svg$/i.test(name)) return 'image/svg+xml';
    if (/\.png$/i.test(name)) return 'image/png';
    if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
    if (/\.webp$/i.test(name)) return 'image/webp';
    if (/\.gif$/i.test(name)) return 'image/gif';
    if (/\.woff2$/i.test(name)) return 'font/woff2';
    if (/\.woff$/i.test(name)) return 'font/woff';
    if (/\.glb$/i.test(name)) return 'model/gltf-binary';
    if (/\.gltf$/i.test(name)) return 'model/gltf+json';
    if (/\.mp4$/i.test(name)) return 'video/mp4';
    if (/\.webm$/i.test(name)) return 'video/webm';
    return 'application/octet-stream';
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

  function isMultilineTextSetting(setting: ProgrammaticSpanSetting): boolean {
    return String(settings[setting.id] ?? setting.default ?? '').includes('\n');
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

      <details class="settings-panel">
        <summary>Assets ({selectedTemplateAssets.length})</summary>
        <div class="asset-tools">
          <label class="asset-upload">
            <span>Upload asset</span>
            <input
              type="file"
              accept="image/*,font/*,video/*,.woff,.woff2,.ttf,.otf,.json,.glb,.gltf"
              disabled={!import.meta.env.DEV}
              on:change={uploadAsset}
            />
          </label>
          <p>{assetUploadStatus}</p>
        </div>
        {#if selectedTemplateAssets.length}
          <div class="asset-list">
            {#each selectedTemplateAssets as asset}
              <div class="asset-item">
                <div>
                  <strong>{asset.id}</strong>
                  <span>{asset.kind}{asset.contentType ? ` · ${asset.contentType}` : ''}</span>
                </div>
                <code>asset("{asset.id}")</code>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty">No template assets yet</div>
        {/if}
      </details>

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
                {:else if isMultilineTextSetting(setting)}
                  <textarea
                    rows="2"
                    value={String(settings[setting.id] ?? '')}
                    on:input={(event) => updateSetting(setting.id, (event.currentTarget as HTMLTextAreaElement).value)}
                  ></textarea>
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
