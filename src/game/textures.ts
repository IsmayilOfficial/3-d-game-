import * as THREE from 'three';

export interface ProceduralTextureSet {
  trackMap: THREE.CanvasTexture;
  barrierMap: THREE.CanvasTexture;
  platformMap: THREE.CanvasTexture;
  terrainMap: THREE.CanvasTexture;
  crateMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  boostChevronMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const created: THREE.CanvasTexture[] = [];

  const finalizeColorTex = (canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = Math.max(1, maxAnisotropy);
    tex.needsUpdate = true;
    created.push(tex);
    return tex;
  };

  // 1. Sunlit Circuit Asphalt / Kinetic Track Surface
  const trackCanvas = document.createElement('canvas');
  trackCanvas.width = 512;
  trackCanvas.height = 512;
  const tctx = trackCanvas.getContext('2d')!;
  tctx.fillStyle = '#262b34';
  tctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt grain
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 32 + Math.floor(Math.random() * 26);
    tctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    tctx.fillRect(x, y, 2, 2);
  }

  // Edge shoulder stripes (warm amber + crisp off-white)
  tctx.fillStyle = '#f59e0b';
  tctx.fillRect(0, 0, 18, 512);
  tctx.fillRect(494, 0, 18, 512);

  tctx.fillStyle = '#e2e8f0';
  tctx.fillRect(24, 0, 8, 512);
  tctx.fillRect(480, 0, 8, 512);

  // Center dashed lane markings
  tctx.fillStyle = '#94a3b8';
  for (let y = 16; y < 512; y += 64) {
    tctx.fillRect(252, y, 8, 34);
  }
  // Subtle tech grid seams
  tctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  tctx.lineWidth = 2;
  for (let y = 0; y <= 512; y += 128) {
    tctx.beginPath();
    tctx.moveTo(32, y);
    tctx.lineTo(480, y);
    tctx.stroke();
  }
  const trackMap = finalizeColorTex(trackCanvas, 1, 6);

  // 2. Hazard Barrier Stripes
  const barrierCanvas = document.createElement('canvas');
  barrierCanvas.width = 256;
  barrierCanvas.height = 256;
  const bctx = barrierCanvas.getContext('2d')!;
  bctx.fillStyle = '#e2e8f0';
  bctx.fillRect(0, 0, 256, 256);
  bctx.fillStyle = '#f97316';
  for (let i = -256; i < 512; i += 64) {
    bctx.beginPath();
    bctx.moveTo(i, 0);
    bctx.lineTo(i + 32, 0);
    bctx.lineTo(i - 64, 256);
    bctx.lineTo(i - 96, 256);
    bctx.closePath();
    bctx.fill();
  }
  bctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
  bctx.fillRect(0, 0, 256, 26);
  bctx.fillRect(0, 230, 256, 26);
  const barrierMap = finalizeColorTex(barrierCanvas, 3, 1);

  // 3. Elevated Metallic Skyway Platform Grid
  const platCanvas = document.createElement('canvas');
  platCanvas.width = 256;
  platCanvas.height = 256;
  const pctx = platCanvas.getContext('2d')!;
  pctx.fillStyle = '#334155';
  pctx.fillRect(0, 0, 256, 256);
  pctx.strokeStyle = '#475569';
  pctx.lineWidth = 4;
  for (let i = 0; i <= 256; i += 64) {
    pctx.beginPath();
    pctx.moveTo(i, 0);
    pctx.lineTo(i, 256);
    pctx.stroke();
    pctx.beginPath();
    pctx.moveTo(0, i);
    pctx.lineTo(256, i);
    pctx.stroke();
  }
  pctx.fillStyle = '#38bdf8';
  pctx.fillRect(8, 8, 12, 12);
  pctx.fillRect(236, 8, 12, 12);
  pctx.fillRect(8, 236, 12, 12);
  pctx.fillRect(236, 236, 12, 12);
  const platformMap = finalizeColorTex(platCanvas, 2, 2);

  // 4. Sunlit Canyon / Desert Stone Terrain
  const terCanvas = document.createElement('canvas');
  terCanvas.width = 512;
  terCanvas.height = 512;
  const rctx = terCanvas.getContext('2d')!;
  rctx.fillStyle = '#c88c5c';
  rctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const warm = Math.random() > 0.5;
    rctx.fillStyle = warm ? 'rgba(168, 102, 58, 0.25)' : 'rgba(229, 178, 126, 0.22)';
    rctx.fillRect(x, y, 3 + Math.random() * 5, 2 + Math.random() * 3);
  }
  // Subtle strata lines
  rctx.strokeStyle = 'rgba(130, 74, 42, 0.16)';
  rctx.lineWidth = 3;
  for (let y = 20; y < 512; y += 44) {
    rctx.beginPath();
    rctx.moveTo(0, y);
    rctx.bezierCurveTo(170, y + 8, 340, y - 8, 512, y);
    rctx.stroke();
  }
  const terrainMap = finalizeColorTex(terCanvas, 24, 24);

  // 5. Industrial Physics Crate
  const crateCanvas = document.createElement('canvas');
  crateCanvas.width = 256;
  crateCanvas.height = 256;
  const cctx = crateCanvas.getContext('2d')!;
  cctx.fillStyle = '#b45309';
  cctx.fillRect(0, 0, 256, 256);
  cctx.strokeStyle = '#78350f';
  cctx.lineWidth = 18;
  cctx.strokeRect(9, 9, 238, 238);
  cctx.beginPath();
  cctx.moveTo(18, 18);
  cctx.lineTo(238, 238);
  cctx.moveTo(238, 18);
  cctx.lineTo(18, 238);
  cctx.stroke();
  cctx.fillStyle = '#f59e0b';
  cctx.fillRect(92, 92, 72, 72);
  cctx.fillStyle = '#451a03';
  cctx.fillRect(108, 108, 40, 40);
  const crateMap = finalizeColorTex(crateCanvas, 1, 1);

  // 6. Soft Radial Contact Shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(10, 15, 25, 0.72)');
  grad.addColorStop(0.55, 'rgba(10, 15, 25, 0.28)');
  grad.addColorStop(1, 'rgba(10, 15, 25, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;
  contactShadowMap.needsUpdate = true;
  created.push(contactShadowMap);

  // 7. Boost Pad Glowing Chevrons
  const boostCanvas = document.createElement('canvas');
  boostCanvas.width = 256;
  boostCanvas.height = 256;
  const xctx = boostCanvas.getContext('2d')!;
  xctx.fillStyle = '#082f49';
  xctx.fillRect(0, 0, 256, 256);
  xctx.strokeStyle = '#38bdf8';
  xctx.lineWidth = 18;
  xctx.lineCap = 'round';
  xctx.lineJoin = 'round';
  for (let y = 55; y <= 215; y += 78) {
    xctx.beginPath();
    xctx.moveTo(42, y + 36);
    xctx.lineTo(128, y - 24);
    xctx.lineTo(214, y + 36);
    xctx.stroke();
  }
  const boostChevronMap = finalizeColorTex(boostCanvas, 1, 1);

  return {
    trackMap,
    barrierMap,
    platformMap,
    terrainMap,
    crateMap,
    contactShadowMap,
    boostChevronMap,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
