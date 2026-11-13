import QRCode from 'qrcode';
import type {
  ColorStop,
  DistributionMode,
  FormationShape,
  QRErrorLevel,
  SynthesisResponse,
} from '../types/studio.ts';

export interface PointCloudData {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

export const DEFAULT_COLOR_STOPS: ColorStop[] = [
  { id: 'stop-0', position: 0.0, color: '#FFFFFF' },
  { id: 'stop-1', position: 0.45, color: '#A1A1AA' },
  { id: 'stop-2', position: 0.85, color: '#FF5722' },
];

/**
 * Deterministic PRNG (Mulberry32) so formations and unit tests are reproducible.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgbNormalized(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [1, 1, 1];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [
    Number.isFinite(r) ? r : 1,
    Number.isFinite(g) ? g : 1,
    Number.isFinite(b) ? b : 1,
  ];
}

export function sampleGradientStops(stops: ColorStop[], t: number): [number, number, number] {
  if (!stops || stops.length === 0) return [1, 1, 1];
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const clamped = Math.max(0, Math.min(1, t));

  if (clamped <= sorted[0].position) {
    return hexToRgbNormalized(sorted[0].color);
  }
  const last = sorted[sorted.length - 1];
  if (clamped >= last.position) {
    return hexToRgbNormalized(last.color);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (clamped >= left.position && clamped <= right.position) {
      const span = Math.max(1e-5, right.position - left.position);
      const localT = (clamped - left.position) / span;
      const [r1, g1, b1] = hexToRgbNormalized(left.color);
      const [r2, g2, b2] = hexToRgbNormalized(right.color);
      return [
        r1 + (r2 - r1) * localT,
        g1 + (g2 - g1) * localT,
        b1 + (b2 - b1) * localT,
      ];
    }
  }
  return [1, 1, 1];
}

/**
 * Computes GPU attribute buffer footprint in MB:
 * position (3 floats) + target (3 floats) + velocity (3 floats) + color (3 floats) + seed (1 float) = 13 floats * 4 bytes = 52 bytes/pt
 */
export function computeBufferSizeMB(activePoints: number): number {
  const bytes = activePoints * 52;
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

/**
 * Caps active GPU point budget smoothly based on target particleCount and software GL environment.
 */
export function computeRenderBudget(requestedCount: number, isSoftwareGl: boolean): number {
  const clamped = Math.max(10000, Math.min(1000000, Math.round(requestedCount)));
  if (isSoftwareGl) {
    // Keep software WebGL responsive while still representing proportional density
    return Math.min(28000, Math.max(6000, Math.round(clamped * 0.08)));
  }
  // Hardware GPU comfortably runs 60fps up to 250k points in BufferGeometry
  return Math.min(250000, clamped);
}

export function generateSpherePoints(
  count: number,
  radius: number,
  distribution: DistributionMode = 'surface',
  rng: () => number = createSeededRng(101),
): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rng();
    const v = rng();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    let r = radius;
    if (distribution === 'volume') {
      r = Math.cbrt(rng()) * radius;
    } else if (distribution === 'voxel') {
      r = Math.cbrt(rng()) * radius;
    } else {
      // Surface shell with slight inner core for depth
      r = (rng() < 0.22 ? 0.35 + rng() * 0.25 : 0.85 + rng() * 0.15) * radius;
    }
    const sinPhi = Math.sin(phi);
    let x = r * sinPhi * Math.cos(theta);
    let y = r * sinPhi * Math.sin(theta);
    let z = r * Math.cos(phi);

    if (distribution === 'voxel') {
      const step = 12;
      x = Math.round(x / step) * step;
      y = Math.round(y / step) * step;
      z = Math.round(z / step) * step;
    }

    pts[i * 3] = x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = z;
  }
  return pts;
}

export function generateTorusKnotPoints(
  count: number,
  scale = 95,
  p = 2,
  q = 3,
  rng: () => number = createSeededRng(202),
): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = rng() * Math.PI * 2;
    const r = Math.cos(q * t) + 2.0;
    const cx = r * Math.cos(p * t) * (scale * 0.42);
    const cy = r * Math.sin(p * t) * (scale * 0.42);
    const cz = -Math.sin(q * t) * (scale * 0.55);

    const tubeAngle = rng() * Math.PI * 2;
    const tubeRadius = 10 + rng() * 14;
    pts[i * 3] = cx + Math.cos(tubeAngle) * tubeRadius;
    pts[i * 3 + 1] = cy + Math.sin(tubeAngle) * tubeRadius;
    pts[i * 3 + 2] = cz + (rng() - 0.5) * tubeRadius;
  }
  return pts;
}

