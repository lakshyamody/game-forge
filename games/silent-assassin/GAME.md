# Silent Assassin

> Strike from the shadows. Leave no witnesses.

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
You're an assassin in a city at dusk. Sneak up behind your marked targets, take them down without anyone seeing, and get to the extraction van. Guards show their vision cones, so stealth is readable at a glance.

## Core loop
- Verb: sneak (WASD, Shift to crouch) + silent take-down (E / click) from behind.
- Reward: SILENT kills pay 1000 per target (400 if seen). Extraction + time bonus. "SILENT ASSASSIN" +2000 if never spotted in the mission.
- Escalation: each mission adds 2 guards and up to 4 targets. Each target gets a bodyguard who follows it.
- Fail / win: guards that fill their suspicion meter hunt and shoot you (5 hearts). 0 hearts = mission failed, Space restarts at mission 1.

## Controls
See `game.json`.

## Tuning
All numbers live in `config.ts`. Open the game with `?tune` for live sliders.

## Debug URL params
- `?tune` — live tuning panel
- `?god` — can't die
- `?mission=N` — start at mission N
- `window.__debug.killTarget(i)` / `.behind(i)` / `.toExfil()` — force states in playtests

## Systems
- City: 5×5 blocks of `kaykit-city-builder` buildings (height capped at 12 so the camera at y=20 never ends up inside one), plus a skyline ring on the N/E/W sides only (the south side is where the camera sits). Buildings between the camera and the player fade to 25%.
- Movement: NPCs walk between street intersections ("nodes"). `steer()` goes straight if it has line of sight, otherwise routes along the street grid.
- Stealth: guards have cone vision (`G.viewRange`, `G.viewAngle`). Suspicion rises faster up close and slower while crouching. Parked cars block sight only while you're crouched. Sprinting is heard within `P.sprintNoise`.
- Witnesses: anyone who sees a kill or finds a body raises the alarm. Civilians flee, and guards within `G.alarmRadius` hunt the spot.
- Characters: player = dark-tinted `mini-characters/character-male-d` + KayKit dagger. Civilians and targets = `mini-characters`. Guards = blue-tinted `blocky-characters` + `blaster-kit` pistol.

## Status
- [x] Scaffolded from template
- [x] City, stealth AI, take-downs, witnesses, bodies, extraction, missions, best score
- [x] Playtested: kill → extract → mission 2 → spotted → shot → game over; 60 fps on M2
- [ ] Kid-check fixes staged in FIXES.md (not applied yet)

## Ideas / next
- Drag and hide bodies in dumpsters
- Disguises (take a guard's uniform → walk through cones)
- Throw a coin to distract a guard
- A minimap showing targets
- Real night mode with point lights 
