import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Shared high-resolution ambient occlusion contact shadow canvas texture
let sharedShadowTexture = null;

function getSharedShadowTexture() {
  if (sharedShadowTexture) return sharedShadowTexture;

  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);

  const traceCarSilhouette = () => {
    ctx.beginPath();
    ctx.moveTo(512, 95);
    ctx.lineTo(210, 105);
    ctx.quadraticCurveTo(175, 120, 168, 175);
    ctx.quadraticCurveTo(155, 230, 155, 260);
    ctx.quadraticCurveTo(155, 305, 175, 340);
    ctx.lineTo(195, 420);
    ctx.lineTo(195, 600);
    ctx.quadraticCurveTo(165, 680, 160, 764);
    ctx.quadraticCurveTo(160, 810, 185, 850);
    ctx.lineTo(210, 910);
    ctx.quadraticCurveTo(250, 955, 360, 962);
    ctx.lineTo(512, 965);
    ctx.lineTo(664, 962);
    ctx.quadraticCurveTo(774, 955, 814, 910);
    ctx.lineTo(839, 850);
    ctx.quadraticCurveTo(864, 810, 864, 764);
    ctx.quadraticCurveTo(859, 680, 829, 600);
    ctx.lineTo(829, 420);
    ctx.lineTo(849, 340);
    ctx.quadraticCurveTo(869, 305, 869, 260);
    ctx.quadraticCurveTo(869, 230, 856, 175);
    ctx.quadraticCurveTo(849, 120, 814, 105);
    ctx.closePath();
  };

  // Pass 1: Penumbra ambient halo
  ctx.save();
  ctx.shadowColor = 'rgba(2, 4, 8, 0.45)';
  ctx.shadowBlur = 85;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  traceCarSilhouette();
  ctx.fillStyle = 'rgba(2, 4, 8, 0.55)';
  ctx.fill();
  ctx.restore();

  // Pass 2: Main underbody shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 1, 3, 0.82)';
  ctx.shadowBlur = 38;
  traceCarSilhouette();
  ctx.fillStyle = 'rgba(0, 1, 3, 0.88)';
  ctx.fill();
  ctx.restore();

  // Pass 3: Dark core ambient occlusion
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(512, 512, 230, 360, 0, 0, Math.PI * 2);
  const coreGrad = ctx.createRadialGradient(512, 512, 40, 512, 512, 240);
  coreGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
  coreGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.95)');
  coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = coreGrad;
  ctx.fill();
  ctx.restore();

  // Pass 4: Tire contact footprints
  const tireFootprints = [
    { x: 260, y: 775 },
    { x: 764, y: 775 },
    { x: 260, y: 245 },
    { x: 764, y: 245 }
  ];
  tireFootprints.forEach(t => {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, 44, 75, 0, 0, Math.PI * 2);
    const tireGrad = ctx.createRadialGradient(t.x, t.y, 10, t.x, t.y, 50);
    tireGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
    tireGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.96)');
    tireGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = tireGrad;
    ctx.fill();
    ctx.restore();
  });

  sharedShadowTexture = new THREE.CanvasTexture(canvas);
  return sharedShadowTexture;
}

/**
 * High-Performance AI Competitor Sports Car
 * Full 3D GT sports car geometry, PBR clearcoat paint, Cannon physical collision body,
 * spline tracking, overtaking logic, dynamic taillights, wheel rotation, and contact shadow.
 */
