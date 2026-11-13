import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandDock } from './components/CommandDock';
import { ExportModal } from './components/ExportModal';
import { InspectorSidebar } from './components/InspectorSidebar';
import { LeftRail } from './components/LeftRail';
import {
  ParticleViewport,
  type ParticleViewportHandle,
} from './components/ParticleViewport';
import { TopHud } from './components/TopHud';
import {
  DEFAULT_COLOR_STOPS,
  buildProceduralDepthRgba,
  parseObjVertices,
  sampleRgbaToDepthCloud,
} from './engine/formations';
import type {
  CameraBookmark,
  CameraPreset,
  CameraProjection,
  DistributionMode,
  DockMode,
  FormationShape,
  SceneCheckpoint,
  StudioParams,
  SynthesisResponse,
  TelemetryStats,
} from './types/studio';

const INITIAL_PARAMS: StudioParams = {
  particleCount: 250000,
  distribution: 'surface',
  pointSize: 1.8,
  perspectiveScaling: true,
  curlFreq: 0.45,
  curlAmp: 1.2,
  gravity: { x: 0.0, y: -0.8, z: 0.2 },
  interactionMode: 'repel',
  interactionRadius: 140,
  springStiffness: 0.72,
  colorMode: 'mono',
  colorStops: DEFAULT_COLOR_STOPS,
  blendMode: 'additive',
  decay: 0.88,
  bloom: 0.35,
  zDisplacement: 42.0,
  qrErrorLevel: 'Q',
  qrPayload: 'https://particlestudio.app',
  shadingMode: 'points',
  showGrid: true,
  audioReactive: false,
};

const INITIAL_CHECKPOINTS: SceneCheckpoint[] = [
  {
    id: 'cp-4',
    label: '#04 Spherical_Vortex',
    shape: 'sphere',
    timestamp: '00:00',
    summary: '250k radial vortex field',
    params: INITIAL_PARAMS,
  },
  {
    id: 'cp-3',
    label: '#03 QR_Matrix_URL',
    shape: 'qr',
    timestamp: '00:12',
    summary: 'Deterministic 3D QR grid',
    params: { ...INITIAL_PARAMS, distribution: 'qr', curlAmp: 0.05 },
  },
  {
    id: 'cp-2',
    label: '#02 Double_Helix_DNA',
    shape: 'helix',
    timestamp: '00:24',
    summary: 'Bi-strand spiral lattice',
    params: { ...INITIAL_PARAMS, curlFreq: 0.55, curlAmp: 0.85 },
  },
  {
    id: 'cp-1',
    label: '#01 Perlin_Terrain',
    shape: 'terrain',
    timestamp: '00:36',
    summary: 'Topographic ridge field',
    params: { ...INITIAL_PARAMS, curlFreq: 0.3, curlAmp: 0.65 },
  },
];

const INITIAL_BOOKMARKS: CameraBookmark[] = [
  { id: 'bm-1', name: 'Hero Isometric', theta: 0.65, phi: 1.12, radius: 440, projection: 'perspective' },
  { id: 'bm-2', name: 'QR Scannable Ortho', theta: 0, phi: Math.PI / 2, radius: 380, projection: 'orthographic' },
  { id: 'bm-3', name: 'Top Elevation', theta: 0, phi: 0.06, radius: 460, projection: 'perspective' },
];

