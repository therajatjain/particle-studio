import { useState } from 'react';
import {
  Bookmark,
  Camera,
  ChevronRight,
  Clock,
  LayoutGrid,
  Play,
  Plus,
  Sparkles,
  Square,
} from 'lucide-react';
import type {
  CameraBookmark,
  FormationShape,
  SceneCheckpoint,
} from '../types/studio';

export type RailSection = 'nodes' | 'keyframes' | 'presets' | 'cameras';

interface LeftRailProps {
  expanded: boolean;
  onToggleExpand: () => void;
  activeShape: FormationShape;
  activeCheckpointId: string;
  checkpoints: SceneCheckpoint[];
  bookmarks: CameraBookmark[];
  isSequencing: boolean;
  onSelectCheckpoint: (cp: SceneCheckpoint) => void;
  onSaveCheckpoint: () => void;
  onToggleSequence: () => void;
  onApplyPresetShape: (shape: FormationShape) => void;
  onSaveBookmark: () => void;
  onRestoreBookmark: (bm: CameraBookmark) => void;
}

const PRESET_LIST: Array<{ shape: FormationShape; label: string; desc: string }> = [
  { shape: 'sphere', label: 'Spherical Vortex', desc: 'Radial core distribution' },
  { shape: 'torus', label: 'Torus Knot (2,3)', desc: 'Interlocked parametric tube' },
  { shape: 'helix', label: 'Double Helix', desc: 'Bi-strand spiral lattice' },
  { shape: 'terrain', label: 'Perlin Terrain', desc: 'Topographic crater ridge' },
  { shape: 'cube', label: 'Voxel Lattice', desc: 'Quantized 16³ frame' },
  { shape: 'audiocore', label: 'Resonant Core', desc: 'Concentric harmonic shells' },
  { shape: 'qr', label: 'QR Matrix', desc: 'Deterministic 3D barcode' },
];

