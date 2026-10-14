# Horror 3

> Jack, a teddy, and Slenderina right behind him

Claude: read this before changing the game, and keep it current. It's the memory of what this game is.

## Pitch
Temple Run in a night-time graveyard. Jack (mini-characters kid) sprints down a 3-lane dirt path clutching his teddy bear, a zombie horde on his heels, and Slenderina bursts out of the graves without warning.

## Core loop
- Verb: switch lanes / jump / slide past gravestones, crypts, fallen logs and low beams.
- Reward: coins (lines in free lanes, arcs over gravestones), distance. Score = metres + coins × 10.
- Escalation: speed ramps 11 → 26 m/s, rows get closer, Slenderina attacks more often.
- Fail: a stumble pulls the zombies right behind you; a second stumble before they fall back (gap < `zombieCatchGap`) = caught. Getting touched by Slenderina = caught.
- Slenderina: no warning. She appears out of nowhere (red flash + sting, heartbeat while she's out): she either rises out of the ground in a lane ahead or sprints in from the side (tracks your lane until ~16 m away, then commits). Dodge her and she turns and hunts you from right behind for 3.5 s; stumble then and she has you.

## Art
- Jack: `mini-characters/character-male-c`; teddy: `furniture-kit/bear` held in the group's space by his right hand.
- Zombies: `graveyard-kit/character-zombie` ×6. Slenderina: `graveyard-kit/character-vampire` tinted dark, stretched to 2.9 m, white eyes.
- Obstacles/decor: `graveyard-kit` + `kaykit-halloween-bits`; coins `kaykit-dungeon-remastered/coin.gltf`. Ground: Poly Haven `dirt_floor` / `leafy_grass`, scrolled via texture offset as the planes follow Jack. HDRI `satara_night` as environment only.

## Controls
See `game.json`. Touch: swipe.

## Tuning
All numbers live in `config.ts`. Open the game with `?tune` for live sliders.

## Debug URL params
- `?tune` — live tuning panel
- `?god` — can't die
- `?autostart` — skip the menu
- `?slender` — first Slenderina attack at 2.5 s
- `?speed=N` — starting speed

## Status
- [x] Scaffolded from template
- [x] 3-lane runner, jump/slide, 4 obstacle kinds, coins, zombie gap rule, Slenderina ambush + chase, death cam, game over / retry, best score
- [x] Kid check: 5 staged fixes in `fixes/` (see FIXES.md)

## Ideas / next
- Temple Run corners (swipe to turn at T-junctions)
- Teddy power-up: squeeze the teddy to scare zombies back once per run
- Jumpscare close-up when Slenderina catches you
- Missions / coin shop for Jack outfits
