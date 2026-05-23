# 1000 Words Character Manager Rules Audit

Audit date: 2026-05-23  
Rules reference: `1000_words_extracted_ruleset.pdf`, 1000 Words v5.01
Scope: current vanilla JavaScript web app in this repository.

## Executive Summary

The app is now a strong rules-assisted character manager for the core sheet loop: stats, tiles, XP estimation, tag limits, resource pools, Call/Burn/Chain dice pools, Buried tiles, weapon templates, armor bases, ammo tracking, and guided spell creation.

The app intentionally remains permissive. Starting XP split checks and the 3▟ starting tile cap are treated as GM review notes, not hard blockers. A sheet-wide **GM reviewed** override now quiets the review strip for tables that have already approved a character.

The largest remaining gaps are still the deep subsystem workflows: complete Arcana casting difficulty, Shadow/Qi/Id stat sliding, Stranger form state, Cyber Core spends, full crafting/potion procedures, and automatic combat/status application. These are best added incrementally as opt-in assistants rather than strict validation until the rules stabilize.

## Project Architecture Summary

| Area | Main files | Current role |
| --- | --- | --- |
| App shell | `index.html`, `css/*.css`, `js/app.js` | Static browser app; no build step; localStorage persistence. |
| Character state | `js/data.js` | Default state, roster, import/export, save migration, tile normalization, ammo/exotic metadata normalization. |
| Rules engine | `js/pool.js` | Die steps, XP cascade, tag classification, duplicate tag pricing, resource maxes, Call/Burn/Chain pool compilation, weapon templates, Hitch helpers, exotic skill base XP. |
| Rules review | `js/rules-review.js`, `js/ui/rulesReview.js` | Non-blocking sheet review notes, GM override display. |
| Tile UI | `js/ui/modals.js`, `js/ui/cards.js` | Tile CRUD, tags, gear subtypes, weapon/ammo/armor builders, Buried/Burned controls, exotic skill metadata. |
| Dice and resolution | `js/ui/pool.js`, `js/resolution-rules.js`, `js/ui/resolution.js` | Pool preview, rolls/manual entry, post-roll assignment, attack/defense/healing summaries, ammo resolution. |
| Spell builder | `js/spellBuilder.js` | Arcana-style spell Gear creation, spell colors, XP calculation, Chain tags, persisted spell wizard state. |
| Tests | `test/*.test.js` | Node test runner coverage for data normalization, rules calculations, resolution helpers, and review notes. |

## Rules Coverage Checklist

### Character Stats

| Rule | Status | Notes |
| --- | --- | --- |
| d3 is free; die advancement uses `{steps} + {other dice}` | Implemented correctly | Shared cascade in `PoolEngine.calculateOptimalXpCost`. |
| Starting 25 XP stat budget | GM review only | Review strip can flag over-starting split; not enforced by design. |
| Story Point required for stat advancement | Missing | No Story Point tracker yet. |
| Optional Qi/Id stats | Partially implemented | Fields and Shadow color support exist; slide/aberration rules are not automated. |

### Tiles

| Rule | Status | Notes |
| --- | --- | --- |
| Tiles have two stat colors | Implemented correctly | Ammo may have no colors. |
| Starting tiles capped at 3▟ | GM review only | Review strip flags high dice as a quiet GM note. |
| Buried tiles unavailable and lose pool contributions | Implemented correctly | Buried tiles cannot be called/burned and are excluded from HP/EN/RX/SH maxes. |
| Call/Burn/Chain pool building | Partially implemented | Core flow works; special subsystem calls remain manual. |

### XP and Advancement

| Rule | Status | Notes |
| --- | --- | --- |
| Tile dice XP cascade | Implemented correctly | Tests cover mixed dice and duplicate dice. |
| Duplicate tags cost +2 more per copy | Implemented correctly | Applies to positive and negative tags. |
| Stored XP can differ from estimate | Partially implemented | Allowed, but now surfaced in rules review. |
| Arcana/Bestial/Celestial/Cyber skill base +2 XP | Implemented | Exotic skill metadata adds the base XP to estimates. |

### Tags

