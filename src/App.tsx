import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Flame, Snowflake, Mic, MicOff, RotateCcw, Zap, AlertTriangle, Wind, Activity } from 'lucide-react';
import Matter from 'matter-js';
import LetterGlitch from './LetterGlitch';

// ─── THERMAL CONSTANTS ──────────────────────────────────────────────────────
const DEFAULT_TEMP = 75.0;
const MAX_TEMP = 120.0;
const MIN_TEMP = 0.0;
const BELLOWS_ENERGY_THRESHOLD = 75; // 75 / 255
const DECAY_RATE = 6.0;
const DECAY_INTERVAL_MS = 400;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
/** Clamp a value between min and max */
const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
/** Format temperature for display */
const fmt = (n: number) => n.toFixed(1);

// ─── SEGMENTED BAR GAUGE ─────────────────────────────────────────────────────
function SegmentedThermalBar({ temp }: { temp: number }) {
  const totalSegments = 20;
  const filledCount = Math.round((temp / MAX_TEMP) * totalSegments);

  return (
    <div
      className="flex items-center gap-[2px]"
      role="meter"
      aria-label={`Thermal bar: ${fmt(temp)} degrees Celsius`}
      aria-valuenow={temp}
      aria-valuemin={MIN_TEMP}
      aria-valuemax={MAX_TEMP}
    >
      {Array.from({ length: totalSegments }, (_, i) => {
        const active = i < filledCount;
        const segTemp = ((i + 1) / totalSegments) * MAX_TEMP;
        let cls = 'segment-inactive';
        if (active) {
          if (segTemp <= 20) cls = 'segment-active-cold';
          else if (segTemp <= 60) cls = 'segment-active-nom';
          else if (segTemp <= 90) cls = 'segment-active-hot';
          else cls = 'segment-active-overheat';
        }
        return (
          <div
            key={i}
            className={`h-3 w-[6px] rounded-[1px] transition-all duration-100 ${cls}`}
          />
        );
      })}
    </div>
  );
}

// ─── 5-BAR ACOUSTIC BELLOWS VU METER ─────────────────────────────────────────
function BellowsVuMeter({ level, armed, blowing }: { level: number; armed: boolean; blowing: boolean }) {
  const barCount = 5;
  const activeCount = armed ? Math.ceil((level / 100) * barCount) : 0;
  const delays = ['0.05s', '0.15s', '0.1s', '0.2s', '0.08s'];

  return (
    <div
      className="flex items-end gap-[2px] h-5"
      role="meter"
      aria-label={`Bellows acoustic level: ${Math.round(level)} percent`}
      aria-valuenow={level}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: barCount }, (_, i) => {
        const active = i < activeCount;
        const heightPct = 40 + (i / (barCount - 1)) * 60;
        return (
          <div
            key={i}
            className="vu-bar w-[4px] rounded-[1px] transition-all duration-75"
            style={{
              height: `${heightPct}%`,
              '--vu-delay': delays[i],
              animationPlayState: (active && blowing) ? 'running' : 'paused',
              background: active
                ? blowing
                  ? `rgba(245,158,11,${0.6 + i * 0.08})`
                  : `rgba(52,211,153,${0.6 + i * 0.08})`
                : 'rgba(30,41,59,0.8)',
              boxShadow: active
                ? blowing
                  ? `0 0 5px rgba(245,158,11,0.8)`
                  : `0 0 5px rgba(52,211,153,0.7)`
                : 'none',
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

// ─── MAGNETIC BUTTON ──────────────────────────────────────────────────────────
interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  strength?: number;
}

function MagneticButton({
  children,
  className = '',
  style = {},
  strength = 0.28,
  onMouseMove,
  onMouseEnter,
  onMouseLeave,
  ...props
}: MagneticButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = (e.clientX - centerX) * strength;
      const deltaY = (e.clientY - centerY) * strength;
      const maxPull = 10;
      const dist = Math.hypot(deltaX, deltaY);
      const factor = dist > maxPull ? maxPull / dist : 1;
      setOffset({ x: deltaX * factor, y: deltaY * factor });
    }
    onMouseMove?.(e);
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsHovered(true);
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsHovered(false);
    setOffset({ x: 0, y: 0 });
    onMouseLeave?.(e);
  };

  return (
    <button
      ref={btnRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`transition-transform duration-200 ease-out active:scale-95 cursor-pointer ${className}`}
      style={{
        ...style,
        transform: isHovered
          ? `translate3d(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px, 0)`
          : 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── ENTROPY SPARKLINE ────────────────────────────────────────────────────────
function EntropySparkline({ history }: { history: number[] }) {
  const W = 96;
  const H = 36;
  const pad = 2;

  const points = useMemo(() => {
    if (history.length < 2) return '';
    const minV = Math.min(...history, MIN_TEMP);
    const maxV = Math.max(...history, MAX_TEMP);
    const range = maxV - minV || 1;
    return history
      .map((v, i) => {
        const x = pad + (i / (history.length - 1)) * (W - pad * 2);
        const y = H - pad - ((v - minV) / range) * (H - pad * 2);
        return `${x},${y}`;
      })
      .join(' ');
  }, [history]);

  const last = history[history.length - 1] ?? DEFAULT_TEMP;
  const strokeColor =
    last > 60 ? '#f59e0b' : last <= 20 ? '#22d3ee' : last <= 0 ? '#f43f5e' : '#34d399';

  return (
    <div className="relative">
      <div className="text-[9px] font-mono font-normal uppercase tracking-wide text-slate-500 mb-0.5">ΔT DRIFT</div>
      <svg width={W} height={H} aria-label="Entropy temperature drift sparkline" role="img">
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={pad}
            y1={pad + frac * (H - pad * 2)}
            x2={W - pad}
            y2={pad + frac * (H - pad * 2)}
            stroke="rgba(100,116,139,0.1)"
            strokeWidth="0.5"
          />
        ))}
        {history.length >= 2 && (
          <>
            <polyline
              points={points}
              className="sparkline-path"
              stroke={strokeColor}
              strokeWidth="1.5"
              filter={`drop-shadow(0 0 2px ${strokeColor})`}
            />
            {/* End dot */}
            {(() => {
              const lastIdx = history.length - 1;
              const minV = Math.min(...history, MIN_TEMP);
              const maxV = Math.max(...history, MAX_TEMP);
              const range = maxV - minV || 1;
              const cx = pad + (lastIdx / (history.length - 1)) * (W - pad * 2);
              const cy = H - pad - ((history[lastIdx] - minV) / range) * (H - pad * 2);
              return (
                <circle cx={cx} cy={cy} r={2.5} fill={strokeColor}
                  filter={`drop-shadow(0 0 3px ${strokeColor})`} />
              );
            })()}
          </>
        )}
      </svg>
    </div>
  );
}

// ─── PROCEDURAL EXPLOSION SOUND (WEB AUDIO) ─────────────────────────────────
function playExplosionSound() {
  try {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtxClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // Detonation punch (low sine thump 160Hz -> 22Hz)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.7);
    oscGain.gain.setValueAtTime(0.95, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.85);

    // Distortion crunch sub-layer (95Hz -> 14Hz)
    const osc2 = ctx.createOscillator();
    const osc2Gain = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(95, now);
    osc2.frequency.exponentialRampToValueAtTime(14, now + 0.5);
    osc2Gain.gain.setValueAtTime(0.65, now);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(osc2Gain);
    osc2Gain.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.55);

    // Filtered white noise blast wave
    const bufferSize = Math.floor(ctx.sampleRate * 1.6);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.42));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + 1.4);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.85, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 1.6);
  } catch {
    // AudioContext may be restricted by autoplay policy until user gesture
  }
}

// ─── PROCEDURAL WARP / CAMERA ZOOM SOUND ───────────────────────────────────
function playWarpZoomSound() {
  try {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtxClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // Rising atmospheric sub-sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.85);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(2600, now + 0.35);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.85);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.9);
  } catch {
    // Autoplay restrictions or unavailable audio context
  }
}

// ─── EXPLOSION PARTICLE ENGINE ───────────────────────────────────────────────
interface ExplosionParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
  drag: number;
  type: 'spark' | 'ember' | 'smoke';
}

