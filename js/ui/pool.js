import { escapeHtml, isHitchedTile, parseDiceInput, getDiceValidationMessage } from '../pool.js';
import { uiState } from '../state.js';
import { els } from '../els.js';
import { showResults } from './resolution.js';
import { renderCards } from './cards.js';
import { updateShadowMax } from './vitals.js';

let dataManager;
let poolEngine;

export function init(deps) {
    dataManager = deps.dataManager;
    poolEngine = deps.poolEngine;

    els.callColor1.addEventListener('change', () => { updatePoolPreview(); if (els.autoFilterCall.checked) renderCards(); });
    els.callColor2.addEventListener('change', () => { updatePoolPreview(); if (els.autoFilterCall.checked) renderCards(); });
    els.extraDiceInput.addEventListener('input', updatePoolPreview);
    els.chainOptions.addEventListener('change', (e) => {
        if (!e.target.classList.contains('chain-cb')) return;
        const chainId = e.target.dataset.chainId;
        if (e.target.checked) {
            uiState.disabledChainIds.delete(chainId);
        } else {
            uiState.disabledChainIds.add(chainId);
        }
        updatePoolPreview();
    });
    els.tagBonusOptions.addEventListener('change', (e) => {
        if (!e.target.classList.contains('tag-bonus-cb')) return;
        const bonusId = e.target.dataset.bonusId;
        if (e.target.checked) {
            uiState.selectedTagBonusIds.add(bonusId);
        } else {
            uiState.selectedTagBonusIds.delete(bonusId);
        }
        updatePoolPreview();
    });

    els.radioModes.forEach(r => {
        r.addEventListener('change', (e) => {
            if (e.target.value === 'virtual') {
                els.virtualSection.style.display = 'block';
                els.manualSection.style.display = 'none';
            } else {
                els.virtualSection.style.display = 'none';
                els.manualSection.style.display = 'block';
                renderManualInputs();
            }
        });
    });

    els.btnRoll.addEventListener('click', executeVirtualRoll);
    els.btnCalculate.addEventListener('click', executeManualCalculate);
}

export function getExtraDice() {
    const val = els.extraDiceInput.value.trim();
    const { dice, invalid } = parseDiceInput(val);
    return {
        dice,
        error: invalid.length > 0 ? getDiceValidationMessage('Extra dice') : null
    };
}

export function getPoolOptions() {
    return {
        disabledChainIds: new Set(uiState.disabledChainIds)
    };
}

function getAmmoResolutionOptions(calledTileIds = []) {
    const calledIds = new Set(calledTileIds);
    return (dataManager.state.tiles || [])
        .filter(tile => tile.type === 'Gear' && tile.gearSubtype === 'Ammo' && tile.ammo && !tile.isBuried)
        .filter(tile => (parseInt(tile.ammo.currentSupply, 10) || 0) > 0)
        .filter(tile => !tile.ammo.targetTileId || calledIds.has(tile.ammo.targetTileId))
        .map(tile => ({
            tileId: tile.id,
            name: tile.name,
            targetName: tile.ammo.targetName || '',
            currentSupply: parseInt(tile.ammo.currentSupply, 10) || 0,
            supply: Math.max(1, parseInt(tile.ammo.maxSupply, 10) || 1),
            linked: Boolean(tile.ammo.targetTileId)
        }));
}

function resetMosaicFilterAfterRoll() {
    if (!els.autoFilterCall.checked) return;
    els.autoFilterCall.checked = false;
    renderCards();
}

