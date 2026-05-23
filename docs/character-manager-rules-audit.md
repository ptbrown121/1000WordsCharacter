# 1000 Words Character Manager Rules Audit

Audit date: 2026-05-23  
Rules reference: `/Users/ptbrown121/Downloads/1000_words_extracted_ruleset.pdf`, 1000 Words v5.01 extracted play rules  
Audit scope: documentation-only review of the current implementation. No runtime code, schemas, or UI behavior were changed.

## Executive Summary

The app is a strong lightweight character sheet and dice-pool helper, but it is not yet a complete v5.01 rules-enforcing character manager. It correctly implements several high-value foundations: die-step calculation, the core XP cascade for dice, exact two-color tiles, countable tag limits with several exemptions, localStorage persistence, import/export, Call/Burn/Chain dice-pool building, haywire detection, basic resource-pool calculation, and some post-roll assignment support.

The largest rules gaps are character creation limits and subsystem modeling. The app does not separate or enforce the starting 25 XP stat budget and 50 XP tile budget, does not enforce the starting tile cap of 3▟, has no Buried tile state, does not apply duplicate tag surcharges, and only partially models gear, armor, range, Arcana, Shadow/Qi/Id, Stranger, Cyber, ammo, and potion crafting.

Several features are implemented but likely rule-inaccurate or too hardcoded for the current ambiguity level. Most important: spell school colors in the Spell Builder do not match the PDF's Arcana skill colors, Hard armor discounts are only partially represented, Hard armor flaw rebates are not represented, and structural tags such as Range/Duration/Crit/Shield default to +2 XP rather than their table-specific costs.

Existing tests are useful and all pass (`npm test`: 104 passing), but they mostly validate the current chosen behavior. They do not yet cover starting character legality, Buried tiles, duplicate tag pricing, full gear/range/ammo/crafting behavior, or exotic system rules.

## Assumptions

- The PDF is treated as source of truth, including its "Open Questions / Ambiguities" section.
- "Implemented" means the current app enforces, calculates, or clearly supports the rule in user-facing behavior or pure rule helpers.
- "Out of scope" means the app currently appears not to attempt that subsystem. It is not necessarily a defect unless the intended product scope includes full automation.
- I treated the current "Burned" state as separate from the PDF's "Buried" state. The user request specifically calls out Buried tiles losing pool contributions.
- I used `pdftotext` only to read the PDF locally. The temporary text extract was removed after this audit.

## Project Architecture Summary

Framework and language:

- Plain static web app: HTML, CSS, and vanilla JavaScript ES modules.
- No runtime framework or build step.
- Node is used for development tests and lint only.

Storage model:

- Browser `localStorage`.
- Multi-character roster keys are managed by `DataManager`.
- Character data is exported/imported as JSON.
- Main character state shape includes `name`, global `xpEarned`, current/max resources, optional stat visibility, `stats`, `tiles`, and `journal`.

Test setup:

- `npm test` runs Node's built-in test runner over `test/**/*.test.js`.
- `npm run lint` uses ESLint.
- Existing pure logic tests cover `data.js`, `pool.js`, and `resolution-rules.js`.

Main files and responsibilities:

| Area | Files | Notes |
|---|---|---|
| App bootstrap | `js/app.js` | Creates `DataManager`, `PoolEngine`, `SpellBuilder`, initializes UI modules. |
| Character data and persistence | `js/data.js` | `STAT_COLORS`, `VALID_DICE`, default state, localStorage roster/state, import/export, tag normalization, resource max helper. |
| Core rules calculations | `js/pool.js` | Die steps, XP cascade, tag limit classification, tile XP estimation, resource maxes, Call/Burn/Chain pool compilation, rolls, haywire. |
| Post-roll support | `js/resolution-rules.js`, `js/ui/resolution.js` | Action/attack/defense/healing assignment modes, plus usage, tag bonus routing, healing targets. |
| Stats UI and XP tracking | `js/ui/stats.js` | Stat dice validation, optional Id/Qi toggle, global XP spent calculation. |
| Tile UI and validation | `js/ui/modals.js`, `js/ui/cards.js` | Tile CRUD, exactly two colors, tag builder, tag-limit enforcement, armor base fields, burn/unburn. |
| Resource UI | `js/ui/vitals.js` | Current resources, bonuses, Rest, Auto-Calculate Vitals. |
| Spell / Arcana helper | `js/spellBuilder.js` | Five-step spell wizard, spell XP estimate, spell tag limit, spell state persistence. |
| Roster and import/export | `js/ui/roster.js`, `js/data.js` | Character switching, new/delete, JSON import/export. |
| UI shell | `index.html`, `css/*` | Static layout, modal markup, form options. |

