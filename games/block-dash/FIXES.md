# Kid check — Block Dash
Apply with `npm run fixes -- apply block-dash <n>` (or `all`). Each patch was made and tested against the same base.

## ⬜ 1. "The glowy yellow blocks on the sides are giant and get in my face."
- **What you see:** lantern posts (stone block + glowstone) stand on the path edge every 10 blocks and fill the bottom corners of the screen as you run past.
- **Why:** they stick up 2 blocks right beside the lanes, close to the chase camera.
- **Fix (staged):** the glowstone lamps sit flush in the path's outer edge instead, glowing without blocking the view.

## ⬜ 2. "The sign on the wall is a cross, not an arrow."
- **What you see:** the glowstone pattern on every corner wall reads as a plus sign from a distance.
- **Why:** the arrow's 1-block shaft and full-height head make a ✚ shape.
- **Fix (staged):** one bold road-sign ">" chevron pointing the way to turn.

## ⬜ 3. "The +25 turn writing is tiny and see-through."
- **What you see:** the "+25 turn" popup after each corner is small, pale blue, and fades into the sky.
- **Why:** 16px light-blue text with a thin shadow.
- **Fix (staged):** bigger "+25 TURN!" in bright green with a full black outline.

## ⬜ 4. "The stone walls are the same grey as the floor, I can't see them."
- **What you see:** cobblestone wall obstacles blend into the cobblestone path.
- **Why:** walls and path use the same grey cobble texture.
- **Fix (staged):** walls are wooden planks (and smash into wood-coloured bits), which stand out on stone, sand and snow paths.

## ⬜ 5. "The gold doesn't look like gold, it's just pale yellow cubes."
- **What you see:** the gold pickups look flat and washed out in daylight.
- **Why:** they use the plain matte block material.
- **Fix (staged):** a shiny, slightly metallic material with a warm glow that catches the bloom.
