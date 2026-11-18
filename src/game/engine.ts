import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GameAudio } from './audio';
import { buildLevel, BuiltLevel } from './level';
import { createGhostCarModel, createPlayerModel, GhostRig, PlayerRig } from './models';
import { CharacterController, CharacterInput, groundHeightAt } from './physics';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import { BestLapGhostData, GamePhase, GhostFrame, HudSnapshot, MinimapTrackRect } from './types';
import { WeatherSystem } from './weather';

// Pre-allocated math helpers (zero GC in render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

interface ParticleSlot {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

const PARTICLE_COUNT = 72;

export class StriderGameEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private envTex: THREE.Texture;
  private textures: ProceduralTextureSet;
  private level: BuiltLevel;
  private weather: WeatherSystem;
  private playerRig: PlayerRig;
  private ghostRig: GhostRig;
  private controller: CharacterController;
  public audio: GameAudio;

  private particlesMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private staticTrackRects: MinimapTrackRect[] = [];

  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private hudEmitTimer = 0;

  // Game state
  private phase: GamePhase = 'title';
  private elapsedTime = 0;
  private bestTime: number | null = null;
  private health = 3;
  private readonly maxHealth = 3;
  private invulnTimer = 0;
  private hitstopTimer = 0;
  private combo = 0;
  private comboTimer = 0;
  private readonly comboDuration = 4.5;
  private score = 0;
  private bestCombo = 0;
  private comboEventLabel = '';
  private nearMissCooldowns = new Map<string, number>();
  private lastCollisionHitFrame = false;
  private currentLap = 1;
  private readonly totalLaps = 3;
  private circuitsCompleted = 0;
  private checkpointIndex = 0;
  private orbsCollected = 0;
  private currentSector = 'SECTOR 1 · START PLAZA';
  private cameraMode: 'chase' | 'dynamic' = 'dynamic';

  // Ghost Replay state (best lap recording & playback)
  private lapElapsedTime = 0;
  private currentLapFrames: GhostFrame[] = [];
  private ghostRecordTimer = 0;
  private bestLapGhost: BestLapGhostData | null = null;
  private ghostCursor = 0;
  private ghostEnabled = true;

  // Animation & camera juice
  private squashY = 1;
  private squashXZ = 1;
  private runCycle = 0;
  private cameraYaw = 0;
  private cameraPitch = 0.34;
  private cameraDist = 9.2;
  private shakeTrauma = 0;
  private titlePanAngle = 0;
  private boostFovTimer = 0;

  // Input state
  private heldKeys = new Set<string>();
  private jumpJustPressed = false;
  private dashJustPressed = false;
  private draggingCamera = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Virtual touch controls
  private virtualMoveX = 0;
  private virtualMoveZ = 0;

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.audio = new GameAudio();

    try {
      const saved = localStorage.getItem('apex_strider_best_time');
      if (saved) this.bestTime = parseFloat(saved);
      const savedCircuits = localStorage.getItem('apex_strider_circuits_completed');
      if (savedCircuits) {
        const parsed = parseInt(savedCircuits, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) this.circuitsCompleted = parsed;
      }
      this.bestLapGhost = this.loadBestLapGhost();
    } catch {
      // Ignore storage errors
    }