## Rules Coverage Checklist

### Character Stats

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| Six core stats with colors: BODY Red, POWER Orange, SOUL Yellow, FOCUS Green, MIND Blue, SPEED Purple | Implemented correctly | `STAT_COLORS` maps the six core stats correctly in `js/data.js`. |
| Optional Qi/Id stats with White/Black colors | Partially implemented | Optional Id/Qi fields and call colors exist, but advanced Shadow rules are mostly missing. |
| Die step notation d4=1▟, d6=2▟, d8=3▟, d10=4▟, d12=5▟ | Implemented correctly | `DIE_STEPS` includes these plus d3/d14/d16 in `js/pool.js`. |
| Stats start at free d3 | Partially implemented | XP formula treats d3 as free, but new character stat fields are blank rather than explicitly d3. |
| Starting stats have 25 XP budget | Missing | App has one global `xpEarned` defaulting to 75, no stat/tile budget split. |
| Stat advancement costs `{steps on advanced die} + {count of other dice}` | Implemented correctly | `calculateOptimalXpCost` matches the PDF examples and is tested. |
| Stat advancement requires a Story Point | Missing | No Story Point tracking or validation. |
| Qi/Id advancement spends XP to raise the higher of the pair | Missing | No coupled Qi/Id advancement logic. |

### Tiles

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| Tile has phrase/name, two stat colors, dice, tags, XP record | Implemented correctly | Tile form requires name, exactly two colors, dice, tags, and XP. |
| Tile types: Skill, Trait, Story, Gear | Implemented correctly | Tile type select includes all four. |
| Starting tiles budget is 50 XP | Missing | No separate tile budget or starting-character legality check. |
| Starting tile cannot begin above 3▟ | Missing | Form allows any valid dice combination, including d10/d12 or multi-dice totals over 3▟. |
| Ordinary d4 tile costs 1 XP | Partially implemented | Auto-estimator returns 1 for d4; manually entered XP can override without warning. |
| Arcana/Stranger/Cyber skill tiles cost +2 before d4 | Missing | No exotic skill tile type/cost baseline in normal tile modal. |
| Buried tile exists as separate state from Burned | Missing | Only `isBurnt` exists. |
| Buried tile cannot be called, has tags out of play, and loses pool contributions | Missing | `calculateResourceMaxes` includes every tile; `compilePool` only rejects `isBurnt`. |

### XP and Advancement

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| Core dice XP cascade | Implemented correctly | Formula and tests match PDF combo costs such as d6=3, d8=6, 2d6=8. |
| Global XP spent totals stats plus tile XP | Implemented correctly for current model | `updateXpTracker` sums stat cascade cost plus `tile.xpCost`. |
| Separate stat and tile budgets at character creation | Missing | No budget category tracking. |
| Duplicate tags cost +2 XP more than previous copy | Missing / likely incorrect | Normal tile UI blocks exact duplicate tags; spell builder permits duplicates but sums stored XP without surcharge. |
| Copying a tile costs same as original | Not applicable / missing | No copy-tile feature. |
| Ambiguous rules should be GM-facing/configurable | Missing | Hard armor discount/flaw rebate and duplicate spell logic are hardcoded or absent rather than configurable. |

