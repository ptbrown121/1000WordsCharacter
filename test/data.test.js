import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveMax, normalizeStateForShadowRules, normalizeTileTags } from '../js/data.js';

describe('getEffectiveMax', () => {
    it('sums base max + perm + temp for HP/EN/RX', () => {
        const state = { hpMax: 10, hpPerm: 2, hpTemp: 3 };
        assert.equal(getEffectiveMax(state, 'hp'), 15);
    });

    it('uses baseOverride when provided (used by SH which has no stored max)', () => {
        const state = { shPerm: 1, shTemp: 2 };
        assert.equal(getEffectiveMax(state, 'sh', 4), 7);
    });

    it('coerces string values from input fields', () => {
        const state = { hpMax: '10', hpPerm: '2', hpTemp: '3' };
        assert.equal(getEffectiveMax(state, 'hp'), 15);
    });

    it('treats missing or NaN parts as 0', () => {
        assert.equal(getEffectiveMax({}, 'hp'), 0);
        assert.equal(getEffectiveMax({ hpMax: 'abc', hpPerm: null, hpTemp: undefined }, 'hp'), 0);
    });

    it('handles a null state without throwing', () => {
        assert.equal(getEffectiveMax(null, 'hp'), 0);
        assert.equal(getEffectiveMax(undefined, 'hp', 5), 5);
    });

    it('preserves explicit 0 baseOverride (does not fall back to state.shMax)', () => {
        const state = { shMax: 99, shPerm: 1, shTemp: 1 };
        assert.equal(getEffectiveMax(state, 'sh', 0), 2);
    });
});



describe('normalizeTileTags', () => {
    it('returns an empty array for missing or empty tags', () => {
        const tile = { tags: null };
        normalizeTileTags(tile);
        assert.deepEqual(tile.tags, []);

        const tile2 = { tags: '' };
        normalizeTileTags(tile2);
        assert.deepEqual(tile2.tags, []);

        const tile3 = {};
        normalizeTileTags(tile3);
        assert.deepEqual(tile3.tags, []);
    });

    it('preserves a clean string[] of player-authored tags', () => {
        const tile = { tags: ['Keen', 'Sharp', 'Chain Bolt'] };
        normalizeTileTags(tile);
        assert.deepEqual(tile.tags, ['Keen', 'Sharp', 'Chain Bolt']);
    });

    it('parses a legacy comma-separated string into an array', () => {
        const tile = { tags: 'Keen, Sharp , Vital' };
        normalizeTileTags(tile);
        assert.deepEqual(tile.tags, ['Keen', 'Sharp', 'Vital']);
    });

    it('flattens object-shaped tags ({name, xp}) to their name', () => {
        const tile = { tags: [{ name: 'Keen', xp: 2 }, { name: 'Sharp', xp: 2 }] };
        normalizeTileTags(tile);
        assert.deepEqual(tile.tags, ['Keen', 'Sharp']);
    });

    it('strips the auto-generated "Effect:" sentence from spell tiles (migration)', () => {
        // Simulates a spell saved before the preview-as-tag bug fix:
        // tagsArr included "Spell", "Chain Pyromancy", and the generated
        // preview sentence ("Effect: Bolt. Range: ...").
        const spell = {
            isSpell: true,
            tags: [
                'Spell',
                'Chain Pyromancy',
                'Effect: Bolt. Range: Medium. Duration: Instant.'
            ]
        };
        normalizeTileTags(spell);
        assert.deepEqual(spell.tags, ['Spell', 'Chain Pyromancy']);
    });

    it('does NOT strip "Effect:" from non-spell tiles (defensive scope)', () => {
        // A non-spell tile that happens to have an unusual tag starting
        // with "Effect:" - we don't want to silently delete real player
        // data. The bug only ever affected isSpell tiles.
        const tile = {
            isSpell: false,
            tags: ['Keen', 'Effect: Custom narrative tag']
        };
        normalizeTileTags(tile);
        assert.deepEqual(tile.tags, ['Keen', 'Effect: Custom narrative tag']);
    });

    it('handles a spell tile that has no buggy tag without modifying it', () => {
        const spell = { isSpell: true, tags: ['Spell', 'Chain Pyromancy', 'Sharp'] };
        normalizeTileTags(spell);
        assert.deepEqual(spell.tags, ['Spell', 'Chain Pyromancy', 'Sharp']);
    });

    it('is idempotent (running twice yields the same result)', () => {
        const spell = {
            isSpell: true,
            tags: ['Spell', 'Effect: foo', 'Sharp']
        };
        normalizeTileTags(spell);
        const once = [...spell.tags];
        normalizeTileTags(spell);
        assert.deepEqual(spell.tags, once);
    });

    it('also strips "Effect:" tags from a legacy comma-string spell tile', () => {
        // Belt-and-suspenders: the migration should run on whatever shape
        // arrives, including the oldest comma-string format.
        const spell = {
            isSpell: true,
            tags: 'Spell, Chain Pyromancy, Effect: Bolt. Range: Medium.'
        };
        normalizeTileTags(spell);
        assert.deepEqual(spell.tags, ['Spell', 'Chain Pyromancy']);
    });
});

describe('normalizeStateForShadowRules', () => {
    it('loads ordinary non-Shadow characters safely with Shadow defaults', () => {
        const state = normalizeStateForShadowRules({
            stats: { BODY: 'd4', POWER: '', SOUL: '', FOCUS: '', MIND: '', SPEED: '' },
            tiles: [{ colors: ['Red', 'Green'], dice: ['d4'], tags: [] }]
        });

        assert.equal(state.aberration, 0);
        assert.equal(state.sh, 0);
        assert.equal(state.legacyShadowWarning, false);
        assert.deepEqual(state.tiles[0].boxes, [
            { type: 'color', color: 'Red' },
            { type: 'color', color: 'Green' }
        ]);
    });

    it('ignores old Qi / Id stat data and sets the legacy warning', () => {
        const state = normalizeStateForShadowRules({
            stats: { BODY: 'd4', Qi: 'd10', Id: 'd8' },
            tiles: []
        });

        assert.deepEqual(Object.keys(state.stats), ['BODY', 'POWER', 'SOUL', 'FOCUS', 'MIND', 'SPEED']);
        assert.equal(state.stats.Qi, undefined);
        assert.equal(state.stats.Id, undefined);
        assert.equal(state.legacyShadowWarning, true);
    });
});
