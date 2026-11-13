import { useRef, useState } from 'react';
import {
  Box,
  Image as ImageIcon,
  Mic,
  Paperclip,
  QrCode,
  Terminal,
} from 'lucide-react';
import type { DockMode, FormationShape } from '../types/studio';

interface CommandDockProps {
  dockMode: DockMode;
  onDockModeChange: (mode: DockMode) => void;
  promptText: string;
  onPromptTextChange: (val: string) => void;
  qrPayload: string;
  onQrPayloadChange: (val: string) => void;
  densityLabel: 'Low' | 'Med' | 'High' | 'Ultra';
  onCycleDensity: () => void;
  isSynthesizing: boolean;
  onExecute: () => void;
  onSelectPreset: (shape: FormationShape) => void;
  onSelectDepthPreset: (preset: 'crater' | 'interference' | 'topography') => void;
  onUploadFile: (file: File) => void;
  audioReactive: boolean;
  onToggleAudioReactive: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const DOCK_TABS: Array<{ id: DockMode; label: string; Icon: typeof Terminal }> = [
  { id: 'prompt', label: 'Prompt', Icon: Terminal },
  { id: 'image', label: 'Image / Depth', Icon: ImageIcon },
  { id: 'qr', label: 'QR Matrix', Icon: QrCode },
  { id: 'preset', label: 'Preset Geometry', Icon: Box },
];

export function CommandDock({
  dockMode,
  onDockModeChange,
  promptText,
  onPromptTextChange,
  qrPayload,
  onQrPayloadChange,
  densityLabel,
  onCycleDensity,
  isSynthesizing,
  onExecute,
  onSelectPreset,
  onSelectDepthPreset,
  onUploadFile,
  audioReactive,
  onToggleAudioReactive,
  inputRef,
}: CommandDockProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeValue = dockMode === 'qr' ? qrPayload : promptText;
  const handleInputChange = (val: string) => {
    if (dockMode === 'qr') {
      onQrPayloadChange(val);
    } else {
      onPromptTextChange(val);
    }
  };

  const placeholder =
    dockMode === 'qr'
      ? 'Enter URL or text payload for scannable 3D QR particle matrix...'
      : dockMode === 'image'
        ? 'Drop PNG, JPG, SVG, or .OBJ here, or select a depth relief preset below...'
        : dockMode === 'preset'
          ? 'Choose a procedural primitive below or describe variations...'
          : 'Describe a physical scenario or geometry (e.g. Torus knot vortex)...';

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onUploadFile(file);
    }
  };

  return (
    <div
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-full max-w-[740px] px-4 pointer-events-auto"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* Mode Switcher Tabs Row */}
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <div
          role="tablist"
          aria-label="Generation input modes"
          className="flex items-center gap-1 bg-[#0E0E11]/95 p-1 rounded-md border border-[#222226]"
        >
          {DOCK_TABS.map(({ id, label, Icon }) => {
            const active = dockMode === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onDockModeChange(id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#16161A] text-[#F4F4F5] border border-[#3F3F46]'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#16161A]/60 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-3 h-3 ${active ? 'text-[#FF5722]' : ''}`}
                  aria-hidden="true"
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-mono text-[#71717A] flex items-center gap-1.5 whitespace-nowrap">
          <kbd className="px-1.5 py-0.5 bg-[#0E0E11] border border-[#222226] rounded text-[10px] text-[#A1A1AA]">
            ⌘K
          </kbd>
          <span>Command</span>
        </div>
      </div>

      {/* Main Sharp-Edged Command Input Bar (clean flex, zero overlap) */}
      <div
        className={`bg-[#121215]/95 border rounded-lg p-2 shadow-[0_8px_24px_rgba(0,0,0,0.65)] flex items-center gap-2 transition-colors ${
          isDraggingOver ? 'border-[#FF5722]' : 'border-[#27272A]'
        }`}
      >
        <div className="w-7 h-7 shrink-0 flex items-center justify-center rounded bg-[#16161A] border border-[#222226] text-[#A1A1AA]">
          {dockMode === 'qr' ? (
            <QrCode className="w-3.5 h-3.5 text-[#FF5722]" aria-hidden="true" />
          ) : dockMode === 'image' ? (
            <ImageIcon className="w-3.5 h-3.5 text-[#FF5722]" aria-hidden="true" />
          ) : dockMode === 'preset' ? (
            <Box className="w-3.5 h-3.5 text-[#FF5722]" aria-hidden="true" />
          ) : (
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          aria-label="Command dock input"
          value={activeValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onExecute();
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-[13px] text-[#F4F4F5] placeholder:text-[#52525B] focus:outline-none px-1 py-1 tracking-tight font-mono"
        />

        {/* Inline Attachment & Density Controls (non-overlapping flex siblings) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] text-[10px] font-mono text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors whitespace-nowrap"
            title="Upload .PNG, .JPG, .SVG, or .OBJ"
          >
            <Paperclip className="w-3 h-3" aria-hidden="true" />
            <span>.OBJ</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Upload image, SVG, or OBJ geometry file"
            className="hidden"
            accept=".png,.jpg,.jpeg,.svg,.obj"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={onCycleDensity}
            className="px-2 py-1 rounded bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] text-[10px] font-mono text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors whitespace-nowrap"
            title="Cycle particle density preset"
          >
            Density: <span className="text-[#FF5722] font-medium">{densityLabel}</span>
          </button>

          <button
            type="button"
            onClick={onExecute}
            disabled={isSynthesizing}
            className="flex items-center gap-1.5 h-8 px-3.5 bg-[#FAFAFA] hover:bg-white active:bg-zinc-200 disabled:opacity-60 text-[#09090B] font-semibold text-xs rounded transition-colors whitespace-nowrap"
          >
            <span>{isSynthesizing ? 'Synthesizing...' : 'Generate'}</span>
            {!isSynthesizing && (
              <span className="font-mono text-[10px] text-[#52525B] bg-zinc-200 px-1 rounded font-bold">
                ↵
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Contextual Sub-Bar: Preset Geometry */}
      {dockMode === 'preset' && (
        <div className="mt-2 p-1.5 bg-[#0E0E11]/95 border border-[#222226] rounded flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[#71717A] text-[10px] px-1">PRIMITIVES:</span>
            <button
              type="button"
              onClick={() => onSelectPreset('torus')}
              className="px-2 py-1 bg-[#16161A] hover:bg-[#222226] border border-[#222226] rounded text-[11px] text-[#F4F4F5] whitespace-nowrap"
            >
              Torus Knot
            </button>
            <button
              type="button"
              onClick={() => onSelectPreset('helix')}
              className="px-2 py-1 bg-[#16161A] hover:bg-[#222226] border border-[#222226] rounded text-[11px] text-[#F4F4F5] whitespace-nowrap"
            >
              Double Helix
            </button>
            <button
              type="button"
              onClick={() => onSelectPreset('terrain')}
              className="px-2 py-1 bg-[#16161A] hover:bg-[#222226] border border-[#222226] rounded text-[11px] text-[#F4F4F5] whitespace-nowrap"
            >
              Dynamic Terrain
            </button>
            <button
              type="button"
              onClick={() => onSelectPreset('cube')}
              className="px-2 py-1 bg-[#16161A] hover:bg-[#222226] border border-[#222226] rounded text-[11px] text-[#F4F4F5] whitespace-nowrap"
            >
              Voxel Cube
            </button>
            <button
              type="button"
              onClick={() => onSelectPreset('audiocore')}
              className="px-2 py-1 bg-[#16161A] hover:bg-[#222226] border border-[#222226] rounded text-[11px] text-[#F4F4F5] whitespace-nowrap"
            >
              Audio Core
            </button>
          </div>
          <button
            type="button"
            onClick={onToggleAudioReactive}
            aria-pressed={audioReactive}
            className={`flex items-center gap-1 px-2 py-1 border rounded text-[11px] whitespace-nowrap transition-colors ${
              audioReactive
                ? 'bg-[#16161A] border-[#FF5722] text-[#FF5722]'
                : 'border-[#222226] text-[#A1A1AA] hover:text-[#F4F4F5]'
            }`}
          >
            <Mic className="w-3 h-3" aria-hidden="true" />
            <span>{audioReactive ? 'Audio Active' : 'Audio Reactive'}</span>
          </button>
        </div>
      )}

      {/* Contextual Sub-Bar: Image / Depth Relief Presets */}
      {dockMode === 'image' && (
        <div className="mt-2 p-1.5 bg-[#0E0E11]/95 border border-[#222226] rounded flex items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[#71717A] text-[10px] px-1">DEPTH SAMPLES:</span>
            <button
              type="button"
              onClick={() => onSelectDepthPreset('crater')}
              className="px-2 py-1 bg-[#16161A] hover:bg-[#222226] border border-[#222226] rounded text-[11px] text-[#F4F4F5] whitespace-nowrap"
            >
              Crater Relief
            </button>
            <button
              type="button"
              onClick={() => onSelectDepthPreset('interference')}
              className="px-2 py-1 bg-[#16161A] hover:bg-[#222226] border border-[#222226] rounded text-[11px] text-[#F4F4F5] whitespace-nowrap"
            >
              Wave Interference
            </button>
            <button
              type="button"
              onClick={() => onSelectDepthPreset('topography')}
              className="px-2 py-1 bg-[#16161A] hover:bg-[#222226] border border-[#222226] rounded text-[11px] text-[#F4F4F5] whitespace-nowrap"
            >
              Topo Contours
            </button>
          </div>
          <span className="text-[10px] text-[#71717A] whitespace-nowrap px-1">
            Drop .PNG / .SVG / .OBJ
          </span>
        </div>
      )}
    </div>
  );
}