export function generateHelixPoints(
  count: number,
  radius = 125,
  rng: () => number = createSeededRng(303),
): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const isBridge = rng() < 0.14;
    if (isBridge) {
      // Base-pair rung connecting the two helical strands
      const t = (Math.floor(rng() * 18) - 9) * 18;
      const angle = t * 0.035;
      const lerp = (rng() - 0.5) * 2;
      pts[i * 3] = Math.cos(angle) * (radius * 0.55) * lerp;
      pts[i * 3 + 1] = t + (rng() - 0.5) * 3;
      pts[i * 3 + 2] = Math.sin(angle) * (radius * 0.55) * lerp;
    } else {
      const strand = rng() > 0.5 ? 0 : Math.PI;
      const t = (rng() - 0.5) * 340;
      const angle = t * 0.035 + strand;
      const jitter = (rng() - 0.5) * 14;
      pts[i * 3] = Math.cos(angle) * (radius * 0.55) + jitter;
      pts[i * 3 + 1] = t;
      pts[i * 3 + 2] = Math.sin(angle) * (radius * 0.55) + jitter;
    }
  }
  return pts;
}

export function generateTerrainPoints(
  count: number,
  size = 320,
  rng: () => number = createSeededRng(404),
): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * size;
    const z = (rng() - 0.5) * size;
    const ridge1 = Math.sin(x * 0.025) * Math.cos(z * 0.025) * 48;
    const ridge2 = Math.sin(x * 0.06 + z * 0.04) * 18;
    const crater = -Math.exp(-(x * x + z * z) / 5500) * 35;
    pts[i * 3] = x;
    pts[i * 3 + 1] = ridge1 + ridge2 + crater;
    pts[i * 3 + 2] = z;
  }
  return pts;
}

export function generateVoxelCubePoints(
  count: number,
  size = 180,
  rng: () => number = createSeededRng(505),
): Float32Array {
  const pts = new Float32Array(count * 3);
  const grid = 16;
  const step = size / grid;
  for (let i = 0; i < count; i++) {
    const gx = Math.floor(rng() * grid);
    const gy = Math.floor(rng() * grid);
    const gz = Math.floor(rng() * grid);
    // Hollow shell + inner frame
    const onShell =
      gx === 0 ||
      gx === grid - 1 ||
      gy === 0 ||
      gy === grid - 1 ||
      gz === 0 ||
      gz === grid - 1 ||
      (Math.abs(gx - grid / 2) < 2 && Math.abs(gy - grid / 2) < 2);
    const jx = (rng() - 0.5) * (onShell ? 2.5 : 4.5);
    const jy = (rng() - 0.5) * (onShell ? 2.5 : 4.5);
    const jz = (rng() - 0.5) * (onShell ? 2.5 : 4.5);
    pts[i * 3] = (gx - grid / 2 + 0.5) * step + jx;
    pts[i * 3 + 1] = (gy - grid / 2 + 0.5) * step + jy;
    pts[i * 3 + 2] = (gz - grid / 2 + 0.5) * step + jz;
  }
  return pts;
}

export function generateVortexPoints(
  count: number,
  radius = 165,
  rng: () => number = createSeededRng(606),
): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = rng();
    const arm = Math.floor(rng() * 3) * ((Math.PI * 2) / 3);
    const r = 18 + Math.pow(t, 0.78) * radius;
    const angle = arm + t * Math.PI * 4.5 + (rng() - 0.5) * 0.45;
    const funnelY = (1 - t) * 70 - 35 + (rng() - 0.5) * (16 + t * 22);
    pts[i * 3] = Math.cos(angle) * r;
    pts[i * 3 + 1] = funnelY;
    pts[i * 3 + 2] = Math.sin(angle) * r;
  }
  return pts;
}

export function generateAudioCorePoints(
  count: number,
  radius = 135,
  rng: () => number = createSeededRng(707),
): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const band = Math.floor(rng() * 5);
    const u = rng();
    const v = rng();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const shellR = radius * (0.28 + band * 0.16) + Math.sin(theta * 6) * 8;
    const sinPhi = Math.sin(phi);
    pts[i * 3] = shellR * sinPhi * Math.cos(theta);
    pts[i * 3 + 1] = shellR * sinPhi * Math.sin(theta);
    pts[i * 3 + 2] = shellR * Math.cos(phi);
  }
  return pts;
}

