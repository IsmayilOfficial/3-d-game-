import * as THREE from 'three';

export interface PlayerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  steerFL: THREE.Group;
  steerFR: THREE.Group;
  wheelFL: THREE.Group;
  wheelFR: THREE.Group;
  wheelRL: THREE.Group;
  wheelRR: THREE.Group;
  thrusterFlameL: THREE.Mesh;
  thrusterFlameR: THREE.Mesh;
  headlightMat: THREE.MeshStandardMaterial;
  taillightMat: THREE.MeshStandardMaterial;
  contactShadow: THREE.Mesh;
}

/**
 * Composite 10-part procedural 3D GT Rally Car pivoted at bottom-center (0, 0, 0).
 * Front bumper faces +Z, rear spoiler/exhausts face -Z.
 */
export function createPlayerModel(contactShadowMap: THREE.Texture): PlayerRig {
  const root = new THREE.Group();

  // Contact shadow grounded beneath chassis
  const shadowGeo = new THREE.PlaneGeometry(2.6, 3.6);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  // Body pivot for suspension roll/pitch and jump squash-and-stretch
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Varied PBR materials (roughness delta >= 0.25 between paint, carbon, rubber, metal, glass)
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: 0xf97316,
    roughness: 0.2,
    metalness: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.26,
    metalness: 0.2,
  });
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.18,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const alloyMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.9,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x171717,
    roughness: 0.88,
    metalness: 0.05,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.9,
    roughness: 0.15,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xfca5a5,
    emissive: 0xef4444,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });

  // 1. Sculpted Aerodynamic Lower Chassis (ExtrudeGeometry side profile extruded across width)
  const sideProfile = new THREE.Shape();
  sideProfile.moveTo(-1.32, 0.24); // rear bottom
  sideProfile.lineTo(1.36, 0.22);  // front splitter
  sideProfile.lineTo(1.32, 0.46);  // front nose
  sideProfile.lineTo(0.75, 0.62);  // hood slope
  sideProfile.lineTo(0.28, 0.96);  // windshield top
  sideProfile.lineTo(-0.58, 0.96); // roof rear
  sideProfile.lineTo(-1.26, 0.68); // rear deck
  sideProfile.lineTo(-1.35, 0.44); // rear bumper
  sideProfile.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(sideProfile, {
    depth: 1.32,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  // Rotate so X-Y side profile maps to Z-Y (nose at +Z) and extrude depth centers on X
  bodyGeo.translate(0, 0, -0.66);
  bodyGeo.rotateY(-Math.PI / 2);
  const chassis = new THREE.Mesh(bodyGeo, paintMat);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  bodyPivot.add(chassis);

  // 2. Carbon Fiber Front Splitter & Side Skirts
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.12, 2.78), carbonMat);
  skirt.position.set(0, 0.23, 0.02);
  skirt.castShadow = true;
  bodyPivot.add(skirt);

  // 3. Center Racing Stripe Decal (offset slightly to prevent Z-fighting)
  const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.85), stripeMat);
  hoodStripe.position.set(0, 0.6, 0.98);
  hoodStripe.rotation.x = 0.26;
  bodyPivot.add(hoodStripe);

  const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.86), stripeMat);
  roofStripe.position.set(0, 1.03, -0.16);
  bodyPivot.add(roofStripe);

  // 4. Tinted Wraparound Cockpit Canopy
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.34, 1.15), canopyMat);
  cabin.position.set(0, 0.82, -0.14);
  cabin.castShadow = true;
  bodyPivot.add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.32, 0.62), canopyMat);
  windshield.position.set(0, 0.77, 0.38);
  windshield.rotation.x = 0.62;
  bodyPivot.add(windshield);

  // 5. Rear GT Spoiler Wing + Twin Struts
  const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.24), carbonMat);
  strutL.position.set(-0.45, 0.86, -1.16);
  const strutR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.24), carbonMat);
  strutR.position.set(0.45, 0.86, -1.16);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 0.38), carbonMat);
  wing.position.set(0, 1.02, -1.2);
  wing.rotation.x = 0.14;
  wing.castShadow = true;
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.42), paintMat);
  wingTipL.position.set(-0.82, 1.02, -1.2);
  const wingTipR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.42), paintMat);
  wingTipR.position.set(0.82, 1.02, -1.2);
  bodyPivot.add(strutL, strutR, wing, wingTipL, wingTipR);

  // 6. Twin Glowing Headlights (+Z front) & Brake Light Bar (-Z rear)
  const headL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.1), headlightMat);
  headL.position.set(-0.48, 0.42, 1.37);
  const headR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.1), headlightMat);
  headR.position.set(0.48, 0.42, 1.37);
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.11, 0.08), taillightMat);
  tailBar.position.set(0, 0.56, -1.36);
  bodyPivot.add(headL, headR, tailBar);

  // 7. Twin Rear Nitro Exhausts + Dynamic Flame Cones
  const makeExhaust = (x: number) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.22, 12), alloyMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.32, -1.36);
    bodyPivot.add(pipe);

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.88,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.45, 8), flameMat);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0.32, -1.62);
    bodyPivot.add(flame);
    return flame;
  };
  const thrusterFlameL = makeExhaust(-0.34);
  const thrusterFlameR = makeExhaust(0.34);

  // 8-11. Four Articulated Wheels (Front steering knuckles + spinning tires & 5-spoke rims)
  const makeWheel = (x: number, z: number, isFront: boolean): { steer: THREE.Group; spin: THREE.Group } => {
    const steer = new THREE.Group();
    steer.position.set(x, 0.33, z);

    const spin = new THREE.Group();
    steer.add(spin);

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.26, 18), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    spin.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.275, 12), alloyMat);
    rim.rotation.z = Math.PI / 2;
    spin.add(rim);

    // Cross spokes so wheel rotation is super legible at any speed
    const spokeA = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.34, 0.055), carbonMat);
    const spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.055, 0.34), carbonMat);
    spin.add(spokeA, spokeB);

    if (isFront) {
      // Subtle brake caliper accent
      const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.14), paintMat);
      caliper.position.set(x > 0 ? -0.06 : 0.06, 0.04, -0.08);
      steer.add(caliper);
    }

    root.add(steer);
    return { steer, spin };
  };

  const fl = makeWheel(-0.78, 0.86, true);
  const fr = makeWheel(0.78, 0.86, true);
  const rl = makeWheel(-0.78, -0.86, false);
  const rr = makeWheel(0.78, -0.86, false);

  return {
    root,
    bodyPivot,
    steerFL: fl.steer,
    steerFR: fr.steer,
    wheelFL: fl.spin,
    wheelFR: fr.spin,
    wheelRL: rl.spin,
    wheelRR: rr.spin,
    thrusterFlameL,
    thrusterFlameR,
    headlightMat,
    taillightMat,
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
