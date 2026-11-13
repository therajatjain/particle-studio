import { useRef, useState } from 'react';
import { ChevronDown, QrCode, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type {
  BlendMode,
  ColorMode,
  DistributionMode,
  InteractionMode,
  QRErrorLevel,
  StudioParams,
} from '../types/studio';

interface InspectorSidebarProps {
  params: StudioParams;
  onChange: (patch: Partial<StudioParams>) => void;
  onDistributionChange: (dist: DistributionMode) => void;
  onResetPhysics: () => void;
  onSnapQrOrtho: () => void;
}

const DISTRIBUTIONS: Array<{ id: DistributionMode; label: string }> = [
  { id: 'surface', label: 'Surface' },
  { id: 'volume', label: 'Volume' },
  { id: 'voxel', label: 'Voxel' },
  { id: 'qr', label: 'QR' },
];

const INTERACTIONS: Array<{ id: InteractionMode; label: string }> = [
  { id: 'repel', label: 'Repel' },
  { id: 'attract', label: 'Attract' },
  { id: 'vortex', label: 'Vortex' },
  { id: 'shatter', label: 'Shatter' },
];

const BLEND_MODES: Array<{ id: BlendMode; label: string }> = [
  { id: 'additive', label: 'Additive' },
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
];

const QR_LEVELS: Array<{ id: QRErrorLevel; label: string }> = [
  { id: 'L', label: 'L (7%)' },
  { id: 'M', label: 'M (15%)' },
  { id: 'Q', label: 'Q (25%)' },
  { id: 'H', label: 'H (30%)' },
];

export function InspectorSidebar({
  params,
  onChange,
  onDistributionChange,
  onResetPhysics,
  onSnapQrOrtho,
}: InspectorSidebarProps) {
  const [openSections, setOpenSections] = useState({
    emission: true,
    physics: true,
    shaders: true,
    qr: true,
  });
  const [selectedStopId, setSelectedStopId] = useState<string>(
    params.colorStops[params.colorStops.length - 1]?.id ?? 'stop-2',
  );

  const xyPadRef = useRef<HTMLDivElement | null>(null);
  const draggingPadRef = useRef(false);

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePadPointer = (clientX: number, clientY: number) => {
    const pad = xyPadRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const curlFreq = Number(((x / rect.width) * 1.5).toFixed(2));
    const curlAmp = Number((((rect.height - y) / rect.height) * 3.0).toFixed(2));
    onChange({ curlFreq, curlAmp });
  };

  const padLeftPct = Math.max(0, Math.min(100, (params.curlFreq / 1.5) * 100));
  const padTopPct = Math.max(0, Math.min(100, (1 - params.curlAmp / 3.0) * 100));

  const sortedStops = [...params.colorStops].sort((a, b) => a.position - b.position);
  const gradientCss = `linear-gradient(90deg, ${sortedStops
    .map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
    .join(', ')})`;

  const activeStop =
    params.colorStops.find((s) => s.id === selectedStopId) ?? params.colorStops[0];

  const updateStopColor = (id: string, color: string) => {
    onChange({
      colorStops: params.colorStops.map((s) => (s.id === id ? { ...s, color } : s)),
    });
  };

  const updateStopPos = (id: string, position: number) => {
    onChange({
      colorStops: params.colorStops.map((s) =>
        s.id === id ? { ...s, position: Math.max(0, Math.min(1, position)) } : s,
      ),
    });
  };

  return (
    <aside
      aria-label="Particle Physics and Shaders Inspector"
      className="w-80 shrink-0 h-full bg-[#0E0E11] border-l border-[#222226] flex flex-col justify-between overflow-hidden z-30"
    >
      {/* Inspector Header */}
      <div className="h-12 border-b border-[#222226] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF5722]" aria-hidden="true" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#F4F4F5]">
            Inspector / Physics
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetPhysics}
            className="p-1 text-[#71717A] hover:text-[#F4F4F5] transition-colors"
            title="Reset all physics parameters to defaults"
            aria-label="Reset all physics parameters"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#16161A] border border-[#222226] rounded text-[#A1A1AA]">
            LIVE
          </span>
        </div>
      </div>

      {/* Edge-to-Edge Collapsible Sections (1px solid #222226 dividers, zero nested cards) */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#222226] text-xs">
        {/* 01. Emission & Geometry */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('emission')}
            aria-expanded={openSections.emission}
            className="w-full h-9 px-4 flex items-center justify-between text-[#F4F4F5] hover:bg-[#16161A]/50 font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#71717A]">01.</span>
              <span>Emission &amp; Geometry</span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#71717A] transition-transform ${
                openSections.emission ? '' : '-rotate-90'
              }`}
              aria-hidden="true"
            />
          </button>

          {openSections.emission && (
            <div className="px-4 pb-4 pt-1 space-y-3.5">
              {/* Particle Count */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-[#A1A1AA]">
                  <label htmlFor="particleCountSlider" className="text-[11px] font-medium">
                    Particle Count
                  </label>
                  <div className="flex items-center gap-1 font-mono text-[11px] text-[#F4F4F5]">
                    <input
                      id="particleCountInput"
                      aria-label="Particle count numeric value"
                      type="number"
                      min={10000}
                      max={1000000}
                      step={10000}
                      value={params.particleCount}
                      onChange={(e) => {
                        const v = Math.max(
                          10000,
                          Math.min(1000000, Number(e.target.value) || 10000),
                        );
                        onChange({ particleCount: v });
                      }}
                      className="no-spinner w-20 h-5 px-1.5 bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] focus:border-[#FF5722] text-right font-mono text-[11px] text-[#F4F4F5] tabular-nums rounded focus:outline-none"
                    />
                    <span className="text-[10px] text-[#71717A]">pts</span>
                  </div>
                </div>
                <input
                  id="particleCountSlider"
                  type="range"
                  min={10000}
                  max={1000000}
                  step={10000}
                  value={params.particleCount}
                  onChange={(e) => onChange({ particleCount: Number(e.target.value) })}
                  className="studio-range w-full cursor-ew-resize"
                />
                <div className="flex justify-between text-[9px] font-mono text-[#52525B] mt-1 tabular-nums">
                  <span>10k</span>
                  <span>250k</span>
                  <span>500k</span>
                  <span>1M</span>
                </div>
              </div>

              {/* Distribution Mode */}
              <div>
                <span className="block text-[11px] text-[#A1A1AA] font-medium mb-1.5">
                  Distribution Mode
                </span>
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#16161A] border border-[#222226] rounded">
                  {DISTRIBUTIONS.map((d) => {
                    const active = params.distribution === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onDistributionChange(d.id)}
                        aria-pressed={active}
                        className={`py-1 text-[10px] font-mono text-center rounded transition-colors ${
                          active
                            ? 'bg-[#222226] text-[#F4F4F5] border border-[#3F3F46] font-medium'
                            : 'text-[#A1A1AA] hover:text-[#F4F4F5] border border-transparent'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Point Size & Perspective Attenuation */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-[#A1A1AA]">
                  <label htmlFor="pointSizeSlider" className="text-[11px] font-medium">
                    Point Size &amp; Attenuation
                  </label>
                  <span className="font-mono text-[11px] text-[#F4F4F5] tabular-nums">
                    {params.pointSize.toFixed(1)}px
                  </span>
                </div>
                <input
                  id="pointSizeSlider"
                  type="range"
                  min={0.5}
                  max={8.0}
                  step={0.1}
                  value={params.pointSize}
                  onChange={(e) => onChange({ pointSize: Number(e.target.value) })}
                  className="studio-range w-full cursor-ew-resize"
                />
                <label className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#222226]/60 cursor-pointer">
                  <span className="text-[10px] text-[#A1A1AA]">Perspective Scaling</span>
                  <input
                    type="checkbox"
                    checked={params.perspectiveScaling}
                    onChange={(e) => onChange({ perspectiveScaling: e.target.checked })}
                    className="accent-[#FF5722] cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* 02. Physics & Forces */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('physics')}
            aria-expanded={openSections.physics}
            className="w-full h-9 px-4 flex items-center justify-between text-[#F4F4F5] hover:bg-[#16161A]/50 font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#71717A]">02.</span>
              <span>Physics &amp; Forces</span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#71717A] transition-transform ${
                openSections.physics ? '' : '-rotate-90'
              }`}
              aria-hidden="true"
            />
          </button>

          {openSections.physics && (
            <div className="px-4 pb-4 pt-1 space-y-3.5">
              {/* Curl Noise XY Pad */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-[#A1A1AA] font-medium">
                    Turbulence / Curl Noise
                  </span>
                  <span className="font-mono text-[10px] text-[#71717A] tabular-nums">
                    Freq:{' '}
                    <span className="text-[#F4F4F5]">{params.curlFreq.toFixed(2)}</span> · Amp:{' '}
                    <span className="text-[#F4F4F5]">{params.curlAmp.toFixed(2)}</span>
                  </span>
                </div>
                <div
                  ref={xyPadRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Curl noise frequency and amplitude XY pad"
                  aria-valuetext={`Frequency ${params.curlFreq.toFixed(2)}, Amplitude ${params.curlAmp.toFixed(2)}`}
                  onPointerDown={(e) => {
                    draggingPadRef.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handlePadPointer(e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (draggingPadRef.current) handlePadPointer(e.clientX, e.clientY);
                  }}
                  onPointerUp={() => {
                    draggingPadRef.current = false;
                  }}
                  className="relative w-full h-24 bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] rounded cursor-crosshair overflow-hidden"
                >
                  <div className="absolute inset-0 grid grid-cols-4 grid-rows-3 pointer-events-none opacity-35">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="border-r border-b border-[#222226]" />
                    ))}
                  </div>
                  <div
                    className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${padLeftPct}%`, top: `${padTopPct}%` }}
                  >
                    <div className="w-full h-full border border-[#FF5722] rounded-full bg-[#FF5722]/25" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full" />
                  </div>
                  <span className="absolute bottom-1 right-2 text-[9px] font-mono text-[#52525B] pointer-events-none">
                    XY NOISE PAD
                  </span>
                </div>
              </div>

              {/* Gravity & Wind Vector */}
              <div>
                <span className="block text-[11px] text-[#A1A1AA] font-medium mb-1.5">
                  Gravity &amp; Wind Vector
                </span>
                <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                  <label className="flex items-center bg-[#16161A] border border-[#222226] rounded px-1.5 py-1 focus-within:border-[#FF5722]">
                    <span className="text-red-400 text-[10px] font-bold mr-1">X</span>
                    <input
                      aria-label="Gravity X"
                      type="number"
                      step={0.1}
                      value={params.gravity.x}
                      onChange={(e) =>
                        onChange({
                          gravity: { ...params.gravity, x: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="no-spinner w-full bg-transparent text-right text-[#F4F4F5] focus:outline-none tabular-nums"
                    />
                  </label>
                  <label className="flex items-center bg-[#16161A] border border-[#222226] rounded px-1.5 py-1 focus-within:border-[#FF5722]">
                    <span className="text-emerald-400 text-[10px] font-bold mr-1">Y</span>
                    <input
                      aria-label="Gravity Y"
                      type="number"
                      step={0.1}
                      value={params.gravity.y}
                      onChange={(e) =>
                        onChange({
                          gravity: { ...params.gravity, y: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="no-spinner w-full bg-transparent text-right text-[#F4F4F5] focus:outline-none tabular-nums"
                    />
                  </label>
                  <label className="flex items-center bg-[#16161A] border border-[#222226] rounded px-1.5 py-1 focus-within:border-[#FF5722]">
                    <span className="text-blue-400 text-[10px] font-bold mr-1">Z</span>
                    <input
                      aria-label="Gravity Z"
                      type="number"
                      step={0.1}
                      value={params.gravity.z}
                      onChange={(e) =>
                        onChange({
                          gravity: { ...params.gravity, z: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="no-spinner w-full bg-transparent text-right text-[#F4F4F5] focus:outline-none tabular-nums"
                    />
                  </label>
                </div>
              </div>

              {/* Cursor Interaction Mode */}
              <div>
                <span className="block text-[11px] text-[#A1A1AA] font-medium mb-1.5">
                  Cursor Interaction Mode
                </span>
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#16161A] border border-[#222226] rounded mb-2.5">
                  {INTERACTIONS.map((mode) => {
                    const active = params.interactionMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => onChange({ interactionMode: mode.id })}
                        aria-pressed={active}
                        className={`py-1 text-[10px] font-mono text-center rounded transition-colors ${
                          active
                            ? 'bg-[#222226] text-[#F4F4F5] border border-[#3F3F46] font-medium'
                            : 'text-[#A1A1AA] hover:text-[#F4F4F5] border border-transparent'
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-[#A1A1AA] mb-1 tabular-nums">
                      <label htmlFor="radiusSlider">Interaction Radius</label>
                      <span className="text-[#F4F4F5]">{params.interactionRadius}px</span>
                    </div>
                    <input
                      id="radiusSlider"
                      type="range"
                      min={20}
                      max={400}
                      value={params.interactionRadius}
                      onChange={(e) => onChange({ interactionRadius: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-[#A1A1AA] mb-1 tabular-nums">
                      <label htmlFor="stiffnessSlider">Spring Stiffness / Damping</label>
                      <span className="text-[#F4F4F5]">{params.springStiffness.toFixed(2)}</span>
                    </div>
                    <input
                      id="stiffnessSlider"
                      type="range"
                      min={0.05}
                      max={1.0}
                      step={0.01}
                      value={params.springStiffness}
                      onChange={(e) => onChange({ springStiffness: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 03. Shaders & Color Mapping */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('shaders')}
            aria-expanded={openSections.shaders}
            className="w-full h-9 px-4 flex items-center justify-between text-[#F4F4F5] hover:bg-[#16161A]/50 font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#71717A]">03.</span>
              <span>Shaders &amp; Color Mapping</span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#71717A] transition-transform ${
                openSections.shaders ? '' : '-rotate-90'
              }`}
              aria-hidden="true"
            />
          </button>

          {openSections.shaders && (
            <div className="px-4 pb-4 pt-1 space-y-3.5">
              <div>
                <label
                  htmlFor="colorModeSelect"
                  className="block text-[11px] text-[#A1A1AA] font-medium mb-1.5"
                >
                  Color Mode
                </label>
                <select
                  id="colorModeSelect"
                  value={params.colorMode}
                  onChange={(e) => onChange({ colorMode: e.target.value as ColorMode })}
                  className="w-full h-7 px-2 bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] focus:border-[#FF5722] text-[#F4F4F5] text-xs rounded focus:outline-none cursor-pointer"
                >
                  <option value="mono">Monochrome + Accent</option>
                  <option value="velocity">Velocity Ramp (Thermal)</option>
                  <option value="depth">Depth Gradient (Z-Buffer)</option>
                  <option value="image">Source RGB</option>
                </select>
              </div>

              {/* Interactive Multi-Stop Color Gradient Ramp */}
              <div>
                <div className="flex justify-between items-center text-[11px] text-[#A1A1AA] font-medium mb-1.5">
                  <span>Color Gradient Ramp</span>
                  <span className="font-mono text-[10px] text-[#FF5722]">
                    {activeStop?.color.toUpperCase()}
                  </span>
                </div>
                <div className="relative w-full h-6 rounded border border-[#222226] p-0.5 bg-[#16161A]">
                  <div className="w-full h-full rounded-[2px]" style={{ background: gradientCss }} />
                  {sortedStops.map((stop) => {
                    const isSelected = stop.id === activeStop?.id;
                    return (
                      <button
                        key={stop.id}
                        type="button"
                        aria-label={`Select color stop ${stop.color}`}
                        onClick={() => setSelectedStopId(stop.id)}
                        style={{
                          left: `calc(${Math.round(stop.position * 100)}% - 6px)`,
                          backgroundColor: stop.color,
                        }}
                        className={`absolute top-1/2 -translate-y-1/2 w-3 h-4 rounded-[2px] border transition-transform ${
                          isSelected
                            ? 'border-[#FF5722] scale-115 z-10'
                            : 'border-[#09090B]'
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Selected Stop Color & Position Editor */}
                {activeStop && (
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-mono">
                    <input
                      type="color"
                      aria-label="Edit selected gradient stop color"
                      value={activeStop.color}
                      onChange={(e) => updateStopColor(activeStop.id, e.target.value)}
                      className="w-6 h-5 bg-transparent border border-[#222226] rounded cursor-pointer p-0"
                    />
                    <input
                      type="range"
                      aria-label="Edit selected gradient stop position"
                      min={0}
                      max={1}
                      step={0.01}
                      value={activeStop.position}
                      onChange={(e) => updateStopPos(activeStop.id, Number(e.target.value))}
                      className="studio-range flex-1"
                    />
                    <span className="text-[#A1A1AA] tabular-nums w-8 text-right">
                      {Math.round(activeStop.position * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Blend Mode */}
              <div>
                <span className="block text-[11px] text-[#A1A1AA] font-medium mb-1.5">
                  Blend Mode
                </span>
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#16161A] border border-[#222226] rounded">
                  {BLEND_MODES.map((b) => {
                    const active = params.blendMode === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onChange({ blendMode: b.id })}
                        aria-pressed={active}
                        className={`py-1 text-[10px] font-mono text-center rounded transition-colors ${
                          active
                            ? 'bg-[#222226] text-[#F4F4F5] border border-[#3F3F46] font-medium'
                            : 'text-[#A1A1AA] hover:text-[#F4F4F5] border border-transparent'
                        }`}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-0.5">
                <div>
                  <div className="flex justify-between text-[10px] font-mono text-[#A1A1AA] mb-1 tabular-nums">
                    <label htmlFor="decaySlider">Motion Trails / Decay</label>
                    <span className="text-[#F4F4F5]">{params.decay.toFixed(2)}</span>
                  </div>
                  <input
                    id="decaySlider"
                    type="range"
                    min={0.5}
                    max={0.98}
                    step={0.01}
                    value={params.decay}
                    onChange={(e) => onChange({ decay: Number(e.target.value) })}
                    className="studio-range w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-mono text-[#A1A1AA] mb-1 tabular-nums">
                    <label htmlFor="bloomSlider">Bloom Intensity</label>
                    <span className="text-[#F4F4F5]">{params.bloom.toFixed(2)}</span>
                  </div>
                  <input
                    id="bloomSlider"
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={params.bloom}
                    onChange={(e) => onChange({ bloom: Number(e.target.value) })}
                    className="studio-range w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 04. QR & Matrix Mapping */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('qr')}
            aria-expanded={openSections.qr}
            className="w-full h-9 px-4 flex items-center justify-between text-[#F4F4F5] hover:bg-[#16161A]/50 font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#71717A]">04.</span>
              <span>QR &amp; Matrix Mapping</span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#71717A] transition-transform ${
                openSections.qr ? '' : '-rotate-90'
              }`}
              aria-hidden="true"
            />
          </button>

          {openSections.qr && (
            <div className="px-4 pb-4 pt-1 space-y-3.5">
              <div>
                <div className="flex justify-between text-[11px] text-[#A1A1AA] font-medium mb-1">
                  <label htmlFor="zDispSlider">Z-Displacement Depth</label>
                  <span className="font-mono text-[11px] text-[#F4F4F5] tabular-nums">
                    {params.zDisplacement.toFixed(1)} mm
                  </span>
                </div>
                <input
                  id="zDispSlider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={params.zDisplacement}
                  onChange={(e) => onChange({ zDisplacement: Number(e.target.value) })}
                  className="studio-range w-full"
                />
              </div>

              <div>
                <span className="block text-[11px] text-[#A1A1AA] font-medium mb-1.5">
                  QR Error Correction
                </span>
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#16161A] border border-[#222226] rounded font-mono text-[10px]">
                  {QR_LEVELS.map((lvl) => {
                    const active = params.qrErrorLevel === lvl.id;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => onChange({ qrErrorLevel: lvl.id })}
                        aria-pressed={active}
                        className={`py-1 rounded transition-colors ${
                          active
                            ? 'bg-[#222226] text-[#F4F4F5] border border-[#3F3F46] font-medium'
                            : 'text-[#A1A1AA] hover:text-[#F4F4F5] border border-transparent'
                        }`}
                      >
                        {lvl.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={onSnapQrOrtho}
                className="w-full h-8 px-3 bg-[#16161A] hover:bg-[#222226] border border-[#222226] hover:border-[#3F3F46] rounded text-xs font-medium text-[#F4F4F5] flex items-center justify-center gap-2 transition-colors"
              >
                <QrCode className="w-3.5 h-3.5 text-[#FF5722]" aria-hidden="true" />
                <span>Snap Ortho (Scannable View)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Inspector Footer */}
      <div className="h-9 border-t border-[#222226] px-4 flex items-center justify-between font-mono text-[10px] text-[#71717A] bg-[#0E0E11] shrink-0">
        <span>SHADER PIPELINE READY</span>
        <span className="tabular-nums">DECAY {params.decay.toFixed(2)}</span>
      </div>
    </aside>
  );
}
