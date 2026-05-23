import { DataManager, COLOR_HEX, STAT_COLORS } from './data.js';
import {
    PoolEngine,
    escapeHtml,
    parseDiceInput,
    parseDiceString,
    getDiceValidationMessage,
    formatTagLimitStatus,
    tagLimitErrorMessage
} from './pool.js';
import { SpellBuilder } from './spellBuilder.js';
import { uiState } from './state.js';
import { els } from './els.js';

const dataManager = new DataManager();
const poolEngine = new PoolEngine();
let spellBuilder;

// Modal-local: tags being edited in the tile modal. Stays here because no
// other module reads or writes it.
let currentFormTags = [];

// Math Utilities
const BASE_XP = { 'd3': 0, 'd4': 1, 'd6': 3, 'd8': 6, 'd10': 10, 'd12': 15, 'd14': 21, 'd16': 28 };

// Armor base (page 29): material x coverage. Coverage sets intrinsic Base Soak.
const ARMOR_MATERIALS = new Set(['Soft', 'Hard']);
const ARMOR_COVERAGE_SOAK = { Open: 0, Full: 1, Closed: 3 };

function formatArmorBase(armorType) {
    if (!armorType || !ARMOR_MATERIALS.has(armorType.material) || !(armorType.coverage in ARMOR_COVERAGE_SOAK)) {
        return '';
    }
    const soak = ARMOR_COVERAGE_SOAK[armorType.coverage];
    return `${armorType.coverage} ${armorType.material} Armor · Base Soak +${soak}`;
}

function getFormArmorType() {
    if (document.getElementById('tile-type').value !== 'Gear') return null;
    const material = document.getElementById('armor-material').value;
    const coverage = document.getElementById('armor-coverage').value;
    if (ARMOR_MATERIALS.has(material) && coverage in ARMOR_COVERAGE_SOAK) {
        return { material, coverage };
    }
    return null;
}

const RESOLUTION_MODES = {
    action: {
        label: 'Action',
        options: [
            { value: 'action', label: 'Roll' },
            { value: 'unused', label: 'Unused' }
        ]
    },
    attack: {
        label: 'Attack',
        options: [
            { value: 'attack', label: 'Attack' },
            { value: 'impact', label: 'Impact' },
            { value: 'unused', label: 'Unused' }
        ]
    },
    defense: {
        label: 'Defense',
        options: [
            { value: 'evasion', label: 'Evasion' },
            { value: 'grit', label: 'Grit' },
            { value: 'unused', label: 'Unused' }
        ]
    },
    healing: {
        label: 'Healing',
        options: [
            { value: 'diagnosis', label: 'Diagnosis Roll' },
            { value: 'heal_energy', label: 'Heal Energy (6)' },
            { value: 'heal_health', label: 'Heal Health (8)' },
            { value: 'heal_reflex', label: 'Heal Reflex (10)' },
            { value: 'fading_crit', label: 'All Fading Crits (6)' },
            { value: 'afire', label: 'Afire -> Down (4)' },
            { value: 'sticky_crit', label: 'Sticky Crit (8)' },
            { value: 'burned_tile', label: 'Burned Tile (10)' },
            { value: 'wound', label: 'Wound (12)' },
            { value: 'unused', label: 'Unused' }
        ]
    }
};

const HEALING_TARGETS = {
    afire: { label: 'Afire -> Down', difficulty: 4, kind: 'count' },
    heal_energy: { label: 'Energy', difficulty: 6, kind: 'resource' },
    fading_crit: { label: 'All Fading Crits', difficulty: 6, kind: 'count' },
    heal_health: { label: 'Health', difficulty: 8, kind: 'resource' },
    sticky_crit: { label: 'Sticky Crit', difficulty: 8, kind: 'count' },
    heal_reflex: { label: 'Reflex', difficulty: 10, kind: 'resource' },
    burned_tile: { label: 'Burned Tile', difficulty: 10, kind: 'count' },
    wound: { label: 'Wound', difficulty: 12, kind: 'count' }
};

const RESOLUTION_PLUS_BUCKETS = {
    attack: new Set(['attack', 'impact']),
    defense: new Set(['evasion', 'grit']),
    healing: new Set(['diagnosis', 'heal_energy', 'heal_health', 'heal_reflex'])
};

function renderTagLimitStatus(el, diceStr, tagsArray) {
    if (!el) return null;

    el.classList.remove('valid', 'invalid');

    if (!diceStr.trim()) {
        el.textContent = 'Enter dice to check the tag limit.';
        return null;
    }

    const { dice, invalid } = parseDiceInput(diceStr);
    if (invalid.length > 0) {
        el.textContent = getDiceValidationMessage('Dice');
        el.classList.add('invalid');
        return null;
    }

    const tagLimit = poolEngine.calculateTagLimit(dice, tagsArray);
    el.textContent = formatTagLimitStatus(tagLimit);
    el.classList.add(tagLimit.valid ? 'valid' : 'invalid');
    return tagLimit;
}

function renderTileTagLimitStatus() {
    return renderTagLimitStatus(els.tileTagLimitStatus, els.tileDice.value, currentFormTags);
}

