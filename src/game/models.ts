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

export interface GhostRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  steerFL: THREE.Group;
  steerFR: THREE.Group;
  wheelFL: THREE.Group;
  wheelFR: THREE.Group;
  wheelRL: THREE.Group;
  wheelRR: THREE.Group;
  dispose: () => void;
}

/**
 * Realistic composite procedural 3D Scarlet Muscle Sedan (Charger-inspired GT)
 * pivoted at bottom-center (0, 0, 0). Front bumper faces +Z, rear wing/diffuser face -Z.
 */
export function createPlayerModel(contactShadowMap: THREE.Texture): PlayerRig {
  const root = new THREE.Group();

  // Contact shadow grounded beneath chassis
  const shadowGeo = new THREE.PlaneGeometry(2.8, 4.3);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  // Body pivot for suspension roll/pitch and jump squash-and-stretch
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Authentic automotive PBR materials (roughness delta >= 0.25 across paint, trim, glass, chrome, rubber)
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: 0xdc1b1b,
    roughness: 0.14,
    metalness: 0.42,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const trimBlackMat = new THREE.MeshStandardMaterial({
    color: 0x0b0f17,
    roughness: 0.62,
    metalness: 0.18,
  });
  const satinWingMat = new THREE.MeshStandardMaterial({
    color: 0x161b24,
    roughness: 0.44,
    metalness: 0.32,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x04070e,
    roughness: 0.04,
    metalness: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.09,
    metalness: 0.96,
  });
  const spokeSilverMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.88,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.34,
    metalness: 0.85,
  });
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.28,
    metalness: 0.4,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x121212,
    roughness: 0.88,
    metalness: 0.04,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xf8fafc,
    emissiveIntensity: 2.3,
    roughness: 0.1,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xfecaca,
    emissive: 0xef4444,
    emissiveIntensity: 2.0,
    roughness: 0.16,
  });

  // 1. Sculpted 4-Door Muscle Sedan Body Shell with Wheel-Arch Cutouts (ExtrudeGeometry)
  const wheelZ = 1.04;
  const archY = 0.34;
  const archR = 0.42;

  const sideProfile = new THREE.Shape();
  sideProfile.moveTo(-1.56, 0.20);
  sideProfile.lineTo(-wheelZ - archR * 0.96, 0.19);
  sideProfile.absarc(-wheelZ, archY, archR, Math.PI * 1.08, -0.08, true);
  sideProfile.lineTo(wheelZ - archR * 0.96, 0.17);
  sideProfile.absarc(wheelZ, archY, archR, Math.PI * 1.08, -0.08, true);
  sideProfile.lineTo(1.60, 0.16);
  // Aggressive forward-canted muscle nose & long contoured hood
  sideProfile.bezierCurveTo(1.66, 0.28, 1.64, 0.52, 1.52, 0.58);
  sideProfile.bezierCurveTo(1.18, 0.65, 0.80, 0.68, 0.48, 0.71);
  // Raked windshield & 4-door sedan roofline
  sideProfile.bezierCurveTo(0.28, 0.92, 0.12, 1.09, -0.14, 1.11);
  sideProfile.bezierCurveTo(-0.44, 1.12, -0.68, 1.06, -0.88, 0.90);
  // Muscular C-pillar & flat rear trunk deck
  sideProfile.bezierCurveTo(-1.05, 0.78, -1.26, 0.74, -1.55, 0.71);
  sideProfile.bezierCurveTo(-1.60, 0.54, -1.60, 0.30, -1.56, 0.20);

  const bodyGeo = new THREE.ExtrudeGeometry(sideProfile, {
    depth: 1.62,
    curveSegments: 16,
    bevelEnabled: true,
    bevelThickness: 0.095,
    bevelSize: 0.045,
    bevelSegments: 3,
  });
  bodyGeo.translate(0, 0, -0.81);
  bodyGeo.rotateY(-Math.PI / 2);
  const chassis = new THREE.Mesh(bodyGeo, paintMat);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  bodyPivot.add(chassis);

  // 2. Dark Inner Underbody Tub & Wheel-Well Liners (prevents see-through arches)
  const underTub = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.46, 3.04), trimBlackMat);
  underTub.position.set(0, 0.42, 0.0);
  underTub.castShadow = true;
  bodyPivot.add(underTub);

  // 3. Body-Painted Wide Fender Arch Lips (front & rear, left & right)
  const archLipGeo = new THREE.TorusGeometry(archR + 0.015, 0.044, 8, 20, Math.PI * 1.06);
  archLipGeo.rotateY(Math.PI / 2);
  [
    [-0.87, wheelZ],
    [0.87, wheelZ],
    [-0.87, -wheelZ],
    [0.87, -wheelZ],
  ].forEach(([ax, az]) => {
    const lip = new THREE.Mesh(archLipGeo, paintMat);
    lip.position.set(ax, archY, az);
    lip.rotation.x = -0.02;
    bodyPivot.add(lip);
  });

  // 4. Lower Front Chin Lip & Sculpted Body-Color Side Skirts + Door Handles
  const frontChin = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.045, 0.34), paintMat);
  frontChin.position.set(0, 0.165, 1.49);
  frontChin.castShadow = true;
  bodyPivot.add(frontChin);

  [-0.87, 0.87].forEach((sx) => {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.075, 1.24), paintMat);
    skirt.position.set(sx, 0.19, 0.0);
    skirt.castShadow = true;
    bodyPivot.add(skirt);

    // Sculpted door side-scallop crease & 2 body-colored door handles per side
    const scallop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.92), paintMat);
    scallop.position.set(sx * 1.03, 0.49, -0.05);
    bodyPivot.add(scallop);

    [0.14, -0.44].forEach((hz) => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.036, 0.14), paintMat);
      handle.position.set(sx * 1.04, 0.65, hz);
      bodyPivot.add(handle);
    });
  });

  // 5. Wraparound Deep-Tinted 4-Door Glass Greenhouse + Black B-Pillar
  const glassShape = new THREE.Shape();
  glassShape.moveTo(-0.98, 0.74);
  glassShape.lineTo(0.46, 0.71);
  glassShape.bezierCurveTo(0.27, 0.90, 0.11, 1.06, -0.14, 1.08);
  glassShape.bezierCurveTo(-0.42, 1.09, -0.65, 1.02, -0.98, 0.74);

  const glassGeo = new THREE.ExtrudeGeometry(glassShape, {
    depth: 1.32,
    curveSegments: 14,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  glassGeo.translate(0, 0, -0.66);
  glassGeo.rotateY(-Math.PI / 2);
  const greenhouse = new THREE.Mesh(glassGeo, glassMat);
  greenhouse.position.y = 0.012;
  bodyPivot.add(greenhouse);

  // Gloss-black B-pillar divider between front and rear doors
  [-0.69, 0.69].forEach((bx) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.30, 0.09), trimBlackMat);
    pillar.position.set(bx, 0.90, -0.14);
    pillar.rotation.z = bx > 0 ? 0.22 : -0.22;
    bodyPivot.add(pillar);
  });

  // Sculpted Hood Power-Bulge & Twin Center Creases (body-red)
  const hoodBulge = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.90), paintMat);
  hoodBulge.position.set(0, 0.67, 0.96);
  hoodBulge.rotation.x = 0.09;
  bodyPivot.add(hoodBulge);

  // 6. Red Body-Colored Aerodynamic Side-View Mirrors
  [-1, 1].forEach((side) => {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.05), trimBlackMat);
    stalk.position.set(side * 0.84, 0.72, 0.36);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.095, 0.13), paintMat);
    housing.position.set(side * 0.93, 0.74, 0.34);
    housing.rotation.y = side * -0.16;
    housing.castShadow = true;
    bodyPivot.add(stalk, housing);
  });

  // 7. Signature Dodge Charger Front Fascia (+Z): Split Crosshair Grille, Lower Intakes & C-Loop White LED DRLs
  // Main matte-black upper grille recess
  const upperGrille = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.18, 0.08), trimBlackMat);
  upperGrille.position.set(0, 0.45, 1.62);
  bodyPivot.add(upperGrille);

  // Horizontal grille slats + signature central crosshair post
  [-0.045, 0.045].forEach((gy) => {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.024, 0.09), satinWingMat);
    slat.position.set(0, 0.45 + gy, 1.63);
    bodyPivot.add(slat);
  });
  const crosshairPost = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.17, 0.095), satinWingMat);
  crosshairPost.position.set(0, 0.45, 1.635);
  bodyPivot.add(crosshairPost);

  // Lower central wide air dam + outer side bumper vents
  const lowerCenterVent = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.13, 0.08), trimBlackMat);
  lowerCenterVent.position.set(0, 0.25, 1.61);
  bodyPivot.add(lowerCenterVent);

  [-0.64, 0.64].forEach((vx) => {
    const sideVent = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.08), trimBlackMat);
    sideVent.position.set(vx, 0.25, 1.59);
    sideVent.rotation.y = vx > 0 ? -0.18 : 0.18;
    bodyPivot.add(sideVent);
  });

  // C-Shaped White LED Headlights (top bar, bottom bar, outer wrap vertical blade)
  [-1, 1].forEach((side) => {
    const hx = side * 0.65;
    const yawAng = side > 0 ? -0.22 : 0.22;

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.11), trimBlackMat);
    housing.position.set(hx, 0.46, 1.56);
    housing.rotation.y = yawAng;

    const topDrl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.026, 0.06), headlightMat);
    topDrl.position.set(hx, 0.505, 1.60);
    topDrl.rotation.y = yawAng;

    const botDrl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.026, 0.06), headlightMat);
    botDrl.position.set(hx, 0.415, 1.60);
    botDrl.rotation.y = yawAng;

    const outerDrl = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.115, 0.07), headlightMat);
    outerDrl.position.set(hx + side * 0.155, 0.46, 1.565);
    outerDrl.rotation.y = yawAng;

    bodyPivot.add(housing, topDrl, botDrl, outerDrl);
  });

  // 8. Rear Black Diffuser + Racetrack Full-Width LED Tail-Light Bar (-Z)
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.18, 0.16), trimBlackMat);
  diffuser.position.set(0, 0.25, -1.56);
  bodyPivot.add(diffuser);

  [-0.48, -0.16, 0.16, 0.48].forEach((fx) => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.21), satinWingMat);
    fin.position.set(fx, 0.24, -1.59);
    bodyPivot.add(fin);
  });

  const tailHousing = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.15, 0.09), trimBlackMat);
  tailHousing.position.set(0, 0.56, -1.59);
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.065, 0.05), taillightMat);
  tailBar.position.set(0, 0.56, -1.62);
  bodyPivot.add(tailHousing, tailBar);

  // 9. Satin-Black Pedestal GT Rear Wing on Trunk Lid
  [-0.46, 0.46].forEach((sx) => {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.30, 0.18), satinWingMat);
    pylon.position.set(sx, 0.85, -1.36);
    pylon.rotation.x = 0.14;
    bodyPivot.add(pylon);
  });
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.05, 0.32), satinWingMat);
  wingBlade.position.set(0, 1.01, -1.42);
  wingBlade.rotation.x = 0.11;
  wingBlade.castShadow = true;
  bodyPivot.add(wingBlade);

  [-0.87, 0.87].forEach((ex) => {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.20, 0.36), satinWingMat);
    endplate.position.set(ex, 1.00, -1.42);
    endplate.castShadow = true;
    bodyPivot.add(endplate);
  });

  // 10. Twin Polished Chrome Exhaust Pipes + Dynamic Nitro Flame Cones
  const makeExhaust = (x: number) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.20, 14), chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.26, -1.62);
    bodyPivot.add(pipe);

    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.21, 12), trimBlackMat);
    inner.rotation.x = Math.PI / 2;
    inner.position.set(x, 0.26, -1.625);
    bodyPivot.add(inner);

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.46, 10), flameMat);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0.26, -1.87);
    bodyPivot.add(flame);
    return flame;
  };
  const thrusterFlameL = makeExhaust(-0.36);
  const thrusterFlameR = makeExhaust(0.36);

  // 11. Deep-Dish Chrome Lip Wheels: Lathe Low-Profile Tire + Deep Chrome Step Lip + 5-Spoke Star Center + Red Caliper
  const tireRadius = 0.34;
  const tireHalfW = 0.165;
  const tirePoints = [
    new THREE.Vector2(0.225, -tireHalfW * 0.92),
    new THREE.Vector2(0.295, -tireHalfW),
    new THREE.Vector2(tireRadius, -tireHalfW * 0.84),
    new THREE.Vector2(tireRadius, tireHalfW * 0.84),
    new THREE.Vector2(0.295, tireHalfW),
    new THREE.Vector2(0.225, tireHalfW * 0.92),
  ];
  const latheTireGeo = new THREE.LatheGeometry(tirePoints, 24);
  latheTireGeo.rotateZ(Math.PI / 2);

  // Deep-dish polished chrome barrel lip profile
  const dishPoints = [
    new THREE.Vector2(0.185, -tireHalfW * 0.72),
    new THREE.Vector2(0.230, -tireHalfW * 0.86),
    new THREE.Vector2(0.230, tireHalfW * 0.86),
    new THREE.Vector2(0.195, tireHalfW * 0.65),
    new THREE.Vector2(0.185, 0.02),
  ];
  const deepDishGeo = new THREE.LatheGeometry(dishPoints, 24);
  deepDishGeo.rotateZ(Math.PI / 2);

  const spokeGeo = new THREE.BoxGeometry(0.032, 0.37, 0.052);

  const makeWheel = (x: number, z: number): { steer: THREE.Group; spin: THREE.Group } => {
    const steer = new THREE.Group();
    steer.position.set(x, tireRadius, z);

    // Stationary brake rotor & painted red caliper inside wheel hub
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.035, 18), rotorMat);
    rotor.rotation.z = Math.PI / 2;
    rotor.position.x = x > 0 ? -0.02 : 0.02;
    steer.add(rotor);

    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.085), caliperMat);
    caliper.position.set(x > 0 ? 0.01 : -0.01, 0.04, -0.11);
    steer.add(caliper);

    const spin = new THREE.Group();
    steer.add(spin);

    const tire = new THREE.Mesh(latheTireGeo, tireMat);
    tire.castShadow = true;
    spin.add(tire);

    const chromeLip = new THREE.Mesh(deepDishGeo, chromeMat);
    spin.add(chromeLip);

    const rimHub = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.22, 14), chromeMat);
    rimHub.rotation.z = Math.PI / 2;
    spin.add(rimHub);

    // Recessed 5-spoke star pattern facing outward
    const spokeX = x > 0 ? 0.045 : -0.045;
    for (let i = 0; i < 5; i++) {
      const baseAngle = (i * Math.PI * 2) / 5;
      const spoke = new THREE.Mesh(spokeGeo, spokeSilverMat);
      spoke.position.x = spokeX;
      spoke.rotation.x = baseAngle;
      spin.add(spoke);
    }

    root.add(steer);
    return { steer, spin };
  };

  const fl = makeWheel(-0.82, wheelZ);
  const fr = makeWheel(0.82, wheelZ);
  const rl = makeWheel(-0.82, -wheelZ);
  const rr = makeWheel(0.82, -wheelZ);

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

