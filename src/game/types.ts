import * as THREE from 'three';

export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';

export interface MinimapTrackRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  kind: 'deck' | 'ramp' | 'moving';
}

export interface MinimapCheckpoint {
  index: number;
  x: number;
  z: number;
  cleared: boolean;
  isFinish: boolean;
}

export interface MinimapState {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  trackRects: MinimapTrackRect[];
  checkpoints: MinimapCheckpoint[];
}

export interface HudSnapshot {
  phase: GamePhase;
  elapsedTime: number;
  bestTime: number | null;
  speed: number;
  currentLap: number;
  totalLaps: number;
  circuitsCompleted: number;
  checkpointIndex: number;
  totalCheckpoints: number;
  orbsCollected: number;
  totalOrbs: number;
  health: number;
  maxHealth: number;
  dashCooldownRatio: number; // 0 = ready, 1 = cooling down
  combo: number;
  sectorName: string;
  muted: boolean;
  cameraMode: 'chase' | 'dynamic';
  minimap: MinimapState;
}

export interface AabbCollider {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  tag?: 'ground' | 'wall' | 'barrier' | 'pillar' | 'platform' | 'crate';
  bouncy?: number;
}

export interface RampCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  baseY: number;
  topY: number;
  /** Direction of ascent: '+z' | '-z' | '+x' | '-x' */
  direction: '+z' | '-z' | '+x' | '-x';
}

export interface MovingPlatformState {
  id: string;
  mesh: THREE.Group;
  collider: AabbCollider;
  origin: THREE.Vector3;
  axis: 'x' | 'y' | 'z';
  amplitude: number;
  speed: number;
  phaseOffset: number;
  deltaPos: THREE.Vector3;
}

export interface BoostPadZone {
  id: string;
  position: THREE.Vector3;
  halfExtents: THREE.Vector3;
  direction: THREE.Vector3;
  boostSpeed: number;
  mesh: THREE.Group;
  cooldown: number;
}

export interface CheckpointData {
  index: number;
  position: THREE.Vector3;
  rotationY: number;
  radius: number;
  sectorName: string;
  mesh: THREE.Group;
  ringMesh: THREE.Mesh;
  cleared: boolean;
}

export interface CollectibleOrb {
  id: string;
  position: THREE.Vector3;
  mesh: THREE.Group;
  collected: boolean;
  phase: number;
}

export interface HazardEntity {
  id: string;
  type: 'drone' | 'sweeper';
  mesh: THREE.Group;
  position: THREE.Vector3;
  origin: THREE.Vector3;
  patrolAxis: 'x' | 'z';
  patrolRange: number;
  speed: number;
  phase: number;
  radius: number;
  /** Windup state for telegraphing surge */
  telegraphTimer: number;
  windupRing?: THREE.Mesh;
  hitCooldown: number;
}

export interface PushCrate {
  id: string;
  mesh: THREE.Group;
  collider: AabbCollider;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  halfSize: number;
}