function applyResourceCosts(resourceCosts = []) {
    const enCost = resourceCosts
        .filter(cost => cost.resource === 'en')
        .reduce((sum, cost) => sum + (parseInt(cost.amount, 10) || 0), 0);

    if (enCost <= 0) return true;

    const names = resourceCosts
        .filter(cost => cost.resource === 'en')
        .map(cost => cost.sourceTileName)
        .join(', ');
    const currentEn = parseInt(dataManager.state.en, 10) || 0;
    if (currentEn < enCost && !dataManager.state.gmOverride) {
        alert(`Calling ${names} costs ${enCost} EN for Hitch, but only ${currentEn} EN is available.`);
        return false;
    }

    const spend = confirm(`Calling ${names} costs ${enCost} EN for Hitch. Spend it now?`);
    if (!spend) return false;

    dataManager.state.en = Math.max(0, currentEn - enCost);
    dataManager.saveState();
    els.valEn.value = dataManager.state.en;
    return true;
}

export function renderChainOptions(chainOptions = []) {
    const validIds = new Set(chainOptions.map(chain => chain.id));
    uiState.disabledChainIds = new Set(
        Array.from(uiState.disabledChainIds).filter(id => validIds.has(id))
    );

    els.chainOptions.innerHTML = '';

    if (chainOptions.length === 0) {
        els.chainPanel.hidden = true;
        return;
    }

    els.chainPanel.hidden = false;

    chainOptions.forEach(chain => {
        const option = document.createElement('label');
        const isBlocked = chain.enabled && ['blocked', 'missing'].includes(chain.status);
        option.className = `chain-option${isBlocked ? ' chain-blocked' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'chain-cb';
        checkbox.dataset.chainId = chain.id;
        checkbox.checked = !uiState.disabledChainIds.has(chain.id);

        const main = document.createElement('span');
        main.className = 'chain-main';

        const title = document.createElement('span');
        title.className = 'chain-title';
        title.textContent = `${chain.sourceTileName} -> ${chain.targetTileName}`;

        const context = document.createElement('span');
        context.className = 'chain-context';
        context.textContent = chain.enabled
            ? 'Called with the source tile and grants its dice plus one Add'
            : 'Suppressed for this roll';

        const status = document.createElement('span');
        status.className = `chain-status chain-status-${chain.status}`;
        status.textContent = chain.enabled ? 'On' : 'Off';
        if (chain.status === 'missing') status.textContent = 'Missing';
        if (chain.status === 'blocked') status.textContent = 'Blocked';

        main.appendChild(title);
        main.appendChild(context);
        option.appendChild(checkbox);
        option.appendChild(main);
        option.appendChild(status);
        els.chainOptions.appendChild(option);
    });
}

export function getSelectedTagBonuses(tagBonuses = []) {
    return tagBonuses.filter(bonus => uiState.selectedTagBonusIds.has(bonus.id));
}

export function calculateSelectedTagBonus(tagBonuses = []) {
    return getSelectedTagBonuses(tagBonuses)
        .reduce((sum, bonus) => sum + bonus.steps, 0);
}

export function renderTagBonusOptions(tagBonuses = []) {
    const validIds = new Set(tagBonuses.map(bonus => bonus.id));
    uiState.selectedTagBonusIds = new Set(
        Array.from(uiState.selectedTagBonusIds).filter(id => validIds.has(id))
    );

    els.tagBonusOptions.innerHTML = '';

    if (tagBonuses.length === 0) {
        els.tagBonusPanel.hidden = true;
        return;
    }

    els.tagBonusPanel.hidden = false;

    tagBonuses.forEach(bonus => {
        const option = document.createElement('label');
        option.className = 'tag-bonus-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tag-bonus-cb';
        checkbox.dataset.bonusId = bonus.id;
        checkbox.checked = uiState.selectedTagBonusIds.has(bonus.id);

        const main = document.createElement('span');
        main.className = 'tag-bonus-main';

        const title = document.createElement('span');
        title.className = 'tag-bonus-title';
        title.textContent = `${bonus.tag} from ${bonus.sourceTileName}`;

        const context = document.createElement('span');
        context.className = 'tag-bonus-context';
        context.textContent = bonus.description || bonus.context;

        const steps = document.createElement('span');
        steps.className = 'tag-bonus-steps';
        steps.textContent = `+${bonus.steps}`;

        main.appendChild(title);
        main.appendChild(context);
        option.appendChild(checkbox);
        option.appendChild(main);
        option.appendChild(steps);
        els.tagBonusOptions.appendChild(option);
    });
}

export function updatePoolPreview() {
    const c1 = els.callColor1.value;
    const c2 = els.callColor2.value;
    const colors = [c1, c2].filter(c => c);

    // Update Dropzones visually
    els.callTileZone.innerHTML = uiState.callTile ? `<div class="badge">${escapeHtml(uiState.callTile.name)} (${escapeHtml(uiState.callTile.dice.join(', '))})</div>` : '';
    els.burnTilesZone.innerHTML = uiState.burnTiles.map(t => `<div class="badge" style="margin:2px">${escapeHtml(t.name)}</div>`).join('');

    const extraDice = getExtraDice();
    if (extraDice.error) {
        els.poolDiceDisplay.innerHTML = `<span style="color:#ff3333">${escapeHtml(extraDice.error)}</span>`;
        els.poolAddsDisplay.innerText = `Adds: --`;
        renderChainOptions([]);
        renderTagBonusOptions([]);
        if (document.querySelector('input[name="roll-mode"]:checked').value === 'manual') {
            els.manualInputsContainer.innerHTML = '';
        }
        return;
    }

    const res = poolEngine.compilePool(colors, dataManager.state.stats, uiState.callTile, uiState.burnTiles, dataManager.state.tiles, extraDice.dice, getPoolOptions());
    
    if (res.error) {
        els.poolDiceDisplay.innerHTML = `<span style="color:#ff3333">${escapeHtml(res.error)}</span>`;
        els.poolAddsDisplay.innerText = `Adds: --`;
        renderChainOptions(res.chainOptions || []);
        renderTagBonusOptions([]);
    } else {
        if (res.dice.length === 0) {
            els.poolDiceDisplay.innerText = 'No dice in pool.';
        } else {
            let diceStr = res.dice.map(d => escapeHtml(d.die)).join(' + ');
            if (res.dice.length % 2 !== 0) {
                diceStr += ' <span style="color: #ffaa00; font-size: 0.85em; margin-left: 0.5rem;" title="Odd number of dice significantly increases the odds of a haywire">⚠️ Odd Dice (Haywire Risk)</span>';
            }
            els.poolDiceDisplay.innerHTML = diceStr;
        }
        renderChainOptions(res.chainOptions || []);
        renderTagBonusOptions(res.tagBonuses || []);
        const selectedTagBonus = calculateSelectedTagBonus(res.tagBonuses || []);
        let addsText = `Adds (Keep): ${res.adds}`;
        if ((res.tagBonuses || []).length > 0) addsText += ` | Tag Bonus: +${selectedTagBonus}`;
        if ((res.resourceCosts || []).length > 0) addsText += ` | Costs: ${res.resourceCosts.map(cost => `${cost.amount} ${cost.resource.toUpperCase()}`).join(', ')}`;
        els.poolAddsDisplay.innerText = addsText;
    }

    // Update manual inputs if in manual mode
    if (document.querySelector('input[name="roll-mode"]:checked').value === 'manual') {
        renderManualInputs();
    }
}

export function renderManualInputs() {
    const c1 = els.callColor1.value;
    const c2 = els.callColor2.value;
    const colors = [c1, c2].filter(c => c);
    els.manualInputsContainer.innerHTML = '';

    const extraDice = getExtraDice();
    if (extraDice.error) return;

    const res = poolEngine.compilePool(colors, dataManager.state.stats, uiState.callTile, uiState.burnTiles, dataManager.state.tiles, extraDice.dice, getPoolOptions());
    if (res.error || res.dice.length === 0) return;

    res.dice.forEach((dObj) => {
        const div = document.createElement('div');
        div.className = 'manual-die-input';
        div.innerHTML = `
            <label>${escapeHtml(dObj.source)} - Roll for ${escapeHtml(dObj.die)}:</label>
            <input type="number" class="manual-val" data-die="${escapeHtml(dObj.die)}" data-source="${escapeHtml(dObj.source)}" min="1" max="${escapeHtml(dObj.die.replace('d',''))}" value="">
        `;
        els.manualInputsContainer.appendChild(div);
    });
}

export function executeVirtualRoll() {
    const c1 = els.callColor1.value;
    const c2 = els.callColor2.value;
    const colors = [c1, c2].filter(c => c);
    const extraDice = getExtraDice();
    if (extraDice.error) {
        alert(extraDice.error);
        return;
    }

    const res = poolEngine.compilePool(colors, dataManager.state.stats, uiState.callTile, uiState.burnTiles, dataManager.state.tiles, extraDice.dice, getPoolOptions());
    
    if (res.error || res.dice.length === 0) {
        alert(res.error || "No dice to roll.");
        return;
    }
    if (!applyResourceCosts(res.resourceCosts || [])) return;

    const rolled = poolEngine.rollPool(res.dice);
    const result = poolEngine.calculateOptimalTotal(rolled, res.adds);
    const appliedTagBonuses = getSelectedTagBonuses(res.tagBonuses || []);
    result.adds = res.adds;
    result.flatBonus = res.flatBonus || 0;
    result.appliedTagBonuses = appliedTagBonuses;
    result.ammoOptions = getAmmoResolutionOptions(res.calledTileIds || []);
    showResults(result);
    resetMosaicFilterAfterRoll();
    processBurns();
}

export function executeManualCalculate() {
    const inputs = els.manualInputsContainer.querySelectorAll('.manual-val');
    let rolled = [];
    let hasError = false;

    inputs.forEach(inp => {
        const val = parseInt(inp.value, 10);
        const dieStr = inp.dataset.die;
        const sourceStr = inp.dataset.source;
        const max = parseInt(dieStr.replace('d', ''), 10);
        if (isNaN(val) || val < 1 || val > max) {
            hasError = true;
        } else {
            rolled.push({ source: sourceStr, die: dieStr, val: val });
        }
    });

    if (hasError) {
        alert("Please enter a valid roll for every die, within that die's range.");
        return;
    }

    const c1 = els.callColor1.value;
    const c2 = els.callColor2.value;
    const colors = [c1, c2].filter(c => c);
    const extraDice = getExtraDice();
    if (extraDice.error) {
        alert(extraDice.error);
        return;
    }

    const res = poolEngine.compilePool(colors, dataManager.state.stats, uiState.callTile, uiState.burnTiles, dataManager.state.tiles, extraDice.dice, getPoolOptions());
    if (res.error || res.dice.length === 0) {
        alert(res.error || "No dice to calculate.");
        return;
    }
    if (!applyResourceCosts(res.resourceCosts || [])) return;

    const result = poolEngine.calculateOptimalTotal(rolled, res.adds);
    const appliedTagBonuses = getSelectedTagBonuses(res.tagBonuses || []);
    result.adds = res.adds;
    result.flatBonus = res.flatBonus || 0;
    result.appliedTagBonuses = appliedTagBonuses;
    result.ammoOptions = getAmmoResolutionOptions(res.calledTileIds || []);
    showResults(result);
    resetMosaicFilterAfterRoll();
    processBurns();
}

export function processBurns() {
    if (uiState.burnTiles.length > 0) {
        uiState.burnTiles
            .filter(t => !poolEngine.getUnavailableReason(t))
            .filter(t => !isHitchedTile(t))
            .forEach(t => {
            t.isBurnt = true;
            dataManager.updateTile(t);
        });
        uiState.callTile = null;
        uiState.burnTiles = [];
        renderCards();
        updatePoolPreview();
        updateShadowMax();
    }
}
