import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CloudFog,
  CloudRain,
  Ghost,
  Pause,
  Play,
  RotateCcw,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Minimap } from './components/Minimap';
import { Speedometer } from './components/Speedometer';
import { StriderGameEngine } from './game/engine';
import { HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  elapsedTime: 0,
  bestTime: null,
  bestLapTime: null,
  currentLapTime: 0,
  speed: 0,
  currentLap: 1,
  totalLaps: 3,
  circuitsCompleted: 0,
  checkpointIndex: 0,
  totalCheckpoints: 7,
  orbsCollected: 0,
  totalOrbs: 18,
  health: 3,
  maxHealth: 3,
  dashCooldownRatio: 0,
  score: 0,
  combo: 0,
  comboMultiplier: 1,
  comboTimerRatio: 0,
  comboEventLabel: '',
  bestCombo: 0,
  sectorName: 'SECTOR 1 · START PLAZA',
  weather: 'clear',
  muted: false,
  cameraMode: 'dynamic',
  ghostAvailable: false,
  ghostEnabled: true,
  minimap: {
    playerX: 0,
    playerZ: 12,
    playerYaw: Math.PI,
    trackRects: [],
    checkpoints: [],
  },
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(
    hundredths,
  ).padStart(2, '0')}`;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<StriderGameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    try {
      const engine = new StriderGameEngine(container, (snapshot) => {
        setHud(snapshot);
      });
      engineRef.current = engine;
      setInitError(null);

      return () => {
        engine.dispose();
        engineRef.current = null;
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to initialize 3D WebGL context.';
      setInitError(message);
      return undefined;
    }
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#9dd5f3] font-sans text-slate-100 select-none">
      {/* Isolated WebGL Viewport Container */}
      <div ref={mountRef} className="absolute inset-0" />

      {initError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/90 p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
            <h2 className="text-lg font-bold text-white">3D Renderer Unavailable</h2>
            <p className="mt-2 text-xs text-slate-300">{initError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              Reload App
            </button>
          </div>
        </div>
      )}

      {/* TITLE SCREEN OVERLAY */}
      {!initError && hud.phase === 'title' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-10">
          {/* Top-left minimal mute button */}
          <div className="flex items-center justify-between">
            <div className="rounded-lg border border-slate-900/20 bg-slate-950/85 px-3 py-1.5 text-xs font-semibold tracking-wider text-sky-300 uppercase">
              3D Stunt Car &amp; Collision Circuit
            </div>
            <button
              type="button"
              onClick={() => engineRef.current?.toggleMute()}
              aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950/88 text-slate-200 transition-colors hover:border-sky-400 hover:text-sky-300"
            >
              {hud.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          </div>

          {/* Title Lockup over open negative space */}
          <div className="my-auto flex max-w-xl flex-col items-start gap-5">
            <svg
              viewBox="0 0 540 128"
              className="w-full max-w-[480px] drop-shadow-[0_6px_18px_rgba(15,23,42,0.55)]"
              role="img"
              aria-label="APEX STRIDER 3D"
            >
              <defs>
                <linearGradient id="apexGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f8fafc" />
                  <stop offset="55%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
                <linearGradient id="emberGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
              {/* Emblem chevron */}
              <polygon
                points="12,96 42,20 76,20 46,96"
                fill="url(#emberGrad)"
              />
              <polygon
                points="54,96 76,42 98,42 76,96"
                fill="#38bdf8"
              />
              <text
                x="114"
                y="62"
                fill="url(#apexGrad)"
                fontFamily="system-ui, -apple-system, sans-serif"
                fontWeight="900"
                fontStyle="italic"
                fontSize="50"
                letterSpacing="2"
              >
                APEX STRIDER
              </text>
              <rect x="116" y="76" width="290" height="4" rx="2" fill="url(#emberGrad)" />
              <text
                x="116"
                y="102"
                fill="#0f172a"
                fontFamily="system-ui, -apple-system, sans-serif"
                fontWeight="800"
                fontSize="16"
                letterSpacing="4.5"
              >
                CANYON SKYWAY TRIALS · 3D
              </text>
            </svg>

            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => engineRef.current?.startGame()}
                className="flex items-center gap-2.5 rounded-xl bg-amber-500 px-7 py-3.5 text-base font-extrabold tracking-wide text-slate-950 shadow-lg transition-transform hover:scale-[1.03] hover:bg-amber-400 active:scale-[0.98]"
              >
                <Play className="h-5 w-5 fill-slate-950" />
                START RUN
              </button>
            </div>

            {(hud.bestTime !== null || hud.bestLapTime !== null) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/70 bg-slate-950/88 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-amber-300 tabular-nums">
                {hud.bestTime !== null && <span>BEST SUMMIT TIME: {formatTime(hud.bestTime)}</span>}
                {hud.bestTime !== null && hud.bestLapTime !== null && (
                  <span className="text-slate-600" aria-hidden="true">·</span>
                )}
                {hud.bestLapTime !== null && (
                  <span className="text-sky-300">GHOST BEST LAP: {formatTime(hud.bestLapTime)}</span>
                )}
              </div>
            )}
          </div>

          {/* Single flat control-hint line */}
          <div className="flex justify-center">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/88 px-4 py-2 text-center text-xs font-medium tracking-wide text-slate-200">
              WASD / Arrows Drive &nbsp;·&nbsp; Space Jump (Double Jump) &nbsp;·&nbsp; Shift Nitro Boost &nbsp;·&nbsp; Drag / Q-E Camera &nbsp;·&nbsp; Esc Pause
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE GAMEPLAY PERIMETER HUD (>= 85% Playfield Unobstructed) */}
      {hud.phase === 'playing' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
          {/* Top Perimeter Row */}
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left: Integrity + Sector / Checkpoints */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-950/88 px-3.5 py-2">
                {/* Custom SVG Integrity Shields */}
                <div className="flex items-center gap-1.5" aria-label={`Integrity ${hud.health} of ${hud.maxHealth}`}>
                  {Array.from({ length: hud.maxHealth }).map((_, idx) => {
                    const active = idx < hud.health;
                    return (
                      <svg key={idx} viewBox="0 0 24 24" className="h-5 w-5">
                        <polygon
                          points="12,2 21,6.5 21,15.5 12,22 3,15.5 3,6.5"
                          fill={active ? '#f97316' : '#1e293b'}
                          stroke={active ? '#fdba74' : '#475569'}
                          strokeWidth="1.8"
                        />
                      </svg>
                    );
                  })}
                </div>
                <div className="h-4 w-px bg-slate-700" />
                <div className="text-xs font-bold tracking-wider text-sky-300 tabular-nums">
                  GATE {hud.checkpointIndex}/{hud.totalCheckpoints}
                </div>
                <div className="h-4 w-px bg-slate-700" />
                <div className="text-xs font-bold tracking-wider text-emerald-300 tabular-nums">
                  CIRCUITS {hud.circuitsCompleted}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="w-fit rounded-lg border border-slate-800/80 bg-slate-950/82 px-3 py-1 text-[11px] font-bold tracking-widest text-amber-300 uppercase">
                  {hud.sectorName}
                </div>
                <div
                  className={`flex w-fit items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase ${
                    hud.weather === 'rain'
                      ? 'border-sky-400/50 bg-slate-950/88 text-sky-300'
                      : hud.weather === 'fog'
                        ? 'border-slate-400/50 bg-slate-950/88 text-slate-200'
                        : 'border-slate-800/80 bg-slate-950/82 text-slate-300'
                  }`}
                >
                  {hud.weather === 'rain' ? (
                    <>
                      <CloudRain className="h-3.5 w-3.5 text-sky-300" />
                      <span>LIGHT RAIN · WET GRIP</span>
                    </>
                  ) : hud.weather === 'fog' ? (
                    <>
                      <CloudFog className="h-3.5 w-3.5 text-slate-200" />
                      <span>CANYON FOG · DAMP GRIP</span>
                    </>
                  ) : (
                    <>
                      <Sun className="h-3.5 w-3.5 text-amber-300" />
                      <span>CLEAR SKY</span>
                    </>
                  )}
                </div>
                {hud.bestLapTime !== null && (
                  <div className="w-fit rounded-lg border border-slate-800/80 bg-slate-950/82 px-3 py-1 text-[11px] font-bold tracking-wider text-sky-300 tabular-nums uppercase">
                    BEST LAP {formatTime(hud.bestLapTime)}
                    {hud.ghostEnabled ? ' · GHOST ON' : ' · GHOST OFF'}
                  </div>
                )}
              </div>

              {hud.combo > 0 && (
                <div className="w-fit rounded-xl border border-amber-500/50 bg-slate-950/90 px-3.5 py-2 shadow-lg tabular-nums">
                  <div className="flex items-baseline gap-2.5">
                    <span
                      className={`text-2xl leading-none font-black tracking-tight ${
                        hud.comboMultiplier >= 5
                          ? 'text-orange-400'
                          : hud.comboMultiplier >= 3
                            ? 'text-amber-300'
                            : 'text-sky-300'
                      }`}
                    >
                      {hud.comboMultiplier}x
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-extrabold tracking-wider text-amber-300 uppercase">
                        {hud.comboEventLabel || 'COMBO CHAIN'}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {hud.combo} STUNT{hud.combo === 1 ? '' : 'S'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full transition-all duration-75"
                      style={{
                        width: `${Math.round(hud.comboTimerRatio * 100)}%`,
                        backgroundColor: hud.comboMultiplier >= 5 ? '#f97316' : '#f59e0b',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Top-Right: Timer, Current Lap, Orbs, Utility Buttons & Transparent 2D Mini-Map */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-start gap-2.5">
                <div className="flex items-center gap-4 rounded-xl border border-slate-700/80 bg-slate-950/88 px-4 py-2 tabular-nums">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      Time
                    </span>
                    <span className="text-base font-extrabold text-slate-100">
                      {formatTime(hud.elapsedTime)}
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-800" />
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      Current Lap
                    </span>
                    <span className="text-base font-extrabold text-emerald-400">
                      {hud.currentLap}/{hud.totalLaps}
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-800" />
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      Cores
                    </span>
                    <span className="text-base font-extrabold text-amber-400">
                      {hud.orbsCollected}/{hud.totalOrbs}
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-800" />
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      Score
                    </span>
                    <span className="text-base font-extrabold text-sky-300">
                      {hud.score.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleGhost()}
                    title="Toggle Ghost Replay (G)"
                    aria-label={hud.ghostEnabled ? 'Hide ghost replay' : 'Show ghost replay'}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border bg-slate-950/88 transition-colors ${
                      hud.ghostEnabled && hud.ghostAvailable
                        ? 'border-sky-400/80 text-sky-300 hover:border-sky-300'
                        : hud.ghostEnabled
                          ? 'border-slate-700/80 text-slate-200 hover:border-sky-400 hover:text-sky-300'
                          : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    <Ghost className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleCameraMode()}
                    title="Toggle Camera Mode (C)"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/88 text-slate-200 transition-colors hover:border-sky-400 hover:text-sky-300"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.toggleMute()}
                    aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/88 text-slate-200 transition-colors hover:border-sky-400 hover:text-sky-300"
                  >
                    {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => engineRef.current?.pauseGame()}
                    aria-label="Pause game"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/88 text-slate-200 transition-colors hover:border-amber-400 hover:text-amber-300"
                  >
                    <Pause className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <Minimap minimap={hud.minimap} />
            </div>
          </div>

          {/* Bottom Perimeter: Nitro Bar, Controls Hint & Circular Speedometer */}
          <div className="flex items-end justify-between gap-4">
            <div className="hidden w-[128px] shrink-0 md:block" />
            <div className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-950/88 px-4 py-2">
              <span className="text-[11px] font-bold tracking-wider text-sky-300 uppercase">
                Nitro
              </span>
              <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${Math.round((1 - hud.dashCooldownRatio) * 100)}%`,
                    backgroundColor: hud.dashCooldownRatio <= 0.01 ? '#38bdf8' : '#f59e0b',
                  }}
                />
              </div>
              <span className="hidden text-[11px] font-semibold text-slate-400 sm:inline">
                R Respawn &nbsp;·&nbsp; G Ghost &nbsp;·&nbsp; C Cam ({hud.cameraMode === 'chase' ? 'Manual' : 'Auto'}) &nbsp;·&nbsp; Esc Pause
              </span>
            </div>
            <Speedometer speed={hud.speed} />
          </div>
        </div>
      )}

      {/* PAUSE / VICTORY / GAMEOVER MODAL */}
      {(hud.phase === 'paused' || hud.phase === 'victory' || hud.phase === 'gameover') && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/65 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700/90 bg-slate-950/96 p-7 shadow-2xl">
              <div className="mb-5">
                <div className="text-xs font-bold tracking-widest text-amber-400 uppercase">
                  {hud.phase === 'paused'
                    ? 'Simulation Paused'
                    : hud.phase === 'victory'
                      ? 'Circuit Complete'
                      : 'Integrity Depleted'}
                </div>
                <h2 className="mt-1 text-3xl font-black tracking-tight text-white">
                  {hud.phase === 'paused'
                    ? 'RUN PAUSED'
                    : hud.phase === 'victory'
                      ? 'SUMMIT REACHED'
                      : 'SYSTEM CRASH'}
                </h2>
              </div>

              <div className="mb-4 grid grid-cols-4 gap-2 rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 text-center tabular-nums">
                <div>
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Time
                  </div>
                  <div className="mt-0.5 text-base font-bold text-white">
                    {formatTime(hud.elapsedTime)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Current Lap
                  </div>
                  <div className="mt-0.5 text-base font-bold text-emerald-400">
                    {hud.currentLap}/{hud.totalLaps}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Score
                  </div>
                  <div className="mt-0.5 text-base font-bold text-sky-400">
                    {hud.score.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Max Combo
                  </div>
                  <div className="mt-0.5 text-base font-bold text-amber-400">
                    {hud.bestCombo > 0 ? `${Math.min(10, hud.bestCombo)}x` : '—'}
                  </div>
                </div>
              </div>

              {(hud.bestTime !== null || hud.bestLapTime !== null) && (
                <div className="mb-5 flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs font-bold tracking-wide text-amber-300 tabular-nums">
                  {hud.bestTime !== null && <div>PERSONAL BEST CIRCUIT: {formatTime(hud.bestTime)}</div>}
                  {hud.bestLapTime !== null && (
                    <div className="text-sky-300">BEST LAP (GHOST): {formatTime(hud.bestLapTime)}</div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                {hud.phase === 'paused' && (
                  <button
                    type="button"
                    onClick={() => engineRef.current?.resumeGame()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-extrabold tracking-wide text-slate-950 hover:bg-amber-400"
                  >
                    <Play className="h-4 w-4 fill-slate-950" />
                    RESUME RUN
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => engineRef.current?.startGame()}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-extrabold tracking-wide ${
                    hud.phase === 'paused'
                      ? 'border border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-400'
                      : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  }`}
                >
                  <RotateCcw className="h-4 w-4" />
                  {hud.phase === 'paused' ? 'RESTART CIRCUIT' : 'PLAY AGAIN'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
