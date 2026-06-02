import {
  createProgrammaticVisual,
  type ProgrammaticSpanAnimation,
  type ProgrammaticSpanDiagnostic,
  type ProgrammaticSpanEasing,
  type ProgrammaticSpanEffect,
  type ProgrammaticSpanExpression,
  type ProgrammaticSpanFrame,
  type ProgrammaticSpanLiteral,
  type ProgrammaticSpanNode,
  type ProgrammaticSpanSetting,
  type ProgrammaticSpanSettings,
  type ProgrammaticSpanSpec,
  type ProgrammaticSpanToken,
  type ProgrammaticSpanTokens,
  type ProgrammaticSpanVariables,
  type ProgrammaticVisual,
  type ProgrammaticVisualType
} from './types.js';

type EvaluationContext = {
  timeMs: number;
  sceneWidth: number;
  sceneHeight: number;
  variables: ProgrammaticSpanVariables;
  settings: ProgrammaticSpanSettings;
  tokens: ProgrammaticSpanTokens;
  tokenDefinitions: Map<string, ProgrammaticSpanToken>;
  resolvingTokens: Set<string>;
  diagnostics: ProgrammaticSpanDiagnostic[];
};

type RenderScope = {
  offsetX: number;
  offsetY: number;
  opacity: number;
  layerOffset: number;
  boundsWidth: number;
  boundsHeight: number;
};

type LayoutFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type BoxSpacing = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const SHAPE_KINDS = new Set<ProgrammaticVisualType>([
  'rect',
  'circle',
  'ellipse',
  'triangle',
  'arc',
  'diamond',
  'star',
  'calloutBox',
  'line',
  'arrow',
  'turnArrow'
]);

export function evaluateProgrammaticSpanFrame(
  spec: ProgrammaticSpanSpec,
  timeMs: number,
  variables: ProgrammaticSpanVariables = {},
  settings: ProgrammaticSpanSettings = {}
): ProgrammaticSpanFrame {
  const diagnostics: ProgrammaticSpanDiagnostic[] = [];
  const defaults = Object.fromEntries(spec.variables.map((variable) => [variable.id, variable.default]));
  const settingDefaults = Object.fromEntries(spec.settings.map((setting) => [setting.id, setting.default]));
  const tokenDefinitions = new Map(spec.tokens.map((token) => [token.id, token]));
  const context: EvaluationContext = {
    timeMs: clamp(timeMs, 0, spec.durationMs),
    sceneWidth: spec.width,
    sceneHeight: spec.height,
    variables: { ...defaults, ...variables },
    settings: { ...settingDefaults, ...settings },
    tokens: {},
    tokenDefinitions,
    resolvingTokens: new Set(),
    diagnostics
  };

  for (const token of spec.tokens) {
    resolveTokenValue(token.id, context, []);
  }

  const rootScope: RenderScope = {
    offsetX: 0,
    offsetY: 0,
    opacity: 1,
    layerOffset: 0,
    boundsWidth: spec.width,
    boundsHeight: spec.height
  };

  const visuals = evaluateNode(spec.root, context, rootScope).sort(compareVisualLayer);
  const effects = evaluateEffects(spec.root, context, rootScope);
  return { visuals, effects, diagnostics };
}

export function createDefaultProgrammaticSpanSettings(
  settings: ProgrammaticSpanSetting[]
): ProgrammaticSpanSettings {
  return Object.fromEntries(settings.map((setting) => [setting.id, setting.default]));
}

function evaluateNode(
  node: ProgrammaticSpanNode,
  context: EvaluationContext,
  scope: RenderScope,
  layoutFrame: LayoutFrame | null = null
): ProgrammaticVisual[] {
  if (!isNodeActive(node, context.timeMs)) return [];

  const props = applyLayoutFrame(
    applyAnimations(resolveProps(node.props, context), node.animations, node.startMs, context),
    layoutFrame
  );
  const x = lengthProp(props, 'x', 0, 'x', scope);
  const y = lengthProp(props, 'y', 0, 'y', scope);
  const width = lengthProp(props, 'width', scope.boundsWidth, 'x', scope);
  const height = lengthProp(props, 'height', scope.boundsHeight, 'y', scope);
  const opacity = scope.opacity * numberProp(props.opacity, 1);
  const nextScope: RenderScope = {
    offsetX: scope.offsetX + x,
    offsetY: scope.offsetY + y,
    opacity,
    layerOffset: scope.layerOffset + numberProp(props.layer, 0),
    boundsWidth: width,
    boundsHeight: height
  };

  switch (node.kind) {
    case 'scene':
      return node.children.flatMap((child) => evaluateNode(child, context, scope));
    case 'group':
      return node.children.flatMap((child) => evaluateNode(child, context, nextScope));
    case 'v-stack':
    case 'h-stack':
      return evaluateStackNode(node, props, context, scope, nextScope);
    case 'bento':
      return evaluateBentoNode(node, props, context, scope, nextScope);
    case 'cell':
      return evaluateCellNode(node, props, context, scope);
    case 'motion-box':
      return evaluateMotionBoxNode(node, props, context, nextScope);
    case 'browser-window':
      return browserWindowToVisuals(node, props, context, scope);
    case 'traffic-lights':
      return trafficLightsToVisuals(node.id, props, scope);
    case 'cta-button':
      return ctaButtonToVisuals(node, props, context, scope);
    case 'cursor':
      return cursorToVisuals(node.id, props, scope);
    case 'click-pulse':
      return clickPulseToVisuals(node.id, props, context, scope);
    case 'cursor-click':
      return cursorClickToVisuals(node.id, props, context, scope);
    case 'data-chart':
      return dataChartToVisuals(node.id, props, scope);
    case 'flowchart':
    case 'decision-tree':
      return decisionTreeToVisuals(node.id, props, context, scope);
    case 'effect':
      return [];
    default: {
      if (node.kind === 'text' && shouldRenderSplitText(props)) {
        return splitTextToVisuals(node.id, props, context, scope);
      }
      const visual = nodeToVisual(node, props, scope);
      if (!visual) return node.children.flatMap((child) => evaluateNode(child, context, nextScope));
      return [
        visual,
        ...node.children.flatMap((child) => evaluateNode(child, context, nextScope))
      ];
    }
  }
}