export class AICar {
  constructor(scene, world, config) {
    this.scene = scene;
    this.world = world;

    this.id = config.id || 'ai-1';
    this.name = config.name || 'AI Driver';
    this.paintColor = config.color || '#e11d48';

    // Dimensions
    this.width = 1.95;
    this.height = 0.62;
    this.length = 4.35;
    this.wheelRadius = 0.36;

    // Driving characteristics
    this.topSpeedKmh = config.topSpeedKmh || 192;
    this.cornerSpeedKmh = config.cornerSpeedKmh || 82;
    this.accelRate = config.accelRate || 14.0; // m/s^2
    this.brakeRate = config.brakeRate || 26.0; // m/s^2
    this.reactionDelay = config.reactionDelay || 0.22; // seconds delay on green light

    // Starting grid parameters
    this.startS = config.startS || 72; // track s coordinate
    this.startOffset = config.startOffset || 3.2; // lateral offset from centerline
    this.gridPosition = config.gridPosition || new THREE.Vector3(-8, 0.50, 48.2);

    // Dynamic State
    this.currentS = this.startS;
    this.currentOffset = this.startOffset;
    this.targetOffset = this.startOffset;
    this.currentSpeed = 0; // m/s
    this.currentSpeedKmh = 0;
    this.isBraking = false;
    this.isRacing = false;
    this.reactionTimer = 0;
    this.wheelRotation = 0;
    this.steerAngle = 0;

    // Collision, Bump & Loss-of-Control State
    this.bumpOffsetVelocity = 0;
    this.isLostControl = false;
    this.lossOfControlTimer = 0;
    this.fishtailAngle = 0;
    this.fishtailVelocity = 0;
    this.lastCollisionTime = 0;
    this.lastTrackPoint = null;

    // Race Timing & Lap Progress
    this.totalLaps = 3;
    this.completedLaps = 0;
    this.hasCrossedStart = false;
    this.lapStartTime = 0;
    this.currentLapTime = 0;
    this.bestLapTime = null;
    this.lapHistory = [];
    this.totalRaceTime = 0;
    this.finishedRace = false;

    this.initPhysics();
    this.initVisuals();
    this.resetToGrid();
  }

