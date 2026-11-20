import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Realistic Stadium Oval Track Generator
 * Generates photorealistic PBR asphalt surface, corrugated W-beam steel guardrails,
 * 3D saw-tooth rumble curbs, brake distance markers, overhead start/finish gantry,
 * stadium floodlight towers, and static Cannon-es rigid colliders.
 */
export class Track {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;

    // Track Geometry Parameters
    this.straightLength = 160; // Length of straightaways (meters)
    this.centerRadius = 45;    // Radius of hairpin turn centerlines (meters)
    this.trackWidth = 16;      // Road width (meters)
    this.wallHeight = 1.35;    // Guardrail height
    this.wallThickness = 0.55; // Guardrail thickness

    this.totalLength = (2 * this.straightLength) + (2 * Math.PI * this.centerRadius);

    // Lap validation checkpoints
    this.checkpoints = [
      { id: 0, name: 'Start/Finish', pos: new THREE.Vector2(0, this.centerRadius), radius: 12, dir: new THREE.Vector2(1, 0) },
      { id: 1, name: 'Turn 1 Apex',   pos: new THREE.Vector2(this.straightLength / 2 + this.centerRadius, 0), radius: 14, dir: new THREE.Vector2(0, -1) },
      { id: 2, name: 'Back Straight', pos: new THREE.Vector2(0, -this.centerRadius), radius: 12, dir: new THREE.Vector2(-1, 0) },
      { id: 3, name: 'Turn 2 Apex',   pos: new THREE.Vector2(-(this.straightLength / 2 + this.centerRadius), 0), radius: 14, dir: new THREE.Vector2(0, 1) }
    ];
    this.nextCheckpointIdx = 1;
    this.lapStartTime = 0;
    this.sessionStartTime = performance.now();
    this.hasStarted = false;

