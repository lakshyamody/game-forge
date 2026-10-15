# Game Forge

A browser-game workshop: shared kit + genre templates + headless playtesting, so a game goes from prompt to playable in one session. Many games live side by side in `games/<slug>/`; every one with a `game.json` appears on the arcade launcher at `/`.

**First run in a fresh clone:** if `node_modules/` is missing, run `npm run setup` (installs deps + headless Chromium for playtests). Node ≥ 20.19.

**To build a new game, follow `.claude/skills/make-game/SKILL.md`** (design → scaffold → core verb → loop → playtest → hand-off) and its checklist `.claude/skills/make-game/game-feel.md`. Other procedures in `.claude/skills/`: `kid-check/` (5 kid-obvious look problems + staged fixes), `playtest/`, `polish/`, `ship/`, and `phaser4/` (Phaser API router).

**Working on an existing game: read `games/<slug>/GAME.md` first and update it when you change the design.** It is that game's memory across sessions.

## Stack

- **Phaser 4** (2D, default) · **Three.js** (3D) · Vite + TypeScript (strict) · ZzFX procedural sound · Tweakpane live tuning · no asset files needed — art and audio are generated in code.
- Phaser 4 is NOT Phaser 3. For any Phaser API you're unsure of, read the official v4 docs shipped in `node_modules/phaser/skills/<topic>/SKILL.md` (index: `.claude/skills/phaser4/SKILL.md`). `npm run check` catches most v3-isms.
- Type-check after every change (`npm run check`, ~1s).

## Layout

- `kit/` — engine-agnostic: `audio` (sfx presets, music sequencer, `audio.output` bus), `tune` (live sliders on `?tune`), `director` (waves/spawn budget), `upgrades` (pick-1-of-N), `grid` (A*, flood fill, ASCII), `fsm`, `pool`, `spatial`, `math`, `rng`, `save`, `input` (Three/canvas).
- `kit/phaser/` — `boot` (`bootPhaser`, `playtest()`), `menus` (`menuScene`, `gameOverScene`), `scenes` (`go`, `enablePause`), `cards` (`chooseCard`), `textures` (procedural art), `juice`, `ui`, `level` (`buildLevel`), `touch` (`TouchPad`).
- `kit/three/` — `boot` (`bootThree`: renderer, resize, loop, HTML HUD, shake), `look` (`look()`: the whole visual stack for stylised games — **call this in every 3D game**), `realism` (photoreal stack), `debris` (instanced cube particles).
- `kit/assets.ts` — the asset library loader (models + animations, PBR textures, HDRI, recorded sounds, URLs). Works in dev, builds and itch.io zips.
- Each kit file's header comment is its usage doc. Read it before using the module.
- `templates/` — `blank`, `topdown`, `platformer`, `puzzle`, `physics`, `3d` (a grounded world that already looks good), `3d-neon`. Each is a complete, playtested game; `npm run new` with no args describes them.
- Reference games: `games/neon-swarm` (polished 2D: pools + spatial hash, waves, upgrades, overlay scenes), `games/block-racer` (3D voxel racing: chunked InstancedMesh world, texture atlas, arcade drift physics), `games/hollow-house` (first-person horror: pointer lock, grid A* AI with hearing/sight, hiding, spatial audio), `games/siteline` (tactical FPS: hitscan with spread/recoil, abilities, round economy, defender AI), `games/banner-raid` (Clash-style raids: KayKit troops, A* through walls, defenses, camp upgrades), `games/sunset-district` (realistic GTA-style city: realism kit, procedural downtown + cars, Rocketbox pedestrians, traffic AI, day/night).

## Asset library (`assets/`, all CC0)

