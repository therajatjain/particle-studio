import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import { DEFAULT_COLOR_STOPS, fallbackSynthesizePrompt } from './src/engine/formations.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

const ai =
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
    : null;

app.post('/api/synthesize', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required' });
    return;
  }

  if (!ai) {
    res.json(fallbackSynthesizePrompt(prompt));
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Translate this 3D particle simulation description into concrete physics and geometry configuration parameters: "${prompt}"`,
      config: {
        systemInstruction:
          'You are a 3D Houdini / WebGL particle simulation parameter synthesizer. Map natural language scene descriptions into valid particle studio parameters.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shape: {
              type: Type.STRING,
              description:
                'One of: sphere, torus, helix, terrain, cube, vortex, audiocore, qr',
            },
            sceneTitle: {
              type: Type.STRING,
              description: 'Short filename ending in .ptc (e.g. Aero_Vortex_01.ptc)',
            },
            summary: {
              type: Type.STRING,
              description: 'Concise 6-10 word summary of the physical simulation',
            },
            curlFreq: { type: Type.NUMBER, description: '0.05 to 1.5' },
            curlAmp: { type: Type.NUMBER, description: '0.0 to 3.0' },
            gravityX: { type: Type.NUMBER, description: '-2.0 to 2.0' },
            gravityY: { type: Type.NUMBER, description: '-2.0 to 2.0' },
            gravityZ: { type: Type.NUMBER, description: '-2.0 to 2.0' },
            interactionMode: {
              type: Type.STRING,
              description: 'One of: repel, attract, vortex, shatter',
            },
            colorMode: {
              type: Type.STRING,
              description: 'One of: mono, velocity, depth',
            },
            blendMode: {
              type: Type.STRING,
              description: 'One of: additive, normal, multiply',
            },
            pointSize: { type: Type.NUMBER, description: '0.8 to 5.0' },
            accentHex: {
              type: Type.STRING,
              description: 'Hex color string like #FF5722',
            },
          },
          required: [
            'shape',
            'sceneTitle',
            'summary',
            'curlFreq',
            'curlAmp',
            'interactionMode',
            'colorMode',
            'blendMode',
            'pointSize',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const validShapes = ['sphere', 'torus', 'helix', 'terrain', 'cube', 'vortex', 'audiocore', 'qr'];
    const validInteractions = ['repel', 'attract', 'vortex', 'shatter'];
    const validColorModes = ['mono', 'velocity', 'depth'];
    const validBlendModes = ['additive', 'normal', 'multiply'];

    const shape = validShapes.includes(parsed.shape) ? parsed.shape : 'vortex';
    const interactionMode = validInteractions.includes(parsed.interactionMode)
      ? parsed.interactionMode
      : 'repel';
    const colorMode = validColorModes.includes(parsed.colorMode) ? parsed.colorMode : 'mono';
    const blendMode = validBlendModes.includes(parsed.blendMode) ? parsed.blendMode : 'additive';

    const accentHex =
      typeof parsed.accentHex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(parsed.accentHex)
        ? parsed.accentHex
        : '#FF5722';

    const colorStops = [
      { id: 'stop-0', position: 0.0, color: '#FFFFFF' },
      { id: 'stop-1', position: 0.45, color: '#A1A1AA' },
      { id: 'stop-2', position: 0.85, color: accentHex },
    ];

    res.json({
      shape,
      sceneTitle:
        typeof parsed.sceneTitle === 'string' && parsed.sceneTitle.trim()
          ? parsed.sceneTitle.trim()
          : `${shape}_Scene.ptc`,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : `Synthesized ${shape} simulation`,
      curlFreq: Math.max(0.05, Math.min(1.5, Number(parsed.curlFreq) || 0.45)),
      curlAmp: Math.max(0.0, Math.min(3.0, Number(parsed.curlAmp) || 1.2)),
      gravity: {
        x: Math.max(-2, Math.min(2, Number(parsed.gravityX) || 0)),
        y: Math.max(-2, Math.min(2, Number(parsed.gravityY) || -0.4)),
        z: Math.max(-2, Math.min(2, Number(parsed.gravityZ) || 0.1)),
      },
      interactionMode,
      colorMode,
      blendMode,
      pointSize: Math.max(0.8, Math.min(5.0, Number(parsed.pointSize) || 1.8)),
      colorStops: colorStops.length ? colorStops : DEFAULT_COLOR_STOPS,
      source: 'gemini',
    });
  } catch (err) {
    console.warn('Gemini synthesis fallback:', err instanceof Error ? err.message : err);
    res.json(fallbackSynthesizePrompt(prompt));
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ParticleStudio server listening on http://localhost:${PORT}`);
  });
}

startServer();
