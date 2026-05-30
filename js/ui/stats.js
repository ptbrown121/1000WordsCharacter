import { ADVANCEABLE_STATS, parseDiceInput, getDiceValidationMessage } from '../pool.js';
import { els } from '../els.js';
import { uiState } from '../state.js';
import { updatePoolPreview } from './pool.js';
import { updateShadowMax } from './vitals.js';
import { renderCards } from './cards.js';
import { renderRulesReview } from './rulesReview.js';

let dataManager;
let poolEngine;

function getStatInput(stat) {
    return [...els.statSelects].find(input => input.dataset.stat === stat);
}

function refreshAfterStatChange() {
    updatePoolPreview();
    updateXpTracker();
    updateShadowMax();
    renderRulesReview();
}

function saveStatDice(stat, value, { resetOnInvalid = false } = {}) {
    const { dice, invalid } = parseDiceInput(value);
    if (invalid.length > 0) {
        alert(getDiceValidationMessage('Stats'));
        if (resetOnInvalid) {
            const input = getStatInput(stat);
            if (input) input.value = dataManager.state.stats[stat] || '';
        }
        return false;
    }

    const normalized = dice.join(', ');
    dataManager.updateStat(stat, normalized);
    const input = getStatInput(stat);
    if (input) input.value = normalized;
    refreshAfterStatChange();
    return true;
}

function getStatDiceTokens() {
    return els.statDiceInput.value
        .split(',')
        .map(token => token.trim())
        .filter(Boolean);
}

function setStatDiceTokens(tokens) {
    els.statDiceInput.value = tokens.join(', ');
    syncStatDiceChips();
}

function syncStatDiceChips() {
    if (!els.statDiceSelected) return;
    els.statDiceSelected.innerHTML = '';

    getStatDiceTokens().forEach((die, index) => {
        const chip = document.createElement('span');
        chip.className = 'dice-selected-chip';

        const label = document.createElement('span');
        label.textContent = die;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'dice-remove-btn';
        removeBtn.textContent = 'x';
        removeBtn.title = `Remove ${die}`;
        removeBtn.setAttribute('aria-label', `Remove ${die}`);
        removeBtn.addEventListener('click', () => {
            const nextTokens = getStatDiceTokens();
            nextTokens.splice(index, 1);
            setStatDiceTokens(nextTokens);
        });

        chip.appendChild(label);
        chip.appendChild(removeBtn);
        els.statDiceSelected.appendChild(chip);
    });
}

function openStatDiceModal(stat) {
    els.statDiceModalKey.value = stat;
    els.statDiceModalTitle.textContent = `Edit ${stat} Dice`;
    setStatDiceTokens((dataManager.state.stats[stat] || '').split(',').map(token => token.trim()).filter(Boolean));
    els.statDiceModal.classList.add('active');
}

function closeStatDiceModal() {
    els.statDiceModal.classList.remove('active');
}

export function init(deps) {
    dataManager = deps.dataManager;
    poolEngine = deps.poolEngine;

    els.valXpEarned.addEventListener('change', (e) => {
        dataManager.state.xpEarned = parseInt(e.target.value, 10) || 0;
        dataManager.saveState();
        updateXpTracker();
    });
    els.valStoryPoints.addEventListener('change', (e) => {
        dataManager.state.storyPoints = parseInt(e.target.value, 10) || 0;
        dataManager.saveState();
    });

    if (els.toggleOptionalStats) {
        els.toggleOptionalStats.addEventListener('change', (e) => {
            dataManager.state.showOptionalStats = e.target.checked;
            dataManager.saveState();
            renderOptionalStatsVisibility();
            renderCards();
            updatePoolPreview();
        });
    }

    // Stats
    els.statSelects.forEach(sel => {
        sel.addEventListener('change', (e) => {
            saveStatDice(e.target.dataset.stat, e.target.value, { resetOnInvalid: true });
        });
    });

    els.statDiceButtons.forEach(btn => {
        btn.addEventListener('click', () => openStatDiceModal(btn.dataset.stat));
    });
    els.statDiceInput.addEventListener('input', syncStatDiceChips);
    els.statDiceButtonsGrid.addEventListener('click', (e) => {
        const button = e.target.closest('.dice-add-btn');
        if (!button || !els.statDiceButtonsGrid.contains(button)) return;
        setStatDiceTokens([...getStatDiceTokens(), button.dataset.die]);
    });
    els.btnStatDiceClear.addEventListener('click', () => setStatDiceTokens([]));
    els.btnStatDiceCancel.addEventListener('click', closeStatDiceModal);
    els.btnStatDiceSave.addEventListener('click', () => {
        const stat = els.statDiceModalKey.value;
        if (saveStatDice(stat, els.statDiceInput.value)) closeStatDiceModal();
    });

    // Auto-Calculate XP
    els.btnCalcXp.addEventListener('click', updateXpTracker);
}

export function updateXpTracker() {
    let spent = 0;

    // 1. Stats XP - charged via the same cascade formula as tile dice
    // (rulebook System Concept-Dice chart: each advance costs
    // {steps on the advanced die} + {count of other dice}).
    ADVANCEABLE_STATS.forEach(stat => {
        spent += poolEngine.calculateOptimalXpCost(poolEngine.parseDiceString(dataManager.state.stats[stat] || ''));
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
    if (els.toggleOptionalStats) els.toggleOptionalStats.checked = false;

    els.optionalStatBoxes.forEach(box => {
        box.style.display = 'none';
    });
    
    if (els.shadowPool) {
        els.shadowPool.style.display = '';
    }

    els.optionalCallOptions.forEach(option => {
        option.hidden = true;
    });

    [els.callColor1, els.callColor2].forEach(select => {
        if (select && (select.value === 'Black' || select.value === 'White' || select.value === 'Qi' || select.value === 'Id')) {
            select.value = '';
        }
    });
    if (Array.isArray(uiState.callColors)) {
        uiState.callColors = uiState.callColors.filter(color => !['Black', 'White', 'Qi', 'Id'].includes(color));
    }
}
