# Mont Programmatic Templates

Community templates, components, authoring tools, and showcase site for Mont programmatic spans.

This repository is intended to be public and contribution-friendly. It contains generic, brand-safe templates that can be used in Mont and in generated video outputs.

## Repository Layout

- `packages/runtime` - Public TSX compiler, evaluator, settings/tokens, diagnostics, and plain programmatic visual IR.
- `packages/preview-renderer` - Narrow canvas preview renderer and edit-overlay helpers for the public visual IR.
- `packages/template-sdk` - Manifest helpers and brand-safety checks.
- `packages/creator-studio` - Local template creator studio derived from the Mont programmatic spans workbench.
- `packages/showcase` - Static showcase website for browsing approved community templates and docs.
- `templates/components` - Reusable visual components.
- `templates/scenes` - Full scene templates.
- `templates/effects` - Motion/effect snippets and presets.
- `templates/packs` - Curated template packs.
- `registry` - Generated community registry consumed by Mont and the showcase.
- `docs` - Authoring, contribution, legal, and review policy docs.

## Local Development

```bash
pnpm install
pnpm registry:build
pnpm dev
pnpm studio:dev
pnpm showcase:dev
```

- `pnpm dev` starts every local app in parallel.
- Creator Studio runs on `http://localhost:4310`.
- Showcase runs on `http://localhost:4300`.
- `pnpm check` runs package TypeScript/Svelte checks.
- `pnpm test` runs checks, builds all packages/apps, and validates template manifests against compiled TSX.
- `pnpm build` builds the runtime packages, Creator Studio, and Showcase.

## License

Code and templates are licensed under Apache-2.0 unless a template manifest states otherwise. Generated video outputs are not subject to attribution requirements solely because a template from this repository was used.

See `LICENSE`, `CONTRIBUTING.md`, and `docs/legal-template-policy.md`.
