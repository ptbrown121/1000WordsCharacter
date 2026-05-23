import { STAT_COLORS, VALID_DICE } from './data.js';

// ---------------------------------------------------------------------------
// Shared helpers (used by app.js and spellBuilder.js).
// Kept here so the rules engine, UI, and spell wizard agree on a single
// definition. See review item #2.
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe insertion into HTML text or attribute contexts.
 * Handles both: encodes &, <, >, " and '. User-controlled fields (tile.name,
 * tile.tags, tile.description, journal entries, imported JSON, etc.) MUST be
 * passed through this before being interpolated into innerHTML.
 */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Parse a comma-separated dice string ("d6, d8") into a list of valid dice
 * tokens and a list of invalid tokens. Empty input returns empty lists.
 */
export function parseDiceInput(str) {
    if (!str || !str.trim()) return { dice: [], invalid: [] };

    const tokens = str
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

    return {
        dice: tokens.filter(die => VALID_DICE.has(die)),
        invalid: tokens.filter(die => !VALID_DICE.has(die))
    };
}

export function parseDiceString(str) {
    return parseDiceInput(str).dice;
}

/**
 * Normalize a tile's `tags` field into a clean string[] regardless of how it
 * is stored. The current storage format is an array of strings, but legacy
 * saves and the existing pool.test.js fixtures store it as a comma-separated
 * string, so this helper accepts both. Returns a fresh array (callers may
 * mutate / map without surprising side effects on the tile).
 *
 * Object-shaped tags (e.g. SpellBuilder's `{name, xp}` items) are flattened
 * to their `name` so downstream rule logic can treat them uniformly.
 */
export function tileTagList(tile) {
    if (!tile) return [];
    const raw = tile.tags;
    if (raw == null || raw === '') return [];

    const items = Array.isArray(raw) ? raw : String(raw).split(',');
    return items
        .map(item => {
            if (item && typeof item === 'object') return String(item.name || '').trim();
            return String(item || '').trim();
        })
        .filter(Boolean);
}

export function getDiceValidationMessage(label = 'Dice') {
    return `${label} must use only: d3, d4, d6, d8, d10, d12, d14, or d16.`;
}

export function summarizeTagLimitExemptions(tagLimit) {
    const exemptNames = tagLimit.exemptTags.map(tag => tag.name).filter(Boolean);
    if (exemptNames.length === 0) return '';

    const visibleNames = exemptNames.slice(0, 3).join(', ');
    const remaining = exemptNames.length > 3 ? ` +${exemptNames.length - 3} more` : '';
    return ` Exempt: ${visibleNames}${remaining}.`;
}

export function formatTagLimitStatus(tagLimit) {
    const exemptText = summarizeTagLimitExemptions(tagLimit);
    if (tagLimit.valid) {
        return `Tag limit: ${tagLimit.count}/${tagLimit.limit} countable tags.${exemptText}`;
    }

    return `Too many countable tags: ${tagLimit.count}/${tagLimit.limit}. Remove ${tagLimit.overage} or increase dice.${exemptText}`;
}

export function tagLimitErrorMessage(subject, tagLimit) {
    const countableNames = tagLimit.countableTags.map(tag => tag.name).filter(Boolean).join(', ');
    const tagsText = countableNames ? ` Countable tags: ${countableNames}.` : '';
    return `${subject} has ${tagLimit.count} countable tags, but its dice allow ${tagLimit.limit}. Remove ${tagLimit.overage} countable tag${tagLimit.overage === 1 ? '' : 's'} or increase its dice.${tagsText}`;
}

const CONTEXTUAL_TAG_BONUSES = {
    expert: { name: 'Expert', context: 'action check', description: '+▟ to action checks using this tile' },
    keen: { name: 'Keen', context: 'attack', description: '+▟ to attacks using this tile' },
    sharp: { name: 'Sharp', context: 'damage / impact', description: '+▟ to damage or impact' },
    agile: { name: 'Agile', context: 'evasion', description: '+▟ to evasion' },
    hidden: { name: 'Hidden', context: 'vs detection', description: '+▟ against detection' },
    ironclad: { name: 'Ironclad', context: 'soak', description: '+▟ to soak' },
    rugged: { name: 'Rugged', context: 'grit', description: '+▟ to grit' }
};

