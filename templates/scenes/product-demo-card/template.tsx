export default defineSpanScene({
  id: "product-demo-card",
  width: 1280,
  height: 720,
  durationMs: 6200,
  editModeTimeMs: 2100,
  settings: {
    headline: textSetting("Ship the exact demo", { label: "Headline" }),
    primary: colorSetting("#14b8a6", { label: "Primary color" }),
    accent: colorSetting("#2563eb", { label: "Accent color" }),
    ctaLabel: stringSetting("Create scene", { label: "Button label" }),
    metricValue: numberSetting(4.8, { label: "Metric value", min: 1, max: 8, step: 0.1 }),
    ctaFrame: rectSetting(
      { x: 0, y: 27, width: 214, height: 58 },
      { label: "CTA frame", overlay: "frame", visualId: "cta" }
    ),
    cursorStart: pointSetting(
      { x: 836, y: 388 },
      { label: "Cursor start", overlay: true, overlayGroup: "cursor-path", overlayOrder: 0, overlayOriginVisualId: "browser-body" }
    ),
    cursorClick: pointSetting(
      { x: 226, y: 414 },
      { label: "Cursor click", overlay: true, overlayGroup: "cursor-path", overlayOrder: 1, overlayOriginVisualId: "browser-body" }
    )
  },
  tokens: {
    backdrop: color.darken(settings.primary, 0.72),
    haloLeft: color.darken(settings.primary, 0.34),
    haloRight: color.darken(settings.accent, 0.34),
    ctaFill: settings.primary,
    ctaGlow: color.mix(settings.primary, "#ffffff", 0.62),
    metricSurface: color.mix(settings.accent, "#ffffff", 0.91),
    metricStroke: color.mix(settings.accent, "#ffffff", 0.66),
    metricText: color.darken(settings.accent, 0.42),
    metricLabel: color.darken(settings.accent, 0.18)
  },
  render({ settings, tokens }) {
    return (
      <Scene>
        <Rect id="background" x={0} y={0} width={1280} height={720} fill={tokens.backdrop} layer={0} />
        <Rect id="halo-left" x={-180} y={64} width={440} height={440} radius={220} fill={tokens.haloLeft} opacity={0.62} blur={34} layer={1} />
        <Rect id="halo-right" x={920} y={260} width={420} height={420} radius={210} fill={tokens.haloRight} opacity={0.42} blur={34} layer={1} />
        <MotionBox id="browser-motion" x={166} y={98} width={948} height={524} pivotX="50%" pivotY="50%" layer={2}>
          <Animation.SwoopIn start="0ms" duration="720ms" />
          <Animation.SwoopOut start="5400ms" duration="620ms" />
          <BrowserWindow id="browser" x={0} y={0} width="100%" height="100%" radius={28} headerHeight={66} fill="#f8fafc" stroke="#dbeafe" strokeWidth={2}>
            <Bento id="content-grid" x={54} y={100} width={840} height={370} columns={12} rows={6} gap={18}>
              <Cell id="copy-cell" col={1} row={1} colSpan={7} rowSpan={4} mode="position">
                <VStack id="copy-stack" x={0} y={0} width="100%" height={246} gap={18} align="start">
                  <Text id="headline" text={settings.headline} width="100%" height={126} size={58} color="#0f172a" layer={5}>
                    <TextEffect.Typewriter start="420ms" duration="920ms" />
                    <Animation.FadeIn start="420ms" duration="380ms" />
                  </Text>
                  <Text id="body" text="Programmatic spans can draw reusable scenes with deterministic GPU timing." width="92%" height={82} size={24} weight="500" color="#475569" layer={5}>
                    <Animation.FadeIn start="780ms" duration="360ms" />
                  </Text>
                </VStack>
              </Cell>
              <Cell id="metric-cell" col={9} row={2} colSpan={4} rowSpan={3} padding={8} align="center" justify="center">
                <Rect id="metric-card" x={0} y={0} width="100%" height="100%" radius={24} fill={tokens.metricSurface} stroke={tokens.metricStroke} strokeWidth={2} layer={5}>
                  <Animate prop="scale" from={0.9} to={1} start="1150ms" duration="360ms" ease="outCubic" />
                  <Animate prop="opacity" from={0} to={1} start="1150ms" duration="260ms" ease="outQuad" />
                </Rect>
                <VStack id="metric-stack" width="72%" height="58%" gap={10} align="center">
                  <Text id="metric-value" text="4.8x" width="100%" height="62%" size={54} color={tokens.metricText} align="center" layer={6}>
                    <TextEffect.Count from={1.0} to={settings.metricValue} start="1240ms" duration="680ms" step="decimal" suffix="x" />
                    <Animation.FadeIn start="1420ms" duration="260ms" />
                  </Text>
                  <Text id="metric-label" text="faster iteration" width="100%" height="28%" size={21} weight="600" color={tokens.metricLabel} align="center" opacity={0} layer={6}>
                    <Animation.FadeIn start="1740ms" duration="260ms" />
                  </Text>
                </VStack>
              </Cell>
              <Cell id="cta-cell" col={1} row={5} colSpan={4} rowSpan={2} align="start" justify="center">
                <MotionBox id="cta-motion" x={settings.ctaFrame.x} y={settings.ctaFrame.y} width={settings.ctaFrame.width} height={settings.ctaFrame.height} pivotX="50%" pivotY="50%">
                  <Animation.FadeIn start="1700ms" duration="340ms" />
                  <Animation.Pulse start="3090ms" duration="260ms" peak={0.96} easeIn="outQuad" easeOut="outCubic" />
                  <CTAButton id="cta" label={settings.ctaLabel} width="100%" height="100%" radius={18} fill={tokens.ctaFill} hoverStart="2920ms" clickStart="3090ms" hoverGlowFill={tokens.ctaGlow} layer={5} />
                </MotionBox>
              </Cell>
            </Bento>
            <CursorClick id="cursor" fromX={settings.cursorStart.x} fromY={settings.cursorStart.y} toX={settings.cursorClick.x} toY={settings.cursorClick.y} moveStart="2150ms" moveDuration="900ms" clickStart="3090ms" pulseStart="3060ms" pulseDuration="780ms" pulseColor={tokens.ctaFill} cursorWidth={56} layer={10} />
          </BrowserWindow>
        </MotionBox>
      </Scene>
    );
  }
});
