import { parseDiceInput, parseDiceString, getDiceValidationMessage } from '../pool.js';
import { els } from '../els.js';
import { updatePoolPreview } from './pool.js';
import { updateShadowMax } from './vitals.js';
import { renderCards } from './cards.js';
import { renderRulesReview } from './rulesReview.js';

let dataManager;
let poolEngine;

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
            renderRulesReview();
        });
    });

    // Auto-Calculate XP
    els.btnCalcXp.addEventListener('click', updateXpTracker);
}

export function updateXpTracker() {
    let spent = 0;

    // 1. Stats XP - charged via the same cascade formula as tile dice
    // (rulebook System Concept-Dice chart: each advance costs
    // {steps on the advanced die} + {count of other dice}).
    Object.values(dataManager.state.stats).forEach(str => {
        spent += poolEngine.calculateOptimalXpCost(parseDiceString(str));
    });

    // 2. Tiles XP
    dataManager.state.tiles.forEach(t => {
        spent += (parseInt(t.xpCost, 10) || 0);
    });

    els.valXpSpent.innerText = spent;
    els.valXpEarned.value = dataManager.state.xpEarned;
    renderRulesReview();
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
