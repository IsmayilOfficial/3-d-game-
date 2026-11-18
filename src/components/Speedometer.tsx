import { useEffect, useRef, useState } from 'react';

interface SpeedometerProps {
  speed: number;
  maxSpeed?: number;
}

const SIZE = 128;
const CX = SIZE / 2;
const CY = SIZE / 2;
const ARC_RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;
const SWEEP_DEG = 240;
const ARC_LENGTH = CIRCUMFERENCE * (SWEEP_DEG / 360);
const START_ANGLE_DEG = -120; // 0° = 12 o'clock

function polarToCartesian(radius: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  };
}

export function Speedometer({ speed, maxSpeed = 120 }: SpeedometerProps) {
  const [displaySpeed, setDisplaySpeed] = useState(speed);
  const targetRef = useRef(speed);
  const currentRef = useRef(speed);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = speed;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      currentRef.current = speed;
      setDisplaySpeed(speed);
      return;
    }

    if (rafRef.current !== null) return;

    let lastTime = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const target = targetRef.current;
      const diff = target - currentRef.current;

      if (Math.abs(diff) < 0.08) {
        currentRef.current = target;
        setDisplaySpeed(target);
        rafRef.current = null;
        return;
      }

      const factor = 1 - Math.exp(-16 * dt);
      currentRef.current += diff * factor;
      setDisplaySpeed(currentRef.current);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [speed]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const ratio = Math.min(1, Math.max(0, displaySpeed / maxSpeed));
  const needleAngle = START_ANGLE_DEG + ratio * SWEEP_DEG;
  const activeArcLength = ARC_LENGTH * ratio;

  // Dynamic accent shift across cruise -> sprint -> nitro/redline
  const activeColor =
    displaySpeed >= 90 ? '#ef4444' : displaySpeed >= 62 ? '#f59e0b' : '#38bdf8';

  const roundedSpeed = Math.round(displaySpeed);

  // Build major (every 20) & minor (every 10) tick geometry
  const ticks = Array.from({ length: 13 }, (_, idx) => {
    const value = idx * 10;
    const tickRatio = value / maxSpeed;
    const angle = START_ANGLE_DEG + tickRatio * SWEEP_DEG;
    const isMajor = value % 20 === 0;
    const isRedline = value >= 90;
    const innerR = isMajor ? 41 : 44;
    const outerR = 47.5;
    const p1 = polarToCartesian(innerR, angle);
    const p2 = polarToCartesian(outerR, angle);
    const labelPos = isMajor ? polarToCartesian(32.5, angle) : null;
    return {
      value,
      isMajor,
      isRedline,
      p1,
      p2,
      labelPos,
    };
  });

  return (
    <div
      className="pointer-events-none relative flex h-[128px] w-[128px] shrink-0 items-center justify-center rounded-full border border-slate-700/85 bg-slate-950/90 shadow-xl"
      role="img"
      aria-label={`Speedometer: ${roundedSpeed} kilometers per hour`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block">
        <defs>
          <radialGradient id="speedoDialGrad" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.65" />
            <stop offset="75%" stopColor="#0f172a" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#020617" stopOpacity="1" />
          </radialGradient>
          <linearGradient id="speedoNeedleGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="55%" stopColor={activeColor} />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>

        {/* Recessed circular dial background */}
        <circle
          cx={CX}
          cy={CY}
          r={57}
          fill="url(#speedoDialGrad)"
          stroke="rgba(148, 163, 184, 0.16)"
          strokeWidth={1}
        />

        {/* Subtle inner bezel ring */}
        <circle
          cx={CX}
          cy={CY}
          r={53}
          fill="none"
          stroke="rgba(56, 189, 248, 0.12)"
          strokeWidth={0.75}
        />

        {/* Base 240-degree sweep track */}
        <circle
          cx={CX}
          cy={CY}
          r={ARC_RADIUS}
          fill="none"
          stroke="rgba(51, 65, 85, 0.72)"
          strokeWidth={5.5}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          transform={`rotate(150 ${CX} ${CY})`}
        />

        {/* Subtle redline band (90 - 120 KM/H = top 25% of arc) */}
        <circle
          cx={CX}
          cy={CY}
          r={ARC_RADIUS}
          fill="none"
          stroke="rgba(239, 68, 68, 0.32)"
          strokeWidth={5.5}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH * 0.25} ${CIRCUMFERENCE}`}
          transform={`rotate(330 ${CX} ${CY})`}
        />

        {/* Active animated velocity arc */}
        {activeArcLength > 0.5 && (
          <circle
            cx={CX}
            cy={CY}
            r={ARC_RADIUS}
            fill="none"
            stroke={activeColor}
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeDasharray={`${activeArcLength} ${CIRCUMFERENCE}`}
            transform={`rotate(150 ${CX} ${CY})`}
          />
        )}

        {/* Scale ticks and major numeric labels */}
        {ticks.map((t) => (
          <g key={t.value}>
            <line
              x1={t.p1.x}
              y1={t.p1.y}
              x2={t.p2.x}
              y2={t.p2.y}
              stroke={
                t.isRedline
                  ? 'rgba(248, 113, 113, 0.85)'
                  : t.isMajor
                    ? 'rgba(226, 232, 240, 0.85)'
                    : 'rgba(148, 163, 184, 0.45)'
              }
              strokeWidth={t.isMajor ? 1.6 : 1}
              strokeLinecap="round"
            />
            {t.labelPos && (
              <text
                x={t.labelPos.x}
                y={t.labelPos.y + 2.6}
                textAnchor="middle"
                fill={t.isRedline ? '#fca5a5' : '#94a3b8'}
                fontSize="7.5"
                fontWeight="700"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {t.value}
              </text>
            )}
          </g>
        ))}

        {/* Tapered animated speedometer needle */}
        <g transform={`rotate(${needleAngle} ${CX} ${CY})`}>
          <polygon
            points={`${CX - 2.3},${CY + 6} ${CX},${CY - 41} ${CX + 2.3},${CY + 6}`}
            fill="url(#speedoNeedleGrad)"
          />
          <circle cx={CX} cy={CY} r={5.5} fill="#0f172a" stroke="#e2e8f0" strokeWidth={1.6} />
          <circle cx={CX} cy={CY} r={2} fill={activeColor} />
        </g>
      </svg>

      {/* Digital speed readout anchored in lower dial cutout */}
      <div className="absolute bottom-2.5 flex flex-col items-center leading-none tabular-nums">
        <span
          className="text-lg font-black tracking-tight"
          style={{ color: displaySpeed >= 90 ? '#fca5a5' : '#f8fafc' }}
        >
          {roundedSpeed}
        </span>
        <span className="mt-0.5 text-[8px] font-bold tracking-widest text-slate-400 uppercase">
          KM/H
        </span>
      </div>
    </div>
  );
}