### Tags

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| 1 countable tag per ▟ | Implemented correctly for recognized/exempt categories | `calculateTagLimit` uses die steps as the countable tag limit and blocks saves over limit. |
| Build, Detail, Crit, Shield, Cyber Build tags count | Partially implemented | Build-prefixed tags count; generic custom tags count. Plain `Cyber` is treated as exotic/exempt, while `Build: Cyber` counts. |
| Flaw, Range, Duration, and explicitly exotic tags do not count | Partially implemented | Heuristics exempt known flaws, Range/Duration prefixes, and known exotic tags. Coverage depends on tag spelling/prefix. |
| Tags are typed distinctly as Build, Detail, Crit, Shield, Flaw, Range/Duration, Exotic | Partially implemented | The persisted model stores strings only; classification is heuristic. |
| Common +▟ tags affect checks | Partially implemented | Expert, Keen, Sharp, Agile, Hidden, Ironclad, Rugged, Motorized are surfaced as selectable bonuses. Quick/Tough/Vital affect pools. Other tags are mostly descriptive. |
| Full Crit/Shield tag costs and effects | Partially implemented | Some crit XP costs are known; injury/status dashboard is limited. Shield blocking is not modeled. |
| Hitch up to 6 XP, costs 1 EN when called, cannot be burned, GM can force call | Implemented but likely incorrect / missing | Hitch is a known flaw and XP rebate, but normal estimator hardcodes `Hitch` at -3 and app does not enforce EN cost, no-burn, or GM force. |

### Resource Pools

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| HP = Red + Orange tile boxes | Implemented correctly | `RESOURCE_COLORS.hp = ['Red','Orange']`. |
| EN = Green + Yellow tile boxes | Implemented correctly | `RESOURCE_COLORS.en = ['Green','Yellow']`. |
| RX = Blue + Purple tile boxes | Implemented correctly | `RESOURCE_COLORS.rx = ['Blue','Purple']`; this matches the PDF's Quick/RF ambiguity resolution. |
| A tile counts once for each of its two color boxes and may add 2 to one pool | Implemented correctly | Iterates all color entries, including duplicate same-pool colors if present. |
| Tough/Vital/Quick add ▟ to HP/EN/RX | Implemented correctly for exact tags | Resource tags add the tile's die steps. |
| Buried tiles stop contributing to pools | Missing | No Buried state and no exclusion in resource calculation. |
| Shadow = total White/Black boxes | Implemented correctly for pool maximum | `sh` is calculated from Black/White tile boxes. |
| Bestial adds one extra point to one Resource per Bestial tile | Missing | No per-Bestial resource selection. |
| Cyber Core resource from Cyber tags | Missing | No Core resource pool. |

### Gear / Equipment

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| Armor material Soft +0, Hard +4 | Implemented correctly | Armor base XP table represented. |
| Armor coverage Open +0 soak 0, Full +2 soak +1, Closed +4 soak +3 | Implemented correctly | Armor coverage UI and XP/label match. |
| Hard armor Shield and Detail tags -1 XP; ambiguity around exact scope | Partially implemented / likely incomplete | Code discounts only known armor Detail tags; Shield tags are not discounted. PDF ambiguity should be GM-facing. |
| Hard armor Flaw tags become -3 XP | Missing | Normal flaws remain -2 except Hitch. |
| Armor tag restrictions by material/coverage | Missing | UI allows any tag on any armor. |
| Weapon categories, ranges, starting tags | Mostly missing | No weapon builder or automatic starting Detail tags/range categories. |
| Range/zone tags and costs | Partially implemented in spell builder only | Spell builder has range/area/volume/duration controls; normal gear has no range/zone model. |
| Range/Duration can be modified on the fly with unused dice | Missing | Post-roll UI has no range/duration assignment mode. |