/**
 * Translucent holographic GT Supercar rig used for Ghost Replay playback.
 * Uses depthWrite: false and elevated renderOrder so it blends cleanly over track surfaces.
 */
export function createGhostCarModel(contactShadowMap: THREE.Texture): GhostRig {
  const baseRig = createPlayerModel(contactShadowMap);
  baseRig.root.visible = false;

  // Hide exhaust flame cones on the ghost rig
  baseRig.thrusterFlameL.visible = false;
  baseRig.thrusterFlameR.visible = false;

  const ghostShellMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0.25,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  const ghostDarkMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x0369a1,
    emissiveIntensity: 0.45,
    roughness: 0.4,
    metalness: 0.15,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });

  const ghostGlowMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });

  const ghostShadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });

  const originalMaterials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();

  baseRig.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.renderOrder = 6;
      geometries.add(obj.geometry);

      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => originalMaterials.add(m));
      } else if (obj.material) {
        originalMaterials.add(obj.material);
      }

      if (obj === baseRig.contactShadow) {
        obj.material = ghostShadowMat;
      } else if (obj.material === baseRig.headlightMat || obj.material === baseRig.taillightMat) {
        obj.material = ghostGlowMat;
      } else if (
        obj.parent === baseRig.wheelFL ||
        obj.parent === baseRig.wheelFR ||
        obj.parent === baseRig.wheelRL ||
        obj.parent === baseRig.wheelRR
      ) {
        obj.material = ghostDarkMat;
      } else {
        obj.material = ghostShellMat;
      }
    }
  });

  // Dispose replaced opaque materials immediately so they don't leak
  originalMaterials.forEach((m) => m.dispose());

  return {
    root: baseRig.root,
    bodyPivot: baseRig.bodyPivot,
    steerFL: baseRig.steerFL,
    steerFR: baseRig.steerFR,
    wheelFL: baseRig.wheelFL,
    wheelFR: baseRig.wheelFR,
    wheelRL: baseRig.wheelRL,
    wheelRR: baseRig.wheelRR,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      ghostShellMat.dispose();
      ghostDarkMat.dispose();
      ghostGlowMat.dispose();
      ghostShadowMat.dispose();
    },
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