/**
 * Generates a deterministic, scannable 3D QR particle matrix using `qrcode`.
 * Every dark QR module receives dense clustered particles extruded along Z,
 * while background quiet-zone space remains clean so orthogonal view scans reliably.
 */
export function generateQRMatrixPoints(
  count: number,
  payload: string,
  errorCorrectionLevel: QRErrorLevel = 'Q',
  zDisplacement = 42,
  size = 240,
  rng: () => number = createSeededRng(808),
): { positions: Float32Array; colors: Float32Array; moduleCount: number } {
  const safePayload = payload.trim() || 'https://particlestudio.app';
  const qr = QRCode.create(safePayload, { errorCorrectionLevel });
  const moduleCount = qr.modules.size;
  const data = qr.modules.data;

  const activeCells: Array<{ gx: number; gy: number; isFinder: boolean }> = [];
  for (let gy = 0; gy < moduleCount; gy++) {
    for (let gx = 0; gx < moduleCount; gx++) {
      const bit = data[gy * moduleCount + gx];
      if (bit) {
        const isFinder =
          (gx < 7 && gy < 7) ||
          (gx >= moduleCount - 7 && gy < 7) ||
          (gx < 7 && gy >= moduleCount - 7);
        activeCells.push({ gx, gy, isFinder });
      }
    }
  }

  const pts = new Float32Array(count * 3);
  const cols = new Float32Array(count * 3);
  const step = size / moduleCount;

  if (activeCells.length === 0) {
    return { positions: pts, colors: cols, moduleCount };
  }

  for (let i = 0; i < count; i++) {
    const cell = activeCells[i % activeCells.length];
    // Keep jitter tightly inside the module cell (0.78 * step) so quiet edges stay sharp for scanners
    const jx = (rng() - 0.5) * step * 0.78;
    const jy = (rng() - 0.5) * step * 0.78;

    const x = (cell.gx - moduleCount / 2 + 0.5) * step + jx;
    const y = (moduleCount / 2 - cell.gy - 0.5) * step + jy;
    const depth = (cell.isFinder ? 1.0 : 0.65) * zDisplacement * (0.2 + rng() * 0.8);

    pts[i * 3] = x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = depth;

    if (cell.isFinder) {
      // Subtle International Orange accent on finder anchors, crisp white body
      cols[i * 3] = 1.0;
      cols[i * 3 + 1] = 0.34;
      cols[i * 3 + 2] = 0.13;
    } else {
      cols[i * 3] = 0.98;
      cols[i * 3 + 1] = 0.98;
      cols[i * 3 + 2] = 0.99;
    }
  }

  return { positions: pts, colors: cols, moduleCount };
}

/**
 * Parses an ASCII Wavefront .OBJ file's `v x y z` vertices, centers & normalizes
 * to studio bounds, and resamples up to `count` particles.
 */
export function parseObjVertices(
  objText: string,
  count: number,
  targetRadius = 140,
  rng: () => number = createSeededRng(909),
): Float32Array {
  const raw: number[] = [];
  const lines = objText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const z = parseFloat(parts[3]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          raw.push(x, y, z);
        }
      }
    }
  }

  const vertexCount = raw.length / 3;
  if (vertexCount === 0) {
    return generateTorusKnotPoints(count, targetRadius, 2, 3, rng);
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < vertexCount; i++) {
    const x = raw[i * 3];
    const y = raw[i * 3 + 1];
    const z = raw[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const span = Math.max(1e-5, maxX - minX, maxY - minY, maxZ - minZ);
  const scale = (targetRadius * 1.9) / span;

  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const vIdx = (i < vertexCount ? i : Math.floor(rng() * vertexCount)) * 3;
    const jitter = i >= vertexCount ? (rng() - 0.5) * 2.5 : 0;
    pts[i * 3] = (raw[vIdx] - cx) * scale + jitter;
    pts[i * 3 + 1] = (raw[vIdx + 1] - cy) * scale + jitter;
    pts[i * 3 + 2] = (raw[vIdx + 2] - cz) * scale + jitter;
  }
  return pts;
}

/**
 * Converts RGBA pixel buffer (from PNG/SVG/procedural depth canvas) into a 3D heightfield point cloud
 * with authentic source RGB colors and Z-displacement.
 */