### Actions / Combat Support

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| GM calls two colors; matching stat dice join pool | Implemented correctly | Call color selectors and `compilePool` add matching stat dice. |
| One Call tile must match at least one called color | Implemented correctly | `compilePool` validates call tile colors. |
| Burn tiles must share one selected Call color with the Call tile; each adds dice and +1 Add | Implemented correctly for selected tiles | `compilePool` validates shared selected color and increments Adds. |
| Burned tiles cannot be called or chained until recovery | Implemented correctly for `isBurnt` | `compilePool` rejects burnt call/chained/burn tiles. |
| Chain costs 4 XP and adds named tile plus Add | Partially implemented | Chain XP cost and pool effect implemented; not all chain constraints are modeled for Arcana spells. |
| Haywire when more than half dice are 1 | Implemented correctly | `calculateOptimalTotal` checks this and tests cover it. |
| Freebie dice once per test, duplicate existing die, Energy cost equals ▟ | Missing / manual only | Extra dice text field can represent freebies, but no once-per-test/cost/duplicate validation. |
| Attack assignment and impact | Partially implemented | Post-roll mode supports attack/impact buckets, but no full injury application. |
| Defense assignment, evasion, grit, soak | Partially implemented | Defense buckets and some soak bonus routing exist; no full hit/crit workflow. |
| Initiative, Press, movement, status at 0 resources | Mostly missing | No initiative tracker, press cost escalation, movement support, or automatic status enforcement. |
| Healing diagnosis and recovery targets | Partially implemented | Healing assignment targets exist; no full resource/crit state application. |

### Exotic Systems

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| Arcana skill tiles cost +2 before d4 | Missing | Spellcast skill checkbox does not add exotic skill base cost. |
| Arcana skill colors: Augur Blue/Orange, Forge Green/Red, Twist Yellow/Purple | Implemented but likely incorrect | Spell builder uses Augur Blue/Yellow, Forge Red/Orange, Twist Green/Purple. |
| Arcana skill supports up to ▟ spell tiles | Missing | No capacity enforcement. |
| Spell tile chains only to Arcana skill tile; chained skill reduces Test by ▟ | Partially implemented / likely incorrect | Spell builder can chain to any user-marked spellcast skill by name; no capacity/test reduction support. |
| Spell XP investment is Test to cast | Partially implemented | Spell XP is calculated and stored, but no casting test difficulty workflow. |
| Shadow/Qi/Id colors and Shadow pool | Partially implemented | Optional colors/stats and Shadow pool exist. |
| Qi/Id slide mechanics, aberration, casting rules, Shadow spending effects | Missing | No stat sliding or special casting behavior. |
| Stranger: Bestial/Celestial skill costs, tags, forms, While X burying | Mostly missing | Tags exist by string only; no form state or rank/resource effects. |
| Cyber: Cyber skill costs, Core, Core tags, cyber flaws | Mostly missing | Cyber tag exists but no Core resource or Core spending. |
| Gizmos, Slivers, Implants | Missing | Not modeled beyond possible custom tags. |

### Crafting / Ammo

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| Ammo tiles have no dice and target a tool | Missing | Tile form requires dice and has no ammo type/target model. |
| Ammo activation assigns a spare die; compare to Supply; fail buries/runs out | Missing | No ammo assignment or supply tracking. |
| Ammo replaces Reload flaw | Missing | Reload is not modeled as a stateful gear flaw. |
| Ammo Builder price/supply/lines/triggers | Missing | No builder. |
| Potion crafting: reagents, minimum Test, assigned dice, doses from impact | Missing | No potion/reagent workflow. |

### Persistence / Export / Import

| Rule / expected behavior | Current status | Evidence / notes |
|---|---|---|
| Persist character state locally | Implemented correctly | localStorage save/load with roster. |
| Export/import character JSON | Implemented correctly for current data model | Export/import exists and normalizes tag formats. |
| Migrate legacy saves | Partially implemented | Missing fields and legacy tags are handled; no rule-version marker. |
| Validate imported data against rule constraints | Missing | Import only checks for `stats` and `tiles`, then accepts values. |
| Preserve future rule ambiguity/settings | Missing | No rules-version/config section in saved state. |

## Findings Table

