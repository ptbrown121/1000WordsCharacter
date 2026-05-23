import { parseDiceInput, parseDiceString, getDiceValidationMessage } from '../pool.js';
import { els } from '../els.js';
import { updatePoolPreview } from './pool.js';
import { updateShadowMax } from './vitals.js';
import { renderCards } from './cards.js';

let dataManager;
let poolEngine;

export const BASE_XP = { 'd3': 0, 'd4': 1, 'd6': 3, 'd8': 6, 'd10': 10, 'd12': 15, 'd14': 21, 'd16': 28 };

export function calcAttributeXP(diceArray) {
    let xp = 0;
    let index = 0;
    for (let die of diceArray) {
        xp += BASE_XP[die] + index;
        index++;
    }
    return xp;
}

export function init(deps) {
    dataManager = deps.dataManager;
    poolEngine = deps.poolEngine;

    els.valXpEarned.addEventListener('change', (e) => {
        dataManager.state.xpEarned = parseInt(e.target.value, 10) || 0;
        dataManager.saveState();
        updateXpTracker();
    });

    els.toggleOptionalStats.addEventListener('change', (e) => {
        dataManager.state.showOptionalStats = e.target.checked;
        dataManager.saveState();
        renderOptionalStatsVisibility();
        renderCards();
        updatePoolPreview();
    });

    // Stats
    els.statSelects.forEach(sel => {
        sel.addEventListener('change', (e) => {
            const { invalid } = parseDiceInput(e.target.value);
            if (invalid.length > 0) {
                alert(getDiceValidationMessage('Stats'));
                e.target.value = dataManager.state.stats[e.target.dataset.stat] || '';
                return;
            }

            dataManager.updateStat(e.target.dataset.stat, e.target.value);
            updatePoolPreview();
            updateXpTracker();
            updateShadowMax();
        });
    });

    // Auto-Calculate XP
    els.btnCalcXp.addEventListener('click', updateXpTracker);
}

export function updateXpTracker() {
    let spent = 0;
    
    // 1. Stats XP
    Object.values(dataManager.state.stats).forEach(str => {
        spent += calcAttributeXP(parseDiceString(str));
    });
    
    // 2. Tiles XP
    dataManager.state.tiles.forEach(t => {
        spent += (parseInt(t.xpCost, 10) || 0);
    });
    
    els.valXpSpent.innerText = spent;
    els.valXpEarned.value = dataManager.state.xpEarned;
}

export function renderOptionalStatsVisibility() {
    const showOptionalStats = Boolean(dataManager.state.showOptionalStats);

    els.toggleOptionalStats.checked = showOptionalStats;
    els.optionalStatBoxes.forEach(box => {
        box.style.display = showOptionalStats ? '' : 'none';
    });
    
    if (els.shadowPool) {
        els.shadowPool.style.display = showOptionalStats ? '' : 'none';
    }

    els.optionalCallOptions.forEach(option => {
        option.hidden = !showOptionalStats;
    });

    if (!showOptionalStats) {
        [els.callColor1, els.callColor2].forEach(select => {
            if (select.value === 'Black' || select.value === 'White') {
                select.value = '';
            }
        });
    }
}
