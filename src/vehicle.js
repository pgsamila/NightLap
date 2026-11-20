import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Realistic GT Sports Car
 * Features MeshPhysicalMaterial automotive clearcoat paint, sculpted aerodynamic bodywork,
 * quad-LED headlights with DRL strips, dynamic taillights, cross-drilled brakes with red calipers,
 * deep-dish forged alloy wheels, 5-speed automatic transmission, and RaycastVehicle physics.
 */
export class Vehicle {
  constructor(scene, world, soundEngine, effectsManager = null) {
    this.scene = scene;
    this.world = world;
    this.soundEngine = soundEngine;
    this.effectsManager = effectsManager;

    // Vehicle dimensions
    this.chassisWidth = 1.95;
    this.chassisHeight = 0.62;
    this.chassisLength = 4.35;
    this.chassisMass = 1350; // kg

    // Wheel parameters
    this.wheelRadius = 0.36;
    this.wheelWidth = 0.28;

    // 5-Speed Automatic Transmission Ratios (Supercar Spec)
    this.gears = {
      R: { ratio: -2.8, maxSpeed: 60,  force: 3800 },
      1: { ratio: 3.6,  maxSpeed: 62,  force: 6800 },
      2: { ratio: 2.4,  maxSpeed: 108, force: 5400 },
      3: { ratio: 1.65, maxSpeed: 158, force: 4200 },
      4: { ratio: 1.22, maxSpeed: 205, force: 3200 },
      5: { ratio: 0.92, maxSpeed: 260, force: 2400 }
    };
    this.currentGear = '1';
    this.rpm = 950;
    this.idleRpm = 950;
    this.redlineRpm = 7500;
    this.shiftTimer = 0;
    this.isBraking = false;
    this.isReversing = false;
    this.isHandbraking = false;
    this.isHeldAtGrid = true; // Launch control hold during F1 start countdown
    this.currentSpeedKmh = 0;
    this.topSpeedKmh = 0;
    this.slipAmount = 0;

    // Control inputs
    this.inputs = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      handbrake: false
    };

    // Camera view mode: 'chase' or 'hood'
    this.cameraMode = 'chase';

    // Spawn parameters (Starting grid Row 3 - P4, inside slot, facing +X)
    this.spawnPos = new CANNON.Vec3(-41, 0.50, 41.8);
    this.spawnYaw = Math.PI / 2;

    this.wheelMeshes = [];
    this.materials = {};

