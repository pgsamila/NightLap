Build a self-contained, browser-based 3D oval-track racing game using Vite, Vanilla JavaScript, Three.js, and Cannon-es (`cannon-es`) for realistic rigid-body vehicle physics. Structure the repository cleanly so it can be run locally with `npm install && npm run dev` and later, to be deployed as a static bundle to GitHub Pages.

### 1. Visual Aesthetic & Track Design
- **Stadium Oval Track**: Create a closed stadium-shaped oval circuit (two long parallel straightaways connected by two 180-degree semicircular hairpins), modeled after a classic slot-car/touring circuit.
- **Road Surface**: Dark asphalt texture with a dashed white center dividing line along the entire loop, plus a clear checkered start/finish line across one of the straightaways[cite: 1].
- **Track Barriers & Curbs**: Place continuous, solid inner and outer guardrail walls bordering both edges of the road. Add alternating yellow-and-black painted safety curbs along the inner and outer edges of both semicircular curves[cite: 1].
- **Lighting & Atmosphere**: Set the scene at dusk/twilight so the car's headlights stand out prominently. Include ambient twilight sky lighting, subtle trackside floodlights, and real-time shadows.

### 2. Car Model & Physics (`cannon-es`)
- **Vehicle Physics**: Implement a `RaycastVehicle` in Cannon-es with realistic chassis mass, wheel suspension (stiffness, damping, travel), tire friction, drift/slip behavior, weight transfer, and momentum.
- **Automatic Transmission**: Implement a smooth 5-speed automatic gearbox that automatically shifts up and down based on wheel RPM/speed, including reverse gear when braking from a standstill.
- **Solid Wall Collisions**: Both inner and outer track walls must be static rigid-body colliders (`mass: 0`) matching the exact geometry of the visual walls so the car physically collides, scrapes, and bounces off them without ever clipping through or leaving the track.
- **Car Details & Headlights**: Build a detailed low-poly/stylized 3D sports car with rotating front/rear wheels (front wheels steer visually), glowing red brake/taillights, and two bright front headlights using `SpotLight`s with visible volumetric/cone glow beams projecting onto the asphalt ahead.
- **Camera**: Smooth third-person chase camera with velocity-based FOV/lag, plus a toggle (`C`) for hood/first-person view.

### 3. Controls
- `W` / `Up Arrow`: Accelerate
- `S` / `Down Arrow`: Brake / Reverse
- `A` / `D` or `Left` / `Right Arrow`: Steer
- `Space`: Handbrake
- `C`: Toggle camera view

### 4. HUD & UI Overlay (HTML/CSS over Canvas)
Design a crisp, modern racing HUD:
- **Bottom-Right / Bottom-Center**: Digital & radial Speedometer (`KM/H`), current Automatic Gear indicator (`R`, `N`, `1`–`5`), and RPM bar.
- **Top-Center**: Compass / Heading direction indicator (e.g., `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW` with degree tape) + a dynamic **Navigation Path / Mini-Map** showing the oval track outline, start/finish line, live car position arrow, and upcoming corner direction chevron.
- **Right Side Panel**:
  - Live **Current Lap Timer** (`MM:SS.ms`).
  - Scrollable **Lap History List** (`Lap 1`, `Lap 2`, etc.) that automatically records and appends each completed lap time every time the car crosses the start/finish line in the forward direction (highlight the fastest lap in green/gold). Use checkpoint triggers halfway around the oval so players cannot cheat laps by reversing over the start line.
- **Top-Right Corner**: A prominent **"Reset Session"** button. Clicking it immediately teleports the car back to the starting grid facing forward, zeros all linear/angular velocities, clears all recorded lap times, resets the current lap timer to `00:00.00`, and starts fresh.

### 5. Project Structure
Organize the code cleanly into modular files:
- `index.html` & `src/style.css` (HUD layout & styling)
- `src/main.js` (Game loop, fixed-timestep physics stepping, scene setup)
- `src/track.js` (Parametric stadium oval generator for both Three.js meshes and Cannon-es wall/ground rigid bodies, plus lap checkpoint sensors)
- `src/vehicle.js` (RaycastVehicle physics, automatic transmission logic, 3D car mesh, headlights & brake lights)
- `src/hud.js` (Speedometer, compass, mini-map/navigation path, lap timer/history manager, and Reset button logic)
- `.github/workflows/deploy.yml` (Automated GitHub Pages deployment on push to `main`, similar to `dgreenheck/tidewater`)