function renderOptionalStatsVisibility() {
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

function calcAttributeXP(diceArray) {
    let xp = 0;
    let index = 0;
    for (let die of diceArray) {
        xp += BASE_XP[die] + index;
        index++;
    }
    return xp;
}

// Initialize App
function init() {
    spellBuilder = new SpellBuilder(dataManager, renderAll);
    bindEvents();
    renderAll();
}

function bindEvents() {
    // Header
    els.charName.addEventListener('blur', (e) => {
        dataManager.updateName(e.target.value);
        renderRosterSelect();
    });
    
    if (els.charRosterSelect) {
        els.charRosterSelect.addEventListener('change', (e) => {
            dataManager.switchCharacter(e.target.value);
            uiState.callTile = null;
            uiState.burnTiles = [];
            renderAll();
        });
    }

    if (els.btnDelChar) {
        els.btnDelChar.addEventListener('click', () => {
            if (confirm("WARNING: Are you sure you want to delete this character permanently?")) {
                dataManager.deleteCurrentCharacter();
                uiState.callTile = null;
                uiState.burnTiles = [];
                renderAll();
            }
        });
    }
    
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

    // Info Modal
    els.btnInfo.addEventListener('click', () => els.infoModal.classList.add('active'));
    els.btnInfoClose.addEventListener('click', () => els.infoModal.classList.remove('active'));
    els.infoModal.addEventListener('click', (e) => {
        if (e.target === els.infoModal) els.infoModal.classList.remove('active');
    });

    els.valHp.addEventListener('change', (e) => dataManager.updateResource('hp', e.target.value));
    els.valEn.addEventListener('change', (e) => dataManager.updateResource('en', e.target.value));
    els.valRx.addEventListener('change', (e) => dataManager.updateResource('rx', e.target.value));
    els.valSh.addEventListener('change', (e) => { dataManager.state.sh = e.target.value; dataManager.saveState(); });

    // Vital Edit Buttons
    document.querySelectorAll('.btn-edit-vital').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.vital; // hp, en, or rx
            const labels = { hp: 'Health (HP)', en: 'Energy (EN)', rx: 'Reflex (RX)', sh: 'Shadow (SH)' };
            els.vitalModalTitle.innerText = `Edit ${labels[key]} Bonuses`;
            els.vitalModalKey.value = key;
            els.vitalPermInput.value = dataManager.state[key + 'Perm'] || 0;
            els.vitalTempInput.value = dataManager.state[key + 'Temp'] || 0;
            els.vitalModal.classList.add('active');
        });
    });

    els.btnVitalCancel.addEventListener('click', () => {
        els.vitalModal.classList.remove('active');
    });

    els.btnVitalSave.addEventListener('click', () => {
        const key = els.vitalModalKey.value;
        dataManager.state[key + 'Perm'] = parseInt(els.vitalPermInput.value, 10) || 0;
        dataManager.state[key + 'Temp'] = parseInt(els.vitalTempInput.value, 10) || 0;
        dataManager.saveState();
        els.vitalModal.classList.remove('active');
        renderAll();
    });

    // Rest Button
    els.btnRest.addEventListener('click', () => {
        if (!confirm("Rest and recover all resources? This will un-burn all tiles.")) return;
        dataManager.state.hp = (dataManager.state.hpMax || 0) + (dataManager.state.hpPerm || 0) + (dataManager.state.hpTemp || 0);
        dataManager.state.en = (dataManager.state.enMax || 0) + (dataManager.state.enPerm || 0) + (dataManager.state.enTemp || 0);
        dataManager.state.rx = (dataManager.state.rxMax || 0) + (dataManager.state.rxPerm || 0) + (dataManager.state.rxTemp || 0);
        dataManager.state.sh = poolEngine.calculateShadowMax(dataManager.state.tiles) + (dataManager.state.shPerm || 0) + (dataManager.state.shTemp || 0);
        dataManager.state.tiles.forEach(t => t.isBurnt = false);
        dataManager.saveState();
        renderAll();
    });

    // New Character Button
    els.btnNewChar.addEventListener('click', () => {
        const name = prompt("Enter a name for your new character:");
        if (name) {
            dataManager.createNewCharacter(name);
            uiState.callTile = null;
            uiState.burnTiles = [];
            renderAll();
        }
    });

    // Auto-Calculate Buttons
    els.btnCalcXp.addEventListener('click', updateXpTracker);

    els.btnCalcVitals.addEventListener('click', () => {
        const resourceMaxes = poolEngine.calculateResourceMaxes(dataManager.state.tiles);

        dataManager.state.hpMax = resourceMaxes.hp;
        dataManager.state.hp = dataManager.state.hpMax + (dataManager.state.hpPerm || 0) + (dataManager.state.hpTemp || 0);

        dataManager.state.enMax = resourceMaxes.en;
        dataManager.state.en = dataManager.state.enMax + (dataManager.state.enPerm || 0) + (dataManager.state.enTemp || 0);

        dataManager.state.rxMax = resourceMaxes.rx;
        dataManager.state.rx = dataManager.state.rxMax + (dataManager.state.rxPerm || 0) + (dataManager.state.rxTemp || 0);

        const shBase = resourceMaxes.sh;
        const shEffMax = shBase + (dataManager.state.shPerm || 0) + (dataManager.state.shTemp || 0);
        dataManager.state.sh = shEffMax;
        
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
            const overwrite = confirm("Do you want to overwrite your current character? (Click 'Cancel' to import as a new character slot)");
            if (dataManager.importState(ev.target.result, overwrite)) {
                uiState.callTile = null;
                uiState.burnTiles = [];
                renderAll();
            } else {
                alert("Failed to import invalid file.");
            }
            els.fileImport.value = '';
        };
        reader.readAsText(file);
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

    // Search
    if (els.searchTiles) {
        els.searchTiles.addEventListener('input', () => renderCards());
        if (els.sortTilesBy) els.sortTilesBy.addEventListener('change', () => renderCards());
        if (els.ignoreFavoritesSort) els.ignoreFavoritesSort.addEventListener('change', () => renderCards());
        if (els.btnSortDir) {
            els.btnSortDir.addEventListener('click', () => {
                const dir = els.btnSortDir.dataset.dir === 'asc' ? 'desc' : 'asc';
                els.btnSortDir.dataset.dir = dir;
                els.btnSortDir.innerHTML = dir === 'asc' ? '↓' : '↑';
                renderCards();
            });
        }
    }

    // Modal
    els.btnAddTile.addEventListener('click', () => openModal());
    els.btnCancel.addEventListener('click', closeModal);
    els.btnDelete.addEventListener('click', () => {
        const id = document.getElementById('tile-id').value;
        if (id) {
            dataManager.deleteTile(id);
            if (uiState.callTile && uiState.callTile.id === id) uiState.callTile = null;
            uiState.burnTiles = uiState.burnTiles.filter(t => t.id !== id);
            closeModal();
            renderCards();
            updatePoolPreview();
        }
    });

    // Tags UI
    els.tagSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const motorizedStat = document.getElementById('tag-motorized-stat');
        if (val === 'Custom' || val === 'Chain') {
            els.tagCustomInput.style.display = 'inline-block';
            els.tagCustomInput.placeholder = val === 'Chain' ? 'Tile Name to Chain' : 'Custom Tag Name';
            els.tagCustomInput.focus();
            motorizedStat.style.display = 'none';
        } else if (val === 'Motorized') {
            els.tagCustomInput.style.display = 'none';
            motorizedStat.style.display = 'block';
        } else {
            els.tagCustomInput.style.display = 'none';
            motorizedStat.style.display = 'none';
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
        } else if (selVal === 'Motorized') {
            const stat = document.getElementById('tag-motorized-stat').value;
            if (!stat) {
                alert('Select a stat for the Motorized tag.');
                return;
            }
            finalTag = `Motorized: ${stat}`;
        } else {
            finalTag = selVal;
        }

        if (finalTag) {
            const isExempt = document.getElementById('tag-exempt').checked;
            if (isExempt) {
                finalTag = `${finalTag} (Exempt)`;
            }
        }

        if (finalTag && !currentFormTags.includes(finalTag)) {
            currentFormTags.push(finalTag);
            renderFormTags();
            els.tagSelect.value = '';
            els.tagCustomInput.value = '';
            els.tagCustomInput.style.display = 'none';
            const motorizedStat = document.getElementById('tag-motorized-stat');
            motorizedStat.style.display = 'none';
            motorizedStat.value = '';
            document.getElementById('tag-exempt').checked = false;
        }
    });

    els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveTileFromForm();
    });

    els.tileDice.addEventListener('input', renderTileTagLimitStatus);

    // XP Estimation
    els.btnEstimateXp.addEventListener('click', () => {
        const diceStr = document.getElementById('tile-dice').value.trim();
        const { dice: diceArray, invalid } = parseDiceInput(diceStr);
        if (invalid.length > 0) {
            alert(getDiceValidationMessage('Tile dice'));
            return;
        }
        const xp = poolEngine.estimateTileXp(diceArray, currentFormTags, getFormArmorType());
        els.tileXp.value = xp;
    });

    // Dashboard Actions
    els.callColor1.addEventListener('change', () => { updatePoolPreview(); if (els.autoFilterCall.checked) renderCards(); });
    els.callColor2.addEventListener('change', () => { updatePoolPreview(); if (els.autoFilterCall.checked) renderCards(); });
    els.autoFilterCall.addEventListener('change', renderCards);
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

    els.resolutionControls.addEventListener('change', (e) => {
        if (!uiState.lastRollResult) return;

        if (e.target.id === 'resolution-mode') {
            uiState.currentResolutionMode = e.target.value;
            uiState.currentResolutionAssignments = getDefaultResolutionAssignments(uiState.lastRollResult, uiState.currentResolutionMode);
            renderResolution();
            return;
        }

        if (e.target.classList.contains('resolution-die-select')) {
            uiState.currentResolutionAssignments[e.target.dataset.rollId] = e.target.value;
            renderResolution();
            return;
        }

        if (e.target.id === 'healing-in-combat') {
            uiState.healingInCombat = e.target.checked;
            renderResolutionDetails();
            return;
        }

        if (e.target.classList.contains('resolution-extra')) {
            renderResolutionDetails();
        }
    });

    els.resolutionControls.addEventListener('input', (e) => {
        if (!uiState.lastRollResult || !e.target.classList.contains('resolution-extra')) return;
        renderResolutionDetails();
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

    // Journal
    els.btnAddJournal.addEventListener('click', () => {
        if (!dataManager.state.journal) dataManager.state.journal = [];
        const title = prompt('Enter a title for this journal entry:', 'Session Notes');
        if (!title) return;
        dataManager.state.journal.push({
            id: Date.now().toString(),
            title: title,
            content: ''
        });
        dataManager.saveState();
        renderJournal();
    });
}

function renderJournal() {
    const container = els.journalContainer;
    const entries = dataManager.state.journal || [];
    
    if (entries.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No journal entries yet. Click "+ New Entry" to get started.</p>';
        return;
    }
    
    container.innerHTML = '';
    entries.forEach((entry, idx) => {
        const div = document.createElement('div');
        div.className = 'journal-entry';
        div.innerHTML = `
            <div class="journal-entry-header">
                <h3>${escapeHtml(entry.title)}</h3>
                <div class="journal-actions">
                    <button class="btn-rename-journal" title="Rename">✏️</button>
                    <button class="btn-toggle-journal" title="Expand/Collapse">▼</button>
                    <button class="btn-delete-journal" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="journal-entry-body" style="display: none;">
                <textarea placeholder="Write your notes here...">${escapeHtml(entry.content || '')}</textarea>
            </div>
        `;

        const header = div.querySelector('.journal-entry-header');
        const body = div.querySelector('.journal-entry-body');
        const toggleBtn = div.querySelector('.btn-toggle-journal');
        
        // Toggle expand/collapse
        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-rename-journal') || e.target.closest('.btn-delete-journal')) return;
            const isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : 'block';
            toggleBtn.innerText = isOpen ? '▼' : '▲';
        });
        
        // Auto-save on typing
        const textarea = div.querySelector('textarea');
        textarea.addEventListener('input', () => {
            entry.content = textarea.value;
            dataManager.saveState();
        });
        
        // Rename
        div.querySelector('.btn-rename-journal').addEventListener('click', (e) => {
            e.stopPropagation();
            const newTitle = prompt('Rename this entry:', entry.title);
            if (newTitle) {
                entry.title = newTitle;
                dataManager.saveState();
                renderJournal();
            }
        });
        
        // Delete
        div.querySelector('.btn-delete-journal').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm(`Delete journal entry "${entry.title}"?`)) return;
            dataManager.state.journal.splice(idx, 1);
            dataManager.saveState();
            renderJournal();
        });
        
        container.appendChild(div);
    });
}
function renderAll() {
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

function renderRosterSelect() {
    if (!els.charRosterSelect) return;
    els.charRosterSelect.innerHTML = '';
    dataManager.roster.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name || 'Unnamed';
        if (r.id === dataManager.activeCharId) opt.selected = true;
        els.charRosterSelect.appendChild(opt);
    });
}

