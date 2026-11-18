import * as THREE from 'three';
import { AabbCollider, MovingPlatformState, PushCrate, RampCollider } from './types';

export interface CharacterInput {
  moveX: number; // Camera-relative right (-1..1)
  moveZ: number; // Camera-relative forward (-1..1)
  jumpPressed: boolean; // Edge-triggered
  jumpHeld: boolean;
  dashPressed: boolean; // Edge-triggered
  sprintHeld: boolean;
}

export interface PhysicsStepEvents {
  jumped: boolean;
  doubleJumped: boolean;
  landedImpactSpeed: number; // > 0 on touchdown frame
  wallImpactSpeed: number; // > 0 on firm wall collision
  dashed: boolean;
  steppedUp: boolean;
}

/**
 * Natural canyon terrain height outside the raised track.
 * Keeps outdoor perimeter grounded with gentle dunes and canyon rise.
 */
export function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z + 75);
  const canyonRim = Math.max(0, (distFromCenter - 115) * 0.14);
  const ripples =
    Math.sin(x * 0.055) * Math.cos(z * 0.048) * 1.15 +
    Math.sin(x * 0.13 + z * 0.09) * 0.35;
  return -2.2 + ripples + canyonRim;
}

// Pre-allocated scratch vectors for zero-GC simulation loop
const _wishDir = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _dashVec = new THREE.Vector3();
const _crateDelta = new THREE.Vector3();

/**
 * Unity CharacterController-inspired 3D swept capsule/cylinder physics solver.
 * Supports:
 * - Smooth AABB wall sliding without corner snagging
 * - StepOffset stair/curb climbing
 * - Walkable RampCollider surface projection & slope gravity
 * - MovingPlatform carrier delta inheritance
 * - Coyote time (0.12s), Jump buffering (0.14s), Double jump, and Directional Dash
 * - Dynamic PushCrate impulse resolution
 */
export class CharacterController {
  public position = new THREE.Vector3(0, 0.2, 12);
  public velocity = new THREE.Vector3(0, 0, 0);
  public yaw = Math.PI; // Facing -Z down the start straightaway

  // Capsule dimensions (pivot at bottom-center feet)
  public readonly radius = 0.52;
  public readonly height = 1.85;
  public readonly stepOffset = 0.5;

  // Tuning constants (Unity-style meters/sec)
  public readonly walkSpeed = 13.5;
  public readonly sprintSpeed = 18.2;
  public readonly groundAccel = 68.0;
  public readonly groundFriction = 14.0;
  public readonly airAccel = 26.0;
  public readonly gravity = -34.0;
  public readonly jumpSpeed = 13.8;
  public readonly doubleJumpSpeed = 12.2;
  public readonly dashSpeed = 28.0;
  public readonly dashDuration = 0.18;
  public readonly dashCooldownMax = 1.15;

  public grounded = false;
  public coyoteTimer = 0;
  public jumpBufferTimer = 0;
  public canDoubleJump = true;
  public dashTimer = 0;
  public dashCooldown = 0;
  public dashDir = new THREE.Vector3(0, 0, -1);
  public activePlatform: MovingPlatformState | null = null;
  public groundY = 0;

  public reset(pos: THREE.Vector3, yaw: number): void {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.coyoteTimer = 0.12;
    this.jumpBufferTimer = 0;
    this.canDoubleJump = true;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.activePlatform = null;
  }

