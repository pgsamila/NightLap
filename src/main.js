import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Track } from './track.js';
import { Vehicle } from './vehicle.js';
import { AICar } from './aiVehicle.js';
import { HUD } from './hud.js';
import { SoundEngine } from './audio.js';
import { EffectsManager } from './effects.js';

class NightLapGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');

    // Clock & Fixed timestep physics parameters
    this.clock = new THREE.Clock();
    this.fixedTimeStep = 1 / 60;
    this.maxSubSteps = 10;
    this.lastTime = performance.now();

    // Camera follow smoothing variables
    this.currentCamPos = new THREE.Vector3(0, 5, 0);
    this.currentCamLookAt = new THREE.Vector3(0, 0, 0);

    this.initScene();
    this.initEnvironment();
    this.initPostProcessing();
    this.initPhysics();
    this.initWorldEntities();
    this.initEvents();

    // Main Game Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initScene() {
    // 1. WebGL Renderer with High-Precision Tone Mapping
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // 2. Scene & Dusk Atmospheric Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d18);
    this.scene.fog = new THREE.FogExp2(0x0e1422, 0.0032);

    // 3. Camera
    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.2,
      1200
    );
    this.camera.position.set(-20, 4, 45);

    // 4. Dusk Twilight Sky Atmosphere Dome
    this.createDuskSky();

    // 5. Ambient & Directional Moonlight
    const ambientLight = new THREE.HemisphereLight(0x283a58, 0x0a0e16, 0.85);
    this.scene.add(ambientLight);

    const moonLight = new THREE.DirectionalLight(0x7b9ecc, 1.25);
    moonLight.position.set(80, 75, -60);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 2048;
    moonLight.shadow.mapSize.height = 2048;
    moonLight.shadow.camera.near = 10;
    moonLight.shadow.camera.far = 320;
    const shadowD = 150;
    moonLight.shadow.camera.left = -shadowD;
    moonLight.shadow.camera.right = shadowD;
    moonLight.shadow.camera.top = shadowD;
    moonLight.shadow.camera.bottom = -shadowD;
    moonLight.shadow.bias = -0.0006;
    this.scene.add(moonLight);
  }

  createDuskSky() {
    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x050711) },     // Deep midnight zenith
        horizonColor: { value: new THREE.Color(0x221a36) }, // Purple/indigo dusk horizon
        sunsetGlow: { value: new THREE.Color(0x8a3826) }    // Warm orange sunset glow
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunsetGlow;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float factor = max(0.0, h);
          vec3 col = mix(horizonColor, topColor, pow(factor, 0.6));
          float glow = exp(-max(0.0, h) * 12.0);
          col = mix(col, sunsetGlow, glow * 0.42);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);
  }

  /**
   * Generates a pre-filtered radiance environment map (IBL)
   * for realistic reflections on car clearcoat paint, glass, and chrome.
   */
  initEnvironment() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    // Create a cube scene with dusk horizon gradient for environment map
    const envScene = new THREE.Scene();
    const envSkyGeo = new THREE.SphereGeometry(100, 16, 8);
    const envSkyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x0b1022) },
        horizonColor: { value: new THREE.Color(0x352148) },
        sunsetGlow: { value: new THREE.Color(0xb54c32) }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunsetGlow;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 col = mix(horizonColor, topColor, max(0.0, h));
          float glow = exp(-max(0.0, h) * 8.0);
          col = mix(col, sunsetGlow, glow * 0.5);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const envMesh = new THREE.Mesh(envSkyGeo, envSkyMat);
    envScene.add(envMesh);

    const renderTarget = pmremGenerator.fromScene(envScene);
    this.scene.environment = renderTarget.texture;
    pmremGenerator.dispose();
  }

  /**
   * Cinematic Post-Processing Pipeline (UnrealBloomPass + OutputPass)
   */
  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);

    // 1. Render Scene Pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // 2. Realistic Night Racing Bloom Pass (calibrated threshold so reflections don't bloom)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35, // strength
      0.28, // radius
      0.94  // threshold (only true emissive lamps/LEDs bloom, specular body reflections do not)
    );
    this.composer.addPass(bloomPass);

    // 3. Output Pass for ACES Filmic Tone Mapping and sRGB output
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  initPhysics() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.42;
    this.world.defaultContactMaterial.restitution = 0.15;

    // Contact material between player and AI cars for realistic panel rub & bump
    const chassisMat = new CANNON.Material('chassisMaterial');
    const aiMat = new CANNON.Material('aiMaterial');
    const carContactMat = new CANNON.ContactMaterial(chassisMat, aiMat, {
      friction: 0.32,
      restitution: 0.15,
      contactEquationStiffness: 5e6,
      contactEquationRelaxation: 3
    });
    const aiAiContactMat = new CANNON.ContactMaterial(aiMat, aiMat, {
      friction: 0.32,
      restitution: 0.15,
      contactEquationStiffness: 5e6,
      contactEquationRelaxation: 3
    });
    this.world.addContactMaterial(carContactMat);
    this.world.addContactMaterial(aiAiContactMat);
  }

  initWorldEntities() {
    // 1. Web Audio Engine
    this.soundEngine = new SoundEngine();

    // 2. Particle Effects & Persistent Skid Marks
    this.effectsManager = new EffectsManager(this.scene);

    // 3. Stadium Oval Track & Rigid Colliders
    this.track = new Track(this.scene, this.world);

    // 4. Realistic 3D Sports Car with RaycastVehicle
    this.vehicle = new Vehicle(this.scene, this.world, this.soundEngine, this.effectsManager);

    // Initial camera placement behind player at Grid Row 3
    this.currentCamPos.copy(this.vehicle.carGroup.position).add(new THREE.Vector3(-7, 2.2, 0));
    this.currentCamLookAt.copy(this.vehicle.carGroup.position);

    // 5. AI Competitors (4-Car Race: 1 Player + 3 AI Opponents)
    // Row 0 (P1 Outside Pole): Marcus Vance
    this.ai1 = new AICar(this.scene, this.world, {
      id: 'ai-1',
      name: 'Marcus Vance',
      color: '#e11d48', // Crimson Red
      startS: 72,
      startOffset: 3.2,
      gridPosition: new THREE.Vector3(-8, 0.50, 48.2),
      topSpeedKmh: 196,
      cornerSpeedKmh: 83,
      accelRate: 14.5,
      brakeRate: 27.0,
      reactionDelay: 0.16
    });

    // Row 1 (P2 Inside): Elena Rostova
    this.ai2 = new AICar(this.scene, this.world, {
      id: 'ai-2',
      name: 'Elena Rostova',
      color: '#eab308', // Cyber Gold
      startS: 61,
      startOffset: -3.2,
      gridPosition: new THREE.Vector3(-19, 0.50, 41.8),
      topSpeedKmh: 189,
      cornerSpeedKmh: 81,
      accelRate: 13.5,
      brakeRate: 25.5,
      reactionDelay: 0.24
    });

    // Row 2 (P3 Outside): Kai Tanaka
    this.ai3 = new AICar(this.scene, this.world, {
      id: 'ai-3',
      name: 'Kai Tanaka',
      color: '#10b981', // Acid Green
      startS: 50,
      startOffset: 3.2,
      gridPosition: new THREE.Vector3(-30, 0.50, 48.2),
      topSpeedKmh: 183,
      cornerSpeedKmh: 79,
      accelRate: 12.8,
      brakeRate: 24.5,
      reactionDelay: 0.32
    });

    this.aiCars = [this.ai1, this.ai2, this.ai3];
    this.selectedOpponents = 3;
    this.activeAICars = [this.ai1, this.ai2, this.ai3];

    // 6. Racing HUD Overlay
    this.hud = new HUD(
      this.vehicle,
      this.track,
      () => this.resetSession(),
      (summaryData) => this.showRaceSummary(summaryData)
    );

    // 7. Menu & Session State
    this.isPaused = true;
    this.hasRaceStarted = false;
    this.selectedLaps = 3;
    this.selectedColor = '#00c2ff';
    this.selectedUnit = 'kmh';

    this.hud.setTotalLaps(this.selectedLaps);
    this.hud.setTotalCars(4);
    this.hud.setSpeedUnit(this.selectedUnit);
    this.vehicle.setSpeedUnit(this.selectedUnit);
    this.vehicle.setPaintColor(this.selectedColor);
    this.updateAIColors();

    // Initial countdown state
    this.countdownState = 'INIT';
    this.countdownTimer = 0;
    this.currentRedCount = 0;
    this.vehicle.setHeldAtGrid(true);
    this.track.setStartLights(0, false);

    // Initialize Menu Elements & Open Menu on page load
    this.initMenu();
    this.openMenu(true);
  }

  updateAIColors() {
    const playerCol = this.selectedColor.toLowerCase();

    // AI 1 (Marcus Vance): prefers Crimson Red (#e11d48)
    let ai1Col = '#e11d48';
    if (playerCol === '#ff1e42' || playerCol === '#e11d48') {
      ai1Col = '#f97316'; // Sunset Orange
    }

    // AI 2 (Elena Rostova): prefers Cyber Gold (#eab308)
    let ai2Col = '#eab308';
    if (playerCol === '#eab308') {
      ai2Col = (ai1Col === '#f97316') ? '#8b5cf6' : '#f97316';
    }

    // AI 3 (Kai Tanaka): prefers Acid Green (#10b981)
    let ai3Col = '#10b981';
    if (playerCol === '#10b981') {
      ai3Col = (ai1Col !== '#8b5cf6' && ai2Col !== '#8b5cf6') ? '#8b5cf6' : '#f8fafc';
    }

    if (this.ai1) this.ai1.setPaintColor(ai1Col);
    if (this.ai2) this.ai2.setPaintColor(ai2Col);
    if (this.ai3) this.ai3.setPaintColor(ai3Col);
  }

  initMenu() {
    this.menuOverlayEl = document.getElementById('game-menu-overlay');
    this.menuTitleEl = document.getElementById('menu-title');
    this.menuSubtitleEl = document.getElementById('menu-subtitle');
    this.startRaceBtn = document.getElementById('start-race-btn');
    this.restartRaceBtn = document.getElementById('restart-race-btn');
    this.menuBtn = document.getElementById('menu-btn');

    this.selectedLapsDisplay = document.getElementById('selected-laps-display');
    this.selectedColorName = document.getElementById('selected-color-name');
    this.selectedUnitDisplay = document.getElementById('selected-unit-display');

    // 1. Lap Selection Buttons
    const lapButtons = document.querySelectorAll('#laps-options .menu-option-btn');
    lapButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        lapButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const laps = parseInt(btn.getAttribute('data-laps'), 10);
        this.selectedLaps = laps;
        if (this.selectedLapsDisplay) {
          this.selectedLapsDisplay.textContent = `${laps} LAP${laps > 1 ? 'S' : ''}`;
        }
        this.hud.setTotalLaps(this.selectedLaps);
      });
    });

    // 2. Opponent Selection Buttons (0 Solo, 1 Duel, 2 Cars, 3 Cars)
    const opponentButtons = document.querySelectorAll('#opponents-options .menu-option-btn');
    const selectedOpponentsDisplay = document.getElementById('selected-opponents-display');
    opponentButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        opponentButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const count = parseInt(btn.getAttribute('data-opponents'), 10);
        this.selectedOpponents = count;
        if (selectedOpponentsDisplay) {
          const labels = {
            0: '0 OPPONENTS (SOLO TIME TRIAL)',
            1: '1 OPPONENT (DUEL / 2-CAR RACE)',
            2: '2 OPPONENTS (3-CAR RACE)',
            3: '3 OPPONENTS (4-CAR RACE)'
          };
          selectedOpponentsDisplay.textContent = labels[count] || `${count} OPPONENTS`;
        }
        this.applyOpponentCount(count);
      });
    });

    // 3. Car Color Swatches
    const colorSwatches = document.querySelectorAll('#color-palette .color-swatch-btn');
    colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        colorSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const color = swatch.getAttribute('data-color');
        const name = swatch.getAttribute('data-name');
        this.selectedColor = color;
        if (this.selectedColorName) {
          this.selectedColorName.textContent = name.toUpperCase();
        }
        // Immediately update 3D vehicle paint color in real-time!
        this.vehicle.setPaintColor(color);
        this.updateAIColors();
      });
    });

    // 3. Speed Unit Buttons (KM/H vs MPH)
    const unitButtons = document.querySelectorAll('#unit-options .menu-option-btn');
    unitButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        unitButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const unit = btn.getAttribute('data-unit');
        this.selectedUnit = unit;
        if (this.selectedUnitDisplay) {
          this.selectedUnitDisplay.textContent = unit.toUpperCase() === 'MPH' ? 'MPH' : 'KM/H';
        }
        this.hud.setSpeedUnit(unit);
        this.vehicle.setSpeedUnit(unit);
      });
    });

    // 4. Start / Resume Race Button
    if (this.startRaceBtn) {
      this.startRaceBtn.addEventListener('click', () => {
        this.handleMenuStartOrResume();
      });
    }

    // 5. Restart Race Button (from pause menu)
    if (this.restartRaceBtn) {
      this.restartRaceBtn.addEventListener('click', () => {
        this.closeMenu();
        this.hasRaceStarted = true;
        this.resetSession();
      });
    }

    // 6. Header Menu Toggle Button
    if (this.menuBtn) {
      this.menuBtn.addEventListener('click', () => {
        this.toggleMenu();
      });
    }

    // 7. Race Finish Summary Overlay Elements
    this.finishOverlayEl = document.getElementById('race-finish-overlay');
    this.finishTotalTimeEl = document.getElementById('finish-total-time');
    this.finishBestLapEl = document.getElementById('finish-best-lap');
    this.finishAvgLapEl = document.getElementById('finish-avg-lap');
    this.finishTopSpeedEl = document.getElementById('finish-top-speed');
    this.finishLapsTableEl = document.getElementById('finish-laps-table');
    this.finishSubtitleEl = document.getElementById('finish-subtitle');
    this.playAgainBtn = document.getElementById('play-again-btn');
    this.newRaceBtn = document.getElementById('new-race-btn');

    // "Play Again" button: exact same conditions (same colors, laps, units)
    if (this.playAgainBtn) {
      this.playAgainBtn.addEventListener('click', () => {
        this.closeFinishOverlay();
        this.hasRaceStarted = true;
        this.resetSession();
      });
    }

    // "New Race" button: open previous main setup menu to configure new race
    if (this.newRaceBtn) {
      this.newRaceBtn.addEventListener('click', () => {
        this.closeFinishOverlay();
        this.openMenu(false);
      });
    }
  }

  applyOpponentCount(count) {
    this.selectedOpponents = count;

    if (count === 0) {
      this.activeAICars = [];
    } else if (count === 1) {
      this.activeAICars = [this.ai1];
    } else if (count === 2) {
      this.activeAICars = [this.ai1, this.ai2];
    } else {
      this.activeAICars = [this.ai1, this.ai2, this.ai3];
    }

    // Hide and remove inactive AI cars from physics world
    this.aiCars.forEach(ai => {
      const isActive = this.activeAICars.includes(ai);
      ai.carGroup.visible = isActive;
      if (ai.contactShadow) ai.contactShadow.visible = isActive;
      if (!isActive && this.world.bodies.includes(ai.body)) {
        this.world.removeBody(ai.body);
      } else if (isActive && !this.world.bodies.includes(ai.body)) {
        this.world.addBody(ai.body);
      }
    });

    // Update Player starting grid position based on number of opponents
    // 0 opponents (Solo): Row 0 (x = -8, z = 45.0)
    // 1 opponent (Duel): Row 1 (x = -19, z = 41.8)
    // 2 opponents (3 cars): Row 2 (x = -30, z = 48.2)
    // 3 opponents (4 cars): Row 3 (x = -41, z = 41.8)
    const gridPositions = {
      0: new CANNON.Vec3(-8, 0.50, 45.0),
      1: new CANNON.Vec3(-19, 0.50, 41.8),
      2: new CANNON.Vec3(-30, 0.50, 48.2),
      3: new CANNON.Vec3(-41, 0.50, 41.8)
    };
    const playerSpawnPos = gridPositions[count] || gridPositions[3];
    this.vehicle.setSpawnPosition(playerSpawnPos, Math.PI / 2);
    this.vehicle.resetToGrid();

    // Align camera with player's new grid position
    const carPos = this.vehicle.chassisBody.position;
    this.currentCamPos.set(carPos.x - 6.5, carPos.y + 1.8, carPos.z);
    this.currentCamLookAt.copy(carPos);

    this.hud.setTotalCars(count + 1);
  }

  showRaceSummary(summaryData) {
    this.isPaused = true;
    if (this.soundEngine) {
      this.soundEngine.pause();
    }

    if (this.menuOverlayEl) {
      this.menuOverlayEl.classList.remove('active');
    }

    if (this.finishOverlayEl) {
      this.finishOverlayEl.classList.add('active');
    }

    // Determine final standings
    const standings = (summaryData.standings && summaryData.standings.length > 0)
      ? summaryData.standings
      : this.getLiveStandings();

    const playerIndex = standings.findIndex(s => s.isPlayer);
    const playerRank = playerIndex >= 0 ? playerIndex + 1 : (this.selectedOpponents + 1);

    // Update Podium Banner
    const podiumBanner = document.getElementById('finish-podium-banner');
    const podiumRank = document.getElementById('finish-podium-rank');
    const podiumTitle = document.getElementById('finish-podium-title');
    const podiumSub = document.getElementById('finish-podium-sub');

    if (podiumBanner) {
      podiumBanner.className = `finish-podium-banner p${playerRank}`;
    }
    if (podiumRank) {
      podiumRank.textContent = (this.selectedOpponents === 0) ? 'P1' : `P${playerRank}`;
    }

    if (this.selectedOpponents === 0) {
      if (podiumTitle) podiumTitle.textContent = 'TIME TRIAL COMPLETED! ⏱️';
      if (podiumSub) podiumSub.textContent = `Completed ${summaryData.totalLaps} laps in ${this.hud.formatTime(summaryData.totalTime)}`;
    } else {
      const podiumMessages = {
        1: { title: '1ST PLACE - RACE WINNER! 🥇', sub: 'Sensational driving! You conquered the grid!' },
        2: { title: '2ND PLACE - PODIUM FINISH! 🥈', sub: 'Blistering pace! An incredible 2nd place finish!' },
        3: { title: '3RD PLACE - PODIUM FINISH! 🥉', sub: 'Hard-fought battle! You earned a spot on the podium!' },
        4: { title: '4TH PLACE - VALIANT EFFORT! 🏁', sub: 'Competitive pace! Replay to hunt down the podium!' }
      };
      const msg = podiumMessages[playerRank] || podiumMessages[4];
      if (podiumTitle) podiumTitle.textContent = msg.title;
      if (podiumSub) podiumSub.textContent = msg.sub;
    }

    // Populate Leaderboard Table
    const leaderboardTableEl = document.getElementById('finish-leaderboard-table');
    if (leaderboardTableEl) {
      leaderboardTableEl.innerHTML = '';
      const winnerTime = standings[0].totalTime;

      standings.forEach((entry, idx) => {
        const row = document.createElement('div');
        row.className = `finish-leader-row ${entry.isPlayer ? 'player' : ''}`;

        const leftDiv = document.createElement('div');
        leftDiv.className = 'finish-leader-left';

        const rankBadge = document.createElement('span');
        rankBadge.className = 'leader-pos-badge';
        rankBadge.textContent = `P${idx + 1}`;
        leftDiv.appendChild(rankBadge);

        const dot = document.createElement('span');
        dot.className = 'leader-color-dot';
        dot.style.backgroundColor = entry.color;
        leftDiv.appendChild(dot);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'leader-driver-name';
        nameSpan.textContent = entry.name;
        if (entry.isPlayer) {
          const youTag = document.createElement('span');
          youTag.className = 'leader-you-tag';
          youTag.textContent = 'YOU';
          nameSpan.appendChild(youTag);
        }
        leftDiv.appendChild(nameSpan);

        const rightDiv = document.createElement('div');
        rightDiv.className = 'finish-leader-right';

        const gapSpan = document.createElement('span');
        gapSpan.className = 'leader-gap-time';
        if (idx === 0) {
          gapSpan.textContent = this.hud.formatTime(entry.totalTime);
        } else {
          const gap = (entry.totalTime && winnerTime && entry.totalTime > winnerTime)
            ? `+${(entry.totalTime - winnerTime).toFixed(2)}s`
            : `+${(idx * 0.95).toFixed(2)}s`;
          gapSpan.textContent = gap;
        }
        rightDiv.appendChild(gapSpan);

        const bestLapSpan = document.createElement('span');
        bestLapSpan.className = 'leader-best-lap';
        bestLapSpan.textContent = entry.bestLap ? `Best: ${this.hud.formatTime(entry.bestLap)}` : '--:--.--';
        rightDiv.appendChild(bestLapSpan);

        row.appendChild(leftDiv);
        row.appendChild(rightDiv);
        leaderboardTableEl.appendChild(row);
      });
    }

    // Populate Key Statistics
    if (this.finishSubtitleEl) {
      this.finishSubtitleEl.textContent = `Official ${summaryData.totalLaps}-Lap Performance Summary`;
    }

    if (this.finishTotalTimeEl) {
      this.finishTotalTimeEl.textContent = this.hud.formatTime(summaryData.totalTime);
    }

    if (this.finishBestLapEl) {
      this.finishBestLapEl.textContent = this.hud.formatTime(summaryData.bestLap);
    }

    if (this.finishAvgLapEl) {
      const avgTime = summaryData.laps.length > 0 ? summaryData.totalTime / summaryData.laps.length : 0;
      this.finishAvgLapEl.textContent = this.hud.formatTime(avgTime);
    }

    if (this.finishTopSpeedEl) {
      const isMph = this.selectedUnit === 'mph';
      const displaySpeed = Math.round(isMph ? summaryData.topSpeed * 0.621371 : summaryData.topSpeed);
      this.finishTopSpeedEl.textContent = `${displaySpeed} ${isMph ? 'MPH' : 'KM/H'}`;
    }

    // Populate Lap-by-Lap Table
    if (this.finishLapsTableEl) {
      this.finishLapsTableEl.innerHTML = '';
      summaryData.laps.forEach(lap => {
        const row = document.createElement('div');
        const isFastest = lap.time === summaryData.bestLap;
        row.className = `finish-lap-row ${isFastest ? 'fastest' : ''}`;

        const leftCol = document.createElement('span');
        leftCol.textContent = `LAP ${lap.number}`;
        row.appendChild(leftCol);

        if (isFastest) {
          const tag = document.createElement('span');
          tag.className = 'lap-tag';
          tag.textContent = '★ BEST LAP';
          row.appendChild(tag);
        }

        const rightCol = document.createElement('span');
        rightCol.textContent = this.hud.formatTime(lap.time);
        row.appendChild(rightCol);

        this.finishLapsTableEl.appendChild(row);
      });
    }
  }

  getLiveStandings() {
    const playerDist = this.vehicle.getRaceDistance(this.track, this.hud.laps.length, this.track.hasStarted);
    const standings = [
      {
        id: 'player',
        name: 'YOU',
        shortName: 'YOU',
        color: this.selectedColor,
        isPlayer: true,
        distance: playerDist,
        laps: this.hud.laps.length,
        bestLap: this.hud.bestLapTime,
        totalTime: this.hud.laps.reduce((acc, l) => acc + l.time, 0),
        speedKmh: this.vehicle.currentSpeedKmh
      },
      ...this.activeAICars.map(ai => ({
        id: ai.id,
        name: ai.name,
        shortName: ai.name.split(' ').map(n => n[0]).join(''),
        color: ai.paintColor,
        isPlayer: false,
        distance: ai.getRaceDistance(this.track),
        laps: ai.completedLaps,
        bestLap: ai.bestLapTime,
        totalTime: ai.totalRaceTime || (ai.lapHistory.reduce((acc, l) => acc + l.time, 0)),
        speedKmh: ai.currentSpeedKmh
      }))
    ];
    standings.sort((a, b) => b.distance - a.distance);
    return standings;
  }

  closeFinishOverlay() {
    if (this.finishOverlayEl) {
      this.finishOverlayEl.classList.remove('active');
    }
  }

  openMenu(isInitial = false) {
    this.closeFinishOverlay();
    this.isPaused = true;
    if (this.menuOverlayEl) {
      this.menuOverlayEl.classList.add('active');
    }

    // Release any active inputs while in menu
    if (this.vehicle && this.vehicle.inputs) {
      this.vehicle.inputs.forward = false;
      this.vehicle.inputs.backward = false;
      this.vehicle.inputs.left = false;
      this.vehicle.inputs.right = false;
    }

    if (this.soundEngine) {
      this.soundEngine.pause();
    }

    if (!isInitial && this.hasRaceStarted) {
      if (this.menuTitleEl) this.menuTitleEl.textContent = 'SESSION PAUSED';
      if (this.menuSubtitleEl) this.menuSubtitleEl.textContent = 'Press [ESC] to resume racing or restart';
      if (this.startRaceBtn) {
        const textSpan = this.startRaceBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = '▶ RESUME RACE';
      }
      if (this.restartRaceBtn) {
        this.restartRaceBtn.classList.remove('hidden');
      }
    } else {
      if (this.menuTitleEl) this.menuTitleEl.textContent = 'RACE SETUP';
      if (this.menuSubtitleEl) this.menuSubtitleEl.textContent = 'Configure your session and press Start';
      if (this.startRaceBtn) {
        const textSpan = this.startRaceBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = '▶ START RACE';
      }
      if (this.restartRaceBtn) {
        this.restartRaceBtn.classList.add('hidden');
      }
    }
  }

  closeMenu() {
    if (this.menuOverlayEl) {
      this.menuOverlayEl.classList.remove('active');
    }
    this.isPaused = false;
    if (this.soundEngine) {
      this.soundEngine.resume();
    }
  }

  handleMenuStartOrResume() {
    if (!this.soundEngine.isInitialized) {
      this.soundEngine.init();
    }

    if (!this.hasRaceStarted) {
      this.closeMenu();
      this.hasRaceStarted = true;
      this.resetSession();
    } else {
      this.closeMenu();
    }
  }

  toggleMenu() {
    if (this.finishOverlayEl && this.finishOverlayEl.classList.contains('active')) {
      this.closeFinishOverlay();
      this.openMenu(false);
      return;
    }

    if (this.menuOverlayEl && this.menuOverlayEl.classList.contains('active')) {
      this.handleMenuStartOrResume();
    } else {
      this.openMenu(false);
    }
  }

  startCountdown() {
    this.countdownState = 'COUNTDOWN';
    this.countdownTimer = 0;
    this.currentRedCount = 0;

    this.vehicle.setHeldAtGrid(true);
    if (this.activeAICars) {
      this.activeAICars.forEach(ai => ai.resetToGrid());
    }
    this.track.setStartLights(0, false);
    if (this.hud) {
      this.hud.updateCountdown(0, false, 'HOLD [W] TO REV LAUNCH CONTROL');
    }
  }

  updateCountdownSequence(dt) {
    if (this.countdownState === 'COUNTDOWN') {
      this.countdownTimer += dt;
      const t = this.countdownTimer;

      // 5 Red Lights Sequence (1 every 0.8s: 0.8s, 1.6s, 2.4s, 3.2s, 4.0s)
      if (t >= 0.8 && this.currentRedCount < 1) {
        this.currentRedCount = 1;
        this.soundEngine.playCountdownBeep();
        this.track.setStartLights(1, false);
        this.hud.updateCountdown(1, false, '● 1... READY');
      } else if (t >= 1.6 && this.currentRedCount < 2) {
        this.currentRedCount = 2;
        this.soundEngine.playCountdownBeep();
        this.track.setStartLights(2, false);
        this.hud.updateCountdown(2, false, '● ● 2... SET');
      } else if (t >= 2.4 && this.currentRedCount < 3) {
        this.currentRedCount = 3;
        this.soundEngine.playCountdownBeep();
        this.track.setStartLights(3, false);
        this.hud.updateCountdown(3, false, '● ● ● 3...');
      } else if (t >= 3.2 && this.currentRedCount < 4) {
        this.currentRedCount = 4;
        this.soundEngine.playCountdownBeep();
        this.track.setStartLights(4, false);
        this.hud.updateCountdown(4, false, '● ● ● ● 4...');
      } else if (t >= 4.0 && this.currentRedCount < 5) {
        this.currentRedCount = 5;
        this.soundEngine.playCountdownBeep();
        this.track.setStartLights(5, false);
        this.hud.updateCountdown(5, false, '● ● ● ● ● HOLD...');
      } else if (t >= 5.2) {
        // LIGHTS OUT & ALL TURN GREEN!
        this.countdownState = 'RACING';
        this.soundEngine.playGoTone();
        this.track.setStartLights(5, true); // All 5 turn green!
        this.hud.updateCountdown(5, true, '🟢 GO! GO! GO! 🟢');
        this.hud.showLaunchBanner();

        // Release launch control hold and start official lap timer!
        this.vehicle.setHeldAtGrid(false);
        if (this.activeAICars) {
          this.activeAICars.forEach(ai => ai.startRacing());
        }
        this.track.startOfficialSession();
      }
    } else if (this.countdownState === 'RACING') {
      this.countdownTimer += dt;
      // Turn off start gantry lights after 3.5s of racing
      if (this.countdownTimer > 8.7 && this.currentRedCount > 0) {
        this.currentRedCount = 0;
        this.track.setStartLights(0, false);
      }
    }
  }

  initEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      if (this.composer) {
        this.composer.setSize(w, h);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.toggleMenu();
        e.preventDefault();
      }
    });
  }

  resetSession() {
    this.vehicle.resetToGrid();
    this.track.resetSession();
    this.vehicle.setPaintColor(this.selectedColor);
    this.vehicle.setSpeedUnit(this.selectedUnit);
    this.hud.setTotalLaps(this.selectedLaps);
    this.hud.setSpeedUnit(this.selectedUnit);

    if (this.activeAICars) {
      this.activeAICars.forEach(ai => {
        ai.totalLaps = this.selectedLaps;
        ai.resetToGrid();
      });
      this.updateAIColors();
    }

    if (this.effectsManager) {
      this.effectsManager.clearSkidMarks();
    }

    const carPos = this.vehicle.chassisBody.position;
    this.currentCamPos.set(carPos.x - 6.5, carPos.y + 1.8, carPos.z);
    this.currentCamLookAt.copy(carPos);

    // Restart the F1 Countdown Sequence
    this.startCountdown();
  }

  updateCamera(dt) {
    const carGroup = this.vehicle.carGroup;
    const carPos = carGroup.position;
    const speed = this.vehicle.currentSpeedKmh;

    if (this.vehicle.cameraMode === 'chase') {
      // Tight, low-slung chase camera positioned close to the asphalt for high-speed ground rush
      const chaseDistance = 4.75 + Math.min(1.2, (speed / 200) * 1.0);
      const chaseHeight = 1.48;

      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carGroup.quaternion);

      const targetCamPos = new THREE.Vector3()
        .copy(carPos)
        .sub(forward.clone().multiplyScalar(chaseDistance))
        .add(new THREE.Vector3(0, chaseHeight, 0));

      // Visceral high-speed road vibration & chassis buffeting above 80 km/h
      if (speed > 80) {
        const shake = Math.min(0.045, ((speed - 80) / 160) * 0.045);
        targetCamPos.x += (Math.random() - 0.5) * shake;
        targetCamPos.y += (Math.random() - 0.5) * shake;
      }

      // Pitch slightly downward onto the asphalt ahead for maximum optical motion
      const lookAheadDist = 2.6 + Math.min(3.2, (speed / 180) * 3.0);
      const targetLookAt = new THREE.Vector3()
        .copy(carPos)
        .add(forward.clone().multiplyScalar(lookAheadDist))
        .add(new THREE.Vector3(0, 0.55, 0));

      const posLerp = 1.0 - Math.exp(-dt * 12.0);
      const lookLerp = 1.0 - Math.exp(-dt * 16.0);

      this.currentCamPos.lerp(targetCamPos, posLerp);
      this.currentCamLookAt.lerp(targetLookAt, lookLerp);

      // Wide Dynamic Speed FOV: Base 68° stretches smoothly to 88°-92° at top speed
      const targetFov = 68 + Math.min(24, (speed / 200) * 24);
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, dt * 6.5);
      this.camera.updateProjectionMatrix();

      this.camera.position.copy(this.currentCamPos);
      this.camera.lookAt(this.currentCamLookAt);
    } else {
      // Hood View - low on the nose with direct asphalt rush view
      const localHoodOffset = new THREE.Vector3(0, 0.78, 1.25);
      const worldHoodPos = localHoodOffset.applyQuaternion(carGroup.quaternion).add(carPos);

      if (speed > 70) {
        const shake = Math.min(0.035, ((speed - 70) / 160) * 0.035);
        worldHoodPos.x += (Math.random() - 0.5) * shake;
        worldHoodPos.y += (Math.random() - 0.5) * shake;
      }

      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carGroup.quaternion);
      const targetLookAt = new THREE.Vector3()
        .copy(worldHoodPos)
        .add(forward.clone().multiplyScalar(22))
        .add(new THREE.Vector3(0, -0.4, 0));

      this.camera.position.copy(worldHoodPos);
      this.camera.lookAt(targetLookAt);

      const targetFov = 76 + Math.min(22, (speed / 200) * 22);
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, dt * 7.0);
      this.camera.updateProjectionMatrix();
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (dt > 0.1) dt = 0.1;

    if (!this.isPaused) {
      // 1. Step Cannon-es Physics
      this.world.step(this.fixedTimeStep, dt, this.maxSubSteps);

      // 2. Update F1 Start Countdown Sequence
      this.updateCountdownSequence(dt);

      // 3. Update Vehicle logic, input forces & particles
      this.vehicle.update(dt);

      // 4. Update AI Opponents
      const isSessionRacing = (this.countdownState === 'RACING');
      const playerPos = this.vehicle.chassisBody.position;
      const playerProgress = this.track.calculateTrackProgress(playerPos);
      const playerS = playerProgress * this.track.totalLength;
      const playerSpeed = Math.abs(this.vehicle.currentSpeedKmh / 3.6);

      const allVehicles = [
        {
          currentS: playerS,
          currentOffset: (playerPos.z - this.track.centerRadius),
          currentSpeed: playerSpeed,
          isPlayer: true
        },
        ...this.activeAICars
      ];

      for (const ai of this.activeAICars) {
        ai.update(dt, isSessionRacing, allVehicles, this.track);
      }

      // 5. Track Checkpoint & Lap Progress checking
      const progressData = this.track.checkProgress(this.vehicle.chassisBody.position);

      // 6. Calculate Live Standings
      const standings = this.getLiveStandings();

      // 7. Update Racing HUD
      this.hud.update(progressData, standings, this.activeAICars);
    } else {
      // When paused in menu, keep visuals synced without physics motion
      this.vehicle.syncVisuals();
      if (this.activeAICars) {
        this.activeAICars.forEach(ai => ai.syncVisuals(this.track));
      }
    }

    // 8. Update Camera
    this.updateCamera(dt);

    // 9. Render with Post-Processing (Bloom + ACES Filmic Tone Mapping)
    this.composer.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new NightLapGame();
});
