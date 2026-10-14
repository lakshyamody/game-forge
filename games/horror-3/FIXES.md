# Kid check — Horror 3
Apply with `npm run fixes -- apply horror-3 <n>` (or `all`). Each patch was made and tested against the same base.

## ⬜ 1. "Slenderina is just a big black blob and her head covers the whole screen!"
- **What you see:** when she chases from behind, a giant dark shape sits right in front of the camera and hides the path.
- **Why:** her tint is nearly black, her eyes are tiny white dots, and she chases directly between the camera and Jack.
- **Fix (staged):** lighter purple-grey tint, bigger glowing red eyes, and she chases beside Jack in the next lane instead of behind him.

## ⬜ 2. "I can only see the tops of the zombies' heads at the bottom."
- **What you see:** while running, the horde is cut off at the bottom edge of the screen, so you only see their hair and hands.
- **Why:** the camera looks too far ahead, so there isn't enough frame behind Jack.
- **Fix (staged):** the camera tilts a bit lower so the horde is in shot right behind Jack.

## ⬜ 3. "The sky is just black, there's nothing up there."
- **What you see:** the whole top third of the screen is empty dark blue-black.
- **Why:** the sky is only the fog colour.
- **Fix (staged):** a big glowing full moon and ~300 stars hang in the sky (parented to the camera).

## ⬜ 4. "There are giant orange pancakes all over the grass."
- **What you see:** big flat orange dirt mounds beside the path that look like pancakes or rugs.
- **Why:** the flat `grave` dirt model gets sized by height, so it's blown up huge.
- **Fix (staged):** swap it for a stone gravestone-roof and the KayKit skull grave.

## ⬜ 5. "The coin counter has a grey ball, not a coin."
- **What you see:** top-left coin icon is a dull grey emoji next to a gold number.
- **Why:** the 🪙 emoji renders silver/grey in the pixel font.
- **Fix (staged):** a shiny gold CSS coin with a glow, and a slightly bigger counter.