export function LeftRail({
  expanded,
  onToggleExpand,
  activeShape,
  activeCheckpointId,
  checkpoints,
  bookmarks,
  isSequencing,
  onSelectCheckpoint,
  onSaveCheckpoint,
  onToggleSequence,
  onApplyPresetShape,
  onSaveBookmark,
  onRestoreBookmark,
}: LeftRailProps) {
  const [activeTab, setActiveTab] = useState<RailSection>('nodes');

  const handleNavClick = (tab: RailSection) => {
    if (activeTab === tab && expanded) {
      onToggleExpand();
    } else {
      setActiveTab(tab);
      if (!expanded) onToggleExpand();
    }
  };

  return (
    <aside
      aria-label="Scene Graph and History Rail"
      className={`relative shrink-0 h-full z-30 bg-[#0E0E11] border-r border-[#222226] flex flex-col justify-between transition-[width] duration-200 ease-out overflow-hidden ${
        expanded ? 'w-56' : 'w-14'
      }`}
    >
      <div className="flex flex-col w-full min-h-0 flex-1">
        {/* Top Brand Slot & Expand Toggle */}
        <div className="h-12 border-b border-[#222226] flex items-center justify-between px-3 shrink-0">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse scene rail' : 'Expand scene rail'}
            className="flex items-center gap-2.5 text-[#F4F4F5] hover:text-[#FF5722] transition-colors min-w-0"
          >
            <div className="w-7 h-7 flex items-center justify-center rounded bg-[#16161A] border border-[#222226] text-[#FF5722] shrink-0">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                <circle cx="12" cy="12" r="3" />
                <circle cx="19" cy="5" r="2" />
                <circle cx="5" cy="19" r="2" />
                <path d="M12 9V5m0 14v-4m-7-3H1m22 0h-4" />
              </svg>
            </div>
            {expanded && (
              <span className="text-[11px] font-semibold tracking-wider uppercase whitespace-nowrap truncate">
                Scene Graph
              </span>
            )}
          </button>
          {expanded && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label="Collapse rail"
              className="p-1 text-[#71717A] hover:text-[#F4F4F5]"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            </button>
          )}
        </div>

        {/* Primary Rail Mode Buttons */}
        <div className="p-2 space-y-1 shrink-0">
          <button
            type="button"
            onClick={() => handleNavClick('nodes')}
            aria-label="Scene Nodes"
            className={`w-full flex items-center h-8 px-2 rounded border transition-colors text-xs gap-3 ${
              activeTab === 'nodes'
                ? 'bg-[#16161A] text-[#FF5722] border-[#3F3F46]'
                : 'border-transparent text-[#A1A1AA] hover:bg-[#16161A] hover:text-[#F4F4F5]'
            }`}
          >
            <LayoutGrid className="w-4 h-4 shrink-0" aria-hidden="true" />
            {expanded && (
              <span className="text-[#F4F4F5] font-medium whitespace-nowrap">Nodes</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleNavClick('keyframes')}
            aria-label={`Keyframes (${checkpoints.length})`}
            className={`w-full flex items-center h-8 px-2 rounded border transition-colors text-xs gap-3 ${
              activeTab === 'keyframes'
                ? 'bg-[#16161A] text-[#FF5722] border-[#3F3F46]'
                : 'border-transparent text-[#A1A1AA] hover:bg-[#16161A] hover:text-[#F4F4F5]'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
            {expanded && (
              <span className="text-[#F4F4F5] font-medium whitespace-nowrap">
                Keyframes ({checkpoints.length})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleNavClick('presets')}
            aria-label="Geometry Presets"
            className={`w-full flex items-center h-8 px-2 rounded border transition-colors text-xs gap-3 ${
              activeTab === 'presets'
                ? 'bg-[#16161A] text-[#FF5722] border-[#3F3F46]'
                : 'border-transparent text-[#A1A1AA] hover:bg-[#16161A] hover:text-[#F4F4F5]'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
            {expanded && (
              <span className="text-[#F4F4F5] font-medium whitespace-nowrap">Primitives</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleNavClick('cameras')}
            aria-label={`Camera Bookmarks (${bookmarks.length})`}
            className={`w-full flex items-center h-8 px-2 rounded border transition-colors text-xs gap-3 ${
              activeTab === 'cameras'
                ? 'bg-[#16161A] text-[#FF5722] border-[#3F3F46]'
                : 'border-transparent text-[#A1A1AA] hover:bg-[#16161A] hover:text-[#F4F4F5]'
            }`}
          >
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
            {expanded && (
              <span className="text-[#F4F4F5] font-medium whitespace-nowrap">
                Cameras ({bookmarks.length})
              </span>
            )}
          </button>
        </div>

        <div className="my-1 border-t border-[#222226] mx-2 shrink-0" />

        {/* Dynamic Rail Content */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {!expanded ? (
            /* Collapsed Checkpoints Dots (Quick Jump) */
            checkpoints.slice(0, 6).map((cp) => {
              const isActive = cp.id === activeCheckpointId;
              return (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => onSelectCheckpoint(cp)}
                  title={cp.label}
                  aria-label={`Load checkpoint ${cp.label}`}
                  className="w-full h-7 flex items-center justify-center rounded hover:bg-[#16161A] transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? 'bg-[#FF5722]' : 'bg-[#52525B]'
                    }`}
                  />
                </button>
              );
            })
          ) : activeTab === 'nodes' ? (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
                Active Hierarchy
              </div>
              <div className="px-2 py-1.5 rounded bg-[#16161A] border border-[#222226] text-[11px] font-mono text-[#F4F4F5]">
                Root_Emitter ({activeShape})
              </div>
              <div className="pl-4 space-y-1 text-[11px] font-mono text-[#A1A1AA]">
                <div className="px-2 py-1 rounded hover:bg-[#16161A] flex items-center justify-between">
                  <span>Force_CurlNoise</span>
                  <span className="text-[#FF5722]">ON</span>
                </div>
                <div className="px-2 py-1 rounded hover:bg-[#16161A] flex items-center justify-between">
                  <span>Cursor_Attractor</span>
                  <span className="text-[#FF5722]">ON</span>
                </div>
                <div className="px-2 py-1 rounded hover:bg-[#16161A] flex items-center justify-between">
                  <span>Floor_GridPlane</span>
                  <span className="text-[#71717A]">MESH</span>
                </div>
              </div>
              <div className="pt-2 px-2 py-1 text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
                Recent Runs
              </div>
              {checkpoints.map((cp) => {
                const isActive = cp.id === activeCheckpointId;
                return (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => onSelectCheckpoint(cp)}
                    className={`w-full text-left flex items-center h-7 px-2 rounded text-[11px] font-mono gap-2 transition-colors ${
                      isActive
                        ? 'bg-[#16161A] text-[#F4F4F5] border border-[#3F3F46]'
                        : 'text-[#A1A1AA] hover:bg-[#16161A] hover:text-[#F4F4F5]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isActive ? 'bg-[#FF5722]' : 'bg-[#52525B]'
                      }`}
                    />
                    <span className="truncate">{cp.label}</span>
                  </button>
                );
              })}
            </div>
          ) : activeTab === 'keyframes' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-[10px] font-mono text-[#71717A] uppercase">
                  Morph Timeline
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onToggleSequence}
                    aria-label={isSequencing ? 'Stop morph loop' : 'Play morph sequence'}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 ${
                      isSequencing
                        ? 'bg-[#FF5722] text-[#09090B] border-[#FF5722] font-semibold'
                        : 'bg-[#16161A] text-[#F4F4F5] border-[#222226] hover:border-[#3F3F46]'
                    }`}
                  >
                    {isSequencing ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                    <span>{isSequencing ? 'Stop' : 'Play'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onSaveCheckpoint}
                    aria-label="Add keyframe"
                    className="p-1 rounded bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] text-[#F4F4F5]"
                    title="Save current state as keyframe"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {checkpoints.map((cp) => {
                const isActive = cp.id === activeCheckpointId;
                return (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => onSelectCheckpoint(cp)}
                    className={`w-full text-left p-2 rounded border transition-colors ${
                      isActive
                        ? 'bg-[#16161A] border-[#FF5722]/70 text-[#F4F4F5]'
                        : 'bg-transparent border-[#222226] text-[#A1A1AA] hover:bg-[#16161A] hover:text-[#F4F4F5]'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="truncate font-medium">{cp.label}</span>
                      <span className="text-[9px] text-[#71717A]">{cp.timestamp}</span>
                    </div>
                    <div className="text-[10px] text-[#71717A] truncate mt-0.5">{cp.summary}</div>
                  </button>
                );
              })}
            </div>
          ) : activeTab === 'presets' ? (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
                Primitives
              </div>
              {PRESET_LIST.map((item) => (
                <button
                  key={item.shape}
                  type="button"
                  onClick={() => onApplyPresetShape(item.shape)}
                  className={`w-full text-left p-2 rounded border transition-colors ${
                    activeShape === item.shape
                      ? 'bg-[#16161A] border-[#3F3F46] text-[#F4F4F5]'
                      : 'border-transparent hover:bg-[#16161A] text-[#A1A1AA] hover:text-[#F4F4F5]'
                  }`}
                >
                  <div className="text-[11px] font-medium">{item.label}</div>
                  <div className="text-[10px] text-[#71717A]">{item.desc}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-[10px] font-mono text-[#71717A] uppercase">
                  Camera Bookmarks
                </span>
                <button
                  type="button"
                  onClick={onSaveBookmark}
                  aria-label="Save camera bookmark"
                  className="p-1 rounded bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] text-[#F4F4F5]"
                  title="Bookmark current camera angle"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              {bookmarks.map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => onRestoreBookmark(bm)}
                  className="w-full text-left px-2 py-1.5 rounded bg-[#16161A]/60 hover:bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] flex items-center justify-between text-[11px] font-mono text-[#F4F4F5]"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Bookmark className="w-3 h-3 text-[#FF5722] shrink-0" />
                    <span className="truncate">{bm.name}</span>
                  </span>
                  <span className="text-[9px] text-[#71717A] uppercase">
                    {bm.projection === 'orthographic' ? 'ORTHO' : 'PERSP'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Rail Footer */}
      <div className="p-2 border-t border-[#222226] shrink-0">
        <button
          type="button"
          onClick={onSaveCheckpoint}
          aria-label="Save checkpoint"
          className="w-full flex items-center h-8 px-2 rounded hover:bg-[#16161A] text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors text-xs gap-3"
          title="Capture Keyframe Checkpoint"
        >
          <Plus className="w-4 h-4 shrink-0 text-[#FF5722]" aria-hidden="true" />
          {expanded && <span className="font-medium whitespace-nowrap">Capture Keyframe</span>}
        </button>
      </div>
    </aside>
  );
}
