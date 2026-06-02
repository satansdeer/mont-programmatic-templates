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

## Manifest Reconciliation

Run `pnpm registry:build` after editing manifests and `pnpm test` before submitting. The validator checks that manifest `settings` and `tokens` exactly match the compiled TSX scene, so dead or missing manifest entries are caught early.
