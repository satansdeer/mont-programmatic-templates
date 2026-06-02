# Template Authoring

Mont programmatic templates are TSX scene descriptions with explicit editable settings and hidden derived tokens.

## TSX Scene Shape

Every template exports `defineSpanScene`.

```tsx
export default defineSpanScene({
  id: "product-demo-card",
  width: 1280,
  height: 720,
  durationMs: 6200,
  settings: {},
  tokens: {},
  render({ settings, tokens }) {
    return <Scene>{/* visuals */}</Scene>;
  }
});
```

## Settings

Settings are the values users can edit in Mont.

```tsx
settings: {
  headline: textSetting("Ship the exact demo", { label: "Headline" }),
  primary: colorSetting("#14b8a6", { label: "Primary color" }),
  ctaFrame: rectSetting(
    { x: 0, y: 27, width: 214, height: 58 },
    { label: "CTA frame", overlay: "frame", visualId: "cta" }
  )
}
```

## Derived Tokens

Tokens are hidden values computed from settings or other tokens.

```tsx
tokens: {
  ctaFill: settings.primary,
  ctaGlow: color.mix(settings.primary, "#ffffff", 0.62),
  textOnPrimary: color.readableText(settings.primary)
}
```

Templates should expose a small number of high-level settings and derive related colors, spacing, and styling through tokens.

## Spatial Editing

Use overlay-backed point and frame settings for values that are best edited visually.

```tsx
cursorClick: pointSetting(
  { x: 226, y: 414 },
  {
    label: "Cursor click",
    overlay: true,
    overlayGroup: "cursor-path",
    overlayOrder: 1,
    overlayOriginVisualId: "browser-body"
  }
)
```

Overlay-backed settings may still appear in settings panels, but should be collapsed by default in authoring tools.

## Layout

Prefer layout containers over manual absolute positioning for composition:

- `Bento` for grid-like scene structure.
- `Cell` for local coordinate spaces and padding.
- `VStack` and `HStack` for aligned repeated content.
- `MotionBox` for transforms applied after layout, such as scale, pulse, rotation, swoop in, and swoop out.

## Text Effects

Use text effects when the final layout should be deterministic:

- `TextEffect.Count` for numeric changes in either direction.
- `TextEffect.Typewriter` for fixed line-aware character reveal.
- `TextEffect.Reveal`, `WordReveal`, `LetterFlyIn`, `WordDrop`, and `Wipe` for split text motion.

## Render Effects And Media

Visual nodes may set render effect props such as `blur`, `shadowColor`, `shadowBlur`, `glowColor`, and `glowBlur`. The public preview renderer supports deterministic placeholders for images, Lottie, and 3D objects; Mont can replace those with the full private media renderer when importing templates.

## Assets

Use `asset("id")` for template media instead of hard-coded file paths. The id must be declared in the template manifest `assets` array.

```tsx
<Image id="spark" src={asset("spark-sprite")} width={140} height={140} fit="contain" />
<Text id="title" text="Variable type" fontFamily="InterAsset, Inter, sans-serif" />
```

Manifest asset records describe how different runtimes resolve the id:

```json
{
  "id": "spark-sprite",
  "kind": "sprite",
  "contentType": "image/svg+xml",
  "localPath": "templates/scenes/example/assets/spark-sprite.svg",
  "publicUrl": "https://cdn.example.com/templates/example/spark-sprite.svg",
  "license": "Apache-2.0",
  "source": "Mont"
}
```

Resolution rules:

- In Mont, `asset("id")` should resolve only to assets available in the current project or imported template pack.
- In the public Showcase, `publicUrl` should point at Bunny CDN for approved public assets. If no CDN URL exists yet, static builds can bundle `localPath`.
- In local Creator Studio, uploaded files are stored under the template's `assets/` folder and the manifest is updated automatically.
- Font assets may include `fontFamily`, `fontWeight`, `fontStyle`, and `variableAxes`. Studio and Showcase load them before rendering previews.
- Image/sprite assets render in the public preview. Video, Lottie, and 3D model assets are tracked in manifests now; richer public preview support can be added per media type.

Uploaded assets must be generic or clearly disclosed in `thirdPartyAssets`. Do not upload product screenshots, logos, copied UI, proprietary fonts, or brand trade dress unless the manifest marks the template for review.

## Procedural.Visual

Use `Procedural.Visual` when a template needs generated motion or geometry that is awkward to describe with static nodes. The render prop is a pure bounded function: it receives Mont's `api` object and returns a serializable frame graph. It must not touch DOM, network, filesystem, timers, ambient randomness, or renderer internals.

```tsx
<Procedural.Visual
  id="generated-field"
  width={1280}
  height={720}
  seed={29}
  render={(api) => {
    const layer = api.layer2d("particles");
    for (let index = 0; index < 80; index += 1) {
      const x = api.random.range(index, 80, api.width - 80);
      const y = 240 + Math.sin(api.time.seconds + index) * 28;
      layer.fill(api.tokens.accent, 0.72).circle(x, y, 5);
    }
    return api.frame([layer]);
  }}
/>
```

Supported V1 layers:

- `api.layer2d(id)` for p5-like retained drawing commands: `rect`, `circle`, `ellipse`, `line`, and `text`.
- `api.mesh2d(id)` for generated triangles and quads, useful for Voronoi-style cells, cloth-like flags, and surfaces.
- `api.scene3d(id)` for serializable 3D scene proxy objects: boxes, spheres, planes, camera settings, and materials.
- `api.shader.wgsl({...})` for custom WGSL postprocess layers with serializable uniforms.

Safety and determinism rules:

- Use `api.time.ms`, `api.time.seconds`, and `api.time.normalized`; do not use `Date` or `performance`.
- Use `api.random.value`, `api.random.range`, and `api.noise`; do not use `Math.random`.
- Loops must have static numeric bounds. `while` and `do/while` are rejected.
- The runtime enforces budgets for API calls, visuals, layers, mesh vertices, 3D objects, shader passes, shader source length, and uniform count.
- Invalid output produces Studio diagnostics and visible placeholders instead of crashing preview.

Shader rules:

- WGSL layers must declare an `@fragment` entry point and return `vec4f` color output.
- Uniforms must be plain serializable literals.
- Unbounded loops, storage writes, workgroup memory, atomics, `discard`, and storage buffers are rejected by static checks.
- Studio and CI validate shader shape before the preview renderer sees it; full GPU execution is a separate renderer integration concern.

Agent authoring guidance:

- Prefer small helper functions and bounded loops over huge literal arrays.
- Keep all output serializable and finite.
- Return multiple layers when that makes compositing clear, for example `[mesh, scene, labels, shader]`.
- Expose high-level settings and derive related colors through tokens; procedural code should read `api.settings` and `api.tokens`.

## Manifest Reconciliation

Run `pnpm registry:build` after editing manifests and `pnpm test` before submitting. The validator checks that manifest `settings` and `tokens` exactly match the compiled TSX scene, so dead or missing manifest entries are caught early.
