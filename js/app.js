import { DataManager, COLOR_HEX, STAT_COLORS } from './data.js';
import { PoolEngine } from './pool.js';
import { SpellBuilder } from './spellBuilder.js';

const dataManager = new DataManager();
const poolEngine = new PoolEngine();
let spellBuilder;

// UI State
let callTile = null; // single tile object
let burnTiles = [];  // array of tile objects
let currentFormTags = []; // tags array for modal

// DOM Elements
const els = {
    charName: document.getElementById('char-name'),
    valXpEarned: document.getElementById('val-xp-earned'),
    valXpSpent: document.getElementById('val-xp-spent'),
    valHp: document.getElementById('val-hp'),
    valHpMax: document.getElementById('val-hp-max'),
    valEn: document.getElementById('val-en'),
    valEnMax: document.getElementById('val-en-max'),
    valRx: document.getElementById('val-rx'),
    valRxMax: document.getElementById('val-rx-max'),
    valSh: document.getElementById('val-sh'),
    valShMax: document.getElementById('val-sh-max'),
    btnRest: document.getElementById('btn-rest'),
    btnNewChar: document.getElementById('btn-new-char'),
    btnCalcXp: document.getElementById('btn-calc-xp'),
    btnCalcVitals: document.getElementById('btn-calc-vitals'),
    statSelects: document.querySelectorAll('.stat-select'),
    cardContainer: document.getElementById('card-container'),
    btnAddTile: document.getElementById('btn-add-tile'),
    searchTiles: document.getElementById('search-tiles'),
    modal: document.getElementById('tile-modal'),
    form: document.getElementById('tile-form'),
    btnCancel: document.getElementById('btn-modal-cancel'),
    btnDelete: document.getElementById('btn-modal-delete'),
    
    tagSelect: document.getElementById('tag-select'),
    tagCustomInput: document.getElementById('tag-custom-input'),
    btnAddTag: document.getElementById('btn-add-tag'),
    tagsContainer: document.getElementById('selected-tags-container'),
    
    tileXp: document.getElementById('tile-xp'),
    btnEstimateXp: document.getElementById('btn-estimate-xp'),
    
    callColor1: document.getElementById('call-color-1'),
    callColor2: document.getElementById('call-color-2'),
    poolDiceDisplay: document.getElementById('pool-dice-display'),
    poolAddsDisplay: document.getElementById('pool-adds-display'),
    
    callTileZone: document.getElementById('call-tile-container'),
    burnTilesZone: document.getElementById('burn-tiles-container'),

    radioModes: document.querySelectorAll('input[name="roll-mode"]'),
    virtualSection: document.getElementById('virtual-roll-section'),
    manualSection: document.getElementById('manual-roll-section'),
    btnRoll: document.getElementById('btn-roll'),
    btnCalculate: document.getElementById('btn-calculate'),
    manualInputsContainer: document.getElementById('manual-inputs-container'),
    extraDiceInput: document.getElementById('extra-dice-input'),
    
    rollResults: document.getElementById('roll-results'),
    resultTotal: document.getElementById('result-total'),
    resultDetails: document.getElementById('result-details'),

    btnExport: document.getElementById('btn-export'),
    fileImport: document.getElementById('file-import')
};

// Math Utilities
const DIE_STEPS = { 'd4': 1, 'd6': 2, 'd8': 3, 'd10': 4, 'd12': 5, 'd14': 6, 'd16': 7 };
const BASE_XP = { 'd4': 1, 'd6': 3, 'd8': 6, 'd10': 10, 'd12': 15, 'd14': 21, 'd16': 28 };

function parseDiceString(str) {
    if (!str) return [];
    return str.split(',').map(s => s.trim().toLowerCase()).filter(s => DIE_STEPS[s]);
}

function calcAttributeXP(diceArray) {
    let xp = 0;
    let index = 0;
    for (let die of diceArray) {
        xp += BASE_XP[die] + index;
        index++;
    }
    return xp;
}

