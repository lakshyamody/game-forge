# Game feel checklist

The difference between "works" and "fun" is almost entirely here. Every line maps to a kit call.

## Looks (do this first — it is one line and it changes everything)
- **3D: call `look(game, '<preset>')`** (`kit/three/look.ts`) before building the world. It is the whole
  visual stack: gradient sky, key/fill/rim lights, soft shadows, bloom, AgX tone mapping, grade, vignette.
  `fx.prepare(obj)` on models, `fx.follow(player.position)` each frame.
- **Never ship a flat single-colour sky.** "The sky is just one boring blue / just black / all grey" is the
  single most common kid-check complaint in this repo. A preset gives you a gradient and stars for free.
- **The player must not blend into the background.** Give the key object emissive, a brighter value, or an
  outline colour the backdrop never uses.
- **No default-grey materials.** Every `MeshStandardMaterial` gets a deliberate colour and roughness. Pick a
  palette (3-4 colours + one accent for anything interactive) and stay in it.
- **Anything that is supposed to emit light must glow** — emissive material *and* a real light, not a white
  box standing in for a lamp.
- **Give things ground contact.** Shadows (via `fx.prepare`) or a soft dark decal under the player; objects
  that float look broken.
- Check it at the camera distance you actually play at, not from a debug angle.

## Core verb (fires every second — make it crunchy)
- Sound on every action (`sfx.play`), pitch-varied (ZzFX randomness does this).
- Visual kick: muzzle flash / dust puff / squash (`juice.burst`, `juice.squash`).
- Tiny recoil or anticipation on the actor.

## Hits and kills
- Target flashes white (`juice.flash`), gets knocked back.
- Particles in the target's colour (`juice.burst`), bigger for bigger things.
- Screen shake scaled to importance (`juice.shake(0.1)` small, `0.6+` huge). Never constant.
- Hitstop 40–90ms on heavy hits (`juice.hitstop`), 150ms+ on boss kills.
- Floating numbers / "+score" (`juice.pop`), crits bigger and yellow.

## Player damage
- Big shake + hitstop + red screen flash + sound + music duck (`music.duck`).
- Invulnerability frames with blink. Push enemies away so damage is never a death spiral.

## Rewards
- Pickups magnetise toward the player; rising pitch on rapid pickups (`sfx.play('pickup', { freq })`).
- Level-up / milestone: pause, slow-mo, ring burst, zoom punch, a jingle (`sfx.notes`).
- Combo/multiplier that the HUD pops when it grows.

## Movement
- Acceleration + damping (`damp()`), not instant velocity. Snappy > floaty.
- Platformers: coyote time, jump buffer, variable jump height (see templates/phaser).
- Dash/dodge with i-frames and afterimages for action games.
- Camera follows with lerp and looks ahead toward aim/movement.

## Escalation and fairness
- Difficulty ramps continuously; new enemy types/mechanics introduced one at a time with a banner.
- Telegraph every threat (spawn markers, wind-up lines, flashing) — deaths should feel deserved.
- Music intensity layers follow the action (`music.setIntensity`).

## Flow
- Menu → playing in one keypress. Game over → retry in one keypress, under a second.
- Persisted best score; "NEW BEST!" moment.
- Pause on Esc and on tab blur. Mute on M (persisted).