export default function App() {
  const viewportRef = useRef<ParticleViewportHandle | null>(null);
  const dockInputRef = useRef<HTMLInputElement | null>(null);

  const [params, setParams] = useState<StudioParams>(INITIAL_PARAMS);
  const [activeShape, setActiveShape] = useState<FormationShape>('sphere');
  const [sceneTitle, setSceneTitle] = useState('Untitled_Scene_01.ptc');
  const [dockMode, setDockMode] = useState<DockMode>('prompt');
  const [promptText, setPromptText] = useState(
    'Disintegrate into aerodynamic turbulence vortex with warm orange core',
  );
  const [projection, setProjection] = useState<CameraProjection>('perspective');
  const [orientation, setOrientation] = useState({ theta: 0.65, phi: 1.12 });
  const [telemetry, setTelemetry] = useState<TelemetryStats>({
    fps: 60,
    activePoints: 250000,
    targetPoints: 250000,
    bufferMB: 12.4,
    backendLabel: 'GPGPU / WEBGL2',
    isSoftwareGl: false,
  });

  const [checkpoints, setCheckpoints] = useState<SceneCheckpoint[]>(INITIAL_CHECKPOINTS);
  const [activeCheckpointId, setActiveCheckpointId] = useState<string>('cp-4');
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>(INITIAL_BOOKMARKS);
  const [isSequencing, setIsSequencing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((curr) => (curr === msg ? null : curr));
    }, 2600);
  }, []);

  const updateParams = useCallback((patch: Partial<StudioParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  }, []);

  // Cmd+K / Ctrl+K focus shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        dockInputRef.current?.focus();
        dockInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keyframe Morph Sequencer loop
  useEffect(() => {
    if (!isSequencing || checkpoints.length < 2) return;
    let idx = Math.max(
      0,
      checkpoints.findIndex((c) => c.id === activeCheckpointId),
    );
    const id = window.setInterval(() => {
      idx = (idx + 1) % checkpoints.length;
      const cp = checkpoints[idx];
      setActiveCheckpointId(cp.id);
      setActiveShape(cp.shape);
      setParams(cp.params);
      viewportRef.current?.applyFormation(cp.shape);
    }, 2400);
    return () => clearInterval(id);
  }, [isSequencing, checkpoints, activeCheckpointId]);

  const densityLabel: 'Low' | 'Med' | 'High' | 'Ultra' =
    params.particleCount <= 75000
      ? 'Low'
      : params.particleCount <= 180000
        ? 'Med'
        : params.particleCount <= 400000
          ? 'High'
          : 'Ultra';

  const handleCycleDensity = () => {
    const nextCount =
      params.particleCount <= 75000
        ? 150000
        : params.particleCount <= 180000
          ? 250000
          : params.particleCount <= 400000
            ? 500000
            : 60000;
    updateParams({ particleCount: nextCount });
    notify(`Density set to ${nextCount.toLocaleString()} points`);
  };

  const recordCheckpoint = useCallback(
    (label: string, shape: FormationShape, summary: string, nextParams: StudioParams) => {
      const id = `cp-${Date.now()}`;
      const num = String(checkpoints.length + 1).padStart(2, '0');
      const cp: SceneCheckpoint = {
        id,
        label: `#${num} ${label}`,
        shape,
        timestamp: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }),
        summary,
        params: nextParams,
      };
      setCheckpoints((prev) => [cp, ...prev.slice(0, 11)]);
      setActiveCheckpointId(id);
    },
    [checkpoints.length],
  );

  const handleExecuteCommand = async () => {
    if (dockMode === 'qr') {
      const payload = params.qrPayload.trim() || 'https://particlestudio.app';
      const nextParams: StudioParams = {
        ...params,
        qrPayload: payload,
        distribution: 'qr',
        colorMode: 'image',
      };
      setParams(nextParams);
      setActiveShape('qr');
      setSceneTitle('QR_Matrix_01.ptc');
      viewportRef.current?.applyFormation('qr');
      recordCheckpoint('QR_Matrix', 'qr', payload.slice(0, 26), nextParams);
      notify('Synthesized deterministic 3D QR particle matrix');
      return;
    }

    if (dockMode === 'preset') {
      viewportRef.current?.applyFormation(activeShape);
      notify(`Regenerated ${activeShape} geometry`);
      return;
    }

    if (dockMode === 'image') {
      handleSelectDepthPreset('crater');
      return;
    }

    // Prompt synthesis via server /api/synthesize
    const trimmed = promptText.trim();
    if (!trimmed) return;
    setIsSynthesizing(true);
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });
      if (!res.ok) throw new Error('Synthesis request failed');
      const synth = (await res.json()) as SynthesisResponse;

      const nextParams: StudioParams = {
        ...params,
        curlFreq: synth.curlFreq,
        curlAmp: synth.curlAmp,
        gravity: synth.gravity,
        interactionMode: synth.interactionMode,
        colorMode: synth.colorMode,
        blendMode: synth.blendMode,
        pointSize: synth.pointSize,
        colorStops: synth.colorStops,
      };
      setParams(nextParams);
      setActiveShape(synth.shape);
      setSceneTitle(synth.sceneTitle);
      viewportRef.current?.applyFormation(synth.shape);
      recordCheckpoint(
        synth.sceneTitle.replace('.ptc', ''),
        synth.shape,
        synth.summary,
        nextParams,
      );
      notify(synth.summary);
    } catch {
      notify('Synthesis unavailable — applied local formation');
      viewportRef.current?.applyFormation('vortex');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSelectPreset = (shape: FormationShape) => {
    setActiveShape(shape);
    setSceneTitle(`${shape.charAt(0).toUpperCase() + shape.slice(1)}_01.ptc`);
    viewportRef.current?.applyFormation(shape);
    recordCheckpoint(`${shape}_Preset`, shape, `Procedural ${shape} primitive`, params);
    notify(`Morphed to ${shape.toUpperCase()} geometry`);
  };

  const handleSelectDepthPreset = (preset: 'crater' | 'interference' | 'topography') => {
    const { rgba, width, height } = buildProceduralDepthRgba(preset, 128);
    const cloud = sampleRgbaToDepthCloud(rgba, width, height, 60000, params.zDisplacement);
    setActiveShape('depthmap');
    setSceneTitle(`Depth_${preset}_01.ptc`);
    updateParams({ colorMode: 'image' });
    viewportRef.current?.applyFormation('depthmap', {
      positions: cloud.positions,
      colors: cloud.colors,
    });
    notify(`Generated 3D heightfield from ${preset} depth map`);
  };

  const handleUploadFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    setPromptText(`Loaded asset: ${file.name}`);

    if (ext === 'obj') {
      const text = await file.text();
      const objPositions = parseObjVertices(text, 80000, 140);
      setActiveShape('custom_obj');
      setSceneTitle(file.name.replace(/\.obj$/i, '.ptc'));
      viewportRef.current?.applyFormation('custom_obj', { positions: objPositions });
      notify(`Imported OBJ vertex cloud: ${file.name}`);
      return;
    }

    // Raster image or SVG -> offscreen canvas RGBA -> 3D depth relief
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 160;
      const ratio = img.width / Math.max(1, img.height);
      canvas.width = ratio >= 1 ? maxDim : Math.max(32, Math.round(maxDim * ratio));
      canvas.height = ratio >= 1 ? Math.max(32, Math.round(maxDim / ratio)) : maxDim;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const cloud = sampleRgbaToDepthCloud(
          imageData.data,
          canvas.width,
          canvas.height,
          80000,
          params.zDisplacement,
        );
        setActiveShape('depthmap');
        setSceneTitle(file.name.replace(/\.[^.]+$/, '.ptc'));
        updateParams({ colorMode: 'image' });
        viewportRef.current?.applyFormation('depthmap', {
          positions: cloud.positions,
          colors: cloud.colors,
        });
        notify(`Extruded 3D relief from ${file.name}`);
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      notify(`Could not parse ${file.name}`);
    };
    img.src = url;
  };

  const handleDistributionChange = (dist: DistributionMode) => {
    updateParams({ distribution: dist });
    if (dist === 'qr') {
      setActiveShape('qr');
      updateParams({ distribution: 'qr', colorMode: 'image' });
      viewportRef.current?.applyFormation('qr');
    } else if (dist === 'voxel') {
      setActiveShape('cube');
      viewportRef.current?.applyFormation('cube');
    } else if (dist === 'volume') {
      setActiveShape('sphere');
      viewportRef.current?.applyFormation('sphere');
    } else {
      setActiveShape('sphere');
      viewportRef.current?.applyFormation('sphere');
    }
  };

  const handleCameraPreset = (preset: CameraPreset) => {
    if (preset === 'qr-ortho') {
      setProjection('orthographic');
      setActiveShape('qr');
      updateParams({ distribution: 'qr', colorMode: 'image' });
      viewportRef.current?.applyFormation('qr');
      viewportRef.current?.setCameraPreset('qr-ortho');
      notify('Aligned Orthographic Camera to Scannable QR Plane');
      return;
    }
    viewportRef.current?.setCameraPreset(preset);
  };

  const handleProjectionToggle = () => {
    const next: CameraProjection =
      projection === 'perspective' ? 'orthographic' : 'perspective';
    setProjection(next);
    viewportRef.current?.setProjection(next);
  };

  const handleResetAll = () => {
    setProjection('perspective');
    viewportRef.current?.setProjection('perspective');
    viewportRef.current?.setCameraPreset('iso');
    viewportRef.current?.resetParticlePositions();
    notify('Viewport and particle velocities reset');
  };

  const handleResetPhysics = () => {
    setParams(INITIAL_PARAMS);
    notify('Restored default physics and shader parameters');
  };

  const handleSaveCheckpoint = () => {
    recordCheckpoint(
      `${activeShape}_KF`,
      activeShape,
      `${params.particleCount.toLocaleString()} pts · curl ${params.curlAmp.toFixed(1)}`,
      params,
    );
    notify('Captured keyframe state in timeline');
  };

  const handleSaveBookmark = () => {
    const cam = viewportRef.current?.getCameraState();
    if (!cam) return;
    const next: CameraBookmark = {
      id: `bm-${Date.now()}`,
      name: `Cam_${String(bookmarks.length + 1).padStart(2, '0')}`,
      ...cam,
    };
    setBookmarks((prev) => [...prev, next]);
    notify(`Saved camera bookmark ${next.name}`);
  };

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#09090B] text-[#F4F4F5]">
      {/* Left Scene Graph & History Rail (56px / 220px) */}
      <LeftRail
        expanded={railExpanded}
        onToggleExpand={() => setRailExpanded((v) => !v)}
        activeShape={activeShape}
        activeCheckpointId={activeCheckpointId}
        checkpoints={checkpoints}
        bookmarks={bookmarks}
        isSequencing={isSequencing}
        onSelectCheckpoint={(cp) => {
          setActiveCheckpointId(cp.id);
          setActiveShape(cp.shape);
          setParams(cp.params);
          viewportRef.current?.applyFormation(cp.shape);
          notify(`Loaded ${cp.label}`);
        }}
        onSaveCheckpoint={handleSaveCheckpoint}
        onToggleSequence={() => setIsSequencing((v) => !v)}
        onApplyPresetShape={handleSelectPreset}
        onSaveBookmark={handleSaveBookmark}
        onRestoreBookmark={(bm) => {
          setProjection(bm.projection);
          viewportRef.current?.restoreCamera(bm);
          notify(`Restored ${bm.name}`);
        }}
      />

      {/* Primary 3D Viewport Canvas Zone */}
      <main className="relative flex-1 min-w-0 h-full overflow-hidden">
        <ParticleViewport
          ref={viewportRef}
          params={params}
          initialShape="sphere"
          onTelemetry={setTelemetry}
          onCameraOrientation={setOrientation}
        />

        <TopHud
          sceneTitle={sceneTitle}
          onSceneTitleChange={setSceneTitle}
          telemetry={telemetry}
          shadingMode={params.shadingMode}
          onShadingModeChange={(shadingMode) => updateParams({ shadingMode })}
          projection={projection}
          onProjectionToggle={handleProjectionToggle}
          onCameraPreset={handleCameraPreset}
          showGrid={params.showGrid}
          onToggleGrid={() => updateParams({ showGrid: !params.showGrid })}
          onReset={handleResetAll}
          onOpenExport={() => setExportOpen(true)}
          orientation={orientation}
          railExpanded={railExpanded}
        />

        <CommandDock
          dockMode={dockMode}
          onDockModeChange={(mode) => {
            setDockMode(mode);
            if (mode === 'qr') {
              setActiveShape('qr');
              updateParams({ distribution: 'qr', colorMode: 'image' });
              viewportRef.current?.applyFormation('qr');
            }
          }}
          promptText={promptText}
          onPromptTextChange={setPromptText}
          qrPayload={params.qrPayload}
          onQrPayloadChange={(qrPayload) => updateParams({ qrPayload })}
          densityLabel={densityLabel}
          onCycleDensity={handleCycleDensity}
          isSynthesizing={isSynthesizing}
          onExecute={handleExecuteCommand}
          onSelectPreset={handleSelectPreset}
          onSelectDepthPreset={handleSelectDepthPreset}
          onUploadFile={handleUploadFile}
          audioReactive={params.audioReactive}
          onToggleAudioReactive={() => {
            const next = !params.audioReactive;
            updateParams({ audioReactive: next });
            notify(next ? 'Audio reactive harmonic modulation enabled' : 'Audio reactive disabled');
          }}
          inputRef={dockInputRef}
        />

        {/* Quiet status confirmation banner */}
        {statusNotice && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-14 left-1/2 -translate-x-1/2 z-40 px-3 py-1 bg-[#0E0E11] border border-[#FF5722]/70 rounded font-mono text-[11px] text-[#F4F4F5] shadow-lg pointer-events-none"
          >
            {statusNotice}
          </div>
        )}
      </main>

      {/* Right Inspector Sidebar (320px Fixed) */}
      <InspectorSidebar
        params={params}
        onChange={updateParams}
        onDistributionChange={handleDistributionChange}
        onResetPhysics={handleResetPhysics}
        onSnapQrOrtho={() => handleCameraPreset('qr-ortho')}
      />

      {/* Export / Share Modal */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        params={params}
        activeShape={activeShape}
        sceneTitle={sceneTitle}
        getSnapshotData={() =>
          viewportRef.current?.getSnapshotData() ?? {
            positions: new Float32Array(0),
            colors: new Float32Array(0),
            count: 0,
          }
        }
        onNotify={notify}
      />
    </div>
  );
}
