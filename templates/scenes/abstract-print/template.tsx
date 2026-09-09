export default defineSpanScene({
  id: "abstract-print-native",
  width: 1080,
  height: 1920,
  durationMs: 8000,
  editModeTimeMs: 4000,
  background: "#e6e5d3",
  render() {
    return (
      <Scene background="#e6e5d3">
        <Procedural.Visual id="abstract-print" x={0} y={0} width={1080} height={1920} layer={0} render={(api) => api.frame([
          api.shader.wgsl({
            id: "abstract-print-field",
            processor: "generic-fragment-shader",
            uniforms: { progress: api.time.seconds / 8 },
            code: `
// host-frame: source-only native shader lowering
struct Uniforms { resolution: vec2f, progress: f32, };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
const TAU: f32 = 6.28318530718;

fn hash21(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 345.45));
  return fract(q.x * q.y * (q.x + q.y + 34.345));
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x),
             mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  return noise(p) * 0.84 + noise(p * 2.03 + vec2f(5.7, 11.3)) * 0.16 - 0.5;
}

fn field(p: vec2f, seed: f32, phase: f32) -> f32 {
  let drift = vec2f(cos(phase), sin(phase)) * 0.32;
  let q = p + vec2f(seed * 11.7, seed * -7.3) + drift;
  return fbm(q) * 0.65 + fbm(q + vec2f(43.1, 17.2)) * cos(phase) * 0.72
    + fbm(q + vec2f(-23.6, 61.9)) * sin(phase) * 0.72;
}

fn cutout(position: vec2f, seed: f32, scale: f32, threshold: f32, phase: f32, fill: vec3f, under: vec3f) -> vec3f {
  let p = position / scale;
  let value = field(p, seed, phase) - threshold;
  // Convert the noise gradient to screen pixels, so contours retain an ink-like width.
  let gradient = max(length(vec2f(dpdx(value), dpdy(value))), 0.00001);
  let noiseDistance = value / gradient;
  let uv = position / uniforms.resolution;
  let edge = min(min(uv.x - 0.078, 0.922 - uv.x) * uniforms.resolution.x,
                 min(uv.y - 0.057, 0.943 - uv.y) * uniforms.resolution.y);
  let distance = min(noiseDistance, edge);
  let fillDistance = (field((position + vec2f(-4.8, 3.2)) / scale, seed, phase) - threshold) / gradient;
  let coverage = smoothstep(-0.8, 0.8, min(fillDistance, edge));
  let ink = 1.0 - smoothstep(2.7, 4.2, abs(distance));
  let paper = vec3f(230.0, 229.0, 211.0) / 255.0;
  let silhouette = smoothstep(-0.8, 0.8, distance);
  var color = mix(under, paper, silhouette);
  color = mix(color, fill, coverage);
  color = mix(color, vec3f(22.0, 24.0, 21.0) / 255.0, ink);
  return color;
}

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let phase = fract(uniforms.progress) * TAU;
  let paper = vec3f(230.0, 229.0, 211.0) / 255.0;
  var color = paper;
  color = cutout(position.xy, 1.0, 290.0, 0.045, phase, vec3f(109.0, 172.0, 53.0) / 255.0, color);
  color = cutout(position.xy, 2.0, 260.0, 0.075, phase, vec3f(134.0, 65.0, 190.0) / 255.0, color);
  color = cutout(position.xy, 3.0, 350.0, 0.11, phase, vec3f(146.0, 148.0, 133.0) / 255.0, color);
  color = cutout(position.xy, 4.0, 270.0, 0.065, phase, vec3f(226.0, 81.0, 12.0) / 255.0, color);
  let grain = (hash21(floor(position.xy)) - 0.5) * 0.045;
  let fibers = (noise(position.xy * vec2f(0.13, 0.8)) - 0.5) * 0.018;
  return vec4f(clamp(color + grain + fibers, vec3f(0.0), vec3f(1.0)), 1.0);
}`
          })
        ])} />
      </Scene>
    );
  }
});
