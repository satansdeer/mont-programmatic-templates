export default defineSpanScene({
  id: "asset-sprite-type-lab",
  width: 1280,
  height: 720,
  durationMs: 5200,
  editModeTimeMs: 1800,
  settings: {
    headline: textSetting("Assets animate\ninside templates", { label: "Headline" }),
    primary: colorSetting("#14b8a6", { label: "Primary color" }),
    accent: colorSetting("#f97316", { label: "Accent color" })
  },
  tokens: {
    backdrop: color.darken(settings.primary, 0.74),
    panel: color.mix(settings.primary, "#ffffff", 0.92),
    panelStroke: color.mix(settings.primary, "#ffffff", 0.54),
    primaryGlow: color.mix(settings.primary, "#ffffff", 0.38),
    accentGlow: color.mix(settings.accent, "#ffffff", 0.34),
    ink: color.darken(settings.primary, 0.54)
  },
  render({ settings, tokens }) {
    return (
      <Scene>
        <Rect id="background" x={0} y={0} width={1280} height={720} fill={tokens.backdrop} layer={0} />
        <Rect id="primary-glow" x={-150} y={98} width={480} height={480} radius={240} fill={tokens.primaryGlow} opacity={0.34} blur={58} layer={1} />
        <Rect id="accent-glow" x={910} y={160} width={420} height={420} radius={210} fill={tokens.accentGlow} opacity={0.32} blur={60} layer={1} />

        <MotionBox id="type-card-motion" x={116} y={96} width={760} height={440} pivotX="50%" pivotY="50%" layer={2}>
          <Animation.SwoopIn start="0ms" duration="680ms" />
          <Animation.SwoopOut start="4520ms" duration="560ms" />
          <Rect id="type-card" x={0} y={0} width="100%" height="100%" radius={28} fill={tokens.panel} stroke={tokens.panelStroke} strokeWidth={2} shadowColor="#020617" shadowBlur={34} shadowOpacity={0.24} layer={2} />
          <Text id="eyebrow" text="font assets + sprite assets" x={56} y={56} width={520} height={42} size={24} weight="700" fontFamily="InterAsset, Inter, sans-serif" color={tokens.ink} opacity={0.82} layer={3}>
            <Animation.FadeIn start="420ms" duration="260ms" />
          </Text>
          <Text id="headline" text={settings.headline} x={54} y={112} width={620} height={168} size={64} weight={430} fontFamily="InterAsset, Inter, sans-serif" color="#0f172a" layer={3}>
            <Animation.Sequence start="420ms" frames={[
              { at: "0ms", opacity: 0, y: 132, weight: 400 },
              { at: "480ms", opacity: 1, y: 112, weight: 840 },
              { at: "1280ms", opacity: 1, y: 112, weight: 520 },
              { at: "2600ms", opacity: 1, y: 112, weight: 780 }
            ]} />
          </Text>
          <Text id="body" text="Templates keep asset references symbolic. Mont resolves them from the project; the public showcase resolves them from CDN/local assets." x={58} y={306} width={560} height={88} size={24} weight="500" fontFamily="InterAsset, Inter, sans-serif" color="#334155" layer={3}>
            <Animation.FadeIn start="940ms" duration="380ms" />
          </Text>
        </MotionBox>

        <Image id="orbit-sprite-a" src={asset("orbit-sprite")} x={850} y={112} width={220} height={220} fit="contain" opacity={0} layer={4}>
          <Animation.Sequence start="540ms" frames={[
            { at: "0ms", opacity: 0, x: 920, y: 118, scale: 0.72, rotation: -18 },
            { at: "620ms", opacity: 1, x: 846, y: 112, scale: 1.04, rotation: 8 },
            { at: "1700ms", opacity: 1, x: 882, y: 150, scale: 0.92, rotation: 22 },
            { at: "3400ms", opacity: 0.9, x: 834, y: 104, scale: 1.02, rotation: 42 }
          ]} />
        </Image>
        <Image id="spark-sprite-a" src={asset("spark-sprite")} x={1032} y={320} width={150} height={150} fit="contain" opacity={0} layer={5}>
          <Animation.Sequence start="780ms" frames={[
            { at: "0ms", opacity: 0, x: 1060, y: 360, scale: 0.55, rotation: -24 },
            { at: "420ms", opacity: 1, x: 1032, y: 320, scale: 1.08, rotation: 8 },
            { at: "1320ms", opacity: 0.86, x: 990, y: 384, scale: 0.9, rotation: 32 },
            { at: "2800ms", opacity: 1, x: 1048, y: 300, scale: 1.02, rotation: 74 }
          ]} />
        </Image>
        <Image id="spark-sprite-b" src={asset("spark-sprite")} x={900} y={498} width={108} height={108} fit="contain" opacity={0} layer={4}>
          <Animation.Sequence start="1160ms" frames={[
            { at: "0ms", opacity: 0, x: 930, y: 528, scale: 0.42, rotation: 14 },
            { at: "520ms", opacity: 0.92, x: 900, y: 498, scale: 0.82, rotation: -16 },
            { at: "2100ms", opacity: 0.72, x: 958, y: 482, scale: 0.66, rotation: -46 }
          ]} />
        </Image>
      </Scene>
    );
  }
});