| Rule | Status | Notes |
| --- | --- | --- |
| Countable tags limited to 1 per ▟ | Implemented | Build/Detail/Crit/Shield count; known Flaw/Range/Duration/Exotic tags are exempt. |
| GM tag exemption | Implemented | Per-tag `(Exempt)` and sheet-wide GM reviewed quiet mode. |
| Hitch pricing | Implemented | `Hitch N` supports 1-6; plain Hitch defaults to 3. |
| Hitch behavior | Implemented | Hitched tiles cannot be burned; calling/chaining one prompts for 1 EN. GM-forced calls remain table-managed. |

### Resource Pools

| Rule | Status | Notes |
| --- | --- | --- |
| HP = Red + Orange boxes; EN = Green + Yellow; RX = Blue + Purple | Implemented correctly | Resource tags add die steps. |
| SH from Black/White boxes | Implemented | Optional Shadow pool is supported. |
| Core resource | Missing | Cyber metadata exists, but Core pool/spends are not modeled yet. |

### Gear and Equipment

| Rule | Status | Notes |
| --- | --- | --- |
| Weapon templates, ranges, skills, starting tags | Implemented | Includes Far +2 surcharge. |
| Ammo can be linked/unlinked/reassigned | Implemented | Ammo cards show supply and linked weapon. |
| Ammo activation via spare die vs Supply | Partially implemented | Post-roll ammo assignment can retain or bury ammo. It also decrements current supply for the app’s stock tracker. |
| Armor material/coverage base | Implemented | Soft/Hard and Open/Full/Closed with base soak display. |
| Hard armor assumptions | Partially implemented | Current assumption: Hard discounts Detail/Shield by 1 and F flaws by another -1. Ambiguity remains. |
| Full armor restrictions/effects | Missing | Tag restrictions, soak application, Break/crit automation are not complete. |

### Actions and Combat Support

| Rule | Status | Notes |
| --- | --- | --- |
| Action/attack/defense/healing dice assignment | Partially implemented | Good summary helper, but no automatic resource/status mutation except ammo/Hitch helpers. |
| Freebie dice | Partially implemented | Extra dice are manual; EN/SH spend, duplication, and once-per-test limits are not automated. |
| Range/Duration post-roll extension | Missing | No spare-die Range/Duration workflow yet. |
| Initiative/Press/movement | Mostly missing | Not first-class app workflows. |

### Exotic Systems

| Rule | Status | Notes |
| --- | --- | --- |
| Arcana skill metadata and +2 base cost | Implemented | Arcana Twist/Forge/Augur metadata available on Skill tiles. |
| Arcana spell capacity | Partially implemented | Review strip flags chained spell count over Arcana skill ▟. |
| Arcana cast Test and chained skill reduction | Missing | Spell XP is stored, but cast difficulty workflow is not automated. |
| Shadow/Qi/Id casting and slide rules | Missing | Optional stats/pool only. |
| Stranger Bestial/Celestial metadata | Partially implemented | +2 base metadata exists; forms, While X, rank effects are manual. |
| Cyber metadata | Partially implemented | +2 base metadata exists; Core and Core tags are manual. |

### Crafting and Ammo

| Rule | Status | Notes |
| --- | --- | --- |
| Ammo tiles are dice-less Gear | Implemented | No pool contribution and cannot be called. |
| Ammo resolution | Partially implemented | Assign die after roll; fail buries/runs out. Multi-line ammo effects remain manual. |
| Potion/reagent crafting | Missing | No dedicated workflow for reagent XP, Test, doses, or reagent depletion. |

### Persistence / Export / Import

| Rule | Status | Notes |
| --- | --- | --- |
| Local save and roster | Implemented | localStorage with migration. |
| JSON export/import | Implemented | Imports normalize legacy tags, ammo, buried state, and exotic metadata. |
| Strict import validation | Missing | Invalid imports are accepted if structurally recognizable; rules review surfaces issues afterward. |
| Rules ambiguity settings | Partially implemented | Sheet-wide GM reviewed override exists; Hard armor and other ambiguity policies are still hardcoded assumptions. |

## Findings Table

