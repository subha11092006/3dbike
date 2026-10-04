import { useState, useRef, useEffect, useMemo} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Html,
  Environment,
  PerspectiveCamera,
  ContactShadows,
  Float,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';
import {
  Zap, Volume2, VolumeX, Eye, Info, Sliders,
  Award, CheckCircle2, Star, Lock, Disc, Activity, Sun, Gauge, Layers,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Colors {
  tank: string;
  frame: string;
  rim: string;
  accent: string;
}

interface BikeModelProps {
  colors: Colors;
  headlightsOn: boolean;
  showHotspots: boolean;
  activeHotspot: string | null;
  onSelectHotspot: (key: string) => void;
  isEngineRunning: boolean;
  rpm: number;
}

type DriveMode = 'Eco' | 'Urban' | 'Sport' | 'Track';

interface DriveModeConfig {
  maxRpm: number;
  topSpeed: number;
  accentColor: string;
  throttleFactor: number;
}

interface Review {
  name: string;
  rating: number;
  date: string;
  comment: string;
}

interface PresetTheme {
  name: string;
  tank: string;
  frame: string;
  rim: string;
  accent: string;
}

/* ------------------------------------------------------------------ */
/*  Security Shield Hook                                               */
/* ------------------------------------------------------------------ */

function useSecurityShield() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S'))
      ) {
        e.preventDefault();
      }
    };

    const handleCopyCutPaste = (e: ClipboardEvent) => {
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopyCutPaste);
    window.addEventListener('cut', handleCopyCutPaste);
    window.addEventListener('paste', handleCopyCutPaste);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopyCutPaste);
      window.removeEventListener('cut', handleCopyCutPaste);
      window.removeEventListener('paste', handleCopyCutPaste);
    };
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Motorcycle Audio Engine                                            */
/* ------------------------------------------------------------------ */

class MotorcycleAudioEngine {
  ctx: AudioContext | null = null;
  osc1: OscillatorNode | null = null;
  osc2: OscillatorNode | null = null;
  subOsc: OscillatorNode | null = null;
  noiseNode: AudioBufferSourceNode | null = null;
  gainNode: GainNode | null = null;
  filterNode: BiquadFilterNode | null = null;
  isRunning = false;

  init() {
    if (!this.ctx) {
      const AudioCtx: typeof AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  start() {
    this.init();
    if (this.isRunning || !this.ctx) return;

    const ctx = this.ctx;

    this.osc1 = ctx.createOscillator();
    this.osc2 = ctx.createOscillator();
    this.subOsc = ctx.createOscillator();

    this.osc1.type = 'sawtooth';
    this.osc2.type = 'triangle';
    this.subOsc.type = 'sine';

    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(350, ctx.currentTime);
    this.filterNode.Q.setValueAtTime(3, ctx.currentTime);

    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(0.01, ctx.currentTime);
    this.gainNode.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.3);

    this.osc1.connect(this.filterNode);
    this.osc2.connect(this.filterNode);
    this.subOsc.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);

    this.osc1.start();
    this.osc2.start();
    this.subOsc.start();

    this.isRunning = true;
    this.setRPM(1100);
  }

  setRPM(rpm: number) {
    if (!this.isRunning || !this.ctx) return;
    if (!this.osc1 || !this.osc2 || !this.subOsc || !this.filterNode) return;

    const baseFreq = (rpm / 60) * 1.5;
    const now = this.ctx.currentTime;

    this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.01, now, 0.05);
    this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.05);

    const filterFreq = Math.min(18000, 300 + (rpm / 12000) * 3500);
    this.filterNode.frequency.setTargetAtTime(filterFreq, now, 0.05);
  }

  stop() {
    if (!this.isRunning || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.gainNode) {
      this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      setTimeout(() => {
        try {
          this.osc1?.stop();
          this.osc2?.stop();
          this.subOsc?.stop();
        } catch {
          /* ignore */
        }
        this.isRunning = false;
      }, 350);
    }
  }
}

const audioEngine = new MotorcycleAudioEngine();

/* ------------------------------------------------------------------ */
/*  GLB Motorcycle Model                                               */
/* ------------------------------------------------------------------ */

// Preload so the model is ready as soon as the canvas mounts.
useGLTF.preload('/models/motor.glb');

