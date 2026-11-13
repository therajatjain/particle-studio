import { Download, Grid3X3, Layers, RotateCcw } from 'lucide-react';
import type {
  CameraPreset,
  CameraProjection,
  ShadingMode,
  TelemetryStats,
} from '../types/studio';

interface TopHudProps {
  sceneTitle: string;
  onSceneTitleChange: (next: string) => void;
  telemetry: TelemetryStats;
  shadingMode: ShadingMode;
  onShadingModeChange: (mode: ShadingMode) => void;
  projection: CameraProjection;
  onProjectionToggle: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onReset: () => void;
  onOpenExport: () => void;
  orientation: { theta: number; phi: number };
  railExpanded?: boolean;
}

const SHADING_MODES: Array<{ id: ShadingMode; label: string }> = [
  { id: 'points', label: 'Points' },
  { id: 'links', label: 'Links' },
  { id: 'voxel', label: 'Voxel' },
  { id: 'depth', label: 'Depth' },
];

export function TopHud({
  sceneTitle,
  onSceneTitleChange,
  telemetry,
  shadingMode,
  onShadingModeChange,
  projection,
  onProjectionToggle,
  onCameraPreset,
  showGrid,
  onToggleGrid,
  onReset,
  onOpenExport,
  orientation,
  railExpanded = false,
}: TopHudProps) {
  // Project X/Y/Z basis axes into 2D gizmo space from current spherical camera angles
  const sinT = Math.sin(orientation.theta);
  const cosT = Math.cos(orientation.theta);
  const cosP = Math.cos(orientation.phi);
  const sinP = Math.sin(orientation.phi);

  const projectAxis = (ax: number, ay: number, az: number) => {
    // Camera right vector = (cosT, 0, -sinT), up vector = (-sinT*cosP, sinP, -cosT*cosP)
    const sx = ax * cosT - az * sinT;
    const sy = -(ax * (-sinT * cosP) + ay * sinP + az * (-cosT * cosP));
    return {
      x: 50 + sx * 34,
      y: 50 + sy * 34,
    };
  };

  const xEnd = projectAxis(1, 0, 0);
  const yEnd = projectAxis(0, 1, 0);
  const zEnd = projectAxis(0, 0, 1);

  return (
    <>
      {/* TOP BAR (Single-row non-wrapping HUD across viewport) */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
        {/* TOP-LEFT HUD */}
        <div
          className={`flex items-center pointer-events-auto min-w-0 ${
            railExpanded ? 'gap-1' : 'gap-1.5'
          }`}
        >
          {/* Breadcrumb & Editable Scene Title */}
          <div
            className={`flex items-center h-8 bg-[#0E0E11]/95 border border-[#222226] rounded text-xs gap-1.5 shrink-0 ${
              railExpanded ? 'px-1.5' : 'px-2'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#FF5722] shrink-0" aria-hidden="true" />
            {!railExpanded && (
              <>
                <span className="text-[#A1A1AA] font-medium whitespace-nowrap hidden xl:inline">
                  ParticleStudio
                </span>
                <span className="text-[#52525B] hidden xl:inline" aria-hidden="true">
                  /
                </span>
              </>
            )}
            <input
              type="text"
              aria-label="Scene filename"
              value={sceneTitle}
              onChange={(e) => onSceneTitleChange(e.target.value)}
              className={`bg-transparent text-[#F4F4F5] font-mono text-[11px] font-medium tracking-tight focus:outline-none focus:text-[#FF5722] truncate ${
                railExpanded ? 'w-20' : 'w-28'
              }`}
            />
          </div>

          {/* Live Telemetry Readout */}
          <div
            data-testid="telemetry-hud"
            className={`flex items-center h-8 bg-[#0E0E11]/95 border border-[#222226] rounded font-mono text-[11px] tabular-nums text-[#A1A1AA] gap-1.5 whitespace-nowrap shrink-0 ${
              railExpanded ? 'px-1.5' : 'px-2'
            }`}
          >
            <span className="text-[#F4F4F5] font-medium" data-testid="fps-readout">
              {telemetry.fps} FPS
            </span>
            <span className="w-[1px] h-3.5 bg-[#222226]" aria-hidden="true" />
            <span>
              <span className="text-[#F4F4F5] font-medium" data-testid="pts-readout">
                {telemetry.targetPoints.toLocaleString()}
              </span>{' '}
              <span className="text-[10px] text-[#71717A]">PTS</span>
            </span>
            {!railExpanded && (
              <>
                <span className="w-[1px] h-3.5 bg-[#222226] hidden 2xl:inline-block" aria-hidden="true" />
                <span className="text-[10px] text-[#71717A] hidden 2xl:inline" data-testid="buffer-readout">
                  {telemetry.bufferMB.toFixed(1)} MB
                </span>
              </>
            )}
          </div>

          {/* Shading Mode Segmented Selector */}
          <div
            role="group"
            aria-label="Shading mode"
            className="flex items-center h-8 p-0.5 bg-[#0E0E11]/95 border border-[#222226] rounded text-[11px] font-mono shrink-0"
          >
            {SHADING_MODES.map((m) => {
              const active = shadingMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onShadingModeChange(m.id)}
                  aria-pressed={active}
                  className={`px-1.5 h-full rounded-[3px] whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#16161A] text-[#F4F4F5] border border-[#3F3F46] font-medium'
                      : 'text-[#A1A1AA] hover:text-[#F4F4F5] border border-transparent'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TOP-RIGHT HUD */}
        <div
          className={`flex items-center pointer-events-auto shrink-0 ${
            railExpanded ? 'gap-1' : 'gap-1.5'
          }`}
        >
        {/* Camera Presets & Projection Toggle */}
        <div className="flex items-center h-8 px-1 bg-[#0E0E11]/95 border border-[#222226] rounded text-[11px] font-mono text-[#A1A1AA] gap-0.5">
          <button
            type="button"
            onClick={() => onCameraPreset('front')}
            className="px-1.5 h-6 hover:bg-[#16161A] hover:text-[#F4F4F5] rounded transition-colors"
            title="Front Camera View"
            aria-label="Front Camera View"
          >
            F
          </button>
          <button
            type="button"
            onClick={() => onCameraPreset('top')}
            className="px-1.5 h-6 hover:bg-[#16161A] hover:text-[#F4F4F5] rounded transition-colors"
            title="Top Camera View"
            aria-label="Top Camera View"
          >
            T
          </button>
          <button
            type="button"
            onClick={() => onCameraPreset('iso')}
            className="px-1.5 h-6 hover:bg-[#16161A] hover:text-[#F4F4F5] rounded transition-colors"
            title="Isometric Camera View"
            aria-label="Isometric Camera View"
          >
            ISO
          </button>
          <span className="w-[1px] h-4 bg-[#222226] mx-0.5" aria-hidden="true" />
          <button
            type="button"
            onClick={onProjectionToggle}
            aria-pressed={projection === 'orthographic'}
            className={`px-1.5 h-6 rounded transition-colors ${
              projection === 'orthographic'
                ? 'bg-[#16161A] text-[#FF5722] border border-[#3F3F46]'
                : 'hover:bg-[#16161A] hover:text-[#F4F4F5]'
            }`}
            title="Toggle Perspective / Orthographic Projection"
          >
            {projection === 'orthographic' ? 'ORTHO' : 'PERSP'}
          </button>
        </div>

        {/* Grid Toggle */}
        <button
          type="button"
          onClick={onToggleGrid}
          aria-pressed={showGrid}
          aria-label="Toggle 3D perspective grid"
          title="Toggle 3D perspective grid"
          className={`flex items-center justify-center h-8 w-8 bg-[#0E0E11]/95 border rounded transition-colors ${
            showGrid
              ? 'border-[#3F3F46] text-[#FF5722]'
              : 'border-[#222226] text-[#71717A] hover:text-[#F4F4F5]'
          }`}
        >
          <Grid3X3 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Reset Viewport */}
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset viewport"
          className={`flex items-center justify-center h-8 bg-[#0E0E11]/95 border border-[#222226] hover:border-[#3F3F46] rounded text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors whitespace-nowrap ${
            railExpanded ? 'w-8 px-0' : 'gap-1.5 px-2.5'
          }`}
          title="Recenter camera and reset particle velocities"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {!railExpanded && <span>Reset</span>}
        </button>

        {/* Primary Export / Share CTA */}
        <button
          type="button"
          onClick={onOpenExport}
          className={`flex items-center gap-1.5 h-8 bg-[#FAFAFA] hover:bg-white active:bg-zinc-200 text-[#09090B] font-semibold text-xs rounded transition-colors whitespace-nowrap ${
            railExpanded ? 'px-2.5' : 'px-3'
          }`}
        >
          <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Export / Share</span>
        </button>
        </div>
      </div>

      {/* Live 3D Axis Orientation Gizmo */}
      <div
        aria-label="3D Coordinate Axis Orientation"
        className="absolute top-14 right-3 z-10 w-16 h-16 flex items-center justify-center pointer-events-none"
      >
        <svg className="w-16 h-16" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="2.5" fill="#52525B" />
          <line x1="50" y1="50" x2={xEnd.x} y2={xEnd.y} stroke="#EF4444" strokeWidth="1.8" />
          <circle cx={xEnd.x} cy={xEnd.y} r="3.5" fill="#EF4444" />
          <text
            x={xEnd.x + (xEnd.x >= 50 ? 5 : -10)}
            y={xEnd.y + 3}
            fill="#EF4444"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            X
          </text>

          <line x1="50" y1="50" x2={yEnd.x} y2={yEnd.y} stroke="#10B981" strokeWidth="1.8" />
          <circle cx={yEnd.x} cy={yEnd.y} r="3.5" fill="#10B981" />
          <text
            x={yEnd.x + 5}
            y={yEnd.y + 3}
            fill="#10B981"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            Y
          </text>

          <line x1="50" y1="50" x2={zEnd.x} y2={zEnd.y} stroke="#3B82F6" strokeWidth="1.8" />
          <circle cx={zEnd.x} cy={zEnd.y} r="3.5" fill="#3B82F6" />
          <text
            x={zEnd.x + (zEnd.x >= 50 ? 5 : -10)}
            y={zEnd.y + 3}
            fill="#3B82F6"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            Z
          </text>
        </svg>
      </div>
    </>
  );
}
