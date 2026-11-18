import * as THREE from 'three';

export interface PlayerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  thrusterFlameL: THREE.Mesh;
  thrusterFlameR: THREE.Mesh;
  visorMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
  contactShadow: THREE.Mesh;
}

export function createPlayerModel(contactShadowMap: THREE.Texture): PlayerRig {
  const root = new THREE.Group();

  // Contact shadow grounded at feet (offset slightly above surface)
  const shadowGeo = new THREE.PlaneGeometry(2.1, 2.1);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  // Body pivot at bottom-center (0, 0, 0) for squash-and-stretch & lean
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Varied PBR materials (roughness delta >= 0.25)
  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.12,
  });
  const armorMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.24,
    metalness: 0.25,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.32,
    metalness: 0.45,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.28,
    metalness: 0.88,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.7,
    roughness: 0.12,
    metalness: 0.85,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.2,
  });

  // 1-2. Articulated Legs + Kinetic Boots
  const makeLeg = (xOffset: number): THREE.Group => {
    const legGroup = new THREE.Group();
    legGroup.position.set(xOffset, 0.72, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.34, 4, 8), suitMat);
    thigh.position.y = -0.24;
    thigh.castShadow = true;
    legGroup.add(thigh);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.38), armorMat);
    boot.position.set(0, -0.61, 0.04);
    boot.castShadow = true;
    legGroup.add(boot);

    const skateSole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.42), accentMat);
    skateSole.position.set(0, -0.69, 0.04);
    legGroup.add(skateSole);

    return legGroup;
  };
  const leftLeg = makeLeg(-0.18);
  const rightLeg = makeLeg(0.18);
  bodyPivot.add(leftLeg, rightLeg);

  // 3. Sculpted Beveled Torso (ExtrudeGeometry)
  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-0.26, 0);
  torsoShape.lineTo(0.26, 0);
  torsoShape.lineTo(0.32, 0.56);
  torsoShape.lineTo(-0.32, 0.56);
  torsoShape.closePath();

  const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  torsoGeo.center();
  const torso = new THREE.Mesh(torsoGeo, armorMat);
  torso.position.set(0, 1.06, 0);
  torso.castShadow = true;
  bodyPivot.add(torso);

  // 4. Glowing Kinetic Chest Core
  const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), coreMat);
  chestCore.position.set(0, 1.12, 0.19);
  chestCore.scale.set(1, 1.2, 0.5);
  bodyPivot.add(chestCore);

  // 5. Jetpack Housing & Twin Nozzles
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.22), darkMetalMat);
  pack.position.set(0, 1.08, -0.24);
  pack.castShadow = true;
  bodyPivot.add(pack);

  const makeNozzle = (x: number) => {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.18, 10), accentMat);
    nozzle.position.set(x, 0.85, -0.26);
    nozzle.rotation.x = -0.22;
    bodyPivot.add(nozzle);

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.36, 8), flameMat);
    flame.position.set(x, 0.65, -0.32);
    flame.rotation.x = Math.PI - 0.22;
    bodyPivot.add(flame);
    return flame;
  };
  const thrusterFlameL = makeNozzle(-0.13);
  const thrusterFlameR = makeNozzle(0.13);

  // 6-7. Articulated Arms + Shoulder Pauldrons
  const makeArm = (side: -1 | 1): THREE.Group => {
    const armGroup = new THREE.Group();
    armGroup.position.set(side * 0.39, 1.28, 0);

    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), accentMat);
    pauldron.scale.set(1.1, 0.85, 1.1);
    armGroup.add(pauldron);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.32, 4, 8), suitMat);
    forearm.position.set(side * 0.03, -0.25, 0.04);
    forearm.castShadow = true;
    armGroup.add(forearm);

    const gauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.18), armorMat);
    gauntlet.position.set(side * 0.04, -0.45, 0.06);
    armGroup.add(gauntlet);

    return armGroup;
  };
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  bodyPivot.add(leftArm, rightArm);

  // 8-9. Helmet + Glowing Curved Visor + Stabilizer Fins
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.56, 0);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), armorMat);
  helmet.scale.set(0.95, 1.02, 1.08);
  helmet.castShadow = true;
  headGroup.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.12, 0.18),
    visorMat,
  );
  visor.position.set(0, 0.01, 0.17);
  headGroup.add(visor);

  const finGeo = new THREE.BoxGeometry(0.04, 0.16, 0.24);
  const finL = new THREE.Mesh(finGeo, accentMat);
  finL.position.set(-0.22, 0.12, -0.08);
  finL.rotation.x = -0.35;
  const finR = new THREE.Mesh(finGeo, accentMat);
  finR.position.set(0.22, 0.12, -0.08);
  finR.rotation.x = -0.35;
  headGroup.add(finL, finR);

  bodyPivot.add(headGroup);

  return {
    root,
    bodyPivot,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    thrusterFlameL,
    thrusterFlameR,
    visorMat,
    coreMat,
    contactShadow,
  };
}

