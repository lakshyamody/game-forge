# Kid check — Banner Raid
Apply with `npm run fixes -- apply banner-raid <n>` (or `all`); undo with `npm run fixes -- undo banner-raid <n>`. Each patch was made against the same base and all five were tested applied together.

## ✅ 1. "The walls are just broken sticks with gaps!"
- **What you see:** the wall rings look like rows of separate pickets standing sideways, with gaps between them.
- **Why:** the stone-fence model runs along z, so the rotation for top/bottom vs side walls is swapped (and it's stretched sideways).
- **Fix (staged):** swap the rotation, scale it evenly: solid continuous wall lines. 1 line.

## ✅ 2. "The soldiers are so tiny I can't see them!"
- **What you see:** troops are little dots next to the buildings; you can barely tell a barbarian from an archer.
- **Why:** troop heights are 0.9–1.5 m on a 48 m map viewed from far out.
- **Fix (staged):** ~1.5× bigger (barbarian 1.45, archer 1.4, giant 2.3, wizard 1.55). 4 lines.

## ⬜ 3. "Where's the red zone? It's just muddy brown."
- **What you see:** the no-deploy area is a faint olive tint with a thin white outline, so the village looks dirty and you can't tell where you're allowed to drop troops.
- **Why:** red at 10% opacity over green grass mixes to mud.
- **Fix (staged):** stronger red tint and a solid red border. 3 lines.

## ⬜ 4. "Why is the gold grey?"
- **What you see:** every 🪙 (camp gold, upgrade prices, loot on the result screen) renders as a grey coin.
- **Why:** the coin emoji has no gold colour in this font/OS.
- **Fix (staged):** a small CSS gold coin everywhere instead of the emoji. 5 lines + 1 CSS rule.

## ⬜ 5. "When I smash a building it turns into a building site, not rubble."
- **What you see:** destroyed buildings become a tall grey stone-and-scaffold model, which looks like construction.
- **Why:** the `building-destroyed` model is tall and bright at full scale.
- **Fix (staged):** squash it to half height and darken it, so it reads as a smashed pile. 2 lines.