function calcAttributeSteps(diceArray) {
    let steps = 0;
    for (let die of diceArray) {
        steps += DIE_STEPS[die];
    }
    return steps;
}

// Initialize App
function init() {
    spellBuilder = new SpellBuilder(dataManager, renderAll);
    bindEvents();
    renderAll();
}

function bindEvents() {
    // Header
    els.charName.addEventListener('blur', (e) => dataManager.updateName(e.target.innerText));
    
    els.valXpEarned.addEventListener('change', (e) => {
        dataManager.state.xpEarned = parseInt(e.target.value, 10) || 0;
        dataManager.saveState();
        updateXpTracker();
    });

    els.valHp.addEventListener('change', (e) => dataManager.updateResource('hp', e.target.value));
    els.valHpMax.addEventListener('change', (e) => { dataManager.state.hpMax = e.target.value; dataManager.saveState(); });
    els.valEn.addEventListener('change', (e) => dataManager.updateResource('en', e.target.value));
    els.valEnMax.addEventListener('change', (e) => { dataManager.state.enMax = e.target.value; dataManager.saveState(); });
    els.valRx.addEventListener('change', (e) => dataManager.updateResource('rx', e.target.value));
    els.valRxMax.addEventListener('change', (e) => { dataManager.state.rxMax = e.target.value; dataManager.saveState(); });
    els.valSh.addEventListener('change', (e) => { dataManager.state.sh = e.target.value; dataManager.saveState(); });

    // Rest Button
    els.btnRest.addEventListener('click', () => {
        if (!confirm("Rest and recover all resources? This will un-burn all tiles.")) return;
        dataManager.state.hp = dataManager.state.hpMax;
        dataManager.state.en = dataManager.state.enMax;
        dataManager.state.rx = dataManager.state.rxMax;
        dataManager.state.sh = poolEngine.calculateShadowMax(dataManager.state.stats, dataManager.state.tiles);
        dataManager.state.tiles.forEach(t => t.isBurnt = false);
        dataManager.saveState();
        renderAll();
    });

    // New Character Button
    els.btnNewChar.addEventListener('click', () => {
        if (confirm("WARNING: This will completely clear your current character! Are you sure you want to start a blank character?")) {
            dataManager.clearState();
            callTile = null;
            burnTiles = [];
            renderAll();
        }
    });

    // Auto-Calculate Buttons
    els.btnCalcXp.addEventListener('click', updateXpTracker);

    els.btnCalcVitals.addEventListener('click', () => {
        // Calc HP: BODY, POWER, Red, Orange
        const bodySteps = calcAttributeSteps(parseDiceString(dataManager.state.stats['BODY']));
        const powerSteps = calcAttributeSteps(parseDiceString(dataManager.state.stats['POWER']));
        let hpTiles = 0;
        
        // Calc EN: SOUL, FOCUS, Yellow, Green
        const soulSteps = calcAttributeSteps(parseDiceString(dataManager.state.stats['SOUL']));
        const focusSteps = calcAttributeSteps(parseDiceString(dataManager.state.stats['FOCUS']));
        let enTiles = 0;
        
        // Calc RX: MIND, SPEED, Blue, Purple
        const mindSteps = calcAttributeSteps(parseDiceString(dataManager.state.stats['MIND']));
        const speedSteps = calcAttributeSteps(parseDiceString(dataManager.state.stats['SPEED']));
        let rxTiles = 0;
        
        dataManager.state.tiles.forEach(t => {
            if (t.colors.includes('Red') || t.colors.includes('Orange')) hpTiles++;
            if (t.colors.includes('Yellow') || t.colors.includes('Green')) enTiles++;
            if (t.colors.includes('Blue') || t.colors.includes('Purple')) rxTiles++;
        });
        
        dataManager.state.hpMax = bodySteps + powerSteps + hpTiles;
        dataManager.state.hp = dataManager.state.hpMax;
        
        dataManager.state.enMax = soulSteps + focusSteps + enTiles;
        dataManager.state.en = dataManager.state.enMax;
        
        dataManager.state.rxMax = mindSteps + speedSteps + rxTiles;
        dataManager.state.rx = dataManager.state.rxMax;
        
        dataManager.saveState();
        renderAll();
    });

    // Export/Import
    els.btnExport.addEventListener('click', () => dataManager.exportState());
    els.fileImport.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (dataManager.importState(ev.target.result)) {
                renderAll();
            } else {
                alert("Failed to import invalid file.");
            }
        };
        reader.readAsText(file);
    });

    // Stats
    els.statSelects.forEach(sel => {
        sel.addEventListener('change', (e) => {
            dataManager.updateStat(e.target.dataset.stat, e.target.value);
            updatePoolPreview();
            updateXpTracker();
            updateShadowMax();
        });
    });

    // Search
    if (els.searchTiles) {
        els.searchTiles.addEventListener('input', () => renderCards());
    }

    // Modal
    els.btnAddTile.addEventListener('click', () => openModal());
    els.btnCancel.addEventListener('click', closeModal);
    els.btnDelete.addEventListener('click', () => {
        const id = document.getElementById('tile-id').value;
        if (id) {
            dataManager.deleteTile(id);
            if (callTile && callTile.id === id) callTile = null;
            burnTiles = burnTiles.filter(t => t.id !== id);
            closeModal();
            renderCards();
            updatePoolPreview();
        }
    });

    // Tags UI
    els.tagSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'Custom' || val === 'Chain') {
            els.tagCustomInput.style.display = 'inline-block';
            els.tagCustomInput.placeholder = val === 'Chain' ? 'Tile Name to Chain' : 'Custom Tag Name';
            els.tagCustomInput.focus();
        } else {
            els.tagCustomInput.style.display = 'none';
        }
    });

    els.btnAddTag.addEventListener('click', () => {
        const selVal = els.tagSelect.value;
        let finalTag = '';
        
        if (!selVal) return;
        
        if (selVal === 'Custom') {
            finalTag = els.tagCustomInput.value.trim();
        } else if (selVal === 'Chain') {
            const target = els.tagCustomInput.value.trim();
            if (target) finalTag = `Chain ${target}`;
        } else {
            finalTag = selVal;
        }

        if (finalTag && !currentFormTags.includes(finalTag)) {
            currentFormTags.push(finalTag);
            renderFormTags();
            els.tagSelect.value = '';
            els.tagCustomInput.value = '';
            els.tagCustomInput.style.display = 'none';
        }
    });

    els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveTileFromForm();
    });

    // XP Estimation
    els.btnEstimateXp.addEventListener('click', () => {
        const diceStr = document.getElementById('tile-dice').value.trim();
        const diceArray = diceStr.split(',').map(s => s.trim().toLowerCase()).filter(s => s.startsWith('d'));
        const xp = poolEngine.estimateTileXp(diceArray, currentFormTags);
        els.tileXp.value = xp;
    });

    // Dashboard Actions
    els.callColor1.addEventListener('change', updatePoolPreview);
    els.callColor2.addEventListener('change', updatePoolPreview);
    els.extraDiceInput.addEventListener('input', updatePoolPreview);

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

