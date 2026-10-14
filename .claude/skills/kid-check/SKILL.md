---
name: kid-check
description: Find 5 visual problems a kid would point out in how a game looks, and pre-build a small fix for each, so "fix 2" is instant. Use as the last step of every game build, when asked to find problems / review a game, and when the user says "fix 3", "fix all", or names one of the listed problems.
---

# Kid check

After a game is built, play it like a kid would and find **5 problems with how the game looks that anyone notices within a minute of playing** — then implement every fix now, save each as a patch, and roll it back. The user picks which to apply; applying is one command. Budget: ~6 minutes for the whole check (it's step 6 of the 30-minute build).

## If the user says "fix N" / "fix all" / names a listed problem

1. `npm run fixes -- apply <slug> <N>` (or `all`). It applies the staged patch, type-checks, and ticks it off in `games/<slug>/FIXES.md`.
2. Confirm with one targeted screenshot of that view (`npm run shot -- <slug> --gpu` plus `--query`/`--eval` to reach the moment), then reply in one or two lines.
3. If it reports a conflict (two fixes touched the same lines), re-implement that fix from its plan in FIXES.md.

## Running a check

1. **Snapshot:** `npm run fixes -- start <slug>`.
2. **Play it like a kid, and look.** `npm run shot -- <slug> --gpu --seconds 20`, plus a short scripted Playwright run that reaches the moments a kid sees: the menu, the first 10 seconds, the core action, getting hit, winning/losing, retrying. Look at every screenshot.
3. **Pick 5 look problems.** How the game *looks* on screen: colours, sizes, spacing, brightness, contrast, empty or flat areas, things that clash, look unfinished, or look like placeholders, in the world and the HUD alike. Not gameplay, controls, AI, physics or difficulty. Each one must be:
   - **Kid-obvious.** Seen in a screenshot. Say it the way a kid would: *"The sky is just one boring blue"*, *"The walls are rainbow colours, it looks messy"*, *"The lights are just white boxes"*, *"I can't see my guy, he's the same colour as the grass"*, *"The words are so tiny"*.
   - **Real.** You saw it in a screenshot. Never invent one.
   - **Easy to fix.** A colour, size, position, opacity, font, or a swapped asset. **At most ~10 changed lines**, no new systems, under 5 minutes. If the honest fix is bigger, pick a different problem.
   - **Independent.** Touches different lines from the other four, so any subset applies cleanly. Patches carry 3 lines of context, so keep edits at least 7 lines apart or in different files.

   Places to look, most obvious first: flat single-colour skies, floors or backgrounds · muddy, dull or clashing colours · random rainbow colours where a palette belongs · plain boxes standing in for things (lights, windows, signs) · the player or key objects blending into the background · things too small or too big · empty corners of the screen · HUD elements that are see-through, cramped, misaligned, tiny or low-contrast · text over busy backgrounds · harsh edges where the world ends.
4. **Stage each fix**, one at a time: implement it → verify (type-check + a before/after screenshot of the same view; if it doesn't clearly look better, tune it) → `npm run fixes -- save <slug> <n>` (saves `fixes/<n>.patch` and rolls the game back to the base).
5. **Prove they apply:** `npm run fixes -- apply <slug> all`, one screenshot run, then `npm run fixes -- undo <slug> all`. If two patches conflict, rework one so they're independent.
6. **Write `games/<slug>/FIXES.md`:**

   ```markdown
   # Kid check — <Title>
   Apply with `npm run fixes -- apply <slug> <n>` (or `all`). Each patch was made and tested against the same base.

   ## ⬜ 1. "The sky is just one boring blue."
   - **What you see:** <one sentence, where and when>
   - **Why:** <the cause, one sentence>
   - **Fix (staged):** <what the patch changes, one sentence>
   ```
   Headings must keep the `## ⬜ <n>. ` prefix — the script ticks them to ✅.
7. **Report in chat:** the 5 look problems as a numbered list, kid-phrased, each with a one-line fix, ending with: *Say "fix 2", "fix 1 and 4", or "fix all".*

Done when: five patches exist in `games/<slug>/fixes/`, all five apply together cleanly, the game is back at its base state, FIXES.md is written, and the list is in chat.
