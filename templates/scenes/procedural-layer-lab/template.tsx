export default defineSpanScene({
  id: "procedural-layer-lab",
  width: 1280,
  height: 720,
  durationMs: 5200,
  editModeTimeMs: 2100,
  settings: {
    title: textSetting("Mesh, 3D, and shader in one node", { label: "Title" }),
    primary: colorSetting("#22c55e", { label: "Primary color" }),
    secondary: colorSetting("#2563eb", { label: "Secondary color" }),
    meshDepth: numberSetting(58, { label: "Mesh depth", min: 12, max: 96, step: 1 }),
    shaderAmount: numberSetting(0.42, { label: "Shader amount", min: 0, max: 1, step: 0.01 })
  },
  tokens: {
    backdrop: color.darken(settings.secondary, 0.78),
    surfaceA: color.mix(settings.primary, "#ffffff", 0.32),
    surfaceB: color.mix(settings.secondary, "#ffffff", 0.24),
    block: color.mix(settings.primary, settings.secondary, 0.36),
    glow: color.mix(settings.primary, "#ffffff", 0.54),
    ink: color.readableText(tokens.backdrop, "#07111f", "#ffffff")
  },
  render({ settings, tokens }) {
    return (
      <Scene>
        <Rect id="background" x={0} y={0} width={1280} height={720} fill={tokens.backdrop} layer={0} />
        <Rect id="green-glow" x={-180} y={140} width={520} height={520} radius={260} fill={tokens.surfaceA} opacity={0.24} blur={54} layer={1} />
        <Rect id="blue-glow" x={820} y={60} width={520} height={520} radius={260} fill={tokens.surfaceB} opacity={0.28} blur={56} layer={1} />
        <Procedural.Visual
          id="procedural-layer-system"
          x={0}
          y={0}
          width={1280}
          height={720}
          seed={29}
          layer={2}
          render={(api) => {
            const seconds = api.time.seconds;
            const depth = api.math.clamp(api.settings.meshDepth, 12, 96);
            const mesh = api.mesh2d("terrain");
            const scene = api.scene3d("blocks");
            const labels = api.layer2d("labels");

            mesh.noStroke();
            for (let row = 0; row < 9; row += 1) {
              for (let col = 0; col < 15; col += 1) {
                const x = 168 + col * 48;
                const y = 246 + row * 32;
                const waveA = Math.sin(col * 0.48 + row * 0.34 + seconds * 1.8) * depth;
                const waveB = Math.sin((col + 1) * 0.48 + row * 0.34 + seconds * 1.8) * depth;
                const waveC = Math.sin((col + 1) * 0.48 + (row + 1) * 0.34 + seconds * 1.8) * depth;
                const waveD = Math.sin(col * 0.48 + (row + 1) * 0.34 + seconds * 1.8) * depth;
                const fill = (row + col) % 2 === 0 ? api.tokens.surfaceA : api.tokens.surfaceB;
                mesh.fill(fill, 0.72).quad(
                  { x, y: y + waveA * 0.28 },
                  { x: x + 48, y: y + waveB * 0.28 },
                  { x: x + 48, y: y + 32 + waveC * 0.28 },
                  { x, y: y + 32 + waveD * 0.28 }
                );
              }
            }

            scene.camera({ z: 640, fov: 38 });
            scene.fill(api.tokens.block, 0.86).stroke("rgba(255,255,255,0.24)");
            for (let index = 0; index < 11; index += 1) {
              const orbit = index / 11 * Math.PI * 2 + seconds * 0.64;
              const radius = 160 + Math.sin(index) * 24;
              scene.box({
                x: Math.cos(orbit) * radius,
                y: -82 + Math.sin(index * 0.7 + seconds) * 46,
                z: Math.sin(orbit) * radius,
                width: 54,
                height: 54 + api.noise.wave(index, 1.4) * 42,
                depth: 54,
                fill: index % 2 === 0 ? api.tokens.block : api.tokens.glow,
                opacity: 0.78
              });
            }

            labels.noStroke();
            labels.fill(api.tokens.ink, 0.96);
            labels.text(api.settings.title, 76, 62, 820, 72, {
              size: 43,
              weight: "850",
              align: "left"
            });
            labels.fill(api.tokens.glow, 0.78);
            labels.text("typed mesh2d + scene3d + validated WGSL layer", 80, 124, 640, 44, {
              size: 23,
              weight: "650",
              align: "left"
            });

            const shader = api.shader.wgsl({
              id: "scanline-pass",
              target: "scene",
              opacity: api.settings.shaderAmount,
              uniforms: {
                amount: api.settings.shaderAmount,
                time: api.time.seconds
              },
              code: `
@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let line = sin(position.y * 0.18);
  let chroma = 0.18 + line * 0.08;
  return vec4f(chroma, 0.04, 0.22 + chroma, 1.0);
}
              `
            });

            return api.frame([mesh, scene, labels, shader]);
          }}
        />
      </Scene>
    );
  }
});
