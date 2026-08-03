# AI Tactics Layer

This layer adapts bot behavior to the official radar maps without changing official round timing or spawns.

## CT defense

- The map loader derives hold anchors from the T approach path at 120/220/340px from each bomb site.
- Anchors face the T spawn side, so defenders watch the enemy half instead of standing inside the site.
- The 5v5 CT shell is fixed as 2 A defenders, 2 B defenders, 1 mid roamer.
- Site anchors only chase sounds or shared intel near their own site. Cross-map retakes are triggered by a hot-site detector and keep at least one defender behind.
- Mid is the designated roamer; only it executes the CT push scout.

## T attack

- The default T shell is 3 main attackers, 1 opposite-site diverter, 1 mid.
- The C4 carrier is always forced into the main attack group.
- Main attackers gather at the map-derived entry point before executing; the diverter holds the other site until late round; mid controls the map mid point.
- This replaces the previous all-5-rush-one-site behavior that made every round look like a deathball.

## Map data

- Each official map now has per-site entries, hold anchors, anchor facing, and a mid control point derived from the high-res radar grid.
- The generator and preview remain at docs/OFFICIAL-MAPS.md and docs/map-preview.html.

## Known residual

- Bot-vs-bot win rates are still map-skewed (T-heavy on dust2/canal, CT-heavy on metro in diagnostics).
- This is AI retake/positioning work, not a round-timing or spawn change. The official round timings are untouched.


## Map AI calibration

- `MAP_AI` in src/config.js applies per-map CT/T spread multipliers. It models official map sidedness without changing round timing, spawns, or movement.
- CT mid no longer stands on the T mid funnel. It defaults near the CT spawn and only commits to a hot site or enemy intel, which removed the old "CT always loses the mid player in the first seconds" artifact.
- Hold anchor depths are now map-specific: dust2/canal use 100/190/300px, metro uses 140/260/380px so CT intercept earlier on the map where T reaches A fast.
- Stable 20-run bot-vs-bot diagnostics after these changes are roughly: dust2 ~70% T, canal ~63% T, metro ~51% T. This is closer to official tendencies but still map-skewed, so retake/positioning work remains on the roadmap.
