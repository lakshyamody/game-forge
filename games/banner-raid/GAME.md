# Banner Raid

> Drop your troops, smash the village, steal the gold.

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
A Clash of Clans–style raid game in 3D. Build an army in your camp, drop troops around an enemy village, and watch them march, smash walls and buildings while catapults and archer towers fight back. Stars and loot pay for troop upgrades; every win makes the next village bigger.

## Core loop
- **Verb:** pick a troop card (1–4), tap/hold outside the red no-deploy zone to drop troops.
- **Raid (2:30):** troops auto-target (Giants go for defenses), path around walls or smash through when the detour is long. ★ 50% destroyed · ★ Town Hall · ★ 100%.
- **Reward:** loot from mines/storages/Town Hall/huts + star bonus (120 × stars × level). Any star → next village level.
- **Camp:** upgrade troops (+18% hp/dps per level, max 6), bigger army camp (+5 space), set army composition by housing space.
- **Escalation:** village level adds defenses, storages, mines, huts, a wall ring (Lv2+), an inner ring (Lv4+), +16% building HP per level.

## Troops (KayKit Adventurers)
Barbarian (axe, 1 space) · Archer (rogue with crossbow, 1 space, range 3.6) · Giant (knight, 5 space, 520 hp, targets defenses) · Wizard (mage, 4 space, splash).

## Controls
1–4 pick troop · click/hold outside the red zone to deploy · right-drag / WASD to pan · wheel to zoom · M mute

## Code map
- `config.ts` — troops, army, economy, defense numbers (`?tune`)
- `village.ts` — seeded layout per level on a 48×48 grid, KayKit medieval models fitted to footprints, walls, occupancy grid, rubble
- `main.ts` — troops (spawn, targeting, A* through/around walls, attacks), defenses + projectiles, battle flow/stars/loot, camp UI, camera, autopilot

## Debug
`?auto` (bot deploys, loops raids → camp → next raid) · `?level=5` · `?gold=9999` · `?tune` (destroy everything, +5000 gold). `window.__debug` exposes village, troops(), save, startBattle, endBattle, spawnTroop, hurt.

## Verified (headless, Apple M2)
- `?auto` from a fresh save: Lv1 raid 100% / 3★, gold 600 → 2000, next raid at Lv2 starts; no runtime errors.
- Lv3 (walled) raid: troops path to targets, break walls, archers/wizards fire projectiles, catapult splash kills troops.
- Real mouse clicks deploy (a fast tap deploys immediately).
- fps NOT confirmed: machine on battery capped every page at ~30 fps today.

## Assets used
KayKit `kaykit-adventurers` (barbarian, rogue, knight, mage + their weapons; Running_A, Walking_A, attack, Death_A, Cheer clips), `kaykit-medieval-hexagon` (castle, catapult tower, tower, mine, market, barracks, home, stone fence, rubble, trees), Poly Haven `leafy_grass`, `kloofendal_48d_partly_cloudy_puresky`; sounds from `impact-sounds`, `rpg-audio` (coins), `voiceover-pack` (go, you win, you lose).

## Status
- [x] Raid loop, 4 troops, 2 defense types, walls, stars, loot, camp upgrades + composition, progression, HUD, result screen
- [ ] Not verified by a human: deploy feel, balance past village Lv 4
- [ ] Kid check — see FIXES.md

## Ideas / next
- Build your own base and get raided back
- Spells (rage, heal, lightning)
- Mortar, wizard tower, air defense + flying troops
- Clan castle defenders (KayKit skeletons)
