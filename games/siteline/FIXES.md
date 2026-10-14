# Kid check — Siteline
Apply with `npm run fixes -- apply siteline <n>` (or `all`); undo with `npm run fixes -- undo siteline <n>`. Each patch was made against the same base and all five were tested applied together.

## ⬜ 1. "The gun is SO big it covers half the screen!"
- **What you see:** the gun in your hands fills the bottom-right quarter of the screen.
- **Why:** the viewmodel is loaded at scale 1.2 and held close to the camera.
- **Fix (staged):** scale 0.6, held a little further in and lower. 4 lines.

## ⬜ 2. "It says BUY PHASE two times!"
- **What you see:** a big grey "BUY PHASE" banner sits right above the buy panel's own "BUY PHASE 7" title.
- **Why:** the round-start banner repeats the panel heading.
- **Fix (staged):** the banner just says "ROUND 1" (or "MATCH POINT"). 1 line.

## ⬜ 3. "The sky is all grey and gloomy."
- **What you see:** a dark, stormy grey sky over the menu and every round, which makes the whole map look dull.
- **Why:** the `belfast_sunset_puresky` HDRI is overcast at this exposure.
- **Fix (staged):** swap to the `kloofendal_48d_partly_cloudy_puresky` HDRI: blue sky, white clouds. 1 line (it also changes the lighting a little: walls read cooler).

## ⬜ 4. "The red arrows from recon are tiny, I can barely see them."
- **What you see:** after pressing C, the markers over enemies are small, pale pink triangles.
- **Why:** 0.6-scale sprite with no outline.
- **Fix (staged):** twice the size, brighter red, white outline. 2 lines.

## ⬜ 5. "My gun is still floating there when it says VICTORY."
- **What you see:** on the end screen, the gun is still drawn behind the VICTORY / DEFEAT text.
- **Why:** the viewmodel is only hidden by the in-match camera code, which stops running at match end.
- **Fix (staged):** hide it when the match ends (it comes back on rematch). 1 line.