| Severity | Finding | Evidence | Rule reference | Recommendation |
|---|---|---|---|---|
| Critical | Starting character legality is not enforced: no 25 stat XP / 50 tile XP split and no 3▟ starting tile cap. | `DEFAULT_STATE.xpEarned = 75`; `updateXpTracker` only computes one total; tile save accepts any dice. | PDF §2 and §3: starting tiles cannot begin above 3▟; stats get 25 XP; tiles get 50 XP. | Add creation mode or validation report that separately totals stat XP and tile XP, warns/errors over budgets, and flags starting tiles over 3▟. |
| Critical | Buried tiles are not modeled, so lost/destroyed gear and While X downtime cannot remove tags or resource contributions. | Only `isBurnt` exists; `calculateResourceMaxes` includes all tiles; `compilePool` only rejects `isBurnt`. | PDF §4: while Buried, tags are out of play and resource-pool contributions are lost. | Add a separate `isBuried`/availability state and exclude Buried tiles from resource maxes, calls, chains, tag bonuses, and search/filter cues. |
| High | Duplicate tag pricing is not implemented. | Normal tile modal blocks exact duplicate strings; spell builder allows duplicate tag objects but just sums their stored XP. | PDF §4: each duplicate tag costs 2 XP more than the previous copy; ambiguity notes spell-builder example may differ. | Add duplicate-cost calculation with a GM setting for ordinary vs spell-specific behavior. |
| High | Arcana school colors in Spell Builder appear wrong. | `saveSpell` maps Twist to Green/Purple, Forge to Red/Orange, Augur to Blue/Yellow. | PDF §11.1: Augur is Blue/Orange, Forge is Green/Red, Twist is Yellow/Purple. | Correct mappings after confirming with creator; add tests. |
| High | Exotic skill tile base costs are absent. | Normal tile estimator has no Arcana/Stranger/Cyber skill mode adding +2 before d4. | PDF §4, §11.1, §11.3, §11.4: exotic skill tiles cost 2 XP before d4. | Add explicit exotic skill subtype or tag-cost mode. |
| High | Hard armor ambiguity is hardcoded rather than configurable, and Hard armor flaw rebates are missing. | Hard armor discounts only selected Detail tags by 1; flaws stay standard -2 except Hitch. | PDF §10 and §14: Hard armor Shield/Detail discount scope ambiguous; Hard armor F flaws use -3 per assumptions. | Represent armor discount/flaw-rebate policy as GM-facing configuration or at least document current policy in UI/reporting. |
| High | Structural tag XP costs are incomplete. | `classifyTagForXp` defaults `Build:`, `Detail:`, `Crit:`, `Shield:`, `Range:`, `Duration:` to +2. | PDF §6, §6.6, §10: many tags cost 0, 1, 2, 3, 4, negative, or table-derived. | Replace string fallback with a typed tag catalog and table-based XP calculation. |
| Medium | Resource pool calculation ignores Buried but also includes all tags regardless of availability. | `calculateResourceMaxes` iterates every tile and tag. | PDF §3/§4: pool adjusted when tiles gained/lost/Buried. | Filter only active tiles; add tests for Buried vs Burned behavior once scope is decided. |
| Medium | Hitch behavior is mostly missing. | XP estimator treats Hitch as -3; Burn UI allows burning Hitched tiles; no EN cost on call. | PDF §6.5: Hitch 1-6 XP, 1 EN when called, GM control, cannot be burned. | Model Hitch value and restrictions. |
| Medium | Gear/weapons/range are only lightly represented. | Armor base exists; no weapon builder, range category, starting weapon tags, Shield handling, or range/duration post-roll assignment. | PDF §10. | Add a weapon/armor builder after tag catalog work. |
| Medium | Freebie dice are manual and unchecked. | Extra dice input accepts any valid dice; no Energy/Shadow cost or duplicate-in-pool validation. | PDF §7 and §11.2. | Add Freebie control that derives legal dice and spends resource. |
| Medium | Cyber Core and Stranger/Celestial/Bestial effects are missing. | No Core state; exotic tags are plain strings. | PDF §11.3-§11.4. | Add subsystem state only if exotic systems are in app scope. |
| Low | Import accepts rule-invalid saves. | `importState` only checks `stats` and `tiles` presence. | App integrity concern, not a direct PDF rule. | Add non-destructive validation warnings on import. |
| Low | `d14` and `d16` are accepted although the main die-step table stops at d12. | `VALID_DICE` includes d14/d16. | PDF §2 table lists d4-d12, but later range/rank tables imply ranks beyond 5▟. | Confirm whether d14/d16 should stay as future-proof ranks. |

