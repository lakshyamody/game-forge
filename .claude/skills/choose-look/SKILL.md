---
name: choose-look
description: Before building a game, show the user 2–3 rendered options for each thing that decides how it looks (player, enemies, ground, sky, key props), creating an asset when the library has nothing good, then build with their picks. Use right after scaffolding every new game in Game Forge Studio (GAME_FORGE_STUDIO is set), and whenever the user wants to change how something looks.
---

# Choose the look

The user picks how the game looks before you build it: one popup in Game Forge Studio, 2–3 picture cards per question, one click each. Good choices here are most of what makes a game look good, so take this step seriously. The 30-minute clock pauses while the user is choosing.

## 1. Pick the questions (3–5)

The things that decide the look, in plain words: *"What should the player look like?"*, *"What should the zombies look like?"*, *"What should the ground be?"*, *"What time of day?"* (the sky), *"What should the car look like?"*. Skip things nobody would care about (a crate, a coin) unless they're the star of the game.

## 2. Find 2–3 strong options for each

- **Really different options**: different styles or moods (a chunky cartoon knight, a realistic soldier, a skeleton), not three near-identical models.
- **They must work together**: every option should fit the game's style. If you offer realistic and cartoon, say so in the labels and keep the other questions consistent with both.
- Search the library: `assets/CATALOG.md`, or query `assets/catalog.json` with `node -e`. Look at candidates before offering them: `npm run preview -- <id>` renders one to `.shots/preview/` exactly as the user will see it. Characters: see the pack table in AGENTS.md. Surfaces: `texture:<id>`. Skies: `hdri:<id>` (`*_night`, `*sunset*`, `*_puresky`, city streets, stadium).
- A model can be **tinted** (`"tint": "#8fcf5f"`) when its colours don't fit (Kenney's nature kit is teal/salmon: tint trees green).

## 3. Nothing good? Create it

- **Import** a fitting pack or model: `npm run assets -- add <kenney-pack>` (kenney.nl/assets), `kaykit <pack>`, `model <polyhaven-id>`, `texture|hdri <polyhaven-id>`, `ambientcg <id>`. CC0 only (MIT/CC-BY with the notice kept).
- **Build it in code** when no pack has it (a specific vehicle, a creature, a signature prop): `games/<slug>/art/<name>.ts` whose default export returns a `THREE.Object3D`. Real proportions, several parts, materials with colour + roughness/metalness, emissive where it glows. The game imports the same file, so what the user picks is exactly what they get. Label it "… (made for this game)".

  ```ts
  import * as THREE from 'three';
  export default function build() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x2f3338, metalness: 0.8, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xffd58a, emissive: 0xffa53a, emissiveIntensity: 2.2 });
    // … base, body, cap, bars: build it from parts, then
    return g;
  }
  ```

## 4. Ask

Write `.scratch/ask-<slug>.json`:

```json
{ "title": "Choose the look for <Title>",
  "questions": [
    { "id": "player", "question": "What should the player look like?", "options": [
      { "label": "Cheerful explorer", "asset": "mini-characters/character-female-b", "note": "cute and chunky" },
      { "label": "Knight", "asset": "kaykit-adventurers/knight", "note": "fantasy hero" },
      { "label": "Lantern keeper (made for this game)", "asset": "code:games/<slug>/art/keeper.ts" } ] } ] }
```

`asset`: `pack/name` (model) · `texture:<id>` · `hdri:<id>` · `code:games/<slug>/art/<name>.ts` · `image:<path>` (2D: a sprite or tile image under assets/ or the game). Then `npm run ask -- <slug> .scratch/ask-<slug>.json`. It checks every asset exists (fix and rerun if it complains) and renders each option to `games/<slug>/choices/`. Open a few of those PNGs; if one looks wrong (tiny, black, cut off), fix it and rerun.

**Then end your turn** with one short line, e.g. *"Pick the look in the popup and I'll build it."* Don't keep building: the picks arrive as the user's next message. (Outside Game Forge Studio, `npm run ask` prints the options as a list: ask the user in chat instead.)

## 5. Build with the picks

The next message lists each question → the chosen option and asset (or says "you decide": choose the best yourself). Use exactly those assets and tints. Write them under `## Look` in `games/<slug>/GAME.md`. Then continue the make-game skill from step 3.
