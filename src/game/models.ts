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
 * Realistic composite procedural 3D GT Supercar pivoted at bottom-center (0, 0, 0).
 * Front bumper faces +Z, rear diffuser/spoiler/exhausts face -Z.
 */
export function createPlayerModel(contactShadowMap: THREE.Texture): PlayerRig {
  const root = new THREE.Group();

  // Contact shadow grounded beneath chassis
  const shadowGeo = new THREE.PlaneGeometry(2.7, 4.1);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  // Body pivot for suspension roll/pitch and jump squash-and-stretch
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Authentic automotive PBR materials (roughness delta >= 0.25 across paint, carbon, glass, alloy, rubber)
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: 0xea580c,
    roughness: 0.16,
    metalness: 0.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const trimBlackMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.58,
    metalness: 0.22,
  });
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.35,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x09111e,
    roughness: 0.05,
    metalness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const alloyMat = new THREE.MeshStandardMaterial({
    color: 0xdbeafe,
    roughness: 0.18,
    metalness: 0.92,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.32,
    metalness: 0.85,
  });
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.28,
    metalness: 0.4,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x141414,
    roughness: 0.88,
    metalness: 0.04,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xf0f9ff,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.1,
    roughness: 0.12,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xfecaca,
    emissive: 0xef4444,
    emissiveIntensity: 1.9,
    roughness: 0.16,
  });

  // 1. Sculpted Fastback GT Body Shell with Real Wheel-Arch Cutouts (ExtrudeGeometry)
  const wheelZ = 0.96;
  const archY = 0.34;
  const archR = 0.41;

  const sideProfile = new THREE.Shape();
  sideProfile.moveTo(-1.46, 0.24);
  sideProfile.lineTo(-wheelZ - archR * 0.96, 0.23);
  sideProfile.absarc(-wheelZ, archY, archR, Math.PI * 1.08, -0.08, true);
  sideProfile.lineTo(wheelZ - archR * 0.96, 0.21);
  sideProfile.absarc(wheelZ, archY, archR, Math.PI * 1.08, -0.08, true);
  sideProfile.lineTo(1.52, 0.20);
  // Front nose & low hood curve
  sideProfile.bezierCurveTo(1.59, 0.31, 1.52, 0.47, 1.26, 0.54);
  sideProfile.bezierCurveTo(0.95, 0.62, 0.66, 0.64, 0.48, 0.67);
  // Raked A-pillar & curved coupe roofline
  sideProfile.bezierCurveTo(0.28, 0.86, 0.10, 1.03, -0.14, 1.05);
  sideProfile.bezierCurveTo(-0.46, 1.06, -0.78, 0.95, -1.08, 0.77);
  // Fastback rear deck & sculpted Kammback tail
  sideProfile.bezierCurveTo(-1.28, 0.71, -1.43, 0.68, -1.52, 0.62);
  sideProfile.bezierCurveTo(-1.55, 0.45, -1.52, 0.30, -1.46, 0.24);

  const bodyGeo = new THREE.ExtrudeGeometry(sideProfile, {
    depth: 1.56,
    curveSegments: 16,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.045,
    bevelSegments: 3,
  });
  bodyGeo.translate(0, 0, -0.78);
  bodyGeo.rotateY(-Math.PI / 2);
  const chassis = new THREE.Mesh(bodyGeo, paintMat);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  bodyPivot.add(chassis);

  // 2. Dark Inner Underbody Tub & Wheel-Well Liners (prevents see-through arches)
  const underTub = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.46, 2.86), trimBlackMat);
  underTub.position.set(0, 0.42, 0.0);
  underTub.castShadow = true;
  bodyPivot.add(underTub);

  // 3. Flared Widebody Wheel Arch Lips (front & rear, left & right)
  const archLipGeo = new THREE.TorusGeometry(archR + 0.015, 0.042, 8, 20, Math.PI * 1.06);
  archLipGeo.rotateY(Math.PI / 2);
  [
    [-0.84, wheelZ],
    [0.84, wheelZ],
    [-0.84, -wheelZ],
    [0.84, -wheelZ],
  ].forEach(([ax, az]) => {
    const lip = new THREE.Mesh(archLipGeo, carbonMat);
    lip.position.set(ax, archY, az);
    lip.rotation.x = -0.03;
    bodyPivot.add(lip);
  });

  // 4. Carbon-Fiber Front Aero Splitter & Sculpted Side Skirts
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.055, 0.44), carbonMat);
  splitter.position.set(0, 0.185, 1.43);
  splitter.castShadow = true;
  bodyPivot.add(splitter);

  [-0.84, 0.84].forEach((sx) => {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 1.24), carbonMat);
    skirt.position.set(sx, 0.21, 0.0);
    skirt.castShadow = true;
    bodyPivot.add(skirt);

    // Side aerodynamic intake scoop recess
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.48), trimBlackMat);
    scoop.position.set(sx * 1.01, 0.47, -0.34);
    bodyPivot.add(scoop);
  });

  // 5. Wraparound Tinted Glass Greenhouse (Windshield, Side Windows, Fastback Rear Glass)
  const glassShape = new THREE.Shape();
  glassShape.moveTo(-1.02, 0.72);
  glassShape.lineTo(0.45, 0.67);
  glassShape.bezierCurveTo(0.27, 0.85, 0.10, 1.00, -0.14, 1.02);
  glassShape.bezierCurveTo(-0.45, 1.03, -0.74, 0.92, -1.02, 0.72);

  const glassGeo = new THREE.ExtrudeGeometry(glassShape, {
    depth: 1.26,
    curveSegments: 14,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  glassGeo.translate(0, 0, -0.63);
  glassGeo.rotateY(-Math.PI / 2);
  const greenhouse = new THREE.Mesh(glassGeo, glassMat);
  greenhouse.position.y = 0.015;
  bodyPivot.add(greenhouse);

  // Sculpted Hood Power-Dome & Roofline Center Vent
  const hoodCrease = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.74), carbonMat);
  hoodCrease.position.set(0, 0.615, 0.95);
  hoodCrease.rotation.x = 0.17;
  bodyPivot.add(hoodCrease);

  // 6. Aerodynamic Side-View Mirrors on Stalks
  [-1, 1].forEach((side) => {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.05), trimBlackMat);
    stalk.position.set(side * 0.82, 0.68, 0.34);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.12), paintMat);
    housing.position.set(side * 0.91, 0.71, 0.32);
    housing.rotation.y = side * -0.18;
    housing.castShadow = true;
    bodyPivot.add(stalk, housing);
  });

  // 7. Recessed Front Grille & Twin Projector LED Headlights with DRL Blades (+Z)
  const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.17, 0.08), trimBlackMat);
  frontGrille.position.set(0, 0.30, 1.54);
  bodyPivot.add(frontGrille);

  [-0.58, 0.58].forEach((hx) => {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.12), trimBlackMat);
    housing.position.set(hx, 0.45, 1.45);
    housing.rotation.y = hx > 0 ? -0.22 : 0.22;
    housing.rotation.x = 0.16;

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.065, 0.06), headlightMat);
    lens.position.set(hx, 0.45, 1.50);
    lens.rotation.y = hx > 0 ? -0.22 : 0.22;
    lens.rotation.x = 0.16;
    bodyPivot.add(housing, lens);
  });

  // 8. Rear Carbon Diffuser with Vertical Aero Strakes + Full-Width LED Tail-Light Bar (-Z)
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.19, 0.16), trimBlackMat);
  diffuser.position.set(0, 0.27, -1.49);
  bodyPivot.add(diffuser);

  [-0.5, -0.17, 0.17, 0.5].forEach((fx) => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.22), carbonMat);
    fin.position.set(fx, 0.25, -1.52);
    bodyPivot.add(fin);
  });

  const tailHousing = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.13, 0.08), trimBlackMat);
  tailHousing.position.set(0, 0.56, -1.52);
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.055, 0.05), taillightMat);
  tailBar.position.set(0, 0.56, -1.55);
  bodyPivot.add(tailHousing, tailBar);

  // 9. Swan-Neck GT Carbon Rear Wing + Sculpted Endplates
  [-0.44, 0.44].forEach((sx) => {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.34, 0.20), carbonMat);
    pylon.position.set(sx, 0.85, -1.32);
    pylon.rotation.x = 0.16;
    bodyPivot.add(pylon);
  });
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.055, 0.34), carbonMat);
  wingBlade.position.set(0, 1.03, -1.39);
  wingBlade.rotation.x = 0.12;
  wingBlade.castShadow = true;
  bodyPivot.add(wingBlade);

  [-0.87, 0.87].forEach((ex) => {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.40), paintMat);
    endplate.position.set(ex, 1.02, -1.39);
    endplate.castShadow = true;
    bodyPivot.add(endplate);
  });

  // 10. Twin Titanium Exhaust Pipes + Dynamic Nitro Flame Cones
  const makeExhaust = (x: number) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.20, 14), alloyMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.28, -1.55);
    bodyPivot.add(pipe);

    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.21, 12), trimBlackMat);
    inner.rotation.x = Math.PI / 2;
    inner.position.set(x, 0.28, -1.555);
    bodyPivot.add(inner);

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.46, 10), flameMat);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0.28, -1.80);
    bodyPivot.add(flame);
    return flame;
  };
  const thrusterFlameL = makeExhaust(-0.34);
  const thrusterFlameR = makeExhaust(0.34);

  // 11. Realistic Multi-Part Wheels: Lathe Rubber Tire + 10-Spoke Alloy Rim + Stationary Brake Rotor & Caliper
  const tireRadius = 0.335;
  const tireHalfW = 0.145;
  const tirePoints = [
    new THREE.Vector2(0.21, -tireHalfW * 0.9),
    new THREE.Vector2(0.28, -tireHalfW),
    new THREE.Vector2(tireRadius, -tireHalfW * 0.82),
    new THREE.Vector2(tireRadius, tireHalfW * 0.82),
    new THREE.Vector2(0.28, tireHalfW),
    new THREE.Vector2(0.21, tireHalfW * 0.9),
  ];
  const latheTireGeo = new THREE.LatheGeometry(tirePoints, 24);
  latheTireGeo.rotateZ(Math.PI / 2);

  const spokeGeo = new THREE.BoxGeometry(0.03, 0.40, 0.038);

  const makeWheel = (x: number, z: number): { steer: THREE.Group; spin: THREE.Group } => {
    const steer = new THREE.Group();
    steer.position.set(x, tireRadius, z);

    // Stationary brake rotor & painted caliper inside wheel hub
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.035, 18), rotorMat);
    rotor.rotation.z = Math.PI / 2;
    rotor.position.x = x > 0 ? -0.02 : 0.02;
    steer.add(rotor);

    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.08), caliperMat);
    caliper.position.set(x > 0 ? 0.01 : -0.01, 0.04, -0.11);
    steer.add(caliper);

    const spin = new THREE.Group();
    steer.add(spin);

    const tire = new THREE.Mesh(latheTireGeo, tireMat);
    tire.castShadow = true;
    spin.add(tire);

    // Alloy outer rim barrel + recessed inner drum
    const rimBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.24, 20, 1, true), alloyMat);
    rimBarrel.rotation.z = Math.PI / 2;
    spin.add(rimBarrel);

    const rimHub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 12), alloyMat);
    rimHub.rotation.z = Math.PI / 2;
    spin.add(rimHub);

    // 5-twin-spoke (10-spoke) machined alloy pattern facing outward
    const spokeX = x > 0 ? 0.095 : -0.095;
    for (let i = 0; i < 5; i++) {
      const baseAngle = (i * Math.PI) / 2.5;
      [-0.14, 0.14].forEach((offset) => {
        const spoke = new THREE.Mesh(spokeGeo, alloyMat);
        spoke.position.x = spokeX;
        spoke.rotation.x = baseAngle + offset;
        spin.add(spoke);
      });
    }

    root.add(steer);
    return { steer, spin };
  };

  const fl = makeWheel(-0.80, wheelZ);
  const fr = makeWheel(0.80, wheelZ);
  const rl = makeWheel(-0.80, -wheelZ);
  const rr = makeWheel(0.80, -wheelZ);

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