interface WordDebris {
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vRot: number;
  alpha: number;
  decay: number;
  scale: number;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function App() {
  const [text, setText] = useState('');
  const [caretPosition, setCaretPosition] = useState(0);
  const textRef = useRef('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorDisplayRef = useRef<HTMLDivElement | null>(null);
  const [displayTemp, setDisplayTemp] = useState<number>(DEFAULT_TEMP);
  const [entropyWords, setEntropyWords] = useState(0);
  const [tempHistory, setTempHistory] = useState<number[]>([DEFAULT_TEMP]);
  const [prevTemp, setPrevTemp] = useState<number>(DEFAULT_TEMP);

  // Sync textRef with text
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Raw numeric temperature stored in ref to prevent render thrashing
  const tempRef = useRef<number>(DEFAULT_TEMP);

  // Matter.js physics
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeBodiesRef = useRef<Matter.Body[]>([]);

  // Explosion state and refs
  const [isExploding, setIsExploding] = useState(false);
  const [detonationCount, setDetonationCount] = useState(0);
  const isExplodingRef = useRef(false);
  const explosionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const explosionAnimRef = useRef<number | null>(null);
  const explosionTimerRef = useRef<number | null>(null);

  // Web Audio API Bellows
  const [bellowsArmed, setBellowsArmed] = useState(false);
  const [bellowsLevel, setBellowsLevel] = useState(0);
  const [isBlowing, setIsBlowing] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioAnimRef = useRef<number | null>(null);
  const lastBellowsHeatRef = useRef<number>(0);

  // Line gutter energy values (fake telemetry, updates slowly)
  const [gutterEnergy, setGutterEnergy] = useState<number[]>(() => Array.from({ length: 10 }, () => Math.random() * 5));

  // Maximize / Full-bleed mode
  const [isMaximized, setIsMaximized] = useState(false);

  // ─── LOADING SCREEN & CAMERA ZOOM ──────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isZooming, setIsZooming] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('INITIALIZING THERMAL CORE...');

  const triggerCameraZoom = useCallback(() => {
    if (isZooming || hasLoaded) return;
    setIsZooming(true);
    setLoadingProgress(100);
    setLoadingStatus('SYSTEM ARMED // CAMERA LOCK');
    playWarpZoomSound();
    window.setTimeout(() => {
      setIsLoading(false);
      setHasLoaded(true);
      window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }, 950);
  }, [isZooming, hasLoaded]);

  const replayBoot = useCallback(() => {
    setHasLoaded(false);
    setIsZooming(false);
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingStatus('INITIALIZING THERMAL CORE...');
  }, []);

  // Boot sequence simulation
  useEffect(() => {
    if (!isLoading || isZooming) return;
    const startTime = performance.now();
    const duration = 2000;

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setLoadingProgress(progress);

      if (progress < 25) {
        setLoadingStatus('INITIALIZING THERMAL CORE...');
      } else if (progress < 50) {
        setLoadingStatus('CALIBRATING MATTER.JS PHYSICS MATRIX...');
      } else if (progress < 75) {
        setLoadingStatus('SYNCHRONIZING TELEMETRY BUS & SHADERS...');
      } else if (progress < 98) {
        setLoadingStatus('STABILIZING THERMAL EQUILIBRIUM AT 75.0°C...');
      } else {
        setLoadingStatus('SYSTEM ARMED // CAMERA LOCK');
      }

      if (progress >= 100) {
        clearInterval(interval);
        triggerCameraZoom();
      }
    }, 25);

    return () => clearInterval(interval);
  }, [isLoading, isZooming, triggerCameraZoom]);

