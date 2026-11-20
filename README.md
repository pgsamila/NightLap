# NightLap - 3D Oval Track Racing

A self-contained, browser-based 3D oval-track racing game built with **Vite**, **Vanilla JavaScript**, **Three.js**, and **Cannon-es** (`cannon-es`) rigid-body vehicle physics.

---

## 🏎️ Features

1. **Visual Aesthetic & Track Design**
   - **Stadium Oval Circuit**: Closed stadium-shaped oval (two parallel straightaways connected by two 180° semicircular hairpins).
   - **Road Surface**: Dark textured asphalt with dashed white centerline and checkered start/finish line across the main straight.
   - **Safety Curbs**: 3D alternating yellow-and-black painted rumble strips along inner and outer hairpin corners.
   - **Guardrails & Solid Colliders**: Continuous static rigid-body colliders (`mass: 0`) matching the visual guardrails to prevent wall-clipping and provide realistic scrapes and bounces.
   - **Atmosphere & Lighting**: Set at dusk/twilight with an exponential fog haze, stadium floodlight towers with real spot illumination, and car headlights casting dynamic beams onto the road.

2. **Car Model & Physics (`cannon-es`)**
   - **RaycastVehicle**: Accurate chassis mass, wheel suspension (stiffness, travel, damping), tire friction, and drift/slip handling.
   - **5-Speed Automatic Transmission**: Automatic shifting up and down based on wheel RPM and vehicle speed, including automatic reverse gear engagement when braking to a standstill.
   - **Stylized 3D Sports Car**: Low-poly GT body with rotating alloy wheels, functional front steering, glowing red taillights, dynamic brake lights, and bright dual headlights with volumetric cone glow.
   - **Camera Modes**: Smooth dynamic chase camera with speed-dependent FOV expansion, plus hood/first-person view toggled with `C`.
   - **Synthesized Audio Engine**: Real-time Web Audio API engine sound, RPM rev pitch modulation, tire skid squeals, and shift pops with no external audio file dependencies.

3. **Racing HUD & UI Overlay**
   - **Speedometer Cluster**: Digital readout (`KM/H`), radial gauge arc, automatic gear badge (`1`–`5`, `R`), and multi-segment RPM bar.
   - **Top Navigation & Compass**: 360° heading compass ribbon and real-time mini-map tracking car position, heading, and upcoming corner turn advice.
   - **Lap Timing & History**: Live lap timer (`MM:SS.ms`), personal best lap badge, and scrollable lap history with cheat prevention (multi-checkpoint validation).
   - **Reset Session**: Teleports car back to the starting grid, zeros all velocities, clears lap records, and resets the session.

---

## 🎮 Controls

| Key | Action |
| --- | --- |
| `W` / `Up Arrow` | Accelerate / Drive |
| `S` / `Down Arrow` | Brake / Reverse |
| `A` / `Left Arrow` | Steer Left |
| `D` / `Right Arrow` | Steer Right |
| `Space` | Handbrake (Drift) |
| `C` | Toggle Camera (Chase / Hood) |
| `R` | Quick Reset to Starting Grid |

---

## 🛠️ Development & Build

### Local Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
```
The optimized static bundle will be output to the `dist/` directory.

### Preview Production Build
```bash
npm run preview
```

### GitHub Pages Deployment
A GitHub Actions workflow is included at `.github/workflows/deploy.yml` that automatically builds and deploys the game to GitHub Pages upon pushing to the `main` branch.