Thousands of 3D models, ~1,900 sprites, ~670 sounds, hundreds of photoscanned PBR textures (Poly Haven + ambientCG) and HDRI skies, Poly Haven photoscanned props, and 32 realistic Microsoft Rocketbox people with mocap — exact counts at the top of `assets/CATALOG.md`.
- **Find things:** `assets/CATALOG.md` (every name, grouped by pack; animated rigs list their clips), or `/assets.html` in the dev server (thumbnails, 3D preview with animations, sound playback, copy-to-clipboard ids).
- **Use them by default for anything representational** — characters, props, vehicles, furniture, weapons, environments, footsteps, impacts, UI clicks, announcer lines. Procedural art (`kit/phaser/textures.ts`, ZzFX) is for abstract/neon styles and effects.
- **Load with `kit/assets.ts`:** `loadModel('car-kit/race', { height })`, `animate(model).play('walk')`, `loadTexture('wood_floor_worn', { repeat })`, `loadHdri(scene, 'stadium_01')`, `sound.play('impact-sounds/footstep_wood_*')` (`*` = random variant), `assetUrl('sprites/…')` for Phaser `load.spritesheet` (in a `preload`, e.g. `menuScene({ preload })`).
- **Add more:** `npm run assets -- add <kenney-slug>` (any pack on kenney.nl/assets) · `kaykit <pack>` (KayKit on GitHub) · `model <polyhaven-id>` (photoscanned props) · `texture|hdri <polyhaven-id>` · `ambientcg <MaterialId>` · `rocketbox [Name…]` (realistic people). Bulk: `--category <c> --limit N` (most-downloaded first), `--exclude indoor,studio`. Only import assets that allow redistribution (CC0, or MIT/CC-BY with the licence notice kept beside the files) — the repo ships every asset. Catalog regenerates automatically.
- Refer to assets with **string literals** (`'pack/name'`, or a template prefix like `` `voiceover-pack/${line}` ``) — `npm run ship` copies only assets it can find referenced in the game's source.
- **Characters — pick the pack that fits the game, and don't reuse the last game's pack by default:**

  | Pack | Look | Animations |
  |---|---|---|
  | `kaykit-adventurers` | chunky fantasy heroes: knight, barbarian, mage, rogue (+ swords, shields, staffs, bows) | 76: melee/ranged/spell attacks, block, dodge, cheer, hit, death, run, walk |
  | `kaykit-skeletons` | skeleton warrior, mage, rogue, minion (+ weapons) | same 76 + resurrect |
  | `blocky-characters` | 18 Minecraft-ish blocky people | Kenney rig (below) |
  | `mini-characters` | 12 cute modern people | Kenney rig (below) |
  | `graveyard-kit` | zombies, skeleton, ghost, vampire | Kenney rig (below) |
  | `rocketbox` | **realistic** people: 16 adults, business, police, construction, medical, fire, military, security, sports, delivery, chef, 2 children | shared mocap libraries `rocketbox/anims-male` / `anims-female`: idle, idle-look, idle-wait, phone, wave, sit, crouch, walk, walk-fast, stroll, run, run-fast, drunk, cheer — `animate(person, await loadClips('rocketbox/anims-male'))`; real walking speeds (m/s) in `models/rocketbox/_speeds.json` |

  KayKit clips are named like `Running_A`, `1H_Melee_Attack_Chop`, `Death_A`; their rig has `handslot.r` / `handslot.l` bones for weapons. Buildings/worlds: `kaykit-medieval-hexagon` (castles, barracks, towers, homes in 4 team colours), `castle-kit`, `fantasy-town-kit`, `kaykit-dungeon-remastered`, `kaykit-halloween-bits`, `kaykit-city-builder`, `kaykit-space-base`, `kaykit-prototype-bits`.
- Kenney GLB models face **+z** (rotate π if your forward is −z). The mini-characters / blocky-characters / graveyard characters share one rig: `idle walk sprint jump die crouch attack-melee-right attack-kick-right holding-both holding-both-shoot …`. Attach props (guns, tools) in the character root's space at hand height rather than to the arm bone — the bone's axes swing with each clip.
- Pixel tilesheets: `pixel-platformer` tiles are 18px (20 per row), characters 24px; draw at an integer scale (2×) with `pixelArt: true`. See `templates/platformer/art.ts`.

## Stylised 3D — call `look()` in every 3D game

**Every 3D game starts with `look(game, '<preset>')` (`kit/three/look.ts`).** It is one line and it is the
difference between a game that reads as finished and one that reads as a prototype. Do not hand-roll a
`HemisphereLight` + `DirectionalLight` pair — that is what `look()` replaces.

```ts
const game = bootThree({ fov: 60, maxPixelRatio: 1.5 });   // look() owns bloom, shadows, fog and the background
const { scene, camera, loop, hud, shake } = game;
const fx = look(game, 'night');
fx.prepare(model);                       // shadows on every mesh under it
each frame: fx.follow(player.position)   // keeps the sharp shadow area on the player
```

It gives you a gradient sky (with stars at night) that the fog colour and image-based light are derived
from — so the horizon can never go muddy — plus a key/fill/rim light rig with soft shadows, bloom, AgX
filmic tone mapping, a colour grade and a vignette, all tuned per preset.

| Preset | For |
|---|---|
| `day` | bright outdoors, clear sky |
| `toy` | flat-lit bright voxel / toy look, cheap (no strong shadows) |
| `night` | moonlit exteriors, starry sky |
| `sunset` | golden hour, warm low sun |
| `neon` | synthwave / arcade, heavy bloom |
| `horror` | dark, dense fog, heavy vignette |
| `interior` | warm cosy rooms, lamp light |
| `overcast` | soft grey daylight |

- `look(game, 'day', { hdri: 'kloofendal_48d_partly_cloudy_puresky' })` uses a real HDRI sky and its
  image-based light instead of the procedural gradient — better for photoscanned settings. The light rig,
  post chain and `follow()` are unchanged. This is what `templates/3d` does.
