# Kid check — Sunset District
Apply with `npm run fixes -- apply sunset-district <n>` (or `all`); undo with `npm run fixes -- undo sunset-district <n>`. Each patch was made against the same base and all five were tested applied together.

## ⬜ 1. "The main guy is walking around in his underwear!"
- **What you see:** your character wears a white tee and dark shorts that read as underwear next to the suited pedestrians.
- **Why:** the player uses Rocketbox `male-adult-01` (summer outfit).
- **Fix (staged):** play as `male-adult-07` — leather jacket and jeans. 1 line.

## ⬜ 2. "The taxi's back window is just a black box."
- **What you see:** car windows are solid black from behind; no reflections.
- **Why:** the shared car glass is near-black and fully metallic, so it reflects almost nothing at this angle.
- **Fix (staged):** lighter blue-grey glass, less metallic, mirror-smooth — it picks up the sky. Applies to every car. 1 line.

## ⬜ 3. "The glass buildings look like white plastic."
- **What you see:** in daylight the towers are pale, milky white slabs.
- **Why:** the window texture is light and the glass is fairly rough, so it scatters the bright sky.
- **Fix (staged):** darker blue-grey tint, sharper reflections — they read as glass. 1 line.

## ⬜ 4. "The city just ends in white nothing."
- **What you see:** looking down any long street, the road runs into a flat white haze with no buildings.
- **Why:** the city is 4×4 blocks with nothing beyond it.
- **Fix (staged):** 160 distant tower silhouettes in a ring around the city (one instanced mesh). ~5 lines.

## ⬜ 5. "The street lights make giant flat circles on the ground."
- **What you see:** at night every lamp paints a big, hard-edged disc across the sidewalk and half the road.
- **Why:** the light pools are 9 m decals.
- **Fix (staged):** shrink them to ~5.5 m so they sit around the lamp and fade naturally. 1 line.
