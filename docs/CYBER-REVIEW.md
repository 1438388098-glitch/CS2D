# Cyber Cricket Review

Review scope: the cyber cricket entertainment mode added in src/modes.js, its renderer in src/render.js, menu integration in src/ui.js/index.html, tests in test/modes.js, and docs/MODES.md.

## Automated evidence

- npm test passes, including cyber registration, odds/payout math, arena connectivity, full fight completion, and actual damage dealt.
- 10-match full game simulation: all fights end by kill, no timeouts, no stuck entities, both sides can win.
- 20-run bot diagnostics on the official maps remain within or near the 30-70% informational band after map-specific AI calibration.

## Findings found and fixed

- Critical: crickets were stopped by the center arena crates and never reached melee. Fixed by pathing around obstacles (pathTo/followPath) before close combat.
- Critical: the venom skill directly reduced hp without going through killEntity, so a lethal hit could leave an entity alive. Fixed by routing venom through applyDamage.
- Medium: the arena HUD showed the previous map name and a huge round timer. Fixed by setting game.mapId and roundDur for cyber mode.
- Low: the original modeHud had no visual feedback for skills. Added a rolling event feed so viewers can see skill triggers.
- Low: same-cricket selections were not handled in the menu. The mode start now swaps the right side to the next roster member.
- Low: bet input was not clamped to the player balance before start. The mode start now clamps bet to available coins.

## Remaining risks

- No browser-level visual verification was available in this session; rendering was reviewed by code inspection and syntax checks.
- The requested subagent/external review could not produce a report: subagent tooling is unavailable and local Codex CLI review timed out twice.
- Bot-vs-bot diagnostics still show map-side tendencies, so AI retake/positioning work remains on the roadmap.