- `fx.setPreset('night')` swaps the whole look at runtime (night falling, entering a cave).
- `fx.tune({ fogDensity: 0.02 })` nudges single values. Colour and light tweaks are cheap; changing
  `zenith`/`horizon`/`ground`/`stars` rebuilds the sky texture, so don't do that every frame.
- Ambient occlusion is **off** by default (flat-shaded art barely shows it, and it costs); opt in with
  `look(game, 'day', { ao: {} })`.
- Cheapest settings for a heavy scene: `{ shadows: false }`, or a smaller `shadowRange` (default 40).

## Realistic 3D (GTA-style look)

For realistic games use the Three.js realism stack instead of plain `bootThree` lighting (reference: `games/sunset-district`):
- `realism(game, { sun: { elevation, azimuth } })` (`kit/three/realism.ts`) — physical sky + sun, soft shadows that follow `fx.follow(player.position)`, image-based light from the sky (or `hdri: '<id>'`), N8AO ambient occlusion, bloom, AgX filmic tone mapping, colour grade, SMAA, haze. `fx.setSun(elev, az)` every frame gives a full day → golden hour → night cycle (night sky, moonlight). `fx.prepare(obj)` turns on shadows.
- `buildCity(scene, { blocks, facades, road, sidewalk, props })` (`kit/three/city.ts`) — procedural downtown: 4-lane roads with markings and crosswalks, raised sidewalks, glass towers with lit windows, brick/plaster low-rise with storefronts, rooftop clutter, street lamps; returns `lanes` (traffic), `loops` (pedestrian paths), `solids` + `collide()`, `groundY()`, `setNight(0..1)`.
- `buildCar(kind, colour)` (`kit/three/cars.ts`) — procedural sedan / hatch / SUV / sports / van / taxi / police with clearcoat paint, glass cabin, spinning + steering wheels, brake lights, siren. (Realistic free car models barely exist; these are the default.)
- People: `rocketbox/*` + `loadClips` (see the characters table). Match move speed to `_speeds.json` so feet don't slide.
- Materials: `loadTexture('<id>', { repeat })` works for every Poly Haven and ambientCG texture; CATALOG.md groups them by surface (brick, concrete, asphalt, road, wood, metal, tiles, terrain…). Tile at real-world scale (≈ 1 repeat per 3 m).

## Kid check & staged fixes

Every game build ends with a kid check (`.claude/skills/kid-check/SKILL.md`): 5 problems a kid would point out in how the game looks (colours, sizes, flat or unfinished visuals, HUD look; not gameplay), each with a small (~10 line) fix with a fix already implemented, tested and saved as `games/<slug>/fixes/<n>.patch`, listed in `games/<slug>/FIXES.md`. **When the user says "fix 2" / "fix all" / names a listed problem, run `npm run fixes -- apply <slug> <n|all>`** — don't re-implement it.

## Game Forge Studio