export function sampleRgbaToDepthCloud(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  count: number,
  zDisplacement = 42,
  worldSize = 260,
  rng: () => number = createSeededRng(950),
): { positions: Float32Array; colors: Float32Array } {
  const candidates: Array<{ x: number; y: number; lum: number; r: number; g: number; b: number }> = [];
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 160));

  for (let py = 0; py < height; py += stepY) {
    for (let px = 0; px < width; px += stepX) {
      const idx = (py * width + px) * 4;
      const a = rgba[idx + 3] / 255;
      if (a < 0.08) continue;
      const r = rgba[idx] / 255;
      const g = rgba[idx + 1] / 255;
      const b = rgba[idx + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 0.03 || a > 0.2) {
        candidates.push({
          x: (px / Math.max(1, width - 1) - 0.5) * worldSize,
          y: (0.5 - py / Math.max(1, height - 1)) * worldSize * (height / Math.max(1, width)),
          lum,
          r,
          g,
          b,
        });
      }
    }
  }

  const pts = new Float32Array(count * 3);
  const cols = new Float32Array(count * 3);

  if (candidates.length === 0) {
    const fallback = generateTerrainPoints(count, worldSize, rng);
    return { positions: fallback, colors: new Float32Array(count * 3).fill(0.95) };
  }

  const zScale = Math.max(1, zDisplacement * 1.8);
  for (let i = 0; i < count; i++) {
    const c = candidates[i % candidates.length];
    const jitter = (rng() - 0.5) * 1.4;
    pts[i * 3] = c.x + jitter;
    pts[i * 3 + 1] = c.y + jitter;
    pts[i * 3 + 2] = (c.lum - 0.35) * zScale;

    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }

  return { positions: pts, colors: cols };
}

/**
 * Generates procedural RGBA heightmap presets when user selects built-in depth maps.
 */
export function buildProceduralDepthRgba(
  preset: 'crater' | 'interference' | 'topography',
  size = 128,
): { rgba: Uint8ClampedArray; width: number; height: number } {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      const rDist = Math.sqrt(nx * nx + ny * ny);
      let v = 0;
      let accent = 0;

      if (preset === 'crater') {
        v = Math.max(0, Math.sin(rDist * 10) * 0.35 + (1 - Math.min(1, rDist)) * 0.75);
        accent = Math.exp(-rDist * rDist * 6);
      } else if (preset === 'interference') {
        const w1 = Math.sin((nx - 0.3) * 18) * Math.cos((ny + 0.2) * 18);
        const w2 = Math.cos(rDist * 22);
        v = (w1 * 0.5 + w2 * 0.5) * 0.5 + 0.5;
        accent = Math.max(0, w2);
      } else {
        const contour = Math.abs(Math.sin(nx * 5) + Math.cos(ny * 5)) * 0.5;
        v = Math.pow(contour, 1.4);
        accent = v > 0.72 ? 1 : 0.15;
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(Math.min(255, (0.35 + v * 0.65) * 255));
      rgba[idx + 1] = Math.round(Math.min(255, (0.25 + v * 0.55 - accent * 0.2) * 255));
      rgba[idx + 2] = Math.round(Math.min(255, (0.28 + v * 0.5 - accent * 0.35) * 255));
      rgba[idx + 3] = 255;
    }
  }
  return { rgba, width: size, height: size };
}

/**
 * Builds positions for any FormationShape.
 */
