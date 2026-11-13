import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  buildFormationPositions,
  computeBufferSizeMB,
  computeRenderBudget,
  sampleGradientStops,
} from '../engine/formations';
import type {
  CameraBookmark,
  CameraPreset,
  CameraProjection,
  FormationShape,
  StudioParams,
  TelemetryStats,
} from '../types/studio';

export interface ParticleViewportHandle {
  applyFormation: (
    shape: FormationShape,
    customOverride?: { positions: Float32Array; colors?: Float32Array },
  ) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setProjection: (projection: CameraProjection) => void;
  restoreCamera: (bookmark: Pick<CameraBookmark, 'theta' | 'phi' | 'radius' | 'projection'>) => void;
  getCameraState: () => { theta: number; phi: number; radius: number; projection: CameraProjection };
  getSnapshotData: () => { positions: Float32Array; colors: Float32Array; count: number };
  resetParticlePositions: () => void;
}

interface ParticleViewportProps {
  params: StudioParams;
  initialShape: FormationShape;
  onTelemetry: (stats: TelemetryStats) => void;
  onCameraOrientation?: (basis: { theta: number; phi: number }) => void;
}

const _rayVec = new THREE.Vector2();
const _intersectPt = new THREE.Vector3();
const _planeNormal = new THREE.Vector3(0, 0, 1);
const _interactionPlane = new THREE.Plane(_planeNormal, 0);

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

const PARTICLE_VERT = `
  attribute float aSeed;
  varying vec3 vColor;
  varying float vDepth;
  varying float vSeed;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uPerspectiveScaling;
  uniform float uTime;
  uniform float uAudioEnergy;

  void main() {
    vColor = color;
    vSeed = aSeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPosition.z;
    float pulse = 1.0 + uAudioEnergy * 0.65 * sin(uTime * 6.0 + aSeed * 12.0);
    float scale = uPerspectiveScaling > 0.5 ? (340.0 / max(40.0, -mvPosition.z)) : 1.35;
    gl_PointSize = clamp(uPointSize * uPixelRatio * scale * pulse, 1.4, 28.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAG = `
  varying vec3 vColor;
  varying float vDepth;
  varying float vSeed;
  uniform float uShadingMode; // 0=points, 1=links, 2=voxel, 3=depth
  uniform float uBloom;
  uniform float uOpacity;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);

    if (uShadingMode > 1.5 && uShadingMode < 2.5) {
      // Voxel square primitive with crisp inner edge
      float boxDist = max(abs(uv.x), abs(uv.y));
      if (boxDist > 0.46) discard;
      float edge = smoothstep(0.32, 0.46, boxDist);
      vec3 voxelCol = mix(vColor, vec3(1.0), edge * 0.25);
      gl_FragColor = vec4(voxelCol * (1.0 + uBloom * 0.45), uOpacity);
      return;
    }

    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.08, d);
    float halo = exp(-d * d * 10.0) * uBloom;

    if (uShadingMode > 2.5) {
      // Depth Buffer mode
      float depthNorm = clamp(1.0 - (vDepth - 180.0) / 520.0, 0.12, 1.0);
      vec3 depthCol = mix(vec3(0.16, 0.28, 0.52), vec3(0.96, 0.97, 1.0), depthNorm);
      gl_FragColor = vec4(depthCol, core * uOpacity);
      return;
    }

    vec3 finalCol = vColor * (1.0 + halo);
    gl_FragColor = vec4(finalCol, clamp(core + halo * 0.35, 0.0, 1.0) * uOpacity);
  }
