import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PoolEngine } from '../js/pool.js';

const engine = new PoolEngine();

describe('calculateSteps', () => {
    it('sums die steps (d3=0 .. d16=7)', () => {
        assert.equal(engine.calculateSteps(['d4', 'd6']), 3); // 1 + 2
        assert.equal(engine.calculateSteps(['d3']), 0);
        assert.equal(engine.calculateSteps(['d16']), 7);
        assert.equal(engine.calculateSteps([]), 0);
    });
});

describe('parseDiceString', () => {
    it('keeps only valid die codes and normalizes case/whitespace', () => {
        assert.deepEqual(engine.parseDiceString('d4, D6 , d20, x, d8'), ['d4', 'd6', 'd8']);
        assert.deepEqual(engine.parseDiceString(''), []);
    });
});

describe('classifyTagForLimit (rulebook p.13 / p.2014)', () => {
    const counts = (t) => engine.classifyTagForLimit(t).counts;

    it('counts Build / Detail / Crit / Shield tags', () => {
        for (const t of ['Quick', 'Tough', 'Vital', 'Motorized', 'Agile', 'Hidden',
            'Ironclad', 'Loose', 'Rugged', 'Sealed', 'Adamant', 'Keen', 'Sharp',
            'Expert', 'Detail: Fast', 'Crit: JOLT', 'Shield: Deflect']) {
            assert.equal(counts(t), true, `${t} should count`);
        }
    });

    it('counts Build-prefixed tags including Build: Cyber', () => {
        assert.equal(counts('Build: Cyber'), true);
        assert.equal(counts('Build: Tough'), true);
    });

    it('exempts Flaw / Range / Duration / Exotic tags', () => {
        for (const t of ['Old', 'Primitive', 'Rare', 'Risky', 'Worn', 'Bulky', 'Heavy',
            'Hitch 3', 'Range: Short', 'Duration: Instant', 'Bestial', 'Celestial', 'Cyber']) {
            assert.equal(counts(t), false, `${t} should be exempt`);
        }
    });

    it('honors the GM (Exempt) override and ignores blanks', () => {
        assert.equal(counts('Sharp (Exempt)'), false);
        assert.equal(counts('   '), false);
    });
});

describe('calculateTagLimit', () => {
    it('passes when countable tags <= die steps', () => {
        const r = engine.calculateTagLimit(['d6'], ['Ironclad', 'Tough']); // 2 steps, 2 countable
        assert.deepEqual({ limit: r.limit, count: r.count, overage: r.overage, valid: r.valid },
            { limit: 2, count: 2, overage: 0, valid: true });
    });

    it('fails when countable tags exceed die steps', () => {
        const r = engine.calculateTagLimit(['d4'], ['Ironclad', 'Quick']); // 1 step, 2 countable
        assert.deepEqual({ limit: r.limit, count: r.count, overage: r.overage, valid: r.valid },
            { limit: 1, count: 2, overage: 1, valid: false });
    });

    it('separates exempt tags from countable ones', () => {
        const r = engine.calculateTagLimit(['d6'], ['Range: Short', 'Old', 'Ironclad']);
        assert.equal(r.count, 1);             // only Ironclad counts
        assert.equal(r.exemptTags.length, 2); // Range + Old
        assert.equal(r.valid, true);
    });
});

describe('calculateOptimalXpCost (cascade)', () => {
    it('matches rulebook base costs for a single die', () => {
        assert.equal(engine.calculateOptimalXpCost(['d3']), 0);
        assert.equal(engine.calculateOptimalXpCost(['d4']), 1);
        assert.equal(engine.calculateOptimalXpCost(['d6']), 3);
        assert.equal(engine.calculateOptimalXpCost(['d8']), 6);
    });

    it('charges escalating cost for additional dice', () => {
        assert.equal(engine.calculateOptimalXpCost(['d4', 'd4']), 3);
    });
});

