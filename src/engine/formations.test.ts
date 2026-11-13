import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFormationPositions,
  buildProceduralDepthRgba,
  computeBufferSizeMB,
  computeRenderBudget,
  fallbackSynthesizePrompt,
  generateQRMatrixPoints,
  parseObjVertices,
  sampleGradientStops,
  sampleRgbaToDepthCloud,
} from './formations';

test('computeBufferSizeMB returns accurate MB footprint', () => {
  assert.equal(computeBufferSizeMB(100000), 5.0);
  assert.equal(computeBufferSizeMB(250000), 12.4);
});

test('computeRenderBudget respects software WebGL and hardware caps', () => {
  assert.equal(computeRenderBudget(250000, false), 250000);
  assert.equal(computeRenderBudget(1000000, false), 250000);
  assert.equal(computeRenderBudget(5000, false), 10000);
  assert.equal(computeRenderBudget(250000, true), 20000);
});

test('generateQRMatrixPoints creates deterministic scannable QR coordinates', () => {
  const qrA = generateQRMatrixPoints(6000, 'https://particlestudio.app', 'Q', 42);
  const qrB = generateQRMatrixPoints(6000, 'https://particlestudio.app', 'Q', 42);
  assert.equal(qrA.positions.length, 6000 * 3);
  assert.equal(qrA.colors.length, 6000 * 3);
  assert.ok(qrA.moduleCount >= 21);
  // Deterministic coordinates
  assert.equal(qrA.positions[0], qrB.positions[0]);
  assert.equal(qrA.positions[1], qrB.positions[1]);
});

test('parseObjVertices extracts and normalizes OBJ vertices', () => {
  const obj = [
    '# cube',
    'v 0 0 0',
    'v 10 0 0',
    'v 10 10 10',
    'v 0 10 10',
  ].join('\n');
  const pts = parseObjVertices(obj, 100, 100);
  assert.equal(pts.length, 300);
  // Centered around 0 with max extent ~ 190
  for (let i = 0; i < pts.length; i++) {
    assert.ok(Math.abs(pts[i]) <= 105);
  }
});

test('sampleRgbaToDepthCloud builds 3D relief with source RGB', () => {
  const { rgba, width, height } = buildProceduralDepthRgba('crater', 32);
  const cloud = sampleRgbaToDepthCloud(rgba, width, height, 500, 50);
  assert.equal(cloud.positions.length, 1500);
  assert.equal(cloud.colors.length, 1500);
  let hasZVariation = false;
  for (let i = 2; i < cloud.positions.length; i += 3) {
    if (Math.abs(cloud.positions[i]) > 1) {
      hasZVariation = true;
      break;
    }
  }
  assert.ok(hasZVariation);
});

test('sampleGradientStops interpolates multi-stop hex colors', () => {
  const stops = [
    { id: 'a', position: 0, color: '#000000' },
    { id: 'b', position: 1, color: '#FFFFFF' },
  ];
  const mid = sampleGradientStops(stops, 0.5);
  assert.ok(Math.abs(mid[0] - 0.5) < 0.01);
  assert.ok(Math.abs(mid[1] - 0.5) < 0.01);
  assert.ok(Math.abs(mid[2] - 0.5) < 0.01);
});

test('buildFormationPositions covers all geometry shapes', () => {
  const shapes = ['sphere', 'torus', 'helix', 'terrain', 'cube', 'vortex', 'audiocore', 'qr', 'depthmap'] as const;
  for (const shape of shapes) {
    const res = buildFormationPositions(shape, 400);
    assert.equal(res.positions.length, 1200, `Expected 1200 floats for ${shape}`);
  }
});

test('fallbackSynthesizePrompt parses keywords into valid configs', () => {
  const helix = fallbackSynthesizePrompt('Spiral DNA double helix with shatter forces');
  assert.equal(helix.shape, 'helix');
  assert.equal(helix.interactionMode, 'shatter');

  const vortex = fallbackSynthesizePrompt('Disintegrate into aerodynamic turbulence vortex');
  assert.equal(vortex.shape, 'vortex');
  assert.ok(vortex.curlAmp > 1.2);
});