export function buildFormationPositions(
  shape: FormationShape,
  count: number,
  options: {
    distribution?: DistributionMode;
    qrPayload?: string;
    qrErrorLevel?: QRErrorLevel;
    zDisplacement?: number;
    customPoints?: Float32Array | null;
  } = {},
): { positions: Float32Array; sourceColors?: Float32Array } {
  const dist = options.distribution ?? 'surface';
  switch (shape) {
    case 'torus':
      return { positions: generateTorusKnotPoints(count) };
    case 'helix':
      return { positions: generateHelixPoints(count) };
    case 'terrain':
      return { positions: generateTerrainPoints(count) };
    case 'cube':
      return { positions: generateVoxelCubePoints(count) };
    case 'vortex':
      return { positions: generateVortexPoints(count) };
    case 'audiocore':
      return { positions: generateAudioCorePoints(count) };
    case 'qr': {
      const qr = generateQRMatrixPoints(
        count,
        options.qrPayload ?? 'https://particlestudio.app',
        options.qrErrorLevel ?? 'Q',
        options.zDisplacement ?? 42,
      );
      return { positions: qr.positions, sourceColors: qr.colors };
    }
    case 'depthmap': {
      const { rgba, width, height } = buildProceduralDepthRgba('crater', 128);
      const res = sampleRgbaToDepthCloud(rgba, width, height, count, options.zDisplacement ?? 42);
      return { positions: res.positions, sourceColors: res.colors };
    }
    case 'custom_obj':
      if (options.customPoints && options.customPoints.length >= 3) {
        const resampled = new Float32Array(count * 3);
        const srcLen = options.customPoints.length / 3;
        for (let i = 0; i < count; i++) {
          const s = (i % srcLen) * 3;
          resampled[i * 3] = options.customPoints[s];
          resampled[i * 3 + 1] = options.customPoints[s + 1];
          resampled[i * 3 + 2] = options.customPoints[s + 2];
        }
        return { positions: resampled };
      }
      return { positions: generateTorusKnotPoints(count) };
    case 'sphere':
    default:
      return { positions: generateSpherePoints(count, 140, dist) };
  }
}

/**
 * Deterministic prompt-to-particle-configuration fallback when GEMINI_API_KEY is unavailable.
 */
export function fallbackSynthesizePrompt(prompt: string): SynthesisResponse {
  const lower = prompt.toLowerCase();

  let shape: FormationShape = 'vortex';
  let sceneTitle = 'Aerodynamic_Vortex_01.ptc';

  if (lower.includes('helix') || lower.includes('dna') || lower.includes('strand')) {
    shape = 'helix';
    sceneTitle = 'Double_Helix_Sim.ptc';
  } else if (lower.includes('torus') || lower.includes('knot') || lower.includes('ring')) {
    shape = 'torus';
    sceneTitle = 'Torus_Knot_Field.ptc';
  } else if (lower.includes('terrain') || lower.includes('mountain') || lower.includes('landscape') || lower.includes('wave')) {
    shape = 'terrain';
    sceneTitle = 'Topographic_Wave.ptc';
  } else if (lower.includes('cube') || lower.includes('voxel') || lower.includes('grid') || lower.includes('architect')) {
    shape = 'cube';
    sceneTitle = 'Voxel_Lattice_01.ptc';
  } else if (lower.includes('qr') || lower.includes('matrix') || lower.includes('code')) {
    shape = 'qr';
    sceneTitle = 'QR_Matrix_Extrusion.ptc';
  } else if (lower.includes('audio') || lower.includes('pulse') || lower.includes('core') || lower.includes('resonant')) {
    shape = 'audiocore';
    sceneTitle = 'Harmonic_Core_01.ptc';
  } else if (lower.includes('sphere') || lower.includes('planet') || lower.includes('orb')) {
    shape = 'sphere';
    sceneTitle = 'Spherical_Field_01.ptc';
  }

  const highTurbulence =
    lower.includes('turbulence') ||
    lower.includes('disintegrate') ||
    lower.includes('storm') ||
    lower.includes('vortex') ||
    lower.includes('explode') ||
    lower.includes('shatter');

  const interactionMode = lower.includes('shatter') || lower.includes('explode')
    ? 'shatter'
    : lower.includes('attract') || lower.includes('gravity') || lower.includes('pull')
      ? 'attract'
      : lower.includes('vortex') || lower.includes('swirl') || lower.includes('tornado')
        ? 'vortex'
        : 'repel';

  const colorMode = lower.includes('velocity') || lower.includes('thermal') || lower.includes('heat')
    ? 'velocity'
    : lower.includes('depth') || lower.includes('ice') || lower.includes('blue')
      ? 'depth'
      : 'mono';

  return {
    shape,
    sceneTitle,
    summary: `Synthesized ${shape} field (${interactionMode} dynamics)`,
    curlFreq: highTurbulence ? 0.85 : 0.42,
    curlAmp: highTurbulence ? 1.95 : 0.95,
    gravity: {
      x: lower.includes('wind') ? 0.6 : 0.0,
      y: lower.includes('rise') || lower.includes('float') ? 0.5 : lower.includes('fall') ? -1.4 : -0.35,
      z: 0.1,
    },
    interactionMode,
    colorMode,
    blendMode: 'additive',
    pointSize: highTurbulence ? 1.9 : 1.7,
    colorStops: DEFAULT_COLOR_STOPS,
    source: 'deterministic',
  };
}
