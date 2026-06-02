export default defineSpanScene({
  id: "procedural-flag-field",
  width: 1280,
  height: 720,
  durationMs: 5600,
  editModeTimeMs: 1800,
  settings: {
    headline: textSetting("Procedural fabric from code", { label: "Headline" }),
    primary: colorSetting("#14b8a6", { label: "Primary color" }),
    secondary: colorSetting("#2563eb", { label: "Secondary color" }),
    accent: colorSetting("#f59e0b", { label: "Accent color" }),
    waveAmplitude: numberSetting(38, { label: "Wave amplitude", min: 8, max: 72, step: 1 }),
    cellSize: numberSetting(18, { label: "Cell size", min: 10, max: 28, step: 1 })
  },
  tokens: {
    backdrop: color.darken(settings.secondary, 0.76),
    fabricLight: color.mix(settings.primary, "#ffffff", 0.5),
    fabricShadow: color.darken(settings.primary, 0.28),
    accentGlow: color.mix(settings.accent, "#ffffff", 0.34),
    ink: color.readableText(tokens.backdrop, "#07111f", "#ffffff")
  },
  render({ settings, tokens }) {
    return (
      <Scene>
        <Rect id="background" x={0} y={0} width={1280} height={720} fill={tokens.backdrop} layer={0} />
        <Rect id="field-glow-left" x={-140} y={120} width={380} height={380} radius={190} fill={tokens.fabricShadow} opacity={0.5} blur={44} layer={1} />
        <Rect id="field-glow-right" x={870} y={80} width={520} height={520} radius={260} fill={tokens.accentGlow} opacity={0.32} blur={56} layer={1} />
        <Procedural.Visual
          id="fabric-field"
          x={0}
          y={0}
          width={1280}
          height={720}
          seed={17}
          layer={2}
          render={(api) => {
            const t = api.time.normalized;
            const seconds = api.time.seconds;
            const tile = api.math.clamp(api.settings.cellSize, 10, 28);
            const amplitude = api.math.clamp(api.settings.waveAmplitude, 8, 72);
            const baseX = 180;
            const baseY = 188;
            const cols = 43;
            const rows = 18;
            const fabric = api.layer2d("fabric");
            const threads = api.layer2d("threads");
            const sparks = api.layer2d("sparks");
            const labels = api.layer2d("labels");
            fabric.noStroke();
            threads.noFill().stroke(api.tokens.fabricLight, 2).opacity(0.42);
            sparks.noStroke();
            labels.noStroke();

            for (let row = 0; row < 18; row += 1) {
              for (let col = 0; col < 43; col += 1) {
                const progress = col / cols;
                const phase = col * 0.42 + row * 0.31 + seconds * 2.2;
                const wave = Math.sin(phase) * amplitude * (1 - progress * 0.56);
                const ripple = Math.sin(phase * 1.8 + t * 6.28) * 5;
                const x = baseX + col * tile;
                const y = baseY + row * tile + wave + ripple;
                const alpha = 0.64 + Math.sin(phase + row) * 0.18;
                const fill = row % 3 === 0
                  ? api.tokens.fabricLight
                  : row % 3 === 1
                    ? api.settings.primary
                    : api.settings.secondary;
                fabric.fill(fill, alpha).rect(x, y, tile + 1.6, tile + 1.6, 4);
              }
            }

            for (let row = 0; row < 18; row += 1) {
              const y = baseY + row * tile + Math.sin(row * 0.36 + seconds * 2.2) * amplitude * 0.52;
              threads.line(baseX - 12, y, baseX + cols * tile + 10, y + Math.sin(row + seconds) * 18);
            }

            for (let col = 0; col < 43; col += 1) {
              const x = baseX + col * tile;
              const bend = Math.sin(col * 0.25 + seconds * 1.8) * 26;
              threads.stroke(api.tokens.fabricShadow, 1.4).opacity(0.3);
              threads.line(x, baseY - 8 + bend, x + Math.sin(col) * 12, baseY + rows * tile + bend * 0.2);
            }

            for (let i = 0; i < 58; i += 1) {
              const x = api.random.range(i, 42, api.width - 42);
              const y = api.random.range(i + 400, 54, api.height - 54);
              const drift = Math.sin(seconds * 1.3 + i * 0.43) * 16;
              const pulse = 1 + api.noise.wave(i, 1.2) * 4;
              sparks.fill(i % 2 === 0 ? api.tokens.accentGlow : api.tokens.fabricLight, 0.18 + api.random.value(i + 900) * 0.28);
              sparks.circle(x + drift, y, pulse);
            }

            labels.fill(api.tokens.ink, 0.94);
            labels.text(api.settings.headline, 88, 64, 680, 76, {
              size: 44,
              weight: "850",
              align: "left"
            });
            labels.fill(api.tokens.fabricLight, 0.84);
            labels.text("bounded loops + deterministic draw graph", 92, 122, 540, 44, {
              size: 23,
              weight: "650",
              align: "left"
            });

            return api.frame([fabric, threads, sparks, labels]);
          }}
        />
      </Scene>
    );
  }
});
