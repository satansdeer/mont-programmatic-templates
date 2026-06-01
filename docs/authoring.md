# Template Authoring

Mont programmatic templates are TSX scene descriptions with explicit editable settings and hidden derived tokens.

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
