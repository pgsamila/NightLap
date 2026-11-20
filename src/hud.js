/**
 * HUD & Racing UI Manager
 * Handles Speedometer, Gear indicator, RPM gauge, Compass tape,
 * Mini-map with live vehicle tracking, Lap timer, Lap history, and Reset button.
 */
export class HUD {
  constructor(vehicle, track, onReset, onRaceComplete = null) {
    this.vehicle = vehicle;
    this.track = track;
    this.onReset = onReset;
    this.onRaceComplete = onRaceComplete;

    this.laps = [];
    this.bestLapTime = null;
    this.totalLaps = 3;
    this.totalCars = 4;
    this.speedUnit = 'kmh'; // 'kmh' or 'mph'

    // Cache DOM Elements
    this.speedValueEl = document.getElementById('speed-value');
    this.speedUnitLabelEl = document.getElementById('speed-unit-label');
    this.lapCounterBadgeEl = document.getElementById('lap-counter-badge');
    this.gearValueEl = document.getElementById('gear-value');
    this.rpmBarEl = document.getElementById('rpm-fill');
    this.rpmValueEl = document.getElementById('rpm-value');
    this.speedGaugeArcEl = document.getElementById('speed-gauge-arc');

    this.currentLapEl = document.getElementById('current-lap-time');
    this.bestLapEl = document.getElementById('best-lap-time');
    this.lapListEl = document.getElementById('lap-history-list');

    this.compassTapeEl = document.getElementById('compass-tape');
    this.compassDegreesEl = document.getElementById('compass-degrees');
    this.turnChevronEl = document.getElementById('turn-chevron');
    this.turnLabelEl = document.getElementById('turn-label');

    this.cameraTagEl = document.getElementById('camera-tag');
    this.resetBtn = document.getElementById('reset-session-btn');
    this.muteBtn = document.getElementById('mute-btn');
    this.lapToastEl = document.getElementById('lap-toast');

    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

    // Race Standings & Position Elements
    this.positionBadgeEl = document.getElementById('position-badge');
    this.posGapBadgeEl = document.getElementById('pos-gap-badge');
    this.liveStandingsBarEl = document.getElementById('live-standings-bar');
    this.latestStandings = [];

    // F1 Countdown Elements
    this.f1OverlayEl = document.getElementById('f1-countdown-overlay');
    this.f1Bulbs = [0, 1, 2, 3, 4].map(i => document.getElementById(`f1-bulb-${i}`));
    this.f1StatusEl = document.getElementById('f1-status-text');
    this.f1LaunchBannerEl = document.getElementById('f1-launch-banner');

    this.initEvents();
  }