    this.initPhysics();
    this.initVisuals();
    this.initControls();
  }

  initPhysics() {
    const chassisShape = new CANNON.Box(new CANNON.Vec3(
      this.chassisWidth / 2,
      this.chassisHeight / 2,
      this.chassisLength / 2
    ));

    this.chassisBody = new CANNON.Body({
      mass: this.chassisMass,
      position: this.spawnPos.clone(),
      material: new CANNON.Material('chassisMaterial')
    });

    this.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.08, 0));
    this.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.spawnYaw);
    this.chassisBody.linearDamping = 0.05;
    this.chassisBody.angularDamping = 0.50;

    this.world.addBody(this.chassisBody);

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2
    });

    const wheelHalfWidth = this.chassisWidth / 2 - 0.06;
    const wheelForwardOffset = 1.38;
    const wheelDownOffset = 0.0; // Level with center of mass for low-slung GT stance

    const commonWheelOptions = {
      radius: this.wheelRadius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 60,
      suspensionRestLength: 0.18,
      frictionSlip: 3.5,
      dampingRelaxation: 3.2,
      dampingCompression: 5.0,
      maxSuspensionForce: 100000,
      rollInfluence: 0.0, // 0.0 ensures lateral friction acts through center of mass to prevent rolling over
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      maxSuspensionTravel: 0.14,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true
    };

    // Wheel 0: Front Left
    this.vehicle.addWheel({
      ...commonWheelOptions,
      chassisConnectionPointLocal: new CANNON.Vec3(-wheelHalfWidth, wheelDownOffset, wheelForwardOffset)
    });
    // Wheel 1: Front Right
    this.vehicle.addWheel({
      ...commonWheelOptions,
      chassisConnectionPointLocal: new CANNON.Vec3(wheelHalfWidth, wheelDownOffset, wheelForwardOffset)
    });
    // Wheel 2: Rear Left
    this.vehicle.addWheel({
      ...commonWheelOptions,
      chassisConnectionPointLocal: new CANNON.Vec3(-wheelHalfWidth, wheelDownOffset, -wheelForwardOffset)
    });
    // Wheel 3: Rear Right
    this.vehicle.addWheel({
      ...commonWheelOptions,
      chassisConnectionPointLocal: new CANNON.Vec3(wheelHalfWidth, wheelDownOffset, -wheelForwardOffset)
    });

    this.vehicle.addToWorld(this.world);
  }

  initVisuals() {
    this.carGroup = new THREE.Group();
    this.scene.add(this.carGroup);

    // --- PBR Materials ---
    // Premium Automotive Clearcoat Metallic Paint (balanced specular sheen without blinding mirror reflection)
    this.materials.body = new THREE.MeshPhysicalMaterial({
      color: 0x00c2ff,
      metalness: 0.18,
      roughness: 0.32,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      sheen: 0.2
    });

    // Satin Matte Carbon Fiber for splitters, diffuser, and spoiler
    this.materials.carbon = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      metalness: 0.15,
      roughness: 0.65
    });

    // Dark Tinted Automotive Glass with soft realistic reflections
    this.materials.glass = new THREE.MeshPhysicalMaterial({
      color: 0x080d14,
      metalness: 0.05,
      roughness: 0.25,
      transmission: 0.5,
      transparent: true,
      opacity: 0.85
    });

    // Dark Gunmetal / Titanium for exhaust & accents
    this.materials.chrome = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.45,
      roughness: 0.55
    });

    // Headlight Lens and LED projector elements
    this.materials.headlightLens = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf8fafc,
      emissiveIntensity: 2.2,
      roughness: 0.15
    });

    // DRL (Daytime Running Light) Clean White Accent Strip
    this.materials.drlStrip = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf1f5f9,
      emissiveIntensity: 1.8,
      roughness: 0.15
    });

    // Dynamic LED Taillight Lens
    this.materials.taillightLens = new THREE.MeshStandardMaterial({
      color: 0xff002b,
      emissive: 0x880015,
      emissiveIntensity: 0.9,
      roughness: 0.4
    });

    // White Reverse Light Lens
    this.materials.reverseLens = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.2
    });

    // --- Sculpted 3D GT Bodywork Assembly ---
    const chassisMesh = new THREE.Group();

    // 1. Aerodynamic Underbody & Carbon Floor
    const floorGeo = new THREE.BoxGeometry(1.92, 0.18, 4.25);
    const floor = new THREE.Mesh(floorGeo, this.materials.carbon);
    floor.position.set(0, 0.04, 0);
    floor.castShadow = true;
    chassisMesh.add(floor);

    // 2. Sculpted Lower Body Shell with Wheel Arches
    const mainBodyGeo = new THREE.BoxGeometry(1.86, 0.42, 4.05);
    const mainBody = new THREE.Mesh(mainBodyGeo, this.materials.body);
    mainBody.position.set(0, 0.32, 0);
    mainBody.castShadow = true;
    chassisMesh.add(mainBody);

    // Front Sloping Aerodynamic Hood with center spine
    const hoodGeo = new THREE.BoxGeometry(1.76, 0.22, 1.45);
    const hood = new THREE.Mesh(hoodGeo, this.materials.body);
    hood.position.set(0, 0.38, 1.22);
    hood.rotation.x = -0.14;
    hood.castShadow = true;
    chassisMesh.add(hood);

    // Hood Air Extractor Vents
    const ventMat = new THREE.MeshBasicMaterial({ color: 0x0f1217 });
    for (let side = -1; side <= 1; side += 2) {
      const ventGeo = new THREE.BoxGeometry(0.24, 0.02, 0.45);
      const vent = new THREE.Mesh(ventGeo, ventMat);
      vent.position.set(side * 0.45, 0.48, 1.15);
      vent.rotation.x = -0.14;
      chassisMesh.add(vent);
    }

    // Front Bumper with Tiered Carbon Splitter & Canards
    const splitterGeo = new THREE.BoxGeometry(1.96, 0.08, 0.65);
    const splitter = new THREE.Mesh(splitterGeo, this.materials.carbon);
    splitter.position.set(0, 0.05, 2.18);
    splitter.castShadow = true;
    chassisMesh.add(splitter);

    // Front Canards (Aerodynamic dive planes)
    for (let side = -1; side <= 1; side += 2) {
      const canardGeo = new THREE.BoxGeometry(0.32, 0.04, 0.28);
      const canard = new THREE.Mesh(canardGeo, this.materials.carbon);
      canard.position.set(side * 0.98, 0.24, 2.05);
      canard.rotation.z = side * 0.25;
      chassisMesh.add(canard);
    }

    // Front Recessed Radiator Grille
    const grilleGeo = new THREE.BoxGeometry(1.3, 0.24, 0.08);
    const grille = new THREE.Mesh(grilleGeo, this.materials.carbon);
    grille.position.set(0, 0.22, 2.1);
    chassisMesh.add(grille);

    // Muscular Wheel Fender Flares (Front & Rear)
    const flareGeo = new THREE.BoxGeometry(0.12, 0.34, 0.95);
    for (let side = -1; side <= 1; side += 2) {
      // Front flare
      const fFlare = new THREE.Mesh(flareGeo, this.materials.body);
      fFlare.position.set(side * 0.96, 0.36, 1.35);
      chassisMesh.add(fFlare);
      // Rear flare
      const rFlare = new THREE.Mesh(flareGeo, this.materials.body);
      rFlare.position.set(side * 0.96, 0.38, -1.35);
      chassisMesh.add(rFlare);
    }

    // Side Rocker Skirts
    for (let side = -1; side <= 1; side += 2) {
      const skirtGeo = new THREE.BoxGeometry(0.12, 0.08, 2.1);
      const skirt = new THREE.Mesh(skirtGeo, this.materials.carbon);
      skirt.position.set(side * 0.96, 0.07, 0);
      chassisMesh.add(skirt);
    }

    // 3. Cabin Canopy (Curved tinted glass greenhouse & roof)
    const cabinGeo = new THREE.BoxGeometry(1.42, 0.44, 1.85);
    const cabin = new THREE.Mesh(cabinGeo, this.materials.glass);
    cabin.position.set(0, 0.74, -0.22);
    cabin.castShadow = true;
    chassisMesh.add(cabin);

    // Sculpted Aerodynamic Roof Band
    const roofGeo = new THREE.BoxGeometry(1.32, 0.08, 1.45);
    const roof = new THREE.Mesh(roofGeo, this.materials.body);
    roof.position.set(0, 0.96, -0.28);
    roof.castShadow = true;
    chassisMesh.add(roof);

    // Visible Interior Cockpit: Dashboard, Steering Wheel, Sport Bucket Seats
    const interiorMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9 });
    const seatGeo = new THREE.BoxGeometry(0.42, 0.55, 0.4);
    // Driver seat
    const driverSeat = new THREE.Mesh(seatGeo, interiorMat);
    driverSeat.position.set(-0.35, 0.58, -0.32);
    chassisMesh.add(driverSeat);
    // Passenger seat
    const passSeat = new THREE.Mesh(seatGeo, interiorMat);
    passSeat.position.set(0.35, 0.58, -0.32);
    chassisMesh.add(passSeat);

    // Steering wheel torus
    const wheelTorusGeo = new THREE.TorusGeometry(0.12, 0.025, 8, 16);
    const steerMesh = new THREE.Mesh(wheelTorusGeo, interiorMat);
    steerMesh.position.set(-0.35, 0.68, 0.12);
    steerMesh.rotation.x = -Math.PI / 6;
    chassisMesh.add(steerMesh);

    // 4. Rear Aerodynamic GT Wing on Swan-Neck Pylons
    const wingGeo = new THREE.BoxGeometry(1.92, 0.06, 0.46);
    const wing = new THREE.Mesh(wingGeo, this.materials.carbon);
    wing.position.set(0, 1.05, -2.0);
    wing.rotation.x = 0.07;
    wing.castShadow = true;
    chassisMesh.add(wing);

    // Wing Endplates
    for (let side = -1; side <= 1; side += 2) {
      const endplateGeo = new THREE.BoxGeometry(0.04, 0.28, 0.52);
      const endplate = new THREE.Mesh(endplateGeo, this.materials.carbon);
      endplate.position.set(side * 0.96, 1.05, -2.0);
      chassisMesh.add(endplate);
    }

    // Dual Swan-Neck Support Pylons
    for (let side = -1; side <= 1; side += 2) {
      const pylonGeo = new THREE.BoxGeometry(0.06, 0.46, 0.28);
      const pylon = new THREE.Mesh(pylonGeo, this.materials.carbon);
      pylon.position.set(side * 0.55, 0.82, -1.94);
      chassisMesh.add(pylon);
    }

    // 5. Rear Diffuser with 4 Carbon Fins & Quad Stainless Exhaust Tips
    for (let f = -0.6; f <= 0.6; f += 0.4) {
      const finGeo = new THREE.BoxGeometry(0.04, 0.18, 0.5);
      const fin = new THREE.Mesh(finGeo, this.materials.carbon);
      fin.position.set(f, 0.1, -2.1);
      chassisMesh.add(fin);
    }

    // Quad Titanium Exhaust Tips (Deep gunmetal finish with interior black bore)
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x1f232b,
      metalness: 0.75,
      roughness: 0.45
    });
    const exhaustInnerMat = new THREE.MeshBasicMaterial({ color: 0x050507 });
    const exhaustGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.28, 16);
    const exhaustInnerGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.02, 16);
    const exhaustOffsets = [-0.48, -0.32, 0.32, 0.48];
    exhaustOffsets.forEach(x => {
      const tip = new THREE.Mesh(exhaustGeo, exhaustMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(x, 0.16, -2.14);
      chassisMesh.add(tip);

      const bore = new THREE.Mesh(exhaustInnerGeo, exhaustInnerMat);
      bore.rotation.x = Math.PI / 2;
      bore.position.set(x, 0.16, -2.27);
      chassisMesh.add(bore);
    });

    // Carbon Side Mirrors
    for (let side = -1; side <= 1; side += 2) {
      const mirrorGroup = new THREE.Group();
      mirrorGroup.position.set(side * 0.88, 0.68, 0.48);

      const mirrorArmGeo = new THREE.BoxGeometry(0.14, 0.04, 0.06);
      const arm = new THREE.Mesh(mirrorArmGeo, this.materials.carbon);
      mirrorGroup.add(arm);

      const mirrorHousingGeo = new THREE.BoxGeometry(0.24, 0.12, 0.14);
      const housing = new THREE.Mesh(mirrorHousingGeo, this.materials.carbon);
      housing.position.x = side * 0.12;
      mirrorGroup.add(housing);

      chassisMesh.add(mirrorGroup);
    }

    // --- Quad-LED Projector Headlights & DRL Strips ---
    for (let side = -1; side <= 1; side += 2) {
      // Recessed dark housing
      const hHousingGeo = new THREE.BoxGeometry(0.34, 0.14, 0.1);
      const hHousing = new THREE.Mesh(hHousingGeo, this.materials.carbon);
      hHousing.position.set(side * 0.64, 0.42, 2.06);
      hHousing.rotation.y = -side * 0.08;
      chassisMesh.add(hHousing);

      // Jewel-eye dual projector lenses
      for (let p = -0.08; p <= 0.08; p += 0.16) {
        const lensGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16);
        const lens = new THREE.Mesh(lensGeo, this.materials.headlightLens);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(side * 0.64 + p, 0.42, 2.11);
        chassisMesh.add(lens);
      }

      // Cyan DRL Neon Accent Strip
      const drlGeo = new THREE.BoxGeometry(0.32, 0.025, 0.04);
      const drl = new THREE.Mesh(drlGeo, this.materials.drlStrip);
      drl.position.set(side * 0.64, 0.48, 2.11);
      drl.rotation.y = -side * 0.08;
      chassisMesh.add(drl);
    }

    // Forward SpotLights with soft road projection
    this.headlights = [];
    const makeHeadlight = (xOffset) => {
      const spot = new THREE.SpotLight(0xf2f8ff, 160, 65, Math.PI / 5.8, 0.65, 1.4);
      spot.position.set(xOffset, 0.42, 2.15);

      const target = new THREE.Object3D();
      target.position.set(xOffset * 0.35, -0.15, 32.0);
      chassisMesh.add(target);
      spot.target = target;

      spot.castShadow = true;
      spot.shadow.mapSize.width = 1024;
      spot.shadow.mapSize.height = 1024;
      spot.shadow.bias = -0.0008;

      chassisMesh.add(spot);
      this.headlights.push(spot);
    };

    makeHeadlight(-0.64);
    makeHeadlight(0.64);

    // --- Dynamic LED Taillights & Dynamic Brake Glow ---
    // Full-width central light blade
    const lightBladeGeo = new THREE.BoxGeometry(1.4, 0.035, 0.06);
    const lightBlade = new THREE.Mesh(lightBladeGeo, this.materials.taillightLens);
    lightBlade.position.set(0, 0.56, -2.06);
    chassisMesh.add(lightBlade);

    // Twin aggressive taillight blocks
    for (let side = -1; side <= 1; side += 2) {
      const tGeo = new THREE.BoxGeometry(0.46, 0.12, 0.06);
      const tMesh = new THREE.Mesh(tGeo, this.materials.taillightLens);
      tMesh.position.set(side * 0.65, 0.48, -2.06);
      chassisMesh.add(tMesh);

      // White reverse light segment
      const revGeo = new THREE.BoxGeometry(0.14, 0.06, 0.06);
      const revMesh = new THREE.Mesh(revGeo, this.materials.reverseLens);
      revMesh.position.set(side * 0.44, 0.48, -2.06);
      chassisMesh.add(revMesh);
    }

    // Red brake point light casting illumination behind car
    this.brakeGlowLight = new THREE.PointLight(0xff002b, 0, 5, 2);
    this.brakeGlowLight.position.set(0, 0.5, -2.35);
    chassisMesh.add(this.brakeGlowLight);

    this.chassisMesh = chassisMesh;
    this.chassisMesh.position.y = -0.16; // Low-slung GT racecar stance with tucked wheel arches
    this.carGroup.add(chassisMesh);

    // 6. Styled Deep-Dish Alloy Wheels & Brakes
    this.createWheels();

    // 7. Ambient Occlusion Contact Shadow (Ground shadow & tire footprints)
    this.createContactShadow();
  }

  createContactShadow() {
    // 3.2m wide by 5.6m long fits the full GT car dimensions with realistic penumbra falloff
    const shadowGeo = new THREE.PlaneGeometry(3.2, 5.6);
    const shadowTex = this.createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.96,
      depthWrite: false
    });
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.012;
    this.contactShadow.renderOrder = 3;
    this.scene.add(this.contactShadow);
    this.shadowPlaneQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  }

  createContactShadowTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    // Helper: draw GT sports car aerodynamic silhouette path matching exact car bodywork
    const traceCarSilhouette = () => {
      ctx.beginPath();
      // Rear Center diffuser
      ctx.moveTo(512, 95);
      // Rear Left diffuser & bumper
      ctx.lineTo(210, 105);
      ctx.quadraticCurveTo(175, 120, 168, 175);
      // Rear Left Widebody Flare & Wheel Arch
      ctx.quadraticCurveTo(155, 230, 155, 260);
      ctx.quadraticCurveTo(155, 305, 175, 340);
      // Left Rocker Skirt & Waist Inset
      ctx.lineTo(195, 420);
      ctx.lineTo(195, 600);
      // Front Left Widebody Flare & Wheel Arch
      ctx.quadraticCurveTo(165, 680, 160, 764);
      ctx.quadraticCurveTo(160, 810, 185, 850);
      // Front Left Splitter Canard & Bumper Corner
      ctx.lineTo(210, 910);
      ctx.quadraticCurveTo(250, 955, 360, 962);
      // Front Splitter Leading Edge (Center)
      ctx.lineTo(512, 965);
      // Front Right Splitter Leading Edge
      ctx.lineTo(664, 962);
      ctx.quadraticCurveTo(774, 955, 814, 910);
      // Front Right Splitter Corner & Wheel Arch
      ctx.lineTo(839, 850);
      ctx.quadraticCurveTo(864, 810, 864, 764);
      ctx.quadraticCurveTo(859, 680, 829, 600);
      // Right Rocker Skirt & Waist
      ctx.lineTo(829, 420);
      // Rear Right Widebody Flare & Wheel Arch
      ctx.lineTo(849, 340);
      ctx.quadraticCurveTo(869, 305, 869, 260);
      ctx.quadraticCurveTo(869, 230, 856, 175);
      // Rear Right Diffuser & Bumper
      ctx.quadraticCurveTo(849, 120, 814, 105);
      ctx.closePath();
    };

    // --- Pass 1: Broad, Soft Ambient Penumbra Halo ---
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 55;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    traceCarSilhouette();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    ctx.restore();

    // --- Pass 2: Main Body Silhouette Occlusion (Tight Soft Edge) ---
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 22;
    traceCarSilhouette();
    const bodyGrad = ctx.createRadialGradient(512, 512, 60, 512, 512, 420);
    bodyGrad.addColorStop(0, 'rgba(0, 0, 0, 0.96)');
    bodyGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.90)');
    bodyGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.72)');
    bodyGrad.addColorStop(1, 'rgba(0, 0, 0, 0.40)');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.restore();

    // --- Pass 3: Deep Core Undercarriage Floor Umbra ---
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 28;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.98)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(220, 210, 584, 580, [70]);
    } else {
      ctx.rect(220, 210, 584, 580);
    }
    ctx.fill();
    ctx.restore();

    // --- Pass 4: Heavy Tire Contact Footprints (Wide Racing Slicks) ---
    const drawTireFootprint = (cx, cy, w, h) => {
      ctx.save();
      // Outer tire ambient contact gradient
      const tireGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, Math.max(w, h) * 0.7);
      tireGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
      tireGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.95)');
      tireGrad.addColorStop(0.88, 'rgba(0, 0, 0, 0.5)');
      tireGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

      ctx.fillStyle = tireGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep solid black rubber core contact patch
      ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cx - w * 0.55, cy - h * 0.65, w * 1.1, h * 1.3, [10]);
      } else {
        ctx.rect(cx - w * 0.55, cy - h * 0.65, w * 1.1, h * 1.3);
      }
      ctx.fill();
      ctx.restore();
    };

    // Front Tires: cx = 219 & 805, cy = 764
    drawTireFootprint(219, 764, 46, 42); // Front Left
    drawTireFootprint(805, 764, 46, 42); // Front Right

    // Rear Tires (Wider Racing Slicks): cx = 219 & 805, cy = 260
    drawTireFootprint(219, 260, 52, 46); // Rear Left
    drawTireFootprint(805, 260, 52, 46); // Rear Right

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    return texture;
  }

  createWheels() {
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x16181c,
      roughness: 0.92,
      metalness: 0.08
    });

    // Forged alloy rim (Graphite Gunmetal with polished lip)
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.92,
      roughness: 0.22
    });

    const rimLipMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.75,
      roughness: 0.35
    });

    // Brembo Racing Red Brake Caliper
    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xd9162e,
      roughness: 0.25,
      metalness: 0.7
    });

    // Cross-drilled steel brake rotor
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.75,
      roughness: 0.4
    });

    for (let i = 0; i < 4; i++) {
      const wheelContainer = new THREE.Group();

      // Outer tire rubber cylinder
      const tireGeo = new THREE.CylinderGeometry(
        this.wheelRadius,
        this.wheelRadius,
        this.wheelWidth,
        28
      );
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelContainer.add(tire);

      // Deep-dish Outer Rim Lip
      const lipGeo = new THREE.CylinderGeometry(
        this.wheelRadius * 0.68,
        this.wheelRadius * 0.68,
        this.wheelWidth * 1.02,
        24,
        1,
        true
      );
      const lip = new THREE.Mesh(lipGeo, rimLipMat);
      lip.rotation.z = Math.PI / 2;
      wheelContainer.add(lip);

      // 6-Spoke Forged Rim Design
      for (let s = 0; s < 6; s++) {
        const spokeGeo = new THREE.BoxGeometry(0.035, this.wheelRadius * 0.64, 0.045);
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = (s * Math.PI * 2) / 6;
        wheelContainer.add(spoke);
      }

      // Center Hub Nut
      const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, this.wheelWidth * 1.04, 12);
      const hub = new THREE.Mesh(hubGeo, rimMat);
      hub.rotation.z = Math.PI / 2;
      wheelContainer.add(hub);

      // Cross-Drilled Brake Rotor Disc
      const rotorGeo = new THREE.CylinderGeometry(
        this.wheelRadius * 0.54,
        this.wheelRadius * 0.54,
        0.025,
        20
      );
      const rotor = new THREE.Mesh(rotorGeo, rotorMat);
      rotor.rotation.z = Math.PI / 2;
      wheelContainer.add(rotor);

      // Brembo Multi-Piston Brake Caliper
      const caliperGeo = new THREE.BoxGeometry(0.09, 0.15, 0.12);
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(0, this.wheelRadius * 0.36, 0);
      wheelContainer.add(caliper);

      this.scene.add(wheelContainer);
      this.wheelMeshes.push(wheelContainer);
    }
  }

  initControls() {
    window.addEventListener('keydown', (e) => {
      if (this.soundEngine && !this.soundEngine.isInitialized) {
        this.soundEngine.init();
      }

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.inputs.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.inputs.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.inputs.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.inputs.right = true;
          break;
        case 'Space':
          this.inputs.handbrake = true;
          e.preventDefault();
          break;
        case 'KeyC':
          this.toggleCamera();
          break;
        case 'KeyR':
          this.resetToGrid();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.inputs.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.inputs.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.inputs.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.inputs.right = false;
          break;
        case 'Space':
          this.inputs.handbrake = false;
          break;
      }
    });
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === 'chase' ? 'hood' : 'chase';
  }

  update(dt) {
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
    }

    // 1. Calculate vehicle speed & heading
    const vel = this.chassisBody.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    this.currentSpeedKmh = speed * 3.6;
    if (this.currentSpeedKmh > this.topSpeedKmh) {
      this.topSpeedKmh = this.currentSpeedKmh;
    }

    const forwardVec = new CANNON.Vec3(0, 0, 1);
    this.chassisBody.quaternion.vmult(forwardVec, forwardVec);
    const forwardSpeed = vel.dot(forwardVec);

    // 2. Lateral tire slip
    const rightVec = new CANNON.Vec3(1, 0, 0);
    this.chassisBody.quaternion.vmult(rightVec, rightVec);
    const lateralSpeed = Math.abs(vel.dot(rightVec));
    this.slipAmount = Math.min(1.0, lateralSpeed / 12);
    if (this.inputs.handbrake && speed > 5) {
      this.slipAmount = Math.max(this.slipAmount, 0.75);
    }

    // Electronic Stability Control (ESC) to stabilize violent yaw spin when rubbing cars
    if (!this.inputs.handbrake && Math.abs(forwardSpeed) > 4) {
      this.chassisBody.angularVelocity.y *= Math.exp(-dt * 2.2);
    }

    // 3. Transmission logic
    this.updateTransmission(forwardSpeed, dt);

    // 4. Forces & Steering
    this.applyForces(forwardSpeed);

    // 5. Sync Visual 3D Meshes
    this.syncVisuals();

    // 6. Sound Engine (pass speed for high-speed aerodynamic wind noise)
    if (this.soundEngine) {
      const isThrottle = (this.inputs.forward && this.currentGear !== 'R') || (this.inputs.backward && this.currentGear === 'R');
      this.soundEngine.update(this.rpm, isThrottle, this.slipAmount, this.currentSpeedKmh);
    }

    // 7. Dynamic Particle Effects & Skid Marks
    if (this.effectsManager) {
      this.effectsManager.update(dt, this);
    }
  }

  updateTransmission(forwardSpeed, dt) {
    const speedKmh = Math.abs(this.currentSpeedKmh);

    // Standstill switching: Forward <-> Reverse
    if (speedKmh < 2.5) {
      if (this.inputs.backward && this.currentGear !== 'R') {
        this.currentGear = 'R';
        if (this.soundEngine) this.soundEngine.playShiftSound();
      } else if (this.inputs.forward && this.currentGear === 'R') {
        this.currentGear = '1';
        if (this.soundEngine) this.soundEngine.playShiftSound();
      }
    }

    if (this.currentGear !== 'R') {
      const gNum = parseInt(this.currentGear, 10);
      const gearCfg = this.gears[gNum];

      const speedNorm = speedKmh / gearCfg.maxSpeed;
      const throttleBonus = (this.inputs.forward && this.shiftTimer <= 0) ? 950 : 0;
      const targetRpm = Math.min(this.redlineRpm, Math.max(this.idleRpm, speedNorm * 6200 + throttleBonus));
      this.rpm += (targetRpm - this.rpm) * Math.min(1.0, dt * 10);

      // Automatic Upshift
      if (this.rpm > 6400 && gNum < 5 && speedKmh > gearCfg.maxSpeed * 0.72 && this.shiftTimer <= 0) {
        this.currentGear = String(gNum + 1);
        this.shiftTimer = 0.16;
        this.rpm = 4200;
        if (this.soundEngine) this.soundEngine.playShiftSound();
      }
      // Automatic Downshift
      else if (this.rpm < 2700 && gNum > 1 && speedKmh < gearCfg.maxSpeed * 0.6 && this.shiftTimer <= 0) {
        this.currentGear = String(gNum - 1);
        this.shiftTimer = 0.12;
        this.rpm = 5400;
        if (this.soundEngine) this.soundEngine.playShiftSound();
      }
    } else {
      const revNorm = speedKmh / this.gears.R.maxSpeed;
      const throttleBonus = this.inputs.backward ? 850 : 0;
      this.rpm = Math.min(5500, Math.max(this.idleRpm, revNorm * 5000 + throttleBonus));
    }
  }

  applyForces(forwardSpeed) {
    const maxSteerVal = 0.48; // Max steering angle (radians)
    const speedFactor = Math.min(1.0, this.currentSpeedKmh / 160);
    const steerLimit = maxSteerVal * (1.0 - speedFactor * 0.42);

    // 1. Steering: Left key steers left, Right key steers right!
    let targetSteering = 0;
    if (this.inputs.left) targetSteering += steerLimit;
    if (this.inputs.right) targetSteering -= steerLimit;

    this.vehicle.setSteeringValue(targetSteering, 0);
    this.vehicle.setSteeringValue(targetSteering, 1);

    // Grid Hold / Launch Control during F1 countdown
    if (this.isHeldAtGrid) {
      for (let i = 0; i < 4; i++) {
        this.vehicle.setBrake(160, i);
        this.vehicle.applyEngineForce(0, i);
      }
      // Allow driver to rev engine at the starting grid!
      const targetRpm = this.inputs.forward ? 5600 : this.idleRpm;
      this.rpm += (targetRpm - this.rpm) * 0.15;
      this.setBrakeVisuals(true);
      return;
    }

    // 2. Engine and Brake forces
    const maxBrakeForce = 110;
    const handbrakeForce = 160;
    let engineForce = 0;
    let brakeForce = 0;

    this.isBraking = false;
    this.isReversing = (this.currentGear === 'R');

    if (this.inputs.handbrake) {
      this.isHandbraking = true;
      this.vehicle.setBrake(handbrakeForce, 2);
      this.vehicle.setBrake(handbrakeForce, 3);
      this.vehicle.setBrake(15, 0);
      this.vehicle.setBrake(15, 1);
      this.vehicle.applyEngineForce(0, 2);
      this.vehicle.applyEngineForce(0, 3);
      this.setBrakeVisuals(true);
      return;
    }

    this.isHandbraking = false;

    if (this.currentGear !== 'R') {
      if (this.inputs.forward && this.shiftTimer <= 0) {
        const gearInfo = this.gears[this.currentGear];
        engineForce = -gearInfo.force;
      }

      if (this.inputs.backward) {
        if (forwardSpeed > 0.8) {
          brakeForce = maxBrakeForce;
          this.isBraking = true;
        }
      }
    } else {
      if (this.inputs.backward && this.shiftTimer <= 0) {
        engineForce = this.gears.R.force;
      }
      if (this.inputs.forward) {
        if (forwardSpeed < -0.8) {
          brakeForce = maxBrakeForce;
          this.isBraking = true;
        }
      }
    }

    // Apply engine drive (Rear wheel drive + partial front drive)
    this.vehicle.applyEngineForce(engineForce * 0.7, 2);
    this.vehicle.applyEngineForce(engineForce * 0.7, 3);
    this.vehicle.applyEngineForce(engineForce * 0.3, 0);
    this.vehicle.applyEngineForce(engineForce * 0.3, 1);

    // Apply standard brakes
    this.vehicle.setBrake(brakeForce, 0);
    this.vehicle.setBrake(brakeForce, 1);
    this.vehicle.setBrake(brakeForce, 2);
    this.vehicle.setBrake(brakeForce, 3);

    this.setBrakeVisuals(this.isBraking);
  }

  setBrakeVisuals(active) {
    if (active) {
      this.materials.taillightLens.emissive.setHex(0xff002b);
      this.materials.taillightLens.emissiveIntensity = 2.8;
      this.brakeGlowLight.intensity = 1.8;
    } else {
      this.materials.taillightLens.emissive.setHex(0x880015);
      this.materials.taillightLens.emissiveIntensity = 0.9;
      this.brakeGlowLight.intensity = 0;
    }

    if (this.currentGear === 'R') {
      this.materials.reverseLens.emissive.setHex(0xffffff);
      this.materials.reverseLens.emissiveIntensity = 3.0;
    } else {
      this.materials.reverseLens.emissive.setHex(0x000000);
      this.materials.reverseLens.emissiveIntensity = 0;
    }
  }

  syncVisuals() {
    this.carGroup.position.copy(this.chassisBody.position);
    this.carGroup.quaternion.copy(this.chassisBody.quaternion);

    const tireDeflection = 0.015; // 1.5 cm deflection into asphalt for firm visual contact
    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform;
      const wheelMesh = this.wheelMeshes[i];
      if (wheelMesh) {
        wheelMesh.position.set(t.position.x, t.position.y - tireDeflection, t.position.z);
        wheelMesh.quaternion.copy(t.quaternion);
      }
    }

    // Ground-clamped Ambient Occlusion Contact Shadow
    if (this.contactShadow) {
      this.contactShadow.position.x = this.chassisBody.position.x;
      this.contactShadow.position.z = this.chassisBody.position.z;
      this.contactShadow.position.y = 0.012;

      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.carGroup.quaternion);
      const yaw = Math.atan2(forward.x, forward.z);
      this.contactShadow.quaternion
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        .multiply(this.shadowPlaneQuat);
    }
  }

  setSpawnPosition(pos, yaw = Math.PI / 2) {
    this.spawnPos.copy(pos);
    this.spawnYaw = yaw;
  }

  setHeldAtGrid(held) {
    this.isHeldAtGrid = held;
    if (!held) {
      for (let i = 0; i < 4; i++) {
        this.vehicle.setBrake(0, i);
      }
    }
  }

  resetToGrid() {
    this.chassisBody.position.copy(this.spawnPos);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.spawnYaw);

    this.currentGear = '1';
    this.rpm = this.idleRpm;
    this.shiftTimer = 0;
    this.isBraking = false;
    this.isHandbraking = false;
    this.isHeldAtGrid = true;
    this.currentSpeedKmh = 0;
    this.topSpeedKmh = 0;

    for (let i = 0; i < 4; i++) {
      this.vehicle.applyEngineForce(0, i);
      this.vehicle.setBrake(0, i);
      this.vehicle.setSteeringValue(0, i);
    }

    if (this.effectsManager) {
      this.effectsManager.clearSkidMarks();
    }

    this.syncVisuals();
  }

  getCompassHeading() {
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(this.carGroup.quaternion);
    let angleRad = Math.atan2(forward.x, -forward.z);
    if (angleRad < 0) angleRad += 2 * Math.PI;
    return (angleRad * 180) / Math.PI;
  }

  setPaintColor(hex) {
    this.carColorHex = hex;
    if (this.materials && this.materials.body) {
      this.materials.body.color.set(hex);
    }
  }

  setSpeedUnit(unit) {
    this.speedUnit = unit;
  }

  /**
   * Continuous cumulative race distance for live leaderboard positioning.
   */
  getRaceDistance(track, completedLaps, hasCrossedStart) {
    const totalL = track.totalLength;
    const progress = track.calculateTrackProgress(this.chassisBody.position);
    const s = progress * totalL;
    let relS = s - 80; // Start line at s = 80
    if (hasCrossedStart) {
      if (relS < 0) relS += totalL;
      return (completedLaps * totalL) + relS;
    } else {
      return relS; // Negative distance on starting grid (e.g. -41m)
    }
  }
}
