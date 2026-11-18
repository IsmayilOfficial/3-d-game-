import { MinimapState } from '../game/types';

interface MinimapProps {
  minimap: MinimapState;
}

const RADAR_SIZE = 136;
const HALF_WORLD_SPAN = 52; // 104m x 104m window centered on the player

export function Minimap({ minimap }: MinimapProps) {
  const { playerX, playerZ, playerYaw, trackRects, checkpoints } = minimap;

  // Player-centered viewBox in world (X, Z) coordinates
  const vbMinX = playerX - HALF_WORLD_SPAN;
  const vbMinZ = playerZ - HALF_WORLD_SPAN;
  const vbSpan = HALF_WORLD_SPAN * 2;

  // In Three.js world space, yaw = PI faces -Z (UP in SVG -Y)
  const headingDeg = (Math.atan2(Math.sin(playerYaw), -Math.cos(playerYaw)) * 180) / Math.PI;

  // First uncleared checkpoint is the primary navigation target
  const nextCheckpoint = checkpoints.find((cp) => !cp.cleared) ?? checkpoints[checkpoints.length - 1];
  let edgeMarker: { x: number; y: number; angleDeg: number; distMeters: number; isFinish: boolean } | null = null;

  if (nextCheckpoint) {
    const dx = nextCheckpoint.x - playerX;
    const dz = nextCheckpoint.z - playerZ;
    const distMeters = Math.round(Math.hypot(dx, dz));
    const margin = 4.5;
    const clampLimit = HALF_WORLD_SPAN - margin;

    if (Math.abs(dx) > clampLimit || Math.abs(dz) > clampLimit) {
      const scale = clampLimit / Math.max(Math.abs(dx), Math.abs(dz));
      edgeMarker = {
        x: playerX + dx * scale,
        y: playerZ + dz * scale,
        angleDeg: (Math.atan2(dx, -dz) * 180) / Math.PI,
        distMeters,
        isFinish: nextCheckpoint.isFinish,
      };
    }
  }

  return (
    <div className="pointer-events-none flex flex-col items-end gap-1">
      <div className="relative overflow-hidden rounded-xl border border-slate-400/25 bg-slate-950/48 shadow-lg">
        {/* Corner Compass & Next Gate Distance Header */}
        <div className="flex items-center justify-between border-b border-slate-400/15 px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase">
          <span className="text-sky-300/90">RADAR</span>
          {nextCheckpoint && (
            <span className="text-amber-300/95 tabular-nums">
              {nextCheckpoint.isFinish ? 'FINISH' : `GATE ${nextCheckpoint.index + 1}`} ·{' '}
              {Math.round(Math.hypot(nextCheckpoint.x - playerX, nextCheckpoint.z - playerZ))}M
            </span>
          )}
        </div>

        <svg
          width={RADAR_SIZE}
          height={RADAR_SIZE}
          viewBox={`${vbMinX} ${vbMinZ} ${vbSpan} ${vbSpan}`}
          className="block"
          aria-label="2D Track Mini-Map"
        >
          {/* Subtle distance rings centered on player */}
          <circle
            cx={playerX}
            cy={playerZ}
            r={24}
            fill="none"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth={0.8}
            strokeDasharray="2 2"
          />
          <circle
            cx={playerX}
            cy={playerZ}
            r={44}
            fill="none"
            stroke="rgba(148, 163, 184, 0.12)"
            strokeWidth={0.8}
          />

          {/* Track decks, ramps, and live moving bridges */}
          {trackRects.map((rect, idx) => {
            const w = rect.maxX - rect.minX;
            const h = rect.maxZ - rect.minZ;
            const fill =
              rect.kind === 'moving'
                ? 'rgba(245, 158, 11, 0.58)'
                : rect.kind === 'ramp'
                  ? 'rgba(56, 189, 248, 0.42)'
                  : 'rgba(148, 163, 184, 0.34)';
            const stroke =
              rect.kind === 'moving'
                ? 'rgba(253, 186, 116, 0.85)'
                : rect.kind === 'ramp'
                  ? 'rgba(125, 211, 252, 0.65)'
                  : 'rgba(226, 232, 240, 0.38)';
            return (
              <rect
                key={idx}
                x={rect.minX}
                y={rect.minZ}
                width={w}
                height={h}
                rx={1.2}
                fill={fill}
                stroke={stroke}
                strokeWidth={0.7}
              />
            );
          })}

          {/* Checkpoints */}
          {checkpoints.map((cp) => {
            const isNext = nextCheckpoint && cp.index === nextCheckpoint.index && !cp.cleared;
            const fill = cp.cleared
              ? '#22c55e'
              : cp.isFinish
                ? '#fbbf24'
                : '#38bdf8';
            return (
              <g key={cp.index} transform={`translate(${cp.x}, ${cp.z})`}>
                {isNext && (
                  <circle
                    r={5.2}
                    fill="none"
                    stroke={cp.isFinish ? '#fbbf24' : '#38bdf8'}
                    strokeWidth={1.1}
                    strokeOpacity={0.85}
                  />
                )}
                {cp.isFinish ? (
                  <polygon
                    points="0,-3.4 3.4,0 0,3.4 -3.4,0"
                    fill={fill}
                    stroke="#0f172a"
                    strokeWidth={0.8}
                  />
                ) : (
                  <circle
                    r={isNext ? 2.8 : 2.2}
                    fill={fill}
                    fillOpacity={cp.cleared ? 0.6 : 0.95}
                    stroke="#0f172a"
                    strokeWidth={0.7}
                  />
                )}
              </g>
            );
          })}

          {/* Edge-clamped directional indicator if next checkpoint is outside radar */}
          {edgeMarker && (
            <g transform={`translate(${edgeMarker.x}, ${edgeMarker.y}) rotate(${edgeMarker.angleDeg})`}>
              <polygon
                points="0,-4.2 3.2,2.8 0,1.2 -3.2,2.8"
                fill={edgeMarker.isFinish ? '#fbbf24' : '#38bdf8'}
                stroke="#0f172a"
                strokeWidth={0.7}
              />
            </g>
          )}

          {/* Player Car Directional Chevron */}
          <g transform={`translate(${playerX}, ${playerZ}) rotate(${headingDeg})`}>
            <polygon
              points="0,-4.8 3.6,3.8 0,1.8 -3.6,3.8"
              fill="#f97316"
              stroke="#ffffff"
              strokeWidth={0.9}
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
