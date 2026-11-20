import * as THREE from 'three';

/**
 * Particle Effects & Persistent Skid Marks Manager
 * Adds realistic tire smoke when drifting/burnout, persistent rubber skid marks on the asphalt,
 * and exhaust backfire pops.
 */
export class EffectsManager {
  constructor(scene) {
    this.scene = scene;

    // --- Persistent Skid Marks ---
    this.maxSkidVertices = 2000;
    this.skidMesh = null;
    this.skidPositions = new Float32Array(this.maxSkidVertices * 3);
    this.skidAlphas = new Float32Array(this.maxSkidVertices);
    this.skidIndex = 0;
    this.skidCount = 0;
    this.lastWheelPositions = [null, null]; // Left and right rear wheels

    this.initSkidMarks();

    // --- Tire Smoke Particles ---
    this.maxParticles = 120;
    this.particles = [];
    this.initTireSmoke();
  }

  initSkidMarks() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.skidPositions, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.skidAlphas, 1));

    // Custom shader material for smooth fading rubber skid marks
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(0.06, 0.07, 0.09, vAlpha * 0.7);
        }
      `
    });

    this.skidMesh = new THREE.Mesh(geo, mat);
    this.skidMesh.frustumCulled = false;
    this.scene.add(this.skidMesh);
  }

  addSkidSegment(p1, p2, alpha = 0.8) {
    if (this.skidCount >= this.maxSkidVertices - 6) {
      // Wrap around buffer for continuous skid mark memory
      this.skidIndex = 0;
    }

    const pos = this.skidPositions;
    const alphas = this.skidAlphas;
    const i = this.skidIndex * 3;
    const ai = this.skidIndex;

    // Create quad for this tire ribbon segment
    const halfWidth = 0.14; // tire width
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(halfWidth);

    const v1 = new THREE.Vector3(p1.x - side.x, 0.025, p1.z - side.z);
    const v2 = new THREE.Vector3(p1.x + side.x, 0.025, p1.z + side.z);
    const v3 = new THREE.Vector3(p2.x - side.x, 0.025, p2.z - side.z);
    const v4 = new THREE.Vector3(p2.x + side.x, 0.025, p2.z + side.z);

    // Quad triangle 1: v1, v2, v3
    pos[i] = v1.x;     pos[i + 1] = v1.y; pos[i + 2] = v1.z;
    pos[i + 3] = v2.x; pos[i + 4] = v2.y; pos[i + 5] = v2.z;
    pos[i + 6] = v3.x; pos[i + 7] = v3.y; pos[i + 8] = v3.z;

    // Quad triangle 2: v2, v4, v3
    pos[i + 9] = v2.x;  pos[i + 10] = v2.y; pos[i + 11] = v2.z;
    pos[i + 12] = v4.x; pos[i + 13] = v4.y; pos[i + 14] = v4.z;
    pos[i + 15] = v3.x; pos[i + 16] = v3.y; pos[i + 17] = v3.z;

    for (let k = 0; k < 6; k++) {
      alphas[ai + k] = alpha;
    }

    this.skidIndex += 6;
    this.skidCount = Math.max(this.skidCount, this.skidIndex);

    this.skidMesh.geometry.attributes.position.needsUpdate = true;
    this.skidMesh.geometry.attributes.alpha.needsUpdate = true;
  }

  initTireSmoke() {
    this.smokeGroup = new THREE.Group();
    this.scene.add(this.smokeGroup);

    // Procedural soft cloud sprite canvas
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(210, 220, 235, 0.8)');
    grad.addColorStop(0.4, 'rgba(180, 195, 215, 0.4)');
    grad.addColorStop(1, 'rgba(150, 165, 185, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const smokeTex = new THREE.CanvasTexture(canvas);

    this.smokeMaterial = new THREE.SpriteMaterial({
      map: smokeTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });

    for (let i = 0; i < this.maxParticles; i++) {
      const sprite = new THREE.Sprite(this.smokeMaterial.clone());
      sprite.scale.set(0.1, 0.1, 0.1);
      sprite.visible = false;
      this.smokeGroup.add(sprite);

      this.particles.push({
        sprite,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1.0,
        active: false,
        size: 0.5
      });
    }
  }

  spawnSmoke(pos, carVel) {
    const p = this.particles.find(part => !part.active);
    if (!p) return;

    p.active = true;
    p.life = 0;
    p.maxLife = 0.7 + Math.random() * 0.5;
    p.size = 0.6 + Math.random() * 0.4;

    p.sprite.position.copy(pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      0.15 + Math.random() * 0.1,
      (Math.random() - 0.5) * 0.3
    ));

    p.velocity.set(
      carVel.x * 0.2 + (Math.random() - 0.5) * 1.2,
      0.8 + Math.random() * 0.8,
      carVel.z * 0.2 + (Math.random() - 0.5) * 1.2
    );

    p.sprite.visible = true;
    p.sprite.material.opacity = 0.45;
    p.sprite.scale.set(p.size, p.size, 1);
  }

  update(dt, vehicle) {
    // 1. Skid marks & smoke generation when sliding or handbraking
    const slip = vehicle.slipAmount;
    const speed = vehicle.currentSpeedKmh;
    const isSkidding = (slip > 0.35 || vehicle.isHandbraking) && speed > 8;

    if (vehicle.wheelMeshes && vehicle.wheelMeshes.length >= 4) {
      // Rear wheels (index 2 and 3)
      const rearLeftPos = vehicle.wheelMeshes[2].position;
      const rearRightPos = vehicle.wheelMeshes[3].position;

      if (isSkidding) {
        const carVel = vehicle.chassisBody.velocity;
        const alpha = Math.min(0.85, (slip - 0.3) * 1.8 + (vehicle.isHandbraking ? 0.3 : 0));

        // Skid marks
        if (this.lastWheelPositions[0]) {
          this.addSkidSegment(this.lastWheelPositions[0], rearLeftPos, alpha);
        }
        if (this.lastWheelPositions[1]) {
          this.addSkidSegment(this.lastWheelPositions[1], rearRightPos, alpha);
        }

        // Spawn smoke puffs
        if (Math.random() < 0.65) {
          this.spawnSmoke(rearLeftPos, carVel);
          this.spawnSmoke(rearRightPos, carVel);
        }

        this.lastWheelPositions[0] = rearLeftPos.clone();
        this.lastWheelPositions[1] = rearRightPos.clone();
      } else {
        this.lastWheelPositions[0] = null;
        this.lastWheelPositions[1] = null;
      }
    }

    // 2. Animate active smoke particles
    this.particles.forEach(p => {
      if (!p.active) return;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.sprite.visible = false;
        return;
      }

      // Physics movement: rise and disperse
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.velocity.y *= 0.96;
      p.velocity.x *= 0.98;
      p.velocity.z *= 0.98;

      // Expand cloud size over life
      const progress = p.life / p.maxLife;
      const currentScale = p.size * (1.0 + progress * 2.8);
      p.sprite.scale.set(currentScale, currentScale, 1);

      // Fade out smoothly
      p.sprite.material.opacity = Math.max(0, (1.0 - progress) * 0.45);
    });
  }

  clearSkidMarks() {
    this.skidPositions.fill(0);
    this.skidAlphas.fill(0);
    this.skidIndex = 0;
    this.skidCount = 0;
    if (this.skidMesh) {
      this.skidMesh.geometry.attributes.position.needsUpdate = true;
      this.skidMesh.geometry.attributes.alpha.needsUpdate = true;
    }
    this.lastWheelPositions = [null, null];
  }
}