  public step(
    dt: number,
    input: CharacterInput,
    cameraYaw: number,
    staticColliders: AabbCollider[],
    ramps: RampCollider[],
    movingPlatforms: MovingPlatformState[],
    crates: PushCrate[],
  ): PhysicsStepEvents {
    const events: PhysicsStepEvents = {
      jumped: false,
      doubleJumped: false,
      landedImpactSpeed: 0,
      wallImpactSpeed: 0,
      dashed: false,
      steppedUp: false,
    };

    const wasGrounded = this.grounded;
    const preLandingVelY = this.velocity.y;

    // 1. Carry player along with moving platform from previous frame
    if (wasGrounded && this.activePlatform) {
      this.position.add(this.activePlatform.deltaPos);
    }

    // 2. Cooldowns & Input Timers
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    if (input.jumpPressed) this.jumpBufferTimer = 0.14;

    if (this.grounded) {
      this.coyoteTimer = 0.12;
      this.canDoubleJump = true;
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    // 3. Camera-relative wish direction on XZ plane
    _camForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    _camRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    _wishDir
      .set(0, 0, 0)
      .addScaledVector(_camRight, input.moveX)
      .addScaledVector(_camForward, input.moveZ);
    const wishMag = _wishDir.length();
    if (wishMag > 0.001) {
      _wishDir.divideScalar(Math.max(1, wishMag));
      // Smoothly rotate character toward movement direction
      const targetYaw = Math.atan2(_wishDir.x, _wishDir.z);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * (1 - Math.exp(-16 * dt));
    }

    // 4. Dash activation
    if (input.dashPressed && this.dashCooldown <= 0 && this.dashTimer <= 0) {
      this.dashTimer = this.dashDuration;
      this.dashCooldown = this.dashCooldownMax;
      if (wishMag > 0.1) {
        this.dashDir.copy(_wishDir).normalize();
      } else {
        this.dashDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
      }
      this.velocity.x = this.dashDir.x * this.dashSpeed;
      this.velocity.z = this.dashDir.z * this.dashSpeed;
      this.velocity.y = Math.max(this.velocity.y, 1.8);
      events.dashed = true;
    }

    // 5. Horizontal Velocity Integration
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      _dashVec.copy(this.dashDir).multiplyScalar(this.dashSpeed);
      this.velocity.x = _dashVec.x;
      this.velocity.z = _dashVec.z;
    } else {
      const targetSpeed = input.sprintHeld ? this.sprintSpeed : this.walkSpeed;
      const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);

      if (this.grounded) {
        // Apply friction when slowing down or turning sharply
        if (horizSpeed > 0.01) {
          const drop = horizSpeed * this.groundFriction * dt;
          const newSpeed = Math.max(0, horizSpeed - drop);
          const ratio = newSpeed / horizSpeed;
          this.velocity.x *= ratio;
          this.velocity.z *= ratio;
        }
        // Accelerate up to targetSpeed (preserve excess boost pad momentum with gentle decay)
        if (wishMag > 0.05) {
          const desiredX = _wishDir.x * targetSpeed;
          const desiredZ = _wishDir.z * targetSpeed;
          const accelStep = this.groundAccel * dt;
          const dx = desiredX - this.velocity.x;
          const dz = desiredZ - this.velocity.z;
          const dLen = Math.hypot(dx, dz);
          if (dLen > 0.001) {
            const stepScale = Math.min(1, accelStep / dLen);
            this.velocity.x += dx * stepScale;
            this.velocity.z += dz * stepScale;
          }
        }
      } else {
        // Air steering
        if (wishMag > 0.05) {
          const desiredX = _wishDir.x * targetSpeed;
          const desiredZ = _wishDir.z * targetSpeed;
          const airStep = this.airAccel * dt;
          const dx = desiredX - this.velocity.x;
          const dz = desiredZ - this.velocity.z;
          const dLen = Math.hypot(dx, dz);
          if (dLen > 0.001) {
            const stepScale = Math.min(1, airStep / dLen);
            this.velocity.x += dx * stepScale;
            this.velocity.z += dz * stepScale;
          }
        }
      }
    }

    // 6. Jump Execution (Coyote Time + Jump Buffer + Double Jump)
    if (this.jumpBufferTimer > 0) {
      if (this.coyoteTimer > 0) {
        this.velocity.y = this.jumpSpeed;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.activePlatform = null;
        events.jumped = true;
      } else if (this.canDoubleJump) {
        this.velocity.y = this.doubleJumpSpeed;
        this.canDoubleJump = false;
        this.jumpBufferTimer = 0;
        events.doubleJumped = true;
      }
    }

    // Variable jump height: release early for snappier hop
    if (!input.jumpHeld && this.velocity.y > 5.0 && this.dashTimer <= 0) {
      this.velocity.y -= 28.0 * dt;
    }

    // 7. Gravity
    if (this.dashTimer <= 0) {
      this.velocity.y += this.gravity * dt;
      if (this.velocity.y < -42) this.velocity.y = -42;
    }