| Severity | Finding | Current behavior | Recommendation |
| --- | --- | --- | --- |
| High | Arcana casting is still incomplete | Spells can be built and chained, but Test-to-cast and chain reduction are not automated. | Add a spell casting panel that computes Test = spell XP - chained Arcana ▟, with Shadow/Qi/Id hooks later. |
| High | Shadow/Qi/Id, Stranger, and Cyber are metadata-first | App tracks optional stats and exotic skill type, but not subsystem procedures. | Add subsystem panels only after rules are confirmed. Start with Cyber Core because it is a concrete resource pool. |
| Medium | Ammo resolution is partial | Assign die vs Supply and bury/run-out is supported; ammo line effects are manual. | Add structured ammo effect lines after tag/effect catalog is more stable. |
| Medium | Freebie dice are manual | Extra Dice field accepts dice but does not enforce duplication, cost, or once-per-test. | Add a Freebie helper beside Extra Dice. |
| Medium | Armor restrictions and effects are incomplete | Base armor and cost assumptions exist; full restrictions/effects are not enforced. | Add armor review warnings before hard enforcement. |
| Medium | Range/Duration extension is missing | No spare-die post-roll workflow. | Add a small resolution panel similar to ammo resolution. |
| Low | Creation budgets/caps are advisory | Review notes only; GM reviewed quiets them. | Keep advisory unless the table wants character creation mode. |
| Low | Rules ambiguities are not fully configurable | Hard armor policy is hardcoded to the current assumption. | Add a rules settings panel if creator clarification diverges. |

## Concrete Examples

- A Cyber skill with `d4` and no tags now estimates as `3 XP`: `1` for d4 plus `2` exotic skill base. Earlier versions estimated `1 XP`.
- A tile with `Hitch 5` refunds `5 XP`, cannot be burned, and prompts for `1 EN` when called.
- A weapon with linked ammo can roll normally, then assign a rolled die to ammo resolution. If the assigned die is below Supply, the ammo tile is buried and current supply drops to `0`.
- A starting character with 30 stat XP and 55 tile XP is not blocked; the review strip flags it as a GM review note, and the sheet-wide GM reviewed checkbox quiets the warning.

## Recommended Implementation Order

1. Add a Freebie dice helper with EN/SH cost tracking and once-per-test warnings.
2. Add Range/Duration post-roll extension using the same assignment pattern as ammo.
3. Add Arcana cast resolution: spell Test, Arcana chain reduction, Shadow spend modifiers.
4. Add Cyber Core as a first-class resource with Cyber tag spend actions.
5. Add structured ammo/reagent effect lines and potion crafting.
6. Add configurable rules assumptions for Hard armor and duplicate spell-tag ambiguity after creator feedback.

## Recommended Test Plan

| Test name | Expected outcome |
| --- | --- |
| `estimateTileXp_adds_exotic_skill_base_xp` | Arcana/Cyber/Stranger skill metadata adds +2 before d4. |
| `compilePool_hitch_call_costs_energy` | Calling a Hitched tile returns a 1 EN resource cost. |
| `compilePool_hitched_burn_rejected` | Hitched tiles cannot be burn tiles. |
| `rulesReview_quiets_notes_with_gm_override` | GM reviewed mode renders a lower-emphasis summary. |
| `ammoResolution_failed_supply_buries_tile` | Assigned die below Supply buries ammo and clears current supply. |
| `ammoResolution_success_retains_tile` | Assigned die at/above Supply leaves ammo unburied and decrements current supply. |
| `arcanaCapacity_flags_over_capacity_spells` | More chained spells than Arcana skill ▟ creates a review note. |
| `importState_normalizes_exotic_skill_metadata` | Legacy string/object exotic metadata imports to canonical shape. |

## Open Questions

1. Should the app continue accepting `d14` and `d16`, or should those be hidden until the creator confirms post-d12 progression?
2. Should Hard armor’s discount apply only to Detail/Shield and F flaws, or should it also affect any Build/Cyber interactions?
3. For ammo, should the app’s current/max supply remain a stock counter, or should it be renamed so `Supply` is clearly the PDF threshold?
4. Should spells created by the Spell Builder be required to chain to a specific Arcana skill, or is school-name fallback acceptable for looser tables?
5. Should Story Points be tracked as a resource for stat advancement and Hitch buyoff, or left to journal notes?
