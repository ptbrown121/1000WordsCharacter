# Shadow Rules Change Note

This character manager now treats **The New Qi and Id test drive.pdf** as authoritative for Qi, Id, Shadow, and Aberration rules.

## What Changed

- Qi and Id are no longer stats. They do not appear in stat advancement, and stat XP is spent only on BODY, POWER, SOUL, FOCUS, MIND, and SPEED.
- Qi and Id are now tile boxes. A tile still has two boxes total, but either box may be a normal color, Qi, or Id.
- Each Qi or Id box costs 2 XP.
- Each Qi or Id box contributes 1 point to a chosen normal resource: Health, Energy, or Reflex.
- Each Qi or Id box also contributes 1 point to maximum Shadow.
- Buried tiles stop contributing normal resources and Shadow from Qi or Id boxes.
- Characters with no Qi or Id boxes continue to work as ordinary characters. Their Shadow max is 0 unless bonuses are manually entered.
- Current Shadow is exposed as a spendable resource. Shadow recovery is table-managed: half of max Shadow recovers at dawn, and the other half at dusk. Sleeping and waking may stand in when the table simulates dawn/dusk.
- Aberration is stored as a signed integer. Positive values are Rising/Risen direction; negative values are Falling/Fallen direction; 0 is Neutral.
- Alignment is computed as a set of possible states, so overlapping states such as Neutral Rising or Rising Falling can be shown.
- The pool validator rejects checks that mix Qi and Id tile use.
- When the app rolls or manually resolves a check using Qi tiles, Aberration moves +1. When it uses Id tiles, Aberration moves -1.
- Available Shadow abilities are computed from the current alignment state and displayed in the sheet.

## Old Behavior Removed

- Old Qi / Id stat advancement was removed.
- Old Black / White Shadow terminology was removed from the tile and spell UI.
- Old Light and Gloam Shadow tag behavior is no longer offered for new builds.
- Old Night behavior was replaced by the new Night tag: a tile with Id can gain Night, and each hour it gains 1 Falling rank up to max Shadow.
- Old slide, extra tile, burn/copy-impact style Shadow behavior is not implemented.

## Data Compatibility

- Ordinary older characters without Qi / Id data should load normally.
- Missing Shadow fields default safely: no Qi / Id boxes, Shadow current 0, Shadow max 0, and Aberration 0 / Neutral.
- Old Qi / Id stat fields are ignored and reset to the six ordinary stats.
- If old Qi / Id stat data is detected, the rules review panel shows:
  “This character used the old Qi / Id stat rules. The new rules remove those stats. Rebuild Shadow features using Qi / Id tile boxes.”
- Old Qi / Id stat data is not automatically converted into Qi / Id boxes.
- XP is not automatically refunded for old Qi / Id stats.

## New Shadow Tags

- Day: requires Qi. Each hour, gain 1 Rising rank, up to max Shadow.
- Night: requires Id. Each hour, gain 1 Falling rank, up to max Shadow.
- Dusk: requires Qi or Id. The bearer’s Rising range extends by 1 rank.
- Dawn: requires Qi or Id. The bearer’s Falling range extends by 1 rank.
- Terminator: requires Qi or Id. Each hour, Aberration loses 1 rank down to Neutral 0, and the bearer’s Neutral range extends by 1 rank.

The PDF visually shows `+2` near these tags. The app currently treats Day, Night, Dusk, Dawn, and Terminator as +2 XP tags.

## Open Shadow Rules Questions

- Whether a single tile may have both a Qi box and an Id box. The app can store two Shadow boxes, but a check using a tile with both Qi and Id currently fails the “Qi or Id, not both” validation because the app does not model choosing only one box from a tile for a check.
- Whether multiple Day or Night tags stack, or whether they only enable hourly drift once.
- Whether “Aberration rank” always means the absolute value of the signed Aberration score.
- Whether Dusk / Dawn / Terminator stack by tag count, tag rank, or both. The app currently stacks by active tag count.
- Whether the `+2` shown visually is universally the cost for Day, Night, Dusk, Dawn, and Terminator.
- Whether the example of a Fallen 8 character with two Dawn ranks accessing all ten abilities requires max Shadow to be very high, or whether Dawn is intended to shift access more aggressively than the diagram suggests.
- Whether boundary-modifying tags on buried tiles should still affect alignment. The app currently counts only active, unburied tiles for boundary tags.