    // 8. Sub-stepped swept movement & collision resolution (2 substeps prevents tunneling)
    const subSteps = 2;
    const subDt = dt / subSteps;
    let maxWallImpact = 0;
    let landedOnThisStep = false;
    let resolvedPlatform: MovingPlatformState | null = null;

    for (let s = 0; s < subSteps; s++) {
      // --- Horizontal Move (XZ) ---
      this.position.x += this.velocity.x * subDt;
      this.position.z += this.velocity.z * subDt;

      // Pushable crate interactions first
      for (let i = 0; i < crates.length; i++) {
        const crate = crates[i];
        const col = crate.collider;
        if (this.position.y >= col.maxY - 0.05 || this.position.y + this.height <= col.minY + 0.05) {
          continue;
        }
        const closestX = THREE.MathUtils.clamp(this.position.x, col.minX, col.maxX);
        const closestZ = THREE.MathUtils.clamp(this.position.z, col.minZ, col.maxZ);
        const dx = this.position.x - closestX;
        const dz = this.position.z - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < this.radius * this.radius && distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const penetration = this.radius - dist;
          // Split push: player yields 40%, crate slides 60%
          this.position.x += nx * penetration * 0.4;
          this.position.z += nz * penetration * 0.4;
          _crateDelta.set(-nx * penetration * 0.6, 0, -nz * penetration * 0.6);
          crate.position.add(_crateDelta);
          crate.velocity.x += -nx * 7.5;
          crate.velocity.z += -nz * 7.5;
          crate.collider.minX += _crateDelta.x;
          crate.collider.maxX += _crateDelta.x;
          crate.collider.minZ += _crateDelta.z;
          crate.collider.maxZ += _crateDelta.z;
          crate.mesh.position.copy(crate.position);
          maxWallImpact = Math.max(maxWallImpact, 4.5);
        }
      }

      // Resolve against Static AABBs + Moving Platforms horizontally (with StepOffset!)
      const allBoxes: AabbCollider[] = staticColliders;
      const resolveHorizontalBox = (col: AabbCollider) => {
        const playerBottom = this.position.y;
        const playerTop = this.position.y + this.height;
        // Skip if vertically separated
        if (playerBottom >= col.maxY - 0.02 || playerTop <= col.minY + 0.02) {
          return;
        }
        const closestX = THREE.MathUtils.clamp(this.position.x, col.minX, col.maxX);
        const closestZ = THREE.MathUtils.clamp(this.position.z, col.minZ, col.maxZ);
        const dx = this.position.x - closestX;
        const dz = this.position.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq >= this.radius * this.radius) return;

        // Unity CharacterController StepOffset: if grounded and obstacle top is <= stepOffset above feet
        const stepHeight = col.maxY - playerBottom;
        if ((this.grounded || wasGrounded) && stepHeight > 0 && stepHeight <= this.stepOffset && this.velocity.y <= 2.0) {
          this.position.y = col.maxY;
          events.steppedUp = true;
          return;
        }

        // Compute push-out normal
        let nx = 0;
        let nz = 0;
        let penetration = 0;

        if (distSq > 1e-7) {
          const dist = Math.sqrt(distSq);
          nx = dx / dist;
          nz = dz / dist;
          penetration = this.radius - dist;
        } else {
          // Center inside AABB: push out along nearest face
          const leftPen = Math.abs(this.position.x - col.minX);
          const rightPen = Math.abs(col.maxX - this.position.x);
          const backPen = Math.abs(this.position.z - col.minZ);
          const frontPen = Math.abs(col.maxZ - this.position.z);
          const minPen = Math.min(leftPen, rightPen, backPen, frontPen);
          if (minPen === leftPen) nx = -1;
          else if (minPen === rightPen) nx = 1;
          else if (minPen === backPen) nz = -1;
          else nz = 1;
          penetration = minPen + this.radius;
        }

        this.position.x += nx * penetration;
        this.position.z += nz * penetration;