function renderTempBadge(badgeEl, tempVal) {
    const val = parseInt(tempVal, 10) || 0;
    if (val > 0) {
        badgeEl.innerText = `+${val} Temp`;
        badgeEl.style.display = 'inline-block';
    } else {
        badgeEl.style.display = 'none';
    }
}

function updateShadowMax() {
    const shBase = poolEngine.calculateShadowMax(dataManager.state.tiles);
    const shEffMax = shBase + (dataManager.state.shPerm || 0) + (dataManager.state.shTemp || 0);
    els.valShMax.innerText = shEffMax;
    renderTempBadge(els.shTempBadge, dataManager.state.shTemp);
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
    
    let activeCallColors = [];
    if (els.autoFilterCall && els.autoFilterCall.checked) {
        if (els.callColor1.value) activeCallColors.push(els.callColor1.value);
        if (els.callColor2.value) activeCallColors.push(els.callColor2.value);
    }
    
    const filteredTiles = dataManager.state.tiles.filter(tile => {
        // Text Search
        if (searchTerm) {
            const searchableText = `${tile.name} ${(tile.colors || []).join(' ')} ${tile.type || 'Skill'} ${tile.tags || ''} ${formatArmorBase(tile.armorType)} ${tile.description || ''}`.toLowerCase();
            if (!searchableText.includes(searchTerm)) return false;
        }
        
        // Auto-Filter by Call Colors
        if (activeCallColors.length > 0) {
            const hasMatchingColor = tile.colors.some(c => activeCallColors.includes(c));
            if (!hasMatchingColor) return false;
        }
        
        return true;
    });

    let sortDir = els.btnSortDir ? els.btnSortDir.dataset.dir || 'asc' : 'asc';
    let sortVal = els.sortTilesBy ? els.sortTilesBy.value || 'default' : 'default';
    let ignoreFavs = els.ignoreFavoritesSort ? els.ignoreFavoritesSort.checked : false;

    if (sortVal !== 'default') {
        filteredTiles.sort((a, b) => {
            let result = 0;
            if (sortVal === 'alpha') {
                result = a.name.localeCompare(b.name);
            } else if (sortVal === 'color') {
                const aColor = (a.colors && a.colors.length > 0) ? a.colors[0] : '';
                const bColor = (b.colors && b.colors.length > 0) ? b.colors[0] : '';
                result = aColor.localeCompare(bColor);
                if (result === 0) result = a.name.localeCompare(b.name);
            } else if (sortVal === 'type') {
                const aType = a.isSpell ? 'Spell' : (a.type || 'Skill');
                const bType = b.isSpell ? 'Spell' : (b.type || 'Skill');
                result = aType.localeCompare(bType);
                if (result === 0) result = a.name.localeCompare(b.name);
            }
            return sortDir === 'asc' ? result : -result;
        });
    } else {
        if (sortDir === 'desc') {
            filteredTiles.reverse();
        }
    }

    if (!ignoreFavs) {
        filteredTiles.sort((a, b) => {
            const aFav = a.isFavorite ? 1 : 0;
            const bFav = b.isFavorite ? 1 : 0;
            return bFav - aFav;
        });
    }

    filteredTiles.forEach(tile => {
        const div = document.createElement('div');
        div.className = 'tile-card';
        const tileNameLabel = escapeHtml(tile.name);
        const armorLabel = formatArmorBase(tile.armorType);
        
        // Gradient background based on 2 colors
        let c1 = COLOR_HEX[tile.colors[0]] || '#444';
        let c2 = COLOR_HEX[tile.colors[1]] || c1;
        div.style.background = `linear-gradient(135deg, ${c1}44, ${c2}44)`;
        div.style.border = `1px solid ${c1}88`;

        if (uiState.callTile && uiState.callTile.id === tile.id) div.classList.add('selected-call');
        if (uiState.burnTiles.some(t => t.id === tile.id)) div.classList.add('selected-burn');
        if (tile.isBurnt) div.classList.add('tile-burnt');

        div.innerHTML = `
            <div class="tile-badges">
                ${tile.colors.map(c => `<span class="badge" style="background:${COLOR_HEX[c]}; color:${c==='White'||c==='Yellow'?'black':'white'}">${escapeHtml(c)}</span>`).join('')}
                ${tile.type ? `<span class="badge tile-type-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);">${escapeHtml(String(tile.type).toUpperCase())}</span>` : `<span class="badge tile-type-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);">SKILL</span>`}
                <span class="badge" style="background: rgba(255, 215, 0, 0.2); color: #ffd700; border: 1px solid #ffd700; margin-left: auto;">${tile.xpCost !== undefined ? escapeHtml(tile.xpCost) : 0} XP</span>
            </div>
            <div class="tile-card-content">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="tile-name" style="margin-bottom: 0;">${escapeHtml(tile.name)}</div>
                    <button class="btn-favorite ${tile.isFavorite ? 'active' : ''}" title="Toggle Favorite" aria-label="Toggle Favorite">★</button>
                </div>
                <div class="tile-tags">${escapeHtml(tile.tags || '')}</div>
                ${armorLabel ? `<div class="tile-armor" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">🛡️ ${escapeHtml(armorLabel)}</div>` : ''}
                <div class="tile-dice">${escapeHtml(tile.dice.join(', '))}</div>
                <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
                    <button class="btn-edit-tile" aria-label="Edit ${tileNameLabel}" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; cursor: pointer;">✏️ Edit</button>
                    ${tile.description ? `<button class="btn-details" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; cursor: pointer;">Details ▼</button>` : ''}
                </div>
                ${tile.description ? `<div class="tile-description" style="display: none; margin-top: 0.5rem; font-size: 0.9rem; font-style: italic; color: var(--text-secondary); background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(tile.description)}</div>` : ''}
            </div>
            ${tile.isBurnt 
                ? `<button class="btn-unburn" title="Restore this tile" aria-label="Restore ${tileNameLabel}">🔥 Restore</button>`
                : `<button class="btn-burn-instant" title="Burn ${tileNameLabel}" aria-label="Burn ${tileNameLabel}">🔥 Burn</button>`
            }
        `;

        const btnFavorite = div.querySelector('.btn-favorite');
        if (btnFavorite) {
            btnFavorite.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isFavorite = !tile.isFavorite;
                dataManager.saveState();
                renderCards();
            });
        }

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
                if (uiState.callTile && uiState.callTile.id === tile.id) uiState.callTile = null;
                uiState.burnTiles = uiState.burnTiles.filter(t => t.id !== tile.id);
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
    
    if (uiState.callTile && uiState.callTile.id === tile.id) {
        // Deselect call
        uiState.callTile = null;
    } else if (uiState.burnTiles.some(t => t.id === tile.id)) {
        // Deselect burn
        uiState.burnTiles = uiState.burnTiles.filter(t => t.id !== tile.id);
    } else {
        // Add to pool. If no call tile, make it call. Else make it burn.
        if (!uiState.callTile) {
            uiState.callTile = tile;
        } else {
            uiState.burnTiles.push(tile);
        }
    }
    renderCards();
    updatePoolPreview();
}

function getExtraDice() {
    const val = els.extraDiceInput.value.trim();
    const { dice, invalid } = parseDiceInput(val);
    return {
        dice,
        error: invalid.length > 0 ? getDiceValidationMessage('Extra dice') : null
    };
}

function getPoolOptions() {
    return {
        disabledChainIds: new Set(uiState.disabledChainIds)
    };
}

function renderChainOptions(chainOptions = []) {
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

function getSelectedTagBonuses(tagBonuses = []) {
    return tagBonuses.filter(bonus => uiState.selectedTagBonusIds.has(bonus.id));
}

function calculateSelectedTagBonus(tagBonuses = []) {
    return getSelectedTagBonuses(tagBonuses)
        .reduce((sum, bonus) => sum + bonus.steps, 0);
}

function renderTagBonusOptions(tagBonuses = []) {
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

function getRollId(roll, index) {
    return String(roll.id ?? index);
}

function getSortedRolls(result) {
    return (result.originalRolls || [])
        .map((roll, index) => ({ ...roll, rollId: getRollId(roll, index) }))
        .sort((a, b) => b.val - a.val);
}

function getDefaultResolutionAssignments(result, mode) {
    const assignments = {};
    const sortedRolls = getSortedRolls(result);
    const adds = result.adds || 2;

    sortedRolls.forEach((roll, index) => {
        let assignment = 'unused';

        if (index < adds) {
            if (mode === 'attack') {
                assignment = index === adds - 1 && adds > 1 ? 'impact' : 'attack';
            } else if (mode === 'defense') {
                assignment = index === adds - 1 && adds > 1 ? 'grit' : 'evasion';
            } else if (mode === 'healing') {
                assignment = 'diagnosis';
            } else {
                assignment = 'action';
            }
        }

        assignments[roll.rollId] = assignment;
    });

    return assignments;
}

function getAssignmentOptions(mode) {
    return RESOLUTION_MODES[mode]?.options || RESOLUTION_MODES.action.options;
}

function getResolutionExtraValue(id) {
    return document.getElementById(id)?.value ?? '';
}

function getResolutionNumber(id) {
    const value = parseInt(getResolutionExtraValue(id), 10);
    return Number.isFinite(value) ? value : null;
}

function getResolutionText(id) {
    return getResolutionExtraValue(id).trim();
}

function getPrimaryBonusBucket(mode) {
    if (mode === 'attack') return 'attack';
    if (mode === 'defense') return 'evasion';
    if (mode === 'healing') return 'diagnosis';
    return 'action';
}

function getResolutionBonusTotals(result, mode) {
    const totals = { action: 0, attack: 0, impact: 0, evasion: 0, grit: 0, soak: 0, diagnosis: 0 };
    const details = [];

    (result.appliedTagBonuses || []).forEach(bonus => {
        const context = (bonus.context || '').toLowerCase();
        let bucket = null;

        if (mode === 'action') {
            bucket = 'action';
        } else if (context.includes('attack')) {
            bucket = mode === 'attack' ? 'attack' : null;
        } else if (context.includes('damage') || context.includes('impact')) {
            bucket = mode === 'attack' ? 'impact' : null;
        } else if (context.includes('evasion') || context.includes('detection')) {
            bucket = mode === 'defense' ? 'evasion' : null;
        } else if (context.includes('grit')) {
            bucket = mode === 'defense' ? 'grit' : null;
        } else if (context.includes('soak')) {
            bucket = mode === 'defense' ? 'soak' : null;
        } else if (context.includes('action')) {
            bucket = getPrimaryBonusBucket(mode);
        }

        if (!bucket) {
            details.push(`${bonus.tag} from ${bonus.sourceTileName}: not used in ${RESOLUTION_MODES[mode].label.toLowerCase()} resolution`);
            return;
        }

        totals[bucket] += bonus.steps;
        details.push(`${bonus.tag} from ${bonus.sourceTileName}: +${bonus.steps} ${bucket}`);
    });

    totals[getPrimaryBonusBucket(mode)] += result.flatBonus || 0;
    return { totals, details };
}

function calculateAssignedTotals(result) {
    const totals = {};
    let usedCount = 0;

    (result.originalRolls || []).forEach((roll, index) => {
        const rollId = getRollId(roll, index);
        const assignment = uiState.currentResolutionAssignments[rollId] || 'unused';

        if (assignment !== 'unused') usedCount += 1;
        totals[assignment] = (totals[assignment] || 0) + roll.val;
    });

    return { totals, usedCount };
}

function calculateResolutionPlusUsage(result, mode = uiState.currentResolutionMode) {
    const plusBuckets = RESOLUTION_PLUS_BUCKETS[mode];
    const bucketCounts = {};

    if (!plusBuckets) {
        return {
            used: 0,
            budget: Math.max(0, (result.adds || 2) - 1),
            bucketCounts
        };
    }

    (result.originalRolls || []).forEach((roll, index) => {
        const rollId = getRollId(roll, index);
        const assignment = uiState.currentResolutionAssignments[rollId] || 'unused';
        if (!plusBuckets.has(assignment)) return;

        bucketCounts[assignment] = (bucketCounts[assignment] || 0) + 1;
    });

    const used = Object.values(bucketCounts)
        .reduce((sum, count) => sum + Math.max(0, count - 1), 0);

    return {
        used,
        budget: Math.max(0, (result.adds || 2) - 1),
        bucketCounts
    };
}

function renderResolutionUsageFields(result, usedCount, adds) {
    if (!RESOLUTION_PLUS_BUCKETS[uiState.currentResolutionMode]) {
        return `
            <div class="resolution-field">
                <label>Dice Used</label>
                <div class="${usedCount > adds ? 'resolution-warning' : 'resolution-success'}">${usedCount}/${adds}</div>
            </div>
        `;
    }

    const plusUsage = calculateResolutionPlusUsage(result);
    const diceTotal = (result.originalRolls || []).length;

    return `
        <div class="resolution-field">
            <label>Dice Assigned</label>
            <div class="resolution-success">${usedCount}/${diceTotal}</div>
        </div>
        <div class="resolution-field">
            <label>Pluses Used</label>
            <div class="${plusUsage.used > plusUsage.budget ? 'resolution-warning' : 'resolution-success'}">${plusUsage.used}/${plusUsage.budget}</div>
        </div>
    `;
}

function renderResolutionModeOptions() {
    return Object.entries(RESOLUTION_MODES).map(([value, mode]) => {
        const selected = value === uiState.currentResolutionMode ? ' selected' : '';
        return `<option value="${value}"${selected}>${mode.label}</option>`;
    }).join('');
}

function renderResolutionExtraFields() {
    if (uiState.currentResolutionMode === 'attack') {
        return `
            <div class="resolution-extra-grid">
                <div class="resolution-field">
                    <label for="target-evasion">Target Evasion</label>
                    <input id="target-evasion" class="resolution-extra" type="text" inputmode="numeric" value="${escapeHtml(getResolutionExtraValue('target-evasion'))}">
                </div>
                <div class="resolution-field">
                    <label for="target-soak">Target Soak</label>
                    <input id="target-soak" class="resolution-extra" type="text" inputmode="numeric" value="${escapeHtml(getResolutionExtraValue('target-soak'))}">
                </div>
                <div class="resolution-field">
                    <label for="target-grit">Target Grit</label>
                    <input id="target-grit" class="resolution-extra" type="text" inputmode="numeric" value="${escapeHtml(getResolutionExtraValue('target-grit'))}">
                </div>
                <div class="resolution-field">
                    <label for="attack-crits">Crit Tags</label>
                    <input id="attack-crits" class="resolution-extra" type="text" value="${escapeHtml(getResolutionExtraValue('attack-crits'))}" placeholder="e.g. JOLT, DOWN">
                </div>
            </div>
        `;
    }

    if (uiState.currentResolutionMode === 'defense') {
        return `
            <div class="resolution-extra-grid">
                <div class="resolution-field">
                    <label for="incoming-attack">Incoming Attack</label>
                    <input id="incoming-attack" class="resolution-extra" type="text" inputmode="numeric" value="${escapeHtml(getResolutionExtraValue('incoming-attack'))}">
                </div>
                <div class="resolution-field">
                    <label for="incoming-impact">Incoming Impact</label>
                    <input id="incoming-impact" class="resolution-extra" type="text" inputmode="numeric" value="${escapeHtml(getResolutionExtraValue('incoming-impact'))}">
                </div>
                <div class="resolution-field">
                    <label for="defense-soak">Other Soak</label>
                    <input id="defense-soak" class="resolution-extra" type="text" inputmode="numeric" value="${escapeHtml(getResolutionExtraValue('defense-soak'))}">
                </div>
                <div class="resolution-field">
                    <label for="incoming-crits">Incoming Crit Tags</label>
                    <input id="incoming-crits" class="resolution-extra" type="text" value="${escapeHtml(getResolutionExtraValue('incoming-crits'))}" placeholder="e.g. BLEED, DOWN">
                </div>
            </div>
        `;
    }

    if (uiState.currentResolutionMode === 'healing') {
        return `
            <div class="resolution-extra-grid">
                <label class="resolution-field" style="justify-content: end;">
                    <span>During Combat</span>
                    <input id="healing-in-combat" type="checkbox"${uiState.healingInCombat ? ' checked' : ''}>
                </label>
            </div>
        `;
    }

    return '';
}

function renderResolutionAssignments(result) {
    const options = getAssignmentOptions(uiState.currentResolutionMode);
    const validValues = new Set(options.map(option => option.value));

    return (result.originalRolls || []).map((roll, index) => {
        const rollId = getRollId(roll, index);
        const assignment = validValues.has(uiState.currentResolutionAssignments[rollId])
            ? uiState.currentResolutionAssignments[rollId]
            : 'unused';
        const optionHtml = options.map(option => {
            const selected = option.value === assignment ? ' selected' : '';
            return `<option value="${option.value}"${selected}>${option.label}</option>`;
        }).join('');

        return `
            <div class="resolution-die-row">
                <span class="resolution-die-main">
                    <span class="resolution-die-badge" title="${escapeHtml(roll.die)} rolled ${roll.val}">
                        <span class="resolution-die-type">${escapeHtml(roll.die)}</span>
                        <span class="resolution-die-label">rolled</span>
                        <span class="resolution-die-roll">${roll.val}</span>
                    </span>
                    <span class="resolution-die-source">${escapeHtml(roll.source)}</span>
                </span>
                <select class="resolution-die-select" data-roll-id="${rollId}">
                    ${optionHtml}
                </select>
            </div>
        `;
    }).join('');
}

function getHealingAssignments(result) {
    const healing = {};

    (result.originalRolls || []).forEach((roll, index) => {
        const rollId = getRollId(roll, index);
        const assignment = uiState.currentResolutionAssignments[rollId];
        const target = HEALING_TARGETS[assignment];
        if (!target) return;

        if (!healing[assignment]) {
            healing[assignment] = { ...target, amount: 0, count: 0 };
        }

        healing[assignment].count += 1;
        healing[assignment].amount += roll.val;
    });

    return healing;
}

function renderBonusDetails(details) {
    if (!details.length) return '';
    return `<p><strong>Tag Bonuses:</strong><br>${details.map(detail => escapeHtml(detail)).join('<br>')}</p>`;
}

function calculateResolutionSummary(result) {
    const { totals, usedCount } = calculateAssignedTotals(result);
    const bonusInfo = getResolutionBonusTotals(result, uiState.currentResolutionMode);
    const bonuses = bonusInfo.totals;
    const adds = result.adds || 2;
    const warnings = [];
    const plusUsage = RESOLUTION_PLUS_BUCKETS[uiState.currentResolutionMode]
        ? calculateResolutionPlusUsage(result)
        : null;
    const plusesAreLegal = !plusUsage || plusUsage.used <= plusUsage.budget;

    if (plusUsage && !plusesAreLegal) {
        if (uiState.currentResolutionMode === 'healing') {
            warnings.push(`Too many pluses used: ${plusUsage.used}/${plusUsage.budget}. Move dice out of combined diagnosis/resource totals or assign them to one-at-a-time healing options.`);
        } else {
            warnings.push(`Too many pluses used: ${plusUsage.used}/${plusUsage.budget}. Split dice across ${uiState.currentResolutionMode === 'attack' ? 'Attack/Impact' : 'Evasion/Grit'} differently or move dice to Unused.`);
        }
    } else if (!plusUsage && usedCount > adds) {
        warnings.push(`Too many dice assigned: ${usedCount}/${adds}. Move ${usedCount - adds} die${usedCount - adds === 1 ? '' : 's'} to Unused.`);
    }

    if (uiState.currentResolutionMode === 'attack') {
        const attackTotal = (totals.attack || 0) + bonuses.attack;
        const impactTotal = (totals.impact || 0) + bonuses.impact;
        const targetEvasion = getResolutionNumber('target-evasion');
        const targetSoak = getResolutionNumber('target-soak') || 0;
        const targetGrit = getResolutionNumber('target-grit') || 0;
        const crits = getResolutionText('attack-crits');
        const lines = [
            `<p><strong>Attack:</strong> ${attackTotal} (${totals.attack || 0} dice + ${bonuses.attack} bonus)</p>`,
            `<p><strong>Impact:</strong> ${impactTotal} HP (${totals.impact || 0} dice + ${bonuses.impact} bonus)</p>`,
            `<p><strong>Pluses Used:</strong> ${plusUsage.used}/${plusUsage.budget}</p>`
        ];

        if (!plusesAreLegal) {
            lines.push('<p class="resolution-warning">Reduce plus use before resolving attack.</p>');
        } else if (targetEvasion !== null) {
            const hit = attackTotal >= targetEvasion;
            lines.push(`<p class="${hit ? 'resolution-success' : 'resolution-warning'}">${hit ? 'Hit' : 'Miss'} vs target evasion ${targetEvasion}.</p>`);

            if (hit) {
                const hpLoss = Math.max(0, impactTotal - targetSoak);
                const critsApply = crits && hpLoss > targetGrit;
                lines.push(`<p><strong>After Soak:</strong> ${hpLoss} HP (${impactTotal} impact - ${targetSoak} soak).</p>`);
                lines.push(`<p><strong>Grit Check:</strong> ${targetGrit} grit ${hpLoss > targetGrit ? 'does not prevent crits' : 'prevents crits'}.</p>`);
                if (crits) lines.push(`<p><strong>Crits:</strong> ${escapeHtml(crits)} ${critsApply ? 'apply' : 'do not apply'}.</p>`);
            }
        }

        return {
            headline: `Attack ${attackTotal} / Impact ${impactTotal}`,
            html: lines.join('') + renderBonusDetails(bonusInfo.details),
            warnings
        };
    }

    if (uiState.currentResolutionMode === 'defense') {
        const evasionTotal = (totals.evasion || 0) + bonuses.evasion;
        const gritTotal = (totals.grit || 0) + bonuses.grit;
        const otherSoak = getResolutionNumber('defense-soak') || 0;
        const soakTotal = otherSoak + bonuses.soak;
        const incomingAttack = getResolutionNumber('incoming-attack');
        const incomingImpact = getResolutionNumber('incoming-impact') || 0;
        const incomingCrits = getResolutionText('incoming-crits');
        const lines = [
            `<p><strong>Evasion:</strong> ${evasionTotal} (${totals.evasion || 0} dice + ${bonuses.evasion} bonus)</p>`,
            `<p><strong>Grit:</strong> ${gritTotal} (${totals.grit || 0} dice + ${bonuses.grit} bonus)</p>`,
            `<p><strong>Soak:</strong> ${soakTotal} (${otherSoak} other + ${bonuses.soak} bonus)</p>`,
            `<p><strong>Pluses Used:</strong> ${plusUsage.used}/${plusUsage.budget}</p>`
        ];

        if (!plusesAreLegal) {
            lines.push('<p class="resolution-warning">Reduce plus use before resolving defense.</p>');
        } else if (incomingAttack !== null) {
            const missed = evasionTotal > incomingAttack;
            lines.push(`<p class="${missed ? 'resolution-success' : 'resolution-warning'}">${missed ? 'Attack misses' : 'Attack hits'} vs incoming attack ${incomingAttack}.</p>`);

            if (!missed) {
                const hpLoss = Math.max(0, incomingImpact - soakTotal);
                const critsApply = incomingCrits && hpLoss > gritTotal;
                lines.push(`<p><strong>After Soak:</strong> ${hpLoss} HP (${incomingImpact} impact - ${soakTotal} soak).</p>`);
                lines.push(`<p><strong>Grit Check:</strong> ${gritTotal} grit ${hpLoss > gritTotal ? 'does not prevent crits' : 'prevents crits'}.</p>`);
                if (incomingCrits) lines.push(`<p><strong>Crits:</strong> ${escapeHtml(incomingCrits)} ${critsApply ? 'apply' : 'do not apply'}.</p>`);
            }
        }

        return {
            headline: `Evasion ${evasionTotal} / Grit ${gritTotal}`,
            html: lines.join('') + renderBonusDetails(bonusInfo.details),
            warnings
        };
    }

    if (uiState.currentResolutionMode === 'healing') {
        const diagnosisTotal = (totals.diagnosis || 0) + bonuses.diagnosis;
        const healingAssignments = getHealingAssignments(result);
        const healingEntries = Object.values(healingAssignments);
        const spareCount = healingEntries.reduce((sum, entry) => sum + entry.count, 0);
        const baseDifficulty = healingEntries.reduce((max, entry) => Math.max(max, entry.difficulty), 0);
        const difficulty = baseDifficulty + (spareCount * 2) + (uiState.healingInCombat ? 4 : 0);
        const succeeds = plusesAreLegal && spareCount > 0 && diagnosisTotal >= difficulty;
        const lines = [
            `<p><strong>Diagnosis:</strong> ${diagnosisTotal} (${totals.diagnosis || 0} dice + ${bonuses.diagnosis} bonus)</p>`,
            `<p><strong>Pluses Used:</strong> ${plusUsage.used}/${plusUsage.budget}</p>`
        ];

        if (spareCount === 0) {
            lines.push('<p>No treatment dice assigned.</p>');
        } else if (!plusesAreLegal) {
            lines.push('<p class="resolution-warning">Reduce plus use before resolving treatment.</p>');
        } else {
            lines.push(`<p><strong>Difficulty:</strong> ${difficulty} (${baseDifficulty} base + ${spareCount * 2} from ${spareCount} treatment dice${uiState.healingInCombat ? ' + 4 combat' : ''}).</p>`);
            lines.push(`<p class="${succeeds ? 'resolution-success' : 'resolution-warning'}">${succeeds ? 'Treatment succeeds' : 'Treatment fails'}.</p>`);
            healingEntries.forEach(entry => {
                if (entry.kind === 'resource') {
                    lines.push(`<p><strong>${entry.label}:</strong> restore ${entry.amount} if successful.</p>`);
                } else {
                    lines.push(`<p><strong>${entry.label}:</strong> restore/reduce ${entry.count} if successful.</p>`);
                }
            });
        }

        return {
            headline: `Diagnosis ${diagnosisTotal}`,
            html: lines.join('') + renderBonusDetails(bonusInfo.details),
            warnings
        };
    }

    const actionTotal = (totals.action || 0) + bonuses.action;
    return {
        headline: String(actionTotal),
        html: `<p><strong>Action Total:</strong> ${actionTotal} (${totals.action || 0} dice + ${bonuses.action} bonus)</p>${renderBonusDetails(bonusInfo.details)}`,
        warnings
    };
}

function renderRollGroups(result) {
    const groups = {};
    (result.originalRolls || []).forEach(r => {
        if (!groups[r.source]) groups[r.source] = [];
        groups[r.source].push(`<strong>${escapeHtml(r.die)}:</strong> ${r.val}`);
    });

    return Object.entries(groups).map(([source, rolls]) => {
        return `<div style="margin-top: 4px; padding-left: 10px; border-left: 2px solid var(--glass-border);"><em>${escapeHtml(source)}</em>: ${rolls.join(' | ')}</div>`;
    }).join('');
}

function renderResolutionDetails() {
    if (!uiState.lastRollResult) return;

    const result = uiState.lastRollResult;
    const summary = calculateResolutionSummary(result);
    els.resultNotices.innerHTML = result.isHaywire
        ? '<div class="result-notice result-notice-haywire">HAYWIRE! More than half the dice rolled 1.</div>'
        : '';

    els.resultTotal.innerText = summary.headline;
    els.resultDetails.innerHTML = `
        <div style="margin-bottom: 0.5rem; color: #a0aab5;">
            <p style="margin: 0; text-decoration: underline;">All Rolls by Source:</p>
            ${renderRollGroups(result)}
        </div>
        <div class="resolution-summary">
            ${summary.html}
        </div>
    `;
}

function renderResolution() {
    if (!uiState.lastRollResult) return;

    const result = uiState.lastRollResult;
    const { usedCount } = calculateAssignedTotals(result);
    const adds = result.adds || 2;
    const summary = calculateResolutionSummary(result);
    const warningHtml = summary.warnings.map(warning => `<p class="resolution-warning">${escapeHtml(warning)}</p>`).join('');

    els.resolutionControls.innerHTML = `
        <div class="resolution-toolbar">
            <div class="resolution-field">
                <label for="resolution-mode">Resolution</label>
                <select id="resolution-mode">${renderResolutionModeOptions()}</select>
            </div>
            ${renderResolutionUsageFields(result, usedCount, adds)}
        </div>
        ${renderResolutionExtraFields()}
        <div class="resolution-assignments">
            <label>Assign Rolled Dice</label>
            ${renderResolutionAssignments(result)}
        </div>
        ${warningHtml}
    `;

    renderResolutionDetails();
}

function updatePoolPreview() {
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
    els.manualInputsContainer.innerHTML = '';

    const extraDice = getExtraDice();
    if (extraDice.error) return;

    const res = poolEngine.compilePool(colors, dataManager.state.stats, uiState.callTile, uiState.burnTiles, dataManager.state.tiles, extraDice.dice, getPoolOptions());
    if (res.error || res.dice.length === 0) return;

    res.dice.forEach((dObj, idx) => {
        const div = document.createElement('div');
        div.className = 'manual-die-input';
        div.innerHTML = `
            <label>${escapeHtml(dObj.source)} - Roll for ${escapeHtml(dObj.die)}:</label>
            <input type="number" class="manual-val" data-die="${escapeHtml(dObj.die)}" data-source="${escapeHtml(dObj.source)}" min="1" max="${escapeHtml(dObj.die.replace('d',''))}" value="">
        `;
        els.manualInputsContainer.appendChild(div);
    });
}

function executeVirtualRoll() {
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

    const rolled = poolEngine.rollPool(res.dice);
    const result = poolEngine.calculateOptimalTotal(rolled, res.adds);
    const appliedTagBonuses = getSelectedTagBonuses(res.tagBonuses || []);
    result.adds = res.adds;
    result.flatBonus = res.flatBonus || 0;
    result.appliedTagBonuses = appliedTagBonuses;
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

    const result = poolEngine.calculateOptimalTotal(rolled, res.adds);
    const appliedTagBonuses = getSelectedTagBonuses(res.tagBonuses || []);
    result.adds = res.adds;
    result.flatBonus = res.flatBonus || 0;
    result.appliedTagBonuses = appliedTagBonuses;
    showResults(result);
    processBurns();
}

function processBurns() {
    if (uiState.burnTiles.length > 0) {
        uiState.burnTiles.forEach(t => {
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

function showResults(result) {
    uiState.lastRollResult = result;
    uiState.currentResolutionMode = 'action';
    uiState.currentResolutionAssignments = getDefaultResolutionAssignments(result, uiState.currentResolutionMode);
    uiState.healingInCombat = false;
    els.rollResults.style.display = 'block';
    renderResolution();
    
    setTimeout(() => {
        const dash = document.getElementById('action-dashboard');
        if (dash && window.getComputedStyle(dash).overflowY === 'auto') {
            dash.scrollTo({ top: dash.scrollHeight, behavior: 'smooth' });
        } else {
            els.rollResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 50);
}

// Modal Form Logic
function openModal(tile = null) {
    els.modal.classList.add('active');
    els.form.reset();
    document.querySelectorAll('.color-cb').forEach(cb => cb.checked = false);
    currentFormTags = [];
    els.tagCustomInput.style.display = 'none';

    const armorMaterial = document.getElementById('armor-material');
    const armorCoverage = document.getElementById('armor-coverage');
    const armorContainer = document.getElementById('armor-base-container');

    if (tile) {
        document.getElementById('modal-title').innerText = 'Edit Tile';
        document.getElementById('tile-id').value = tile.id;
        const tileType = tile.type || 'Skill';
        document.getElementById('tile-type').value = tileType;
        document.getElementById('spellcast-skill-container').style.display = tileType === 'Skill' ? 'block' : 'none';
        armorContainer.style.display = tileType === 'Gear' ? 'block' : 'none';
        armorMaterial.value = tile.armorType?.material || '';
        armorCoverage.value = tile.armorType?.coverage || '';
        document.getElementById('tile-is-spellcast').checked = !!tile.isSpellcastSkill;
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
        document.getElementById('spellcast-skill-container').style.display = 'block';
        armorContainer.style.display = 'none';
        armorMaterial.value = '';
        armorCoverage.value = '';
        document.getElementById('tile-is-spellcast').checked = false;
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

        const tagText = document.createElement('span');
        tagText.textContent = tag;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.color = '#ff3333';
        removeBtn.style.fontWeight = 'bold';
        removeBtn.style.background = 'transparent';
        removeBtn.style.border = 'none';
        removeBtn.style.padding = '0';
        removeBtn.addEventListener('click', () => {
            currentFormTags = currentFormTags.filter(t => t !== tag);
            renderFormTags();
        });

        div.appendChild(tagText);
        div.appendChild(removeBtn);
        els.tagsContainer.appendChild(div);
    });

    renderTileTagLimitStatus();
}

function closeModal() {
    els.modal.classList.remove('active');
}

function saveTileFromForm() {
    const id = document.getElementById('tile-id').value;
    const type = document.getElementById('tile-type').value;
    const isSpellcastSkill = type === 'Skill' && document.getElementById('tile-is-spellcast').checked;
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

    const { dice: diceArray, invalid } = parseDiceInput(diceStr);
    if (invalid.length > 0 || diceArray.length === 0) {
        alert(getDiceValidationMessage('Tile dice'));
        return;
    }

    const tagLimit = poolEngine.calculateTagLimit(diceArray, currentFormTags);
    renderTileTagLimitStatus();
    if (!tagLimit.valid) {
        alert(tagLimitErrorMessage('This tile', tagLimit));
        return;
    }

    const armorType = getFormArmorType();

    const tile = {
        id: id || null,
        type,
        name,
        description,
        colors: checkedColors,
        dice: diceArray,
        tags,
        xpCost,
        isSpellcastSkill,
        armorType
    };

    if (id) {
        dataManager.updateTile(tile);
        // Update pool selections if modified
        if (uiState.callTile && uiState.callTile.id === id) uiState.callTile = tile;
        uiState.burnTiles = uiState.burnTiles.map(t => t.id === id ? tile : t);
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
