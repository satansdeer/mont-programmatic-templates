# Repository Architecture

This repository is the public community source for Mont programmatic templates.

Mont's private editor can merge:

- This public community registry.
- Private Mont-owned template registries.
- Customer-specific or internal template packs.

The public registry should not depend on private Mont editor internals. Public packages should expose stable artifact formats, schemas, and authoring helpers.

## Public Packages

- `@mont-templates/runtime`: DSL types and renderer-agnostic runtime contracts.
- `@mont-templates/template-sdk`: manifest and authoring helpers.
- `@mont-templates/creator-studio`: local authoring studio.
- `@mont-templates/showcase`: static showcase website.

## Generated Registry

`registry/community.json` is generated from template manifests and is intended for consumption by Mont and the showcase.
