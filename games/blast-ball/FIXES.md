# Kid check — Blast Ball
Apply with `npm run fixes -- apply blast-ball <n>` (or `all`); undo with `npm run fixes -- undo blast-ball <n>`. Each patch was made against the same base and all five were tested applied together.

## ⬜ 1. "The ground outside the stadium is all brown and muddy."
- **What you see:** on the title screen, the land around the stadium is a flat olive-brown plain.
- **Why:** the grass texture is tinted `0x9ab08a`, which multiplies it down to mud.
- **Fix (staged):** tint it fresh green (`0x5f9a48`). 1 line.

## ⬜ 2. "The walls around the pitch are rainbow colours, it looks messy."
- **What you see:** the boards round the pitch go yellow, red, pink, purple, light blue, and look washed out.
- **Why:** each board gets a different hue (`i / 6`) at a pale lightness.
- **Fix (staged):** alternate the two team colours (orange / blue), deeper so they survive the stadium lighting. ~4 lines.

## ⬜ 3. "The stadium lights are just white boxes on sticks."
- **What you see:** the four floodlight heads are blank white rectangles.
- **Why:** each head is a single flat white box.
- **Fix (staged):** a dark frame with a 4×2 grid of bright lamps facing the pitch. ~5 lines.

## ⬜ 4. "The sky is just one boring blue."
- **What you see:** the top half of the screen is a single flat light-blue colour.
- **Why:** the scene background is a solid colour.
- **Fix (staged):** a gradient sky, deep blue overhead fading to a pale haze at the horizon. ~5 lines.

## ⬜ 5. "The little map is see-through so the crowd shows through it."
- **What you see:** when you look toward the stands, coloured crowd blocks show through the minimap in the top left.
- **Why:** the map is drawn at 75% opacity with a faint border.
- **Fix (staged):** a solid map with a crisp white rounded border. 2 lines.
