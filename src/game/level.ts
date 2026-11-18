import * as THREE from 'three';
import {
  AabbCollider,
  BoostPadZone,
  CheckpointData,
  CollectibleOrb,
  HazardEntity,
  MovingPlatformState,
  PushCrate,
  RampCollider,
} from './types';
import { groundHeightAt } from './physics';
import { ProceduralTextureSet } from './textures';
import {
  createBoostPad,
  createCheckpointGate,
  createCrateMesh,
  createDroneHazard,
  createEnergyOrb,
  createSweeperArm,
} from './models';

export interface BuiltLevel {
  group: THREE.Group;
  staticColliders: AabbCollider[];
  ramps: RampCollider[];
  movingPlatforms: MovingPlatformState[];
  boostPads: BoostPadZone[];
  checkpoints: CheckpointData[];
  orbs: CollectibleOrb[];
  hazards: HazardEntity[];
  crates: PushCrate[];
  initialCratePositions: { x: number; y: number; z: number }[];
  trackMaterial: THREE.MeshStandardMaterial;
  dispose: () => void;
}

function makeRampGeometry(width: number, length: number, height: number): THREE.BufferGeometry {
  // Wedge ascending toward -Z (base at +Z/2, top at -Z/2)
  const hw = width / 2;
  const hl = length / 2;
  const positions = new Float32Array([
    // Top sloped face (2 tris)
    -hw, 0, hl,   hw, 0, hl,   hw, height, -hl,
    -hw, 0, hl,   hw, height, -hl,  -hw, height, -hl,
    // Back vertical face at -Z
    -hw, 0, -hl,  -hw, height, -hl,  hw, height, -hl,
    -hw, 0, -hl,   hw, height, -hl,  hw, 0, -hl,
    // Left side tri
    -hw, 0, hl,   -hw, height, -hl, -hw, 0, -hl,
    // Right side tri
    hw, 0, hl,    hw, 0, -hl,   hw, height, -hl,
    // Bottom
    -hw, 0, -hl,  hw, 0, -hl,   hw, 0, hl,
    -hw, 0, -hl,  hw, 0, hl,    -hw, 0, hl,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 2,
    0, 0, 1, 2, 0, 2,
    0, 0, 0, 1, 1, 1,
    0, 0, 1, 1, 1, 0,
    0, 0, 1, 1, 1, 0,
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

export function buildLevel(textures: ProceduralTextureSet): BuiltLevel {
  const group = new THREE.Group();
  const staticColliders: AabbCollider[] = [];
  const ramps: RampCollider[] = [];
  const movingPlatforms: MovingPlatformState[] = [];
  const boostPads: BoostPadZone[] = [];
  const checkpoints: CheckpointData[] = [];
  const orbs: CollectibleOrb[] = [];
  const hazards: HazardEntity[] = [];
  const crates: PushCrate[] = [];
  const initialCratePositions: { x: number; y: number; z: number }[] = [];

  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Shared materials
  const trackMat = trackGeo(
    new THREE.MeshStandardMaterial({
      map: textures.trackMap,
      roughness: 0.72,
      metalness: 0.08,
    }),
  );
  const deckBaseMat = trackGeo(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.82,
      metalness: 0.18,
    }),
  );
  const barrierMat = trackGeo(
    new THREE.MeshStandardMaterial({
      map: textures.barrierMap,
      roughness: 0.52,
      metalness: 0.12,
    }),
  );
  const platformMat = trackGeo(
    new THREE.MeshStandardMaterial({
      map: textures.platformMap,
      roughness: 0.36,
      metalness: 0.65,
    }),
  );
  const pillarMat = trackGeo(
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.65,
      metalness: 0.25,
    }),
  );
  const stepMat = trackGeo(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.45,
      metalness: 0.3,
    }),
  );

  // Helper to add a solid box with visual mesh & AABB collider
  const addSolidBox = (
    id: string,
    cx: number,
    cyBottom: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    tag: AabbCollider['tag'] = 'ground',
    bouncy = 0,
  ) => {
    const geo = trackGeo(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cyBottom + h / 2, cz);
    mesh.castShadow = tag !== 'ground';
    mesh.receiveShadow = true;
    group.add(mesh);

    staticColliders.push({
      id,
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minY: cyBottom,
      maxY: cyBottom + h,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      tag,
      bouncy,
    });
    return mesh;
  };

  // Helper for Track Deck (dark structural base + asphalt top slab offset slightly to avoid Z-fighting)
  const addTrackDeck = (id: string, minX: number, maxX: number, topY: number, minZ: number, maxZ: number) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const thickness = 1.6;

    const geo = trackGeo(new THREE.BoxGeometry(w, thickness, d));
    const mesh = new THREE.Mesh(geo, [
      deckBaseMat,
      deckBaseMat,
      trackMat,
      deckBaseMat,
      deckBaseMat,
      deckBaseMat,
    ]);
    mesh.position.set(cx, topY - thickness / 2, cz);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);

    staticColliders.push({
      id,
      minX,
      maxX,
      minY: topY - thickness,
      maxY: topY,
      minZ,
      maxZ,
      tag: 'ground',
    });
  };

  // Helper to add Ramp ascending -Z
  const addRampNegZ = (id: string, minX: number, maxX: number, baseY: number, topY: number, minZ: number, maxZ: number) => {
    const w = maxX - minX;
    const l = maxZ - minZ;
    const h = topY - baseY;
    const geo = trackGeo(makeRampGeometry(w, l, h));
    const mesh = new THREE.Mesh(geo, platformMat);
    mesh.position.set((minX + maxX) / 2, baseY, (minZ + maxZ) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    ramps.push({
      id,
      minX,
      maxX,
      minZ,
      maxZ,
      baseY,
      topY,
      direction: '-z',
    });
  };

  // --- 1. NATURAL CANYON TERRAIN PERIMETER ---
  const terrainSize = 460;
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(terrainSize, terrainSize, 96, 96));
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i) - 95;
    posAttr.setZ(i, vz);
    posAttr.setY(i, groundHeightAt(vx, vz));
  }
  terrainGeo.computeVertexNormals();
  const terrainMat = trackGeo(
    new THREE.MeshStandardMaterial({
      map: textures.terrainMap,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // --- 2. INSTANCED PINE GROVES & CANYON BOULDERS (Outside Track) ---
  const treeCount = 85;
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.5, 2.8, 7));
  trunkGeo.translate(0, 1.4, 0);
  const trunkMat = trackGeo(new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 }));
  const crownGeo = trackGeo(new THREE.ConeGeometry(2.1, 5.4, 7));
  crownGeo.translate(0, 4.8, 0);
  const crownMat = trackGeo(new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.82 }));

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  trunks.castShadow = true;
  crowns.castShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placedTrees = 0;
  let attempt = 0;
  while (placedTrees < treeCount && attempt < 600) {
    attempt++;
    const angle = (attempt * 2.39996) % (Math.PI * 2);
    const radius = 26 + ((attempt * 17) % 135);
    const tx = Math.cos(angle) * radius;
    const tz = -95 + Math.sin(angle) * radius * 1.35;
    // Keep clear of the central track corridor
    if (tx > -18 && tx < 25 && tz > -270 && tz < 25) continue;

    const ty = groundHeightAt(tx, tz) - 0.15;
    const s = 0.85 + Math.random() * 0.3; // ±15% scale variation
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.9 + Math.random() * 0.25), s);
    dummy.updateMatrix();
    trunks.setMatrixAt(placedTrees, dummy.matrix);
    crowns.setMatrixAt(placedTrees, dummy.matrix);

    tint.setHSL(0.38 + (Math.random() - 0.5) * 0.05, 0.42, 0.28 + Math.random() * 0.12);
    crowns.setColorAt(placedTrees, tint);
    placedTrees++;
  }
  trunks.count = placedTrees;
  crowns.count = placedTrees;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  group.add(trunks, crowns);

  const rockCount = 90;
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.6, 0));
  const rockMat = trackGeo(new THREE.MeshStandardMaterial({ color: 0xa1623b, roughness: 0.88 }));
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  let placedRocks = 0;
  for (let i = 0; i < 400 && placedRocks < rockCount; i++) {
    const rx = (Math.sin(i * 12.9898) * 0.5) * 280;
    const rz = -95 + Math.cos(i * 78.233) * 185;
    if (rx > -17 && rx < 24 && rz > -268 && rz < 22) continue;
    const ry = groundHeightAt(rx, rz) + 0.35;
    const s = 0.8 + Math.random() * 1.9;
    dummy.position.set(rx, ry, rz);
    dummy.rotation.set(Math.random() * 2, Math.random() * 3, Math.random() * 2);
    dummy.scale.set(s * 1.2, s * 0.75, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(placedRocks, dummy.matrix);
    tint.setHSL(0.06, 0.45, 0.38 + Math.random() * 0.14);
    rocks.setColorAt(placedRocks, tint);
    placedRocks++;
  }
  rocks.count = placedRocks;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.computeBoundingSphere();
  group.add(rocks);

  // --- 3. SECTOR 1: START PLAZA & CANYON S-CURVE (y = 0) ---
  addTrackDeck('deck-start', -7.5, 7.5, 0, -48, 18);
  // Step-offset curb stairs demo on Start Plaza
  addSolidBox('step-1', -4.2, 0, 2, 3.2, 0.38, 1.8, stepMat, 'wall');
  addSolidBox('step-2', -4.2, 0.38, 0.2, 3.2, 0.38, 1.8, stepMat, 'wall');
  addSolidBox('step-3', -4.2, 0.76, -1.6, 3.2, 0.38, 1.8, stepMat, 'wall');

  // Guardrails & Pillars along Sector 1
  addSolidBox('wall-start-l', -7.1, 0, -14, 0.8, 1.35, 62, barrierMat, 'barrier');
  addSolidBox('wall-start-r', 7.1, 0, -14, 0.8, 1.35, 62, barrierMat, 'barrier');
  addSolidBox('pillar-s1-a', 2.6, 0, -8, 1.5, 3.2, 1.5, pillarMat, 'pillar', 0.2);
  addSolidBox('pillar-s1-b', -2.8, 0, -35, 1.5, 3.2, 1.5, pillarMat, 'pillar', 0.2);

  // Canyon S-Curve Right
  addTrackDeck('deck-curve', -2.5, 18.5, 0, -76, -46);
  addSolidBox('wall-curve-back', -2.5, 0, -46.4, 21, 1.35, 0.8, barrierMat, 'barrier');
  addSolidBox('wall-curve-right', 18.1, 0, -61, 0.8, 1.35, 30, barrierMat, 'barrier');
  addSolidBox('pillar-curve-mid', 7.8, 0, -58, 1.8, 3.6, 1.8, pillarMat, 'pillar', 0.2);

  // Ramp 1 ascending -Z from y=0 to y=4.5
  addRampNegZ('ramp-1', 4, 16, 0, 4.5, -90, -72);

  // --- 4. SECTOR 2: SKYWAY BRIDGES (y = 4.5 -> 5.5) ---
  addTrackDeck('deck-sky-1', 3, 17, 4.5, -112, -90);
  addSolidBox('wall-sky1-l', 3.4, 4.5, -101, 0.7, 1.1, 22, barrierMat, 'barrier');
  addSolidBox('wall-sky1-r', 16.6, 4.5, -101, 0.7, 1.1, 22, barrierMat, 'barrier');

  // Support stilts under high decks
  addSolidBox('stilt-1', 5, -3, -95, 1.4, 7.5, 1.4, pillarMat, 'pillar');
  addSolidBox('stilt-2', 15, -3, -95, 1.4, 7.5, 1.4, pillarMat, 'pillar');

  // Moving Platform 1 (X-axis shuttle over canyon gap)
  const addMovingPlatform = (
    id: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    axis: 'x' | 'y' | 'z',
    amplitude: number,
    speed: number,
    phaseOffset = 0,
  ) => {
    const platGroup = new THREE.Group();
    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), platformMat);
    body.position.y = -h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    platGroup.add(body);

    const trim = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w + 0.16, 0.16, d + 0.16)),
      stepMat,
    );
    trim.position.y = -0.12;
    platGroup.add(trim);

    platGroup.position.set(x, y, z);
    group.add(platGroup);

    const collider: AabbCollider = {
      id,
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: y - h,
      maxY: y,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      tag: 'platform',
    };

    movingPlatforms.push({
      id,
      mesh: platGroup,
      collider,
      origin: new THREE.Vector3(x, y, z),
      axis,
      amplitude,
      speed,
      phaseOffset,
      deltaPos: new THREE.Vector3(),
    });
  };

  addMovingPlatform('mplat-1', 10, 4.5, -120.5, 7.8, 1.1, 9.2, 'x', 4.5, 1.35, 0);

  // Sky Deck C
  addTrackDeck('deck-sky-2', 2, 18, 4.5, -148, -129);
  addSolidBox('stilt-3', 4, -3, -138, 1.4, 7.5, 1.4, pillarMat, 'pillar');
  addSolidBox('stilt-4', 16, -3, -138, 1.4, 7.5, 1.4, pillarMat, 'pillar');

  // Moving Platform 2 (Z-axis + slight elevation rise)
  addMovingPlatform('mplat-2', 7, 5.0, -155.5, 7.6, 1.1, 8.8, 'x', 5.2, 1.5, 1.4);

  // --- 5. SECTOR 3: SENTINEL GAUNTLET & SUMMIT SPRINT (y = 5.5 -> 10.5) ---
  addTrackDeck('deck-gauntlet', -11, 11, 5.5, -214, -162);
  addSolidBox('wall-g-l', -10.6, 5.5, -188, 0.8, 1.4, 52, barrierMat, 'barrier');
  addSolidBox('wall-g-r', 10.6, 5.5, -188, 0.8, 1.4, 52, barrierMat, 'barrier');
  addSolidBox('pillar-g1', -4.2, 5.5, -184, 1.7, 3.8, 1.7, pillarMat, 'pillar', 0.25);
  addSolidBox('pillar-g2', 4.2, 5.5, -196, 1.7, 3.8, 1.7, pillarMat, 'pillar', 0.25);

  // Grand Summit Ramp ascending -Z from y=5.5 to y=10.5
  addRampNegZ('ramp-summit', -6, 6, 5.5, 10.5, -234, -214);

  // Summit Finish Plaza
  addTrackDeck('deck-summit', -9.5, 9.5, 10.5, -264, -234);
  addSolidBox('wall-sum-l', -9.1, 10.5, -249, 0.8, 1.4, 30, barrierMat, 'barrier');
  addSolidBox('wall-sum-r', 9.1, 10.5, -249, 0.8, 1.4, 30, barrierMat, 'barrier');
  addSolidBox('wall-sum-end', 0, 10.5, -263.6, 19, 1.8, 0.8, barrierMat, 'barrier');

  // --- 6. BOOST PADS ---
  const addBoost = (id: string, x: number, y: number, z: number, dirZ = -1, speed = 29) => {
    const pad = createBoostPad(textures.boostChevronMap);
    pad.position.set(x, y, z);
    group.add(pad);
    boostPads.push({
      id,
      position: new THREE.Vector3(x, y, z),
      halfExtents: new THREE.Vector3(1.85, 1.0, 2.75),
      direction: new THREE.Vector3(0, 0.14, dirZ).normalize(),
      boostSpeed: speed,
      mesh: pad,
      cooldown: 0,
    });
  };
  addBoost('boost-1', 0, 0, -25, -1, 28);
  addBoost('boost-2', 10, 4.5, -101, -1, 29);
  addBoost('boost-3', 0, 5.5, -206, -1, 31);

  // --- 7. PUSHABLE CRATES ---
  const crateSpots = [
    { x: 2.8, y: 0, z: 3.5 },
    { x: 4.1, y: 0, z: 3.5 },
    { x: 3.4, y: 1.2, z: 3.5 },
    { x: -1.5, y: 5.5, z: -176 },
    { x: 1.5, y: 5.5, z: -176 },
  ];
  crateSpots.forEach((spot, idx) => {
    const size = 1.2;
    const mesh = createCrateMesh(textures.crateMap, size);
    mesh.position.set(spot.x, spot.y, spot.z);
    group.add(mesh);
    const half = size / 2;
    crates.push({
      id: `crate-${idx}`,
      mesh,
      position: new THREE.Vector3(spot.x, spot.y, spot.z),
      velocity: new THREE.Vector3(),
      halfSize: half,
      collider: {
        id: `crate-${idx}`,
        minX: spot.x - half,
        maxX: spot.x + half,
        minY: spot.y,
        maxY: spot.y + size,
        minZ: spot.z - half,
        maxZ: spot.z + size,
        tag: 'crate',
      },
    });
    initialCratePositions.push({ ...spot });
  });

  // --- 8. CHECKPOINTS (7 GATES) ---
  const gateConfigs = [
    { x: 0, y: 0, z: -12, sector: 'SECTOR 1 · CANYON SPRINT' },
    { x: 10, y: 0, z: -64, sector: 'SECTOR 1 · CANYON CURVE' },
    { x: 10, y: 4.5, z: -93, sector: 'SECTOR 2 · SKYWAY BRIDGES' },
    { x: 10, y: 4.5, z: -144, sector: 'SECTOR 2 · MOVING SPANS' },
    { x: 0, y: 5.5, z: -167, sector: 'SECTOR 3 · SENTINEL GAUNTLET' },
    { x: 0, y: 5.5, z: -211, sector: 'SECTOR 3 · SUMMIT ASCENT' },
    { x: 0, y: 10.5, z: -254, sector: 'SUMMIT FINISH' },
  ];
  gateConfigs.forEach((cfg, idx) => {
    const isFinish = idx === gateConfigs.length - 1;
    const { group: gateMesh, ringMesh } = createCheckpointGate(isFinish);
    gateMesh.position.set(cfg.x, cfg.y, cfg.z);
    group.add(gateMesh);
    checkpoints.push({
      index: idx,
      position: new THREE.Vector3(cfg.x, cfg.y, cfg.z),
      rotationY: 0,
      radius: isFinish ? 5.6 : 4.8,
      sectorName: cfg.sector,
      mesh: gateMesh,
      ringMesh,
      cleared: false,
    });
  });

  // --- 9. COLLECTIBLE KINETIC ORBS (18 ORBS) ---
  const orbSpots: Array<[number, number, number]> = [
    [-4.2, 1.9, -1.6],
    [0, 1.1, -19],
    [0, 1.1, -31],
    [4, 1.1, -52],
    [10, 1.1, -60],
    [10, 2.2, -78],
    [10, 4.2, -86],
    [10, 5.6, -108],
    [10, 5.8, -120.5],
    [6.5, 5.6, -135],
    [13.5, 5.6, -135],
    [7, 6.2, -155.5],
    [-5.5, 6.6, -180],
    [5.5, 6.6, -188],
    [0, 6.6, -200],
    [0, 8.6, -222],
    [0, 11.2, -233],
    [0, 11.6, -246],
  ];
  orbSpots.forEach(([x, y, z], idx) => {
    const mesh = createEnergyOrb();
    mesh.position.set(x, y, z);
    group.add(mesh);
    orbs.push({
      id: `orb-${idx}`,
      position: new THREE.Vector3(x, y, z),
      mesh,
      collected: false,
      phase: idx * 0.65,
    });
  });

  // --- 10. HAZARDS: SENTINEL DRONES & ROTATING SWEEPERS ---
  const addDrone = (
    id: string,
    x: number,
    y: number,
    z: number,
    axis: 'x' | 'z',
    range: number,
    speed: number,
    phase: number,
  ) => {
    const { group: droneMesh, windupRing } = createDroneHazard();
    droneMesh.position.set(x, y, z);
    group.add(droneMesh);
    hazards.push({
      id,
      type: 'drone',
      mesh: droneMesh,
      position: new THREE.Vector3(x, y, z),
      origin: new THREE.Vector3(x, y, z),
      patrolAxis: axis,
      patrolRange: range,
      speed,
      phase,
      radius: 1.05,
      telegraphTimer: 0,
      windupRing,
      hitCooldown: 0,
    });
  };

  addDrone('drone-1', 0, 0, -40, 'x', 4.8, 2.0, 0);
  addDrone('drone-2', 0, 5.5, -182, 'x', 7.5, 2.5, 0.8);
  addDrone('drone-3', 0, 5.5, -198, 'x', 7.5, 2.9, 2.4);
  addDrone('drone-4', 0, 10.5, -244, 'x', 6.2, 3.2, 1.2);

  const addSweeper = (id: string, x: number, y: number, z: number, length: number, speed: number) => {
    const sweeperMesh = createSweeperArm(length, textures.barrierMap);
    sweeperMesh.position.set(x, y, z);
    group.add(sweeperMesh);
    hazards.push({
      id,
      type: 'sweeper',
      mesh: sweeperMesh,
      position: new THREE.Vector3(x, y, z),
      origin: new THREE.Vector3(x, y, z),
      patrolAxis: 'x',
      patrolRange: length / 2,
      speed,
      phase: 0,
      radius: 0.72,
      telegraphTimer: 0,
      hitCooldown: 0,
    });
  };
  addSweeper('sweeper-1', 10, 4.5, -138, 10.5, 1.85);
  addSweeper('sweeper-2', 0, 10.5, -240, 11.0, -2.25);

  return {
    group,
    staticColliders,
    ramps,
    movingPlatforms,
    boostPads,
    checkpoints,
    orbs,
    hazards,
    crates,
    initialCratePositions,
    trackMaterial: trackMat,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
