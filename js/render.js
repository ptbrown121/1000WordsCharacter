import { STAT_COLORS, COLOR_HEX, getEffectiveMax } from './data.js';
import { els } from './els.js';
import { renderCards } from './ui/cards.js';
import { updatePoolPreview } from './ui/pool.js';
import { renderOptionalStatsVisibility, updateXpTracker } from './ui/stats.js';
import { renderTempBadge, updateShadowMax } from './ui/vitals.js';
import { renderJournal } from './ui/journal.js';
import { renderRosterSelect } from './ui/roster.js';
import { renderRulesReview } from './ui/rulesReview.js';

let dataManager;

export function setDataManager(dm) {
    dataManager = dm;
}

export function renderAll() {
    els.charName.value = dataManager.state.name;
    els.valXpEarned.value = dataManager.state.xpEarned || 75;
    els.valHp.value = dataManager.state.hp ?? 0;

    // Effective max = base max + perm + temp (see getEffectiveMax in data.js).
    els.valHpMax.innerText = getEffectiveMax(dataManager.state, 'hp');
    els.valEn.value = dataManager.state.en ?? 0;
    els.valEnMax.innerText = getEffectiveMax(dataManager.state, 'en');
    els.valRx.value = dataManager.state.rx ?? 0;
    els.valRxMax.innerText = getEffectiveMax(dataManager.state, 'rx');
    els.valSh.value = dataManager.state.sh || 0;

    // Temp badges
    renderTempBadge(els.hpTempBadge, dataManager.state.hpTemp);
    renderTempBadge(els.enTempBadge, dataManager.state.enTemp);
    renderTempBadge(els.rxTempBadge, dataManager.state.rxTemp);
    renderTempBadge(els.shTempBadge, dataManager.state.shTemp);

    // Apply stat values and dynamic borders
    els.statSelects.forEach(sel => {
        const stat = sel.dataset.stat;
        sel.value = dataManager.state.stats[stat];
        const colorName = STAT_COLORS[stat];
        sel.parentElement.style.borderTopColor = COLOR_HEX[colorName] || '#fff';
    });

    renderOptionalStatsVisibility();
    renderCards();
    updatePoolPreview();
    updateXpTracker();
    updateShadowMax();
    renderJournal();
    renderRosterSelect();
    renderRulesReview();
}
