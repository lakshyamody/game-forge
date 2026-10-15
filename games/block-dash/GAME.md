# Block Dash

> Temple Run in a Minecraft world. Outrun the zombie horde.

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
Endless 3-lane runner (Temple Run) on a voxel stone path raised above a blocky Minecraft world. A horde of 3 zombies chases you; corners must be turned or you splat into the wall.

## Core loop
- **Verb:** swap lanes / jump / slide / turn at corners, every second.
- **Reward:** gold blocks (+10, rising-pitch combo, x10 combo +50), +25 per turn, distance = points, biome changes (Plains → Desert → Snowy Taiga, every 500 m).
- **Escalation:** speed 10 → 23 blocks/s; obstacles introduced one at a time by distance: TNT + cobble walls → log beams (60 m, slide) → lava gaps (160 m, jump) → full TNT rows (220 m, jump) → 4-wide gaps (600 m). Spacing shrinks with distance.
- **Fail:** hitting an obstacle = stumble (it smashes into voxels, zombies close in, you slow down). A second hit before they fall back (~7 s) = CAUGHT. Lava gap or missed corner = instant death. Space/R retries instantly; best score saved.

## Controls
A/D or ←/→ lanes (and turns near a corner) · W/↑/Space jump · S/↓ slide (fast-fall in the air) · swipe on touch · Esc pause · M mute.

## Code map
- `config.ts`: all tuning (live with `?tune`)
- `blocks.ts`: procedural 16px Minecraft textures → atlas (from block-racer, + stonebrick, mossy, gravel, emerald); `tileTexture()` for ground planes
- `world.ts`: segment chain (s = along, o = lateral), biomes, obstacle/coin planning, voxel build (InstancedMesh per block type per segment), corner walls with glowstone arrows. Turns keep heading within ±90° of north, so the path never crosses itself.
- `main.ts`: run state, input, collisions, stumble/chase, zombies following a trail of the player's path, camera, HUD, autopilot.

## Art
- Hero `blocky-characters/character-b`, zombies `graveyard-kit/character-zombie`. HDRI sky `kloofendal_48d_partly_cloudy_puresky`. Everything else is voxel blocks from the atlas.
- blocky-characters have no jump/crouch clips: jump = tuck + squash, slide = lean the body group back.

## Debug URL params
- `?tune` live sliders · `?god` can't die · `?auto` autopilot (survives 1 km+) · `?speed=20` start speed
- `window.__debug = { world, C, seg, s }`

## Status
- [x] Run, lanes, jump, slide, corners, gaps, stumble + zombie chase, 3 biomes, coins/combo, menu/over/retry, best, pause, mute, touch swipes
- [x] Verified: autopilot 1.2 km across all biomes, 61 fps (M2, --gpu), no errors

## Ideas / next
- Power-ups: pickaxe (smash through walls), magnet, elytra glide over a stretch
- Nether biome with lava rivers; T-junctions (choose either way)
- Creeper that hisses and explodes on a lane
