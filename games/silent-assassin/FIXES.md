# Kid check — Silent Assassin
Apply with `npm run fixes -- apply silent-assassin <n>` (or `all`). Each patch was made and tested against the same base.

## ⬜ 1. "The sidewalks look all rusty and muddy."
- **What you see:** Every block's sidewalk is brown with dark blotches, like dirt, not pavement.
- **Why:** The sidewalk uses the `concrete_wall_003` texture, which is a stained, rusty wall.
- **Fix (staged):** Swap it for the clean `painted_plaster_wall` texture, tinted a light pavement grey.

## ⬜ 2. "The road has giant cracks, they're bigger than the cars."
- **What you see:** Huge dark crack lines run across the streets, each as long as a building.
- **Why:** The asphalt texture is stretched across the whole city at only 24 repeats.
- **Fix (staged):** Tile it 70 times and darken it a little, so the road reads as fine asphalt.

## ⬜ 3. "I can't find my guy, he's dark on a dark road."
- **What you see:** The dark-tinted assassin melts into the dark street, especially in building shadows.
- **Why:** There's nothing marking the player except the tiny objective arrow.
- **Fix (staged):** A glowing cyan ring at the player's feet.

## ⬜ 4. "The streetlights are just grey poles, nothing's on."
- **What you see:** It's sunset, but the streetlights are plain grey and nothing glows.
- **Why:** The lamp models have no light or emissive part.
- **Fix (staged):** Add a warm glowing bulb to each lamp and a soft additive pool of light on the road under it.

## ⬜ 5. "When I take someone down they just lie there, nothing on the ground."
- **What you see:** After a kill the body lies on clean pavement. The red cubes fly off and nothing stays.
- **Why:** The kill only spawns short-lived debris.
- **Fix (staged):** A dark red puddle under every body, attached to the body so it clears at the next mission.