  // Quick-skip on Space / Enter
  useEffect(() => {
    if (!isLoading || isZooming) return;
    const handleSkip = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        triggerCameraZoom();
      }
    };
    window.addEventListener('keydown', handleSkip);
    return () => window.removeEventListener('keydown', handleSkip);
  }, [isLoading, isZooming, triggerCameraZoom]);

  // isFailed: catastrophic collapse
  const isFailed = displayTemp <= MIN_TEMP;

  // Computed: enthalpy vector (rate of change per second)
  const deltaT = useMemo(() => {
    const rate = (displayTemp - prevTemp) / (DECAY_INTERVAL_MS / 1000);
    return rate;
  }, [displayTemp, prevTemp]);

  // Computed: cursor blink rate — faster as temp rises
  const cursorBlinkMs = useMemo(() => {
    if (isFailed) return 200;
    const normalized = clamp((displayTemp - MIN_TEMP) / (MAX_TEMP - MIN_TEMP), 0, 1);
    return Math.round(800 - normalized * 600); // 800ms at 0°C → 200ms at 120°C
  }, [displayTemp, isFailed]);

  // Thermal state classification
  const thermalZone: 'collapse' | 'cold' | 'nominal' | 'hot' = useMemo(() => {
    if (displayTemp <= 0) return 'collapse';
    if (displayTemp <= 20) return 'cold';
    if (displayTemp <= 60) return 'nominal';
    return 'hot';
  }, [displayTemp]);

  // ─── THERMAL DECAY LOOP ────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setPrevTemp(tempRef.current);
      if (!isExplodingRef.current) {
        tempRef.current = Math.max(MIN_TEMP, Number((tempRef.current - DECAY_RATE).toFixed(1)));
        setDisplayTemp(tempRef.current);
      }
      setTempHistory((h) => {
        const next = [...h, tempRef.current];
        return next.length > 30 ? next.slice(next.length - 30) : next; // keep 30 data points (~15 intervals of 2s apiece)
      });
      // Slowly randomize gutter energy readings
      setGutterEnergy((prev) =>
        prev.map((v) => clamp(v + (Math.random() - 0.5) * 1.5, 0.1, 9.9))
      );
    }, DECAY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ─── OVERHEAT EXPLOSION TRIGGER ──────────────────────────────────────────
  const triggerExplosion = useCallback(() => {
    if (isExplodingRef.current) return;
    isExplodingRef.current = true;
    setIsExploding(true);
    setDetonationCount((c) => c + 1);

    // Blast audio detonation
    playExplosionSound();

    // Capture and destroy text from textarea!
    const rawText = textRef.current.trim();
    const wordTokens = rawText ? rawText.split(/\s+/) : [];
    if (wordTokens.length > 0) {
      setEntropyWords((prev) => prev + wordTokens.length);
    }
    // WIPE / INCINERATE TEXT IMMEDIATELY
    setText('');
    textRef.current = '';

    // If physics bodies are currently in world, scatter them violently
    if (activeBodiesRef.current.length > 0) {
      activeBodiesRef.current.forEach((body) => {
        Matter.Body.applyForce(body, body.position, {
          x: (Math.random() - 0.5) * 0.12,
          y: -(0.08 + Math.random() * 0.08),
        });
      });
    }

    // Canvas particle explosion
    const canvas = explosionCanvasRef.current;
    if (canvas) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const originX = width / 2;
        const originY = height / 2;

        const particles: ExplosionParticle[] = [];
        const sparkColors = ['#ffffff', '#fff7ed', '#fef08a', '#fde047', '#67e8f9'];
        const emberColors = ['#f59e0b', '#f97316', '#ef4444', '#dc2626', '#b91c1c'];
        const smokeColors = ['rgba(75,85,99,', 'rgba(154,52,18,', 'rgba(185,28,28,'];

        // Word debris fragments from the destroyed text
        const wordFragments: WordDebris[] = [];
        const wordsToExplode = wordTokens.length > 0
          ? wordTokens
          : ['THERMAL', 'RUNAWAY', 'TEXT', 'INCINERATED'];
        wordsToExplode.slice(0, 40).forEach((w) => {
          const angle = Math.random() * Math.PI * 2;
          const speed = 6 + Math.random() * 18;
          wordFragments.push({
            text: w,
            x: originX + (Math.random() - 0.5) * 160,
            y: originY + (Math.random() - 0.5) * 100,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3,
            angle: (Math.random() - 0.5) * 0.6,
            vRot: (Math.random() - 0.5) * 0.12,
            alpha: 1,
            decay: 0.016 + Math.random() * 0.014,
            scale: 1,
          });
        });

        // 70 High-speed sparks
        for (let i = 0; i < 70; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 10 + Math.random() * 24;
          particles.push({
            x: originX + (Math.random() - 0.5) * 40,
            y: originY + (Math.random() - 0.5) * 40,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 1.5 + Math.random() * 2.5,
            color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
            alpha: 1,
            decay: 0.02 + Math.random() * 0.025,
            gravity: 0.05,
            drag: 0.94,
            type: 'spark',
          });
        }

        // 80 Fiery embers
        for (let i = 0; i < 80; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 4 + Math.random() * 14;
          particles.push({
            x: originX + (Math.random() - 0.5) * 50,
            y: originY + (Math.random() - 0.5) * 50,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 3 + Math.random() * 5,
            color: emberColors[Math.floor(Math.random() * emberColors.length)],
            alpha: 1,
            decay: 0.012 + Math.random() * 0.015,
            gravity: 0.12,
            drag: 0.96,
            type: 'ember',
          });
        }

        // 40 Smoke puffs
        for (let i = 0; i < 40; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 5;
          particles.push({
            x: originX + (Math.random() - 0.5) * 60,
            y: originY + (Math.random() - 0.5) * 60,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.5,
            size: 12 + Math.random() * 24,
            color: smokeColors[Math.floor(Math.random() * smokeColors.length)],
            alpha: 0.6,
            decay: 0.007 + Math.random() * 0.009,
            gravity: -0.04,
            drag: 0.93,
            type: 'smoke',
          });
        }

        let shockwaveRadius = 10;
        const maxShockwaveRadius = Math.max(width, height) * 0.75;
        let shockwaveAlpha = 1;

        const renderFrame = () => {
          ctx.clearRect(0, 0, width, height);

          // Render expanding shockwave ring
          if (shockwaveRadius < maxShockwaveRadius) {
            shockwaveRadius += (maxShockwaveRadius - shockwaveRadius) * 0.12 + 14;
            shockwaveAlpha = Math.max(0, 1 - shockwaveRadius / maxShockwaveRadius);

            ctx.save();
            ctx.beginPath();
            ctx.arc(originX, originY, shockwaveRadius, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1, 16 * shockwaveAlpha);
            ctx.strokeStyle = `rgba(254, 240, 138, ${shockwaveAlpha * 0.9})`;
            ctx.shadowColor = 'rgba(245, 158, 11, 0.9)';
            ctx.shadowBlur = 25;
            ctx.stroke();

            // Inner secondary flame ring
            ctx.beginPath();
            ctx.arc(originX, originY, Math.max(0, shockwaveRadius - 22), 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1, 7 * shockwaveAlpha);
            ctx.strokeStyle = `rgba(249, 115, 22, ${shockwaveAlpha * 0.65})`;
            ctx.stroke();
            ctx.restore();
          }

          let aliveCount = 0;

          // Render & update exploding word debris
          for (let i = 0; i < wordFragments.length; i++) {
            const wf = wordFragments[i];
            if (wf.alpha <= 0.01) continue;
            aliveCount++;

            wf.x += wf.vx;
            wf.y += wf.vy;
            wf.vx *= 0.96;
            wf.vy = wf.vy * 0.96 + 0.12;
            wf.angle += wf.vRot;
            wf.alpha -= wf.decay;
            wf.scale = Math.max(0.2, wf.scale * 0.985);

            ctx.save();
            ctx.translate(wf.x, wf.y);
            ctx.rotate(wf.angle);
            ctx.scale(wf.scale, wf.scale);

            // Flaming incinerated text styling
            ctx.font = 'bold 20px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(239, 68, 68, 0.95)';
            ctx.shadowBlur = 14;
            ctx.fillStyle = `rgba(254, 240, 138, ${Math.max(0, wf.alpha)})`;
            ctx.fillText(wf.text, 0, 0);

            // Fiery outline
            ctx.strokeStyle = `rgba(234, 88, 12, ${Math.max(0, wf.alpha * 0.85)})`;
            ctx.lineWidth = 1.5;
            ctx.strokeText(wf.text, 0, 0);
            ctx.restore();
          }

          // Render & update particles
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (p.alpha <= 0.01) continue;
            aliveCount++;

            p.x += p.vx;
            p.y += p.vy;
            p.vx *= p.drag;
            p.vy = p.vy * p.drag + p.gravity;
            p.alpha -= p.decay;

            ctx.save();
            if (p.type === 'spark') {
              ctx.strokeStyle = p.color;
              ctx.lineWidth = p.size;
              ctx.globalAlpha = Math.max(0, p.alpha);
              ctx.shadowColor = p.color;
              ctx.shadowBlur = 8;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
              ctx.stroke();
            } else if (p.type === 'ember') {
              ctx.fillStyle = p.color;
              ctx.globalAlpha = Math.max(0, p.alpha);
              ctx.shadowColor = p.color;
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
            } else {
              p.size += 0.4;
              ctx.fillStyle = `${p.color}${Math.max(0, p.alpha)})`;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }

          if (aliveCount > 0 || shockwaveAlpha > 0.02) {
            explosionAnimRef.current = requestAnimationFrame(renderFrame);
          } else {
            ctx.clearRect(0, 0, width, height);
            explosionAnimRef.current = null;
          }
        };

        explosionAnimRef.current = requestAnimationFrame(renderFrame);
      }
    }

    // Schedule aftermath purge & cooldown after 1600ms
    if (explosionTimerRef.current) clearTimeout(explosionTimerRef.current);
    explosionTimerRef.current = window.setTimeout(() => {
      // Emergency thermal purge — releases core heat down to safe nominal 65°C
      tempRef.current = 65.0;
      setDisplayTemp(65.0);
      isExplodingRef.current = false;
      setIsExploding(false);
      if (explosionCanvasRef.current) {
        const ctx = explosionCanvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
      explosionTimerRef.current = null;
    }, 1600);
  }, []);

  // ─── PHYSICS DISPOSE ─────────────────────────────────────────────────────
  const disposePhysics = useCallback(() => {
    activeBodiesRef.current = [];
    if (renderRef.current) {
      Matter.Render.stop(renderRef.current);
      renderRef.current = null;
    }
    if (runnerRef.current) {
      Matter.Runner.stop(runnerRef.current);
      runnerRef.current = null;
    }
    if (engineRef.current) {
      Matter.World.clear(engineRef.current.world, false);
      Matter.Engine.clear(engineRef.current);
      engineRef.current = null;
    }
  }, []);

  // ─── REIGNITE ────────────────────────────────────────────────────────────
  const reignite = useCallback((targetTemp = DEFAULT_TEMP) => {
    disposePhysics();
    if (explosionTimerRef.current) {
      clearTimeout(explosionTimerRef.current);
      explosionTimerRef.current = null;
    }
    if (explosionAnimRef.current) {
      cancelAnimationFrame(explosionAnimRef.current);
      explosionAnimRef.current = null;
    }
    isExplodingRef.current = false;
    setIsExploding(false);
    if (explosionCanvasRef.current) {
      const ctx = explosionCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    tempRef.current = clamp(targetTemp, MIN_TEMP, MAX_TEMP);
    setDisplayTemp(tempRef.current);
  }, [disposePhysics]);

  // ─── WEB AUDIO — DISARM ──────────────────────────────────────────────────
  const disarmBellows = useCallback(() => {
    if (audioAnimRef.current) {
      cancelAnimationFrame(audioAnimRef.current);
      audioAnimRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setBellowsArmed(false);
    setBellowsLevel(0);
    setIsBlowing(false);
  }, []);

  // ─── WEB AUDIO — ARM ────────────────────────────────────────────────────
  const armBellows = useCallback(async () => {
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      setBellowsArmed(true);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const analyze = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const pct = Math.round((avg / 255) * 100);
        setBellowsLevel(pct);

        if (avg > BELLOWS_ENERGY_THRESHOLD) {
          setIsBlowing(true);
          const now = performance.now();
          if (now - lastBellowsHeatRef.current > 180) {
            lastBellowsHeatRef.current = now;
            const next = Math.min(MAX_TEMP, Number((tempRef.current + 10.0).toFixed(1)));
            tempRef.current = next;
            setDisplayTemp(next);
            if (next >= MAX_TEMP) {
              triggerExplosion();
            }
          }
          // Fling physics bodies upward
          if (activeBodiesRef.current.length > 0) {
            activeBodiesRef.current.forEach((body) => {
              Matter.Body.applyForce(body, body.position, {
                x: (Math.random() - 0.5) * 0.02,
                y: -(0.03 + Math.random() * 0.035),
              });
            });
          }
        } else {
          setIsBlowing(false);
        }

        audioAnimRef.current = requestAnimationFrame(analyze);
      };

      audioAnimRef.current = requestAnimationFrame(analyze);
    } catch (err) {
      console.error('Bellows microphone arming failed:', err);
      disarmBellows();
    }
  }, [disarmBellows, triggerExplosion]);

  const toggleBellows = useCallback(() => {
    bellowsArmed ? disarmBellows() : armBellows();
  }, [bellowsArmed, disarmBellows, armBellows]);

  // ─── UNMOUNT CLEANUP ─────────────────────────────────────────────────────
  useEffect(() => () => {
    disarmBellows();
    if (explosionTimerRef.current) clearTimeout(explosionTimerRef.current);
    if (explosionAnimRef.current) cancelAnimationFrame(explosionAnimRef.current);
  }, [disarmBellows]);

  // ─── GLOBAL KEYBOARD SHORTCUTS ───────────────────────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      const key = e.key.toUpperCase();
      if (key === 'F') {
        e.preventDefault();
        if (explosionTimerRef.current) clearTimeout(explosionTimerRef.current);
        if (explosionAnimRef.current) cancelAnimationFrame(explosionAnimRef.current);
        isExplodingRef.current = false;
        setIsExploding(false);
        tempRef.current = MIN_TEMP;
        setDisplayTemp(MIN_TEMP);
      } else if (key === 'H') {
        e.preventDefault();
        tempRef.current = MAX_TEMP;
        setDisplayTemp(MAX_TEMP);
        triggerExplosion();
      } else if (key === 'R') {
        e.preventDefault();
        reignite(DEFAULT_TEMP);
      } else if (key === 'B') {
        e.preventDefault();
        replayBoot();
      } else if (key === 'M') {
        e.preventDefault();
        setIsMaximized((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [reignite, triggerExplosion, replayBoot]);

  // ─── KEYSTROKE HEAT INJECTION ─────────────────────────────────────────────
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isFailed) return;
    if (e.shiftKey && ['F', 'H', 'R', 'B', 'M', 'f', 'h', 'r', 'b', 'm'].includes(e.key)) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Backspace', 'Delete'].includes(e.key)) return;
    const next = Math.min(MAX_TEMP, Number((tempRef.current + 3.5).toFixed(1)));
    tempRef.current = next;
    setDisplayTemp(next);
    if (next >= MAX_TEMP) {
      triggerExplosion();
    }
  };

  // ─── MATTER.JS PHYSICS SHATTER ────────────────────────────────────────────
  useEffect(() => {
    if (!isFailed || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.1, scale: 0.001 } });
    engineRef.current = engine;

    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    const render = Matter.Render.create({
      canvas,
      engine,
      options: { width, height, wireframes: false, background: 'transparent' },
    });
    renderRef.current = render;

    const wallOpts: Matter.IBodyDefinition = {
      isStatic: true,
      render: { fillStyle: 'transparent' },
      friction: 0.25,
      restitution: 0.2,
    };

    const wt = 80;
    // Keep floor at 6px above the hazard stripe
    const floorY = height - 6;
    Matter.Composite.add(engine.world, [
      Matter.Bodies.rectangle(width / 2, floorY + wt / 2, width * 2, wt, wallOpts),
      Matter.Bodies.rectangle(-wt / 2, height / 2, wt, height * 2, wallOpts),
      Matter.Bodies.rectangle(width + wt / 2, height / 2, wt, height * 2, wallOpts),
      Matter.Bodies.rectangle(width / 2, -wt / 2, width * 2, wt, wallOpts),
    ]);

    const rawTokens = (
      text.trim() || 'CRITICAL FAILURE // THERMAL COLLAPSE DETECTED // ZERO KELVIN // REIGNITE SYSTEM'
    ).split(/\s+/);

    const containerWidth = Math.min(width * 0.85, 820);
    const startX = (width - containerWidth) / 2;
    const startY = height * 0.32;
    let cx = startX;
    let cy = startY;
    const lineH = 48;
    const wordSpacing = 16;

    const wordBodies = rawTokens.map((word) => {
      const bw = Math.max(word.length * 14, 42);
      const bh = 36;
      if (cx + bw > startX + containerWidth && cx > startX) {
        cx = startX;
        cy += lineH;
      }
      const body = Matter.Bodies.rectangle(cx + bw / 2, cy, bw, bh, {
        restitution: 0.35,
        friction: 0.15,
        frictionAir: 0.01,
        render: { fillStyle: 'transparent' },
        label: word,
      });
      cx += bw + wordSpacing;
      return body;
    });

    activeBodiesRef.current = wordBodies;
    Matter.Composite.add(engine.world, wordBodies);

    // Count entropy loss words
    setEntropyWords((prev) => prev + rawTokens.length);

    // Custom canvas render hook
    Matter.Events.on(render, 'afterRender', () => {
      const ctx = render.context;
      wordBodies.forEach((body) => {
        const { x, y } = body.position;
        const angle = body.angle;
        const label = body.label as string;
        const bw = Math.max(label.length * 14, 42);
        const bh = 36;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Neon-bordered block
        ctx.fillStyle = 'rgba(11, 15, 26, 0.92)';
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.7)';
        ctx.lineWidth = 1.5;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 4);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
          ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
        }

        // Cyan monospace text with glow
        ctx.font = 'bold 15px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = '#67e8f9';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(6, 182, 212, 0.85)';
        ctx.shadowBlur = 8;
        ctx.fillText(label, 0, 1);
        ctx.restore();
      });
    });

    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    return () => { disposePhysics(); };
  }, [isFailed, text, disposePhysics]);

  // ─── DERIVED VISUAL STATES ───────────────────────────────────────────────
  // Status badge
  let statusText = 'THERMAL EQUILIBRIUM NOMINAL';
  let statusBadgeClass = 'border-emerald-500/40 bg-emerald-950/20 text-glow-emerald';
  let statusDotClass = 'bg-emerald-500 animate-pulse';
  let integrityLabel = 'THERMAL EQUILIBRIUM';

  if (isExploding) {
    statusText = '💥 CORE DETONATION // RUNAWAY';
    statusBadgeClass = 'border-red-500/90 bg-red-950/70 text-glow-rose box-glow-rose animate-pulse';
    statusDotClass = 'bg-amber-400 animate-ping';
    integrityLabel = 'CRITICAL THERMAL DETONATION';
  } else if (thermalZone === 'collapse') {
    statusText = 'CRITICAL COLLAPSE';
    statusBadgeClass = 'border-rose-500/60 bg-rose-950/40 text-glow-rose box-glow-rose';
    statusDotClass = 'bg-rose-500 animate-ping';
    integrityLabel = 'CRITICAL CRYO-FRACTURE';
  } else if (thermalZone === 'cold') {
    statusText = 'RAPID COOLING';
    statusBadgeClass = 'border-cyan-500/40 bg-cyan-950/20 text-glow-cyan';
    statusDotClass = 'bg-cyan-400 animate-pulse';
    integrityLabel = 'CRYO-FRACTURE IMMINENT';
  } else if (thermalZone === 'hot') {
    statusText = 'HYPERTHERMIA ACTIVE';
    statusBadgeClass = 'border-amber-500/40 bg-amber-950/20 text-glow-amber';
    statusDotClass = 'bg-amber-400 animate-pulse';
    integrityLabel = 'CRITICAL HYPERTHERMIA';
  }

  // Text color
  let textThemeClass = 'text-slate-100';
  if (isExploding) textThemeClass = 'text-amber-200 text-glow-amber animate-blast-glitch';
  else if (thermalZone === 'hot') textThemeClass = 'text-amber-400 text-glow-amber animate-jitter';
  else if (thermalZone === 'cold' || thermalZone === 'collapse') textThemeClass = 'text-cyan-300 text-glow-cyan';

  // Frost overlay opacity
  const frostOpacity = displayTemp <= 20.0 ? clamp((20.0 - displayTemp) / 20.0, 0, 1) : 0;

  // Heat bloom opacity
  const heatOpacity = displayTemp > 80.0 ? clamp((displayTemp - 80.0) / 40.0, 0, 0.9) : 0;

  // Ambient glow class
  const ambientClass =
    isExploding ? 'ambient-detonation'
    : thermalZone === 'collapse' ? 'ambient-collapse'
    : thermalZone === 'cold' ? 'ambient-cold'
    : thermalZone === 'hot' ? 'ambient-hot'
    : 'ambient-nominal';

  // Enthalpy vector display
  const enthalpySign = deltaT >= 0 ? '+' : '';
  const enthalpyColor =
    deltaT > 2 ? 'text-amber-400' : deltaT < -2 ? 'text-cyan-400' : 'text-slate-400';

  // Entropy loss kJ (fake conversion: each word ≈ 0.043 kJ)
  const entropyKj = (entropyWords * 0.043).toFixed(1);

  // Traffic light thermal coloring
  const tlRedClass = thermalZone === 'collapse' ? 'state-collapse' : '';

  // Dynamic orb scaling based on temperature (0°C to 120°C)
  const coolRatio = clamp(1 - displayTemp / MAX_TEMP, 0, 1);
  const hotRatio = clamp(displayTemp / MAX_TEMP, 0, 1);
  const cyanSize = Math.round(320 + coolRatio * 420);
  const cyanOpacity = (0.12 + coolRatio * 0.35).toFixed(2);
  const amberSize = Math.round(320 + hotRatio * 420);
  const amberOpacity = (0.12 + hotRatio * 0.35).toFixed(2);

  // Dynamic glitch colors for LetterGlitch driven by reactor thermal state
  const glitchColors = useMemo(() => {
    if (isExploding) {
      return ['#450a0a', '#7f1d1d', '#b91c1c', '#ea580c', '#f59e0b'];
    }
    if (thermalZone === 'collapse' || thermalZone === 'cold') {
      return ['#082f49', '#0e7490', '#06b6d4', '#67e8f9', '#22d3ee'];
    }
    if (thermalZone === 'hot') {
      return ['#451a03', '#9a3412', '#c2410c', '#d97706', '#f59e0b'];
    }
    // Nominal: cybernetic deep emerald & cyan
    return ['#022c22', '#064e3b', '#0f766e', '#10b981', '#06b6d4'];
  }, [isExploding, thermalZone]);

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className={`relative w-full h-full min-h-screen overflow-hidden ${ambientClass}`}>
      {/* ── Fixed Full-Screen Cybernetic LetterGlitch Background Mesh (React Bits) ── */}
      <div className="fixed inset-0 w-screen h-screen pointer-events-none z-0 overflow-hidden opacity-30 transition-opacity duration-700" aria-hidden="true">
        <LetterGlitch
          glitchColors={glitchColors}
          glitchSpeed={50}
          centerVignette={true}
          outerVignette={true}
          smooth={true}
          backgroundColor="#05070d"
        />
      </div>

      {/* ── Fixed Ambient GPU Mesh Background (behind dot-grid) ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        {/* Cyan orb at top-left: cooler expands cyan */}
        <div
          className="absolute -top-36 -left-36 rounded-full bg-cyan-500/10 blur-[120px] transition-all duration-700 ease-out"
          style={{
            width: `${cyanSize}px`,
            height: `${cyanSize}px`,
            opacity: Number(cyanOpacity),
            transform: `scale(${1 + coolRatio * 0.25})`,
          }}
        />
        {/* Amber orb at bottom-right: hotter expands amber */}
        <div
          className="absolute -bottom-36 -right-36 rounded-full bg-amber-500/10 blur-[120px] transition-all duration-700 ease-out"
          style={{
            width: `${amberSize}px`,
            height: `${amberSize}px`,
            opacity: Number(amberOpacity),
            transform: `scale(${1 + hotRatio * 0.25})`,
          }}
        />
      </div>

      {/* Engineering Dot-Grid Desktop "Surface" */}
      <div className="dot-grid-desktop relative z-[1]" aria-hidden="true" />

      {/* Full-Screen Ambient Background Glow */}
      <div className={`fixed inset-0 pointer-events-none z-0 transition-all duration-700 ${ambientClass}`} aria-hidden="true" />

      {/* Frost Vignette Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[5] transition-opacity duration-300 frost-overlay"
        style={{
          opacity: frostOpacity,
        }}
        aria-hidden="true"
      />

      {/* Heat Bloom Overlay */}
      {heatOpacity > 0 && (
        <div
          className="fixed inset-0 pointer-events-none z-39 transition-opacity duration-500 heat-bloom-overlay"
          style={{ opacity: heatOpacity }}
          aria-hidden="true"
        />
      )}

      {/* Collapse Vignette */}
      {isFailed && (
        <div className="fixed inset-0 pointer-events-none z-[6] collapse-overlay" aria-hidden="true" />
      )}

      {/* Physics Canvas Layer */}
      {isFailed && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 w-full h-full pointer-events-none z-30"
          aria-hidden="true"
        />
      )}

      {/* Hazard Floor Stripe (always visible during collapse) */}
      {isFailed && <div className="hazard-baseline" aria-hidden="true" />}

      {/* Full-Screen Explosion Flash Overlay */}
      {isExploding && (
        <div className="explosion-flash-overlay" aria-hidden="true" />
      )}

      {/* Dedicated High-Velocity Explosion Particle Canvas */}
      <canvas
        ref={explosionCanvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-[75]"
        aria-hidden="true"
      />

      {/* ════════════════════════════════════════════════════════════
          CINEMATIC BOOT / LOADING SCREEN (TRULY FULL-SCREEN TO ALL 4 CORNERS)
          ════════════════════════════════════════════════════════════ */}
      {!hasLoaded && (
        <div
          onClick={triggerCameraZoom}
          className="fixed inset-0 z-[120] w-screen h-screen flex flex-col justify-between p-4 sm:p-6 md:p-8 select-none cursor-pointer overflow-hidden m-0"
          style={{
            background: 'radial-gradient(ellipse 120% 90% at 50% 50%, rgba(10,14,24,0.96) 0%, rgba(3,5,10,0.99) 100%)',
            backdropFilter: 'blur(30px)',
            transform: isZooming
              ? 'scale(1.75) translateZ(360px)'
              : 'scale(1) translateZ(0)',
            opacity: isZooming ? 0 : 1,
            filter: isZooming ? 'blur(24px)' : 'blur(0px)',
            transition: 'transform 950ms cubic-bezier(0.16, 1, 0.3, 1), opacity 750ms ease-in, filter 850ms ease-in',
            pointerEvents: isZooming ? 'none' : 'auto',
          }}
          aria-label="KineticText System Initialization"
        >
          {/* True 4-Corner Reticles pinned directly to the absolute viewport edges */}
          <div className="absolute top-2 left-2 pointer-events-none flex items-center gap-1.5 font-mono text-[9px] text-cyan-400 font-bold">
            <div className="w-5 h-5 border-t-2 border-l-2 border-cyan-400" />
            <span>[0,0] ORIGIN</span>
          </div>
          <div className="absolute top-2 right-2 pointer-events-none flex items-center gap-1.5 font-mono text-[9px] text-amber-400 font-bold">
            <span>CALIBRATION [MAX,0]</span>
            <div className="w-5 h-5 border-t-2 border-r-2 border-amber-400" />
          </div>
          <div className="absolute bottom-2 left-2 pointer-events-none flex items-center gap-1.5 font-mono text-[9px] text-cyan-400 font-bold">
            <div className="w-5 h-5 border-b-2 border-l-2 border-cyan-400" />
            <span>[0,MAX] ZERO-POINT</span>
          </div>
          <div className="absolute bottom-2 right-2 pointer-events-none flex items-center gap-1.5 font-mono text-[9px] text-amber-400 font-bold">
            <span>TERMINAL [MAX,MAX]</span>
            <div className="w-5 h-5 border-b-2 border-r-2 border-amber-400" />
          </div>

          {/* Ambient blurred orbs in loading screen */}
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-cyan-500/15 blur-[120px] pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-amber-500/15 blur-[120px] pointer-events-none" />

          {/* Subtly animated dot-grid within loading screen */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.15) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          {/* ── TOP DECK (STRETCHED TO TOP CORNERS) ── */}
          <div className="relative z-10 w-full flex items-start justify-between gap-4 pt-4 px-2">
            {/* Top-Left Corner Deck */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 border-t-2 border-l-2 border-cyan-400/80 -mt-1 -ml-1" />
              <div className="flex flex-col gap-0.5 font-mono text-[9px] tracking-wide text-slate-400">
                <span className="font-bold text-cyan-400">SYSTEM // KINETIC-TEXT v2.0</span>
                <span className="text-slate-500">ARCH: ATOMIC_REACT / 64-BIT</span>
                <span className="text-slate-600 hidden sm:inline">KERNEL: THERMODYNAMIC_CORE</span>
              </div>
            </div>

            {/* Top Center Status Ticker */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-[9px] font-mono text-slate-400 tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>REACTOR CALIBRATION IN PROGRESS</span>
            </div>

            {/* Top-Right Corner Deck */}
            <div className="flex items-start justify-end gap-3 text-right">
              <div className="flex flex-col gap-0.5 font-mono text-[9px] tracking-wide text-slate-400">
                <span className="font-bold text-amber-400">TELEMETRY DECK // ACTIVE</span>
                <span className="text-slate-500">SAMPLE RATE: 44.1kHz PCM</span>
                <span className="text-slate-600 hidden sm:inline">LATENCY: 0.16ms</span>
              </div>
              <div className="w-5 h-5 border-t-2 border-r-2 border-cyan-400/80 -mt-1 -mr-1" />
            </div>
          </div>

          {/* ── CENTRAL REACTOR CALIBRATION HUB ── */}
          <div className="relative flex flex-col items-center justify-center z-10 max-w-md w-full my-auto mx-auto">
            {/* Concentric Rotating Cybernetic Calibration Rings */}
            <div className="relative w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center mb-6">
              {/* Outer dashed ring - counter clockwise */}
              <div
                className="absolute inset-0 rounded-full border border-dashed border-cyan-500/35 animate-spin-reverse-slow"
                style={{ borderWidth: '1.5px' }}
              />

              {/* Middle segmented ring with corner brackets - clockwise */}
              <div
                className="absolute inset-4 rounded-full border border-amber-500/40 animate-spin-slow"
                style={{
                  borderStyle: 'solid',
                  borderWidth: '2px',
                  borderTopColor: 'transparent',
                  borderBottomColor: 'transparent',
                }}
              />

              {/* Glowing cyan/amber pulse ring */}
              <div className="absolute inset-8 rounded-full border border-cyan-400/20 bg-cyan-500/[0.04] animate-pulse" />

              {/* Inner Reactor Thermal Core Container */}
              <div className="relative z-10 flex flex-col items-center justify-center p-6 rounded-3xl bg-slate-950/80 border border-white/10 shadow-[0_0_40px_rgba(245,158,11,0.25)] backdrop-blur-xl">
                {/* Glowing Core Flame with Snowflake reflection */}
                <div className="relative mb-2">
                  <Flame className="w-10 h-10 text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.9)] animate-bounce" />
                  <Snowflake className="w-4 h-4 text-cyan-400 absolute -bottom-1 -right-1 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                </div>
                {/* Brand label */}
                <span className="text-[10px] font-mono font-bold tracking-wide uppercase text-slate-400">
                  REACTOR 2.0
                </span>
              </div>
            </div>

            {/* Percentage Readout */}
            <div className="flex items-baseline gap-1 mb-2 font-mono">
              <span className="text-5xl sm:text-6xl font-bold tabular-nums tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500">
                {String(Math.round(loadingProgress)).padStart(2, '0')}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-amber-500/80">
                %
              </span>
            </div>

            {/* High-Tech Progress Bar */}
            <div className="w-full h-2.5 bg-slate-900/90 border border-slate-700/60 rounded-full p-0.5 relative shadow-[0_0_20px_rgba(245,158,11,0.2)] mb-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-150 ease-out bg-gradient-to-r from-cyan-400 via-amber-400 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>

            {/* Status Message */}
            <div className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-wide text-slate-300 uppercase mb-4">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>{loadingStatus}</span>
            </div>

            {/* Diagnostics Bar */}
            <div className="flex items-center gap-2 sm:gap-3 text-[9px] font-mono font-normal tracking-wide text-slate-400 uppercase px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <span>CORE: 75.0°C</span>
              <span>·</span>
              <span>PHYSICS: 60FPS</span>
              <span>·</span>
              <span>AUDIO: 44.1kHz</span>
              <span>·</span>
              <span>CAMERA: 1200px</span>
            </div>
          </div>

          {/* ── BOTTOM DECK (STRETCHED TO BOTTOM CORNERS) ── */}
          <div className="relative z-10 w-full flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 px-2">
            {/* Bottom-Left Corner Deck */}
            <div className="flex items-end gap-3 self-start sm:self-auto">
              <div className="w-5 h-5 border-b-2 border-l-2 border-cyan-400/80 -mb-1 -ml-1" />
              <div className="flex flex-col gap-0.5 font-mono text-[9px] tracking-wide text-slate-400">
                <span className="text-slate-500">THERMAL RANGE: 0.0°C - 120.0°C</span>
                <span className="text-slate-500">CRYO BREATH: 1.8s ACTIVE</span>
                <span className="text-emerald-400 font-bold">STATE: INERTIAL_READY</span>
              </div>
            </div>

            {/* Bottom Center Launch Trigger */}
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-700 bg-slate-900/80 text-slate-300 hover:text-white hover:border-cyan-500/50 transition-all text-[9px] font-mono font-medium tracking-wide uppercase shadow-lg shadow-black/60">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>[ SPACE / CLICK TO LAUNCH ]</span>
            </div>

            {/* Bottom-Right Corner Deck */}
            <div className="flex items-end justify-end gap-3 text-right self-end sm:self-auto">
              <div className="flex flex-col gap-0.5 font-mono text-[9px] tracking-wide text-slate-400">
                <span className="text-slate-500">PERSPECTIVE: 1200px 3D</span>
                <span className="text-slate-500">MATRIX: LETTER_GLITCH</span>
                <span className="text-cyan-400 font-bold">SYSTEM ONLINE</span>
              </div>
              <div className="w-5 h-5 border-b-2 border-r-2 border-cyan-400/80 -mb-1 -mr-1" />
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          3D CAMERA STAGE & ENTERPRISE GLASS TERMINAL WINDOW
          ════════════════════════════════════════════════════════════ */}
      <div
        className={`camera-stage relative z-10 w-full min-h-screen flex items-center justify-center ${
          isMaximized ? 'p-0' : 'p-2 sm:p-4'
        } overflow-hidden`}
        style={{
          perspective: '1200px',
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          className={`terminal-window relative z-50 w-full transition-all duration-300 flex flex-col ${
            isMaximized
              ? 'w-screen h-screen max-w-none rounded-none border-none shadow-none'
              : 'max-w-7xl 2xl:max-w-[96vw] rounded-2xl md:rounded-3xl border border-slate-800/80 shadow-2xl shadow-black/80'
          } overflow-hidden ${
            isExploding ? 'animate-explosion-shake' : isFailed ? 'crt-collapse' : ''
          }`}
          style={{
            maxHeight: isMaximized ? '100vh' : 'calc(100dvh - 1rem)',
            height: isMaximized ? '100vh' : 'calc(100dvh - 1rem)',
            transform: !hasLoaded
              ? isZooming
                ? 'scale(1) translateZ(0) rotateX(0deg)'
                : 'scale(0.85) translateZ(-160px) rotateX(3.5deg)'
              : 'scale(1) translateZ(0)',
            opacity: !hasLoaded ? (isZooming ? 1 : 0.2) : 1,
            filter: !hasLoaded ? (isZooming ? 'blur(0px)' : 'blur(8px)') : 'none',
            transition: !hasLoaded
              ? 'transform 1050ms cubic-bezier(0.16, 1, 0.3, 1), opacity 850ms ease-out, filter 950ms ease-out'
              : 'none',
            transformOrigin: '50% 50%',
          }}
        >
        {/* CRT Scanlines (always present, stronger during collapse) */}
        <div
          className="crt-scanlines"
          style={{ opacity: isFailed ? 0.8 : 0.25 }}
          aria-hidden="true"
        />
        {/* Terminal Vignette */}
        <div className="terminal-vignette" aria-hidden="true" />

        {/* ── macOS Title Bar ───────────────────────────────────────── */}
        <div className="terminal-titlebar flex-shrink-0 bg-slate-950/80 border-b border-white/[0.06] px-4">
          <div className="traffic-lights">
            {/* Red: Reignite / Flush Core */}
            <button
              className={`tl-btn tl-red ${tlRedClass}`}
              onClick={() => reignite(DEFAULT_TEMP)}
              title="Flush Core — Reignite to 75.0°C (Shift+R)"
              aria-label="Flush Core — Reignite thermal reactor"
            />
            {/* Yellow: Freeze toggle */}
            <button
              className="tl-btn tl-yellow"
              onClick={() => {
                tempRef.current = MIN_TEMP;
                setDisplayTemp(MIN_TEMP);
              }}
              title="Force Freeze — 0°C (Shift+F)"
              aria-label="Force Freeze — set temperature to zero"
            />
            {/* Green: Maximize / Stretch to all 4 corners toggle */}
            <button
              className={`tl-btn tl-green ${isMaximized ? 'ring-2 ring-emerald-400/50 scale-110 shadow-[0_0_8px_rgba(40,200,64,0.7)]' : ''}`}
              onClick={() => setIsMaximized((prev) => !prev)}
              title={isMaximized ? 'Restore Window Size (Shift+M)' : 'Maximize / Stretch to All Four Corners (Shift+M)'}
              aria-label={isMaximized ? 'Restore window size' : 'Maximize terminal window to all four corners'}
            />
          </div>

          <span className="terminal-title-text font-mono text-[11px] text-slate-400/90 flex items-center gap-2" aria-label="Terminal window title">
            <svg className="w-3 h-3 text-amber-400 shrink-0" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="28" stroke="#38bdf8" strokeWidth="4" opacity="0.4" />
              <path d="M 18,18 A 20,20 0 0,1 46,18" stroke="#f59e0b" strokeWidth="6" strokeLinecap="round" />
              <path d="M 46,46 A 20,20 0 0,1 18,46" stroke="#06b6d4" strokeWidth="6" strokeLinecap="round" />
              <path d="M 24,19 L 24,45 M 24,32 L 39,19 M 29,28 L 41,45" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>KineticText // Thermodynamic Reactor — 120×40</span>
          </span>
        </div>

        {/* ── Reactor HUD Header (Top Telemetry Deck) ────────────────── */}
        <header className="relative z-10 flex-shrink-0 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 backdrop-blur-xl border-b border-white/10 shadow-lg">
          {/* LEFT: Brand + Digital Gauge + Segmented Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Brand */}
            <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.09] hover:border-amber-500/40 rounded-xl px-2.5 py-1.5 backdrop-blur-md shadow-sm transition-colors" aria-label="KineticText — Thermodynamic Reactor System">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="32" r="28" stroke="#334155" strokeWidth="3" opacity="0.6" />
                <path d="M 18,18 A 20,20 0 0,1 46,18" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />
                <path d="M 46,46 A 20,20 0 0,1 18,46" stroke="#06b6d4" strokeWidth="5" strokeLinecap="round" />
                <path d="M 24,19 L 24,45 M 24,32 L 39,19 M 29,28 L 41,45" stroke="#fde047" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="32" cy="32" r="2" fill="#ffffff" />
              </svg>
              <h1 className="text-[11px] font-mono font-bold tracking-wide uppercase text-slate-100">
                KineticText
              </h1>
            </div>

            <div className="w-px h-4 bg-slate-800/80" aria-hidden="true" />

            {/* Core Temperature Gauge */}
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-1.5 backdrop-blur-md">
              <Flame
                className={`w-3.5 h-3.5 transition-colors duration-200 ${
                  thermalZone === 'hot'
                    ? 'text-amber-400'
                    : 'text-slate-600 opacity-40'
                }`}
                aria-hidden="true"
              />
              <div
                className="flex flex-col items-start"
                role="status"
                aria-label={`Core temperature: ${fmt(displayTemp)} degrees Celsius`}
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="text-[9px] font-mono font-medium uppercase tracking-wide text-slate-400 leading-none">
                  Core Temp
                </span>
                <span
                  className={`text-xl font-mono font-bold tabular-nums leading-tight tracking-tight transition-colors duration-200 ${
                    thermalZone === 'hot'
                      ? 'text-amber-400'
                      : thermalZone === 'cold' || thermalZone === 'collapse'
                      ? 'text-cyan-400'
                      : 'text-slate-100'
                  }`}
                >
                  {fmt(displayTemp)}°C
                </span>
              </div>
              <Snowflake
                className={`w-3.5 h-3.5 transition-colors duration-200 ${
                  thermalZone === 'cold' || thermalZone === 'collapse'
                    ? 'text-cyan-400'
                    : 'text-slate-600 opacity-40'
                }`}
                aria-hidden="true"
              />
            </div>

            {/* Segmented Thermal Bar */}
            <div className="flex flex-col gap-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-1.5 backdrop-blur-md justify-center">
              <span className="text-[9px] font-mono font-medium uppercase tracking-wide text-slate-400 leading-none">
                Thermal Load
              </span>
              <SegmentedThermalBar temp={displayTemp} />
            </div>

            {/* Enthalpy Vector */}
            <div
              className="flex flex-col items-start bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-1.5 backdrop-blur-md"
              aria-label={`Enthalpy vector: ${enthalpySign}${fmt(Math.abs(deltaT))} degrees Celsius per second`}
            >
              <span className="text-[9px] font-mono font-medium uppercase tracking-wide text-slate-400 leading-none">
                ΔT/sec
              </span>
              <span className={`text-sm font-mono font-medium tabular-nums tracking-tight transition-colors duration-200 ${enthalpyColor}`}>
                {enthalpySign}{fmt(Math.abs(deltaT))}°/s
              </span>
            </div>
          </div>

          {/* CENTER: System Integrity Status Pill (The Singular Colored Glow) */}
          <div
            key={thermalZone}
            className={`status-pill-enter flex items-center gap-2 px-3.5 py-1.5 rounded-xl border bg-white/[0.03] border-white/[0.08] backdrop-blur-md text-[11px] font-mono font-bold tracking-wide uppercase ${statusBadgeClass}`}
            role="status"
            aria-live="assertive"
            aria-label={`System status: ${integrityLabel}`}
          >
            <div className={`w-2 h-2 rounded-full ${statusDotClass}`} aria-hidden="true" />
            <span>{integrityLabel}</span>
          </div>

          {/* RIGHT: Magnetic Buttons (Bellows VU Meter + Reignite) */}
          <div className="flex items-center gap-3">
            {/* Magnetic Bellows Button */}
            <MagneticButton
              onClick={toggleBellows}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-md text-[10px] font-mono font-medium tracking-wide uppercase transition-all ${
                bellowsArmed
                  ? isBlowing
                    ? 'bg-amber-950/60 border-amber-500/70 text-amber-300'
                    : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400'
                  : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/20'
              }`}
              title={bellowsArmed ? 'Disarm Bellows Mic' : 'Arm Bellows Mic (Acoustic Energy Input)'}
              aria-label={bellowsArmed ? 'Bellows armed — click to disarm' : 'Arm acoustic bellows microphone'}
              aria-pressed={bellowsArmed}
            >
              {bellowsArmed ? (
                <>
                  {isBlowing ? (
                    <Wind className="w-3 h-3 text-amber-400 animate-spin" aria-hidden="true" />
                  ) : (
                    <Mic className="w-3 h-3 text-emerald-400 animate-pulse" aria-hidden="true" />
                  )}
                  <BellowsVuMeter level={bellowsLevel} armed={bellowsArmed} blowing={isBlowing} />
                  <span>{isBlowing ? 'TURBULENCE' : 'ARMED'}</span>
                </>
              ) : (
                <>
                  <MicOff className="w-3 h-3 text-slate-500" aria-hidden="true" />
                  <span>Bellows</span>
                </>
              )}
            </MagneticButton>

            {/* Magnetic Reignite Button */}
            <MagneticButton
              onClick={() => reignite(DEFAULT_TEMP)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-medium uppercase tracking-wide rounded-xl transition-all ${
                isFailed
                  ? 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-600/50'
                  : 'bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] hover:border-white/20'
              }`}
              title="Reignite thermal core to 75.0°C (Shift+R)"
              aria-label="Reignite reactor — restore thermal core to 75 degrees"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Reignite</span>
            </MagneticButton>
          </div>
        </header>

        {/* ── Main Reactor Canvas ───────────────────────────────────── */}
        <main className="relative z-10 flex-1 w-full flex overflow-hidden bg-slate-950/75">

          {/* Line Gutter with Fake Energy Telemetry */}
          <aside
            className="flex-shrink-0 flex flex-col py-10 pl-2 pr-4 mr-6 border-r border-slate-800/60 overflow-hidden select-none"
            style={{ width: 68, background: 'rgba(6, 9, 16, 0.88)' }}
            aria-label="Line telemetry gutter"
            aria-hidden="true"
          >
            {gutterEnergy.map((energy, i) => (
              <div key={i} className="gutter-line flex flex-col items-end leading-none mb-[0.75em] text-slate-600">
                <span className="text-[10px] font-mono text-slate-600">L{String(i + 1).padStart(2, '0')}</span>
                <span className="gutter-energy text-[8px] font-mono text-slate-600/70">J:{energy.toFixed(1)}</span>
              </div>
            ))}
          </aside>

          {/* Typing Canvas */}
          <div className="flex-1 relative flex flex-col px-6 py-10">

            {/* Explosion / Detonation Warning Banner */}
            {isExploding && (
              <div
                className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-red-800/80 bg-red-950/70 text-red-200 font-mono font-medium text-[11px] tracking-wide uppercase"
                role="alert"
                aria-live="assertive"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-300" aria-hidden="true" />
                  <span>
                    💥 CRITICAL DETONATION DETECTED // 120.0°C THRESHOLD BREACHED — PURGING CORE
                  </span>
                </div>
                <span
                  className="px-2 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-500/40 font-mono font-normal text-[9px]"
                >
                  VENTING
                </span>
              </div>
            )}

            {/* Absolute Zero Recovery & Shortcuts HUD Popup */}
            {isFailed && (
              <div
                className="mb-6 flex flex-col items-center justify-center p-5 sm:p-6 rounded-2xl border-2 border-cyan-400 bg-slate-950 shadow-[0_0_60px_rgba(0,0,0,0.95),0_0_30px_rgba(6,182,212,0.35)] relative z-50 max-w-xl mx-auto w-full animate-in fade-in zoom-in-95 duration-200 select-auto"
                style={{
                  filter: 'none',
                  WebkitFilter: 'none',
                  backdropFilter: 'none',
                  WebkitBackdropFilter: 'none',
                }}
                role="dialog"
                aria-label="Absolute Zero Recovery Console"
              >
                {/* Header with Cryo-fracture alert */}
                <div className="flex items-center gap-2.5 mb-2 text-cyan-300 font-mono font-bold text-xs sm:text-sm tracking-wide uppercase">
                  <Snowflake className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} aria-hidden="true" />
                  <span>CORE CRYO-FRACTURE // 0.0 KELVIN REACHED</span>
                  <Snowflake className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} aria-hidden="true" />
                </div>
                
                <p className="text-[11px] font-mono text-slate-300 text-center mb-5 leading-relaxed">
                  Thermal mass depleted. Words frozen into rigid bodies. Reignite core or engage acoustic bellows.
                </p>

                {/* Primary Action Row: Reignite + Bellows Mic */}
                <div className="flex items-center justify-center gap-3 w-full mb-5 flex-wrap">
                  {/* Primary Reignite Button */}
                  <button
                    onClick={() => reignite(DEFAULT_TEMP)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs font-bold tracking-wide uppercase bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    title="Reignite thermal core to 75.0°C (Shift+R)"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-950" aria-hidden="true" />
                    <span>Reignite Core</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-black/25 text-slate-900 text-[10px] font-mono font-semibold">
                      Shift+R
                    </kbd>
                  </button>

                  {/* Bellows Toggle Button with tiny Mic icon */}
                  <button
                    onClick={toggleBellows}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold tracking-wide uppercase border transition-all cursor-pointer ${
                      bellowsArmed
                        ? isBlowing
                          ? 'bg-amber-950 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                          : 'bg-emerald-950 border-emerald-500/80 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
                    }`}
                    title={bellowsArmed ? 'Disarm Bellows Mic' : 'Arm Bellows Mic — Blow to generate heat'}
                  >
                    {bellowsArmed ? (
                      isBlowing ? (
                        <Wind className="w-3.5 h-3.5 text-amber-400 animate-spin" aria-hidden="true" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" aria-hidden="true" />
                      )
                    ) : (
                      <Mic className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    )}
                    <span>{bellowsArmed ? (isBlowing ? 'Turbulence' : 'Bellows Armed') : 'Arm Bellows'}</span>
                    <span className="text-[9px] text-cyan-300/90 font-normal">(+10°C)</span>
                  </button>
                </div>

                {/* Shortcuts Cheatsheet Grid */}
                <div className="w-full pt-3 border-t border-slate-800">
                  <div className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mb-2 text-center">
                    Emergency Shortcuts Matrix
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-left">
                    {[
                      { key: 'Shift+R', label: 'Reignite Core (75°C)' },
                      { key: 'Blow Mic', label: 'Acoustic Bellows (+10°)' },
                      { key: 'Shift+H', label: 'Force Meltdown (120°C)' },
                      { key: 'Shift+F', label: 'Trigger Zero Kelvin' },
                      { key: 'Shift+B', label: 'Replay Boot Diagnostics' },
                      { key: 'Shift+M', label: isMaximized ? 'Restore Viewport' : 'Maximize All Corners' },
                    ].map(({ key, label }) => (
                      <div
                        key={key}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
                      >
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-mono text-[9px] font-semibold shrink-0">
                          {key}
                        </kbd>
                        <span className="text-[9px] font-mono text-slate-300 truncate">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Dot-grid within content area */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(100,116,139,0.06) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}
              aria-hidden="true"
            />

            {/* Editor Surface with strictly inline block cursor */}
            <div
              className={`relative w-full flex-1 flex flex-col font-mono tracking-tight text-slate-100 ${
                isFailed ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              onClick={() => textareaRef.current?.focus()}
            >
              {/* Visual Display Layer with strictly inline cursor */}
              <div
                ref={editorDisplayRef}
                className={`w-full flex-1 min-h-[240px] text-2xl md:text-3xl leading-relaxed whitespace-pre-wrap break-words pointer-events-none select-none font-mono tracking-tight transition-all duration-200 ${textThemeClass}`}
                aria-hidden="true"
              >
                {text ? (
                  <>
                    <span>{text.slice(0, Math.min(Math.max(0, caretPosition), text.length))}</span>
                    {!isFailed && (
                      <span
                        className={`phosphor-cursor inline-block ${
                          thermalZone === 'hot'
                            ? 'text-amber-400'
                            : thermalZone === 'cold' || thermalZone === 'collapse'
                            ? 'text-cyan-400'
                            : 'text-slate-300'
                        }`}
                        style={{
                          '--cursor-blink-ms': `${cursorBlinkMs}ms`,
                        } as React.CSSProperties}
                      >
                        █
                      </span>
                    )}
                    <span>{text.slice(Math.min(Math.max(0, caretPosition), text.length))}</span>
                  </>
                ) : (
                  <>
                    {!isFailed && (
                      <span
                        className={`phosphor-cursor inline-block mr-1.5 ${
                          thermalZone === 'hot'
                            ? 'text-amber-400'
                            : thermalZone === 'cold' || thermalZone === 'collapse'
                            ? 'text-cyan-400'
                            : 'text-slate-300'
                        }`}
                        style={{
                          '--cursor-blink-ms': `${cursorBlinkMs}ms`,
                        } as React.CSSProperties}
                      >
                        █
                      </span>
                    )}
                    <span className="text-slate-700/60 select-none">
                      {isExploding
                        ? '💥 CRITICAL DETONATION: TEXT INCINERATED IN MELTDOWN...'
                        : isFailed
                        ? 'SYSTEM COLLAPSED. ZERO KELVIN REACHED.'
                        : detonationCount > 0 && !text
                        ? 'CORE RE-STABILIZED AT 65°C. DATA INCINERATED. TYPE TO RE-IGNITE...'
                        : 'TYPE TO GENERATE THERMAL ENERGY...'}
                    </span>
                  </>
                )}
              </div>

              {/* Underlying Transparent Textarea for true typing, selection, and keyboard handling */}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  textRef.current = e.target.value;
                  setCaretPosition(e.target.selectionStart ?? e.target.value.length);
                }}
                onSelect={(e) => {
                  setCaretPosition(e.currentTarget.selectionStart ?? text.length);
                }}
                onKeyUp={(e) => {
                  setCaretPosition(e.currentTarget.selectionStart ?? text.length);
                }}
                onClick={(e) => {
                  setCaretPosition(e.currentTarget.selectionStart ?? text.length);
                }}
                onScroll={(e) => {
                  if (editorDisplayRef.current) {
                    editorDisplayRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
                onKeyDown={handleTextareaKeyDown}
                disabled={isFailed}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent border-none outline-none resize-none text-2xl md:text-3xl leading-relaxed font-mono tracking-tight selection:bg-cyan-500/25 selection:text-transparent"
                style={{
                  caretColor: 'transparent',
                  minHeight: '240px',
                }}
                spellCheck="false"
                autoFocus
                aria-label="Thermal reactor text input — type to inject thermal energy"
                aria-describedby="thermal-status-description"
              />

              {/* Hidden description for screen readers */}
              <span id="thermal-status-description" className="sr-only">
                Current temperature is {fmt(displayTemp)} degrees Celsius. {statusText}.
              </span>
            </div>
          </div>
        </main>

        {/* ── Mission Control Footer ───────────────────────────────── */}
        <footer className="relative z-10 flex-shrink-0 px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/80 backdrop-blur-xl border-t border-white/10 shadow-lg">
          {/* Left: Decay Rates + Graveyard Scrubber */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.08] rounded-xl px-2.5 py-1 backdrop-blur-md" aria-label="Thermal energy rates">
              <Zap className="w-3 h-3 text-slate-500" aria-hidden="true" />
              <span className="text-[10px] font-mono font-normal tracking-wide uppercase text-slate-400">
                Decay: -6.0°C/400ms · Type: +3.5°C · Bellows: +10.0°C
              </span>
            </div>

            {/* Graveyard Scrubber */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md"
              aria-label={`Entropy loss: ${entropyWords} words, ${entropyKj} kilojoules`}
              aria-live="polite"
            >
              <Activity className="w-3 h-3 text-slate-500" aria-hidden="true" />
              <span className="text-[10px] font-mono font-normal tracking-wide uppercase text-slate-400">
                ENTROPY LOSS: {entropyWords} WORDS / {entropyKj} kJ
              </span>
            </div>

            {/* Detonations Pill (flat/unglowed by default) */}
            {detonationCount > 0 && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-red-800/40 bg-red-950/40 backdrop-blur-md text-rose-300/90 font-mono font-normal text-[10px] tracking-wide uppercase"
                aria-label={`Detonations: ${detonationCount}`}
              >
                <Flame className="w-3 h-3 text-rose-400" aria-hidden="true" />
                <span>
                  DETONATIONS: {detonationCount}
                </span>
              </div>
            )}

            {/* Hardware Telemetry Pill */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md"
              aria-label="Hardware telemetry information"
            >
              <span className="text-[10px] font-mono font-normal tracking-wide uppercase text-slate-500">
                SR: 44.1kHz · BUF: UTF-8/ATOMIC
              </span>
            </div>
          </div>

          {/* Right: Keycap Legend + Entropy Sparkline */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Entropy Drift Sparkline */}
            <EntropySparkline history={tempHistory} />

            {/* Physical Keycap Shortcuts */}
            <div
              className="flex items-center gap-2 flex-wrap"
              aria-label="Keyboard shortcuts"
            >
              {[
                { key: 'Shift+F', label: 'FREEZE' },
                { key: 'Shift+H', label: 'DETONATE' },
                { key: 'Shift+R', label: 'FLUSH' },
                { key: 'Shift+B', label: 'BOOT' },
                { key: 'Shift+M', label: isMaximized ? 'RESTORE' : 'MAX' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-1.5" aria-label={`${key}: ${label}`}>
                  <kbd className="keycap bg-slate-800/90 border border-slate-600 text-slate-200 rounded-md shadow-sm">
                    {key}
                  </kbd>
                  <span className="text-[9px] font-mono font-normal tracking-wide uppercase text-slate-400">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  </div>
  );
}

export default App;