    // Materials
    this.wallMaterial = new CANNON.Material('wallMaterial');
    this.groundMaterial = new CANNON.Material('groundMaterial');

    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);

    this.colliders = [];
    this.floodlights = [];

    this.init();
  }

  init() {
    this.createGround();
    this.createRoadSurface();
    this.createCurbs();
    this.createGuardrails();
    this.createStartFinishGantry();
    this.createBrakeMarkers();
    this.createGrandstands();
    this.createFloodlights();
  }

  getTrackPoint(s) {
    s = ((s % this.totalLength) + this.totalLength) % this.totalLength;
    const L = this.straightLength;
    const R = this.centerRadius;
    const halfL = L / 2;
    const curveLen = Math.PI * R;

    // Section 1: Bottom Straight (Start/Finish), s in [0, L]
    if (s <= L) {
      const x = -halfL + s;
      const z = R;
      return {
        pos: new THREE.Vector3(x, 0, z),
        tangent: new THREE.Vector3(1, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
        section: 'straight-1'
      };
    }

    // Section 2: East Hairpin (Turn 1), s in [L, L + curveLen]
    if (s <= L + curveLen) {
      const progress = (s - L) / curveLen;
      const theta = -Math.PI / 2 + progress * Math.PI;
      const x = halfL + R * Math.cos(theta);
      const z = -R * Math.sin(theta);
      const tx = -Math.sin(theta);
      const tz = -Math.cos(theta);
      const tangent = new THREE.Vector3(tx, 0, tz).normalize();
      const normal = new THREE.Vector3(-tz, 0, tx).normalize();
      return {
        pos: new THREE.Vector3(x, 0, z),
        tangent,
        normal,
        section: 'turn-1'
      };
    }

    // Section 3: Top Straight (Back Straight), s in [L + curveLen, 2L + curveLen]
    if (s <= 2 * L + curveLen) {
      const dist = s - (L + curveLen);
      const x = halfL - dist;
      const z = -R;
      return {
        pos: new THREE.Vector3(x, 0, z),
        tangent: new THREE.Vector3(-1, 0, 0),
        normal: new THREE.Vector3(0, 0, -1),
        section: 'straight-2'
      };
    }

    // Section 4: West Hairpin (Turn 2), s in [2L + curveLen, totalLength]
    const progress = (s - (2 * L + curveLen)) / curveLen;
    const theta = -Math.PI / 2 + progress * Math.PI;
    const x = -halfL - R * Math.cos(theta);
    const z = R * Math.sin(theta);
    const tx = Math.sin(theta);
    const tz = Math.cos(theta);
    const tangent = new THREE.Vector3(tx, 0, tz).normalize();
    const normal = new THREE.Vector3(-tz, 0, tx).normalize();
    return {
      pos: new THREE.Vector3(x, 0, z),
      tangent,
      normal,
      section: 'turn-2'
    };
  }

  /**
   * Generates high-fidelity PBR procedural textures for asphalt
   */
  createRoadPBRTextures() {
    const size = 1024;

    // --- 1. Albedo / Diffuse Map ---
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dctx = diffCanvas.getContext('2d');

    // Base asphalt aggregate color
    dctx.fillStyle = '#1c1f26';
    dctx.fillRect(0, 0, size, size);

    // Multi-frequency noise for realistic stone aggregate texture
    const imgData = dctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n1 = (Math.random() - 0.5) * 26;
      const n2 = (Math.random() - 0.5) * 14;
      const n = n1 + n2;
      data[i] = Math.max(12, Math.min(65, data[i] + n));
      data[i + 1] = Math.max(14, Math.min(68, data[i + 1] + n * 0.95));
      data[i + 2] = Math.max(18, Math.min(74, data[i + 2] + n * 1.05));
    }
    dctx.putImageData(imgData, 0, 0);

    // Dark rubberized racing groove (where tires grip and polish the asphalt)
    const grooveGrad1 = dctx.createLinearGradient(size * 0.14, 0, size * 0.38, 0);
    grooveGrad1.addColorStop(0, 'rgba(10, 12, 16, 0.0)');
    grooveGrad1.addColorStop(0.5, 'rgba(8, 10, 14, 0.7)');
    grooveGrad1.addColorStop(1, 'rgba(10, 12, 16, 0.0)');
    dctx.fillStyle = grooveGrad1;
    dctx.fillRect(size * 0.14, 0, size * 0.24, size);

    const grooveGrad2 = dctx.createLinearGradient(size * 0.62, 0, size * 0.86, 0);
    grooveGrad2.addColorStop(0, 'rgba(10, 12, 16, 0.0)');
    grooveGrad2.addColorStop(0.5, 'rgba(8, 10, 14, 0.7)');
    grooveGrad2.addColorStop(1, 'rgba(10, 12, 16, 0.0)');
    dctx.fillStyle = grooveGrad2;
    dctx.fillRect(size * 0.62, 0, size * 0.24, size);

    // Outer solid white track boundary lines (weathered edge)
    dctx.fillStyle = '#f0f4f8';
    dctx.fillRect(size * 0.035, 0, 18, size);
    dctx.fillRect(size * 0.965 - 18, 0, 18, size);

    // Center dashed white line with realistic slight thermoplastic erosion
    const dashLength = 70;
    const gapLength = 55;
    const cWidth = 14;
    const cX = size * 0.5 - cWidth / 2;
    dctx.fillStyle = '#edf2f7';
    for (let y = 0; y < size; y += dashLength + gapLength) {
      dctx.fillRect(cX, y + 4, cWidth, dashLength - 8);
    }

    const diffTexture = new THREE.CanvasTexture(diffCanvas);
    diffTexture.wrapS = THREE.RepeatWrapping;
    diffTexture.wrapT = THREE.RepeatWrapping;
    diffTexture.repeat.set(1, 90);
    diffTexture.anisotropy = 16;

    // --- 2. Roughness Map ---
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rctx = roughCanvas.getContext('2d');

    // Base rough asphalt (~0.85)
    rctx.fillStyle = '#d8d8d8';
    rctx.fillRect(0, 0, size, size);

    // Smooth polished rubber racing grooves (~0.45 roughness)
    rctx.fillStyle = 'rgba(80, 80, 80, 0.65)';
    rctx.fillRect(size * 0.16, 0, size * 0.20, size);
    rctx.fillRect(size * 0.64, 0, size * 0.20, size);

    // White painted lines have slight sheen
    rctx.fillStyle = '#999999';
    rctx.fillRect(size * 0.035, 0, 18, size);
    rctx.fillRect(size * 0.965 - 18, 0, 18, size);

    const roughTexture = new THREE.CanvasTexture(roughCanvas);
    roughTexture.wrapS = THREE.RepeatWrapping;
    roughTexture.wrapT = THREE.RepeatWrapping;
    roughTexture.repeat.set(1, 90);
    roughTexture.anisotropy = 16;

    return { diffTexture, roughTexture };
  }

  createCheckeredTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const cols = 24;
    const rows = 6;
    const w = canvas.width / cols;
    const h = canvas.height / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isWhite = (r + c) % 2 === 0;
        ctx.fillStyle = isWhite ? '#f8fafc' : '#0f131a';
        ctx.fillRect(c * w, r * h, w, h);
      }
    }

    // Subtle edge borders
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 16;
    return texture;
  }

  createGround() {
    // 1. Surrounding Terrain & Gravel Runoff
    const groundGeo = new THREE.PlaneGeometry(650, 650, 16, 16);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f16,
      roughness: 0.95,
      metalness: 0.05
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true;
    this.trackGroup.add(groundMesh);

    // Infield grass island with realistic manicured turf color
    const infieldGeo = new THREE.PlaneGeometry(
      this.straightLength,
      (this.centerRadius - this.trackWidth / 2) * 2 - 2
    );
    const infieldMat = new THREE.MeshStandardMaterial({
      color: 0x121b16,
      roughness: 0.88,
      metalness: 0.02
    });
    const infieldMesh = new THREE.Mesh(infieldGeo, infieldMat);
    infieldMesh.rotation.x = -Math.PI / 2;
    infieldMesh.position.set(0, -0.04, 0);
    infieldMesh.receiveShadow = true;
    this.trackGroup.add(infieldMesh);

    // Hairpin Gravel Runoff Traps (Outer East and West turns)
    const gravelMat = new THREE.MeshStandardMaterial({
      color: 0x5a4838,
      roughness: 0.95,
      metalness: 0.05
    });
    const gravelGeo = new THREE.RingGeometry(
      this.centerRadius + this.trackWidth / 2,
      this.centerRadius + this.trackWidth / 2 + 10,
      32,
      1,
      -Math.PI / 2,
      Math.PI
    );

    // East gravel trap
    const eastGravel = new THREE.Mesh(gravelGeo, gravelMat);
    eastGravel.rotation.x = -Math.PI / 2;
    eastGravel.position.set(this.straightLength / 2, -0.035, 0);
    this.trackGroup.add(eastGravel);

    // West gravel trap
    const westGravel = new THREE.Mesh(gravelGeo, gravelMat);
    westGravel.rotation.x = -Math.PI / 2;
    westGravel.rotation.z = Math.PI;
    westGravel.position.set(-this.straightLength / 2, -0.035, 0);
    this.trackGroup.add(westGravel);

    // Cannon-es static ground body
    const groundShape = new CANNON.Box(new CANNON.Vec3(450, 1, 450));
    const groundBody = new CANNON.Body({
      mass: 0,
      material: this.groundMaterial,
      shape: groundShape,
      position: new CANNON.Vec3(0, -1, 0)
    });
    this.world.addBody(groundBody);
    this.colliders.push(groundBody);
  }

  createRoadSurface() {
    const segments = 450;
    const halfW = this.trackWidth / 2;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const s = (i / segments) * this.totalLength;
      const pt = this.getTrackPoint(s);

      const leftX = pt.pos.x - pt.normal.x * halfW;
      const leftZ = pt.pos.z - pt.normal.z * halfW;
      const rightX = pt.pos.x + pt.normal.x * halfW;
      const rightZ = pt.pos.z + pt.normal.z * halfW;

      positions.push(leftX, 0.01, leftZ);
      positions.push(rightX, 0.01, rightZ);

      normals.push(0, 1, 0);
      normals.push(0, 1, 0);

      const v = (i / segments) * 90;
      uvs.push(0, v);
      uvs.push(1, v);

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);

    const { diffTexture, roughTexture } = this.createRoadPBRTextures();
    const roadMat = new THREE.MeshStandardMaterial({
      map: diffTexture,
      roughnessMap: roughTexture,
      roughness: 0.8,
      metalness: 0.12
    });

    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.trackGroup.add(roadMesh);

    // Checkered Start/Finish Line Mesh
    const sfGeo = new THREE.PlaneGeometry(4.0, this.trackWidth);
    const sfMat = new THREE.MeshStandardMaterial({
      map: this.createCheckeredTexture(),
      roughness: 0.45,
      metalness: 0.1
    });
    const sfMesh = new THREE.Mesh(sfGeo, sfMat);
    sfMesh.rotation.x = -Math.PI / 2;
    sfMesh.position.set(0, 0.02, this.centerRadius);
    sfMesh.receiveShadow = true;
    this.trackGroup.add(sfMesh);

    // Starting grid box slots with tire rubber burnout streaks
    this.createStartingGrid();
  }

  createStartingGrid() {
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const rubberMat = new THREE.MeshBasicMaterial({ color: 0x090b10, transparent: true, opacity: 0.6 });

    for (let row = 0; row < 5; row++) {
      const x = -8 - row * 11;
      const zOffset = (row % 2 === 0) ? 3.2 : -3.2;

      // Painted box outline
      const boxGeo = new THREE.PlaneGeometry(4.5, 2.2);
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.rotation.x = -Math.PI / 2;
      box.position.set(x, 0.015, this.centerRadius + zOffset);
      this.trackGroup.add(box);

      // Rubber launch burnout streaks
      const streakGeo = new THREE.PlaneGeometry(3.5, 0.35);
      const leftStreak = new THREE.Mesh(streakGeo, rubberMat);
      leftStreak.rotation.x = -Math.PI / 2;
      leftStreak.position.set(x + 0.8, 0.018, this.centerRadius + zOffset - 0.7);
      this.trackGroup.add(leftStreak);

      const rightStreak = new THREE.Mesh(streakGeo, rubberMat);
      rightStreak.rotation.x = -Math.PI / 2;
      rightStreak.position.set(x + 0.8, 0.018, this.centerRadius + zOffset + 0.7);
      this.trackGroup.add(rightStreak);
    }
  }

  /**
   * 3D Saw-Tooth Beveled Rumble Curbs
   */
  createCurbs() {
    const curbWidth = 1.35;
    const curbHeight = 0.14;
    const segments = 180;

    const makeCurbs = (radiusOffset, isOuter) => {
      const positions = [];
      const colors = [];
      const indices = [];

      const colYellow = new THREE.Color(0xf5b700);
      const colRed = new THREE.Color(0xcc182a);

      const turns = [
        { center: new THREE.Vector2(this.straightLength / 2, 0), start: -Math.PI / 2, end: Math.PI / 2 },
        { center: new THREE.Vector2(-this.straightLength / 2, 0), start: Math.PI / 2, end: 3 * Math.PI / 2 }
      ];

      let vertIdx = 0;

      turns.forEach(turn => {
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const angle = turn.start + t * (turn.end - turn.start);

          const rBase = radiusOffset;
          const rEdge = radiusOffset + (isOuter ? curbWidth : -curbWidth);

          const x1 = turn.center.x + rBase * Math.cos(angle);
          const z1 = turn.center.y + rBase * Math.sin(angle);
          const x2 = turn.center.x + rEdge * Math.cos(angle);
          const z2 = turn.center.y + rEdge * Math.sin(angle);

          // Alternating yellow and red blocks every 3 segments
          const col = Math.floor(i / 3) % 2 === 0 ? colYellow : colRed;

          positions.push(x1, 0.015, z1);
          colors.push(col.r, col.g, col.b);

          positions.push(x2, curbHeight, z2);
          colors.push(col.r * 0.9, col.g * 0.9, col.b * 0.9);

          if (i < segments) {
            const b = vertIdx + i * 2;
            indices.push(b, b + 1, b + 2);
            indices.push(b + 1, b + 3, b + 2);
          }
        }
        vertIdx += (segments + 1) * 2;
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.55,
        metalness: 0.15
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      this.trackGroup.add(mesh);
    };

    makeCurbs(this.centerRadius - this.trackWidth / 2, false);
    makeCurbs(this.centerRadius + this.trackWidth / 2, true);
  }

  /**
   * Corrugated W-Beam Steel Guardrails & Static Cannon Colliders
   */
  createGuardrails() {
    const halfW = this.trackWidth / 2;
    const innerRadius = this.centerRadius - halfW;
    const outerRadius = this.centerRadius + halfW;
    const halfL = this.straightLength / 2;

    // Galvanized steel material with specular reflection
    const steelRailMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.28
    });

    const steelPostMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.5
    });

    const chevronRed = new THREE.MeshBasicMaterial({ color: 0xff1e38 });
    const chevronWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const addSegment = (p1, p2, isOuter) => {
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const diff = new THREE.Vector3().subVectors(p2, p1);
      const segLength = diff.length();
      const angle = Math.atan2(diff.z, diff.x);

      // Main Corrugated W-Beam upper rail
      const wBeamGeo = new THREE.BoxGeometry(segLength, 0.42, 0.18);
      const wBeam = new THREE.Mesh(wBeamGeo, steelRailMat);
      wBeam.position.set(mid.x, 0.95, mid.z);
      wBeam.rotation.y = -angle;
      wBeam.castShadow = true;
      wBeam.receiveShadow = true;
      this.trackGroup.add(wBeam);

      // Lower secondary rubbing rail
      const lowerRailGeo = new THREE.BoxGeometry(segLength, 0.32, 0.16);
      const lowerRail = new THREE.Mesh(lowerRailGeo, steelRailMat);
      lowerRail.position.set(mid.x, 0.45, mid.z);
      lowerRail.rotation.y = -angle;
      this.trackGroup.add(lowerRail);

      // Top steel cable / cap
      const capGeo = new THREE.CylinderGeometry(0.04, 0.04, segLength, 8);
      const cap = new THREE.Mesh(capGeo, steelRailMat);
      cap.rotation.z = Math.PI / 2;
      cap.rotation.y = -angle;
      cap.position.set(mid.x, 1.25, mid.z);
      this.trackGroup.add(cap);

      // Upright I-beam support post
      const postGeo = new THREE.BoxGeometry(0.12, this.wallHeight, 0.16);
      const post = new THREE.Mesh(postGeo, steelPostMat);
      post.position.set(p1.x, this.wallHeight / 2, p1.z);
      post.rotation.y = -angle;
      post.castShadow = true;
      this.trackGroup.add(post);

      // High-visibility reflector marker
      const markerGeo = new THREE.BoxGeometry(0.06, 0.22, 0.14);
      const marker = new THREE.Mesh(markerGeo, isOuter ? chevronRed : chevronWhite);
      marker.position.set(p1.x, 1.05, p1.z);
      marker.rotation.y = -angle;
      this.trackGroup.add(marker);

      // Cannon-es static collider
      const boxShape = new CANNON.Box(new CANNON.Vec3(segLength / 2, this.wallHeight / 2 + 0.5, this.wallThickness / 2));
      const boxBody = new CANNON.Body({
        mass: 0,
        material: this.wallMaterial,
        shape: boxShape,
        position: new CANNON.Vec3(mid.x, this.wallHeight / 2, mid.z)
      });
      boxBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle);
      this.world.addBody(boxBody);
      this.colliders.push(boxBody);
    };

    // 1. Straightaways
    const straightSteps = 20;
    for (let i = 0; i < straightSteps; i++) {
      const xA = -halfL + (i / straightSteps) * this.straightLength;
      const xB = -halfL + ((i + 1) / straightSteps) * this.straightLength;

      // Bottom Straight
      addSegment(new THREE.Vector3(xA, 0, outerRadius), new THREE.Vector3(xB, 0, outerRadius), true);
      addSegment(new THREE.Vector3(xB, 0, innerRadius), new THREE.Vector3(xA, 0, innerRadius), false);

      // Top Straight
      addSegment(new THREE.Vector3(xB, 0, -outerRadius), new THREE.Vector3(xA, 0, -outerRadius), true);
      addSegment(new THREE.Vector3(xA, 0, -innerRadius), new THREE.Vector3(xB, 0, -innerRadius), false);
    }

    // 2. East Hairpin (Turn 1)
    const curveSteps = 28;
    for (let i = 0; i < curveSteps; i++) {
      const a1 = -Math.PI / 2 + (i / curveSteps) * Math.PI;
      const a2 = -Math.PI / 2 + ((i + 1) / curveSteps) * Math.PI;

      const pO1 = new THREE.Vector3(halfL + outerRadius * Math.cos(a1), 0, -outerRadius * Math.sin(a1));
      const pO2 = new THREE.Vector3(halfL + outerRadius * Math.cos(a2), 0, -outerRadius * Math.sin(a2));
      addSegment(pO1, pO2, true);

      const pI1 = new THREE.Vector3(halfL + innerRadius * Math.cos(a1), 0, -innerRadius * Math.sin(a1));
      const pI2 = new THREE.Vector3(halfL + innerRadius * Math.cos(a2), 0, -innerRadius * Math.sin(a2));
      addSegment(pI1, pI2, false);
    }

    // 3. West Hairpin (Turn 2)
    for (let i = 0; i < curveSteps; i++) {
      const a1 = -Math.PI / 2 + (i / curveSteps) * Math.PI;
      const a2 = -Math.PI / 2 + ((i + 1) / curveSteps) * Math.PI;

      const pO1 = new THREE.Vector3(-halfL - outerRadius * Math.cos(a1), 0, outerRadius * Math.sin(a1));
      const pO2 = new THREE.Vector3(-halfL - outerRadius * Math.cos(a2), 0, outerRadius * Math.sin(a2));
      addSegment(pO1, pO2, true);

      const pI1 = new THREE.Vector3(-halfL - innerRadius * Math.cos(a1), 0, innerRadius * Math.sin(a1));
      const pI2 = new THREE.Vector3(-halfL - innerRadius * Math.cos(a2), 0, innerRadius * Math.sin(a2));
      addSegment(pI1, pI2, false);
    }
  }

  /**
   * Brake Distance Marker Boards (150m, 100m, 50m) before both hairpins
   */
  createBrakeMarkers() {
    const makeMarker = (x, z, rotationY, distText) => {
      const markerGroup = new THREE.Group();
      markerGroup.position.set(x, 0, z);
      markerGroup.rotation.y = rotationY;

      // Steel support post
      const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 1.1;
      markerGroup.add(post);

      // Signboard Canvas
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#ff1e38';
      ctx.lineWidth = 14;
      ctx.strokeRect(8, 8, 240, 240);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 110px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(distText, 128, 128);

      const tex = new THREE.CanvasTexture(canvas);
      const boardGeo = new THREE.BoxGeometry(1.4, 1.4, 0.08);
      const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
      const board = new THREE.Mesh(boardGeo, boardMat);
      board.position.y = 1.9;
      markerGroup.add(board);

      this.trackGroup.add(markerGroup);
    };

    // Approach to Turn 1 (Traveling +X along Bottom Straight Z = +centerRadius + 9.5)
    makeMarker(30, this.centerRadius + 9.5, -Math.PI / 2, '150');
    makeMarker(50, this.centerRadius + 9.5, -Math.PI / 2, '100');
    makeMarker(68, this.centerRadius + 9.5, -Math.PI / 2, '50');

    // Approach to Turn 2 (Traveling -X along Top Straight Z = -centerRadius - 9.5)
    makeMarker(-30, -this.centerRadius - 9.5, Math.PI / 2, '150');
    makeMarker(-50, -this.centerRadius - 9.5, Math.PI / 2, '100');
    makeMarker(-68, -this.centerRadius - 9.5, Math.PI / 2, '50');
  }

  /**
   * Heavy Overhead Start / Finish Steel Gantry with 5 Red F1 Start Lights
   */
  createStartFinishGantry() {
    const gantry = new THREE.Group();
    const span = this.trackWidth + 5;
    const height = 8.2;
    const zPos = this.centerRadius;

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.3
    });

    // Dual steel lattice towers
    const towerGeo = new THREE.BoxGeometry(1.0, height, 1.0);
    const leftTower = new THREE.Mesh(towerGeo, steelMat);
    leftTower.position.set(0, height / 2, zPos - span / 2);
    leftTower.castShadow = true;
    gantry.add(leftTower);

    const rightTower = new THREE.Mesh(towerGeo, steelMat);
    rightTower.position.set(0, height / 2, zPos + span / 2);
    rightTower.castShadow = true;
    gantry.add(rightTower);

    // Main Overhead Cross-Truss
    const beamGeo = new THREE.BoxGeometry(1.6, 1.4, span);
    const crossBeam = new THREE.Mesh(beamGeo, steelMat);
    crossBeam.position.set(0, height, zPos);
    crossBeam.castShadow = true;
    gantry.add(crossBeam);

    // Glowing Neon Signboard
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024;
    signCanvas.height = 256;
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#060911';
    sctx.fillRect(0, 0, 1024, 256);
    sctx.strokeStyle = '#00f0ff';
    sctx.lineWidth = 14;
    sctx.strokeRect(10, 10, 1004, 236);

    sctx.font = 'bold 76px sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = '#ffffff';
    sctx.fillText('NIGHTLAP SPEEDWAY', 512, 85);

    sctx.font = 'bold 44px monospace';
    sctx.fillStyle = '#00f0ff';
    sctx.fillText('🏁 START / FINISH 🏁', 512, 175);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: 0x00a3cc,
      emissiveIntensity: 0.5,
      roughness: 0.3
    });

    // Front sign face (facing approaching cars from -X)
    const signGeo = new THREE.PlaneGeometry(12, 2.5);
    const frontSign = new THREE.Mesh(signGeo, signMat);
    frontSign.position.set(-0.82, height, zPos);
    frontSign.rotation.y = -Math.PI / 2;
    gantry.add(frontSign);

    // 5 Formula 1 Dynamic Start Lights
    const lightBoxGeo = new THREE.BoxGeometry(0.3, 0.6, 3.2);
    const lightBox = new THREE.Mesh(lightBoxGeo, steelMat);
    lightBox.position.set(-0.9, height - 1.2, zPos);
    gantry.add(lightBox);

    this.lightOffMat = new THREE.MeshStandardMaterial({
      color: 0x11141c,
      roughness: 0.85
    });

    this.lightRedMat = new THREE.MeshStandardMaterial({
      color: 0xff002b,
      emissive: 0xff002b,
      emissiveIntensity: 4.5,
      roughness: 0.15
    });

    this.lightGreenMat = new THREE.MeshStandardMaterial({
      color: 0x00ff66,
      emissive: 0x00ff66,
      emissiveIntensity: 4.5,
      roughness: 0.15
    });

    this.startLightBulbs = [];
    for (let l = -1.2; l <= 1.2; l += 0.6) {
      const bulbGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 16);
      const bulb = new THREE.Mesh(bulbGeo, this.lightOffMat);
      bulb.rotation.z = Math.PI / 2;
      bulb.position.set(-0.16, 0, l);
      lightBox.add(bulb);
      this.startLightBulbs.push(bulb);
    }

    // High-output start line floodlights pointing straight down
    const startSpot = new THREE.SpotLight(0xfff5e0, 260, 25, Math.PI / 3.5, 0.45);
    startSpot.position.set(0, height - 0.2, zPos);
    startSpot.target.position.set(0, 0, zPos);
    this.scene.add(startSpot.target);
    gantry.add(startSpot);

    this.trackGroup.add(gantry);
  }

  /**
   * Main Straight Spectator Grandstand Structure
   */
  createGrandstands() {
    const standGroup = new THREE.Group();
    const standLength = 110;
    const standHeight = 16;
    const standDepth = 14;
    const zOffset = this.centerRadius + 24;

    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x242d3d,
      roughness: 0.85,
      metalness: 0.1
    });

    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x1e2638,
      roughness: 0.4,
      metalness: 0.7
    });

    // Tiered stepped seating bleachers
    for (let t = 0; t < 6; t++) {
      const tierGeo = new THREE.BoxGeometry(standLength, 1.2, 2.2);
      const tier = new THREE.Mesh(tierGeo, concreteMat);
      tier.position.set(0, 1.0 + t * 1.4, zOffset + t * 2.0);
      tier.castShadow = true;
      standGroup.add(tier);
    }

    // Grandstand canopy roof cantilever
    const canopyGeo = new THREE.BoxGeometry(standLength + 6, 0.6, standDepth + 4);
    const canopy = new THREE.Mesh(canopyGeo, roofMat);
    canopy.position.set(0, standHeight, zOffset + 6);
    canopy.rotation.x = -0.15;
    canopy.castShadow = true;
    standGroup.add(canopy);

    // Support pillars
    for (let p = -45; p <= 45; p += 30) {
      const pillarGeo = new THREE.BoxGeometry(0.8, standHeight, 0.8);
      const pillar = new THREE.Mesh(pillarGeo, concreteMat);
      pillar.position.set(p, standHeight / 2, zOffset + standDepth - 1);
      pillar.castShadow = true;
      standGroup.add(pillar);
    }

    this.trackGroup.add(standGroup);
  }

  /**
   * Stadium High-Output Floodlight Masts with Glowing Flares
   */
  createFloodlights() {
    const towerPositions = [
      new THREE.Vector3(-55, 0, this.centerRadius + 14),
      new THREE.Vector3(55, 0, this.centerRadius + 14),
      new THREE.Vector3(-55, 0, -this.centerRadius - 14),
      new THREE.Vector3(55, 0, -this.centerRadius - 14),
      new THREE.Vector3(this.straightLength / 2 + 54, 0, 26),
      new THREE.Vector3(this.straightLength / 2 + 54, 0, -26),
      new THREE.Vector3(-this.straightLength / 2 - 54, 0, 26),
      new THREE.Vector3(-this.straightLength / 2 - 54, 0, -26)
    ];

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.35
    });

    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffae8 });

    towerPositions.forEach((pos, idx) => {
      const mastHeight = 22;
      const mastGroup = new THREE.Group();
      mastGroup.position.copy(pos);

      // Heavy concrete foundation plinth
      const baseGeo = new THREE.BoxGeometry(2.4, 1.2, 2.4);
      const base = new THREE.Mesh(baseGeo, steelMat);
      base.position.y = 0.6;
      mastGroup.add(base);

      // Tapered lattice mast pole
      const poleGeo = new THREE.CylinderGeometry(0.4, 0.9, mastHeight, 8);
      const pole = new THREE.Mesh(poleGeo, steelMat);
      pole.position.y = mastHeight / 2 + 0.6;
      pole.castShadow = true;
      mastGroup.add(pole);

      // Upper service platform with safety rail
      const platGeo = new THREE.BoxGeometry(5.2, 0.4, 1.6);
      const plat = new THREE.Mesh(platGeo, steelMat);
      plat.position.y = mastHeight + 0.6;
      mastGroup.add(plat);

      // Array of 6 Stadium Floodlight Heads
      for (let f = -2.0; f <= 2.0; f += 0.8) {
        const fixtureGeo = new THREE.BoxGeometry(0.65, 0.45, 0.5);
        const fixture = new THREE.Mesh(fixtureGeo, lampMat);
        fixture.position.set(f, mastHeight + 0.9, 0.2);
        fixture.rotation.x = Math.PI / 5;
        mastGroup.add(fixture);
      }

      // Real 3D SpotLight pointing down towards the track surface
      const targetPos = new THREE.Vector3(
        pos.x * 0.75,
        0,
        pos.z > 0 ? this.centerRadius : -this.centerRadius
      );
      if (Math.abs(pos.x) > this.straightLength / 2) {
        targetPos.x = pos.x > 0 ? this.straightLength / 2 + this.centerRadius * 0.7 : -this.straightLength / 2 - this.centerRadius * 0.7;
        targetPos.z = 0;
      }

      const lightTarget = new THREE.Object3D();
      lightTarget.position.copy(targetPos);
      this.scene.add(lightTarget);

      const spot = new THREE.SpotLight(0xfff3db, 550, 85, Math.PI / 4, 0.45, 1.2);
      spot.position.set(pos.x, mastHeight, pos.z);
      spot.target = lightTarget;
      spot.castShadow = idx < 4; // shadow casting on main straight floodlights
      spot.shadow.mapSize.width = 1024;
      spot.shadow.mapSize.height = 1024;
      spot.shadow.bias = -0.001;

      this.scene.add(spot);
      this.floodlights.push(spot);

      this.trackGroup.add(mastGroup);
    });
  }

  checkProgress(carPos) {
    const p = new THREE.Vector2(carPos.x, carPos.z);
    const now = performance.now();

    const targetCP = this.checkpoints[this.nextCheckpointIdx];
    const dist = p.distanceTo(targetCP.pos);

    let checkpointHit = null;

    if (dist < targetCP.radius) {
      checkpointHit = this.nextCheckpointIdx;
      this.nextCheckpointIdx = (this.nextCheckpointIdx + 1) % this.checkpoints.length;
    }

    let lapCompleted = false;
    let lapTime = 0;

    if (checkpointHit === 0) {
      if (this.hasStarted) {
        lapCompleted = true;
        lapTime = (now - this.lapStartTime) / 1000;
        this.lapStartTime = now;
      } else {
        this.hasStarted = true;
        this.lapStartTime = now;
      }
    } else if (!this.hasStarted && Math.abs(carPos.x) < 5 && Math.abs(carPos.z - this.centerRadius) < 10) {
      this.hasStarted = true;
      this.lapStartTime = now;
    }

    const currentLapTime = this.hasStarted ? (now - this.lapStartTime) / 1000 : 0;
    const progress = this.calculateTrackProgress(carPos);

    return {
      lapCompleted,
      lapTime,
      currentLapTime,
      checkpointHit,
      nextCheckpointIdx: this.nextCheckpointIdx,
      progress
    };
  }

  calculateTrackProgress(pos) {
    const halfL = this.straightLength / 2;
    const R = this.centerRadius;
    const curveLen = Math.PI * R;

    if (pos.z > 0 && pos.x >= -halfL && pos.x <= halfL) {
      const s = pos.x + halfL;
      return s / this.totalLength;
    }
    if (pos.x > halfL) {
      const angle = Math.atan2(-pos.z, pos.x - halfL);
      const normAngle = (angle + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
      const s = this.straightLength + (normAngle / Math.PI) * curveLen;
      return s / this.totalLength;
    }
    if (pos.z <= 0 && pos.x >= -halfL && pos.x <= halfL) {
      const s = this.straightLength + curveLen + (halfL - pos.x);
      return s / this.totalLength;
    }
    const angle = Math.atan2(pos.z, -(pos.x + halfL));
    const normAngle = (angle + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    const s = 2 * this.straightLength + curveLen + (normAngle / Math.PI) * curveLen;
    return s / this.totalLength;
  }

  setStartLights(redCount, isGreen = false) {
    if (!this.startLightBulbs) return;
    this.startLightBulbs.forEach((bulb, idx) => {
      if (isGreen) {
        bulb.material = this.lightGreenMat;
      } else if (idx < redCount) {
        bulb.material = this.lightRedMat;
      } else {
        bulb.material = this.lightOffMat;
      }
    });
  }

  startOfficialSession() {
    this.hasStarted = true;
    this.lapStartTime = performance.now();
    this.nextCheckpointIdx = 1;
  }

  resetSession() {
    this.nextCheckpointIdx = 1;
    this.hasStarted = false;
    this.lapStartTime = performance.now();
    this.sessionStartTime = performance.now();
    this.setStartLights(0, false);
  }
}