`studio/` is a desktop app (Electron) that runs the user's own Claude Code CLI in this repo, with a live preview. The window is a Next.js app in `studio/ui/` (React, Tailwind 4, Geist, Lucide; static export served over `studio://`), light by default (dark / system in the sidebar), system font. Top bar: logo, open tabs as pills, game search (⌘K). Sidebar: New game / Arcade / Asset library, games, recent prompts, Claude Code account. Home (the New game tab): "What should we make?" composer with starting-point templates; the new-game chat runs centred there and moves to the game's tab when the game appears. Game page: metadata chips, pitch from GAME.md, live preview, suggested fixes (apply / revert, all), with the game's chat on the right. Messages typed while Claude Code works are queued. Tests launch it with `STUDIO_HIDDEN=1` (no window, audio muted) and `STUDIO_USER_DATA=<dir>` (throwaway profile). Keyboard shortcuts live in the native menu (`studio/main/ui.mjs`) and reach the page as `menu` actions. The main process is `studio/main.mjs` + `studio/main/`; the page talks to it only through `window.studio` (`studio/preload.cjs`, typed in `studio/ui/lib/studio.ts`). `npm run studio` (builds the UI if changed) · `npm run studio:dev` (Next hot reload) · `npm run studio:build` (the app for this OS via `scripts/build-studio.mjs`: macOS .app + .dmg, Windows folder + zip; `-- --win` cross-builds Windows from a Mac). In the packaged app the workspace is `~/Game Forge`, `node`/`npm`/`npx` are shims on the app's built-in Node, Playwright's Chromium ships inside the app (`PLAYWRIGHT_BROWSERS_PATH`), the realistic asset packs download in the background on first launch into `~/Game Forge/assets` (`studio/main/library.mjs`, from the `realistic-v1` release made by `scripts/pack-realistic.mjs`), Claude Code gets `--add-dir` for the app's resources and a wide Bash allow list (`claude -p` can't ask for approval), Claude Code is installed in the background on first launch if missing (`installClaude` in `studio/main/env.mjs`), and Claude Code gets a short extra system prompt (plain-language replies, never start dev servers).

## macOS and Windows

Everything (scripts, Studio, playtests) runs on both. Keep it that way:
- Spawn `npm`/`npx` through `npmSync`/`npmSpawn` (`scripts/lib/platform.mjs`). Windows can't spawn `.cmd` files without a shell. Run repo scripts with `process.execPath`, not `node`.
- Set `PATH` with `withPath()` (Windows env keys are case-insensitive, so `{ ...process.env, PATH }` makes two keys). Zip with `zipDir()`.
- No git, `zip`, `cp`, `rm` or bash in scripts: use `node:fs`. Staged fixes are applied with jsdiff (`scripts/lib/patch.mjs`), not `git apply`. It handles CRLF checkouts.
- Compare paths after `.split(sep).join('/')`.
- Tests: `node scripts/test/fixes-roundtrip.mjs [slug…]`, `node scripts/test/studio-smoke.mjs [--packaged]`, and the full UI run `node scripts/test/studio-e2e.mjs [--claude]` (`--claude` also chats with the real Claude Code on your plan). Tests and playtests are muted: no game audio out of the speakers. CI runs them on `windows-latest` and `macos-latest` (`.github/workflows/platforms.yml`).

## Commands

`npm run new` (list) · `npm run new -- <slug> --template <t>` / `--from <game>` · `npm run play -- <slug> [query]` · `npm run shot -- <slug>` · `npm run check` · `npm run assets -- …` · `npm run fixes -- start|save|apply|undo|list <slug> [n]` · `npm run thumbs [-- <slug> --force]` (games/<slug>/thumb.jpg) · `npm run ship -- <slug>` (itch.io zip, only the assets it uses) · `npm run build` (whole arcade + library)

## Playtesting

`npm run shot -- <slug> [--gpu] [--seconds N] [--query "god&wave=5"] [--eval "<js>"] [--no-bot] [--no-click]` boots Vite, opens the game headless, bot-mashes inputs, saves screenshots to `.shots/<slug>/`, prints `window.__playtest` state + fps, exits 1 on any runtime error.
- `--gpu` renders on the real GPU — use it when judging visuals or fps. Default is software GL: slower, fine for error checks.
- `--eval` runs JS after start to force states: `--eval "__game.scene.getScene('Play').xp = 99"`. 3D games expose `window.__debug` for the same purpose.
- Publish state from the game with `playtest({ score, wave, ... })` (Phaser) or `window.__playtest = {...}` (Three). Read the screenshots; a clean exit only proves nothing threw.
- For anything the random bot can't do (drift, aim, hide), write a short Playwright script that drives real key/mouse input and logs `__playtest` over time.
- An fps reading taken right after a screenshot dips (the capture stalls rendering). Measure fps with a `requestAnimationFrame` loop instead.
- Headless Chromium can't pointer-lock: first-person games should accept a `?freelook` param.

## Phaser 4 gotchas (verified in this repo, 4.2.1)

- **Camera filters + ADD blend = black boxes.** Any `camera.filters` effect (`AddEffectBloom`, vignette, glow) renders dark quads where ADD-blended sprites/particles overlap. Pick one per scene: ADD blend with glow baked into textures, or NORMAL blend with camera bloom. Vignette: use the `vignette()` texture overlay.
- **Never scale Matter objects from 0** (spawn tweens, squash): `setScale` also rescales the physics body → NaN. Fade alpha instead.
- Camera effects (`zoomTo`, `pan`) need exact EaseMap names: `'Quad.easeOut'`. Tweens accept `'Quad.Out'`.
- `group.children` is a native `Set`: iterate `group.getChildren()`.
- `setTintFill` is gone: `setTint(c).setTintMode(Phaser.TintModes.FILL)`; restore with `MULTIPLY`.
- `Math.TAU` is now 2π. `Geom.Point` is gone (use `Vector2`). Body setters return `Body | StaticBody`; call `setMaxVelocityY` etc. on a separate line. Matter bodies: `this.matter.world.getAllBodies()`.
- A Scene field named `time` shadows the scene clock. Use `elapsed`.

## Three.js notes (r186)

- Draw many identical blocks with one `InstancedMesh` per block type, UVs baked into an atlas (see `games/block-racer/blocks.ts`) — one draw call each.
- `THREE.Clock` is deprecated; `bootThree` uses `THREE.Timer`.
- Anything indexed by "progress" (biomes, levels) must handle negative values if the player can reverse.
