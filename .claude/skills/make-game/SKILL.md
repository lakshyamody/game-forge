---
name: make-game
description: Build a new browser game (or a major new mode for one) in this repo from a prompt. Use when asked to make, build, create, or prototype a game, or remix an existing one into a new game.
---

# Make a game

Target: a game that is **fun within 10 seconds of pressing play**, verified by playtest, in **under 30 minutes**.

**Time budget.** Run `date` at the start and at each step; if a step overruns, cut scope in the next one, never the verify or kid-check steps.

| Step | Budget | Done by |
|---|---|---|
| 1. Design | 2 min | 0:02 |
| 2. Scaffold | 1 min | 0:03 |
| 3. Core verb | 10 min | 0:13 |
| 4. Complete the loop | 5 min | 0:18 |
| 5. Verify | 4 min | 0:22 |
| 6. Kid check | 6 min | 0:28 |
| 7. Hand off | 1 min | 0:29 |
 Scope down before you polish up: one core verb done with great feel beats five half-done systems. Scope means **features**, never looks: a 10-minute game is a smaller game that still clears the visual bar (step 5).

## 1. Design (~10 lines in your reply, then build)

- **Core verb** — what the player does every second (shoot, jump, slice, place, steer).
- **Loop** — verb → reward → escalation → fail/win → instant retry.
- **Base** — pick the closest starting point (`npm run new` with no args lists them):

| Idea shape | Start from |
|---|---|
| Anything 2D that fits nothing below | `--template blank` |
| Shooter, survivors-like, top-down action, many enemies | `--template topdown` (or `--from neon-swarm` for the polished version) |
| Platformer, side-scroller, runner | `--template platformer` |
| Turn-based, grid, tiles, logic, match-3, tactics | `--template puzzle` |
| Real rigid bodies: stacking, slingshot, golf, ragdoll | `--template physics` |
| Needs 3D | `--template 3d`: a world that already clears the visual bar (sky, sun shadows, textured ground, props, animated character). Keep that look and swap the setting (ground texture, HDRI, props, character). `--template 3d-neon` only for an abstract neon style |

- **Art & sound** — for a realistic look use the realism stack (AGENTS.md › Realistic 3D) with Rocketbox people, Poly Haven/ambientCG materials and `buildCity`/`buildCar`; otherwise pick packs from the asset library (`assets/CATALOG.md`): animated characters from whichever pack fits (`kaykit-adventurers`, `kaykit-skeletons`, `blocky-characters`, `mini-characters`, `graveyard-kit` — see the table in AGENTS.md; vary it between games), props from the matching kit, a Poly Haven texture/sky for surfaces, footsteps/impacts/voice from the sound packs. If nothing fits, `npm run assets -- add <kenney-slug>` (browse kenney.nl/assets) before falling back to procedural art.
- **Juice plan** — which feedback fires on the core verb, on reward, on damage ([game-feel.md](game-feel.md)).
- **Out of scope** — name what you're NOT building this session.

Ask the user only if the genre itself is ambiguous; otherwise pick the most fun interpretation and say what you picked.

## 2. Scaffold

`npm run new -- <slug> --template <t> --title "Title" --tagline "One line"`, then fill in `games/<slug>/GAME.md` (pitch, loop, controls) and `game.json` controls/color. GAME.md is the game's memory across sessions — keep it current as you build.

**In Game Forge Studio** (`GAME_FORGE_STUDIO` is set): now run the `choose-look` skill. It shows the user 2–3 rendered options for each key visual and you **end your turn**; continue at step 3 when their picks arrive (the clock pauses while they choose).

## 3. Build the core verb first

Get the player moving and the core verb working with feedback before anything else. Most of the work is the game's Play scene; menus, pause, game over, best score, level-up cards come from the kit (`menuScene`, `gameOverScene`, `enablePause`, `chooseCard`).
- **3D games start with `look(game, '<preset>')`** (`kit/three/look.ts`) — sky, key/fill/rim lights, soft shadows, bloom, filmic tone mapping, colour grade, vignette, in one line. Presets: `day toy night sunset neon horror interior overcast`. Never hand-roll a `HemisphereLight` + `DirectionalLight` pair. Photoreal game? `realism()` instead.
- Art + sound: the asset library via `kit/assets.ts` (models, animations, textures, skies, recorded sounds, sprite sheets) — see the Asset library section of AGENTS.md. Procedural `kit/phaser/textures.ts` / `kit/audio.ts` for abstract styles, effects and synth SFX. Feel: `Juice`.
- Every tuning number goes in the game's `config.ts` and through `tune(obj, 'Name')` so `?tune` shows live sliders.
- Systems to reuse rather than rewrite: `Director` (waves), `Upgrades` (roguelite picks), `Grid` (A*, flood fill), `Fsm` (AI/states), `Pool` + `SpatialHash` (>100 entities), `buildLevel` (ASCII levels), `TouchPad` (mobile).
- Add debug URL params as you go (`?god`, `?level=`, `?wave=`) so playtests can reach late-game states.
- Puzzle games: write a quick brute-force solver to prove each level is solvable before shipping it.

## 4. Complete the loop

Menu → play → game over → instant retry (R/Space). Score + persisted best. Escalation over time. Mute on M, pause on Esc (both free via the kit).

## 5. Verify

Done means all of:
- `npm run check` passes (a hook also type-checks after every edit).
- `npm run shot -- <slug> --gpu --seconds 20` exits clean, AND you open every screenshot it lists (exact paths, don't guess names) and `__playtest` state shows the loop progressing (score rising, enemies dying, levels reached). Use `--eval` to force states the bot can't reach.
- **The visual bar.** Put your gameplay screenshot next to the reference (3D: `games/blast-ball`, 2D: `games/neon-swarm` if present; run `npm run shot` on it). If yours looks clearly worse, fix the look before the kid check. Every game needs:
  - **3D:** a real sky and lighting: `realism(game, { sun })` from `kit/three/realism.ts`, or `bootThree` + `loadHdri(scene, '<id>', { background: true })`. Never a black or flat void above the world. Shadows on. Textured ground (`loadTexture`, tiled at ~1 repeat per 3 m), never one flat colour. Characters and props from the asset library (`loadModel`), never plain boxes. The world continues past what the camera can see (no edge or void at any camera angle the game uses, including the start).
  - **2D:** sprites from a pack, or one deliberate procedural style with a palette; a background with depth (gradient, parallax or tiles), never a flat fill.
  - **HUD:** readable over the scene and fits at 1280×720: no wrapped labels, overlapping panels or text off-screen. Check it in the screenshots.
- Every item in [game-feel.md](game-feel.md) is present or consciously skipped.
- fps ≥ 55 in the `--gpu` run.

## 6. Kid check

Run the `kid-check` skill: find the 5 things a kid would say look wrong, stage a small tested fix for each (`npm run fixes`), and list them in chat so the user can say "fix 2" and get it instantly.

## 7. Hand off

Run `npm run thumbs -- <slug>` (title-screen thumbnail for the arcade and Studio). Tell the user: how long the build took, `npm run play -- <slug>` (opens it), the 5 kid-check problems (numbered, kid-phrased, with "say fix 2 / fix all"), the controls, `?tune` for live sliders, what you tuned for fun, what you'd add next. Update GAME.md's Status and Ideas.
