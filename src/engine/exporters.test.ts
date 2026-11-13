import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGLTF, buildOBJ, buildPLY, buildWebGLEmbedSnippet } from './exporters';
import { DEFAULT_COLOR_STOPS } from './formations';
import type { StudioParams } from '../types/studio';

const samplePositions = new Float32Array([1, 2, 3, -4.5, 0, 12.25]);
const sampleColors = new Float32Array([1, 0.34, 0.13, 0.5, 0.5, 0.5]);

const sampleParams: StudioParams = {
  particleCount: 250000,
  distribution: 'surface',
  pointSize: 1.8,
  perspectiveScaling: true,
  curlFreq: 0.45,
  curlAmp: 1.2,
  gravity: { x: 0, y: -0.8, z: 0.2 },
  interactionMode: 'repel',
  interactionRadius: 140,
  springStiffness: 0.72,
  colorMode: 'mono',
  colorStops: DEFAULT_COLOR_STOPS,
  blendMode: 'additive',
  decay: 0.88,
  bloom: 0.35,
  zDisplacement: 42,
  qrErrorLevel: 'Q',
  qrPayload: 'https://particlestudio.app',
  shadingMode: 'points',
  showGrid: true,
  audioReactive: false,
};

test('buildPLY outputs valid ASCII PLY header and vertex rows', () => {
  const ply = buildPLY(samplePositions, sampleColors, 2);
  assert.ok(ply.includes('element vertex 2'));
  assert.ok(ply.includes('end_header'));
  assert.ok(ply.includes('1.0000 2.0000 3.0000 255 87 33'));
});

test('buildOBJ outputs valid Wavefront OBJ vertex lines', () => {
  const obj = buildOBJ(samplePositions, sampleColors, 2);
  assert.ok(obj.includes('o ParticleCloud'));
  assert.ok(obj.includes('v 1.0000 2.0000 3.0000 1.000 0.340 0.130'));
});

test('buildGLTF outputs valid GLTF 2.0 JSON with embedded buffer', () => {
  const gltfStr = buildGLTF(samplePositions, sampleColors, 2);
  const parsed = JSON.parse(gltfStr);
  assert.equal(parsed.asset.version, '2.0');
  assert.equal(parsed.meshes[0].primitives[0].mode, 0);
  assert.equal(parsed.accessors[0].count, 2);
  assert.ok(parsed.buffers[0].uri.startsWith('data:application/octet-stream;base64,'));
});

test('buildWebGLEmbedSnippet includes Three.js module and configured pointSize', () => {
  const snippet = buildWebGLEmbedSnippet(sampleParams, 'vortex');
  assert.ok(snippet.includes('THREE.PointsMaterial'));
  assert.ok(snippet.includes('size: 1.8'));
  assert.ok(snippet.includes('VORTEX'));
});