        // Slide velocity along wall tangent
        const vn = this.velocity.x * nx + this.velocity.z * nz;
        if (vn < 0) {
          const impact = -vn;
          if (impact > 4.2) {
            maxWallImpact = Math.max(maxWallImpact, impact);
          }
          const bounce = col.bouncy ? col.bouncy : 0;
          this.velocity.x -= (1 + bounce) * vn * nx;
          this.velocity.z -= (1 + bounce) * vn * nz;
        }
      };

      for (let i = 0; i < allBoxes.length; i++) {
        resolveHorizontalBox(allBoxes[i]);
      }
      for (let i = 0; i < movingPlatforms.length; i++) {
        resolveHorizontalBox(movingPlatforms[i].collider);
      }

      // --- Vertical Move (Y) ---
      this.position.y += this.velocity.y * subDt;
      let highestSupportY = groundHeightAt(this.position.x, this.position.z);
      let supportPlatform: MovingPlatformState | null = null;

      // Check Ramps
      for (let i = 0; i < ramps.length; i++) {
        const ramp = ramps[i];
        if (
          this.position.x + this.radius * 0.6 >= ramp.minX &&
          this.position.x - this.radius * 0.6 <= ramp.maxX &&
          this.position.z + this.radius * 0.6 >= ramp.minZ &&
          this.position.z - this.radius * 0.6 <= ramp.maxZ
        ) {
          let t = 0;
          if (ramp.direction === '-z') {
            t = (ramp.maxZ - this.position.z) / (ramp.maxZ - ramp.minZ);
          } else if (ramp.direction === '+z') {
            t = (this.position.z - ramp.minZ) / (ramp.maxZ - ramp.minZ);
          } else if (ramp.direction === '+x') {
            t = (this.position.x - ramp.minX) / (ramp.maxX - ramp.minX);
          } else {
            t = (ramp.maxX - this.position.x) / (ramp.maxX - ramp.minX);
          }
          t = THREE.MathUtils.clamp(t, 0, 1);
          const rampY = THREE.MathUtils.lerp(ramp.baseY, ramp.topY, t);
          if (this.position.y >= rampY - 0.65 && rampY > highestSupportY) {
            highestSupportY = rampY;
          }
        }
      }

      // Check AABB vertical tops and ceilings
      const checkVerticalBox = (col: AabbCollider, platformRef: MovingPlatformState | null) => {
        if (
          this.position.x + this.radius * 0.72 <= col.minX ||
          this.position.x - this.radius * 0.72 >= col.maxX ||
          this.position.z + this.radius * 0.72 <= col.minZ ||
          this.position.z - this.radius * 0.72 >= col.maxZ
        ) {
          return;
        }
        // Floor support if feet are near or above top
        if (this.position.y >= col.maxY - 0.62 && col.maxY > highestSupportY) {
          highestSupportY = col.maxY;
          supportPlatform = platformRef;
        }
        // Ceiling check if rising into underside
        if (
          this.velocity.y > 0 &&
          this.position.y + this.height > col.minY &&
          this.position.y < col.minY
        ) {
          this.position.y = col.minY - this.height;
          this.velocity.y = -0.5;
        }
      };

      for (let i = 0; i < allBoxes.length; i++) {
        checkVerticalBox(allBoxes[i], null);
      }
      for (let i = 0; i < movingPlatforms.length; i++) {
        checkVerticalBox(movingPlatforms[i].collider, movingPlatforms[i]);
      }
      for (let i = 0; i < crates.length; i++) {
        checkVerticalBox(crates[i].collider, null);
      }

      this.groundY = highestSupportY;

      // Ground Snap & Landing
      const snapAllowance = wasGrounded && this.velocity.y <= 0 ? 0.28 : 0.04;
      if (this.position.y <= highestSupportY + snapAllowance && this.velocity.y <= 0.5) {
        if (!wasGrounded && preLandingVelY < -4.0) {
          landedOnThisStep = true;
        }
        this.position.y = highestSupportY;
        this.velocity.y = 0;
        this.grounded = true;
        resolvedPlatform = supportPlatform;
      } else if (this.position.y <= highestSupportY) {
        this.position.y = highestSupportY;
        this.velocity.y = Math.max(0, this.velocity.y);
        this.grounded = true;
        resolvedPlatform = supportPlatform;
      } else {
        this.grounded = false;
        resolvedPlatform = null;
      }
    }

    this.activePlatform = resolvedPlatform;
    if (landedOnThisStep) {
      events.landedImpactSpeed = Math.abs(preLandingVelY);
    }
    events.wallImpactSpeed = maxWallImpact;

    return events;
  }
}
