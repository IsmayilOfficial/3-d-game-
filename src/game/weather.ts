import * as THREE from 'three';
import { WeatherType } from './types';

interface WeatherPreset {
  skyColor: THREE.Color;
  fogDensity: number;
  sunIntensity: number;
  sunColor: THREE.Color;
  hemiIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  rimIntensity: number;
  trackRoughness: number;
  trackMetalness: number;
  traction: number;
}

const PRESETS: Record<WeatherType, WeatherPreset> = {
  clear: {
    skyColor: new THREE.Color(0x9dd5f3),
    fogDensity: 0.0046,
    sunIntensity: 2.25,
    sunColor: new THREE.Color(0xfff1d6),
    hemiIntensity: 0.85,
    hemiSky: new THREE.Color(0x93d5ff),
    hemiGround: new THREE.Color(0xc27b4a),
    rimIntensity: 0.65,
    trackRoughness: 0.72,
    trackMetalness: 0.08,
    traction: 1.0,
  },
  rain: {
    skyColor: new THREE.Color(0x6d859e),
    fogDensity: 0.0094,
    sunIntensity: 1.15,
    sunColor: new THREE.Color(0xd2e2f6),
    hemiIntensity: 0.78,
    hemiSky: new THREE.Color(0x7e9ab5),
    hemiGround: new THREE.Color(0x515b66),
    rimIntensity: 0.88,
    trackRoughness: 0.24,
    trackMetalness: 0.24,
    traction: 0.72,
  },
  fog: {
    skyColor: new THREE.Color(0xc8d3de),
    fogDensity: 0.0245,
    sunIntensity: 1.0,
    sunColor: new THREE.Color(0xe6edf5),
    hemiIntensity: 0.96,
    hemiSky: new THREE.Color(0xdbe4ee),
    hemiGround: new THREE.Color(0x8e9aa8),
    rimIntensity: 0.45,
    trackRoughness: 0.54,
    trackMetalness: 0.12,
    traction: 0.88,
  },
};

const RAIN_COUNT = 750;
const RAIN_VOL_X = 46;
const RAIN_VOL_Y = 24;
const RAIN_VOL_Z = 46;

const MIST_COUNT = 56;
const MIST_VOL_X = 110;
const MIST_VOL_Z = 120;

function createMistSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(241, 245, 249, 0.55)');
  grad.addColorStop(0.45, 'rgba(226, 232, 240, 0.24)');
  grad.addColorStop(1, 'rgba(226, 232, 240, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface WeatherTargets {
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  rimLight: THREE.DirectionalLight;
  trackMaterial: THREE.MeshStandardMaterial;
}

export class WeatherSystem {
  private targets: WeatherTargets;
  private weather: WeatherType = 'clear';
  private phaseTimer = 9;
  private rainWeight = 0;
  private fogWeight = 0;
  private currentTraction = 1.0;

  // Rain streaks (single LineSegments draw call)
  private rainPositions: Float32Array;
  private rainOffsets: Float32Array; // local x, y, z within moving volume
  private rainSpeeds: Float32Array;
  private rainGeometry: THREE.BufferGeometry;
  private rainMaterial: THREE.LineBasicMaterial;
  private rainMesh: THREE.LineSegments;

  // Drifting background mist banks for fog/rain depth
  private mistPositions: Float32Array;
  private mistOffsets: Float32Array; // local x, y, z + drift speed
  private mistTexture: THREE.CanvasTexture;
  private mistGeometry: THREE.BufferGeometry;
  private mistMaterial: THREE.PointsMaterial;
  private mistMesh: THREE.Points;

  private readonly curSkyColor = new THREE.Color(0x9dd5f3);
  private readonly curSunColor = new THREE.Color(0xfff1d6);
  private readonly curHemiSky = new THREE.Color(0x93d5ff);
  private readonly curHemiGround = new THREE.Color(0xc27b4a);

  constructor(targets: WeatherTargets) {
    this.targets = targets;

    // 1. Rain Streaks Geometry
    this.rainPositions = new Float32Array(RAIN_COUNT * 2 * 3);
    this.rainOffsets = new Float32Array(RAIN_COUNT * 3);
    this.rainSpeeds = new Float32Array(RAIN_COUNT);

    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainOffsets[i * 3] = (Math.random() - 0.5) * RAIN_VOL_X;
      this.rainOffsets[i * 3 + 1] = (Math.random() - 0.5) * RAIN_VOL_Y;
      this.rainOffsets[i * 3 + 2] = (Math.random() - 0.5) * RAIN_VOL_Z;
      this.rainSpeeds[i] = 24 + Math.random() * 9;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    const rainAttr = new THREE.BufferAttribute(this.rainPositions, 3);
    rainAttr.setUsage(THREE.DynamicDrawUsage);
    this.rainGeometry.setAttribute('position', rainAttr);

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.rainMesh = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.rainMesh.renderOrder = 8;
    this.targets.scene.add(this.rainMesh);

    // 2. Soft Volumetric Canyon Mist Banks
    this.mistPositions = new Float32Array(MIST_COUNT * 3);
    this.mistOffsets = new Float32Array(MIST_COUNT * 4);
    for (let i = 0; i < MIST_COUNT; i++) {
      this.mistOffsets[i * 4] = (Math.random() - 0.5) * MIST_VOL_X;
      this.mistOffsets[i * 4 + 1] = -2 + Math.random() * 14;
      this.mistOffsets[i * 4 + 2] = (Math.random() - 0.5) * MIST_VOL_Z;
      this.mistOffsets[i * 4 + 3] = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 2.0);
    }