const RESOURCE_COLORS = {
    hp: ['Red', 'Orange'],
    en: ['Green', 'Yellow'],
    rx: ['Blue', 'Purple'],
    sh: ['Black', 'White']
};

const RESOURCE_TAGS = {
    tough: 'hp',
    vital: 'en',
    quick: 'rx'
};

const FLAW_TAGS = new Set(['old', 'primitive', 'rare', 'risky', 'worn', 'hitch', 'bulky', 'heavy']);
const EXOTIC_TAGS = new Set(['bestial', 'celestial', 'cyber']);

// Armor base XP (page 29): material + coverage. Hard armor discounts Detail tags by 1 XP.
const ARMOR_MATERIAL_XP = { Soft: 0, Hard: 4 };
const ARMOR_COVERAGE_XP = { Open: 0, Full: 2, Closed: 4 };
const ARMOR_DETAIL_TAGS = new Set([
    'quick', 'tough', 'vital', 'motorized',
    'agile', 'hidden', 'ironclad', 'loose', 'rugged', 'sealed',
    'adamant'
]);

const DIE_STEPS = {
    d3: 0,
    d4: 1,
    d6: 2,
    d8: 3,
    d10: 4,
    d12: 5,
    d14: 6,
    d16: 7
};

function normalizeMechanicalTag(tag) {
    return String(tag || '')
        .replace(/^(build|detail|shield)\s*:\s*/i, '')
        .trim()
        .toLowerCase();
}

function getTagName(tag) {
    if (tag && typeof tag === 'object') return tag.name || '';
    return String(tag || '');
}