function renderAll() {
    els.charName.innerText = dataManager.state.name;
    els.valXpEarned.value = dataManager.state.xpEarned || 75;
    els.valHp.value = dataManager.state.hp ?? 0;
    els.valHpMax.value = dataManager.state.hpMax ?? 0;
    els.valEn.value = dataManager.state.en ?? 0;
    els.valEnMax.value = dataManager.state.enMax ?? 0;
    els.valRx.value = dataManager.state.rx ?? 0;
    els.valRxMax.value = dataManager.state.rxMax ?? 0;
    els.valSh.value = dataManager.state.sh || 0;

    // Apply stat values and dynamic borders
    els.statSelects.forEach(sel => {
        const stat = sel.dataset.stat;
        sel.value = dataManager.state.stats[stat];
        const colorName = STAT_COLORS[stat];
        sel.parentElement.style.borderTopColor = COLOR_HEX[colorName] || '#fff';
    });

    renderCards();
    updatePoolPreview();
    updateXpTracker();
    updateShadowMax();
}

function updateShadowMax() {
    const shMax = poolEngine.calculateShadowMax(dataManager.state.stats, dataManager.state.tiles);
    els.valShMax.innerText = shMax;
}

function updateXpTracker() {
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

function renderCards() {
    els.cardContainer.innerHTML = '';
    
    let searchTerm = '';
    if (els.searchTiles) {
        searchTerm = els.searchTiles.value.toLowerCase().trim();
    }
    
    const filteredTiles = dataManager.state.tiles.filter(tile => {
        if (!searchTerm) return true;
        const searchableText = `${tile.name} ${(tile.colors || []).join(' ')} ${tile.type || 'Skill'} ${tile.tags || ''} ${tile.description || ''}`.toLowerCase();
        return searchableText.includes(searchTerm);
    });

    filteredTiles.forEach(tile => {
        const div = document.createElement('div');
        div.className = 'tile-card';
        
        // Gradient background based on 2 colors
        let c1 = COLOR_HEX[tile.colors[0]] || '#444';
        let c2 = COLOR_HEX[tile.colors[1]] || c1;
        div.style.background = `linear-gradient(135deg, ${c1}44, ${c2}44)`;
        div.style.border = `1px solid ${c1}88`;

        if (callTile && callTile.id === tile.id) div.classList.add('selected-call');
        if (burnTiles.some(t => t.id === tile.id)) div.classList.add('selected-burn');
        if (tile.isBurnt) div.classList.add('tile-burnt');

        div.innerHTML = `
            <div class="tile-badges">
                ${tile.colors.map(c => `<span class="badge" style="background:${COLOR_HEX[c]}; color:${c==='White'||c==='Yellow'?'black':'white'}">${c}</span>`).join('')}
                ${tile.type ? `<span class="badge tile-type-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);">${tile.type.toUpperCase()}</span>` : `<span class="badge tile-type-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);">SKILL</span>`}
                <span class="badge" style="background: rgba(255, 215, 0, 0.2); color: #ffd700; border: 1px solid #ffd700; margin-left: auto;">${tile.xpCost !== undefined ? tile.xpCost : 0} XP</span>
            </div>
            <div class="tile-card-content">
                <div class="tile-name">${tile.name}</div>
                <div class="tile-tags">${tile.tags}</div>
                <div class="tile-dice">${tile.dice.join(', ')}</div>
                <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
                    <button class="btn-edit-tile" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; cursor: pointer;">✏️ Edit</button>
                    ${tile.description ? `<button class="btn-details" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; cursor: pointer;">Details ▼</button>` : ''}
                </div>
                ${tile.description ? `<div class="tile-description" style="display: none; margin-top: 0.5rem; font-size: 0.9rem; font-style: italic; color: var(--text-secondary); background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px; white-space: pre-wrap;">${tile.description}</div>` : ''}
            </div>
            ${tile.isBurnt 
                ? `<button class="btn-unburn" title="Un-burn this tile">🔥 Restore</button>`
                : `<button class="btn-burn-instant" title="Burn this tile instantly">🔥 Burn</button>`
            }
        `;

        if (tile.isBurnt) {
            const btnUnburn = div.querySelector('.btn-unburn');
            btnUnburn.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isBurnt = false;
                dataManager.updateTile(tile);
                renderCards();
            });
        } else {
            const btnBurn = div.querySelector('.btn-burn-instant');
            btnBurn.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isBurnt = true;
                if (callTile && callTile.id === tile.id) callTile = null;
                burnTiles = burnTiles.filter(t => t.id !== tile.id);
                dataManager.updateTile(tile);
                renderCards();
                updatePoolPreview();
            });
        }

        const btnEdit = div.querySelector('.btn-edit-tile');
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            if (tile.isSpell) {
                spellBuilder.openWizard(tile);
            } else {
                openModal(tile);
            }
        });

        if (tile.description) {
            const btnDetails = div.querySelector('.btn-details');
            const descDiv = div.querySelector('.tile-description');
            btnDetails.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent card selection
                if (descDiv.style.display === 'none') {
                    descDiv.style.display = 'block';
                    btnDetails.innerText = 'Details ▲';
                } else {
                    descDiv.style.display = 'none';
                    btnDetails.innerText = 'Details ▼';
                }
            });
        }

        // Click to Select for Pool
        div.addEventListener('click', () => handleCardClick(tile));
        
        // Long press or right click to Edit
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (tile.isSpell) {
                spellBuilder.openWizard(tile);
            } else {
                openModal(tile);
            }
        });

        els.cardContainer.appendChild(div);
    });
}

function handleCardClick(tile) {
    if (tile.isBurnt) {
        // Cannot select burnt tiles
        return;
    }
    
    if (callTile && callTile.id === tile.id) {
        // Deselect call
        callTile = null;
    } else if (burnTiles.some(t => t.id === tile.id)) {
        // Deselect burn
        burnTiles = burnTiles.filter(t => t.id !== tile.id);
    } else {
        // Add to pool. If no call tile, make it call. Else make it burn.
        if (!callTile) {
            callTile = tile;
        } else {
            burnTiles.push(tile);
        }
    }
    renderCards();
    updatePoolPreview();
}

function getExtraDice() {
    const val = els.extraDiceInput.value.trim();
    if (!val) return [];
    return val.split(',').map(s => s.trim().toLowerCase()).filter(s => s.startsWith('d'));
}

function updatePoolPreview() {
    const c1 = els.callColor1.value;
    const c2 = els.callColor2.value;
    const colors = [c1, c2].filter(c => c);

    // Update Dropzones visually
    els.callTileZone.innerHTML = callTile ? `<div class="badge">${callTile.name} (${callTile.dice.join(', ')})</div>` : '';
    els.burnTilesZone.innerHTML = burnTiles.map(t => `<div class="badge" style="margin:2px">${t.name}</div>`).join('');

    const extraDice = getExtraDice();
    const res = poolEngine.compilePool(colors, dataManager.state.stats, callTile, burnTiles, dataManager.state.tiles, extraDice);
    
    if (res.error) {
        els.poolDiceDisplay.innerHTML = `<span style="color:#ff3333">${res.error}</span>`;
        els.poolAddsDisplay.innerText = `Adds: --`;
    } else {
        if (res.dice.length === 0) {
            els.poolDiceDisplay.innerText = 'No dice in pool.';
        } else {
            els.poolDiceDisplay.innerText = res.dice.map(d => d.die).join(' + ');
        }
        let addsText = `Adds (Keep): ${res.adds}`;
        if (res.flatBonus > 0) addsText += ` | Bonus: +${res.flatBonus}`;
        els.poolAddsDisplay.innerText = addsText;
    }

    // Update manual inputs if in manual mode
    if (document.querySelector('input[name="roll-mode"]:checked').value === 'manual') {
        renderManualInputs();
    }
}

function renderManualInputs() {
    const c1 = els.callColor1.value;
    const c2 = els.callColor2.value;
    const colors = [c1, c2].filter(c => c);
    const extraDice = getExtraDice();
    const res = poolEngine.compilePool(colors, dataManager.state.stats, callTile, burnTiles, dataManager.state.tiles, extraDice);
    
    els.manualInputsContainer.innerHTML = '';
    if (res.error || res.dice.length === 0) return;

    res.dice.forEach((dObj, idx) => {
        const div = document.createElement('div');
        div.className = 'manual-die-input';
        div.innerHTML = `
            <label>${dObj.source} - Roll for ${dObj.die}:</label>
            <input type="number" class="manual-val" data-die="${dObj.die}" data-source="${dObj.source}" min="1" max="${dObj.die.replace('d','')}" value="">
        `;
        els.manualInputsContainer.appendChild(div);
    });
}

function executeVirtualRoll() {
    const c1 = els.callColor1.value;
    const c2 = els.callColor2.value;
    const colors = [c1, c2].filter(c => c);
    const extraDice = getExtraDice();
    const res = poolEngine.compilePool(colors, dataManager.state.stats, callTile, burnTiles, dataManager.state.tiles, extraDice);
    
    if (res.error || res.dice.length === 0) {
        alert(res.error || "No dice to roll.");
        return;
    }

    const rolled = poolEngine.rollPool(res.dice);
    const result = poolEngine.calculateOptimalTotal(rolled, res.adds);
    result.total += res.flatBonus;
    result.flatBonus = res.flatBonus;
    showResults(result);
    processBurns();
}

function executeManualCalculate() {
    const inputs = els.manualInputsContainer.querySelectorAll('.manual-val');
    let rolled = [];
    let hasError = false;

    inputs.forEach(inp => {
        const val = parseInt(inp.value, 10);
        const dieStr = inp.dataset.die;
        const sourceStr = inp.dataset.source;
        if (isNaN(val)) {
            hasError = true;
        } else {
            rolled.push({ source: sourceStr, die: dieStr, val: val });
        }
    });

    if (hasError) {
        alert("Please enter a valid number for all dice.");
        return;
    }

    const c1 = els.callColor1.value;
    const c2 = els.callColor2.value;
    const colors = [c1, c2].filter(c => c);
    const extraDice = getExtraDice();
    const res = poolEngine.compilePool(colors, dataManager.state.stats, callTile, burnTiles, dataManager.state.tiles, extraDice);

    const result = poolEngine.calculateOptimalTotal(rolled, res.adds);
    result.total += res.flatBonus;
    result.flatBonus = res.flatBonus;
    showResults(result);
    processBurns();
}

function processBurns() {
    if (burnTiles.length > 0) {
        burnTiles.forEach(t => {
            t.isBurnt = true;
            dataManager.updateTile(t);
        });
        callTile = null;
        burnTiles = [];
        renderCards();
        updatePoolPreview();
        updateShadowMax();
    }
}

function showResults(result) {
    els.rollResults.style.display = 'block';
    els.resultTotal.innerText = result.total;
    
    // Group all rolls by source
    const groups = {};
    result.originalRolls.forEach(r => {
        if (!groups[r.source]) groups[r.source] = [];
        groups[r.source].push(`<strong>${r.die}:</strong> ${r.val}`);
    });
    const allRollsStr = Object.entries(groups).map(([source, rolls]) => {
        return `<div style="margin-top: 4px; padding-left: 10px; border-left: 2px solid var(--glass-border);"><em>${source}</em>: ${rolls.join(' | ')}</div>`;
    }).join('');

    const keepStr = result.kept.map(k => `[${k.val}]`).join(' + ');
    
    let haywireHtml = '';
    if (result.isHaywire) {
        haywireHtml = `<div style="color: #ff3333; font-weight: bold; margin: 10px 0; border: 1px dashed #ff3333; padding: 5px; background: rgba(255, 51, 51, 0.1);">⚠️ HAYWIRE! (More than half the dice rolled 1)</div>`;
    }
    
    let bonusHtml = '';
    if (result.flatBonus > 0) {
        bonusHtml = `<p><strong>Bonus:</strong> +${result.flatBonus} (From Tags)</p>`;
    }

    els.resultDetails.innerHTML = `
        ${haywireHtml}
        <div style="margin-bottom: 0.5rem; color: #a0aab5;">
            <p style="margin: 0; text-decoration: underline;">All Rolls by Source:</p>
            ${allRollsStr}
        </div>
        <p><strong>Optimal Kept:</strong> ${keepStr}</p>
        ${bonusHtml}
    `;
}

// Modal Form Logic
function openModal(tile = null) {
    els.modal.classList.add('active');
    els.form.reset();
    document.querySelectorAll('.color-cb').forEach(cb => cb.checked = false);
    currentFormTags = [];
    els.tagCustomInput.style.display = 'none';

    if (tile) {
        document.getElementById('modal-title').innerText = 'Edit Tile';
        document.getElementById('tile-id').value = tile.id;
        document.getElementById('tile-type').value = tile.type || 'Skill';
        document.getElementById('tile-name').value = tile.name;
        document.getElementById('tile-description').value = tile.description || '';
        document.getElementById('tile-dice').value = tile.dice.join(', ');
        if (tile.tags) {
            currentFormTags = tile.tags.split(',').map(t => t.trim()).filter(t => t);
        }
        
        tile.colors.forEach(c => {
            const cb = document.querySelector(`.color-cb[value="${c}"]`);
            if (cb) cb.checked = true;
        });
        els.tileXp.value = tile.xpCost || 0;
        els.btnDelete.style.display = 'inline-block';
    } else {
        document.getElementById('modal-title').innerText = 'Add Tile';
        document.getElementById('tile-id').value = '';
        document.getElementById('tile-type').value = 'Skill';
        document.getElementById('tile-description').value = '';
        els.tileXp.value = 0;
        els.btnDelete.style.display = 'none';
    }
    
    renderFormTags();
}

function renderFormTags() {
    els.tagsContainer.innerHTML = '';
    currentFormTags.forEach(tag => {
        const div = document.createElement('div');
        div.className = 'badge';
        div.style.background = 'rgba(255,255,255,0.2)';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '0.3rem';
        div.innerHTML = `
            ${tag}
            <span style="cursor: pointer; color: #ff3333; font-weight: bold;" onclick="removeTag('${tag}')">×</span>
        `;
        els.tagsContainer.appendChild(div);
    });
}

window.removeTag = function(tag) {
    currentFormTags = currentFormTags.filter(t => t !== tag);
    renderFormTags();
};

function closeModal() {
    els.modal.classList.remove('active');
}

function saveTileFromForm() {
    const id = document.getElementById('tile-id').value;
    const type = document.getElementById('tile-type').value;
    const name = document.getElementById('tile-name').value.trim();
    const description = document.getElementById('tile-description').value.trim();
    const diceStr = document.getElementById('tile-dice').value.trim();
    const tags = currentFormTags.join(', ');
    const xpCost = parseInt(els.tileXp.value, 10) || 0;
    
    const checkedColors = Array.from(document.querySelectorAll('.color-cb:checked')).map(cb => cb.value);

    if (checkedColors.length !== 2) {
        alert('Please select exactly 2 colors.');
        return;
    }

    const diceArray = diceStr.split(',').map(s => s.trim().toLowerCase()).filter(s => s.startsWith('d'));
    if (diceArray.length === 0) {
        alert('Please enter at least one valid die (e.g., d4).');
        return;
    }

    const tile = {
        id: id || null,
        type,
        name,
        description,
        colors: checkedColors,
        dice: diceArray,
        tags,
        xpCost
    };

    if (id) {
        dataManager.updateTile(tile);
        // Update pool selections if modified
        if (callTile && callTile.id === id) callTile = tile;
        burnTiles = burnTiles.map(t => t.id === id ? tile : t);
    } else {
        dataManager.addTile(tile);
    }

    closeModal();
    renderCards();
    updatePoolPreview();
    updateXpTracker();
}

// Start
init();
