import type {
  ProgrammaticSpanLiteral,
  ProgrammaticSpanSetting,
  ProgrammaticSpanSettings,
  ProgrammaticVisual
} from '@mont-templates/runtime';

export type ProgrammaticPreviewRenderOptions = {
  width: number;
  height: number;
  background?: string;
  devicePixelRatio?: number;
};

export type ProgrammaticEditOverlayHandle =
  | {
      kind: 'frame';
      settingId: string;
      label: string;
      x: number;
      y: number;
      width: number;
      height: number;
      overlayGroup?: string;
      overlayOrder?: number;
    }
  | {
      kind: 'point';
      settingId: string;
      label: string;
      x: number;
      y: number;
      overlayGroup?: string;
      overlayOrder?: number;
    };

export type ProgrammaticEditOverlayConnection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Point = { x: number; y: number };

export function drawProgrammaticFrameToCanvas(
  canvas: HTMLCanvasElement,
  visuals: ProgrammaticVisual[],
  options: ProgrammaticPreviewRenderOptions
): void {
  const ratio = options.devicePixelRatio ?? window.devicePixelRatio ?? 1;
  canvas.width = Math.max(1, Math.round(options.width * ratio));
  canvas.height = Math.max(1, Math.round(options.height * ratio));
  canvas.style.aspectRatio = `${options.width} / ${options.height}`;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, options.width, options.height);
  context.fillStyle = options.background ?? '#0f172a';
  context.fillRect(0, 0, options.width, options.height);

  for (const visual of visuals) {
    drawVisual(context, visual);
  }
}

export function buildEditOverlayHandles(
  settings: ProgrammaticSpanSetting[],
  values: ProgrammaticSpanSettings,
  visuals: ProgrammaticVisual[]
): ProgrammaticEditOverlayHandle[] {
  const byId = new Map(visuals.map((visual) => [visual.id, visual]));
  const handles: ProgrammaticEditOverlayHandle[] = [];
  for (const setting of settings) {
    if (!setting.overlay) continue;
    const value = values[setting.id] ?? setting.default;
    const base = setting.overlayOriginVisualId ? visualOrigin(byId.get(setting.overlayOriginVisualId)) : { x: 0, y: 0 };
    if (setting.type === 'rect' && setting.overlay === 'frame') {
      const rect = literalRecord(value);
      const visual = setting.visualId ? byId.get(setting.visualId) : undefined;
      handles.push({
        kind: 'frame',
        settingId: setting.id,
        label: setting.label ?? setting.id,
        x: visual ? finiteNumber(visual.attributes.x, finiteNumber(rect.x, 0)) : finiteNumber(rect.x, 0),
        y: visual ? finiteNumber(visual.attributes.y, finiteNumber(rect.y, 0)) : finiteNumber(rect.y, 0),
        width: Math.max(1, visual ? finiteNumber(visual.attributes.width, finiteNumber(rect.width, 1)) : finiteNumber(rect.width, 1)),
        height: Math.max(1, visual ? finiteNumber(visual.attributes.height, finiteNumber(rect.height, 1)) : finiteNumber(rect.height, 1)),
        ...(setting.overlayGroup ? { overlayGroup: setting.overlayGroup } : {}),
        ...(typeof setting.overlayOrder === 'number' ? { overlayOrder: setting.overlayOrder } : {})
      });
    } else if (setting.type === 'point' && setting.overlay === 'point') {
      const point = literalRecord(value);
      handles.push({
        kind: 'point',
        settingId: setting.id,
        label: setting.label ?? setting.id,
        x: base.x + finiteNumber(point.x, 0),
        y: base.y + finiteNumber(point.y, 0),
        ...(setting.overlayGroup ? { overlayGroup: setting.overlayGroup } : {}),
        ...(typeof setting.overlayOrder === 'number' ? { overlayOrder: setting.overlayOrder } : {})
      });
    }
  }
  return handles;
}