function normalizeTagForLimit(tag) {
    return String(tag || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

export class PoolEngine {
    constructor() {
        this.baseKeeps = 2;
    }

    calculateSteps(diceArray) {
        return diceArray.reduce((steps, die) => steps + (DIE_STEPS[die] || 0), 0);
    }

    classifyTagForLimit(tag) {
        const name = getTagName(tag);
        const normalized = normalizeTagForLimit(name);
        const withoutPrefix = normalizeTagForLimit(normalized.replace(/^(detail|shield|crit)\s*:\s*/i, ''));
        const hasBuildPrefix = /^build\s*:/i.test(normalized);

        if (!normalized) {
            return { name, counts: false, reason: 'blank' };
        }

        if (hasBuildPrefix) {
            return { name, counts: true, reason: 'Build tags count' };
        }

        if (/^(range|duration)\s*:/i.test(normalized) || /^(range|duration)\s*:/i.test(withoutPrefix)) {
            return { name, counts: false, reason: 'Range/Duration tags do not count' };
        }

        if (withoutPrefix.includes('flaw') || FLAW_TAGS.has(withoutPrefix) || withoutPrefix.startsWith('hitch')) {
            return { name, counts: false, reason: 'Flaw tags do not count' };
        }

        if (withoutPrefix.includes('(exempt)') || withoutPrefix.includes('exempt')) {
            return { name, counts: false, reason: 'GM Exception' };
        }

        if (withoutPrefix.includes('exotic') || EXOTIC_TAGS.has(withoutPrefix)) {
            return { name, counts: false, reason: 'Exotic tags do not count' };
        }

        return { name, counts: true, reason: 'Counts against tag limit' };
    }

    calculateTagLimit(diceArray, tagsArray = []) {
        const limit = this.calculateSteps(diceArray);
        const details = tagsArray.map(tag => this.classifyTagForLimit(tag));
        const countableTags = details.filter(tag => tag.counts);
        const exemptTags = details.filter(tag => !tag.counts && tag.reason !== 'blank');
        const count = countableTags.length;

        return {
            limit,
            count,
            overage: Math.max(0, count - limit),
            valid: count <= limit,
            countableTags,
            exemptTags,
            details
        };
    }

    parseDiceString(str) {
        if (!str) return [];
        return str
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(die => VALID_DICE.has(die));
    }

    /**
     * XP cascade (rulebook "System Concept-Dice" chart). Each character starts
     * with a free d3 in every stat. Past d3, each advance costs:
     *
     *     XP = {steps on the advanced die} + {count of other dice already on
     *          this stat or tile}
     *
     * Worked example (2x d6):
     *   - Add 1st d4:           1 + 0 = 1
     *   - Promote d4 -> d6:     2 + 0 = 2   (subtotal 3 for the first d6)
     *   - Add 2nd d4:           1 + 1 = 2
     *   - Promote that d4 -> d6: 2 + 1 = 3   (subtotal 5 for the second d6)
     *   - Total: 8
     *
     * d3s are skipped (free) and do NOT contribute to {count of other dice}.
     * The optimal path always promotes the highest-rank die first; we sort
     * descending so the cheaper dice pay the higher "other dice" surcharge.
     *
     * Used for both stat XP (ui/stats.js updateXpTracker) and tile XP
     * (estimateTileXp). One formula, one source of truth.
     */
    calculateOptimalXpCost(diceArray) {
        const sortedDice = [...diceArray].sort((a,b) => (DIE_STEPS[b] || 0) - (DIE_STEPS[a] || 0));

        let totalXp = 0;
        let existingDiceCount = 0;

        for (const die of sortedDice) {
            const targetSteps = DIE_STEPS[die] || 0;
            if (targetSteps === 0) continue;

            // Add a d4
            totalXp += 1 + existingDiceCount;

            // Upgrade it to its target rank
            for (let s = 2; s <= targetSteps; s++) {
                totalXp += s + existingDiceCount;
            }

            existingDiceCount++;
        }
        return totalXp;
    }

    estimateTileXp(diceArray, tagsArray, armorType = null) {
        let xp = this.calculateOptimalXpCost(diceArray);
        const isHardArmor = Boolean(armorType) && armorType.material === 'Hard';

        // Tag modifiers
        tagsArray.forEach(tag => {
            const t = tag.toLowerCase().replace(' (exempt)', '');
            if (t.startsWith('chain ')) {
                xp += 4;
            } else if (t.startsWith('hitch')) {
                // Hitch can give up to 6 XP, default guess -3
                xp -= 3;
            } else if (FLAW_TAGS.has(t)) {
                // Flaw tags refund 2 XP (old, primitive, rare, risky, worn, bulky, heavy)
                xp -= 2;
            } else if (['slow', 'pain'].includes(t)) {
                xp += 3;
            } else if (['bleed', 'wound'].includes(t)) {
                xp += 4;
            } else if (['expert', 'keen', 'sharp', 'agile', 'hidden', 'ironclad', 'rugged', 'quick', 'tough', 'vital', 'nimble', 'down', 'jolt'].includes(t)) {
                xp += 2;
            } else {
                // generic tag guess
                xp += 2;
            }

            // Hard armor makes Detail tags cost 1 XP less.
            // Motorized may carry a ": STAT" suffix, so match its base word too.
            if (isHardArmor && (ARMOR_DETAIL_TAGS.has(t) || t.startsWith('motorized'))) {
                xp -= 1;
            }
        });

        // Armor base cost: material + coverage.
        if (armorType) {
            xp += (ARMOR_MATERIAL_XP[armorType.material] || 0) + (ARMOR_COVERAGE_XP[armorType.coverage] || 0);
        }

        return Math.max(0, xp);
    }

    calculateResourceMaxes(tiles = []) {
        const maxes = { hp: 0, en: 0, rx: 0, sh: 0 };

        tiles.forEach(tile => {
            const colors = tile.colors || [];
            Object.entries(RESOURCE_COLORS).forEach(([resource, resourceColors]) => {
                colors.forEach(color => {
                    if (resourceColors.includes(color)) maxes[resource] += 1;
                });
            });

            const tileSteps = this.calculateSteps(tile.dice || []);
            const tags = tileTagList(tile).map(normalizeMechanicalTag);
            tags.forEach(tag => {
                const resource = RESOURCE_TAGS[tag];
                if (resource) maxes[resource] += tileSteps;
            });
        });

        return maxes;
    }

    calculateShadowMax(statsOrTiles, maybeTiles) {
        const tiles = Array.isArray(statsOrTiles) ? statsOrTiles : (maybeTiles || []);
        return this.calculateResourceMaxes(tiles).sh;
    }

    /**
     * Compiles the dice pool based on selected colors and tiles.
     * @param {Array<string>} callColors 
     * @param {Object} stats 
     * @param {Object} callTile 
     * @param {Array<Object>} burnTiles 
     * @param {Array<Object>} allTiles 
     * @param {Array<string>} extraDice
     * @param {Object} options
     * @returns {Object} { dice: Array, adds: number, flatBonus: number, tagBonuses: Array, chainOptions: Array, error: string }
     */
    compilePool(callColors, stats, callTile, burnTiles, allTiles, extraDice = [], options = {}) {
        let pool = [];
        let adds = 2; // Base keep is 2;
        let flatBonus = 0;
        let tagBonuses = [];
        let chainOptions = [];
        let error = null;
        const activeCallColors = [...new Set(callColors.filter(Boolean))];
        const disabledChainIds = options.disabledChainIds || new Set();
        const isChainDisabled = (chainId) => {
            if (disabledChainIds instanceof Set) return disabledChainIds.has(chainId);
            if (Array.isArray(disabledChainIds)) return disabledChainIds.includes(chainId);
            return false;
        };

        if (activeCallColors.length === 0) {
            return { dice: pool, adds, flatBonus, tagBonuses, chainOptions, error: "Select at least 1 color for the Call." };
        }

        const getSharedCallColors = (...tiles) => {
            if (tiles.some(tile => !tile)) return [];

            return activeCallColors.filter(color =>
                tiles.every(tile => (tile.colors || []).includes(color))
            );
        };

        const hasSharedCallColor = (...tiles) => getSharedCallColors(...tiles).length > 0;

        // 1. Add Stat Dice matching the Call Colors
        activeCallColors.forEach(color => {
            if (!color) return;
            // Find stats matching this color
            for (const [stat, statColor] of Object.entries(STAT_COLORS)) {
                if (statColor === color) {
                    const diceString = stats[stat];
                    if (diceString) {
                        const parsed = this.parseDiceString(diceString);
                        parsed.forEach(die => {
                            pool.push({ source: `Stat (${stat})`, die });
                        });
                    }
                }
            }
        });

        // Recursive resolution for call tiles and chains
        const resolveTile = (tile, isCallTile, visitedIds) => {
            if (!tile || visitedIds.has(tile.id)) return;
            visitedIds.add(tile.id);

            if (tile.isBurnt) {
                error = `Tile '${tile.name}' is burnt and cannot be called.`;
                return;
            }
            
            // Color check
            const matchesCall = activeCallColors.some(c => tile.colors.includes(c));
            if (!matchesCall) {
                if (isCallTile) {
                    error = `Call Tile '${tile.name}' does not match any Call Colors.`;
                } else {
                    error = `Chained Tile '${tile.name}' does not match any Call Colors.`;
                }
                return;
            }

            // Add tile dice
            tile.dice.forEach(d => pool.push({ source: `Tile (${tile.name})`, die: d }));
            
            // Extra add if chained
            if (!isCallTile) adds += 1;

            // Parse tags
            const tags = tileTagList(tile).map(t => t.toLowerCase());
            
            // Contextual tag bonuses are surfaced for user selection.
            tags.forEach((tag, index) => {
                const normalizedTag = normalizeMechanicalTag(tag);
                let bonusRule = CONTEXTUAL_TAG_BONUSES[normalizedTag];

                // Motorized: "+steps on [stat]". The chosen stat is stored as "Motorized: STAT".
                if (!bonusRule && normalizedTag.startsWith('motorized')) {
                    const statMatch = String(tag).match(/motorized\s*:?\s*([^()]*)/i);
                    const stat = statMatch && statMatch[1] ? statMatch[1].trim().toUpperCase() : '';
                    bonusRule = {
                        name: stat ? `Motorized (${stat})` : 'Motorized',
                        context: stat ? `${stat} check` : 'stat check',
                        description: `+▟ on ${stat || 'a chosen stat'} checks using this tile`
                    };
                }

                if (!bonusRule) return;

                const steps = this.calculateSteps(tile.dice);
                if (steps <= 0) return;

                tagBonuses.push({
                    id: `${tile.id}:${normalizedTag}:${index}`,
                    tag: bonusRule.name,
                    sourceTileId: tile.id,
                    sourceTileName: tile.name,
                    steps,
                    context: bonusRule.context,
                    description: bonusRule.description
                });
            });

            // Chain tags
            for (let index = 0; index < tags.length; index++) {
                const tag = tags[index];
                if (tag.startsWith('chain ')) {
                    const targetName = tag.replace('chain ', '').trim();
                    const chainId = `${tile.id}:chain:${index}:${targetName.toLowerCase()}`;
                    const targetTile = allTiles.find(t => (t.name || '').toLowerCase() === targetName);
                    const disabled = isChainDisabled(chainId);
                    const chainOption = {
                        id: chainId,
                        sourceTileId: tile.id,
                        sourceTileName: tile.name,
                        targetTileId: targetTile?.id || null,
                        targetTileName: targetTile?.name || targetName,
                        targetFound: Boolean(targetTile),
                        enabled: !disabled,
                        status: disabled ? 'suppressed' : 'active'
                    };
                    chainOptions.push(chainOption);

                    if (disabled) continue;

                    if (!targetTile) {
                        chainOption.status = 'missing';
                        error = `Chain target '${targetName}' was not found.`;
                        return;
                    }

                    if (targetTile.isBurnt) {
                        chainOption.status = 'blocked';
                        error = `Chain target '${targetTile.name}' is burnt and cannot be called.`;
                        return;
                    }

                    if (!hasSharedCallColor(tile, targetTile)) {
                        chainOption.status = 'blocked';
                        error = `Chain from '${tile.name}' to '${targetTile.name}' must share one selected Call color.`;
                        return;
                    }

                    resolveTile(targetTile, false, visitedIds);
                    if (error) return;
                }
            }
        };

        // 2. Validate and Add Call Tile (with chains)
        if (callTile) {
            resolveTile(callTile, true, new Set());
            if (error) return { dice: pool, adds, flatBonus, tagBonuses, chainOptions, error };
        }

        // 3. Validate and Add Burn Tiles (Burn tiles do NOT trigger tags)
        if (burnTiles && burnTiles.length > 0) {
            if (!callTile) {
                return { dice: pool, adds, flatBonus, tagBonuses, chainOptions, error: "Select a Call Tile before adding Burn tiles." };
            }

            const burntTile = burnTiles.find(tile => tile.isBurnt);
            if (burntTile) {
                return { dice: pool, adds, flatBonus, tagBonuses, chainOptions, error: `Burn tile '${burntTile.name}' is already burnt and cannot be used.` };
            }

            const sharedBurnColors = getSharedCallColors(callTile, ...burnTiles);

            if (sharedBurnColors.length === 0) {
                return { dice: pool, adds, flatBonus, tagBonuses, chainOptions, error: "Burn tiles must share one selected Call color with the Call Tile." };
            }

            burnTiles.forEach(bt => {
                bt.dice.forEach(d => pool.push({ source: `Burn (${bt.name})`, die: d }));
                adds += 1;
            });
        }

        // 4. Validate and Add Extra Dice
        if (extraDice && extraDice.length > 0) {
            extraDice.forEach(d => pool.push({ source: `Extra`, die: d }));
        }

        return { dice: pool, adds, flatBonus, tagBonuses, chainOptions, error: null };
    }

    rollDie(dieString) {
        // dieString e.g., 'd6'
        const max = parseInt(dieString.replace('d', ''), 10);
        if (isNaN(max)) return 0;
        return Math.floor(Math.random() * max) + 1;
    }

    rollPool(diceArray) {
        return diceArray.map(dObj => ({
            source: dObj.source,
            die: dObj.die,
            val: this.rollDie(dObj.die)
        }));
    }

    calculateOptimalTotal(rolledArray, adds) {
        // Sort descending by value
        const sorted = [...rolledArray].sort((a, b) => b.val - a.val);
        const kept = sorted.slice(0, adds);
        const total = kept.reduce((sum, item) => sum + item.val, 0);
        
        // Haywire detection: more than half of the dice roll 1s.
        const onesCount = rolledArray.filter(d => d.val === 1).length;
        const isHaywire = onesCount > (rolledArray.length / 2);
        
        return { total, kept, all: sorted, isHaywire, originalRolls: rolledArray };
    }
}
