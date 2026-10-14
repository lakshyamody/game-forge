# Siteline

> Tactical 1v3 shooter: plant the spike or clear the site.

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
A single-player take on Valorant-style tactical shooters. You attack alone against 3 AI defenders (4 from round 3). Buy a gun, take site A or B, plant the spike and hold until it detonates, or clear the site. First to 5 rounds.

## Core loop
- **Verb:** tap heads. Standing still is pinpoint; moving shots go wide (counter-strafe). Headshot ×3–4.
- **Round:** 8s buy phase (frozen) → 90s to plant (hold 4 on a site, 3.5s) → 35s spike timer; defenders rush to defuse (7s, reset by damage).
- **Win round:** all defenders dead or spike detonates. **Lose:** you die before planting, time runs out, or they defuse.
- **Economy:** start ¤800; win +3000, loss +1900, kill +200, plant +300. You keep your gun if you survive.
- **Abilities:** Q dash (2), E smoke (2, blocks AI sight), C recon (1, reveals defenders through walls for 3.5s).
- **Escalation:** 4th defender from round 3; AI accuracy +3.5% and reaction −0.03s per round.

## Controls
WASD move · Shift walk (silent + accurate) · mouse aim · click shoot · right click zoom/scope · R reload · Q/E/C abilities · hold 4 (or F) to plant · Esc pause · M mute

## Code map
- `config.ts` — all tuning (movement, round, economy, AI, abilities, guns)
- `map.ts` — ASCII map (36×18 cells × 2m), walls/crates/site pads, grid line of sight (`lineClear`), circle collision (`slide`)
- `defender.ts` — Defender model, animation, A* pathing, damage
- `main.ts` — round flow, buying, hitscan with spread/bloom/recoil, abilities, spike, AI brain (`aiUpdate`/`aiShoot`), HUD + minimap, autopilot

## Debug
`?auto` (bot plays you: walks to a site, aims, plants) · `?god` · `?freelook` · `?round=4` · `?credits=9000` · `?tune` (kill all, +5000). `window.__debug` exposes P, M, cam, defenders, fire, buy, endRound, plantNow.

## Verified (headless, Apple M2)
- 90s `?auto` run: 4 rounds, 9 kills, buys (rifle/sniper/SMG), a plant + detonation win, a loss; no runtime errors.
- Hitboxes: head sphere y 1.42 r 0.3 (chibi heads), body spheres; headshot at 3.5m = 78 dmg with the sidearm.
- fps: NOT confirmed — the machine was on battery (15%) and capped every page, including Blast Ball, at ~31 fps. 31 draw calls, ~22k triangles.

## Assets used
Kenney `mini-characters` (defenders: holding-both/holding-both-shoot/walk/crouch/die), `blaster-kit` (viewmodel + defender guns), Poly Haven `painted_plaster_wall`, `sand_01`, `rusty_metal_02`, `concrete_wall_003`, `belfast_sunset_puresky` HDRI; sounds from `sci-fi-sounds` (guns, smoke, recon, spike explosion), `impact-sounds` (footsteps, hits), `voiceover-pack` (ready/round/go/hurry up/objective achieved/mission failed/you win/you lose).

## Status
- [x] Rounds, economy, buy menu, 4 guns, spray/bloom/recoil, ADS + sniper scope, dash/smoke/recon, spike plant/defuse/detonate, defender AI (hold/hear/hunt/engage/defuse), HUD, minimap, menu/end screens
- [ ] Not verified by a human: mouse feel, AI difficulty curve
- [ ] Kid check — see FIXES.md

## Ideas / next
- Defender side (you defend, bots attack)
- Agent select with different ability kits
- Teammate bots (2v4 / 5v5)
- Proper recoil patterns per gun, wall penetration
- More maps (3-site)