export function buildEditOverlayConnections(
  handles: ProgrammaticEditOverlayHandle[]
): ProgrammaticEditOverlayConnection[] {
  const groups = new Map<string, ProgrammaticEditOverlayHandle[]>();
  for (const handle of handles) {
    if (handle.kind !== 'point' || !handle.overlayGroup) continue;
    const group = groups.get(handle.overlayGroup) ?? [];
    group.push(handle);
    groups.set(handle.overlayGroup, group);
  }
  const connections: ProgrammaticEditOverlayConnection[] = [];
  for (const group of groups.values()) {
    group.sort((left, right) => (left.overlayOrder ?? 0) - (right.overlayOrder ?? 0));
    for (let index = 1; index < group.length; index += 1) {
      connections.push({
        x1: group[index - 1].x,
        y1: group[index - 1].y,
        x2: group[index].x,
        y2: group[index].y
      });
    }
  }
  return connections;
}

function drawVisual(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  context.save();
  const opacity = finiteNumber(visual.attributes.opacity, 1);
  context.globalAlpha *= Math.max(0, Math.min(1, opacity));
  applyEffects(context, visual);

  switch (visual.type) {
    case 'rect':
      drawRect(context, visual);
      break;
    case 'circle':
    case 'ellipse':
      drawEllipse(context, visual);
      break;
    case 'triangle':
    case 'diamond':
    case 'star':
      drawPolygon(context, visual);
      break;
    case 'line':
    case 'arrow':
    case 'turnArrow':
      drawLine(context, visual);
      break;
    case 'text':
      drawText(context, visual);
      break;
    case 'image':
      if (literalString(visual.attributes.kind, '') === 'cursor') {
        drawCursor(context, visual);
      } else {
        drawMediaPlaceholder(context, visual, 'Image');
      }
      break;
    case 'lottie':
      drawMediaPlaceholder(context, visual, 'Lottie');
      break;
    case 'model3d':
      drawMediaPlaceholder(context, visual, '3D');
      break;
    default:
      drawMediaPlaceholder(context, visual, visual.type);
      break;
  }

  if (visual.children?.length) {
    for (const child of visual.children) drawVisual(context, child);
  }
  context.restore();
}