## Concrete Examples

1. A new character can spend all 75 displayed XP on stats or all on tiles without warning. The PDF splits creation into 25 stat XP and 50 tile XP.

2. A starting tile can be saved with `d10` (4▟) or `d6, d6` (4▟). The PDF says starting character tiles cannot begin with more than 3▟.

3. A Gear tile that should become Buried when destroyed has no app state for Buried. If represented as Burned, the app prevents calls but still counts the tile's resource boxes in Auto-Calculate Vitals.

4. A tile with `Keen` twice cannot be created through the normal tag UI because exact duplicates are blocked. A spell can hold duplicate tag objects, but two `Keen` entries cost 2 + 2 instead of 2 + 4.

5. A Hard Closed armor tile with `Old` should use the current PDF assumption of -3 XP for Hard armor F flaws, but the app applies the standard flaw rebate.

6. Spell Builder school colors conflict with the PDF. For example, Forge spells save as Red/Orange, while the PDF says Forge is Green/Red.

7. `Range: Short` on a normal Gear tile is exempt from tag limit, but the auto-estimator uses the default +2 XP rather than deriving the cost from the Space and Time table.

## Recommended Implementation Order

1. Add a read-only validation/reporting layer before changing save behavior. It should flag budget splits, starting tile overcap, duplicate tags, unknown tag categories, and unsupported subsystems.

2. Introduce a typed rules catalog for dice, tags, armor, range/duration, crits/shields, flaws, and exotic tags. Keep the current string tags for display/import compatibility, but calculate from structured metadata.

3. Split XP accounting into stat XP, tile XP, and total XP. Add creation-mode checks for 25/50 budgets and the 3▟ starting tile cap.

4. Add a distinct Buried state and active/inactive tile filtering for resource pools, calls, chains, tag bonuses, ammo/reagent depletion, and While X.

5. Fix Arcana color mappings and add Arcana spell capacity/test-difficulty logic after confirming the PDF with the creator.

6. Add GM-facing settings for known ambiguities: duplicate spell tag pricing, Hard armor discount scope, Hard armor flaw rebate behavior, Cyber tag cost, Ambush Build/Detail, and Tire outside Arcana.

7. Expand gear support: weapon category/range, starting Detail tags, armor restrictions, Shield/Crit interactions, Reload/Ammo replacement, and range/duration on-the-fly assignment.

8. Add exotic subsystem modules only after the core catalog is stable: Shadow/Qi/Id slide rules, Stranger form/Buried states, Bestial/Celestial rank effects, Cyber Core and Core tags.

9. Add ammo and potion/reagent workflows last, since they depend on Buried state, spare-die assignment, typed tags, and gear targeting.

## Recommended Test Plan

Existing test coverage:

- `test/pool.test.js`: die steps, dice parsing, tag limit classification, XP cascade, tile XP estimator, resource maxes, Call/Burn/Chain pool compilation, haywire, HTML escaping, tag helpers.
- `test/resolution-rules.test.js`: post-roll assignment modes, plus usage, tag bonus routing, healing assignments.
- `test/data.test.js`: resource max helper and tile tag normalization/migration.

Recommended missing tests:

| Test name | Expected outcome |
|---|---|
| `calculateCreationBudget_separates_stat_and_tile_xp` | Stats and tiles are reported separately; 26 stat XP is over budget even if total XP <= 75. |
| `validateStartingTile_rejects_more_than_3_steps` | `d8` passes; `d10`, `d6,d6`, and `d8,d4` fail for starting characters. |
| `calculateOptimalXpCost_matches_pdf_combo_table` | Cover all PDF examples: d4+d10=12, d6+d8=11, d6+d10=15. |
| `calculateDuplicateTagXp_increases_each_copy_by_2` | Three `Keen` tags cost 2, 4, 6; total 12 before dice. |
| `calculateDuplicateTagXp_uses_spell_ambiguity_setting` | With spell duplicate mode enabled, duplicate surcharge follows the configured GM choice. |
| `calculateTagLimit_exempts_range_duration_flaw_exotic_but_counts_cyber_build` | `Range: Short`, `Duration: Instant`, `Old`, `Bestial` exempt; `Build: Cyber` counts. |
| `estimateRangeDurationXp_uses_space_time_table` | Touch = -2, Short = 2, Blast = 4, 1 hour = 3, and combined spell metrics sum correctly. |
| `estimateHardArmorXp_applies_configured_discount_scope` | Detail-only, Shield+Detail, and GM-selected scopes produce expected totals. |
| `estimateHardArmorFlawXp_rebates_minus3_for_F_flaws` | Hard armor with `Old` applies -3 under the PDF assumption; non-hard remains -2. |
| `calculateResourceMaxes_excludes_buried_tiles` | Buried Red/Orange tile contributes 0 HP; unburied contributes normally. |
| `compilePool_rejects_buried_call_chain_and_burn_tiles` | Buried tiles cannot be called, chained, or burned. |
| `compilePool_allows_burned_tiles_to_stop_calls_without_removing_pool_max` | Clarifies Burned vs Buried resource behavior based on GM decision. |
| `spellBuilder_schoolColors_match_arcana_pdf` | Augur saves Blue/Orange, Forge Green/Red, Twist Yellow/Purple. |
| `spellBuilder_enforces_arcana_skill_capacity` | An Arcana skill with 2▟ supports at most two chained spell tiles. |
| `shadowPool_counts_black_white_active_tiles_only` | Black/White boxes on Buried tiles do not count. |
| `qiIdAdvancement_costs_raise_higher_pair` | Raising the lower stat below the higher still prices against the higher-pair rule. |
| `hitchTile_cannot_be_burned_and_costs_energy_on_call` | Hitched tile burn is rejected and call emits/charges 1 EN. |
| `freebieDice_must_duplicate_pool_die_and_spend_resource` | `d8` freebie is legal only if `d8` exists in pool and enough EN/SH is available. |
| `ammoTile_has_no_dice_and_buries_on_supply_failure` | Ammo with assigned die below Supply becomes Buried/runs out. |
| `importState_reports_rule_invalid_tiles_without_crashing` | Import succeeds with warnings for invalid dice/tags/budgets. |

## Questions for the User / Creator

1. Should the app enforce creation budgets immediately, or show a non-blocking "rules audit" panel while the game is still changing?

2. Should Burned tiles temporarily lose resource-pool contributions, or only Buried tiles? The PDF explicitly says Buried loses pool contributions; Burned is "out of play" but the user request highlights Buried.

3. For Hard armor, which discount policy should the app expose as default: Detail only, Shield + Detail, Build + Shield from the example, or a broader GM-configurable table?

4. Should Hard armor F flaws always rebate -3 XP under the current working assumption, and should that apply to only armor-specific F flaws or all F flaws placed on armor?

5. How should duplicate tag pricing work for spells? The PDF ambiguity says ordinary advancement and spell-builder examples may differ.

6. Should plain `Cyber` on a non-skill tile cost +2, +4, or depend on whether it is an Exotic tag vs a Cyber Build tag?

7. Should d14/d16 remain legal in the app? The current app supports them, but the main die-step table in the PDF only lists through d12.

8. Are ammo, potion crafting, full combat status, and exotic systems intended to be first-class app workflows, or should they remain manually tracked notes/tags for now?

9. Should imported JSON be strictly rejected when it violates the rules, or imported with warnings so older/future characters remain recoverable?

10. Should the app store a rules version and GM settings block in each character export, so future v5.01-to-later migrations can be explicit?
