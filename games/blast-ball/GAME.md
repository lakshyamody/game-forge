# Blast Ball

> 3v3 football where everyone's armed.

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
Free Fire meets FIFA. A real football match — goals win — but every player carries a gun. Knock out the ball carrier to win it back, grab loot and parachute airdrops for better guns, throw gloo walls to block shots *and* the ball, and keep out of the blue zone that closes in from the sidelines.

## Core loop
- **Verbs:** dribble (auto when you touch the ball), charge-kick (hold right click / Space; aim up to chip), shoot (left click), gloo wall (G), swap gun (Q), sprint (Shift, stamina).
- **Match:** 3 minutes, you + RICO + keeper OLA (orange) vs VIPER + NOX + keeper BRICK (blue). Draw → golden goal.
- **Combat:** knocked players respawn after 4s and drop their special gun as loot. Headshots ×1.6. Friendly fire off.
- **Escalation:** zone starts closing at 22% of the match (sideline walls move inward, 8 HP/s outside), airdrops every 30s, loot every 14s.
- **Win:** most goals at full time. Record (W/D/L, goals, knocks) is saved.

## Weapons & loot
Pistol (∞), SMG, Shotgun (8 pellets), Rocket launcher (splash + launches the ball). Loot: medkit +50, armor +50, gloo +2. Airdrops = a big gun + armor + gloo.

## Code map
- `config.ts` — every tuning number (`?tune`)
- `pitch.ts` — stadium: painted pitch texture, goals/nets, boards, instanced crowd that bounces on goals, floodlights, zone walls
- `actors.ts` — `Player` (model, movement, damage), `Ball` (physics, dribble, tackles, keeper catches, goal detection), `aiThink` (keeper / carrier / chaser / support roles, shooting, loot, gloo)
- `weapons.ts` — weapon defs, tracers, `Gloo` walls (segment collision for bullets, ball, players), loot crates + parachute airdrops, rockets
- `main.ts` — match flow (kickoff → play → goal → golden goal → full time), hitscan, explosions, loot, zone, third-person camera, crowd audio, HUD + minimap + kill feed; menu is an AI-vs-AI attract match

## Debug
`?auto` (AI plays you — full matches headless) · `?god` · `?time=60` · `?nozone` · `?gun=rocket` · `?freelook` · `?tune` (+30s, airdrop now, give rocket, score). `window.__debug` exposes human, players, ball, M, cam, shoot, kickBall, throwGloo, goal, spawnLoot.

## Verified (headless, Apple M2)
- Full 3-minute `?auto` match: 4–3, 22 knockouts, zone closes, full time screen; 60 fps throughout.
- Human input script: dribble → charged kick (33 m/s) → pistol hits with hit marker + damage numbers → gloo wall → rocket pickup.
- Balance history: first pass had ~20 knocks/min and 0 goals → raised HP to 150, AI damage ×0.55, AI fire rate ×0.6, body-aimed AI; then 11 goals in 2 min → goal 8.5 wide, keeper reach ×1.4, keeper speed 0.85.

## Assets used
Kenney `mini-characters` (animated players: idle/walk/sprint/holding-both-shoot/attack-kick-right/die), `blaster-kit` (guns + crates), Poly Haven `stadium_01` HDRI lighting + `leafy_grass` normals on the pitch, sounds from `sci-fi-sounds` (lasers, explosions), `digital-audio` (SMG), `impact-sounds` (kicks, hits, glass, crates), `voiceover-pack` (ready/go/hurry up/final round/you win…). Crowd, whistle and gloo zap stay procedural.

## Kid check
5 staged fixes in `FIXES.md` / `fixes/` (muddy ground, rainbow boards, blank floodlights, flat sky, see-through minimap). Not applied yet — `npm run fixes -- apply blast-ball <n|all>`.

## Status
- [x] Match flow, ball physics, dribble/tackle/keepers, guns, rockets, gloo, loot, airdrops, zone, crowd, HUD, minimap, attract mode
- [ ] Not verified by a human: mouse feel, kick power curve, audio mix
- [ ] Touch / gamepad controls

## Ideas / next
- Passing on a key (auto-target nearest teammate) and through-balls
- Revive knocked teammates (Free Fire style) instead of timed respawn
- Character skills (dash, shield, sprint boost) picked before kickoff
- Penalty shootout for golden-goal draws
- Online 3v3 (Colyseus)