    this.mistTexture = createMistSpriteTexture();
    this.mistGeometry = new THREE.BufferGeometry();
    const mistAttr = new THREE.BufferAttribute(this.mistPositions, 3);
    mistAttr.setUsage(THREE.DynamicDrawUsage);
    this.mistGeometry.setAttribute('position', mistAttr);

    this.mistMaterial = new THREE.PointsMaterial({
      map: this.mistTexture,
      color: 0xe2e8f0,
      size: 28,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });

    this.mistMesh = new THREE.Points(this.mistGeometry, this.mistMaterial);
    this.mistMesh.frustumCulled = false;
    this.mistMesh.visible = false;
    this.mistMesh.renderOrder = 7;
    this.targets.scene.add(this.mistMesh);
  }

  public getWeather(): WeatherType {
    return this.weather;
  }

  public getTractionFactor(): number {
    return this.currentTraction;
  }

  public getRainWeight(): number {
    return this.rainWeight;
  }

  public reset(): void {
    this.weather = 'clear';
    this.phaseTimer = 7.5 + Math.random() * 5.0;
    this.rainWeight = 0;
    this.fogWeight = 0;
    this.currentTraction = 1.0;

    const clear = PRESETS.clear;
    this.curSkyColor.copy(clear.skyColor);
    this.curSunColor.copy(clear.sunColor);
    this.curHemiSky.copy(clear.hemiSky);
    this.curHemiGround.copy(clear.hemiGround);

    if (this.targets.scene.background instanceof THREE.Color) {
      this.targets.scene.background.copy(clear.skyColor);
    }
    if (this.targets.scene.fog instanceof THREE.FogExp2) {
      this.targets.scene.fog.color.copy(clear.skyColor);
      this.targets.scene.fog.density = clear.fogDensity;
    }

    this.targets.sunLight.intensity = clear.sunIntensity;
    this.targets.sunLight.color.copy(clear.sunColor);
    this.targets.hemiLight.intensity = clear.hemiIntensity;
    this.targets.hemiLight.color.copy(clear.hemiSky);
    this.targets.hemiLight.groundColor.copy(clear.hemiGround);
    this.targets.rimLight.intensity = clear.rimIntensity;
    this.targets.trackMaterial.roughness = clear.trackRoughness;
    this.targets.trackMaterial.metalness = clear.trackMetalness;

    this.rainMesh.visible = false;
    this.rainMaterial.opacity = 0;
    this.mistMesh.visible = false;
    this.mistMaterial.opacity = 0;
  }

  private pickNextWeather(): WeatherType {
    if (this.weather === 'clear') {
      return Math.random() < 0.5 ? 'rain' : 'fog';
    }
    const roll = Math.random();
    if (roll < 0.55) return 'clear';
    return this.weather === 'rain' ? 'fog' : 'rain';
  }

  public update(dt: number, focusPos: THREE.Vector3, isPlaying: boolean): boolean {
    let weatherChanged = false;

    if (isPlaying) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.weather = this.pickNextWeather();
        this.phaseTimer =
          this.weather === 'clear'
            ? 12 + Math.random() * 6
            : 18 + Math.random() * 9;
        weatherChanged = true;
      }
    }

    const preset = PRESETS[this.weather];
    const rate = 1.35;

    this.rainWeight = THREE.MathUtils.damp(
      this.rainWeight,
      this.weather === 'rain' ? 1 : 0,
      rate,
      dt,
    );
    this.fogWeight = THREE.MathUtils.damp(
      this.fogWeight,
      this.weather === 'fog' ? 1 : 0,
      rate,
      dt,
    );
    this.currentTraction = THREE.MathUtils.damp(
      this.currentTraction,
      preset.traction,
      rate,
      dt,
    );

    // Smoothly blend sky background & horizon fog
    const blendAlpha = 1 - Math.exp(-rate * dt);
    this.curSkyColor.lerp(preset.skyColor, blendAlpha);
    this.curSunColor.lerp(preset.sunColor, blendAlpha);
    this.curHemiSky.lerp(preset.hemiSky, blendAlpha);
    this.curHemiGround.lerp(preset.hemiGround, blendAlpha);

    if (this.targets.scene.background instanceof THREE.Color) {
      this.targets.scene.background.copy(this.curSkyColor);
    }
    if (this.targets.scene.fog instanceof THREE.FogExp2) {
      this.targets.scene.fog.color.copy(this.curSkyColor);
      this.targets.scene.fog.density = THREE.MathUtils.damp(
        this.targets.scene.fog.density,
        preset.fogDensity,
        rate,
        dt,
      );
    }

    // Lighting & wet asphalt reflection response
    this.targets.sunLight.intensity = THREE.MathUtils.damp(
      this.targets.sunLight.intensity,
      preset.sunIntensity,
      rate,
      dt,
    );
    this.targets.sunLight.color.copy(this.curSunColor);

    this.targets.hemiLight.intensity = THREE.MathUtils.damp(
      this.targets.hemiLight.intensity,
      preset.hemiIntensity,
      rate,
      dt,
    );
    this.targets.hemiLight.color.copy(this.curHemiSky);
    this.targets.hemiLight.groundColor.copy(this.curHemiGround);

    this.targets.rimLight.intensity = THREE.MathUtils.damp(
      this.targets.rimLight.intensity,
      preset.rimIntensity,
      rate,
      dt,
    );

    this.targets.trackMaterial.roughness = THREE.MathUtils.damp(
      this.targets.trackMaterial.roughness,
      preset.trackRoughness,
      rate,
      dt,
    );
    this.targets.trackMaterial.metalness = THREE.MathUtils.damp(
      this.targets.trackMaterial.metalness,
      preset.trackMetalness,
      rate,
      dt,
    );

    // Update 3D rain streaks around the vehicle/camera focus
    if (this.rainWeight > 0.015) {
      this.rainMesh.visible = true;
      this.rainMaterial.opacity = 0.46 * this.rainWeight;

      const halfX = RAIN_VOL_X * 0.5;
      const halfY = RAIN_VOL_Y * 0.5;
      const halfZ = RAIN_VOL_Z * 0.5;
      const centerX = focusPos.x;
      const centerY = focusPos.y + 8.5;
      const centerZ = focusPos.z - 6;

      const windX = -3.4;
      const windZ = 1.6;
      const streakTime = 0.036;

      for (let i = 0; i < RAIN_COUNT; i++) {
        const idx3 = i * 3;
        const speed = this.rainSpeeds[i];
        let lx = this.rainOffsets[idx3] + windX * dt;
        let ly = this.rainOffsets[idx3 + 1] - speed * dt;
        let lz = this.rainOffsets[idx3 + 2] + windZ * dt;

        if (lx < -halfX) lx += RAIN_VOL_X;
        else if (lx > halfX) lx -= RAIN_VOL_X;
        if (ly < -halfY) ly += RAIN_VOL_Y;
        if (lz < -halfZ) lz += RAIN_VOL_Z;
        else if (lz > halfZ) lz -= RAIN_VOL_Z;

        this.rainOffsets[idx3] = lx;
        this.rainOffsets[idx3 + 1] = ly;
        this.rainOffsets[idx3 + 2] = lz;

        const wx = centerX + lx;
        const wy = centerY + ly;
        const wz = centerZ + lz;

        const pIdx = i * 6;
        this.rainPositions[pIdx] = wx;
        this.rainPositions[pIdx + 1] = wy;
        this.rainPositions[pIdx + 2] = wz;
        this.rainPositions[pIdx + 3] = wx - windX * streakTime;
        this.rainPositions[pIdx + 4] = wy + speed * streakTime;
        this.rainPositions[pIdx + 5] = wz - windZ * streakTime;
      }

      (this.rainGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    } else {
      this.rainMesh.visible = false;
    }

    // Update drifting mist banks (strong during fog, subtle low haze during rain)
    const mistStrength = Math.max(this.fogWeight, this.rainWeight * 0.28);
    if (mistStrength > 0.015) {
      this.mistMesh.visible = true;
      this.mistMaterial.opacity = 0.34 * mistStrength;
      const halfMX = MIST_VOL_X * 0.5;
      const halfMZ = MIST_VOL_Z * 0.5;
      const centerX = focusPos.x;
      const centerY = focusPos.y;
      const centerZ = focusPos.z - 22;

      for (let i = 0; i < MIST_COUNT; i++) {
        const idx4 = i * 4;
        let mx = this.mistOffsets[idx4] + this.mistOffsets[idx4 + 3] * dt;
        const my = this.mistOffsets[idx4 + 1];
        const mz = this.mistOffsets[idx4 + 2];

        if (mx < -halfMX) mx += MIST_VOL_X;
        else if (mx > halfMX) mx -= MIST_VOL_X;
        this.mistOffsets[idx4] = mx;

        const pIdx = i * 3;
        this.mistPositions[pIdx] = centerX + mx;
        this.mistPositions[pIdx + 1] = centerY + my;
        this.mistPositions[pIdx + 2] = centerZ + mz;
      }
      (this.mistGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    } else {
      this.mistMesh.visible = false;
    }

    return weatherChanged;
  }

  public dispose(): void {
    this.targets.scene.remove(this.rainMesh);
    this.targets.scene.remove(this.mistMesh);
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.mistGeometry.dispose();
    this.mistMaterial.dispose();
    this.mistTexture.dispose();
  }
}