function MotorcycleModel({
  colors,
  headlightsOn,
  showHotspots,
  activeHotspot,
  onSelectHotspot,
  isEngineRunning,
  
}: BikeModelProps) {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/models/motor.glb');

  // Clone so HMR / multiple mounts don't fight over the same object
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  // One-time log of mesh node names (check browser console)
  useEffect(() => {
    const names: string[] = [];
    clonedScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) names.push(obj.name);
    });
    // eslint-disable-next-line no-console
    console.log('[motor.glb] mesh nodes:', names);
  }, [clonedScene]);

  /* ----------------------------------------------------------------
     AUTO-FIT: measure the model, scale it to a target length,
     center it on X/Z, and drop its lowest point exactly onto y=0.
     Recomputes whenever the cloned scene changes.
  ---------------------------------------------------------------- */
  const TARGET_LENGTH = 2.4; // target bike length in world units (adjust to taste)

  const fit = useMemo(() => {
    // Reset transforms so the box is measured in the model's native space
    clonedScene.position.set(0, 0, 0);
    clonedScene.rotation.set(0, 0, 0);
    clonedScene.scale.set(1, 1, 1);
    clonedScene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Longest horizontal dimension is treated as "length"
    const length = Math.max(size.x, size.z) || 1;
    const scale = TARGET_LENGTH / length;

    // After scaling, we need the *scaled* bounding box to compute offsets
    const scaledMinY = box.min.y * scale;
    const scaledCenterX = center.x * scale;
    const scaledCenterZ = center.z * scale;

    return {
      scale,
      // lift so the lowest point rests on y=0
      position: [
        -scaledCenterX,
        -scaledMinY,
        -scaledCenterZ,
      ] as [number, number, number],
    };
  }, [clonedScene]);

  // Subtle slow spin when engine is running
  useFrame((_, delta) => {
    if (isEngineRunning && group.current) {
      group.current.rotation.y += delta * 0.05;
    }
  });

  // Tint fallback — tint anything that isn't a tire/chrome/glass/brake
  useEffect(() => {
    clonedScene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const mat = mesh.material as
        | THREE.MeshStandardMaterial
        | THREE.MeshStandardMaterial[];

      const applyTint = (m: THREE.MeshStandardMaterial) => {
        if (!m) return;
        const name = (m.name || '').toLowerCase();
        const skip = ['tire', 'tyre', 'chrome', 'glass', 'light', 'brake', 'disc'];
        if (skip.some((s) => name.includes(s))) return;
        m.color = new THREE.Color(colors.tank);
        m.needsUpdate = true;
      };

      if (Array.isArray(mat)) mat.forEach(applyTint);
      else applyTint(mat);
    });
  }, [clonedScene, colors.tank]);

  // Emissive headlight materials when lights are on
  useEffect(() => {
    if (!headlightsOn) return;
    clonedScene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m && (m.name || '').toLowerCase().includes('light')) {
        m.emissive = new THREE.Color('#38bdf8');
        m.emissiveIntensity = 3;
        m.needsUpdate = true;
      }
    });
  }, [clonedScene, headlightsOn]);

  return (
    <group ref={group}>
      {/* Auto-fitted model */}
      <group scale={fit.scale} position={fit.position}>
        <primitive object={clonedScene} />
      </group>

      {/* Headlight glow — placed at the front of the auto-fitted bike */}
      {headlightsOn && (
        <spotLight
          position={[0, 0.7, 1.3]}
          color="#38bdf8"
          intensity={14}
          angle={0.55}
          penumbra={0.4}
          distance={14}
          castShadow
        />
      )}

      {/* --- HOTSPOTS — placed in world space, independent of model fit --- */}
      {showHotspots && (
        <group>
          <Html position={[0, 0.55, 0]}>
            <button
              onClick={() => onSelectHotspot('engine')}
              className={`group relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all transform hover:scale-125 ${
                activeHotspot === 'engine'
                  ? 'bg-cyan-500 border-white ring-4 ring-cyan-500/50 scale-110'
                  : 'bg-black/70 border-cyan-400 text-cyan-300 backdrop-blur-md'
              }`}
            >
              <Activity className="w-4 h-4 animate-pulse" />
              <span className="absolute left-10 px-2 py-1 bg-slate-900/90 text-cyan-400 text-xs font-mono rounded border border-cyan-500/30 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                Engine
              </span>
            </button>
          </Html>

          <Html position={[0, 1.0, 0.3]}>
            <button
              onClick={() => onSelectHotspot('aerodynamics')}
              className={`group relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all transform hover:scale-125 ${
                activeHotspot === 'aerodynamics'
                  ? 'bg-cyan-500 border-white ring-4 ring-cyan-500/50 scale-110'
                  : 'bg-black/70 border-cyan-400 text-cyan-300 backdrop-blur-md'
              }`}
            >
              <Layers className="w-4 h-4 animate-pulse" />
              <span className="absolute left-10 px-2 py-1 bg-slate-900/90 text-cyan-400 text-xs font-mono rounded border border-cyan-500/30 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                Bodywork
              </span>
            </button>
          </Html>

          <Html position={[0.3, 0.3, 0.9]}>
            <button
              onClick={() => onSelectHotspot('brakes')}
              className={`group relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all transform hover:scale-125 ${
                activeHotspot === 'brakes'
                  ? 'bg-cyan-500 border-white ring-4 ring-cyan-500/50 scale-110'
                  : 'bg-black/70 border-cyan-400 text-cyan-300 backdrop-blur-md'
              }`}
            >
              <Disc className="w-4 h-4 animate-pulse" />
              <span className="absolute left-10 px-2 py-1 bg-slate-900/90 text-cyan-400 text-xs font-mono rounded border border-cyan-500/30 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                Brakes
              </span>
            </button>
          </Html>

          <Html position={[0, 1.05, 0.9]}>
            <button
              onClick={() => onSelectHotspot('cockpit')}
              className={`group relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all transform hover:scale-125 ${
                activeHotspot === 'cockpit'
                  ? 'bg-cyan-500 border-white ring-4 ring-cyan-500/50 scale-110'
                  : 'bg-black/70 border-cyan-400 text-cyan-300 backdrop-blur-md'
              }`}
            >
              <Gauge className="w-4 h-4 animate-pulse" />
              <span className="absolute left-10 px-2 py-1 bg-slate-900/90 text-cyan-400 text-xs font-mono rounded border border-cyan-500/30 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                Cockpit
              </span>
            </button>
          </Html>
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  useSecurityShield();

const [colors, setColors] = useState<Colors>({
  tank: '#000000',
  frame: '#0a0a0a',
  rim: '#111111',
  accent: '#1a1a1a',
});

  const [isEngineRunning, setIsEngineRunning] = useState<boolean>(false);
  const [headlightsOn, setHeadlightsOn] = useState<boolean>(true);
  const [driveMode, setDriveMode] = useState<DriveMode>('Sport');
  const [rpm, setRpm] = useState<number>(1100);
  const [speed, setSpeed] = useState<number>(0);

  const [showHotspots, setShowHotspots] = useState<boolean>(false);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const [showSpecModal, setShowSpecModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'customize' | 'modes' | 'reviews'>('customize');

  const [reviews, setReviews] = useState<Review[]>([
    {
      name: 'Alex V.',
      rating: 5,
      date: '2 days ago',
      comment:
        'Unbelievable throttle response and cornering precision! The cyberpunk design turns heads everywhere.',
    },
    {
      name: 'Elena R.',
      rating: 5,
      date: '1 week ago',
      comment:
        'The Brembo brakes stop on a dime. The digital HUD telemetry is super crisp at night.',
    },
    {
      name: 'Marcus K.',
      rating: 4,
      date: '2 weeks ago',
      comment: 'Track mode unleashes insane torque. Best hyperbike setup on the market.',
    },
  ]);

  const [newReview, setNewReview] = useState<{ name: string; rating: number; comment: string }>({
    name: '',
    rating: 5,
    comment: '',
  });

  const orbitRef = useRef<any>(null);

  const driveModeConfigs: Record<DriveMode, DriveModeConfig> = {
    Eco:   { maxRpm: 6000,  topSpeed: 120, accentColor: '#10b981', throttleFactor: 0.8 },
    Urban: { maxRpm: 8500,  topSpeed: 170, accentColor: '#3b82f6', throttleFactor: 1.0 },
    Sport: { maxRpm: 11500, topSpeed: 240, accentColor: '#0ea5e9', throttleFactor: 1.3 },
    Track: { maxRpm: 14000, topSpeed: 310, accentColor: '#f43f5e', throttleFactor: 1.7 },
  };

  const toggleEngine = () => {
    if (isEngineRunning) {
      audioEngine.stop();
      setIsEngineRunning(false);
      setRpm(0);
      setSpeed(0);
    } else {
      audioEngine.start();
      setIsEngineRunning(true);
      setRpm(1100);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isEngineRunning) {
      interval = setInterval(() => {
        setRpm((prev) => {
          const config = driveModeConfigs[driveMode];
          const targetIdle = 1100 + Math.random() * 150;
          let nextRpm = prev + (Math.random() * 200 - 90);
          if (nextRpm < 1000) nextRpm = targetIdle;
          if (nextRpm > config.maxRpm) nextRpm = config.maxRpm;

          audioEngine.setRPM(nextRpm);

          const calculatedSpeed = Math.floor(
            (nextRpm / config.maxRpm) * config.topSpeed * 0.85
          );
          setSpeed(calculatedSpeed);

          return nextRpm;
        });
      }, 120);
    }
    return () => {
      if (interval !== undefined) clearInterval(interval);
    };
  }, [isEngineRunning, driveMode]);

  const handleHotspotSelect = (key: string) => {
    setActiveHotspot(key);
    if (!orbitRef.current) return;

    switch (key) {
      case 'engine':
        orbitRef.current.setLookAt(0.8, 0.6, 0.8, 0, 0.5, 0, true);
        break;
      case 'aerodynamics':
        orbitRef.current.setLookAt(0, 1.8, 1.2, 0, 1.0, 0, true);
        break;
      case 'brakes':
        orbitRef.current.setLookAt(1.2, 0.4, 1.8, 0, 0.3, 1.2, true);
        break;
      case 'cockpit':
        orbitRef.current.setLookAt(0, 1.4, 0.8, 0, 1.0, 1.0, true);
        break;
      default:
        orbitRef.current.setLookAt(2.8, 1.4, 3.2, 0, 0.6, 0, true);
        break;
    }
  };

  const presetThemes: PresetTheme[] = [
    { name: 'Cyber Cyan',     tank: '#0ea5e9', frame: '#334155', rim: '#0284c7', accent: '#38bdf8' },
    { name: 'Apex Red',       tank: '#e11d48', frame: '#1e293b', rim: '#be123c', accent: '#fb7185' },
    { name: 'Neon Acid',      tank: '#84cc16', frame: '#0f172a', rim: '#65a30d', accent: '#a3e635' },
    { name: 'Stealth Carbon', tank: '#1e293b', frame: '#090d16', rim: '#475569', accent: '#94a3b8' },
    { name: 'Solar Flare',    tank: '#f97316', frame: '#27272a', rim: '#ea580c', accent: '#fb923c' },
  ];

  const submitReview = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newReview.name || !newReview.comment) return;
    setReviews([{ ...newReview, date: 'Just now' }, ...reviews]);
    setNewReview({ name: '', rating: 5, comment: '' });
  };

  return (
    <div className="relative w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      

      {/* --- TOP HUD NAVIGATION BAR --- */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-slate-950/90 via-slate-950/50 to-transparent backdrop-blur-xs pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 p-0.5 shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-cyan-400">
              HYPERBIKE V-9
            </h1>
            <p className="text-[10px] font-mono tracking-widest text-cyan-400/80 uppercase">
              Interactive 3D Engineering Showcase
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleEngine}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-xs font-semibold tracking-wider transition-all shadow-lg ${
              isEngineRunning
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-emerald-500/20 animate-pulse'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-300 hover:border-cyan-500/50'
            }`}
          >
            {isEngineRunning ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
            <span>{isEngineRunning ? 'ENGINE ACTIVE' : 'IGNITE ENGINE'}</span>
          </button>

          <button
            onClick={() => setHeadlightsOn(!headlightsOn)}
            className={`p-2.5 rounded-xl border transition-all ${
              headlightsOn
                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-400'
            }`}
            title="Toggle Matrix Headlights"
          >
            <Sun className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowHotspots(!showHotspots)}
            className={`p-2.5 rounded-xl border transition-all ${
              showHotspots
                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-400'
            }`}
            title="Toggle Hotspots"
          >
            <Eye className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSpecModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-cyan-500/25 transition-all"
          >
            <Info className="w-4 h-4" />
            <span>FULL SPECS</span>
          </button>
        </div>
      </header>

      {/* --- MAIN 3D CANVAS VIEWPORT --- */}
      <main className="w-full h-full">
        <Canvas shadows gl={{ antialias: true, alpha: false }}>
          <color attach="background" args={['#030712']} />
          <PerspectiveCamera makeDefault position={[2.8, 1.4, 3.2]} fov={45} />
          <OrbitControls
            ref={orbitRef}
            enablePan={false}
            minDistance={2.0}
            maxDistance={8.0}
            maxPolarAngle={Math.PI / 2 + 0.05}
            minPolarAngle={0.2}
            dampingFactor={0.05}
          />

          <ambientLight intensity={0.6} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-5, 4, -5]} intensity={0.5} color="#38bdf8" />
          <pointLight position={[0, 3, 0]} intensity={0.8} color={colors.accent} />

          <Environment preset="city" />

          <Float speed={isEngineRunning ? 2 : 0} rotationIntensity={0.02} floatIntensity={0.03}>
            <MotorcycleModel
              colors={colors}
              headlightsOn={headlightsOn}
              showHotspots={showHotspots}
              activeHotspot={activeHotspot}
              onSelectHotspot={handleHotspotSelect}
              isEngineRunning={isEngineRunning}
              rpm={rpm}
            />
          </Float>

          <ContactShadows position={[0, -0.11, 0]} opacity={0.7} scale={10} blur={1.5} far={4} />
          <gridHelper args={[20, 20, '#0284c7', '#1e293b']} position={[0, -0.12, 0]} />
        </Canvas>
      </main>

      {/* --- TELEMETRY HUD OVERLAY --- */}
      <div className="absolute bottom-6 left-6 z-20 flex items-center gap-4 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl backdrop-blur-md shadow-2xl pointer-events-auto">
        <div className="text-center px-4 border-r border-slate-800">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
            Velocity
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-extrabold font-mono text-cyan-400 tracking-tight">
              {isEngineRunning ? speed : 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">KM/H</span>
          </div>
        </div>

        <div className="w-48">
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
            <span>RPM TELEMETRY</span>
            <span className="text-cyan-400 font-bold">
              {isEngineRunning ? Math.round(rpm) : 0}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-rose-500 rounded-full transition-all duration-150"
              style={{
                width: `${
                  isEngineRunning ? (rpm / driveModeConfigs[driveMode].maxRpm) * 100 : 0
                }%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
            <span>0</span>
            <span>7K</span>
            <span>14K</span>
          </div>
        </div>
      </div>

      {/* --- RIGHT CONTROL & CUSTOMIZER SIDEBAR --- */}
      <aside className="absolute top-20 right-6 bottom-6 z-20 w-80 bg-slate-900/85 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md shadow-2xl flex flex-col justify-between pointer-events-auto overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('customize')}
            className={`flex items-center gap-2 text-xs font-semibold tracking-wider uppercase transition-colors ${
              activeTab === 'customize'
                ? 'text-cyan-400 border-b-2 border-cyan-400 pb-1'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Customize</span>
          </button>

          <button
            onClick={() => setActiveTab('modes')}
            className={`flex items-center gap-2 text-xs font-semibold tracking-wider uppercase transition-colors ${
              activeTab === 'modes'
                ? 'text-cyan-400 border-b-2 border-cyan-400 pb-1'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Drive Mode</span>
          </button>

          <button
            onClick={() => setActiveTab('reviews')}
            className={`flex items-center gap-2 text-xs font-semibold tracking-wider uppercase transition-colors ${
              activeTab === 'reviews'
                ? 'text-cyan-400 border-b-2 border-cyan-400 pb-1'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className="w-4 h-4" />
            <span>Reviews</span>
          </button>
        </div>

        {activeTab === 'customize' && (
          <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1 custom-scrollbar">
            <div>
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
                Factory Color Schemes
              </label>
              <div className="grid grid-cols-5 gap-2">
                {presetThemes.map((theme, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      setColors({
                        tank: theme.tank,
                        frame: theme.frame,
                        rim: theme.rim,
                        accent: theme.accent,
                      })
                    }
                    className="w-full aspect-square rounded-xl border border-slate-700/80 p-1 hover:border-cyan-400 transition-all transform hover:scale-105"
                    title={theme.name}
                  >
                    <div
                      className="w-full h-full rounded-lg"
                      style={{ backgroundColor: theme.tank }}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                Component Finishes
              </label>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-xs font-medium text-slate-300">Primary Body</span>
                <input
                  type="color"
                  value={colors.tank}
                  onChange={(e) => setColors({ ...colors, tank: e.target.value })}
                  className="w-8 h-8 rounded-lg bg-transparent cursor-pointer border-none"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-xs font-medium text-slate-300">Chassis Frame</span>
                <input
                  type="color"
                  value={colors.frame}
                  onChange={(e) => setColors({ ...colors, frame: e.target.value })}
                  className="w-8 h-8 rounded-lg bg-transparent cursor-pointer border-none"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-xs font-medium text-slate-300">Alloy Wheel Rims</span>
                <input
                  type="color"
                  value={colors.rim}
                  onChange={(e) => setColors({ ...colors, rim: e.target.value })}
                  className="w-8 h-8 rounded-lg bg-transparent cursor-pointer border-none"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-xs font-medium text-slate-300">LED & Brake Accents</span>
                <input
                  type="color"
                  value={colors.accent}
                  onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                  className="w-8 h-8 rounded-lg bg-transparent cursor-pointer border-none"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'modes' && (
          <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1 custom-scrollbar">
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
              Select Performance Map
            </label>
            {(Object.keys(driveModeConfigs) as DriveMode[]).map((mode) => {
              const isSelected = driveMode === mode;
              const config = driveModeConfigs[mode];
              return (
                <button
                  key={mode}
                  onClick={() => setDriveMode(mode)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-slate-800/90 border-cyan-500 shadow-lg shadow-cyan-500/10'
                      : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-sm font-bold ${
                        isSelected ? 'text-cyan-400' : 'text-slate-200'
                      }`}
                    >
                      {mode.toUpperCase()} MODE
                    </span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Max RPM: {config.maxRpm.toLocaleString()}</span>
                    <span>Top Speed: {config.topSpeed} km/h</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="flex-1 overflow-y-auto py-2 space-y-4 pr-1 custom-scrollbar">
            <form onSubmit={submitReview} className="space-y-2 border-b border-slate-800 pb-3">
              <input
                type="text"
                placeholder="Your Name"
                value={newReview.name}
                onChange={(e) => setNewReview({ ...newReview, name: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              <textarea
                placeholder="Share your rider experience..."
                value={newReview.comment}
                onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                rows={2}
                className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 resize-none"
              />
              <button
                type="submit"
                className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition-colors"
              >
                Submit Review
              </button>
            </form>

            <div className="space-y-3">
              {reviews.map((rev, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/60"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-200">{rev.name}</span>
                    <span className="text-[10px] text-slate-500">{rev.date}</span>
                  </div>
                  <div className="flex items-center text-amber-400 mb-1">
                    {[...Array(rev.rating)].map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{rev.comment}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-cyan-400" />
            v9
          </span>
          <span className="text-slate-400">V9.4 PROT</span>
        </div>
      </aside>

      {/* --- SPECIFICATION MODAL OVERLAY --- */}
      {showSpecModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-lg">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <Award className="w-6 h-6 text-cyan-400" />
                <h2 className="text-lg font-bold text-slate-100">TECHNICAL SPECIFICATIONS</h2>
              </div>
              <button
                onClick={() => setShowSpecModal(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
              >
                CLOSE
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Engine Type</span>
                <span className="font-semibold text-slate-200">1290cc V-Twin Liquid Cooled</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Horsepower</span>
                <span className="font-semibold text-slate-200">180 HP @ 9,500 RPM</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Torque</span>
                <span className="font-semibold text-slate-200">140 Nm @ 8,000 RPM</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Transmission</span>
                <span className="font-semibold text-slate-200">6-Speed with Quickshifter+</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Dry Weight</span>
                <span className="font-semibold text-slate-200">189 kg / 416 lbs</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1">Braking System</span>
                <span className="font-semibold text-slate-200">Dual 320mm Brembo Stylema</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}