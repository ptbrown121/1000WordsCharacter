import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveMax } from '../js/data.js';

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
