import { STAT_COLORS } from './data.js';

export class PoolEngine {
    constructor() {
        this.baseKeeps = 2;
    }

    calculateSteps(diceArray) {
        let steps = 0;
        diceArray.forEach(d => {
            if (d === 'd4') steps += 1;
            else if (d === 'd6') steps += 2;
            else if (d === 'd8') steps += 3;
            else if (d === 'd10') steps += 4;
            else if (d === 'd12') steps += 5;
        });
        return steps;
    }

    calculateOptimalXpCost(diceArray) {
        const stepsMap = {'d3':0, 'd4':1, 'd6':2, 'd8':3, 'd10':4, 'd12':5};
        const sortedDice = [...diceArray].sort((a,b) => (stepsMap[b] || 0) - (stepsMap[a] || 0));
        
        let totalXp = 0;
        let existingDiceCount = 0;
        
        for (const die of sortedDice) {
            const targetSteps = stepsMap[die] || 0;
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

    estimateTileXp(diceArray, tagsArray) {
        let xp = this.calculateOptimalXpCost(diceArray);
        
        // Tag modifiers
        tagsArray.forEach(tag => {
            const t = tag.toLowerCase();
            if (t.startsWith('chain ')) {
                xp += 4;
            } else if (['old', 'primitive', 'rare', 'risky', 'worn'].includes(t)) {
                xp -= 2;
            } else if (t.startsWith('hitch')) {
                // Hitch can give up to 6 XP, default guess -3
                xp -= 3; 
            } else if (['expert', 'keen', 'sharp', 'agile', 'hidden', 'ironclad', 'rugged', 'quick', 'tough', 'vital', 'nimble'].includes(t)) {
                xp += 2;
            } else {
                // generic tag guess
                xp += 2; 
            }
        });
        
        return Math.max(0, xp);
    }

    calculateShadowMax(stats, tiles) {
        let shMax = 0;
        
        // 1. Stats Id and Qi steps
        if (stats['Id']) shMax += this.calculateSteps([stats['Id']]);
        if (stats['Qi']) shMax += this.calculateSteps([stats['Qi']]);
        
        // 2. Black and White boxes on tiles
        tiles.forEach(t => {
            t.colors.forEach(c => {
                if (c === 'Black' || c === 'White') shMax += 1;
            });
        });
        
        return shMax;
    }

    /**
     * Compiles the dice pool based on selected colors and tiles.
     * @param {Array<string>} callColors 
     * @param {Object} stats 
     * @param {Object} callTile 
     * @param {Array<Object>} burnTiles 
     * @param {Array<Object>} allTiles 
     * @param {Array<string>} extraDice
     * @returns {Object} { dice: Array, adds: number, flatBonus: number, error: string }
     */
    compilePool(callColors, stats, callTile, burnTiles, allTiles, extraDice = []) {
        let pool = [];
        let adds = 2; // Base keep is 2;
        let flatBonus = 0;
        let error = null;

        if (callColors.length === 0) {
            return { dice: pool, adds, flatBonus, error: "Select at least 1 color for the Call." };
        }

        // 1. Add Stat Dice matching the Call Colors
        callColors.forEach(color => {
            if (!color) return;
            // Find stats matching this color
            for (const [stat, statColor] of Object.entries(STAT_COLORS)) {
                if (statColor === color) {
                    const die = stats[stat];
                    if (die && die !== '0') {
                        pool.push({ source: `Stat (${stat})`, die });
                    }
                }
            }
        });

        const bonusTags = ['expert', 'keen', 'agile', 'sharp', 'hidden', 'ironclad', 'rugged'];

        // Recursive resolution for call tiles and chains
        const resolveTile = (tile, isCallTile, visitedIds) => {
            if (!tile || visitedIds.has(tile.id)) return;
            visitedIds.add(tile.id);
            
            // Color check
            const matchesCall = callColors.some(c => tile.colors.includes(c));
            if (!matchesCall) {
                if (isCallTile) {
                    error = `Call Tile '${tile.name}' does not match any Call Colors.`;
                }
                return;
            }

            // Add tile dice
            tile.dice.forEach(d => pool.push({ source: `Tile (${tile.name})`, die: d }));
            
            // Extra add if chained
            if (!isCallTile) adds += 1;

            // Parse tags
            const tags = tile.tags ? tile.tags.split(',').map(t => t.trim().toLowerCase()) : [];
            
            // Flat bonuses
            const hasBonusTag = tags.some(t => bonusTags.includes(t));
            if (hasBonusTag) {
                flatBonus += this.calculateSteps(tile.dice);
            }

            // Chain tags
            tags.forEach(tag => {
                if (tag.startsWith('chain ')) {
                    const targetName = tag.replace('chain ', '').trim();
                    const targetTile = allTiles.find(t => t.name.toLowerCase() === targetName);
                    if (targetTile) {
                        resolveTile(targetTile, false, visitedIds);
                    }
                }
            });
        };

        // 2. Validate and Add Call Tile (with chains)
        if (callTile) {
            resolveTile(callTile, true, new Set());
            if (error) return { dice: pool, adds, flatBonus, error };
        }

        // 3. Validate and Add Burn Tiles (Burn tiles do NOT trigger tags)
        if (burnTiles && burnTiles.length > 0) {
            let commonColor = null;
            if (burnTiles.length > 0) {
                const colors0 = burnTiles[0].colors;
                const colors1 = burnTiles.length > 1 ? burnTiles[1].colors : colors0;
                const intersection = colors0.filter(c => colors1.includes(c));
                if (intersection.length === 0) {
                    return { dice: pool, adds, flatBonus, error: "Burn tiles must share at least one color." };
                }
                commonColor = intersection[0]; 

                const allMatch = burnTiles.every(t => t.colors.includes(commonColor));
                if (!allMatch) {
                    return { dice: pool, adds, flatBonus, error: "All Burn tiles must match the SAME color." };
                }

                burnTiles.forEach(bt => {
                    bt.dice.forEach(d => pool.push({ source: `Burn (${bt.name})`, die: d }));
                    adds += 1; 
                });
            }
        }

        // 4. Validate and Add Extra Dice
        if (extraDice && extraDice.length > 0) {
            extraDice.forEach(d => pool.push({ source: `Extra`, die: d }));
        }

        return { dice: pool, adds, flatBonus, error: null };
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
