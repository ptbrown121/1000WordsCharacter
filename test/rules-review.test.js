import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PoolEngine } from '../js/pool.js';
import { buildRulesReviewItems } from '../js/rules-review.js';

const engine = new PoolEngine();

describe('buildRulesReviewItems', () => {
    it('flags XP mismatches using exotic skill metadata', () => {
        const state = {
            xpEarned: 100,
            stats: {},
            tiles: [{
                id: 'a',
                type: 'Skill',
                name: 'Twist',
                colors: ['Yellow', 'Purple'],
                dice: ['d4'],
                tags: [],
                xpCost: 1,
                exoticSkill: { id: 'arcana-twist', system: 'Arcana', specialty: 'Twist', label: 'Arcana: Twist', baseXp: 2 }
            }]
        };

        const items = buildRulesReviewItems(state, engine);
        assert.ok(items.some(item => item.category === 'XP' && item.message.includes('current estimate 3')));
        assert.ok(items.some(item => item.category === 'Exotic' && item.message.includes('Arcana: Twist')));
    });

    it('flags Arcana spell capacity overages and missing Arcana chains', () => {
        const state = {
            xpEarned: 100,
            stats: {},
            tiles: [
                {
                    id: 'skill',
                    type: 'Skill',
                    name: 'Forge',
                    colors: ['Green', 'Red'],
                    dice: ['d4'],
                    tags: [],
                    xpCost: 3,
                    exoticSkill: { id: 'arcana-forge', system: 'Arcana', specialty: 'Forge', label: 'Arcana: Forge', baseXp: 2 }
                },
                { id: 's1', type: 'Gear', name: 'Spark', isSpell: true, dice: ['d4'], tags: ['Spell', 'Chain Forge'], xpCost: 1 },
                { id: 's2', type: 'Gear', name: 'Ward', isSpell: true, dice: ['d4'], tags: ['Spell', 'Chain Forge'], xpCost: 1 },
                { id: 's3', type: 'Gear', name: 'Loose Spell', isSpell: true, dice: ['d4'], tags: ['Spell'], xpCost: 1 }
            ]
        };

        const items = buildRulesReviewItems(state, engine);
        assert.ok(items.some(item => item.category === 'Arcana' && item.message.includes('2/1 chained spells')));
        assert.ok(items.some(item => item.category === 'Arcana' && item.message.includes('Loose Spell')));
    });
});
