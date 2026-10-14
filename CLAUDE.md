@AGENTS.md

## Rules for every game build

Whenever someone asks you to make a game in Claude Code, these two rules are not optional:

1. **Playable in under 30 minutes.** Run `date` when you start and check it at every step of the `make-game` skill against its time budget. If you're behind, cut scope (fewer features, one level, fewer enemy types) rather than run over, but **never cut how the game looks**: a short build makes a smaller game, not an uglier one. The same goes when the user asks for less time ("in 15 minutes"). Every build must clear the visual bar in the `make-game` skill (step 5). Never cut the playtest or the kid check. Say how long the build took when you hand it off.
2. **Always end with 5 easy-to-spot, easy-to-fix problems.** Run the `kid-check` skill. Find 5 problems a kid would point out in how the game looks, each with a small (~10 lines) fix already implemented, tested, and staged in `games/<slug>/fixes/`. List all 5 in chat, phrased the way a kid would say them, so the user can say "fix 2" or "fix all" and have it applied instantly with `npm run fixes -- apply <slug> <n|all>`.
3. **Use the asset library, and vary it.** Pick characters and buildings from the pack that fits the game (Rocketbox realistic people, KayKit adventurers/skeletons, blocky-characters, mini-characters, graveyard-kit; see the table in AGENTS.md; for a realistic look use the realism stack in AGENTS.md › Realistic 3D) instead of reusing the last game's pack. Need something new? `npm run assets -- add <kenney-pack>`, `kaykit <pack>`, `model|texture|hdri <polyhaven-id>`, `ambientcg <id>`, `rocketbox`. Only licences that allow redistribution (CC0; MIT/CC-BY with the notice kept).

## Claude Code specifics

- **To build a game, use the `make-game` skill.** User slash commands: `/playtest <slug>`, `/polish <slug>`, `/ship <slug>`. Phaser API questions: the `phaser4` skill.
- A PostToolUse hook (`scripts/hooks/typecheck.mjs`, configured in `.claude/settings.json`) type-checks after every `.ts` edit and feeds errors back. Fix them before moving on.