`;

export const ParticleViewport = forwardRef<ParticleViewportHandle, ParticleViewportProps>(
  function ParticleViewport({ params, initialShape, onTelemetry, onCameraOrientation }, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const paramsRef = useRef<StudioParams>(params);
    const onTelemetryRef = useRef(onTelemetry);
    const onOrientationRef = useRef(onCameraOrientation);

    const [webglUnavailable, setWebglUnavailable] = useState(false);

    useEffect(() => {
      paramsRef.current = params;
    }, [params]);

    useEffect(() => {
      onTelemetryRef.current = onTelemetry;
    }, [onTelemetry]);

    useEffect(() => {
      onOrientationRef.current = onCameraOrientation;
    }, [onCameraOrientation]);

    // Mutable engine state stored in ref so React updates never re-mount WebGL
    const engineRef = useRef<{
      shape: FormationShape;
      activeCount: number;
      isSoftwareGl: boolean;
      positions: Float32Array;
      targets: Float32Array;
      velocities: Float32Array;
      colors: Float32Array;
      sourceColors: Float32Array | null;
      seeds: Float32Array;
      geometry: THREE.BufferGeometry | null;
      material: THREE.ShaderMaterial | null;
      points: THREE.Points | null;
      linkLines: THREE.LineSegments | null;
      linkGeometry: THREE.BufferGeometry | null;
      gridHelper: THREE.GridHelper | null;
      cameraAngle: { theta: number; phi: number; radius: number };
      targetCameraAngle: { theta: number; phi: number; radius: number } | null;
      projection: CameraProjection;
      perspCam: THREE.PerspectiveCamera | null;
      orthoCam: THREE.OrthographicCamera | null;
      activeCam: THREE.Camera | null;
      renderer: THREE.WebGLRenderer | null;
      scene: THREE.Scene | null;
      audioAnalyser: AnalyserNode | null;
      audioData: Uint8Array<ArrayBuffer> | null;
      audioCtx: AudioContext | null;
      rebuildCloud: (
        shape: FormationShape,
        customOverride?: { positions: Float32Array; colors?: Float32Array },
        forceBudgetRealloc?: boolean,
      ) => void;
      updateColorPalette: () => void;
    } | null>(null);

    useImperativeHandle(ref, () => ({
      applyFormation(shape, customOverride) {
        engineRef.current?.rebuildCloud(shape, customOverride, false);
      },
      setCameraPreset(preset) {
        const eng = engineRef.current;
        if (!eng) return;
        if (preset === 'front') {
          eng.targetCameraAngle = { theta: 0, phi: Math.PI / 2, radius: 440 };
        } else if (preset === 'top') {
          eng.targetCameraAngle = { theta: 0, phi: 0.06, radius: 460 };
        } else if (preset === 'qr-ortho') {
          eng.projection = 'orthographic';
          eng.activeCam = eng.orthoCam;
          eng.targetCameraAngle = { theta: 0, phi: Math.PI / 2, radius: 460 };
          eng.positions.set(eng.targets);
          eng.velocities.fill(0);
          if (eng.geometry) eng.geometry.attributes.position.needsUpdate = true;
          if (eng.points) eng.points.rotation.y = 0;
          if (eng.material) eng.material.uniforms.uShadingMode.value = 2;
        } else {
          eng.targetCameraAngle = { theta: 0.65, phi: 1.12, radius: 440 };
        }
      },
      setProjection(projection) {
        const eng = engineRef.current;
        if (!eng) return;
        eng.projection = projection;
        eng.activeCam = projection === 'orthographic' ? eng.orthoCam : eng.perspCam;
      },
      restoreCamera(bookmark) {
        const eng = engineRef.current;
        if (!eng) return;
        eng.projection = bookmark.projection;
        eng.activeCam =
          bookmark.projection === 'orthographic' ? eng.orthoCam : eng.perspCam;
        eng.targetCameraAngle = {
          theta: bookmark.theta,
          phi: bookmark.phi,
          radius: bookmark.radius,
        };
      },
      getCameraState() {
        const eng = engineRef.current;
        if (!eng) {
          return { theta: 0.65, phi: 1.12, radius: 440, projection: 'perspective' };
        }
        return {
          ...eng.cameraAngle,
          projection: eng.projection,
        };
      },
      getSnapshotData() {
        const eng = engineRef.current;
        if (!eng) {
          return { positions: new Float32Array(0), colors: new Float32Array(0), count: 0 };
        }
        return {
          positions: new Float32Array(eng.positions),
          colors: new Float32Array(eng.colors),
          count: eng.activeCount,
        };
      },
      resetParticlePositions() {
        const eng = engineRef.current;
        if (!eng) return;
        eng.positions.set(eng.targets);
        eng.velocities.fill(0);
        if (eng.geometry) {
          eng.geometry.attributes.position.needsUpdate = true;
        }
      },
    }));

    // Sync particle count budget when user scrubs Particle Count slider
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      const desiredBudget = computeRenderBudget(params.particleCount, eng.isSoftwareGl);
      if (desiredBudget !== eng.activeCount) {
        eng.rebuildCloud(eng.shape, undefined, true);
      }
    }, [params.particleCount]);

    // Sync distribution or QR settings when changed directly in inspector
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      if (eng.shape === 'qr') {
        eng.rebuildCloud('qr', undefined, false);
      }
    }, [params.qrErrorLevel, params.zDisplacement, params.qrPayload]);

    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      if (eng.shape === 'sphere') {
        eng.rebuildCloud('sphere', undefined, false);
      }
    }, [params.distribution]);

    // Sync shading mode, blend mode, color mode, grid, and audio reactive
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng || !eng.material) return;

      const modeMap = { points: 0, links: 1, voxel: 2, depth: 3 };
      eng.material.uniforms.uShadingMode.value = modeMap[params.shadingMode];
      eng.material.uniforms.uPointSize.value = params.pointSize;
      eng.material.uniforms.uPerspectiveScaling.value = params.perspectiveScaling ? 1.0 : 0.0;
      eng.material.uniforms.uBloom.value = params.bloom;

      if (params.blendMode === 'additive') {
        eng.material.blending = THREE.AdditiveBlending;
      } else if (params.blendMode === 'multiply') {
        eng.material.blending = THREE.MultiplyBlending;
      } else {
        eng.material.blending = THREE.NormalBlending;
      }
      eng.material.needsUpdate = true;

      if (eng.linkLines) {
        eng.linkLines.visible = params.shadingMode === 'links';
      }
      if (eng.gridHelper) {
        eng.gridHelper.visible = params.showGrid;
      }
      eng.updateColorPalette();
    }, [
      params.shadingMode,
      params.pointSize,
      params.perspectiveScaling,
      params.bloom,
      params.blendMode,
      params.showGrid,
      params.colorMode,
      params.colorStops,
    ]);

    // Audio reactive microphone listener (optional, falls back gracefully to procedural harmonic energy)
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (!params.audioReactive) {
        if (eng.audioCtx) {
          eng.audioCtx.close().catch(() => {});
          eng.audioCtx = null;
          eng.audioAnalyser = null;
          eng.audioData = null;
        }
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            if (!engineRef.current || !paramsRef.current.audioReactive) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            eng.audioCtx = ctx;
            eng.audioAnalyser = analyser;
            eng.audioData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
          })
          .catch(() => {
            // Mic unavailable/denied — loop automatically uses procedural harmonic pulse
          });
      }
    }, [params.audioReactive]);

    // Initialize WebGL2 / Three.js scene ONCE
    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      const isSoftwareGl = detectSoftwareWebGL();
      const width = mount.clientWidth || window.innerWidth;
      const height = mount.clientHeight || window.innerHeight;
      const aspect = width / Math.max(1, height);

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          alpha: false,
          powerPreference: 'high-performance',
        });
      } catch {
        setWebglUnavailable(true);
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      const pixelRatio = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.className = 'cursor-grab active:cursor-grabbing';

      mount.innerHTML = '';
      mount.appendChild(renderer.domElement);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
      };
      const handleContextRestored = () => {
        renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#09090B');
      scene.fog = new THREE.FogExp2('#09090B', 0.00075);

      const perspCam = new THREE.PerspectiveCamera(48, aspect, 1, 2500);
      const frustumSize = 440;
      const orthoCam = new THREE.OrthographicCamera(
        (-frustumSize * aspect) / 2,
        (frustumSize * aspect) / 2,
        frustumSize / 2,
        -frustumSize / 2,
        1,
        2500,
      );

      // Floor perspective grid
      const gridHelper = new THREE.GridHelper(640, 32, 0x27272a, 0x18181b);
      gridHelper.position.y = -155;
      gridHelper.visible = paramsRef.current.showGrid;
      scene.add(gridHelper);

      const initialBudget = computeRenderBudget(paramsRef.current.particleCount, isSoftwareGl);

      const eng = {
        shape: initialShape,
        activeCount: initialBudget,
        isSoftwareGl,
        positions: new Float32Array(initialBudget * 3),
        targets: new Float32Array(initialBudget * 3),
        velocities: new Float32Array(initialBudget * 3),
        colors: new Float32Array(initialBudget * 3),
        sourceColors: null as Float32Array | null,
        seeds: new Float32Array(initialBudget),
        geometry: null as THREE.BufferGeometry | null,
        material: null as THREE.ShaderMaterial | null,
        points: null as THREE.Points | null,
        linkLines: null as THREE.LineSegments | null,
        linkGeometry: null as THREE.BufferGeometry | null,
        gridHelper,
        cameraAngle: { theta: 0.65, phi: 1.12, radius: 440 },
        targetCameraAngle: null as { theta: number; phi: number; radius: number } | null,
        projection: 'perspective' as CameraProjection,
        perspCam,
        orthoCam,
        activeCam: perspCam as THREE.Camera,
        renderer,
        scene,
        audioAnalyser: null as AnalyserNode | null,
        audioData: null as Uint8Array<ArrayBuffer> | null,
        audioCtx: null as AudioContext | null,
        rebuildCloud: (() => {}) as (
          shape: FormationShape,
          customOverride?: { positions: Float32Array; colors?: Float32Array },
          forceBudgetRealloc?: boolean,
        ) => void,
        updateColorPalette: () => {},
      };

      const updateColorPalette = () => {
        const p = paramsRef.current;
        const count = eng.activeCount;
        const pos = eng.positions;
        const col = eng.colors;
        const stops = p.colorStops;

        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          if (p.colorMode === 'image' && eng.sourceColors) {
            col[idx] = eng.sourceColors[idx];
            col[idx + 1] = eng.sourceColors[idx + 1];
            col[idx + 2] = eng.sourceColors[idx + 2];
          } else if (p.colorMode === 'depth') {
            const normZ = Math.max(0, Math.min(1, (pos[idx + 2] + 150) / 300));
            const [r, g, b] = sampleGradientStops(stops, 1 - normZ);
            col[idx] = r;
            col[idx + 1] = g;
            col[idx + 2] = b;
          } else if (p.colorMode === 'velocity') {
            const speed = Math.sqrt(
              eng.velocities[idx] ** 2 +
                eng.velocities[idx + 1] ** 2 +
                eng.velocities[idx + 2] ** 2,
            );
            const t = Math.min(1, speed * 0.35 + 0.15);
            const [r, g, b] = sampleGradientStops(stops, t);
            col[idx] = r;
            col[idx + 1] = g;
            col[idx + 2] = b;
          } else {
            // Monochrome + Accent radial mapping (center = warm accent stop, outer = white/neutral)
            const dist = Math.sqrt(pos[idx] ** 2 + pos[idx + 1] ** 2 + pos[idx + 2] ** 2);
            const t = 1 - Math.min(1, dist / 145);
            const [r, g, b] = sampleGradientStops(stops, t);
            col[idx] = r;
            col[idx + 1] = g;
            col[idx + 2] = b;
          }
        }
        if (eng.geometry?.attributes.color) {
          eng.geometry.attributes.color.needsUpdate = true;
        }
      };

      const rebuildLinks = (pts: Float32Array, count: number) => {
        if (eng.linkLines) {
          scene.remove(eng.linkLines);
          eng.linkGeometry?.dispose();
        }
        const linkSampleCount = Math.min(2400, Math.floor(count / 2));
        const linkPos = new Float32Array(linkSampleCount * 6);
        let writeIdx = 0;
        const stride = Math.max(1, Math.floor(count / linkSampleCount));

        for (let i = 0; i < count - stride && writeIdx < linkPos.length - 6; i += stride) {
          const a = i * 3;
          const b = (i + stride) * 3;
          const dx = pts[a] - pts[b];
          const dy = pts[a + 1] - pts[b + 1];
          const dz = pts[a + 2] - pts[b + 2];
          if (dx * dx + dy * dy + dz * dz < 65 * 65) {
            linkPos[writeIdx++] = pts[a];
            linkPos[writeIdx++] = pts[a + 1];
            linkPos[writeIdx++] = pts[a + 2];
            linkPos[writeIdx++] = pts[b];
            linkPos[writeIdx++] = pts[b + 1];
            linkPos[writeIdx++] = pts[b + 2];
          }
        }

        const linkGeo = new THREE.BufferGeometry();
        linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos.subarray(0, writeIdx), 3));
        const linkMat = new THREE.LineBasicMaterial({
          color: 0xff5722,
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const lines = new THREE.LineSegments(linkGeo, linkMat);
        lines.visible = paramsRef.current.shadingMode === 'links';
        eng.linkGeometry = linkGeo;
        eng.linkLines = lines;
        scene.add(lines);
      };

      const rebuildCloud = (
        shape: FormationShape,
        customOverride?: { positions: Float32Array; colors?: Float32Array },
        forceBudgetRealloc = false,
      ) => {
        eng.shape = shape;
        const p = paramsRef.current;
        const targetBudget = computeRenderBudget(p.particleCount, eng.isSoftwareGl);

        if (forceBudgetRealloc || !eng.geometry || targetBudget !== eng.activeCount) {
          eng.activeCount = targetBudget;
          eng.positions = new Float32Array(targetBudget * 3);
          eng.targets = new Float32Array(targetBudget * 3);
          eng.velocities = new Float32Array(targetBudget * 3);
          eng.colors = new Float32Array(targetBudget * 3);
          eng.seeds = new Float32Array(targetBudget);
          for (let i = 0; i < targetBudget; i++) {
            eng.seeds[i] = ((i * 2654435761) >>> 0) / 4294967296;
          }
        }

        let generated: { positions: Float32Array; sourceColors?: Float32Array };
        if (customOverride) {
          const resampledPos = new Float32Array(eng.activeCount * 3);
          const srcPts = customOverride.positions;
          const srcLen = Math.max(1, Math.floor(srcPts.length / 3));
          const resampledCol = customOverride.colors
            ? new Float32Array(eng.activeCount * 3)
            : undefined;
          for (let i = 0; i < eng.activeCount; i++) {
            const s = (i % srcLen) * 3;
            resampledPos[i * 3] = srcPts[s];
            resampledPos[i * 3 + 1] = srcPts[s + 1];
            resampledPos[i * 3 + 2] = srcPts[s + 2];
            if (resampledCol && customOverride.colors) {
              resampledCol[i * 3] = customOverride.colors[s] ?? 1;
              resampledCol[i * 3 + 1] = customOverride.colors[s + 1] ?? 1;
              resampledCol[i * 3 + 2] = customOverride.colors[s + 2] ?? 1;
            }
          }
          generated = { positions: resampledPos, sourceColors: resampledCol };
        } else {
          generated = buildFormationPositions(shape, eng.activeCount, {
            distribution: p.distribution,
            qrPayload: p.qrPayload,
            qrErrorLevel: p.qrErrorLevel,
            zDisplacement: p.zDisplacement,
          });
        }

        eng.targets.set(generated.positions);
        eng.sourceColors = generated.sourceColors ?? null;

        // First boot snaps immediately so first paint shows full formation
        if (!eng.geometry) {
          eng.positions.set(eng.targets);
        }

        if (!eng.geometry || forceBudgetRealloc) {
          if (eng.points) {
            scene.remove(eng.points);
            eng.geometry?.dispose();
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(eng.positions, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(eng.colors, 3));
          geo.setAttribute('aSeed', new THREE.BufferAttribute(eng.seeds, 1));
          eng.geometry = geo;

          if (!eng.material) {
            eng.material = new THREE.ShaderMaterial({
              uniforms: {
                uPointSize: { value: p.pointSize },
                uPixelRatio: { value: pixelRatio },
                uPerspectiveScaling: { value: p.perspectiveScaling ? 1.0 : 0.0 },
                uTime: { value: 0 },
                uAudioEnergy: { value: 0 },
                uShadingMode: { value: 0 },
                uBloom: { value: p.bloom },
                uOpacity: { value: 0.9 },
              },
              vertexShader: PARTICLE_VERT,
              fragmentShader: PARTICLE_FRAG,
              vertexColors: true,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            });
          }
          eng.points = new THREE.Points(geo, eng.material);
          eng.points.frustumCulled = false;
          scene.add(eng.points);
        }

        updateColorPalette();
        rebuildLinks(eng.targets, eng.activeCount);
      };

      eng.rebuildCloud = rebuildCloud;
      eng.updateColorPalette = updateColorPalette;
      engineRef.current = eng;

      rebuildCloud(initialShape, undefined, true);

      if (!isSoftwareGl) {
        renderer.compile(scene, perspCam);
      }

      const syncCamera = () => {
        const { theta, phi, radius } = eng.cameraAngle;
        const x = radius * Math.sin(phi) * Math.sin(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.cos(theta);

        perspCam.position.set(x, y, z);
        perspCam.lookAt(0, 0, 0);

        const qrOffsetY = eng.shape === 'qr' && eng.projection === 'orthographic' ? -24 : 0;
        orthoCam.position.set(x, y + qrOffsetY, z);
        orthoCam.lookAt(0, qrOffsetY, 0);
        const zoomFactor = 440 / Math.max(120, radius);
        orthoCam.zoom = zoomFactor;
        orthoCam.updateProjectionMatrix();

        onOrientationRef.current?.({ theta, phi });
      };
      syncCamera();

      // Mouse / Pointer interactions
      let isDragging = false;
      let prevPointer = { x: 0, y: 0 };
      const mouse3D = new THREE.Vector3(9999, 9999, 9999);
      let pointerActive = false;
      const raycaster = new THREE.Raycaster();

      const onPointerDown = (e: PointerEvent) => {
        isDragging = true;
        eng.targetCameraAngle = null; // Cancel scripted preset transition on user input
        prevPointer = { x: e.clientX, y: e.clientY };
      };

      const onPointerUp = () => {
        isDragging = false;
      };

      const onPointerMove = (e: PointerEvent) => {
        if (isDragging) {
          const dx = e.clientX - prevPointer.x;
          const dy = e.clientY - prevPointer.y;
          eng.cameraAngle.theta -= dx * 0.0065;
          eng.cameraAngle.phi = Math.max(
            0.05,
            Math.min(Math.PI - 0.05, eng.cameraAngle.phi - dy * 0.0065),
          );
          prevPointer = { x: e.clientX, y: e.clientY };
          syncCamera();
        }

        const rect = renderer.domElement.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          pointerActive = true;
          _rayVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          _rayVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(_rayVec, eng.activeCam);
          eng.activeCam.getWorldDirection(_planeNormal).negate();
          _interactionPlane.setFromNormalAndCoplanarPoint(_planeNormal, new THREE.Vector3(0, 0, 0));
          if (raycaster.ray.intersectPlane(_interactionPlane, _intersectPt)) {
            mouse3D.copy(_intersectPt);
          }
        } else {
          pointerActive = false;
        }
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        eng.targetCameraAngle = null;
        eng.cameraAngle.radius = Math.max(120, Math.min(1100, eng.cameraAngle.radius + e.deltaY * 0.35));
        syncCamera();
      };

      const onResize = () => {
        if (!mount) return;
        const w = mount.clientWidth || window.innerWidth;
        const h = mount.clientHeight || window.innerHeight;
        const asp = w / Math.max(1, h);
        perspCam.aspect = asp;
        perspCam.updateProjectionMatrix();

        orthoCam.left = (-frustumSize * asp) / 2;
        orthoCam.right = (frustumSize * asp) / 2;
        orthoCam.top = frustumSize / 2;
        orthoCam.bottom = -frustumSize / 2;
        orthoCam.updateProjectionMatrix();

        renderer.setSize(w, h);
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('resize', onResize);

      // Animation loop with software WebGL afterDraw pacing
      let frameId = 0;
      let disposed = false;
      let lastTime = performance.now();
      let fpsFrames = 0;
      let fpsAccum = 0;
      let lastTelemetryPush = 0;

      const afterDraw = (cb: () => void) => {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || typeof gl.fenceSync !== 'function') {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      };

      const tick = () => {
        if (disposed) return;

        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        const elapsed = now * 0.001;

        // Smooth camera preset damping
        if (eng.targetCameraAngle) {
          const factor = 1 - Math.exp(-8 * dt);
          eng.cameraAngle.theta = THREE.MathUtils.lerp(
            eng.cameraAngle.theta,
            eng.targetCameraAngle.theta,
            factor,
          );
          eng.cameraAngle.phi = THREE.MathUtils.lerp(
            eng.cameraAngle.phi,
            eng.targetCameraAngle.phi,
            factor,
          );
          eng.cameraAngle.radius = THREE.MathUtils.lerp(
            eng.cameraAngle.radius,
            eng.targetCameraAngle.radius,
            factor,
          );
          syncCamera();
          const done =
            Math.abs(eng.cameraAngle.theta - eng.targetCameraAngle.theta) < 0.002 &&
            Math.abs(eng.cameraAngle.phi - eng.targetCameraAngle.phi) < 0.002 &&
            Math.abs(eng.cameraAngle.radius - eng.targetCameraAngle.radius) < 0.5;
          if (done) {
            eng.targetCameraAngle = null;
          }
        }

        const p = paramsRef.current;

        // Audio reactive energy
        let audioEnergy = 0;
        if (p.audioReactive) {
          if (eng.audioAnalyser && eng.audioData) {
            eng.audioAnalyser.getByteFrequencyData(eng.audioData);
            let sum = 0;
            for (let i = 0; i < eng.audioData.length; i++) sum += eng.audioData[i];
            audioEnergy = sum / (eng.audioData.length * 255);
          } else {
            // Procedural harmonic beat fallback
            audioEnergy = 0.25 + 0.25 * Math.sin(elapsed * 4.2) + 0.15 * Math.cos(elapsed * 9.5);
          }
        }

        if (eng.material) {
          eng.material.uniforms.uTime.value = elapsed;
          eng.material.uniforms.uAudioEnergy.value = audioEnergy;
        }

        // Particle spring + curl noise + cursor force step
        const pos = eng.positions;
        const tgt = eng.targets;
        const vel = eng.velocities;
        const count = eng.activeCount;
        const radius = p.interactionRadius;
        const radiusSq = radius * radius;
        const stiffness = p.springStiffness * 0.065;
        const decay = p.decay;
        const curlFreq = p.curlFreq * 0.045;
        const curlAmp = p.curlAmp * (eng.shape === 'qr' ? 0.05 : 0.42);
        const gx = p.gravity.x * 0.04;
        const gy = p.gravity.y * 0.04;
        const gz = p.gravity.z * 0.04;
        const mx = mouse3D.x;
        const my = mouse3D.y;
        const mz = mouse3D.z;
        const imode = p.interactionMode;

        const isQrStatic = eng.shape === 'qr';

        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          const px = pos[idx];
          const py = pos[idx + 1];
          const pz = pos[idx + 2];

          const springK = isQrStatic ? 0.28 : stiffness;
          let fx = (tgt[idx] - px) * springK;
          let fy = (tgt[idx + 1] - py) * springK;
          let fz = (tgt[idx + 2] - pz) * springK;

          if (!isQrStatic && curlAmp > 0.005) {
            fx += Math.sin(py * curlFreq + elapsed) * curlAmp;
            fy += Math.cos(pz * curlFreq + elapsed * 1.1) * curlAmp;
            fz += Math.sin(px * curlFreq + elapsed * 0.9) * curlAmp;
          }

          if (p.audioReactive && audioEnergy > 0.01) {
            const radial = 1 + audioEnergy * 0.045;
            fx += (tgt[idx] * radial - px) * 0.05;
            fy += (tgt[idx + 1] * radial - py) * 0.05;
            fz += (tgt[idx + 2] * radial - pz) * 0.05;
          }

          if (pointerActive && !isQrStatic) {
            const dx = px - mx;
            const dy = py - my;
            const dz = pz - mz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < radiusSq && d2 > 0.05) {
              const dist = Math.sqrt(d2);
              const falloff = (1 - dist / radius) * 7.5;
              if (imode === 'repel') {
                const inv = (falloff * 3.8) / dist;
                fx += dx * inv;
                fy += dy * inv;
                fz += dz * inv;
              } else if (imode === 'attract') {
                const inv = (falloff * 3.2) / dist;
                fx -= dx * inv;
                fy -= dy * inv;
                fz -= dz * inv;
              } else if (imode === 'vortex') {
                fx += -dy * falloff * 0.055;
                fy += dx * falloff * 0.055;
              } else if (imode === 'shatter') {
                const seed = eng.seeds[i];
                fx += (Math.sin(seed * 91.7 + elapsed * 14) * falloff) * 3.2;
                fy += (Math.cos(seed * 47.3 + elapsed * 14) * falloff) * 3.2;
                fz += (Math.sin(seed * 19.1 - elapsed * 12) * falloff) * 3.2;
              }
            }
          }

          if (!isQrStatic) {
            fx += gx;
            fy += gy;
            fz += gz;
          }

          vel[idx] = (vel[idx] + fx) * decay;
          vel[idx + 1] = (vel[idx + 1] + fy) * decay;
          vel[idx + 2] = (vel[idx + 2] + fz) * decay;

          pos[idx] = px + vel[idx];
          pos[idx + 1] = py + vel[idx + 1];
          pos[idx + 2] = pz + vel[idx + 2];
        }

        if (eng.geometry) {
          eng.geometry.attributes.position.needsUpdate = true;
        }

        if (eng.points && eng.shape !== 'qr' && !isDragging) {
          eng.points.rotation.y += dt * 0.085;
          if (eng.linkLines) eng.linkLines.rotation.y = eng.points.rotation.y;
        } else if (eng.points && eng.shape === 'qr') {
          eng.points.rotation.y = THREE.MathUtils.lerp(eng.points.rotation.y, 0, 1 - Math.exp(-8 * dt));
          if (eng.linkLines) eng.linkLines.rotation.y = eng.points.rotation.y;
        }

        if (p.colorMode === 'velocity') {
          updateColorPalette();
        }

        renderer.render(scene, eng.activeCam);

        // Throttled telemetry update (<= 4Hz)
        fpsFrames++;
        fpsAccum += dt;
        if (now - lastTelemetryPush > 400) {
          const fps = fpsAccum > 0 ? Math.min(144, Math.round(fpsFrames / fpsAccum)) : 60;
          onTelemetryRef.current({
            fps,
            activePoints: eng.activeCount,
            targetPoints: p.particleCount,
            bufferMB: computeBufferSizeMB(eng.activeCount),
            backendLabel: eng.isSoftwareGl ? 'WEBGL2 (SW)' : 'GPGPU / WEBGL2',
            isSoftwareGl: eng.isSoftwareGl,
          });
          fpsFrames = 0;
          fpsAccum = 0;
          lastTelemetryPush = now;
        }

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      };

      frameId = requestAnimationFrame(tick);

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('wheel', onWheel);
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

        if (eng.audioCtx) {
          eng.audioCtx.close().catch(() => {});
        }
        eng.geometry?.dispose();
        eng.material?.dispose();
        eng.linkGeometry?.dispose();
        gridHelper.geometry.dispose();
        if (Array.isArray(gridHelper.material)) {
          gridHelper.material.forEach((m) => m.dispose());
        } else {
          gridHelper.material.dispose();
        }
        renderer.dispose();
      };
    }, [initialShape]);

    if (webglUnavailable) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#09090B] text-[#A1A1AA] gap-2">
          <div className="w-12 h-12 rounded border border-[#222226] bg-[#0E0E11] flex items-center justify-center text-[#FF5722] font-mono text-sm">
            3D
          </div>
          <p className="text-xs font-medium text-[#F4F4F5]">WebGL2 Context Unavailable</p>
          <p className="text-[11px] text-[#71717A]">
            Hardware or software WebGL2 acceleration is required to render the 3D particle simulation.
          </p>
        </div>
      );
    }

    return (
      <div
        ref={mountRef}
        data-testid="particle-viewport"
        className="w-full h-full relative bg-[#09090B]"
      />
    );
  },
);
