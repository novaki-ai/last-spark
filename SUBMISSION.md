# Novaki: Last Spark

A top-down action roguelite in the spirit of Vampire Survivors, starring **Novaki** — the last
unstruck match in a box of one hundred. The Damp is rising through the house, and everything
warm is going out. Novaki does not run from the wet. Novaki *burns*.

## Build & play

```bash
npm install
npm run build
```

That produces `dist/`, a fully static site (relative URLs — works from any sub-path).
Serve it with anything, e.g. `npx vite preview` or `python3 -m http.server -d dist`,
and open `index.html`. No server code, no external network requests; every asset ships inside `dist/`.

**Controls**
- **Move:** WASD or arrow keys · gamepad left stick · touch joystick (left half of screen)
- **Dash:** Space / Shift · gamepad A · on-screen DASH button (brief invulnerability)
- **Pause:** Esc / P · gamepad Start · pause button

**Goal:** survive three stages — Matchwood Thicket, the Flooded Cellar, the Stormworks —
and kill the boss guarding each. Beating the third boss, the Soakfather, wins the run
(~15–25 minutes). Dying just means you strike again with more Forge upgrades.

## What's in the game

- **3 stages**, each with its own generated look, enemy roster, ambient weather and music track.
- **14 enemy types** with distinct behaviors: chasers, splitters, telegraph-chargers, spore
  spitters, zigzag dust bunnies, strafing moths, orbit-and-lunge scarabs, exploding bubble wisps,
  dashing eels, tar-trail tanks, teleporting rain wraiths, sniping storm kites, front-shielded
  hail husks, plus elite variants.
- **3 bosses** with multiple telegraphed attack patterns, summons and voiced intro/defeat lines:
  Mossmaw, Captain Clog, and the Soakfather (who has an enrage phase and a mid-fight taunt).
- **9 weapons + 10 passives**, chosen 3-at-a-time on level-up. Weapons level to 5 and
  **evolve** when paired with their partner passive (e.g. Spark Toss + Dry Wick → Wildfire):
  9 evolutions in total. Meta unlocks add a reroll per level-up and alternative starting weapons.
- **Persistent meta-progression** in `localStorage`: ember shards from kills/elites/bosses buy
  10 permanent upgrades in the Forge (max HP, damage, speed, XP, magnet, armor, revive,
  starting-weapon unlocks, reroll). Settings (music volume, sfx volume, screen shake,
  damage numbers) also persist.
- **Story:** voiced narrator intro and ending, voiced stage transitions, voiced boss lines
  (20 TTS clips), generated story illustrations.
- **Music** for menu, all three stages, both boss fights, victory and game over (8 Lyria clips),
  plus ~20 code-synthesized sound effects (Web Audio — no audio assets were downloaded).
- **QA interface** `window.NOVAKI_QA` with `state()`, `start({seed})`, `setInvincible`,
  `addXp`, `chooseUpgrade`, `skipTo`, `killBoss`, `spawnEnemies`. `start({seed})` is
  deterministic (all gameplay randomness runs through one seeded RNG, fixed 60 Hz timestep).

## Tech notes

- Custom TypeScript engine, zero runtime dependencies (only Vite for the build).
- Canvas 2D renderer: pre-rendered sprite sets (flipped/elite/flash variants), batched shadow
  pass, pre-rendered vignette/zone/glow textures, spatial-hash grid for all collision and
  separation, pooled particles/projectiles/pickups, fixed-timestep simulation decoupled from
  rendering.
- Holds 60 fps with 350+ enemies and a full weapon loadout in automated tests
  (measured in headless Chromium; update ≈0.3 ms, render ≈0.7 ms per frame).
- All art generated with `varlik image` (24 images: hero, 14 enemies, 3 bosses, 3 backgrounds,
  story/menu illustrations), all music/voice with `varlik music`/`varlik voice`.
  Sprites are downscaled + converted to WebP (dist ≈ 6 MB).

## Testing

Automated Playwright suites live in `tools/` (not part of the build): full QA-interface flow
(`test.mjs`), story/game-over/touch (`test2.mjs`), determinism (`test3.mjs`), meta/evo/revive
(`test4.mjs`), performance (`perf.mjs`), a heuristic bot that plays the entire game and wins in
~20 minutes (`botrun.mjs`), and a real-time keyboard-driven soak test (`soak.mjs`).

## What I would improve with more time

- More bosses / a fourth stage with an endless mode and leaderboards.
- Weapon-specific sound design (currently shared synth banks) and music that intensifies with
  horde size.
- More enemy death/attack animations (sprites are static, animated procedurally).
- Gamepad menu navigation (gameplay is fully gamepad-ready; menus are pointer/keyboard-first).
- Localization.

## Known bugs / limitations

- Damage numbers are skipped when disabled in settings *and* under extreme load (cap 120).
- On very old iOS Safari versions, audio starts only after the first touch (by design, Web Audio policy).
- Enemy sprites face right only; left movement flips the sprite (a stylistic choice).
- The pause button and boss bar can overlap on very narrow landscape phones (portrait is fine).