  initEvents() {
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        if (this.onReset) this.onReset();
        this.resetHUD();
      });
    }

    if (this.muteBtn && this.vehicle && this.vehicle.soundEngine) {
      this.muteBtn.addEventListener('click', () => {
        const isMuted = this.vehicle.soundEngine.toggleMute();
        this.muteBtn.innerHTML = isMuted ? '🔇 Muted' : '🔊 Sound';
        this.muteBtn.classList.toggle('muted', isMuted);
      });
    }
  }

  formatTime(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds <= 0) {
      return '00:00.00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 100);

    const mStr = String(mins).padStart(2, '0');
    const sStr = String(secs).padStart(2, '0');
    const msStr = String(millis).padStart(2, '0');
    return `${mStr}:${sStr}.${msStr}`;
  }

  setTotalLaps(laps) {
    this.totalLaps = laps;
    this.updateLapCounter();
  }

  setTotalCars(total) {
    this.totalCars = total;
    const totalEl = document.querySelector('.position-total');
    if (totalEl) {
      totalEl.textContent = `/ ${total}`;
    }
    if (total === 1) {
      if (this.positionBadgeEl) {
        this.positionBadgeEl.textContent = 'P1';
        this.positionBadgeEl.className = 'position-badge p1';
      }
      if (this.posGapBadgeEl) {
        this.posGapBadgeEl.textContent = 'TIME TRIAL ⏱️';
      }
    }
  }

  setSpeedUnit(unit) {
    this.speedUnit = unit;
    if (this.speedUnitLabelEl) {
      this.speedUnitLabelEl.textContent = this.speedUnit === 'mph' ? 'MPH' : 'KM/H';
    }
  }

  updateLapCounter() {
    if (this.lapCounterBadgeEl) {
      const current = Math.min(this.totalLaps, this.laps.length + 1);
      this.lapCounterBadgeEl.textContent = `LAP ${current} / ${this.totalLaps}`;
    }
  }

  update(progressData, allStandings = [], aiCars = []) {
    this.latestStandings = allStandings;
    const rawSpeed = Math.abs(this.vehicle.currentSpeedKmh);
    const isMph = this.speedUnit === 'mph';
    const displaySpeed = Math.round(isMph ? rawSpeed * 0.621371 : rawSpeed);
    const gear = this.vehicle.currentGear;
    const rpm = Math.round(this.vehicle.rpm);

    // Live Race Standings & Position Hero Card
    if (this.totalCars === 1) {
      if (this.positionBadgeEl) {
        this.positionBadgeEl.textContent = 'P1';
        this.positionBadgeEl.className = 'position-badge p1';
      }
      if (this.posGapBadgeEl) {
        this.posGapBadgeEl.textContent = 'TIME TRIAL ⏱️';
      }
      if (this.liveStandingsBarEl) {
        this.liveStandingsBarEl.innerHTML = `
          <div class="standing-chip player" style="grid-column: span 4;">
            <span class="chip-dot" style="background-color: ${this.vehicle.carColorHex || '#00c2ff'};"></span>
            <span>SOLO DRIVER (P1)</span>
          </div>
        `;
      }
    } else if (allStandings && allStandings.length > 0) {
      const playerIndex = allStandings.findIndex(s => s.isPlayer);
      const playerRank = playerIndex >= 0 ? playerIndex + 1 : this.totalCars;

      if (this.positionBadgeEl) {
        this.positionBadgeEl.textContent = `P${playerRank}`;
        this.positionBadgeEl.className = `position-badge p${playerRank}`;
      }

      if (this.posGapBadgeEl) {
        if (playerRank === 1) {
          const p2 = allStandings[1];
          const leadGap = p2 ? Math.max(0, allStandings[0].distance - p2.distance).toFixed(1) : 0;
          this.posGapBadgeEl.textContent = leadGap > 0 ? `LEADER (+${leadGap}m)` : 'LEADER 🏆';
        } else {
          const aheadCar = allStandings[playerIndex - 1];
          const distBehind = aheadCar ? Math.max(0, aheadCar.distance - allStandings[playerIndex].distance).toFixed(1) : 0;
          this.posGapBadgeEl.textContent = `CHASING P${playerRank - 1} (-${distBehind}m)`;
        }
      }

      if (this.liveStandingsBarEl) {
        this.liveStandingsBarEl.innerHTML = '';
        allStandings.forEach((entry, idx) => {
          const chip = document.createElement('div');
          chip.className = `standing-chip ${entry.isPlayer ? 'player' : ''}`;

          const dot = document.createElement('span');
          dot.className = 'chip-dot';
          dot.style.backgroundColor = entry.color;

          const label = document.createElement('span');
          label.textContent = `${idx + 1}:${entry.shortName || (entry.isPlayer ? 'YOU' : 'AI')}`;

          chip.appendChild(dot);
          chip.appendChild(label);
          this.liveStandingsBarEl.appendChild(chip);
        });
      }
    }

    // 1. Digital Speedometer
    if (this.speedValueEl) {
      this.speedValueEl.textContent = String(displaySpeed).padStart(3, '0');
    }
    if (this.speedUnitLabelEl) {
      this.speedUnitLabelEl.textContent = isMph ? 'MPH' : 'KM/H';
    }

    // Radial Speedometer Gauge Arc (0 to 240 km/h or 150 mph)
    if (this.speedGaugeArcEl) {
      const maxSpeed = isMph ? 150 : 240;
      const progress = Math.min(1.0, displaySpeed / maxSpeed);
      // Stroke circumference = 2 * PI * 80 = ~502.65
      const totalOffset = 502.65;
      const fillOffset = totalOffset - (progress * 0.75 * totalOffset);
      this.speedGaugeArcEl.style.strokeDashoffset = fillOffset;
    }

    // 2. Automatic Gear indicator
    if (this.gearValueEl) {
      this.gearValueEl.textContent = gear;
      if (gear === 'R') {
        this.gearValueEl.className = 'gear-badge gear-r';
      } else {
        this.gearValueEl.className = 'gear-badge';
      }
    }

    // 3. RPM Gauge Bar
    if (this.rpmBarEl) {
      const rpmPercent = Math.min(100, Math.max(0, ((rpm - 950) / (7500 - 950)) * 100));
      this.rpmBarEl.style.width = `${rpmPercent}%`;

      if (rpm > 6400) {
        this.rpmBarEl.style.backgroundColor = '#ff2244';
        this.rpmBarEl.style.boxShadow = '0 0 12px #ff2244';
      } else if (rpm > 5000) {
        this.rpmBarEl.style.backgroundColor = '#ffb700';
        this.rpmBarEl.style.boxShadow = '0 0 8px #ffb700';
      } else {
        this.rpmBarEl.style.backgroundColor = '#00f0ff';
        this.rpmBarEl.style.boxShadow = '0 0 8px #00f0ff';
      }
    }
    if (this.rpmValueEl) {
      this.rpmValueEl.textContent = `${rpm} RPM`;
    }

    // 4. Compass ribbon & Heading degrees
    const heading = this.vehicle.getCompassHeading();
    if (this.compassDegreesEl) {
      this.compassDegreesEl.textContent = `${Math.round(heading)}°`;
    }
    if (this.compassTapeEl) {
      // Tape scroll: center 180px width, each degree = 2.5px
      const offset = -(heading * 3.5);
      this.compassTapeEl.style.transform = `translateX(${offset}px)`;
    }

    // 5. Turn Direction / Chevron Indicator
    this.updateNavigationChevron(progressData.progress);

    // 6. Current Lap Timer
    if (this.currentLapEl) {
      this.currentLapEl.textContent = this.formatTime(progressData.currentLapTime);
    }

    // 7. Handle Lap Completion
    if (progressData.lapCompleted) {
      this.recordLap(progressData.lapTime);
    }

    // 8. Mini-map rendering (Player + 3 AI Opponents)
    this.drawMinimap(progressData, aiCars);

    // 9. Camera mode tag
    if (this.cameraTagEl) {
      this.cameraTagEl.textContent = this.vehicle.cameraMode === 'chase' ? 'CHASE CAM [C]' : 'HOOD CAM [C]';
    }
  }

  updateNavigationChevron(trackProgress) {
    if (!this.turnChevronEl || !this.turnLabelEl) return;

    // Track sections based on progress:
    // 0.0 - 0.26: Main Straight
    // 0.26 - 0.50: Turn 1 (East 180° hairpin)
    // 0.50 - 0.76: Back Straight
    // 0.76 - 1.00: Turn 2 (West 180° hairpin)
    if (trackProgress < 0.22) {
      this.turnLabelEl.textContent = 'MAIN STRAIGHT';
      this.turnChevronEl.textContent = '▲▲▲';
      this.turnChevronEl.className = 'chevron straight';
    } else if (trackProgress < 0.48) {
      this.turnLabelEl.textContent = 'TURN 1 (180° HAIRPIN)';
      this.turnChevronEl.textContent = '▶▶▶';
      this.turnChevronEl.className = 'chevron right';
    } else if (trackProgress < 0.72) {
      this.turnLabelEl.textContent = 'BACK STRAIGHT';
      this.turnChevronEl.textContent = '▼▼▼';
      this.turnChevronEl.className = 'chevron straight';
    } else {
      this.turnLabelEl.textContent = 'TURN 2 (180° HAIRPIN)';
      this.turnChevronEl.textContent = '◀◀◀';
      this.turnChevronEl.className = 'chevron left';
    }
  }

  drawMinimap(progressData, aiCars = []) {
    if (!this.minimapCtx || !this.minimapCanvas) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Coordinate mapping:
    // Track bounds: X from -(160/2 + 45) = -125 to +125 (total 250m)
    // Z from -45 to +45 (total 90m)
    // Canvas dimensions: 220 x 110
    const margin = 16;
    const scaleX = (w - 2 * margin) / 260;
    const scaleZ = (h - 2 * margin) / 100;
    const mapScale = Math.min(scaleX, scaleZ);

    const centerX = w / 2;
    const centerY = h / 2;

    const toMapX = (x) => centerX + x * mapScale;
    const toMapY = (z) => centerY + z * mapScale;

    // 1. Draw Stadium Oval Circuit Outline
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();

    const L2 = (this.track.straightLength / 2);
    const R = this.track.centerRadius;

    // Bottom straight: from (-L2, +R) to (+L2, +R)
    ctx.moveTo(toMapX(-L2), toMapY(R));
    ctx.lineTo(toMapX(L2), toMapY(R));

    // East Hairpin: arc around (+L2, 0)
    ctx.arc(toMapX(L2), toMapY(0), R * mapScale, Math.PI / 2, -Math.PI / 2, true);

    // Top straight: from (+L2, -R) to (-L2, -R)
    ctx.lineTo(toMapX(-L2), toMapY(-R));

    // West Hairpin: arc around (-L2, 0)
    ctx.arc(toMapX(-L2), toMapY(0), R * mapScale, -Math.PI / 2, Math.PI / 2, true);

    ctx.closePath();
    ctx.stroke();

    // Inner bright neon track line
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // 2. Start / Finish Line Marker
    const sfX = toMapX(0);
    const sfY = toMapY(R);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(sfX, sfY - 7);
    ctx.lineTo(sfX, sfY + 7);
    ctx.stroke();

    // 3. AI Opponent Blips on Mini-map
    if (aiCars && aiCars.length > 0) {
      aiCars.forEach(ai => {
        const aiPos = ai.carGroup.position;
        const aiMapX = toMapX(aiPos.x);
        const aiMapY = toMapY(aiPos.z);

        ctx.save();
        ctx.translate(aiMapX, aiMapY);

        // Blip glow halo
        ctx.fillStyle = ai.paintColor || '#ff1e42';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();

        // Inner solid dot
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });
    }

    // 4. Live Player Car Position & Heading Arrow (Cyan)
    const carPos = this.vehicle.chassisBody.position;
    const carMapX = toMapX(carPos.x);
    const carMapY = toMapY(carPos.z);

    // Extract car yaw angle
    const headingRad = (this.vehicle.getCompassHeading() * Math.PI) / 180;

    ctx.save();
    ctx.translate(carMapX, carMapY);
    // Heading in mini-map coordinate: 0 deg = North (-Y in canvas), 90 deg = East (+X in canvas)
    ctx.rotate(headingRad);

    // Glowing blip halo
    ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    // Arrow pointer
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  recordLap(lapTime) {
    const lapNum = this.laps.length + 1;
    const isBest = this.bestLapTime === null || lapTime < this.bestLapTime;

    if (isBest) {
      this.bestLapTime = lapTime;
      if (this.bestLapEl) {
        this.bestLapEl.textContent = this.formatTime(this.bestLapTime);
      }
    }

    this.laps.push({ number: lapNum, time: lapTime, isBest });
    this.updateLapCounter();

    // Check race completion
    if (this.totalLaps > 0 && this.laps.length >= this.totalLaps) {
      const totalSessionTime = this.laps.reduce((acc, l) => acc + l.time, 0);
      if (this.lapToastEl) {
        this.lapToastEl.textContent = `🏁 RACE FINISHED! (${this.totalLaps} LAPS) TOTAL: ${this.formatTime(totalSessionTime)} 🏁`;
        this.lapToastEl.className = 'lap-toast show gold';
      }
      if (this.vehicle && this.vehicle.soundEngine) {
        this.vehicle.soundEngine.playGoTone();
      }

      if (this.onRaceComplete) {
        setTimeout(() => {
          this.onRaceComplete({
            laps: [...this.laps],
            bestLap: this.bestLapTime,
            totalTime: totalSessionTime,
            totalLaps: this.totalLaps,
            topSpeed: this.vehicle.topSpeedKmh,
            standings: [...this.latestStandings]
          });
        }, 900);
      }
    } else {
      // Show standard lap toast notification
      this.showLapToast(lapNum, lapTime, isBest);
    }

    // Render Lap History List
    this.renderLapList();
  }

  renderLapList() {
    if (!this.lapListEl) return;
    this.lapListEl.innerHTML = '';

    // Render newest laps at top
    const reversed = [...this.laps].reverse();
    reversed.forEach((lap) => {
      const item = document.createElement('div');
      item.className = `lap-item ${lap.time === this.bestLapTime ? 'fastest-lap' : ''}`;

      const numSpan = document.createElement('span');
      numSpan.className = 'lap-number';
      numSpan.textContent = `LAP ${lap.number}`;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'lap-time-value';
      timeSpan.textContent = this.formatTime(lap.time);

      if (lap.time === this.bestLapTime) {
        const badge = document.createElement('span');
        badge.className = 'best-badge';
        badge.textContent = '★ BEST';
        item.appendChild(numSpan);
        item.appendChild(badge);
        item.appendChild(timeSpan);
      } else {
        item.appendChild(numSpan);
        item.appendChild(timeSpan);
      }

      this.lapListEl.appendChild(item);
    });
  }

  showLapToast(lapNum, lapTime, isBest) {
    if (!this.lapToastEl) return;
    this.lapToastEl.textContent = isBest
      ? `★ NEW BEST LAP ${lapNum}! ${this.formatTime(lapTime)}`
      : `LAP ${lapNum} COMPLETED: ${this.formatTime(lapTime)}`;
    this.lapToastEl.className = `lap-toast show ${isBest ? 'gold' : ''}`;

    setTimeout(() => {
      if (this.lapToastEl) {
        this.lapToastEl.className = 'lap-toast';
      }
    }, 3800);
  }

  updateCountdown(count, isGreen = false, statusText = '') {
    if (this.f1OverlayEl) {
      this.f1OverlayEl.classList.remove('hidden');
    }

    if (this.f1Bulbs) {
      this.f1Bulbs.forEach((bulb, idx) => {
        if (!bulb) return;
        if (isGreen) {
          bulb.className = 'f1-bulb green';
        } else if (idx < count) {
          bulb.className = 'f1-bulb red';
        } else {
          bulb.className = 'f1-bulb';
        }
      });
    }

    if (this.f1StatusEl && statusText) {
      this.f1StatusEl.textContent = statusText;
    }
  }

  showLaunchBanner() {
    if (this.f1LaunchBannerEl) {
      this.f1LaunchBannerEl.classList.add('show');
      setTimeout(() => {
        if (this.f1LaunchBannerEl) {
          this.f1LaunchBannerEl.classList.remove('show');
        }
      }, 2400);
    }

    if (this.f1OverlayEl) {
      setTimeout(() => {
        if (this.f1OverlayEl) {
          this.f1OverlayEl.classList.add('hidden');
        }
      }, 1200);
    }
  }

  resetHUD() {
    this.laps = [];
    this.bestLapTime = null;
    this.latestStandings = [];
    this.updateLapCounter();
    if (this.currentLapEl) this.currentLapEl.textContent = '00:00.00';
    if (this.bestLapEl) this.bestLapEl.textContent = '--:--.--';
    if (this.lapListEl) this.lapListEl.innerHTML = '<div class="lap-item empty">Complete a lap to record time</div>';

    if (this.positionBadgeEl) {
      const initPos = this.totalCars || 4;
      this.positionBadgeEl.textContent = `P${initPos}`;
      this.positionBadgeEl.className = `position-badge p${initPos}`;
    }
    if (this.posGapBadgeEl) {
      this.posGapBadgeEl.textContent = this.totalCars === 1 ? 'TIME TRIAL ⏱️' : `CHASING P${Math.max(1, this.totalCars - 1)}`;
    }
    if (this.liveStandingsBarEl) {
      this.liveStandingsBarEl.innerHTML = '';
    }

    if (this.f1OverlayEl) {
      this.f1OverlayEl.classList.remove('hidden');
    }
    this.updateCountdown(0, false, 'HOLD [W] TO REV LAUNCH CONTROL');

    if (this.lapToastEl) {
      this.lapToastEl.textContent = 'SESSION RESET - STARTING FRESH';
      this.lapToastEl.className = 'lap-toast show';
      setTimeout(() => {
        if (this.lapToastEl) this.lapToastEl.className = 'lap-toast';
      }, 2500);
    }
  }
}