  initPhysics() {
    // Cannon rigid body with Box collider for solid collisions with player and walls
    const shape = new CANNON.Box(new CANNON.Vec3(
      this.width / 2,
      this.height / 2,
      this.length / 2
    ));

    this.body = new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      position: new CANNON.Vec3(this.gridPosition.x, this.gridPosition.y, this.gridPosition.z),
      material: new CANNON.Material('aiMaterial')
    });
    this.body.addShape(shape, new CANNON.Vec3(0, 0.08, 0));
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);

    // Collision event listener for momentum exchange and loss of control
    this.body.addEventListener('collide', (e) => this.handleCollision(e));

    this.world.addBody(this.body);
  }

  handleCollision(event) {
    const now = performance.now();
    // Debounce micro-contacts within 100ms
    if (now - this.lastCollisionTime < 100) return;

    const contact = event.contact;
    const bi = contact.bi;
    const bj = contact.bj;
    const isSelfBi = (bi === this.body);
    const otherBody = isSelfBi ? bj : bi;

    if (!otherBody) return;

    // Calculate relative impact velocity
    const relVel = new CANNON.Vec3();
    this.body.velocity.vsub(otherBody.velocity, relVel);
    const impactSpeed = relVel.length();

    // Only respond to significant impacts (> 1.2 m/s)
    if (impactSpeed < 1.2) return;

    this.lastCollisionTime = now;

    // Determine lateral bump direction relative to current track orientation
    let bumpSign = 1;
    if (this.lastTrackPoint && this.lastTrackPoint.normal) {
      const normal = this.lastTrackPoint.normal;
      const hitVec = new THREE.Vector3().subVectors(this.body.position, otherBody.position);
      const lateralDot = hitVec.x * normal.x + hitVec.z * normal.z;
      bumpSign = lateralDot >= 0 ? 1 : -1;
    } else {
      bumpSign = (otherBody.position.z > this.body.position.z) ? -1 : 1;
    }

    // Apply lateral bump velocity (bounces away sideways)
    const bumpMagnitude = Math.min(6.5, impactSpeed * 0.42 + 1.8);
    this.bumpOffsetVelocity = bumpSign * bumpMagnitude;

    // Scrub longitudinal speed (impact friction & emergency braking)
    this.currentSpeed = Math.max(8.0, this.currentSpeed * 0.78);
    this.setBrakeVisuals(true);

    // Trigger loss of control & fishtail slide
    this.isLostControl = true;
    this.lossOfControlTimer = 1.35; // ~1.3 seconds of fighting the slide

    // Initial fishtail yaw jerk & angular velocity
    this.fishtailVelocity = -bumpSign * Math.min(4.8, impactSpeed * 0.40 + 1.5);
    this.fishtailAngle = -bumpSign * 0.22;
  }

  initVisuals() {
    this.carGroup = new THREE.Group();
    this.scene.add(this.carGroup);

    // Materials
    this.materials = {
      body: new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(this.paintColor),
        metalness: 0.18,
        roughness: 0.32,
        clearcoat: 0.55,
        clearcoatRoughness: 0.22,
        sheen: 0.2
      }),
      carbon: new THREE.MeshStandardMaterial({
        color: 0x181a20,
        metalness: 0.15,
        roughness: 0.65
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x080d14,
        metalness: 0.05,
        roughness: 0.25,
        transmission: 0.5,
        transparent: true,
        opacity: 0.85
      }),
      chrome: new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.45,
        roughness: 0.55
      }),
      headlightLens: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xf8fafc,
        emissiveIntensity: 2.2,
        roughness: 0.15
      }),
      drlStrip: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xf1f5f9,
        emissiveIntensity: 1.8,
        roughness: 0.15
      }),
      taillightLens: new THREE.MeshStandardMaterial({
        color: 0xff002b,
        emissive: 0x880015,
        emissiveIntensity: 0.9,
        roughness: 0.4
      })
    };

    const chassisMesh = new THREE.Group();

    // 1. Aerodynamic Underbody & Carbon Floor
    const floorGeo = new THREE.BoxGeometry(1.92, 0.18, 4.25);
    const floor = new THREE.Mesh(floorGeo, this.materials.carbon);
    floor.position.set(0, 0.04, 0);
    floor.castShadow = true;
    chassisMesh.add(floor);

    // 2. Sculpted Lower Body Shell
    const mainBodyGeo = new THREE.BoxGeometry(1.86, 0.42, 4.05);
    const mainBody = new THREE.Mesh(mainBodyGeo, this.materials.body);
    mainBody.position.set(0, 0.32, 0);
    mainBody.castShadow = true;
    chassisMesh.add(mainBody);

    // Front Sloping Hood
    const hoodGeo = new THREE.BoxGeometry(1.76, 0.22, 1.45);
    const hood = new THREE.Mesh(hoodGeo, this.materials.body);
    hood.position.set(0, 0.38, 1.22);
    hood.rotation.x = -0.14;
    hood.castShadow = true;
    chassisMesh.add(hood);

    // Front Carbon Splitter
    const splitterGeo = new THREE.BoxGeometry(1.96, 0.08, 0.65);
    const splitter = new THREE.Mesh(splitterGeo, this.materials.carbon);
    splitter.position.set(0, 0.05, 2.18);
    splitter.castShadow = true;
    chassisMesh.add(splitter);

    // Front Radiator Grille
    const grilleGeo = new THREE.BoxGeometry(1.3, 0.24, 0.08);
    const grille = new THREE.Mesh(grilleGeo, this.materials.carbon);
    grille.position.set(0, 0.22, 2.1);
    chassisMesh.add(grille);

    // Fender Flares
    const flareGeo = new THREE.BoxGeometry(0.12, 0.34, 0.95);
    for (let side = -1; side <= 1; side += 2) {
      const fFlare = new THREE.Mesh(flareGeo, this.materials.body);
      fFlare.position.set(side * 0.96, 0.36, 1.35);
      chassisMesh.add(fFlare);

      const rFlare = new THREE.Mesh(flareGeo, this.materials.body);
      rFlare.position.set(side * 0.96, 0.38, -1.35);
      chassisMesh.add(rFlare);
    }

    // Side Skirts
    for (let side = -1; side <= 1; side += 2) {
      const skirtGeo = new THREE.BoxGeometry(0.12, 0.08, 2.1);
      const skirt = new THREE.Mesh(skirtGeo, this.materials.carbon);
      skirt.position.set(side * 0.96, 0.07, 0);
      chassisMesh.add(skirt);
    }

    // 3. Cabin Canopy & Roof
    const cabinGeo = new THREE.BoxGeometry(1.42, 0.44, 1.85);
    const cabin = new THREE.Mesh(cabinGeo, this.materials.glass);
    cabin.position.set(0, 0.74, -0.22);
    cabin.castShadow = true;
    chassisMesh.add(cabin);

    const roofGeo = new THREE.BoxGeometry(1.32, 0.08, 1.45);
    const roof = new THREE.Mesh(roofGeo, this.materials.body);
    roof.position.set(0, 0.96, -0.28);
    roof.castShadow = true;
    chassisMesh.add(roof);

    // Interior Cockpit (Seats & Steering Wheel)
    const interiorMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9 });
    const seatGeo = new THREE.BoxGeometry(0.42, 0.55, 0.4);
    const driverSeat = new THREE.Mesh(seatGeo, interiorMat);
    driverSeat.position.set(-0.35, 0.58, -0.32);
    chassisMesh.add(driverSeat);
    const passSeat = new THREE.Mesh(seatGeo, interiorMat);
    passSeat.position.set(0.35, 0.58, -0.32);
    chassisMesh.add(passSeat);

    // 4. Rear GT Wing on Swan-Neck Pylons
    const wingGeo = new THREE.BoxGeometry(1.92, 0.06, 0.46);
    const wing = new THREE.Mesh(wingGeo, this.materials.carbon);
    wing.position.set(0, 1.05, -2.0);
    wing.rotation.x = 0.07;
    wing.castShadow = true;
    chassisMesh.add(wing);

    for (let side = -1; side <= 1; side += 2) {
      const endplateGeo = new THREE.BoxGeometry(0.04, 0.28, 0.52);
      const endplate = new THREE.Mesh(endplateGeo, this.materials.carbon);
      endplate.position.set(side * 0.96, 1.05, -2.0);
      chassisMesh.add(endplate);

      const pylonGeo = new THREE.BoxGeometry(0.06, 0.46, 0.28);
      const pylon = new THREE.Mesh(pylonGeo, this.materials.carbon);
      pylon.position.set(side * 0.55, 0.82, -1.94);
      chassisMesh.add(pylon);
    }

    // 5. Rear Diffuser & Quad Titanium Exhaust Tips
    for (let f = -0.6; f <= 0.6; f += 0.4) {
      const finGeo = new THREE.BoxGeometry(0.04, 0.18, 0.5);
      const fin = new THREE.Mesh(finGeo, this.materials.carbon);
      fin.position.set(f, 0.1, -2.1);
      chassisMesh.add(fin);
    }

    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x1f232b, metalness: 0.75, roughness: 0.45 });
    const exhaustInnerMat = new THREE.MeshBasicMaterial({ color: 0x050507 });
    const exhaustGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.28, 16);
    const exhaustInnerGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.02, 16);
    [-0.48, -0.32, 0.32, 0.48].forEach(x => {
      const tip = new THREE.Mesh(exhaustGeo, exhaustMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(x, 0.16, -2.14);
      chassisMesh.add(tip);

      const bore = new THREE.Mesh(exhaustInnerGeo, exhaustInnerMat);
      bore.rotation.x = Math.PI / 2;
      bore.position.set(x, 0.16, -2.27);
      chassisMesh.add(bore);
    });

    // Side Mirrors
    for (let side = -1; side <= 1; side += 2) {
      const mirrorGroup = new THREE.Group();
      mirrorGroup.position.set(side * 0.88, 0.68, 0.48);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), this.materials.carbon);
      mirrorGroup.add(arm);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.14), this.materials.carbon);
      housing.position.x = side * 0.12;
      mirrorGroup.add(housing);
      chassisMesh.add(mirrorGroup);
    }

    // Headlights & DRL
    for (let side = -1; side <= 1; side += 2) {
      const hHousing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.1), this.materials.carbon);
      hHousing.position.set(side * 0.64, 0.42, 2.06);
      hHousing.rotation.y = -side * 0.08;
      chassisMesh.add(hHousing);

      for (let p = -0.08; p <= 0.08; p += 0.16) {
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16), this.materials.headlightLens);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(side * 0.64 + p, 0.42, 2.11);
        chassisMesh.add(lens);
      }

      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.04), this.materials.drlStrip);
      drl.position.set(side * 0.64, 0.48, 2.11);
      drl.rotation.y = -side * 0.08;
      chassisMesh.add(drl);
    }

    // Forward SpotLights with soft road projection
    this.headlights = [];
    [-0.64, 0.64].forEach(xOffset => {
      const spot = new THREE.SpotLight(0xf2f8ff, 140, 55, Math.PI / 5.8, 0.65, 1.4);
      spot.position.set(xOffset, 0.42, 2.15);
      const target = new THREE.Object3D();
      target.position.set(xOffset * 0.35, -0.15, 30.0);
      chassisMesh.add(target);
      spot.target = target;
      chassisMesh.add(spot);
      this.headlights.push(spot);
    });

    // Dynamic LED Taillights
    const lightBlade = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.035, 0.06), this.materials.taillightLens);
    lightBlade.position.set(0, 0.56, -2.06);
    chassisMesh.add(lightBlade);

    for (let side = -1; side <= 1; side += 2) {
      const tMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.06), this.materials.taillightLens);
      tMesh.position.set(side * 0.65, 0.48, -2.06);
      chassisMesh.add(tMesh);
    }

    this.brakeGlowLight = new THREE.PointLight(0xff002b, 0, 5, 2);
    this.brakeGlowLight.position.set(0, 0.5, -2.35);
    chassisMesh.add(this.brakeGlowLight);

    this.chassisMesh = chassisMesh;
    this.chassisMesh.position.y = -0.16; // Match GT stance
    this.carGroup.add(chassisMesh);

    // Wheels
    this.createWheels();

    // Ground Contact Shadow
    this.createContactShadow();
  }

  createWheels() {
    this.wheelMeshes = [];
    this.frontWheelPivots = [];

    const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.88, metalness: 0.05 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2b3240, roughness: 0.25, metalness: 0.9 });
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd9162e, roughness: 0.35, metalness: 0.7 });
    const discMat = new THREE.MeshStandardMaterial({ color: 0x8892b0, roughness: 0.3, metalness: 0.95 });

    const wheelHalfWidth = this.width / 2 - 0.06;
    const wheelForwardOffset = 1.38;

    const wheelConfigs = [
      { isFront: true,  x: -wheelHalfWidth, z: wheelForwardOffset },
      { isFront: true,  x: wheelHalfWidth,  z: wheelForwardOffset },
      { isFront: false, x: -wheelHalfWidth, z: -wheelForwardOffset },
      { isFront: false, x: wheelHalfWidth,  z: -wheelForwardOffset }
    ];

    wheelConfigs.forEach(cfg => {
      const wheelHolder = new THREE.Group();
      wheelHolder.position.set(cfg.x, 0.18, cfg.z);

      // Pivot for front steering
      const steerPivot = new THREE.Group();
      wheelHolder.add(steerPivot);
      if (cfg.isFront) {
        this.frontWheelPivots.push(steerPivot);
      }

      // Rolling spin mesh
      const spinMesh = new THREE.Group();
      steerPivot.add(spinMesh);

      // Tire cylinder
      const tireGeo = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.28, 24);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      spinMesh.add(tire);

      // Rim
      const rimGeo = new THREE.CylinderGeometry(this.wheelRadius * 0.72, this.wheelRadius * 0.72, 0.29, 16);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      spinMesh.add(rim);

      // Brake Disc
      const discGeo = new THREE.CylinderGeometry(this.wheelRadius * 0.62, this.wheelRadius * 0.62, 0.04, 16);
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.z = Math.PI / 2;
      disc.position.x = (cfg.x > 0 ? -1 : 1) * 0.08;
      steerPivot.add(disc);

      // Caliper
      const caliperGeo = new THREE.BoxGeometry(0.12, 0.14, 0.08);
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set((cfg.x > 0 ? -1 : 1) * 0.08, 0.15, 0);
      steerPivot.add(caliper);

      this.carGroup.add(wheelHolder);
      this.wheelMeshes.push(spinMesh);
    });
  }

  createContactShadow() {
    const shadowGeo = new THREE.PlaneGeometry(3.2, 5.6);
    const shadowTex = getSharedShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.94,
      depthWrite: false
    });
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.012;
    this.contactShadow.renderOrder = 3;
    this.scene.add(this.contactShadow);
    this.shadowPlaneQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  }

  setPaintColor(color) {
    this.paintColor = color;
    if (this.materials && this.materials.body) {
      this.materials.body.color.set(color);
    }
  }

  setBrakeVisuals(active) {
    this.isBraking = active;
    if (active) {
      this.materials.taillightLens.emissive.setHex(0xff002b);
      this.materials.taillightLens.emissiveIntensity = 2.8;
      this.brakeGlowLight.intensity = 1.8;
    } else {
      this.materials.taillightLens.emissive.setHex(0x880015);
      this.materials.taillightLens.emissiveIntensity = 0.9;
      this.brakeGlowLight.intensity = 0;
    }
  }

  resetToGrid() {
    this.currentS = this.startS;
    this.currentOffset = this.startOffset;
    this.targetOffset = this.startOffset;
    this.currentSpeed = 0;
    this.currentSpeedKmh = 0;
    this.isBraking = false;
    this.isRacing = false;
    this.reactionTimer = 0;
    this.wheelRotation = 0;
    this.steerAngle = 0;

    // Reset collision & loss of control states
    this.bumpOffsetVelocity = 0;
    this.isLostControl = false;
    this.lossOfControlTimer = 0;
    this.fishtailAngle = 0;
    this.fishtailVelocity = 0;
    this.lastCollisionTime = 0;

    this.completedLaps = 0;
    this.hasCrossedStart = false;
    this.lapStartTime = 0;
    this.currentLapTime = 0;
    this.bestLapTime = null;
    this.lapHistory = [];
    this.totalRaceTime = 0;
    this.finishedRace = false;

    this.body.position.set(this.gridPosition.x, this.gridPosition.y, this.gridPosition.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);

    this.carGroup.position.copy(this.gridPosition);
    this.carGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

    if (this.contactShadow) {
      this.contactShadow.position.x = this.gridPosition.x;
      this.contactShadow.position.z = this.gridPosition.z;
      this.contactShadow.position.y = 0.012;
      this.contactShadow.quaternion
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
        .multiply(this.shadowPlaneQuat);
    }

    this.setBrakeVisuals(true);
  }

  startRacing() {
    this.isRacing = true;
    this.reactionTimer = 0;
  }

  /**
   * Calculates continuous cumulative race distance for live leaderboard positioning.
   */
  getRaceDistance(track) {
    const totalL = track.totalLength;
    let relS = this.currentS - 80; // Start line at s = 80
    if (this.hasCrossedStart) {
      if (relS < 0) relS += totalL;
      return (this.completedLaps * totalL) + relS;
    } else {
      return relS; // Negative on starting grid (e.g. -8m, -19m, -30m)
    }
  }

  getTargetSpeed(s, totalL) {
    // Normalised s in [0, totalLength]
    // Straight 1 (Bottom): s in [0, 160] (Start/Finish at s = 80)
    // Turn 1 (East Hairpin): s in [160, 301.37]
    // Straight 2 (Top): s in [301.37, 461.37]
    // Turn 2 (West Hairpin): s in [461.37, 602.74]

    const topV = this.topSpeedKmh / 3.6;
    const cornerV = this.cornerSpeedKmh / 3.6;

    // Hard Braking zone 1 (approaching Turn 1): s in [124, 160]
    if (s >= 124 && s <= 160) {
      const t = (s - 124) / 36;
      return topV - t * (topV - cornerV);
    }
    // Turn 1 apex & mid-corner: s in [160, 282]
    if (s > 160 && s < 282) {
      return cornerV;
    }
    // Turn 1 acceleration exit onto back straight: s in [282, 335]
    if (s >= 282 && s <= 335) {
      const t = (s - 282) / 53;
      return cornerV + t * (topV - cornerV);
    }
    // Back Straight top speed: s in [335, 424]
    if (s > 335 && s < 424) {
      return topV;
    }
    // Hard Braking zone 2 (approaching Turn 2): s in [424, 460]
    if (s >= 424 && s <= 460) {
      const t = (s - 424) / 36;
      return topV - t * (topV - cornerV);
    }
    // Turn 2 apex & mid-corner: s in [460, 582]
    if (s > 460 && s < 582) {
      return cornerV;
    }
    // Turn 2 acceleration exit onto main straight: s in [582, 602.74] and [0, 28]
    if (s >= 582 || s < 28) {
      const curS = s >= 582 ? (s - 582) : (s + totalL - 582);
      const span = totalL - 582 + 28;
      const t = Math.min(1.0, curS / span);
      return cornerV + t * (topV - cornerV);
    }

    // Main straight high speed
    return topV;
  }

  update(dt, isSessionRacing, allVehicles, track) {
    if (!this.isRacing) {
      if (isSessionRacing) {
        this.startRacing();
      } else {
        // Held at starting grid
        this.setBrakeVisuals(true);
        this.syncVisuals(track);
        return;
      }
    }

    // Handle human reaction time delay on race green light
    if (this.reactionTimer < this.reactionDelay) {
      this.reactionTimer += dt;
      this.setBrakeVisuals(true);
      this.syncVisuals(track);
      return;
    }

    if (this.finishedRace) {
      // Coast down safely after checkered flag
      this.currentSpeed = Math.max(0, this.currentSpeed - 8.0 * dt);
      this.currentSpeedKmh = Math.round(this.currentSpeed * 3.6);
      this.currentS = (this.currentS + this.currentSpeed * dt) % track.totalLength;
      this.syncVisuals(track);
      return;
    }

    const totalL = track.totalLength;
    let targetSpeed = this.getTargetSpeed(this.currentS % totalL, totalL);

    // Collision avoidance and overtaking intelligence
    let shouldBrakeForTraffic = false;
    let desiredOffsetChange = 0;

    for (const other of allVehicles) {
      if (other === this) continue;

      // Distance ahead along track
      let sAhead = other.currentS - this.currentS;
      if (sAhead < -totalL / 2) sAhead += totalL;
      if (sAhead > totalL / 2) sAhead -= totalL;

      // Only consider cars ahead within 16 meters
      if (sAhead > 0.5 && sAhead < 16.0) {
        const offsetDiff = Math.abs(this.currentOffset - other.currentOffset);

        if (offsetDiff < 2.0) {
          // Car directly in path in our lane
          if (this.currentSpeed > other.currentSpeed) {
            // Plan an overtake!
            if (this.currentOffset > 0) {
              // Steer inside to pass
              desiredOffsetChange = -2.8;
            } else {
              // Steer outside to pass
              desiredOffsetChange = 2.8;
            }

            // If dangerously close, check up on throttle to prevent clipping
            if (sAhead < 5.0) {
              shouldBrakeForTraffic = true;
              targetSpeed = Math.min(targetSpeed, other.currentSpeed * 0.95);
            }
          }
        }
      }
    }

    // Loss of Control & Fishtail dynamics
    if (this.isLostControl) {
      this.lossOfControlTimer -= dt;
      if (this.lossOfControlTimer <= 0) {
        this.isLostControl = false;
        this.lossOfControlTimer = 0;
      }
      // Damped harmonic oscillator simulating rear end stepping out & counter-steering
      const springK = 32.0;
      const dampingC = 5.2;
      const springForce = -springK * this.fishtailAngle - dampingC * this.fishtailVelocity;
      this.fishtailVelocity += springForce * dt;
      this.fishtailAngle += this.fishtailVelocity * dt;
      this.fishtailAngle = Math.max(-0.50, Math.min(0.50, this.fishtailAngle));
    } else {
      // Smoothly return fishtail angle to center
      this.fishtailAngle *= Math.exp(-dt * 6.0);
      this.fishtailVelocity = 0;
    }

    // Integrate lateral bump impulse velocity
    if (Math.abs(this.bumpOffsetVelocity) > 0.01) {
      this.currentOffset += this.bumpOffsetVelocity * dt;
      this.bumpOffsetVelocity *= Math.exp(-dt * 3.8); // Smoothly decay lateral bounce
    }

    // Guardrail collision boundary check & rebound bounce
    const maxOffset = 5.2;
    if (this.currentOffset > maxOffset) {
      this.currentOffset = maxOffset;
      this.bumpOffsetVelocity = -Math.abs(this.bumpOffsetVelocity) * 0.45;
      this.fishtailAngle = -0.18;
      this.fishtailVelocity = -2.2;
    } else if (this.currentOffset < -maxOffset) {
      this.currentOffset = -maxOffset;
      this.bumpOffsetVelocity = Math.abs(this.bumpOffsetVelocity) * 0.45;
      this.fishtailAngle = 0.18;
      this.fishtailVelocity = 2.2;
    }

    // Update target lateral offset when not severely sliding
    if (!this.isLostControl) {
      this.targetOffset = Math.max(-5.2, Math.min(5.2, this.startOffset + desiredOffsetChange));
      this.currentOffset += (this.targetOffset - this.currentOffset) * Math.min(1.0, dt * 2.5);
    }

    // Speed acceleration / braking physics
    let isHardBraking = false;
    const effectiveTargetSpeed = this.isLostControl ? Math.min(targetSpeed, 24.0) : targetSpeed;

    if (this.currentSpeed < effectiveTargetSpeed) {
      const accel = this.isLostControl ? (this.accelRate * 0.4) : this.accelRate;
      this.currentSpeed = Math.min(this.currentSpeed + accel * dt, effectiveTargetSpeed);
    } else if (this.currentSpeed > effectiveTargetSpeed) {
      const decel = (shouldBrakeForTraffic || this.isLostControl) ? (this.brakeRate * 1.25) : this.brakeRate;
      this.currentSpeed = Math.max(this.currentSpeed - decel * dt, effectiveTargetSpeed);
      if (this.currentSpeed - effectiveTargetSpeed > 2.0) {
        isHardBraking = true;
      }
    }

    this.setBrakeVisuals(isHardBraking || shouldBrakeForTraffic || this.isLostControl);
    this.currentSpeedKmh = Math.round(this.currentSpeed * 3.6);

    // Advance longitudinal spline position
    const prevS = this.currentS;
    this.currentS = (this.currentS + this.currentSpeed * dt) % totalL;

    // Track Lap crossing (Start line is at s = 80)
    if (prevS < 80 && this.currentS >= 80) {
      const now = performance.now();
      if (!this.hasCrossedStart) {
        this.hasCrossedStart = true;
        this.lapStartTime = now;
      } else {
        const lapTime = (now - this.lapStartTime) / 1000;
        this.completedLaps++;
        this.lapHistory.push({ number: this.completedLaps, time: lapTime });
        if (this.bestLapTime === null || lapTime < this.bestLapTime) {
          this.bestLapTime = lapTime;
        }
        this.lapStartTime = now;

        if (this.completedLaps >= this.totalLaps) {
          this.finishedRace = true;
          this.totalRaceTime = this.lapHistory.reduce((acc, l) => acc + l.time, 0);
        }
      }
    }

    if (this.hasCrossedStart && !this.finishedRace) {
      this.currentLapTime = (performance.now() - this.lapStartTime) / 1000;
    }

    this.syncVisuals(track, dt);
  }

  syncVisuals(track, dt = 1 / 60) {
    const trackPoint = track.getTrackPoint(this.currentS);
    this.lastTrackPoint = trackPoint;

    // 3D position = centerline pos + (normal * lateral offset)
    const posX = trackPoint.pos.x + trackPoint.normal.x * this.currentOffset;
    const posZ = trackPoint.pos.z + trackPoint.normal.z * this.currentOffset;
    const posY = 0.50; // Stable GT sports car ride height

    // Forward direction tangent with fishtail angle applied to yaw!
    const forward = trackPoint.tangent.clone().normalize();
    const baseYaw = Math.atan2(forward.x, forward.z);
    const yaw = baseYaw + this.fishtailAngle;

    const carQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    // Sync Three.js Car Mesh
    this.carGroup.position.set(posX, posY, posZ);
    this.carGroup.quaternion.copy(carQuat);

    // Sync Cannon Physics Kinematic Body
    this.body.position.set(posX, posY, posZ);
    this.body.quaternion.set(carQuat.x, carQuat.y, carQuat.z, carQuat.w);

    // Set kinematic velocity for Cannon momentum collisions with player, including lateral slide
    const slideVx = -Math.sin(baseYaw) * (this.bumpOffsetVelocity * 0.6);
    const slideVz = Math.cos(baseYaw) * (this.bumpOffsetVelocity * 0.6);
    const vx = forward.x * this.currentSpeed + slideVx;
    const vz = forward.z * this.currentSpeed + slideVz;
    this.body.velocity.set(vx, 0, vz);

    // Wheel spin rotation
    this.wheelRotation += (this.currentSpeed / this.wheelRadius) * dt;
    for (const spinMesh of this.wheelMeshes) {
      spinMesh.rotation.x = this.wheelRotation;
    }

    // Front wheel steering: counter-steer into slides or turn into hairpins
    let targetSteer = 0;
    if (this.isLostControl || Math.abs(this.fishtailAngle) > 0.04) {
      targetSteer = -this.fishtailAngle * 1.6; // Driver actively counter-steers into slide!
    } else if (trackPoint.section === 'turn-1' || trackPoint.section === 'turn-2') {
      targetSteer = 0.28; // Turning into the oval hairpin
    }
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1.0, dt * 10.0);
    for (const pivot of this.frontWheelPivots) {
      pivot.rotation.y = this.steerAngle;
    }

    // Ambient Occlusion Contact Shadow clamped to ground
    if (this.contactShadow) {
      this.contactShadow.position.set(posX, 0.012, posZ);
      this.contactShadow.quaternion
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        .multiply(this.shadowPlaneQuat);
    }
  }
}
