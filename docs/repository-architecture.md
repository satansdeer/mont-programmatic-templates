# Repository Architecture

This repository is the public community source for Mont programmatic templates.

Mont's private editor can merge:

- This public community registry.
- Private Mont-owned template registries.
- Customer-specific or internal template packs.

The public registry should not depend on private Mont editor internals. Public packages should expose stable artifact formats, schemas, and authoring helpers.

## Public Packages

- `@mont-templates/runtime`: TSX compiler, evaluator, settings/tokens, diagnostics, and plain visual IR.
- `@mont-templates/preview-renderer`: Small canvas preview renderer plus edit-overlay helpers for template authoring.
- `@mont-templates/template-sdk`: manifest and authoring helpers.
- `@mont-templates/creator-studio`: local authoring studio.
- `@mont-templates/showcase`: static showcase website.

The public renderer is intentionally narrow. It previews programmatic template visuals and exposes visible placeholders for unsupported media. It does not include Mont's private editor renderer, timeline renderer, media auth, telemetry, subtitles, or text-editing internals.

## Local Apps

- Creator Studio: `pnpm studio:dev`, served at `http://localhost:4310`.
- Showcase: `pnpm showcase:dev`, served at `http://localhost:4300`.

Creator Studio saves edited files through a dev-only Vite endpoint. The endpoint accepts only `template.tsx`, `manifest.json`, and `README.md` under `templates/scenes`, `templates/components`, `templates/effects`, or `templates/packs`. Static builds are read-only.

Creator Studio also has a dev-only asset upload endpoint. It writes uploaded files only under the selected template's `assets/` folder and updates that template manifest's `assets` list. Public production assets should be mirrored to Bunny CDN and referenced with `assets[].publicUrl`; `assets[].localPath` remains useful for local authoring, tests, and static bundled demos.

## Generated Registry

`registry/community.json` is generated from template manifests and is intended for consumption by Mont and the showcase.