describe('estimateTileXp', () => {
    it('adds tag modifiers to the dice cost (floored at 0)', () => {
        assert.equal(engine.estimateTileXp(['d6'], ['Keen']), 5);      // 3 + 2
        assert.equal(engine.estimateTileXp(['d4'], ['Chain Foo']), 5); // 1 + 4
        assert.equal(engine.estimateTileXp(['d4'], ['Old', 'Worn']), 0); // 1 - 2 - 2 -> max(0)
    });

    it('subtracts XP for every flaw, including Bulky and Heavy', () => {
        const base = engine.calculateOptimalXpCost(['d8']); // 6
        for (const flaw of ['Old', 'Primitive', 'Rare', 'Risky', 'Worn', 'Bulky', 'Heavy']) {
            assert.equal(engine.estimateTileXp(['d8'], [flaw]), base - 2, `${flaw} should refund 2 XP`);
        }
        assert.equal(engine.estimateTileXp(['d8'], ['Hitch']), base - 3); // Hitch refunds 3
    });

    it('adds armor base cost (material + coverage) — page 29', () => {
        assert.equal(engine.estimateTileXp(['d4'], [], { material: 'Soft', coverage: 'Open' }), 1);   // +0 +0
        assert.equal(engine.estimateTileXp(['d4'], [], { material: 'Soft', coverage: 'Full' }), 3);   // +0 +2
        assert.equal(engine.estimateTileXp(['d4'], [], { material: 'Hard', coverage: 'Open' }), 5);   // +4 +0
        assert.equal(engine.estimateTileXp(['d4'], [], { material: 'Hard', coverage: 'Closed' }), 9); // +4 +4
    });

    it('discounts Detail tags by 1 XP on Hard armor only', () => {
        const tags = ['Ironclad', 'Tough'];
        assert.equal(engine.estimateTileXp(['d6'], tags, { material: 'Soft', coverage: 'Full' }), 9);  // 3 +2 +2 +2
        assert.equal(engine.estimateTileXp(['d6'], tags, { material: 'Hard', coverage: 'Full' }), 11); // 3 +2 +2 -2 +6
    });

    it('treats a Motorized: STAT tag as a Detail tag for the Hard-armor discount', () => {
        // d6=3, Motorized +2 (generic Detail). Soft Full: +2 coverage -> 7. Hard Full: +6 armor, -1 discount -> 10.
        assert.equal(engine.estimateTileXp(['d6'], ['Motorized: BODY'], { material: 'Soft', coverage: 'Full' }), 7);
        assert.equal(engine.estimateTileXp(['d6'], ['Motorized: BODY'], { material: 'Hard', coverage: 'Full' }), 10);
    });
});

describe('calculateResourceMaxes', () => {
    it('adds 1 per matching color slot, plus die-steps for Tough/Vital/Quick', () => {
        const tiles = [
            { colors: ['Red', 'Green'], dice: ['d6'], tags: 'Tough' }, // hp+1, en+1, Tough -> hp += 2 steps
            { colors: ['Blue', 'Black'], dice: ['d4'], tags: '' }      // rx+1, sh+1
        ];
        assert.deepEqual(engine.calculateResourceMaxes(tiles), { hp: 3, en: 1, rx: 1, sh: 1 });
    });

    it('calculateShadowMax counts Black/White slots', () => {
        const tiles = [{ colors: ['Black', 'White'], dice: ['d4'], tags: '' }];
        assert.equal(engine.calculateShadowMax(tiles), 2);
    });
});

describe('compilePool', () => {
    const stats = { BODY: 'd6', MIND: 'd8' }; // Red, Blue

    it('pulls stat dice for selected call colors', () => {
        const res = engine.compilePool(['Red'], stats, null, [], [], []);
        assert.equal(res.error, null);
        assert.equal(res.dice.length, 1);
        assert.equal(res.adds, 2);
    });

    it('errors when no call color is selected', () => {
        const res = engine.compilePool([], stats, null, [], [], []);
        assert.match(res.error, /at least 1 color/i);
    });

    it('adds a matching call tile’s dice', () => {
        const callTile = { id: '1', name: 'Sword', colors: ['Red', 'Blue'], dice: ['d8'], tags: '' };
        const res = engine.compilePool(['Red'], stats, callTile, [], [callTile], []);
        assert.equal(res.error, null);
        assert.equal(res.dice.length, 2); // BODY d6 + tile d8
    });

    it('rejects a burnt call tile', () => {
        const callTile = { id: '1', name: 'Sword', colors: ['Red'], dice: ['d8'], tags: '', isBurnt: true };
        const res = engine.compilePool(['Red'], stats, callTile, [], [callTile], []);
        assert.match(res.error, /burnt/i);
    });

    it('rejects a call tile that shares no call color', () => {
        const callTile = { id: '1', name: 'Sword', colors: ['Green'], dice: ['d8'], tags: '' };
        const res = engine.compilePool(['Red'], stats, callTile, [], [callTile], []);
        assert.match(res.error, /does not match/i);
    });

    it('requires a call tile before burn tiles', () => {
        const burn = { id: '2', name: 'Bomb', colors: ['Red'], dice: ['d6'], tags: '' };
        const res = engine.compilePool(['Red'], stats, null, [burn], [burn], []);
        assert.match(res.error, /Call Tile/i);
    });

    it('grants +1 add per burn tile', () => {
        const callTile = { id: '1', name: 'Sword', colors: ['Red'], dice: ['d8'], tags: '' };
        const burn = { id: '2', name: 'Bomb', colors: ['Red'], dice: ['d6'], tags: '' };
        const res = engine.compilePool(['Red'], stats, callTile, [burn], [callTile, burn], []);
        assert.equal(res.error, null);
        assert.equal(res.adds, 3); // base 2 + 1 burn
    });

    it('resolves a Chain tag, pulling the chained tile’s dice and +1 add', () => {
        const helper = { id: 'h', name: 'Helper', colors: ['Red'], dice: ['d10'], tags: '' };
        const callTile = { id: '1', name: 'Sword', colors: ['Red'], dice: ['d8'], tags: 'Chain Helper' };
        const res = engine.compilePool(['Red'], stats, callTile, [], [callTile, helper], []);
        assert.equal(res.error, null);
        assert.equal(res.dice.length, 3); // BODY d6 + Sword d8 + Helper d10
        assert.equal(res.adds, 3);        // base 2 + chain 1
        assert.equal(res.chainOptions.length, 1);
    });

    it('surfaces a contextual tag bonus equal to the tile’s die steps', () => {
        const callTile = { id: '1', name: 'Plate', colors: ['Red'], dice: ['d6'], tags: 'Ironclad' };
        const res = engine.compilePool(['Red'], stats, callTile, [], [callTile], []);
        assert.equal(res.tagBonuses.length, 1);
        assert.equal(res.tagBonuses[0].steps, 2); // d6 = 2 steps
    });

    it('surfaces a Motorized bonus tied to the chosen stat, equal to die steps', () => {
        const callTile = { id: '1', name: 'Chassis', colors: ['Red'], dice: ['d6'], tags: 'Motorized: BODY' };
        const res = engine.compilePool(['Red'], stats, callTile, [], [callTile], []);
        assert.equal(res.tagBonuses.length, 1);
        assert.equal(res.tagBonuses[0].steps, 2);                 // d6 = 2 steps
        assert.equal(res.tagBonuses[0].tag, 'Motorized (BODY)');
        assert.match(res.tagBonuses[0].context, /BODY/);
    });
});

