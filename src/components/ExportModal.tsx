import { useMemo, useState } from 'react';
import { Check, Code2, Copy, Download, X } from 'lucide-react';
import {
  buildGLTF,
  buildOBJ,
  buildPLY,
  buildWebGLEmbedSnippet,
} from '../engine/exporters';
import type { FormationShape, StudioParams } from '../types/studio';

export type ExportFormat = 'ply' | 'obj' | 'gltf' | 'embed';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: StudioParams;
  activeShape: FormationShape;
  sceneTitle: string;
  getSnapshotData: () => { positions: Float32Array; colors: Float32Array; count: number };
  onNotify: (msg: string) => void;
}

export function ExportModal({
  isOpen,
  onClose,
  params,
  activeShape,
  sceneTitle,
  getSnapshotData,
  onNotify,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('ply');
  const [copied, setCopied] = useState(false);

  const previewText = useMemo(() => {
    if (!isOpen) return '';
    if (format === 'embed') {
      return buildWebGLEmbedSnippet(params, activeShape);
    }
    const snap = getSnapshotData();
    if (format === 'ply') {
      return buildPLY(snap.positions, snap.colors, Math.min(snap.count, 16), 16) + '\n...';
    }
    if (format === 'obj') {
      return buildOBJ(snap.positions, snap.colors, Math.min(snap.count, 16), 16) + '\n...';
    }
    return buildGLTF(snap.positions, snap.colors, Math.min(snap.count, 8), 8).slice(0, 620) + '\n...';
  }, [isOpen, format, params, activeShape, getSnapshotData]);

  if (!isOpen) return null;

  const baseName = sceneTitle.replace(/\.[^.]+$/, '') || 'particle_scene';

  const handleDownload = () => {
    const snap = getSnapshotData();
    let content = '';
    let ext = 'txt';
    let mime = 'text/plain;charset=utf-8';

    if (format === 'ply') {
      content = buildPLY(snap.positions, snap.colors, snap.count);
      ext = 'ply';
    } else if (format === 'obj') {
      content = buildOBJ(snap.positions, snap.colors, snap.count);
      ext = 'obj';
    } else if (format === 'gltf') {
      content = buildGLTF(snap.positions, snap.colors, snap.count);
      ext = 'gltf';
      mime = 'model/gltf+json;charset=utf-8';
    } else {
      content = buildWebGLEmbedSnippet(params, activeShape);
      ext = 'html';
      mime = 'text/html;charset=utf-8';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onNotify(`Exported ${baseName}.${ext} (${snap.count.toLocaleString()} vertices)`);
    onClose();
  };

  const handleCopyEmbed = async () => {
    const snippet = buildWebGLEmbedSnippet(params, activeShape);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      onNotify('Copied standalone Three.js embed snippet to clipboard');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify('Clipboard unavailable; use Download Package');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exportModalTitle"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
    >
      <div className="w-[520px] max-w-[92vw] bg-[#0E0E11] border border-[#3F3F46] rounded-lg shadow-2xl overflow-hidden">
        <div className="h-11 px-4 border-b border-[#222226] flex items-center justify-between">
          <h3
            id="exportModalTitle"
            className="text-xs font-semibold text-[#F4F4F5] uppercase tracking-wider"
          >
            Export Geometry &amp; WebGL Embed
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-1 text-[#71717A] hover:text-[#F4F4F5] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <div>
            <span className="block text-[#A1A1AA] text-[11px] font-medium mb-1.5">
              Format Target
            </span>
            <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
              {(
                [
                  { id: 'ply', label: '.PLY Cloud' },
                  { id: 'obj', label: '.OBJ Vertices' },
                  { id: 'gltf', label: '.GLTF 2.0' },
                  { id: 'embed', label: 'WebGL Embed' },
                ] as const
              ).map((item) => {
                const active = format === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFormat(item.id)}
                    aria-pressed={active}
                    className={`py-2 px-2 rounded border text-center transition-colors ${
                      active
                        ? 'bg-[#16161A] border-[#FF5722] text-[#F4F4F5] font-semibold'
                        : 'bg-[#16161A]/60 border-[#222226] text-[#A1A1AA] hover:text-[#F4F4F5]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[#A1A1AA] text-[11px] font-medium flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-[#FF5722]" aria-hidden="true" />
                <span>{format === 'embed' ? 'Standalone Three.js Embed' : 'Header & Vertex Preview'}</span>
              </span>
              {format === 'embed' && (
                <button
                  type="button"
                  onClick={handleCopyEmbed}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#16161A] border border-[#222226] hover:border-[#3F3F46] text-[10px] font-mono text-[#F4F4F5]"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy Snippet'}</span>
                </button>
              )}
            </div>
            <pre className="w-full h-44 p-2.5 bg-[#09090B] border border-[#222226] rounded font-mono text-[10px] text-[#A1A1AA] overflow-auto leading-relaxed select-text">
              {previewText}
            </pre>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-[#222226]">
            <span className="font-mono text-[10px] text-[#71717A] tabular-nums">
              EMBEDDED RGB VERTEX DATA · {activeShape.toUpperCase()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-[#16161A] hover:bg-[#222226] text-[#A1A1AA] hover:text-[#F4F4F5] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#FAFAFA] hover:bg-white text-[#09090B] font-semibold text-xs"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download {format === 'embed' ? 'HTML' : format.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