function evaluateEffects(
  node: ProgrammaticSpanNode,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticSpanEffect[] {
  if (!isNodeActive(node, context.timeMs)) return [];
  const props = applyAnimations(resolveProps(node.props, context), node.animations, node.startMs, context);
  const x = lengthProp(props, 'x', 0, 'x', scope);
  const y = lengthProp(props, 'y', 0, 'y', scope);
  const width = lengthProp(props, 'width', scope.boundsWidth, 'x', scope);
  const height = lengthProp(props, 'height', scope.boundsHeight, 'y', scope);
  const nextScope: RenderScope = {
    offsetX: scope.offsetX + x,
    offsetY: scope.offsetY + y,
    opacity: scope.opacity * numberProp(props.opacity, 1),
    layerOffset: scope.layerOffset + numberProp(props.layer, 0),
    boundsWidth: width,
    boundsHeight: height
  };

  if (node.kind === 'effect') {
    const type = stringProp(props.type, 'camera');
    if (type !== 'camera') {
      context.diagnostics.push({
        severity: 'warning',
        message: `Unsupported effect type "${type}".`,
        path: node.id
      });
      return [];
    }
    return [
      {
        id: node.id,
        kind: 'camera',
        centerX: nextScope.offsetX + lengthProp(props, 'centerX', width / 2, 'x', nextScope),
        centerY: nextScope.offsetY + lengthProp(props, 'centerY', height / 2, 'y', nextScope),
        zoom: Math.max(0.05, numberProp(props.zoom, numberProp(props.zoomScale, 1))),
        rotationDeg: numberProp(props.rotation, numberProp(props.rotationDeg, 0)),
        blurPx: Math.max(0, numberProp(props.blur, numberProp(props.blurPx, 0))),
        opacity: clamp(nextScope.opacity, 0, 1)
      }
    ];
  }

  return node.children.flatMap((child) => evaluateEffects(child, context, nextScope));
}

function evaluateStackNode(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope,
  nextScope: RenderScope
): ProgrammaticVisual[] {
  const children = activeVisualChildren(node, context);
  const gap = lengthProp(props, 'gap', 0, node.kind === 'v-stack' ? 'y' : 'x', nextScope);
  const padding = boxSpacing(props, 'padding', nextScope);
  const contentWidth = Math.max(1, nextScope.boundsWidth - padding.left - padding.right);
  const contentHeight = Math.max(1, nextScope.boundsHeight - padding.top - padding.bottom);
  const sizes = children.map((child) => {
    const childProps = applyAnimations(resolveProps(child.props, context), child.animations, child.startMs, context);
    return {
      child,
      props: childProps,
      width: measuredNodeWidth(child, childProps, { ...nextScope, boundsWidth: contentWidth, boundsHeight: contentHeight }),
      height: measuredNodeHeight(child, childProps, { ...nextScope, boundsWidth: contentWidth, boundsHeight: contentHeight })
    };
  });
  const totalMain = sizes.reduce(
    (sum, item) => sum + (node.kind === 'v-stack' ? item.height : item.width),
    Math.max(0, sizes.length - 1) * gap
  );
  const justify = stringProp(props.justify, 'start');
  const align = stringProp(props.align, 'start');
  let cursor = node.kind === 'v-stack'
    ? alignedOffset(justify, contentHeight, totalMain)
    : alignedOffset(justify, contentWidth, totalMain);

  const layoutScope: RenderScope = {
    offsetX: nextScope.offsetX + padding.left,
    offsetY: nextScope.offsetY + padding.top,
    opacity: nextScope.opacity,
    layerOffset: nextScope.layerOffset,
    boundsWidth: contentWidth,
    boundsHeight: contentHeight
  };

  return sizes.flatMap(({ child, width, height }) => {
    const frame = node.kind === 'v-stack'
      ? {
          id: child.id,
          x: alignedOffset(align, contentWidth, width),
          y: cursor,
          width,
          height
        }
      : {
          id: child.id,
          x: cursor,
          y: alignedOffset(align, contentHeight, height),
          width,
          height
        };
    cursor += (node.kind === 'v-stack' ? height : width) + gap;
    return evaluateNode(child, context, layoutScope, frame);
  });
}

function evaluateBentoNode(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  _scope: RenderScope,
  nextScope: RenderScope
): ProgrammaticVisual[] {
  const columns = Math.max(1, Math.round(numberProp(props.columns, 12)));
  const rows = Math.max(1, Math.round(numberProp(props.rows, 6)));
  const gap = lengthProp(props, 'gap', 0, 'min', nextScope);
  const columnGap = lengthProp(props, 'columnGap', gap, 'x', nextScope);
  const rowGap = lengthProp(props, 'rowGap', gap, 'y', nextScope);
  const padding = boxSpacing(props, 'padding', nextScope);
  const contentWidth = Math.max(1, nextScope.boundsWidth - padding.left - padding.right);
  const contentHeight = Math.max(1, nextScope.boundsHeight - padding.top - padding.bottom);
  const trackWidth = (contentWidth - columnGap * (columns - 1)) / columns;
  const trackHeight = (contentHeight - rowGap * (rows - 1)) / rows;
  const layoutScope: RenderScope = {
    offsetX: nextScope.offsetX + padding.left,
    offsetY: nextScope.offsetY + padding.top,
    opacity: nextScope.opacity,
    layerOffset: nextScope.layerOffset,
    boundsWidth: contentWidth,
    boundsHeight: contentHeight
  };

  return activeVisualChildren(node, context).flatMap((child) => {
    const childProps = applyAnimations(resolveProps(child.props, context), child.animations, child.startMs, context);
    const col = Math.max(1, Math.round(numberProp(childProps.col, numberProp(childProps.column, 1))));
    const row = Math.max(1, Math.round(numberProp(childProps.row, 1)));
    const colSpan = Math.max(1, Math.round(numberProp(childProps.colSpan, numberProp(childProps.columnSpan, 1))));
    const rowSpan = Math.max(1, Math.round(numberProp(childProps.rowSpan, 1)));
    const frame = {
      id: child.id,
      x: (col - 1) * (trackWidth + columnGap),
      y: (row - 1) * (trackHeight + rowGap),
      width: trackWidth * colSpan + columnGap * (colSpan - 1),
      height: trackHeight * rowSpan + rowGap * (rowSpan - 1)
    };
    return evaluateNode(child, context, layoutScope, frame);
  });
}

function evaluateCellNode(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticVisual[] {
  const x = lengthProp(props, 'x', 0, 'x', scope);
  const y = lengthProp(props, 'y', 0, 'y', scope);
  const width = lengthProp(props, 'width', scope.boundsWidth, 'x', scope);
  const height = lengthProp(props, 'height', scope.boundsHeight, 'y', scope);
  const padding = boxSpacing(props, 'padding', scope);
  const childScope: RenderScope = {
    offsetX: scope.offsetX + x + padding.left,
    offsetY: scope.offsetY + y + padding.top,
    opacity: scope.opacity * numberProp(props.opacity, 1),
    layerOffset: scope.layerOffset + numberProp(props.layer, 0),
    boundsWidth: Math.max(1, width - padding.left - padding.right),
    boundsHeight: Math.max(1, height - padding.top - padding.bottom)
  };

  if (stringProp(props.mode, 'position') === 'fit' && node.children.length === 1) {
    return evaluateNode(node.children[0], context, childScope, {
      id: node.children[0].id,
      x: 0,
      y: 0,
      width: childScope.boundsWidth,
      height: childScope.boundsHeight
    });
  }

  const align = stringProp(props.align, 'start');
  const justify = stringProp(props.justify, 'start');
  return node.children.flatMap((child) => {
    const childProps = applyAnimations(resolveProps(child.props, context), child.animations, child.startMs, context);
    const childWidth = measuredNodeWidth(child, childProps, childScope);
    const childHeight = measuredNodeHeight(child, childProps, childScope);
    const frame = {
      id: child.id,
      x: hasPosition(child, 'x') ? lengthProp(childProps, 'x', 0, 'x', childScope) : alignedOffset(align, childScope.boundsWidth, childWidth),
      y: hasPosition(child, 'y') ? lengthProp(childProps, 'y', 0, 'y', childScope) : alignedOffset(justify, childScope.boundsHeight, childHeight),
      width: childWidth,
      height: childHeight
    };
    return evaluateNode(child, context, childScope, frame);
  });
}

function evaluateMotionBoxNode(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticVisual[] {
  const visuals = node.children.flatMap((child) => evaluateNode(child, context, scope));
  const scale = numberProp(props.scale, 1);
  const transform = {
    pivotX: scope.offsetX + resolveLength(props.pivotX, scope.boundsWidth / 2, 'x', scope),
    pivotY: scope.offsetY + resolveLength(props.pivotY, scope.boundsHeight / 2, 'y', scope),
    scaleX: numberProp(props.scaleX, scale),
    scaleY: numberProp(props.scaleY, scale),
    rotation: numberProp(props.rotation, numberProp(props.rotationDeg, 0))
  };
  if (
    Math.abs(transform.scaleX - 1) < 0.0001 &&
    Math.abs(transform.scaleY - 1) < 0.0001 &&
    Math.abs(transform.rotation) < 0.0001
  ) {
    return visuals;
  }
  return visuals.map((visual) => transformVisual(visual, transform));
}

function browserWindowToVisuals(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticVisual[] {
  const x = scope.offsetX + lengthProp(props, 'x', 0, 'x', scope);
  const y = scope.offsetY + lengthProp(props, 'y', 0, 'y', scope);
  const width = lengthProp(props, 'width', 860, 'x', scope);
  const height = lengthProp(props, 'height', 480, 'y', scope);
  const headerHeight = lengthProp(props, 'headerHeight', 66, 'y', scope);
  const radius = lengthProp(props, 'radius', 28, 'min', scope);
  const fill = stringProp(props.fill, '#f8fafc');
  const stroke = stringProp(props.stroke, '#dbeafe');
  const strokeWidth = numberProp(props.strokeWidth, 2);
  const layer = scope.layerOffset + numberProp(props.layer, 0);
  const opacity = scope.opacity * numberProp(props.opacity, 1);
  const headerFill = stringProp(props.headerFill, '#e2e8f0');
  const dividerFill = stringProp(props.dividerFill, '#cbd5e1');
  const bodyId = `${node.id}-body`;
  const visuals = [
    createProgrammaticVisual(bodyId, 'rect', {
      x,
      y,
      width,
      height,
      radius,
      fill,
      stroke,
      strokeWidth,
      opacity,
      layer
    }),
    createProgrammaticVisual(`${node.id}-header`, 'rect', {
      x,
      y,
      width,
      height: headerHeight,
      radius,
      fill: headerFill,
      opacity,
      layer: layer + 0.1
    }),
    createProgrammaticVisual(`${node.id}-divider`, 'rect', {
      x,
      y: y + headerHeight,
      width,
      height: 2,
      fill: dividerFill,
      opacity,
      layer: layer + 0.2
    }),
    ...trafficLightsToVisuals(`${node.id}-lights`, {
      x: 36,
      y: headerHeight / 2 - 12,
      size: 24,
      gap: 18,
      layer: layer + 0.3
    }, { ...scope, offsetX: x, offsetY: y, boundsWidth: width, boundsHeight: headerHeight, layerOffset: 0 })
  ];
  const childScope: RenderScope = {
    offsetX: x,
    offsetY: y,
    opacity,
    layerOffset: layer + 1,
    boundsWidth: width,
    boundsHeight: height
  };
  return [
    ...visuals,
    ...node.children.flatMap((child) => evaluateNode(child, context, childScope))
  ];
}

function trafficLightsToVisuals(
  id: string,
  props: Record<string, ProgrammaticSpanLiteral>,
  scope: RenderScope
): ProgrammaticVisual[] {
  const x = scope.offsetX + lengthProp(props, 'x', 0, 'x', scope);
  const y = scope.offsetY + lengthProp(props, 'y', 0, 'y', scope);
  const size = lengthProp(props, 'size', 18, 'min', scope);
  const gap = lengthProp(props, 'gap', 10, 'x', scope);
  const layer = scope.layerOffset + numberProp(props.layer, 0);
  return ['#ef4444', '#f59e0b', '#22c55e'].map((fill, index) =>
    createProgrammaticVisual(`${id}-${index}`, 'circle', {
      x: x + index * (size + gap),
      y,
      radius: size / 2,
      width: size,
      height: size,
      fill,
      opacity: scope.opacity,
      layer
    })
  );
}

function ctaButtonToVisuals(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticVisual[] {
  const x = scope.offsetX + lengthProp(props, 'x', 0, 'x', scope);
  const y = scope.offsetY + lengthProp(props, 'y', 0, 'y', scope);
  const width = lengthProp(props, 'width', 214, 'x', scope);
  const height = lengthProp(props, 'height', 58, 'y', scope);
  const clickStart = readTimeMs(props.clickStart, -1);
  const hoverStart = readTimeMs(props.hoverStart, -1);
  const clickProgress = clickStart >= 0 ? normalizedWindow(context.timeMs, clickStart, 280) : 0;
  const hoverProgress = hoverStart >= 0 ? normalizedWindow(context.timeMs, hoverStart, 780) : 0;
  const hoverScale = hoverProgress > 0 ? Math.sin(hoverProgress * Math.PI) * 0.02 : 0;
  const clickScale = clickProgress > 0 ? Math.sin(clickProgress * Math.PI) * -0.05 : 0;
  const scale = 1 + hoverScale + clickScale;
  const adjustedWidth = width * scale;
  const adjustedHeight = height * scale;
  const adjustedX = x + (width - adjustedWidth) / 2;
  const adjustedY = y + (height - adjustedHeight) / 2;
  const layer = scope.layerOffset + numberProp(props.layer, 0);
  const fill = stringProp(props.fill, '#14b8a6');
  const visuals: ProgrammaticVisual[] = [];
  if (hoverProgress > 0) {
    visuals.push(createProgrammaticVisual(`${node.id}-hover`, 'rect', {
      x: adjustedX - 14,
      y: adjustedY - 14,
      width: adjustedWidth + 28,
      height: adjustedHeight + 28,
      radius: lengthProp(props, 'radius', 18, 'min', scope) + 12,
      fill: stringProp(props.hoverGlowFill, fill),
      opacity: Math.sin(hoverProgress * Math.PI) * 0.28,
      blur: 18,
      layer: layer - 0.2
    }));
  }
  visuals.push(createProgrammaticVisual(node.id, 'rect', {
    x: adjustedX,
    y: adjustedY,
    width: adjustedWidth,
    height: adjustedHeight,
    radius: lengthProp(props, 'radius', 18, 'min', scope),
    fill,
    opacity: scope.opacity * numberProp(props.opacity, 1),
    layer
  }));
  visuals.push(createProgrammaticVisual(`${node.id}-label`, 'text', {
    x: adjustedX,
    y: adjustedY,
    width: adjustedWidth,
    height: adjustedHeight,
    text: stringProp(props.label, 'Create scene'),
    size: lengthProp(props, 'size', 20, 'y', scope),
    weight: stringProp(props.weight, '700'),
    color: stringProp(props.color, '#ffffff'),
    align: 'center',
    verticalAlign: 'middle',
    opacity: scope.opacity,
    layer: layer + 0.1
  }));
  return visuals;
}

function cursorClickToVisuals(
  id: string,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticVisual[] {
  const fromX = lengthProp(props, 'fromX', 0, 'x', scope);
  const fromY = lengthProp(props, 'fromY', 0, 'y', scope);
  const toX = lengthProp(props, 'toX', fromX, 'x', scope);
  const toY = lengthProp(props, 'toY', fromY, 'y', scope);
  const moveStart = readTimeMs(props.moveStart, 0);
  const moveDuration = readTimeMs(props.moveDuration, 900);
  const moveT = easeProgress(normalizedWindow(context.timeMs, moveStart, moveDuration), 'inOutCubic');
  const clickStart = readTimeMs(props.clickStart, Number.POSITIVE_INFINITY);
  const dip = normalizedWindow(context.timeMs, clickStart, 220);
  const dipOffset = Math.sin(dip * Math.PI) * 7;
  const x = fromX + (toX - fromX) * moveT;
  const y = fromY + (toY - fromY) * moveT + dipOffset;
  return [
    ...clickPulseToVisuals(`${id}-pulse`, {
      x: toX,
      y: toY,
      start: props.pulseStart ?? props.clickStart,
      duration: props.pulseDuration ?? 760,
      color: props.pulseColor,
      layer: numberProp(props.layer, 0) - 0.1
    }, context, scope),
    ...cursorToVisuals(id, {
      ...props,
      x,
      y,
      width: props.cursorWidth ?? props.width
    }, scope)
  ];
}

function cursorToVisuals(
  id: string,
  props: Record<string, ProgrammaticSpanLiteral>,
  scope: RenderScope
): ProgrammaticVisual[] {
  const x = scope.offsetX + lengthProp(props, 'x', 0, 'x', scope);
  const y = scope.offsetY + lengthProp(props, 'y', 0, 'y', scope);
  const width = lengthProp(props, 'width', 56, 'x', scope);
  const height = lengthProp(props, 'height', width * 1.32, 'y', scope);
  const layer = scope.layerOffset + numberProp(props.layer, 0);
  return [
    createProgrammaticVisual(id, 'image', {
      x,
      y,
      width,
      height,
      kind: 'cursor',
      fill: stringProp(props.fill, '#ffffff'),
      stroke: stringProp(props.stroke, '#0f172a'),
      strokeWidth: numberProp(props.strokeWidth, 5),
      opacity: scope.opacity,
      layer
    })
  ];
}

function clickPulseToVisuals(
  id: string,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticVisual[] {
  const start = readTimeMs(props.start ?? props.pulseStart, readTimeMs(props.clickStart, 0));
  const duration = readTimeMs(props.duration ?? props.pulseDuration, 760);
  const t = normalizedWindow(context.timeMs, start, duration);
  if (t <= 0 || t >= 1) return [];
  const radius = lengthProp(props, 'radius', 22 + t * 46, 'min', scope);
  return [
    createProgrammaticVisual(id, 'circle', {
      x: scope.offsetX + lengthProp(props, 'x', 0, 'x', scope) - radius,
      y: scope.offsetY + lengthProp(props, 'y', 0, 'y', scope) - radius,
      width: radius * 2,
      height: radius * 2,
      radius,
      fill: 'transparent',
      stroke: stringProp(props.color, '#14b8a6'),
      strokeWidth: Math.max(2, 8 * (1 - t)),
      opacity: (1 - t) * scope.opacity,
      layer: scope.layerOffset + numberProp(props.layer, 0)
    })
  ];
}

function dataChartToVisuals(
  id: string,
  props: Record<string, ProgrammaticSpanLiteral>,
  scope: RenderScope
): ProgrammaticVisual[] {
  const x = scope.offsetX + lengthProp(props, 'x', 0, 'x', scope);
  const y = scope.offsetY + lengthProp(props, 'y', 0, 'y', scope);
  const width = lengthProp(props, 'width', 320, 'x', scope);
  const height = lengthProp(props, 'height', 200, 'y', scope);
  const layer = scope.layerOffset + numberProp(props.layer, 0);
  const values = Array.isArray(props.values) ? props.values.map((value) => Number(value) || 0) : [24, 46, 62, 78];
  const max = Math.max(1, ...values);
  const axisColor = stringProp(props.axisColor, '#cbd5e1');
  const barGap = width * 0.08;
  const axisLeft = x + width * 0.16;
  const axisBottom = y + height * 0.86;
  const chartWidth = width * 0.72;
  const chartHeight = height * 0.58;
  const barWidth = (chartWidth - barGap * (values.length - 1)) / values.length;
  const fill = stringProp(props.fill, '#14b8a6');
  const visuals = [
    createProgrammaticVisual(`${id}-axis-x`, 'rect', {
      x: axisLeft,
      y: axisBottom,
      width: chartWidth,
      height: 3,
      fill: axisColor,
      opacity: scope.opacity,
      layer
    }),
    createProgrammaticVisual(`${id}-axis-y`, 'rect', {
      x: axisLeft,
      y: axisBottom - chartHeight,
      width: 3,
      height: chartHeight,
      fill: axisColor,
      opacity: scope.opacity,
      layer
    })
  ];
  values.forEach((value, index) => {
    const barHeight = Math.max(8, (value / max) * chartHeight);
    visuals.push(createProgrammaticVisual(`${id}-bar-${index}`, 'rect', {
      x: axisLeft + 18 + index * (barWidth + barGap),
      y: axisBottom - barHeight,
      width: barWidth,
      height: barHeight,
      radius: Math.min(14, barWidth / 2),
      fill,
      opacity: scope.opacity,
      layer: layer + 0.1 + index * 0.01
    }));
  });
  return visuals;
}

function decisionTreeToVisuals(
  id: string,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticVisual[] {
  const x = scope.offsetX + lengthProp(props, 'x', 0, 'x', scope);
  const y = scope.offsetY + lengthProp(props, 'y', 0, 'y', scope);
  const width = lengthProp(props, 'width', 520, 'x', scope);
  const height = lengthProp(props, 'height', 280, 'y', scope);
  const layer = scope.layerOffset + numberProp(props.layer, 0);
  const fill = stringProp(props.fill, '#e0f2fe');
  const stroke = stringProp(props.stroke, '#38bdf8');
  const color = stringProp(props.color, '#082f49');
  const labels = Array.isArray(props.labels) ? props.labels.map((value) => String(value)) : ['Input', 'Branch A', 'Branch B'];
  const nodeWidth = width * 0.28;
  const nodeHeight = height * 0.22;
  const root = { x: x + width / 2 - nodeWidth / 2, y: y + height * 0.1 };
  const left = { x: x + width * 0.14, y: y + height * 0.68 };
  const right = { x: x + width * 0.58, y: y + height * 0.68 };
  return [
    createProgrammaticVisual(`${id}-line-left`, 'line', {
      x1: root.x + nodeWidth / 2,
      y1: root.y + nodeHeight,
      x2: left.x + nodeWidth / 2,
      y2: left.y,
      stroke,
      strokeWidth: 4,
      opacity: scope.opacity,
      layer
    }),
    createProgrammaticVisual(`${id}-line-right`, 'line', {
      x1: root.x + nodeWidth / 2,
      y1: root.y + nodeHeight,
      x2: right.x + nodeWidth / 2,
      y2: right.y,
      stroke,
      strokeWidth: 4,
      opacity: scope.opacity,
      layer
    }),
    ...[root, left, right].flatMap((point, index) => [
      createProgrammaticVisual(`${id}-node-${index}`, 'rect', {
        x: point.x,
        y: point.y,
        width: nodeWidth,
        height: nodeHeight,
        radius: 18,
        fill,
        stroke,
        strokeWidth: 2,
        opacity: scope.opacity,
        layer: layer + 0.1
      }),
      createProgrammaticVisual(`${id}-label-${index}`, 'text', {
        x: point.x,
        y: point.y,
        width: nodeWidth,
        height: nodeHeight,
        text: labels[index] ?? `Node ${index + 1}`,
        size: 22,
        weight: '700',
        color,
        align: 'center',
        verticalAlign: 'middle',
        opacity: scope.opacity,
        layer: layer + 0.2
      })
    ])
  ];
}

function nodeToVisual(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  scope: RenderScope
): ProgrammaticVisual | null {
  if (node.kind === 'text') {
    const text = textValueForProps(props);
    return createProgrammaticVisual(node.id, 'text', {
      ...visualBoxAttributes(props, scope, 320, 80),
      text,
      size: lengthProp(props, 'size', lengthProp(props, 'fontSize', 32, 'y', scope), 'y', scope),
      weight: props.weight ?? props.fontWeight ?? '700',
      color: stringProp(props.color, '#0f172a'),
      align: stringProp(props.align, 'left'),
      verticalAlign: stringProp(props.verticalAlign, 'top'),
      fontFamily: stringProp(props.fontFamily, 'Inter, ui-sans-serif, system-ui, sans-serif')
    });
  }
  if (node.kind === 'image' || node.kind === 'lottie' || node.kind === 'model3d') {
    return createProgrammaticVisual(node.id, node.kind, {
      ...visualBoxAttributes(props, scope, 240, 180),
      src: props.src ?? null,
      fit: props.fit ?? 'contain',
      kind: props.kind ?? node.kind
    });
  }
  if (SHAPE_KINDS.has(node.kind as ProgrammaticVisualType)) {
    return createProgrammaticVisual(node.id, node.kind as ProgrammaticVisualType, {
      ...visualBoxAttributes(props, scope, 120, 90),
      fill: props.fill ?? 'transparent',
      stroke: props.stroke ?? null,
      strokeWidth: props.strokeWidth ?? 0,
      radius: props.radius ?? 0,
      points: props.points ?? null,
      x1: props.x1 ?? null,
      y1: props.y1 ?? null,
      x2: props.x2 ?? null,
      y2: props.y2 ?? null
    });
  }
  return null;
}

function splitTextToVisuals(
  id: string,
  props: Record<string, ProgrammaticSpanLiteral>,
  context: EvaluationContext,
  scope: RenderScope
): ProgrammaticVisual[] {
  const text = textValueForProps(props);
  const mode = revealUnitToMode(stringProp(props.textRevealUnit, stringProp(props.revealSplit, 'letter')));
  const style = stringProp(props.textRevealStyle, 'fade');
  const progress = clamp(numberProp(props.textRevealProgress, 1), 0, 1);
  const stagger = numberProp(props.textRevealStaggerMs, readTimeMs(props.revealStagger, mode === 'word' ? 90 : 28));
  const duration = numberProp(props.textRevealDurationMs, readTimeMs(props.revealDuration, 320));
  const pieces = mode === 'word' ? splitWords(text) : Array.from(text);
  const box = visualBoxAttributes(props, scope, 360, 90);
  const size = lengthProp(props, 'size', 34, 'y', scope);
  const lineHeight = numberProp(props.lineHeight, 1.08) * size;
  const maxCharsPerLine = Math.max(1, Math.floor(numberProp(box.width, 360) / (size * 0.56)));
  const positions = measureTextPieces(pieces, mode, maxCharsPerLine, size, lineHeight, stringProp(props.align, 'left'), numberProp(box.width, 360));
  const totalDuration = Math.max(1, duration + Math.max(0, pieces.length - 1) * stagger);
  const elapsed = progress * totalDuration;
  const visuals: ProgrammaticVisual[] = [];
  pieces.forEach((piece, index) => {
    const t = style === 'typewriter' && stagger <= 0
      ? clamp(progress * pieces.length - index, 0, 1)
      : clamp((elapsed - index * stagger) / Math.max(1, duration), 0, 1);
    const eased = easeProgress(t, 'outCubic');
    if (t <= 0) return;
    const position = positions[index];
    const offsetDistance = lengthProp(props, 'textRevealDistance', lengthProp(props, 'revealDistance', 28, 'min', scope), 'min', scope);
    const direction = stringProp(props.textRevealDirection, stringProp(props.revealDirection, 'bottom'));
    const shouldMove = style !== 'typewriter' && style !== 'wipe';
    const delta = shouldMove ? revealDelta(direction, offsetDistance * (1 - eased)) : { x: 0, y: 0 };
    const opacityFrom = numberProp(props.textRevealOpacityFrom, style === 'typewriter' || style === 'wipe' ? 1 : 0);
    const pieceOpacity = opacityFrom + (1 - opacityFrom) * eased;
    const scaleFrom = numberProp(props.textRevealScaleFrom, 1);
    const pieceScale = scaleFrom + (1 - scaleFrom) * eased;
    visuals.push(createProgrammaticVisual(`${id}-reveal-${index}`, 'text', {
      ...box,
      x: numberProp(box.x, 0) + position.x + delta.x,
      y: numberProp(box.y, 0) + position.y + delta.y,
      width: position.width * pieceScale,
      height: lineHeight,
      text: piece,
      size,
      weight: props.weight ?? props.fontWeight ?? '700',
      color: props.color ?? '#0f172a',
      opacity: scope.opacity * pieceOpacity * numberProp(props.opacity, 1),
      align: 'left',
      verticalAlign: 'top',
      layer: numberProp(box.layer, 0) + index * 0.001
    }));
  });
  return visuals;
}

function shouldRenderSplitText(props: Record<string, ProgrammaticSpanLiteral>): boolean {
  const split = stringProp(props.revealSplit, '');
  return split === 'letter' ||
    split === 'word' ||
    stringProp(props.textRevealMode, '') === 'reveal';
}

function textValueForProps(props: Record<string, ProgrammaticSpanLiteral>): string {
  if (stringProp(props.textNumberMode, '') !== 'count') {
    return stringProp(props.text, '');
  }
  const rawValue = numberProp(props.textNumberValue, 0);
  const step = props.textNumberStep;
  const decimals = Math.max(0, Math.round(numberProp(props.textNumberDecimals, decimalsFromStep(step))));
  const trimTrailingZeros = Boolean(props.textNumberTrimTrailingZeros);
  let value = rawValue.toFixed(decimals);
  if (trimTrailingZeros && value.includes('.')) {
    value = value.replace(/\.?0+$/, '');
  }
  return `${stringProp(props.textNumberPrefix, '')}${value}${stringProp(props.textNumberSuffix, '')}`;
}

function decimalsFromStep(step: ProgrammaticSpanLiteral | undefined): number {
  if (step === 'integer') return 0;
  if (step === 'decimal') return 1;
  if (typeof step === 'number') {
    const parts = String(step).split('.');
    return parts[1]?.length ?? 0;
  }
  if (typeof step === 'string') {
    const numeric = Number.parseFloat(step);
    if (Number.isFinite(numeric)) return decimalsFromStep(numeric);
  }
  return 0;
}

function revealUnitToMode(unit: string): 'letter' | 'word' {
  switch (unit) {
    case 'words':
    case 'word':
      return 'word';
    default:
      return 'letter';
  }
}

function resolveProps(
  props: Record<string, ProgrammaticSpanExpression>,
  context: EvaluationContext
): Record<string, ProgrammaticSpanLiteral> {
  return Object.fromEntries(Object.entries(props).map(([key, value]) => [key, resolveExpression(value, context)]));
}

function resolveExpression(
  expression: ProgrammaticSpanExpression,
  context: EvaluationContext
): ProgrammaticSpanLiteral {
  if (isExpressionRecord(expression, 'variable-ref')) {
    return context.variables[expression.name] ?? null;
  }
  if (isExpressionRecord(expression, 'setting-ref')) {
    return resolveLiteralPath(context.settings[expression.name], expression.path);
  }
  if (isExpressionRecord(expression, 'token-ref')) {
    return resolveTokenValue(expression.name, context, expression.path);
  }
  if (isExpressionRecord(expression, 'call')) {
    const args = expression.args.map((arg) => resolveExpression(arg, context));
    switch (expression.callee) {
      case 'color.mix':
        return colorMix(stringLiteralValue(args[0], '#000000'), stringLiteralValue(args[1], '#ffffff'), numericLiteral(args[2], 0.5));
      case 'color.lighten':
        return colorMix(stringLiteralValue(args[0], '#000000'), '#ffffff', numericLiteral(args[1], 0.2));
      case 'color.darken':
        return colorMix(stringLiteralValue(args[0], '#000000'), '#000000', numericLiteral(args[1], 0.2));
      case 'color.readableText':
        return readableTextColor(stringLiteralValue(args[0], '#000000'));
      default:
        return null;
    }
  }
  return expression;
}

function isExpressionRecord<TKind extends 'variable-ref' | 'setting-ref' | 'token-ref' | 'call'>(
  value: ProgrammaticSpanExpression,
  kind: TKind
): value is Extract<ProgrammaticSpanExpression, { kind: TKind }> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'kind' in value && value.kind === kind;
}

function resolveTokenValue(
  tokenId: string,
  context: EvaluationContext,
  path: string[]
): ProgrammaticSpanLiteral {
  if (Object.prototype.hasOwnProperty.call(context.tokens, tokenId)) {
    return resolveLiteralPath(context.tokens[tokenId], path);
  }
  const token = context.tokenDefinitions.get(tokenId);
  if (!token) return null;
  if (context.resolvingTokens.has(tokenId)) {
    context.diagnostics.push({
      severity: 'warning',
      message: `Token "${tokenId}" has a circular dependency.`,
      path: `tokens.${tokenId}`
    });
    return null;
  }
  context.resolvingTokens.add(tokenId);
  context.tokens[tokenId] = resolveExpression(token.value, context);
  context.resolvingTokens.delete(tokenId);
  return resolveLiteralPath(context.tokens[tokenId], path);
}

function resolveLiteralPath(value: ProgrammaticSpanLiteral | undefined, path: string[]): ProgrammaticSpanLiteral {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = current[part];
  }
  return current ?? null;
}

function applyAnimations(
  baseProps: Record<string, ProgrammaticSpanLiteral>,
  animations: ProgrammaticSpanAnimation[],
  nodeStartMs: number,
  context: EvaluationContext
): Record<string, ProgrammaticSpanLiteral> {
  const props = { ...baseProps };
  const touchedProps = new Set<string>();
  for (const animation of animations) {
    const relativeTime = context.timeMs - Math.max(0, nodeStartMs || 0) - animation.startMs;
    const from = animation.from == null ? props[animation.prop] ?? animation.to : resolveExpression(animation.from, context);
    const to = resolveExpression(animation.to, context);
    if (relativeTime <= 0) {
      if (!touchedProps.has(animation.prop)) {
        props[animation.prop] = from;
        touchedProps.add(animation.prop);
      }
    } else if (relativeTime >= animation.durationMs) {
      props[animation.prop] = to;
      touchedProps.add(animation.prop);
    } else {
      props[animation.prop] = interpolateValue(from, to, easeProgress(relativeTime / animation.durationMs, animation.ease));
      touchedProps.add(animation.prop);
    }
  }
  return props;
}

function interpolateValue(
  from: ProgrammaticSpanLiteral,
  to: ProgrammaticSpanLiteral,
  t: number
): ProgrammaticSpanLiteral {
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * t;
  if (typeof from === 'string' && typeof to === 'string') {
    const color = interpolateColor(from, to, t);
    return color ?? (t < 0.5 ? from : to);
  }
  return t < 0.5 ? from : to;
}

function easeProgress(t: number, easing: ProgrammaticSpanEasing): number {
  const value = clamp(t, 0, 1);
  switch (easing) {
    case 'inQuad':
      return value * value;
    case 'outQuad':
      return 1 - (1 - value) * (1 - value);
    case 'inOutQuad':
      return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
    case 'outCubic':
      return 1 - Math.pow(1 - value, 3);
    case 'inOutCubic':
      return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
    default:
      return value;
  }
}

function visualBoxAttributes(
  props: Record<string, ProgrammaticSpanLiteral>,
  scope: RenderScope,
  fallbackWidth: number,
  fallbackHeight: number
): Record<string, ProgrammaticSpanLiteral> {
  return {
    x: scope.offsetX + lengthProp(props, 'x', 0, 'x', scope),
    y: scope.offsetY + lengthProp(props, 'y', 0, 'y', scope),
    width: lengthProp(props, 'width', fallbackWidth, 'x', scope),
    height: lengthProp(props, 'height', fallbackHeight, 'y', scope),
    opacity: scope.opacity * numberProp(props.opacity, 1),
    layer: scope.layerOffset + numberProp(props.layer, 0),
    blur: numberProp(props.blur, 0),
    shadowColor: props.shadowColor ?? null,
    shadowBlur: props.shadowBlur ?? 0,
    shadowOffsetX: props.shadowOffsetX ?? 0,
    shadowOffsetY: props.shadowOffsetY ?? 0,
    glowColor: props.glowColor ?? null,
    glowBlur: props.glowBlur ?? 0,
    rotation: props.rotation ?? props.rotationDeg ?? 0,
    scaleX: props.scaleX ?? props.scale ?? 1,
    scaleY: props.scaleY ?? props.scale ?? 1
  };
}

function measuredNodeWidth(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  scope: RenderScope
): number {
  if (props.width != null) return lengthValue(props.width, scope.boundsWidth, scope);
  switch (node.kind) {
    case 'browser-window':
      return 860;
    case 'cta-button':
      return 214;
    case 'text':
      return Math.min(scope.boundsWidth, Math.max(80, stringProp(props.text, '').length * lengthProp(props, 'size', 32, 'x', scope) * 0.56));
    case 'cursor':
    case 'cursor-click':
      return 56;
    default:
      return Math.min(scope.boundsWidth, 240);
  }
}

function measuredNodeHeight(
  node: ProgrammaticSpanNode,
  props: Record<string, ProgrammaticSpanLiteral>,
  scope: RenderScope
): number {
  if (props.height != null) return lengthValue(props.height, scope.boundsHeight, scope);
  switch (node.kind) {
    case 'browser-window':
      return 480;
    case 'cta-button':
      return 58;
    case 'text':
      return Math.max(32, lengthProp(props, 'size', 32, 'y', scope) * 1.2);
    case 'cursor':
    case 'cursor-click':
      return 74;
    default:
      return Math.min(scope.boundsHeight, 160);
  }
}

function activeVisualChildren(node: ProgrammaticSpanNode, context: EvaluationContext): ProgrammaticSpanNode[] {
  return node.children.filter((child) => child.kind !== 'effect' && isNodeActive(child, context.timeMs));
}

function isNodeActive(node: ProgrammaticSpanNode, timeMs: number): boolean {
  if (node.kind === 'scene') return true;
  const startMs = Math.max(0, node.startMs || 0);
  if (timeMs < startMs) return false;
  if (node.durationMs == null) return true;
  return timeMs < startMs + Math.max(0, node.durationMs);
}

function applyLayoutFrame(
  props: Record<string, ProgrammaticSpanLiteral>,
  frame: LayoutFrame | null
): Record<string, ProgrammaticSpanLiteral> {
  return frame ? { ...props, x: frame.x, y: frame.y, width: frame.width, height: frame.height } : props;
}

function hasPosition(node: ProgrammaticSpanNode, axis: 'x' | 'y'): boolean {
  const aliases = axis === 'x' ? ['x', 'centerX'] : ['y', 'centerY'];
  return aliases.some((key) => Object.prototype.hasOwnProperty.call(node.props, key)) ||
    node.animations.some((animation) => aliases.includes(animation.prop));
}

function boxSpacing(props: Record<string, ProgrammaticSpanLiteral>, key: string, scope: RenderScope): BoxSpacing {
  const value = props[key];
  if (typeof value === 'number' || typeof value === 'string') {
    const amount = resolveLength(value, 0, 'min', scope);
    return { top: amount, right: amount, bottom: amount, left: amount };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      top: lengthObjectProp(value, 'top', 0, scope),
      right: lengthObjectProp(value, 'right', 0, scope),
      bottom: lengthObjectProp(value, 'bottom', 0, scope),
      left: lengthObjectProp(value, 'left', 0, scope)
    };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function lengthObjectProp(
  value: { [key: string]: ProgrammaticSpanLiteral },
  key: string,
  fallback: number,
  scope: RenderScope
): number {
  return resolveLength(value[key], fallback, 'min', scope);
}

function lengthProp(
  props: Record<string, ProgrammaticSpanLiteral>,
  key: string,
  fallback: number,
  axis: 'x' | 'y' | 'min',
  scope: RenderScope
): number {
  return resolveLength(props[key], fallback, axis, scope);
}

function resolveLength(
  value: ProgrammaticSpanLiteral | undefined,
  fallback: number,
  axis: 'x' | 'y' | 'min',
  scope: RenderScope
): number {
  const basis = axis === 'x' ? scope.boundsWidth : axis === 'y' ? scope.boundsHeight : Math.min(scope.boundsWidth, scope.boundsHeight);
  return lengthValue(value, basis, scope, fallback);
}

function lengthValue(
  value: ProgrammaticSpanLiteral | undefined,
  basis: number,
  _scope: RenderScope,
  fallback = 0
): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) return (Number.parseFloat(trimmed) / 100) * basis;
    if (trimmed.endsWith('px')) return Number.parseFloat(trimmed);
    if (trimmed.endsWith('ms')) return Number.parseFloat(trimmed);
    const numeric = Number.parseFloat(trimmed);
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  return fallback;
}

function numberProp(
  valueOrProps: ProgrammaticSpanLiteral | Record<string, ProgrammaticSpanLiteral> | undefined,
  keyOrFallback: string | number,
  fallbackMaybe?: number
): number {
  if (typeof keyOrFallback === 'string') {
    const props = valueOrProps as Record<string, ProgrammaticSpanLiteral> | undefined;
    return numericLiteral(props?.[keyOrFallback], fallbackMaybe ?? 0);
  }
  return numericLiteral(valueOrProps as ProgrammaticSpanLiteral | undefined, keyOrFallback);
}

function numericLiteral(value: ProgrammaticSpanLiteral | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function stringProp(value: ProgrammaticSpanLiteral | undefined, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function stringLiteralValue(value: ProgrammaticSpanLiteral | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readTimeMs(value: ProgrammaticSpanLiteral | undefined, fallback: number): number {
  return resolveLength(value, fallback, 'min', {
    offsetX: 0,
    offsetY: 0,
    opacity: 1,
    layerOffset: 0,
    boundsWidth: 1,
    boundsHeight: 1
  });
}

function normalizedWindow(timeMs: number, startMs: number, durationMs: number): number {
  if (!Number.isFinite(startMs) || durationMs <= 0) return 0;
  return clamp((timeMs - startMs) / durationMs, 0, 1);
}

function alignedOffset(align: string, available: number, size: number): number {
  switch (align) {
    case 'center':
    case 'middle':
      return (available - size) / 2;
    case 'end':
    case 'flex-end':
      return available - size;
    default:
      return 0;
  }
}

function transformVisual(
  visual: ProgrammaticVisual,
  transform: { pivotX: number; pivotY: number; scaleX: number; scaleY: number; rotation: number }
): ProgrammaticVisual {
  const x = numericLiteral(visual.attributes.x, Number.NaN);
  const y = numericLiteral(visual.attributes.y, Number.NaN);
  const width = numericLiteral(visual.attributes.width, Number.NaN);
  const height = numericLiteral(visual.attributes.height, Number.NaN);
  const children = visual.children?.map((child) => transformVisual(child, transform));
  if (![x, y, width, height].every(Number.isFinite)) {
    return { ...visual, ...(children ? { children } : {}) };
  }
  const center = transformPoint({ x: x + width / 2, y: y + height / 2 }, transform);
  return {
    ...visual,
    attributes: {
      ...visual.attributes,
      x: center.x - width / 2,
      y: center.y - height / 2,
      scaleX: numericLiteral(visual.attributes.scaleX, 1) * transform.scaleX,
      scaleY: numericLiteral(visual.attributes.scaleY, 1) * transform.scaleY,
      rotation: numericLiteral(visual.attributes.rotation, 0) + transform.rotation
    },
    ...(children ? { children } : {})
  };
}

function transformPoint(
  point: { x: number; y: number },
  transform: { pivotX: number; pivotY: number; scaleX: number; scaleY: number; rotation: number }
): { x: number; y: number } {
  const scaledX = transform.pivotX + (point.x - transform.pivotX) * transform.scaleX;
  const scaledY = transform.pivotY + (point.y - transform.pivotY) * transform.scaleY;
  if (Math.abs(transform.rotation) < 0.0001) return { x: scaledX, y: scaledY };
  const radians = transform.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = scaledX - transform.pivotX;
  const dy = scaledY - transform.pivotY;
  return {
    x: transform.pivotX + dx * cos - dy * sin,
    y: transform.pivotY + dx * sin + dy * cos
  };
}

function compareVisualLayer(left: ProgrammaticVisual, right: ProgrammaticVisual): number {
  return numericLiteral(left.attributes.layer, 0) - numericLiteral(right.attributes.layer, 0);
}

function splitWords(text: string): string[] {
  const matches = text.match(/\S+\s*/g);
  return matches?.length ? matches : [text];
}

function measureTextPieces(
  pieces: string[],
  mode: string,
  maxCharsPerLine: number,
  size: number,
  lineHeight: number,
  align: string,
  boxWidth: number
): Array<{ x: number; y: number; width: number }> {
  let x = 0;
  let y = 0;
  let currentLineChars = 0;
  const measured = pieces.map((piece) => {
    const chars = piece.length;
    if (currentLineChars > 0 && currentLineChars + chars > maxCharsPerLine) {
      x = 0;
      y += lineHeight;
      currentLineChars = 0;
    }
    const width = Math.max(size * 0.26, chars * size * (mode === 'word' ? 0.48 : 0.58));
    const position = { x, y, width };
    x += width;
    currentLineChars += chars;
    return position;
  });
  const lineWidths = new Map<number, number>();
  for (const piece of measured) {
    lineWidths.set(piece.y, Math.max(lineWidths.get(piece.y) ?? 0, piece.x + piece.width));
  }
  if (align !== 'center' && align !== 'right' && align !== 'end') return measured;
  return measured.map((piece) => {
    const lineWidth = lineWidths.get(piece.y) ?? boxWidth;
    const offset = align === 'center' ? (boxWidth - lineWidth) / 2 : boxWidth - lineWidth;
    return { ...piece, x: piece.x + Math.max(0, offset) };
  });
}

function revealDelta(direction: string, distance: number): { x: number; y: number } {
  switch (direction) {
    case 'left':
      return { x: -distance, y: 0 };
    case 'right':
      return { x: distance, y: 0 };
    case 'top':
      return { x: 0, y: -distance };
    default:
      return { x: 0, y: distance };
  }
}

function colorMix(left: string, right: string, amount: number): string {
  const a = parseColor(left);
  const b = parseColor(right);
  if (!a || !b) return amount < 0.5 ? left : right;
  const t = clamp(amount, 0, 1);
  return formatColor({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t
  });
}

function readableTextColor(color: string): string {
  const parsed = parseColor(color);
  if (!parsed) return '#ffffff';
  const luminance = (0.299 * parsed.r + 0.587 * parsed.g + 0.114 * parsed.b) / 255;
  return luminance > 0.55 ? '#0f172a' : '#ffffff';
}

function interpolateColor(left: string, right: string, amount: number): string | null {
  const a = parseColor(left);
  const b = parseColor(right);
  if (!a || !b) return null;
  const t = clamp(amount, 0, 1);
  return formatColor({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t
  });
}

function parseColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const trimmed = input.trim();
  if (trimmed === 'transparent' || trimmed === 'none') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = trimmed.replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
      a: 1
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: 1
    };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(trimmed);
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
    }
  }
  return null;
}

function formatColor(color: { r: number; g: number; b: number; a: number }): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  if (color.a >= 0.999) {
    return `#${[color.r, color.g, color.b].map((value) => channel(value).toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${Math.max(0, Math.min(1, color.a)).toFixed(3)})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
