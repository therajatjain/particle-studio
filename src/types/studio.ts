export type ShadingMode = 'points' | 'links' | 'voxel' | 'depth';

export type DistributionMode = 'surface' | 'volume' | 'voxel' | 'qr';

export type InteractionMode = 'repel' | 'attract' | 'vortex' | 'shatter';

export type ColorMode = 'mono' | 'velocity' | 'depth' | 'image';

export type BlendMode = 'additive' | 'normal' | 'multiply';

export type QRErrorLevel = 'L' | 'M' | 'Q' | 'H';

export type DockMode = 'prompt' | 'image' | 'qr' | 'preset';

export type CameraPreset = 'iso' | 'front' | 'top' | 'qr-ortho';

export type CameraProjection = 'perspective' | 'orthographic';

export type FormationShape =
  | 'sphere'
  | 'torus'
  | 'helix'
  | 'terrain'
  | 'cube'
  | 'vortex'
  | 'audiocore'
  | 'qr'
  | 'depthmap'
  | 'custom_obj';

export interface ColorStop {
  id: string;
  position: number; // 0 to 1
  color: string; // Hex #RRGGBB
}

export interface Vector3Params {
  x: number;
  y: number;
  z: number;
}

export interface StudioParams {
  particleCount: number; // Display & telemetry target (10k - 1M)
  distribution: DistributionMode;
  pointSize: number;
  perspectiveScaling: boolean;
  curlFreq: number;
  curlAmp: number;
  gravity: Vector3Params;
  interactionMode: InteractionMode;
  interactionRadius: number;
  springStiffness: number;
  colorMode: ColorMode;
  colorStops: ColorStop[];
  blendMode: BlendMode;
  decay: number;
  bloom: number;
  zDisplacement: number;
  qrErrorLevel: QRErrorLevel;
  qrPayload: string;
  shadingMode: ShadingMode;
  showGrid: boolean;
  audioReactive: boolean;
}

export interface SceneCheckpoint {
  id: string;
  label: string;
  shape: FormationShape;
  timestamp: string;
  summary: string;
  params: StudioParams;
}

export interface CameraBookmark {
  id: string;
  name: string;
  theta: number;
  phi: number;
  radius: number;
  projection: CameraProjection;
}

export interface TelemetryStats {
  fps: number;
  activePoints: number;
  targetPoints: number;
  bufferMB: number;
  backendLabel: string;
  isSoftwareGl: boolean;
}

export interface SynthesisResponse {
  shape: FormationShape;
  sceneTitle: string;
  summary: string;
  curlFreq: number;
  curlAmp: number;
  gravity: Vector3Params;
  interactionMode: InteractionMode;
  colorMode: ColorMode;
  blendMode: BlendMode;
  pointSize: number;
  colorStops: ColorStop[];
  source: 'gemini' | 'deterministic';
}
