# Procedural Layer Lab

Exercises the broader `Procedural.Visual` frame graph:

- `api.mesh2d()` for generated triangle/quad geometry.
- `api.scene3d()` for serializable 3D scene proxy objects.
- `api.shader.wgsl()` for a validated WGSL postprocess layer.

The Studio preview renders these layers deterministically through the public preview renderer. Mont can later route the same typed payloads to the GPU renderer without changing authoring syntax.