describe('calculateOptimalTotal', () => {
    it('keeps the highest <adds> dice and sums them', () => {
        const rolled = [{ die: 'd6', val: 5 }, { die: 'd6', val: 3 }, { die: 'd8', val: 6 }];
        const r = engine.calculateOptimalTotal(rolled, 2);
        assert.equal(r.total, 11); // 6 + 5
        assert.equal(r.kept.length, 2);
    });

    it('flags haywire when more than half the dice roll 1', () => {
        assert.equal(engine.calculateOptimalTotal([{ val: 1 }, { val: 1 }, { val: 5 }], 2).isHaywire, true);
        assert.equal(engine.calculateOptimalTotal([{ val: 1 }, { val: 5 }], 2).isHaywire, false);
    });
});


import {
    escapeHtml,
    parseDiceInput,
    parseDiceString,
    getDiceValidationMessage,
    formatTagLimitStatus,
    tagLimitErrorMessage
} from '../js/pool.js';

describe('escapeHtml', () => {
    it('escapes <, >, &, ", and \' so injected markup cannot execute', () => {
        const malicious = '<img src=x onerror=alert(1)>';
        assert.equal(
            escapeHtml(malicious),
            '&lt;img src=x onerror=alert(1)&gt;'
        );
        assert.equal(escapeHtml('A & B'), 'A &amp; B');
        assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;');
        assert.equal(escapeHtml("it's"), 'it&#39;s');
    });

    it('handles null and undefined as empty strings', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    it('coerces numbers to strings', () => {
        assert.equal(escapeHtml(42), '42');
    });
});

describe('parseDiceInput (shared helper)', () => {
    it('separates valid and invalid dice tokens', () => {
        const result = parseDiceInput('d4, d99, D6, garbage');
        assert.deepEqual(result.dice, ['d4', 'd6']);
        assert.deepEqual(result.invalid, ['d99', 'garbage']);
    });

    it('returns empty lists for blank input', () => {
        assert.deepEqual(parseDiceInput(''), { dice: [], invalid: [] });
        assert.deepEqual(parseDiceInput('   '), { dice: [], invalid: [] });
    });
});

describe('parseDiceString', () => {
    it('returns only valid dice', () => {
        assert.deepEqual(parseDiceString('d4, d8, junk'), ['d4', 'd8']);
    });
});

describe('getDiceValidationMessage', () => {
    it('mentions the supported die ranks', () => {
        const msg = getDiceValidationMessage('Tile dice');
        assert.match(msg, /^Tile dice/);
        assert.match(msg, /d3, d4, d6, d8, d10, d12, d14, or d16/);
    });
});

describe('formatTagLimitStatus / tagLimitErrorMessage', () => {
    it('formats a valid tag limit', () => {
        const limit = engine.calculateTagLimit(['d6', 'd8'], ['Keen', 'Sharp']);
        assert.equal(limit.valid, true);
        assert.match(formatTagLimitStatus(limit), /^Tag limit: 2\/5 countable tags\./);
    });

    it('formats an over-limit error and lists countable tags', () => {
        const limit = engine.calculateTagLimit(['d4'], ['Keen', 'Sharp', 'Expert']);
        assert.equal(limit.valid, false);
        const msg = tagLimitErrorMessage('This tile', limit);
        assert.match(msg, /This tile has 3 countable tags, but its dice allow 1/);
        assert.match(msg, /Countable tags: Keen, Sharp, Expert\./);
    });
});
