import { STAT_COLORS, COLOR_HEX } from './data.js';
import { els } from './els.js';
import { renderCards } from './ui/cards.js';
import { updatePoolPreview } from './ui/pool.js';
import { renderOptionalStatsVisibility, updateXpTracker } from './ui/stats.js';
import { renderTempBadge, updateShadowMax } from './ui/vitals.js';
import { renderJournal } from './ui/journal.js';
import { renderRosterSelect } from './ui/roster.js';

let dataManager;

export function setDataManager(dm) {
    dataManager = dm;
}

export function renderAll() {
    els.charName.value = dataManager.state.name;
    els.valXpEarned.value = dataManager.state.xpEarned || 75;
    els.valHp.value = dataManager.state.hp ?? 0;
    
    // Calculate effective max = base max + perm + temp
    const hpEffMax = (dataManager.state.hpMax ?? 0) + (dataManager.state.hpPerm || 0) + (dataManager.state.hpTemp || 0);
    const enEffMax = (dataManager.state.enMax ?? 0) + (dataManager.state.enPerm || 0) + (dataManager.state.enTemp || 0);
    const rxEffMax = (dataManager.state.rxMax ?? 0) + (dataManager.state.rxPerm || 0) + (dataManager.state.rxTemp || 0);
    
    els.valHpMax.innerText = hpEffMax;
    els.valEn.value = dataManager.state.en ?? 0;
    els.valEnMax.innerText = enEffMax;
    els.valRx.value = dataManager.state.rx ?? 0;
    els.valRxMax.innerText = rxEffMax;
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
}