    // 1. Software WebGL probe (renderer string only, context freed immediately)
    this.isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) ?? '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 2. WebGLRenderer setup with safe fallback
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      this.renderer = new THREE.WebGLRenderer({ antialias: false });
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const initW = Math.max(1, container.clientWidth || window.innerWidth || 1280);
    const initH = Math.max(1, container.clientHeight || window.innerHeight || 720);
    this.renderer.setSize(initW, initH);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 3. Scene, Sky & Fog
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x9dd5f3);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x9dd5f3, 0.0046);

    // 4. Camera
    this.camera = new THREE.PerspectiveCamera(62, initW / initH, 0.2, 420);

    // 5. Mandatory Studio RoomEnvironment PMREM
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envTex = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envTex;
    roomEnv.dispose();
    pmrem.dispose();

    // 6. Warm/Cool 3-Point Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x93d5ff, 0xc27b4a, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.25);
    this.sunLight.position.set(28, 42, 24);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    const d = 26;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 110;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.65);
    this.rimLight.position.set(-25, 18, -35);
    this.scene.add(this.rimLight);

    // 7. Textures, Level, Weather, Player & Pooled Particles
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.level = buildLevel(this.textures);
    this.scene.add(this.level.group);

    this.weather = new WeatherSystem({
      scene: this.scene,
      sunLight: this.sunLight,
      hemiLight: this.hemiLight,
      rimLight: this.rimLight,
      trackMaterial: this.level.trackMaterial,
    });

    this.staticTrackRects = [
      ...this.level.staticColliders
        .filter((c) => c.tag === 'ground')
        .map((c) => ({
          minX: c.minX,
          maxX: c.maxX,
          minZ: c.minZ,
          maxZ: c.maxZ,
          kind: 'deck' as const,
        })),
      ...this.level.ramps.map((r) => ({
        minX: r.minX,
        maxX: r.maxX,
        minZ: r.minZ,
        maxZ: r.maxZ,
        kind: 'ramp' as const,
      })),
    ];

    this.playerRig = createPlayerModel(this.textures.contactShadowMap);
    this.scene.add(this.playerRig.root);

    this.ghostRig = createGhostCarModel(this.textures.contactShadowMap);
    this.scene.add(this.ghostRig.root);

    this.controller = new CharacterController();
    this.resetRunState();

    // Pooled InstancedMesh particles
    const pGeo = new THREE.DodecahedronGeometry(0.18, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particlesMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_COUNT);
    this.particlesMesh.frustumCulled = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.4,
        size: 1,
        color: new THREE.Color(0xffffff),
      });
      _dummy.position.set(0, -999, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.particlesMesh.setMatrixAt(i, _dummy.matrix);
      this.particlesMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particlesMesh.instanceMatrix.needsUpdate = true;
    if (this.particlesMesh.instanceColor) this.particlesMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particlesMesh);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud();
    this.scheduleNextFrame();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('webglcontextlost', this.handleContextLost);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight || 720);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }

    const wasHeld = this.heldKeys.has(e.code);
    this.heldKeys.add(e.code);

    if (!wasHeld) {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.phase === 'playing') this.pauseGame();
        else if (this.phase === 'paused') this.resumeGame();
      } else if ((e.code === 'Enter' || e.code === 'Space') && this.phase === 'title') {
        this.startGame();
      } else if (e.code === 'Space' && this.phase === 'playing') {
        this.jumpJustPressed = true;
      } else if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.phase === 'playing') {
        this.dashJustPressed = true;
      } else if (e.code === 'KeyR' && this.phase === 'playing') {
        this.respawnAtCheckpoint();
      } else if (e.code === 'KeyC' && this.phase === 'playing') {
        this.toggleCameraMode();
      } else if (e.code === 'KeyG' && this.phase === 'playing') {
        this.toggleGhost();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private handleBlur = (): void => {
    this.heldKeys.clear();
    this.draggingCamera = false;
  };

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.heldKeys.clear();
      this.draggingCamera = false;
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'playing') return;
    this.audio.unlock();
    this.draggingCamera = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.draggingCamera || this.phase !== 'playing') return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.cameraYaw -= dx * 0.0055;
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.004, 0.14, 0.78);
  };

  private handlePointerUp = (): void => {
    this.draggingCamera = false;
  };

  public setVirtualInput(x: number, z: number): void {
    this.virtualMoveX = x;
    this.virtualMoveZ = z;
  }

  public triggerVirtualJump(): void {
    this.audio.unlock();
    if (this.phase === 'playing') this.jumpJustPressed = true;
  }

  public triggerVirtualDash(): void {
    this.audio.unlock();
    if (this.phase === 'playing') this.dashJustPressed = true;
  }

  public startGame(): void {
    this.audio.unlock();
    this.resetRunState();
    this.phase = 'playing';
    this.emitHud();
  }

  public pauseGame(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.heldKeys.clear();
      this.emitHud();
    }
  }

  public resumeGame(): void {
    if (this.phase === 'paused') {
      this.phase = 'playing';
      this.lastTime = performance.now();
      this.emitHud();
    }
  }

  public toggleMute(): void {
    this.audio.toggleMute();
    this.emitHud();
  }

  public toggleCameraMode(): void {
    this.cameraMode = this.cameraMode === 'chase' ? 'dynamic' : 'chase';
    this.emitHud();
  }

  public toggleGhost(): void {
    this.ghostEnabled = !this.ghostEnabled;
    if (!this.ghostEnabled) {
      this.ghostRig.root.visible = false;
    }
    this.emitHud();
  }

  public respawnAtCheckpoint(): void {
    const cpIdx = Math.max(0, this.checkpointIndex - 1);
    const spawnPos =
      this.checkpointIndex > 0
        ? new THREE.Vector3(
            this.level.checkpoints[cpIdx].position.x,
            this.level.checkpoints[cpIdx].position.y + 0.35,
            this.level.checkpoints[cpIdx].position.z,
          )
        : new THREE.Vector3(0, 0.25, 12);

    this.controller.reset(spawnPos, Math.PI);
    this.cameraYaw = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboEventLabel = '';
    this.spawnBurst(spawnPos, 0x38bdf8, 14, 6);
    this.emitHud();
  }

  private resetRunState(): void {
    this.elapsedTime = 0;
    this.health = this.maxHealth;
    this.invulnTimer = 0;
    this.hitstopTimer = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.score = 0;
    this.bestCombo = 0;
    this.comboEventLabel = '';
    this.nearMissCooldowns.clear();
    this.lastCollisionHitFrame = false;
    this.currentLap = 1;
    this.checkpointIndex = 0;
    this.orbsCollected = 0;
    this.currentSector = 'SECTOR 1 · START PLAZA';
    this.cameraYaw = 0;
    this.cameraPitch = 0.34;
    this.shakeTrauma = 0;
    this.boostFovTimer = 0;

    this.controller.reset(new THREE.Vector3(0, 0.25, 12), Math.PI);
    this.playerRig.root.position.copy(this.controller.position);
    this.playerRig.root.rotation.y = this.controller.yaw;
    this.weather.reset();
    this.resetLapGhostState();

    // Reset checkpoints
    this.level.checkpoints.forEach((cp, idx) => {
      cp.cleared = false;
      const isFinish = idx === this.level.checkpoints.length - 1;
      const mat = cp.ringMesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(isFinish ? 0xfbbf24 : 0x38bdf8);
      mat.emissive.setHex(isFinish ? 0xf59e0b : 0x0284c7);
    });

    // Reset orbs
    this.level.orbs.forEach((orb) => {
      orb.collected = false;
      orb.mesh.visible = true;
    });

    // Reset crates
    this.level.crates.forEach((crate, idx) => {
      const init = this.level.initialCratePositions[idx];
      crate.position.set(init.x, init.y, init.z);
      crate.velocity.set(0, 0, 0);
      const h = crate.halfSize;
      crate.collider.minX = init.x - h;
      crate.collider.maxX = init.x + h;
      crate.collider.minY = init.y;
      crate.collider.maxY = init.y + h * 2;
      crate.collider.minZ = init.z - h;
      crate.collider.maxZ = init.z + h;
      crate.mesh.position.copy(crate.position);
    });

    // Reset hazards
    this.level.hazards.forEach((hz) => {
      hz.hitCooldown = 0;
      hz.telegraphTimer = 0;
    });
  }

  private spawnBurst(origin: THREE.Vector3, hexColor: number, count: number, speed: number): void {
    let spawned = 0;
    for (let i = 0; i < PARTICLE_COUNT && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(origin);
        p.pos.y += 0.25;
        const theta = Math.random() * Math.PI * 2;
        const up = 0.25 + Math.random() * 0.85;
        const spd = speed * (0.45 + Math.random() * 0.7);
        p.vel.set(Math.cos(theta) * spd, up * spd, Math.sin(theta) * spd);
        p.maxLife = 0.28 + Math.random() * 0.24;
        p.life = p.maxLife;
        p.size = 0.65 + Math.random() * 0.8;
        p.color.setHex(hexColor);
        spawned++;
      }
    }
  }

  private updateMovingWorld(dt: number, totalTime: number): void {
    // Moving platforms
    for (let i = 0; i < this.level.movingPlatforms.length; i++) {
      const plat = this.level.movingPlatforms[i];
      const prevX = plat.mesh.position.x;
      const prevY = plat.mesh.position.y;
      const prevZ = plat.mesh.position.z;

      const offset = Math.sin(totalTime * plat.speed + plat.phaseOffset) * plat.amplitude;
      plat.mesh.position.copy(plat.origin);
      if (plat.axis === 'x') plat.mesh.position.x += offset;
      else if (plat.axis === 'y') plat.mesh.position.y += offset;
      else plat.mesh.position.z += offset;

      plat.deltaPos.set(
        plat.mesh.position.x - prevX,
        plat.mesh.position.y - prevY,
        plat.mesh.position.z - prevZ,
      );

      plat.collider.minX += plat.deltaPos.x;
      plat.collider.maxX += plat.deltaPos.x;
      plat.collider.minY += plat.deltaPos.y;
      plat.collider.maxY += plat.deltaPos.y;
      plat.collider.minZ += plat.deltaPos.z;
      plat.collider.maxZ += plat.deltaPos.z;
    }

    // Crates slide & friction
    for (let i = 0; i < this.level.crates.length; i++) {
      const crate = this.level.crates[i];
      if (crate.velocity.lengthSq() > 0.001) {
        const dx = crate.velocity.x * dt;
        const dz = crate.velocity.z * dt;
        crate.position.x = THREE.MathUtils.clamp(crate.position.x + dx, -6.2, 6.2);
        crate.position.z += dz;
        crate.velocity.multiplyScalar(Math.exp(-8.5 * dt));

        const h = crate.halfSize;
        crate.collider.minX = crate.position.x - h;
        crate.collider.maxX = crate.position.x + h;
        crate.collider.minZ = crate.position.z - h;
        crate.collider.maxZ = crate.position.z + h;
        crate.mesh.position.copy(crate.position);
      }
    }

    // Checkpoint holographic rings
    for (let i = 0; i < this.level.checkpoints.length; i++) {
      const cp = this.level.checkpoints[i];
      cp.ringMesh.rotation.y += dt * (cp.cleared ? 2.8 : 1.3);
      cp.ringMesh.rotation.z = Math.sin(totalTime * 1.5 + i) * 0.12;
    }

    // Collectible orbs bob & spin
    for (let i = 0; i < this.level.orbs.length; i++) {
      const orb = this.level.orbs[i];
      if (!orb.collected) {
        orb.mesh.position.y = orb.position.y + Math.sin(totalTime * 3.1 + orb.phase) * 0.22;
        orb.mesh.rotation.y += dt * 2.2;
      }
    }

    // Boost pad chevron scroll
    this.textures.boostChevronMap.offset.y -= dt * 1.8;

    // Hazards patrol + windup telegraph
    for (let i = 0; i < this.level.hazards.length; i++) {
      const hz = this.level.hazards[i];
      if (hz.hitCooldown > 0) hz.hitCooldown = Math.max(0, hz.hitCooldown - dt);

      if (hz.type === 'drone') {
        const wave = Math.sin(totalTime * hz.speed + hz.phase);
        const targetOffset = wave * hz.patrolRange;
        hz.position.copy(hz.origin);
        if (hz.patrolAxis === 'x') hz.position.x += targetOffset;
        else hz.position.z += targetOffset;

        hz.position.y = hz.origin.y + Math.sin(totalTime * 4.2 + hz.phase) * 0.18;
        hz.mesh.position.copy(hz.position);

        // Telegraph windup near turning points
        const nearTurn = Math.abs(wave) > 0.85;
        if (hz.windupRing) {
          const s = nearTurn ? 1.28 + Math.sin(totalTime * 18) * 0.14 : 1.0;
          hz.windupRing.scale.setScalar(s);
          (hz.windupRing.material as THREE.MeshBasicMaterial).opacity = nearTurn ? 0.82 : 0.35;
        }
        const gyro = hz.mesh.getObjectByName('gyro');
        if (gyro) {
          gyro.rotation.y += dt * (nearTurn ? 7.5 : 3.2);
        }
      } else {
        // Rotating Sweeper Arm
        hz.mesh.rotation.y += hz.speed * dt;
      }
    }
  }

  private updateGameplayInteractions(dt: number): void {
    const pos = this.controller.position;

    // 1. Boost pads
    for (let i = 0; i < this.level.boostPads.length; i++) {
      const pad = this.level.boostPads[i];
      if (pad.cooldown > 0) pad.cooldown = Math.max(0, pad.cooldown - dt);
      if (
        pad.cooldown <= 0 &&
        Math.abs(pos.x - pad.position.x) <= pad.halfExtents.x &&
        Math.abs(pos.z - pad.position.z) <= pad.halfExtents.z &&
        Math.abs(pos.y - pad.position.y) <= 1.2
      ) {
        pad.cooldown = 0.45;
        this.controller.velocity.x = pad.direction.x * pad.boostSpeed;
        this.controller.velocity.z = pad.direction.z * pad.boostSpeed;
        this.controller.velocity.y = Math.max(this.controller.velocity.y, 4.5);
        this.boostFovTimer = 0.65;
        this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.32);
        this.audio.playBoostPad();
        this.spawnBurst(pos, 0x38bdf8, 16, 9);
        if (this.combo > 0) {
          this.comboTimer = this.comboDuration;
          this.score += 100 * this.getComboMultiplier();
        }
      }
    }

    // 2. Collectible orbs
    for (let i = 0; i < this.level.orbs.length; i++) {
      const orb = this.level.orbs[i];
      if (orb.collected) continue;
      const distSq =
        (pos.x - orb.position.x) ** 2 +
        (pos.y + 0.9 - orb.position.y) ** 2 +
        (pos.z - orb.position.z) ** 2;
      if (distSq <= 2.35) {
        orb.collected = true;
        orb.mesh.visible = false;
        this.orbsCollected++;
        this.awardCombo(120, 'ENERGY CORE', 0xfbbf24, false);
        this.audio.playOrbPickup(this.combo);
        this.spawnBurst(orb.position, 0xfbbf24, 12, 6.5);
      }
    }

    // 3. Checkpoints & Finish Arch
    for (let i = 0; i < this.level.checkpoints.length; i++) {
      const cp = this.level.checkpoints[i];
      if (cp.cleared) continue;
      const dx = pos.x - cp.position.x;
      const dz = pos.z - cp.position.z;
      const dy = Math.abs(pos.y - cp.position.y);
      if (dx * dx + dz * dz <= cp.radius * cp.radius && dy < 4.5 && Math.abs(dz) < 2.2) {
        cp.cleared = true;
        this.checkpointIndex = Math.max(this.checkpointIndex, i + 1);
        this.currentSector = cp.sectorName;
        const mat = cp.ringMesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(0x22c55e);
        mat.emissive.setHex(0x16a34a);

        if (i === this.level.checkpoints.length - 1) {
          this.finalizeLapGhost();
          this.circuitsCompleted++;
          try {
            localStorage.setItem('apex_strider_circuits_completed', String(this.circuitsCompleted));
          } catch {
            // Ignore storage errors
          }

          if (this.currentLap < this.totalLaps) {
            this.advanceToNextLap();
          } else {
            // Final lap complete -> Victory!
            this.phase = 'victory';
            this.ghostRig.root.visible = false;
            if (this.bestTime === null || this.elapsedTime < this.bestTime) {
              this.bestTime = this.elapsedTime;
              try {
                localStorage.setItem('apex_strider_best_time', this.bestTime.toFixed(2));
              } catch {
                // Ignore storage errors
              }
            }
            this.audio.playVictory();
            this.spawnBurst(pos, 0xfbbf24, 32, 11);
            this.emitHud();
          }
          break;
        } else {
          this.audio.playCheckpoint();
          this.spawnBurst(cp.position, 0x22c55e, 18, 7.5);
        }
      }
    }

    // 4. Hazard collisions (Sentinel Drones & Rotating Sweepers)
    if (this.invulnTimer <= 0 && this.controller.dashTimer <= 0) {
      for (let i = 0; i < this.level.hazards.length; i++) {
        const hz = this.level.hazards[i];
        if (hz.hitCooldown > 0) continue;

        let hit = false;
        _vec3A.set(0, 0, 0);

        if (hz.type === 'drone') {
          const dx = pos.x - hz.position.x;
          const dz = pos.z - hz.position.z;
          const dy = pos.y + 0.8 - (hz.position.y + 1.0);
          const dSq = dx * dx + dz * dz + dy * dy;
          const rSum = hz.radius + this.controller.radius;
          if (dSq < rSum * rSum) {
            hit = true;
            _vec3A.set(dx, 0.5, dz).normalize();
          }
        } else {
          // Sweeper rotating beam segment test
          const angle = hz.mesh.rotation.y;
          const dirX = Math.cos(angle);
          const dirZ = -Math.sin(angle);
          const relX = pos.x - hz.position.x;
          const relZ = pos.z - hz.position.z;
          const proj = THREE.MathUtils.clamp(relX * dirX + relZ * dirZ, -hz.patrolRange, hz.patrolRange);
          const closestX = hz.position.x + dirX * proj;
          const closestZ = hz.position.z + dirZ * proj;
          const distX = pos.x - closestX;
          const distZ = pos.z - closestZ;
          const dy = pos.y - hz.position.y;
          if (dy > -0.4 && dy < 1.35 && distX * distX + distZ * distZ < (0.45 + this.controller.radius) ** 2) {
            hit = true;
            _vec3A.set(distX, 0.45, distZ).normalize();
          }
        }

        if (hit) {
          this.lastCollisionHitFrame = true;
          hz.hitCooldown = 0.6;
          this.health = Math.max(0, this.health - 1);
          this.invulnTimer = 1.1;
          this.hitstopTimer = 0.055; // 55ms crisp hitstop
          this.combo = 0;
          this.comboTimer = 0;
          this.comboEventLabel = '';
          this.shakeTrauma = 0.85;
          this.controller.velocity.x = _vec3A.x * 14;
          this.controller.velocity.z = _vec3A.z * 14;
          this.controller.velocity.y = 8.5;
          this.controller.grounded = false;
          this.audio.playDamage();
          this.spawnBurst(pos, 0xef4444, 22, 9.5);

          if (this.health <= 0) {
            this.phase = 'gameover';
          }
          this.emitHud();
          break;
        }
      }
    }

    // 4b. Near-Miss Obstacle Detection (Hazards, Track Pillars, Crates)
    this.updateNearMissChecks(dt, pos);

    // 5. Out-of-bounds canyon fall recovery
    const terrainFloor = groundHeightAt(pos.x, pos.z);
    if (pos.y <= terrainFloor + 0.35 && pos.z < -6) {
      this.respawnAtCheckpoint();
    }
  }

  private getComboMultiplier(): number {
    return this.combo <= 0 ? 1 : Math.min(10, this.combo);
  }

  private awardCombo(
    basePoints: number,
    label: string,
    burstColor: number,
    playNearMissChime: boolean,
  ): void {
    this.combo++;
    if (this.combo > this.bestCombo) {
      this.bestCombo = this.combo;
    }
    this.comboTimer = this.comboDuration;
    this.comboEventLabel = label;
    this.score += basePoints * this.getComboMultiplier();
    if (playNearMissChime) {
      this.audio.playNearMiss(this.combo);
      this.spawnBurst(this.controller.position, burstColor, 10, 6.2);
    }
    this.emitHud();
  }

  private updateNearMissChecks(dt: number, pos: THREE.Vector3): void {
    this.nearMissCooldowns.forEach((remaining, key) => {
      const next = remaining - dt;
      if (next <= 0) this.nearMissCooldowns.delete(key);
      else this.nearMissCooldowns.set(key, next);
    });

    const horizSpeed = Math.hypot(this.controller.velocity.x, this.controller.velocity.z);
    if (this.lastCollisionHitFrame || this.invulnTimer > 0 || horizSpeed < 5.8) {
      return;
    }

    // Check moving hazards (Sentinel Drones & Rotating Sweepers)
    for (let i = 0; i < this.level.hazards.length; i++) {
      const hz = this.level.hazards[i];
      if (hz.hitCooldown > 0 || this.nearMissCooldowns.has(hz.id)) continue;

      if (hz.type === 'drone') {
        const dx = pos.x - hz.position.x;
        const dz = pos.z - hz.position.z;
        const dy = pos.y + 0.8 - (hz.position.y + 1.0);
        const dSq = dx * dx + dz * dz + dy * dy;
        const hitR = hz.radius + this.controller.radius;
        const nearR = hitR + 1.85;
        if (dSq >= hitR * hitR && dSq <= nearR * nearR) {
          this.nearMissCooldowns.set(hz.id, 2.2);
          this.awardCombo(250, 'DRONE NEAR MISS', 0x38bdf8, true);
          return;
        }
      } else {
        const angle = hz.mesh.rotation.y;
        const dirX = Math.cos(angle);
        const dirZ = -Math.sin(angle);
        const relX = pos.x - hz.position.x;
        const relZ = pos.z - hz.position.z;
        const proj = THREE.MathUtils.clamp(relX * dirX + relZ * dirZ, -hz.patrolRange, hz.patrolRange);
        const closestX = hz.position.x + dirX * proj;
        const closestZ = hz.position.z + dirZ * proj;
        const distX = pos.x - closestX;
        const distZ = pos.z - closestZ;
        const dy = pos.y - hz.position.y;
        const dSq = distX * distX + distZ * distZ;
        const hitR = 0.45 + this.controller.radius;
        const nearR = hitR + 1.65;
        if (dy > -0.6 && dy < 2.2 && dSq >= hitR * hitR && dSq <= nearR * nearR) {
          this.nearMissCooldowns.set(hz.id, 2.2);
          this.awardCombo(300, 'SWEEPER NEAR MISS', 0xfbbf24, true);
          return;
        }
      }
    }

    if (horizSpeed < 8.0) return;

    // Check track pillars
    for (let i = 0; i < this.level.staticColliders.length; i++) {
      const col = this.level.staticColliders[i];
      if (col.tag !== 'pillar' || this.nearMissCooldowns.has(col.id)) continue;
      if (pos.y + this.controller.height < col.minY - 0.3 || pos.y > col.maxY + 0.5) continue;

      const closestX = THREE.MathUtils.clamp(pos.x, col.minX, col.maxX);
      const closestZ = THREE.MathUtils.clamp(pos.z, col.minZ, col.maxZ);
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const dSq = dx * dx + dz * dz;
      const minR = this.controller.radius + 0.05;
      const nearR = this.controller.radius + 1.35;
      if (dSq >= minR * minR && dSq <= nearR * nearR) {
        this.nearMissCooldowns.set(col.id, 2.4);
        this.awardCombo(200, 'PILLAR NEAR MISS', 0x38bdf8, true);
        return;
      }
    }

    // Check pushable crates
    for (let i = 0; i < this.level.crates.length; i++) {
      const crate = this.level.crates[i];
      const col = crate.collider;
      if (this.nearMissCooldowns.has(crate.id)) continue;
      if (pos.y + this.controller.height < col.minY - 0.2 || pos.y > col.maxY + 0.6) continue;

      const closestX = THREE.MathUtils.clamp(pos.x, col.minX, col.maxX);
      const closestZ = THREE.MathUtils.clamp(pos.z, col.minZ, col.maxZ);
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const dSq = dx * dx + dz * dz;
      const minR = this.controller.radius + 0.08;
      const nearR = this.controller.radius + 1.25;
      if (dSq >= minR * minR && dSq <= nearR * nearR) {
        this.nearMissCooldowns.set(crate.id, 2.4);
        this.awardCombo(180, 'CRATE NEAR MISS', 0x38bdf8, true);
        return;
      }
    }
  }

  private advanceToNextLap(): void {
    this.currentLap++;
    this.checkpointIndex = 0;
    this.currentSector = `LAP ${this.currentLap} · START PLAZA`;

    // Restore checkpoint gates for the next lap
    this.level.checkpoints.forEach((cp, idx) => {
      cp.cleared = false;
      const isFinish = idx === this.level.checkpoints.length - 1;
      const mat = cp.ringMesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(isFinish ? 0xfbbf24 : 0x38bdf8);
      mat.emissive.setHex(isFinish ? 0xf59e0b : 0x0284c7);
    });

    // Reset crates back to initial positions for the new lap
    this.level.crates.forEach((crate, idx) => {
      const init = this.level.initialCratePositions[idx];
      crate.position.set(init.x, init.y, init.z);
      crate.velocity.set(0, 0, 0);
      const h = crate.halfSize;
      crate.collider.minX = init.x - h;
      crate.collider.maxX = init.x + h;
      crate.collider.minY = init.y;
      crate.collider.maxY = init.y + h * 2;
      crate.collider.minZ = init.z - h;
      crate.collider.maxZ = init.z + h;
      crate.mesh.position.copy(crate.position);
    });

    const spawnPos = new THREE.Vector3(0, 0.25, 12);
    this.controller.reset(spawnPos, Math.PI);
    this.cameraYaw = 0;
    this.boostFovTimer = 0.45;
    this.resetLapGhostState();
    this.audio.playCheckpoint();
    this.spawnBurst(spawnPos, 0xfbbf24, 24, 9);
    this.emitHud();
  }

  private loadBestLapGhost(): BestLapGhostData | null {
    try {
      const raw = localStorage.getItem('apex_strider_best_lap_ghost');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { lapTime?: unknown; frames?: unknown };
      if (
        typeof parsed.lapTime !== 'number' ||
        !Number.isFinite(parsed.lapTime) ||
        parsed.lapTime <= 0 ||
        !Array.isArray(parsed.frames) ||
        parsed.frames.length < 2
      ) {
        return null;
      }
      const frames: GhostFrame[] = [];
      for (let i = 0; i < parsed.frames.length; i++) {
        const tuple = parsed.frames[i];
        if (!Array.isArray(tuple) || tuple.length < 9) continue;
        frames.push({
          t: Number(tuple[0]) || 0,
          x: Number(tuple[1]) || 0,
          y: Number(tuple[2]) || 0,
          z: Number(tuple[3]) || 0,
          yaw: Number(tuple[4]) || 0,
          pitch: Number(tuple[5]) || 0,
          roll: Number(tuple[6]) || 0,
          steer: Number(tuple[7]) || 0,
          wheelSpin: Number(tuple[8]) || 0,
        });
      }
      return frames.length >= 2 ? { lapTime: parsed.lapTime, frames } : null;
    } catch {
      return null;
    }
  }

  private saveBestLapGhost(data: BestLapGhostData): void {
    try {
      const round3 = (n: number) => Math.round(n * 1000) / 1000;
      const compact = {
        lapTime: round3(data.lapTime),
        frames: data.frames.map((f) => [
          round3(f.t),
          round3(f.x),
          round3(f.y),
          round3(f.z),
          round3(f.yaw),
          round3(f.pitch),
          round3(f.roll),
          round3(f.steer),
          round3(f.wheelSpin),
        ]),
      };
      localStorage.setItem('apex_strider_best_lap_ghost', JSON.stringify(compact));
    } catch {
      // Ignore storage quota or serialization errors
    }
  }

  private resetLapGhostState(): void {
    this.lapElapsedTime = 0;
    this.currentLapFrames = [];
    this.ghostRecordTimer = 0;
    this.ghostCursor = 0;
    this.recordGhostSample(true);
  }

  private recordGhostSample(force = false): void {
    if (!force && this.ghostRecordTimer < 0.05) return;
    if (this.currentLapFrames.length >= 6000) return;
    this.ghostRecordTimer = 0;
    this.currentLapFrames.push({
      t: this.lapElapsedTime,
      x: this.controller.position.x,
      y: this.controller.position.y,
      z: this.controller.position.z,
      yaw: this.controller.yaw,
      pitch: this.playerRig.bodyPivot.rotation.x,
      roll: this.playerRig.bodyPivot.rotation.z,
      steer: this.playerRig.steerFL.rotation.y,
      wheelSpin: this.playerRig.wheelFL.rotation.x,
    });
  }

  private finalizeLapGhost(): void {
    this.recordGhostSample(true);
    if (
      this.currentLapFrames.length >= 2 &&
      (this.bestLapGhost === null || this.lapElapsedTime < this.bestLapGhost.lapTime)
    ) {
      this.bestLapGhost = {
        lapTime: this.lapElapsedTime,
        frames: this.currentLapFrames.slice(),
      };
      this.saveBestLapGhost(this.bestLapGhost);
    }
  }

  private updateGhostPlayback(): void {
    if (
      this.phase !== 'playing' ||
      !this.ghostEnabled ||
      !this.bestLapGhost ||
      this.bestLapGhost.frames.length < 2
    ) {
      this.ghostRig.root.visible = false;
      return;
    }

    const frames = this.bestLapGhost.frames;
    const t = this.lapElapsedTime;
    const lastFrame = frames[frames.length - 1];

    if (t > lastFrame.t + 0.35) {
      this.ghostRig.root.visible = false;
      return;
    }

    if (this.ghostCursor >= frames.length - 1 || t < frames[this.ghostCursor].t) {
      this.ghostCursor = 0;
    }
    while (this.ghostCursor < frames.length - 2 && frames[this.ghostCursor + 1].t <= t) {
      this.ghostCursor++;
    }

    const f0 = frames[this.ghostCursor];
    const f1 = frames[Math.min(this.ghostCursor + 1, frames.length - 1)];
    const span = Math.max(1e-5, f1.t - f0.t);
    const alpha = THREE.MathUtils.clamp((t - f0.t) / span, 0, 1);

    const gx = THREE.MathUtils.lerp(f0.x, f1.x, alpha);
    const gy = THREE.MathUtils.lerp(f0.y, f1.y, alpha);
    const gz = THREE.MathUtils.lerp(f0.z, f1.z, alpha);

    let yawDiff = f1.yaw - f0.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const gyaw = f0.yaw + yawDiff * alpha;

    const gpitch = THREE.MathUtils.lerp(f0.pitch, f1.pitch, alpha);
    const groll = THREE.MathUtils.lerp(f0.roll, f1.roll, alpha);
    const gsteer = THREE.MathUtils.lerp(f0.steer, f1.steer, alpha);
    const gspin = THREE.MathUtils.lerp(f0.wheelSpin, f1.wheelSpin, alpha);

    this.ghostRig.root.visible = true;
    this.ghostRig.root.position.set(gx, gy, gz);
    this.ghostRig.root.rotation.y = gyaw;
    this.ghostRig.bodyPivot.rotation.x = gpitch;
    this.ghostRig.bodyPivot.rotation.z = groll;
    this.ghostRig.steerFL.rotation.y = gsteer;
    this.ghostRig.steerFR.rotation.y = gsteer;
    this.ghostRig.wheelFL.rotation.x = gspin;
    this.ghostRig.wheelFR.rotation.x = gspin;
    this.ghostRig.wheelRL.rotation.x = gspin;
    this.ghostRig.wheelRR.rotation.x = gspin;
  }

  private updatePlayerVisuals(dt: number): void {
    const pos = this.controller.position;
    this.playerRig.root.position.copy(pos);
    this.playerRig.root.rotation.y = this.controller.yaw;

    // Contact shadow tracks distance to ground below
    const distAboveGround = Math.max(0, pos.y - this.controller.groundY);
    const shadowScale = Math.max(0.35, 1 - distAboveGround * 0.09);
    this.playerRig.contactShadow.scale.setScalar(shadowScale);
    this.playerRig.contactShadow.position.y = -distAboveGround + 0.03;
    (this.playerRig.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      0.48 * Math.max(0.18, 1 - distAboveGround * 0.14);

    // Damped squash & stretch recovery
    this.squashY = THREE.MathUtils.damp(this.squashY, 1, 14, dt);
    this.squashXZ = THREE.MathUtils.damp(this.squashXZ, 1, 14, dt);
    this.playerRig.bodyPivot.scale.set(this.squashXZ, this.squashY, this.squashXZ);

    // Car suspension pitch (squat on accel / tilt in air) & cornering body roll
    const horizSpeed = Math.hypot(this.controller.velocity.x, this.controller.velocity.z);
    const targetPitch = !this.controller.grounded
      ? THREE.MathUtils.clamp(-this.controller.velocity.y * 0.022, -0.28, 0.28)
      : -THREE.MathUtils.clamp(horizSpeed / 26, 0, 1) * 0.065;
    this.playerRig.bodyPivot.rotation.x = THREE.MathUtils.damp(
      this.playerRig.bodyPivot.rotation.x,
      targetPitch,
      10,
      dt,
    );

    const targetRoll = -this.controller.steerDelta * Math.min(1, horizSpeed / 12) * 0.14;
    this.playerRig.bodyPivot.rotation.z = THREE.MathUtils.damp(
      this.playerRig.bodyPivot.rotation.z,
      targetRoll,
      10,
      dt,
    );

    // Front wheel steering knuckles
    const targetSteer = THREE.MathUtils.clamp(this.controller.steerDelta * 0.45, -0.42, 0.42);
    this.playerRig.steerFL.rotation.y = THREE.MathUtils.damp(
      this.playerRig.steerFL.rotation.y,
      targetSteer,
      14,
      dt,
    );
    this.playerRig.steerFR.rotation.y = THREE.MathUtils.damp(
      this.playerRig.steerFR.rotation.y,
      targetSteer,
      14,
      dt,
    );

    // Spin all 4 wheels proportional to ground speed (radius = 0.33m)
    const wheelSpinDelta = (horizSpeed * dt) / 0.33;
    this.playerRig.wheelFL.rotation.x += wheelSpinDelta;
    this.playerRig.wheelFR.rotation.x += wheelSpinDelta;
    this.playerRig.wheelRL.rotation.x += wheelSpinDelta;
    this.playerRig.wheelRR.rotation.x += wheelSpinDelta;

    // Rear nitro exhaust flame intensity
    const boosting = this.controller.dashTimer > 0 || this.boostFovTimer > 0;
    const drivingFast = horizSpeed > 12;
    const flameTarget = boosting
      ? 1.55 + Math.sin(performance.now() * 0.045) * 0.3
      : drivingFast
        ? 0.55 + Math.sin(performance.now() * 0.03) * 0.12
        : 0.18;
    this.playerRig.thrusterFlameL.scale.set(1, flameTarget, 1);
    this.playerRig.thrusterFlameR.scale.set(1, flameTarget, 1);

    // Invulnerability hit flash on headlights & taillights
    if (this.invulnTimer > 0) {
      const flash = Math.sin(performance.now() * 0.045) > 0;
      this.playerRig.headlightMat.emissive.setHex(flash ? 0xef4444 : 0xf8fafc);
      this.playerRig.taillightMat.emissiveIntensity = flash ? 3.2 : 0.8;
    } else {
      this.playerRig.headlightMat.emissive.setHex(0xf8fafc);
      this.playerRig.taillightMat.emissiveIntensity = 1.6;
    }

    // Update shadow camera to follow car
    this.sunLight.position.set(pos.x + 24, pos.y + 38, pos.z + 20);
    this.sunLight.target.position.copy(pos);
  }

  private updateParticles(dt: number): void {
    let dirty = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.particlesMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      _dummy.position.copy(p.pos);
      _dummy.scale.setScalar(p.size * t);
      _dummy.rotation.set(t * 4, t * 3, 0);
      _dummy.updateMatrix();
      this.particlesMesh.setMatrixAt(i, _dummy.matrix);
      this.particlesMesh.setColorAt(i, p.color);
    }
    if (dirty) {
      this.particlesMesh.instanceMatrix.needsUpdate = true;
      if (this.particlesMesh.instanceColor) this.particlesMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateCamera(dt: number): void {
    if (this.phase === 'title') {
      // Live atmospheric canyon orbit around the strider on the start plaza
      this.titlePanAngle += dt * 0.22;
      const px = this.controller.position.x;
      const py = this.controller.position.y + 1.5;
      const pz = this.controller.position.z;
      const radius = 9.5;
      _camTarget.set(
        px + Math.sin(this.titlePanAngle) * radius,
        py + 3.2 + Math.sin(this.titlePanAngle * 0.7) * 0.6,
        pz + Math.cos(this.titlePanAngle) * radius,
      );
      this.camera.position.lerp(_camTarget, 1 - Math.exp(-4 * dt));
      _camLook.set(px, py + 0.3, pz - 10);
      this.camera.lookAt(_camLook);
      return;
    }

    // Q / E camera yaw controls
    if (this.heldKeys.has('KeyQ')) this.cameraYaw += 1.9 * dt;
    if (this.heldKeys.has('KeyE')) this.cameraYaw -= 1.9 * dt;

    // Dynamic chase mode softly aligns camera behind travel velocity
    if (this.cameraMode === 'dynamic' && !this.draggingCamera) {
      const horizSpeed = Math.hypot(this.controller.velocity.x, this.controller.velocity.z);
      if (horizSpeed > 3.5) {
        const travelYaw = Math.atan2(-this.controller.velocity.x, -this.controller.velocity.z);
        let diff = travelYaw - this.cameraYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.cameraYaw += diff * (1 - Math.exp(-2.2 * dt));
      }
    }

    const pos = this.controller.position;
    const horizDist = Math.cos(this.cameraPitch) * this.cameraDist;
    const vertDist = Math.sin(this.cameraPitch) * this.cameraDist;

    _camTarget.set(
      pos.x + Math.sin(this.cameraYaw) * horizDist,
      pos.y + 1.65 + vertDist,
      pos.z + Math.cos(this.cameraYaw) * horizDist,
    );

    // Keep camera above ground terrain
    const minCamY = groundHeightAt(_camTarget.x, _camTarget.z) + 1.4;
    if (_camTarget.y < minCamY) _camTarget.y = minCamY;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTarget.x, 12, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTarget.y, 10, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTarget.z, 12, dt);

    // Trauma camera shake
    if (this.shakeTrauma > 0) {
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.4);
      const shake = this.shakeTrauma * this.shakeTrauma * 0.42;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }

    // FOV boost kick
    const targetFov = this.boostFovTimer > 0 || this.controller.dashTimer > 0 ? 73 : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 9, dt);
      this.camera.updateProjectionMatrix();
    }

    // Look slightly ahead of velocity
    _camLook.set(
      pos.x + this.controller.velocity.x * 0.07,
      pos.y + 1.45,
      pos.z + this.controller.velocity.z * 0.07,
    );
    this.camera.lookAt(_camLook);
  }

  private emitHud(): void {
    const speed = Math.hypot(this.controller.velocity.x, this.controller.velocity.z);
    this.onHudUpdate({
      phase: this.phase,
      elapsedTime: this.elapsedTime,
      bestTime: this.bestTime,
      bestLapTime: this.bestLapGhost ? this.bestLapGhost.lapTime : null,
      currentLapTime: this.lapElapsedTime,
      speed: Math.round(speed * 3.6), // km/h feel
      currentLap: this.currentLap,
      totalLaps: this.totalLaps,
      circuitsCompleted: this.circuitsCompleted,
      checkpointIndex: this.checkpointIndex,
      totalCheckpoints: this.level.checkpoints.length,
      orbsCollected: this.orbsCollected,
      totalOrbs: this.level.orbs.length,
      health: this.health,
      maxHealth: this.maxHealth,
      dashCooldownRatio: this.controller.dashCooldown / this.controller.dashCooldownMax,
      score: this.score,
      combo: this.combo,
      comboMultiplier: this.getComboMultiplier(),
      comboTimerRatio: this.combo > 0 ? Math.max(0, Math.min(1, this.comboTimer / this.comboDuration)) : 0,
      comboEventLabel: this.comboEventLabel,
      bestCombo: this.bestCombo,
      sectorName: this.currentSector,
      weather: this.weather.getWeather(),
      muted: this.audio.isMuted(),
      cameraMode: this.cameraMode,
      ghostAvailable: this.bestLapGhost !== null,
      ghostEnabled: this.ghostEnabled,
      minimap: {
        playerX: this.controller.position.x,
        playerZ: this.controller.position.z,
        playerYaw: this.controller.yaw,
        trackRects: [
          ...this.staticTrackRects,
          ...this.level.movingPlatforms.map((mp) => ({
            minX: mp.collider.minX,
            maxX: mp.collider.maxX,
            minZ: mp.collider.minZ,
            maxZ: mp.collider.maxZ,
            kind: 'moving' as const,
          })),
        ],
        checkpoints: this.level.checkpoints.map((cp, idx) => ({
          index: cp.index,
          x: cp.position.x,
          z: cp.position.z,
          cleared: cp.cleared,
          isFinish: idx === this.level.checkpoints.length - 1,
        })),
      },
    });
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    const totalTime = now * 0.001;

    if (this.phase === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      } else {
        this.elapsedTime += dt;
        this.lapElapsedTime += dt;
        this.ghostRecordTimer += dt;
        if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
        if (this.boostFovTimer > 0) this.boostFovTimer = Math.max(0, this.boostFovTimer - dt);
        if (this.comboTimer > 0) {
          this.comboTimer -= dt;
          if (this.comboTimer <= 0) {
            this.combo = 0;
            this.comboTimer = 0;
            this.comboEventLabel = '';
            this.emitHud();
          }
        }
        this.lastCollisionHitFrame = false;

        this.updateMovingWorld(dt, totalTime);

        const moveX =
          (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight') ? 1 : 0) -
          (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft') ? 1 : 0) +
          this.virtualMoveX;
        const moveZ =
          (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp') ? 1 : 0) -
          (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown') ? 1 : 0) +
          this.virtualMoveZ;

        const input: CharacterInput = {
          moveX: THREE.MathUtils.clamp(moveX, -1, 1),
          moveZ: THREE.MathUtils.clamp(moveZ, -1, 1),
          jumpPressed: this.jumpJustPressed,
          jumpHeld: this.heldKeys.has('Space'),
          dashPressed: this.dashJustPressed,
          sprintHeld: this.heldKeys.has('ControlLeft') || this.heldKeys.has('ControlRight'),
        };
        this.jumpJustPressed = false;
        this.dashJustPressed = false;

        const weatherChanged = this.weather.update(dt, this.controller.position, true);

        const events = this.controller.step(
          dt,
          input,
          this.cameraYaw,
          this.level.staticColliders,
          this.level.ramps,
          this.level.movingPlatforms,
          this.level.crates,
          this.weather.getTractionFactor(),
        );

        const horizSpeed = Math.hypot(this.controller.velocity.x, this.controller.velocity.z);

        // Weight-scaled feedback & Jump Combo Rewards
        if (events.jumped || events.doubleJumped) {
          this.squashY = 1.24;
          this.squashXZ = 0.86;
          this.audio.playJump(events.doubleJumped);
          this.spawnBurst(this.controller.position, events.doubleJumped ? 0x38bdf8 : 0xe2e8f0, 8, 4.5);

          if (events.doubleJumped) {
            this.awardCombo(150, 'DOUBLE JUMP', 0x38bdf8, false);
          } else if (horizSpeed > 3.2 || this.combo > 0) {
            this.awardCombo(100, this.combo > 0 ? 'CONSECUTIVE JUMP' : 'AIR JUMP', 0x38bdf8, false);
          }
        }
        if (events.landedImpactSpeed > 0) {
          const weight = Math.min(1, events.landedImpactSpeed / 22);
          this.squashY = 1 - 0.24 * weight;
          this.squashXZ = 1 + 0.18 * weight;
          this.shakeTrauma = Math.min(1, this.shakeTrauma + weight * 0.28);
          this.audio.playLand(events.landedImpactSpeed);
          this.spawnBurst(this.controller.position, 0xd6d3d1, Math.round(6 + weight * 8), 4.8);
          if (events.landedImpactSpeed > 5.0 && this.combo > 0) {
            this.comboTimer = Math.max(this.comboTimer, this.comboDuration * 0.75);
          }
        }
        if (events.dashed) {
          this.squashY = 0.88;
          this.squashXZ = 1.12;
          this.audio.playDash();
          this.spawnBurst(this.controller.position, 0x38bdf8, 14, 7.5);
        }
        if (events.wallImpactSpeed > 5.0) {
          this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.18);
          this.audio.playWallBump(events.wallImpactSpeed);
          _vec3B.copy(this.controller.position);
          _vec3B.y += 0.9;
          this.spawnBurst(_vec3B, 0xf97316, 7, 5.5);
        }

        // Wet asphalt tire mist spray during rain
        if (
          this.weather.getRainWeight() > 0.35 &&
          this.controller.grounded &&
          horizSpeed > 9 &&
          Math.random() < 0.35
        ) {
          this.spawnBurst(this.controller.position, 0xcbd5e1, 1, 2.2);
        }

        this.audio.updateFootsteps(dt, horizSpeed, this.controller.grounded);
        this.audio.updateWeatherAudio(this.weather.getRainWeight(), true);

        this.updateGameplayInteractions(dt);
        this.updatePlayerVisuals(dt);
        this.recordGhostSample(false);
        this.updateGhostPlayback();
        this.updateParticles(dt);

        this.hudEmitTimer += dt;
        if (weatherChanged || this.hudEmitTimer >= 0.05) {
          this.hudEmitTimer = 0;
          this.emitHud();
        }
      }
    } else if (this.phase === 'title') {
      this.ghostRig.root.visible = false;
      this.audio.updateWeatherAudio(0, false);
      this.weather.update(dt, this.controller.position, false);
      this.updateMovingWorld(dt, totalTime);
      this.updatePlayerVisuals(dt);
    } else {
      this.audio.updateWeatherAudio(0, false);
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext();
    if (!gl || typeof (gl as WebGL2RenderingContext).fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const gl2 = gl as WebGL2RenderingContext;
    const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    gl2.flush();
    const poll = () => {
      if (this.disposed) {
        gl2.deleteSync(sync);
        return;
      }
      const state = gl2.getSyncParameter(sync, gl2.SYNC_STATUS);
      if (state === gl2.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl2.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);

    this.weather.dispose();
    this.audio.dispose();
    this.level.dispose();
    this.ghostRig.dispose();
    this.textures.dispose();
    this.envTex.dispose();
    this.particlesMesh.geometry.dispose();
    (this.particlesMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (dom.parentElement) dom.parentElement.removeChild(dom);
  }
}