function applyEffects(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  const x = finiteNumber(visual.attributes.x, 0);
  const y = finiteNumber(visual.attributes.y, 0);
  const width = finiteNumber(visual.attributes.width, 0);
  const height = finiteNumber(visual.attributes.height, 0);
  const rotation = finiteNumber(visual.attributes.rotation, 0);
  const scaleX = finiteNumber(visual.attributes.scaleX, 1);
  const scaleY = finiteNumber(visual.attributes.scaleY, 1);
  if (Math.abs(rotation) > 0.0001 || Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001) {
    context.translate(x + width / 2, y + height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.scale(scaleX, scaleY);
    context.translate(-(x + width / 2), -(y + height / 2));
  }
  const blur = finiteNumber(visual.attributes.blur, 0);
  if (blur > 0) context.filter = `blur(${blur}px)`;
  const shadowColor = literalString(visual.attributes.shadowColor, '');
  const glowColor = literalString(visual.attributes.glowColor, '');
  if (shadowColor || glowColor) {
    context.shadowColor = glowColor || shadowColor;
    context.shadowBlur = finiteNumber(visual.attributes.glowBlur, finiteNumber(visual.attributes.shadowBlur, 0));
    context.shadowOffsetX = finiteNumber(visual.attributes.shadowOffsetX, 0);
    context.shadowOffsetY = finiteNumber(visual.attributes.shadowOffsetY, 0);
  }
}

function drawRect(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  const x = finiteNumber(visual.attributes.x, 0);
  const y = finiteNumber(visual.attributes.y, 0);
  const width = finiteNumber(visual.attributes.width, 0);
  const height = finiteNumber(visual.attributes.height, 0);
  const radius = Math.max(0, finiteNumber(visual.attributes.radius, 0));
  roundedRectPath(context, x, y, width, height, Math.min(radius, width / 2, height / 2));
  fillAndStroke(context, visual);
}

function drawEllipse(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  const x = finiteNumber(visual.attributes.x, 0);
  const y = finiteNumber(visual.attributes.y, 0);
  const width = finiteNumber(visual.attributes.width, finiteNumber(visual.attributes.radius, 40) * 2);
  const height = finiteNumber(visual.attributes.height, width);
  context.beginPath();
  context.ellipse(x + width / 2, y + height / 2, Math.max(1, width / 2), Math.max(1, height / 2), 0, 0, Math.PI * 2);
  fillAndStroke(context, visual);
}

function drawPolygon(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  const x = finiteNumber(visual.attributes.x, 0);
  const y = finiteNumber(visual.attributes.y, 0);
  const width = finiteNumber(visual.attributes.width, 100);
  const height = finiteNumber(visual.attributes.height, 100);
  const points = visual.type === 'triangle'
    ? [{ x: x + width / 2, y }, { x: x + width, y: y + height }, { x, y: y + height }]
    : visual.type === 'diamond'
      ? [{ x: x + width / 2, y }, { x: x + width, y: y + height / 2 }, { x: x + width / 2, y: y + height }, { x, y: y + height / 2 }]
      : starPoints(x + width / 2, y + height / 2, Math.min(width, height) / 2, Math.min(width, height) / 4, 5);
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  fillAndStroke(context, visual);
}

function drawLine(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  const x1 = finiteNumber(visual.attributes.x1, finiteNumber(visual.attributes.x, 0));
  const y1 = finiteNumber(visual.attributes.y1, finiteNumber(visual.attributes.y, 0));
  const x2 = finiteNumber(visual.attributes.x2, x1 + finiteNumber(visual.attributes.width, 120));
  const y2 = finiteNumber(visual.attributes.y2, y1 + finiteNumber(visual.attributes.height, 0));
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.strokeStyle = literalString(visual.attributes.stroke, literalString(visual.attributes.fill, '#0f172a'));
  context.lineWidth = finiteNumber(visual.attributes.strokeWidth, 4);
  context.lineCap = 'round';
  context.stroke();
  if (visual.type === 'arrow') {
    drawArrowHead(context, { x: x1, y: y1 }, { x: x2, y: y2 });
  }
}

function drawText(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  const x = finiteNumber(visual.attributes.x, 0);
  const y = finiteNumber(visual.attributes.y, 0);
  const width = Math.max(1, finiteNumber(visual.attributes.width, 200));
  const height = Math.max(1, finiteNumber(visual.attributes.height, 80));
  const size = Math.max(1, finiteNumber(visual.attributes.size, 32));
  const weight = literalString(visual.attributes.weight, '700');
  const family = literalString(visual.attributes.fontFamily, 'Inter, ui-sans-serif, system-ui, sans-serif');
  const text = literalString(visual.attributes.text, '');
  context.fillStyle = literalString(visual.attributes.color, '#0f172a');
  context.font = `${weight} ${size}px ${family}`;
  context.textAlign = textAlign(visual.attributes.align);
  context.textBaseline = 'top';
  const lines = wrapText(context, text, width);
  const lineHeight = size * 1.08;
  const totalHeight = lines.length * lineHeight;
  const startY = verticalStart(y, height, totalHeight, visual.attributes.verticalAlign);
  const anchorX = context.textAlign === 'center' ? x + width / 2 : context.textAlign === 'right' ? x + width : x;
  lines.forEach((line, index) => context.fillText(line, anchorX, startY + index * lineHeight));
}

function drawCursor(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  const x = finiteNumber(visual.attributes.x, 0);
  const y = finiteNumber(visual.attributes.y, 0);
  const width = finiteNumber(visual.attributes.width, 56);
  const height = finiteNumber(visual.attributes.height, width * 1.32);
  const strokeWidth = finiteNumber(visual.attributes.strokeWidth, 5);
  const points = [
    { x, y },
    { x: x + width * 0.86, y: y + height * 0.56 },
    { x: x + width * 0.52, y: y + height * 0.62 },
    { x: x + width * 0.72, y: y + height },
    { x: x + width * 0.48, y: y + height * 1.08 },
    { x: x + width * 0.29, y: y + height * 0.68 },
    { x, y: y + height * 0.93 }
  ];
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.fillStyle = literalString(visual.attributes.fill, '#ffffff');
  context.strokeStyle = literalString(visual.attributes.stroke, '#0f172a');
  context.lineJoin = 'round';
  context.lineWidth = strokeWidth;
  context.fill();
  context.stroke();
}

function drawMediaPlaceholder(context: CanvasRenderingContext2D, visual: ProgrammaticVisual, label: string): void {
  const x = finiteNumber(visual.attributes.x, 0);
  const y = finiteNumber(visual.attributes.y, 0);
  const width = finiteNumber(visual.attributes.width, 200);
  const height = finiteNumber(visual.attributes.height, 140);
  roundedRectPath(context, x, y, width, height, 16);
  context.fillStyle = '#e0f2fe';
  context.fill();
  context.strokeStyle = '#38bdf8';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#075985';
  context.font = '700 22px Inter, ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, x + width / 2, y + height / 2);
}

function fillAndStroke(context: CanvasRenderingContext2D, visual: ProgrammaticVisual): void {
  const fill = literalString(visual.attributes.fill, 'transparent');
  if (fill !== 'transparent' && fill !== 'none') {
    context.fillStyle = fill;
    context.fill();
  }
  const stroke = literalString(visual.attributes.stroke, '');
  const strokeWidth = finiteNumber(visual.attributes.strokeWidth, 0);
  if (stroke && stroke !== 'none' && strokeWidth > 0) {
    context.strokeStyle = stroke;
    context.lineWidth = strokeWidth;
    context.stroke();
  }
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const explicit = text.split('\n');
  const lines: string[] = [];
  for (const segment of explicit) {
    const words = segment.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (const word of words.slice(1)) {
      const next = `${current} ${word}`;
      if (context.measureText(next).width <= maxWidth) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

function textAlign(value: ProgrammaticSpanLiteral | undefined): CanvasTextAlign {
  switch (literalString(value, 'left')) {
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    default:
      return 'left';
  }
}

function verticalStart(
  y: number,
  height: number,
  totalHeight: number,
  value: ProgrammaticSpanLiteral | undefined
): number {
  switch (literalString(value, 'top')) {
    case 'middle':
    case 'center':
      return y + (height - totalHeight) / 2;
    case 'bottom':
      return y + height - totalHeight;
    default:
      return y;
  }
}

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): Point[] {
  const result: Point[] = [];
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    result.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return result;
}

function drawArrowHead(context: CanvasRenderingContext2D, from: Point, to: Point): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 16;
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - Math.cos(angle - Math.PI / 6) * size, to.y - Math.sin(angle - Math.PI / 6) * size);
  context.lineTo(to.x - Math.cos(angle + Math.PI / 6) * size, to.y - Math.sin(angle + Math.PI / 6) * size);
  context.closePath();
  context.fillStyle = context.strokeStyle;
  context.fill();
}

function visualOrigin(visual: ProgrammaticVisual | undefined): Point {
  if (!visual) return { x: 0, y: 0 };
  return {
    x: finiteNumber(visual.attributes.x, 0),
    y: finiteNumber(visual.attributes.y, 0)
  };
}

function literalRecord(value: ProgrammaticSpanLiteral): Record<string, ProgrammaticSpanLiteral> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function literalString(value: ProgrammaticSpanLiteral | undefined, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function finiteNumber(value: ProgrammaticSpanLiteral | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
