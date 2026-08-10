# AI Team Duel Review

Review scope: the cyber mode added in src/modes.js, its menu integration in src/ui.js/index.html, spectator camera in src/game.js/input.js/ui-dom.js, tests in test/modes.js, and docs/MODES.md.

## Automated evidence

- npm test passes, including mode registration, two pro team setup, 5v5 bot match, odds/payout math, coin history, spectator camera switching, and end-of-match settlement.
- A full cyber match finishes at first-to-5 wins or after 9 rounds, then the bet is settled through the coin system.

## Findings and fixes

- Critical: the original mode used literal cricket entities, not the requested AI-team spectator duel. Rebuilt as two Major pro teams with rating-driven AI params playing a real 5v5 bomb match.
- Medium: the spectator camera previously followed only one fighter / one team. Left-click now cycles all 10 live bots from both teams.
- Medium: coins had no history. Added localStorage history (last 10 duels) and a history list in the mode menu.
- High: the spectator player was still a real entity and was revived by the classic round spawner, allowing control in later rounds. Removed the human entity from game.entities entirely; the spectator object is never revived.
- Medium: every match felt identical. Added per-match tactical variants driven by each team's style plus strongly randomized AI parameters (reaction, spread, aim, rush/rotate, utility, peek, prefire, trade speed).
- Medium: cyber had no dedicated HUD. Added a cyber panel showing both team cards, score, kills, wallet, streak, odds and MVP.
- Medium: coins were not tracked as a long-term account. Added persistent stats (played/won/lost/net/current streak/best streak) and wallet migration.
- Medium: there was no starting balance or bankruptcy safety. Added a 1000 coin starting balance and automatic bankruptcy protection: balances below 100 are topped up to 500, with bailout count and total recorded in persistent stats.
- Low: duplicate team selections are normalized to the next roster team before match start.

## Remaining risks

- No browser-level visual verification was available in this session; rendering and menu flow were verified by code inspection, headless simulation, and syntax checks.
- External subagent/Codex CLI review still times out in this environment.