export function createCheckpointGate(isFinish: boolean): { group: THREE.Group; ringMesh: THREE.Mesh } {
  const group = new THREE.Group();

  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.75,
    metalness: 0.3,
  });
  const pylonMat = new THREE.MeshStandardMaterial({
    color: isFinish ? 0xf59e0b : 0xe2e8f0,
    roughness: 0.3,
    metalness: 0.55,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: isFinish ? 0xfbbf24 : 0x38bdf8,
    emissive: isFinish ? 0xf59e0b : 0x0284c7,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.2,
  });

  const width = isFinish ? 10.5 : 8.8;
  const height = isFinish ? 6.2 : 5.2;

  [-width / 2, width / 2].forEach((x) => {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.4), plinthMat);
    plinth.position.set(x, 0.4, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.65, height, 0.65), pylonMat);
    pylon.position.set(x, height / 2 + 0.4, 0);
    pylon.castShadow = true;
    group.add(pylon);

    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, height - 0.6, 0.72), beaconMat);
    strip.position.set(x, height / 2 + 0.4, 0);
    group.add(strip);
  });

  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.65, 0.85), pylonMat);
  crossbar.position.set(0, height + 0.4, 0);
  crossbar.castShadow = true;
  group.add(crossbar);

  const ringMesh = new THREE.Mesh(
    new THREE.TorusGeometry(isFinish ? 2.4 : 1.7, 0.14, 10, 28),
    beaconMat.clone(),
  );
  ringMesh.position.set(0, height * 0.56, 0);
  group.add(ringMesh);

  return { group, ringMesh };
}

export function createDroneHazard(): { group: THREE.Group; windupRing: THREE.Mesh } {
  const group = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.28,
    metalness: 0.82,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.4,
    metalness: 0.35,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xff4444,
    emissive: 0xdc2626,
    emissiveIntensity: 2.0,
    roughness: 0.15,
  });

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 14), shellMat);
  core.position.y = 1.0;
  core.castShadow = true;
  group.add(core);

  const gyro = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.09, 8, 24), trimMat);
  gyro.position.y = 1.0;
  gyro.rotation.x = Math.PI / 2.4;
  gyro.name = 'gyro';
  group.add(gyro);

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), eyeMat);
  eye.position.set(0, 1.0, 0.52);
  group.add(eye);

  [-0.78, 0.78].forEach((x) => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.42), trimMat);
    fin.position.set(x, 1.05, 0);
    fin.castShadow = true;
    group.add(fin);
  });

  // Ground telegraph warning ring
  const windupRing = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.25, 24),
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  windupRing.rotation.x = -Math.PI / 2;
  windupRing.position.y = 0.04;
  group.add(windupRing);

  return { group, windupRing };
}

export function createSweeperArm(length: number, barrierTex: THREE.Texture): THREE.Group {
  const group = new THREE.Group();

  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.85,
  });
  const beamMat = new THREE.MeshStandardMaterial({
    map: barrierTex,
    roughness: 0.45,
    metalness: 0.25,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 1.4, 14), hubMat);
  hub.position.y = 0.7;
  hub.castShadow = true;
  group.add(hub);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), tipMat);
  cap.position.y = 1.45;
  group.add(cap);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(length, 0.52, 0.46), beamMat);
  arm.position.y = 0.88;
  arm.castShadow = true;
  group.add(arm);

  [-length / 2, length / 2].forEach((x) => {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.62, 10), tipMat);
    tip.position.set(x, 0.88, 0);
    group.add(tip);
  });

  return group;
}

export function createBoostPad(boostTex: THREE.Texture): THREE.Group {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.8,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    map: boostTex,
    emissive: 0x0284c7,
    emissiveMap: boostTex,
    emissiveIntensity: 1.35,
    roughness: 0.25,
    metalness: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 5.4), frameMat);
  frame.position.y = 0.07;
  frame.receiveShadow = true;
  group.add(frame);

  const deck = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.9), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.155;
  group.add(deck);

  [-1.72, 1.72].forEach((x) => {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.22, 5.4),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    rail.position.set(x, 0.11, 0);
    group.add(rail);
  });

  return group;
}

export function createEnergyOrb(): THREE.Group {
  const group = new THREE.Group();

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.6,
    roughness: 0.15,
    metalness: 0.3,
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.9,
    roughness: 0.22,
    metalness: 0.8,
  });

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), coreMat);
  core.castShadow = true;
  group.add(core);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.055, 8, 22), ringMat);
  ring.rotation.x = Math.PI / 3;
  group.add(ring);

  return group;
}

export function createCrateMesh(crateTex: THREE.Texture, size: number): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    map: crateTex,
    roughness: 0.72,
    metalness: 0.1,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.32,
    metalness: 0.82,
  });

  const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), bodyMat);
  box.position.y = size / 2;
  box.castShadow = true;
  box.receiveShadow = true;
  group.add(box);

  const band = new THREE.Mesh(new THREE.BoxGeometry(size + 0.05, size * 0.14, size + 0.05), trimMat);
  band.position.y = size * 0.5;
  group.add(band);

  return group;
}
