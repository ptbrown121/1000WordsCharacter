import {
    WEAPON_TEMPLATES,
    getWeaponTemplateById,
    parseDiceInput,
    getDiceValidationMessage,
    formatTagLimitStatus,
    tagLimitErrorMessage
} from '../pool.js';
import { uiState } from '../state.js';
import { els } from '../els.js';
import { renderCards } from './cards.js';
import { updatePoolPreview } from './pool.js';
import { updateXpTracker } from './stats.js';

let dataManager;
let poolEngine;

// Modal-local: tags being edited in the tile modal.
export let currentFormTags = [];

// Armor base (page 29): material x coverage. Coverage sets intrinsic Base Soak.
export const ARMOR_MATERIALS = new Set(['Soft', 'Hard']);
export const ARMOR_COVERAGE_SOAK = { Open: 0, Full: 1, Closed: 3 };

export function formatArmorBase(armorType) {
    if (!armorType || !ARMOR_MATERIALS.has(armorType.material) || !(armorType.coverage in ARMOR_COVERAGE_SOAK)) {
        return '';
    }
    const soak = ARMOR_COVERAGE_SOAK[armorType.coverage];
    return `${armorType.coverage} ${armorType.material} Armor · Base Soak +${soak}`;
}

export function getFormArmorType() {
    if (document.getElementById('tile-type').value !== 'Gear') return null;
    if (document.getElementById('gear-subtype').value !== 'Armor') return null;
    const material = document.getElementById('armor-material').value;
    const coverage = document.getElementById('armor-coverage').value;
    if (ARMOR_MATERIALS.has(material) && coverage in ARMOR_COVERAGE_SOAK) {
        return { material, coverage };
    }
    return null;
}

export function formatWeaponBase(weapon) {
    if (!weapon) return '';
    const parts = [weapon.category, weapon.range, weapon.skill].filter(Boolean);
    return parts.length ? `${parts.join(' · ')}` : '';
}

function getFormWeapon() {
    if (document.getElementById('tile-type').value !== 'Gear') return null;
    if (document.getElementById('gear-subtype').value !== 'Weapon') return null;

    const templateId = document.getElementById('weapon-template').value;
    const category = document.getElementById('weapon-category').value.trim();
    const range = document.getElementById('weapon-range').value.trim();
    const skill = document.getElementById('weapon-skill').value.trim();

    if (!templateId && !category && !range && !skill) return null;

    return { templateId, category, range, skill };
}

function getFormGearSubtype() {
    if (document.getElementById('tile-type').value !== 'Gear') return '';
    return document.getElementById('gear-subtype').value || 'Custom';
}

function populateWeaponTemplates() {
    const select = document.getElementById('weapon-template');
    if (!select || select.dataset.populated === 'true') return;

    WEAPON_TEMPLATES.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        select.appendChild(option);
    });

    select.dataset.populated = 'true';
}

function syncTileTypeSections() {
    const type = document.getElementById('tile-type').value;
    const gearSubtype = document.getElementById('gear-subtype').value || 'Custom';

    document.getElementById('spellcast-skill-container').style.display = type === 'Skill' ? 'block' : 'none';
    document.getElementById('gear-subtype-container').style.display = type === 'Gear' ? 'block' : 'none';
    document.getElementById('weapon-builder-container').style.display = type === 'Gear' && gearSubtype === 'Weapon' ? 'block' : 'none';
    document.getElementById('armor-base-container').style.display = type === 'Gear' && gearSubtype === 'Armor' ? 'block' : 'none';
}

function addMissingTemplateTags(tags) {
    let changed = false;
    tags.forEach(tag => {
        if (!currentFormTags.includes(tag)) {
            currentFormTags.push(tag);
            changed = true;
        }
    });
    if (changed) renderFormTags();
}

function applyWeaponTemplate(templateId) {
    const template = getWeaponTemplateById(templateId);
    if (!template) return;

    const nameInput = document.getElementById('tile-name');
    if (!nameInput.value.trim()) {
        nameInput.value = template.name;
    }

    document.getElementById('weapon-category').value = template.category || '';
    document.getElementById('weapon-range').value = template.range || '';
    document.getElementById('weapon-skill').value = template.skill || '';
    addMissingTemplateTags(template.startingTags || []);
}

export function renderTagLimitStatus(el, diceStr, tagsArray) {
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

export function renderTileTagLimitStatus() {
    return renderTagLimitStatus(els.tileTagLimitStatus, els.tileDice.value, currentFormTags);
}

export function renderXpEstimateNote(unknownTags = []) {
    const el = els.tileXpEstimateNote;
    if (!el) return;
    if (!unknownTags.length) {
        el.textContent = '';
        el.style.display = 'none';
        return;
    }
    const list = unknownTags.join(', ');
    const noun = unknownTags.length === 1 ? 'tag was' : 'tags were';
    el.textContent = `\u26a0\ufe0f ${unknownTags.length} unknown ${noun} charged the default +2 XP each: ${list}. Check for typos.`;
    el.style.display = 'block';
}

export function init(deps) {
    dataManager = deps.dataManager;
    poolEngine = deps.poolEngine;
    populateWeaponTemplates();

    // Info Modal
    els.btnInfo.addEventListener('click', () => els.infoModal.classList.add('active'));
    els.btnInfoClose.addEventListener('click', () => els.infoModal.classList.remove('active'));
    els.infoModal.addEventListener('click', (e) => {
        if (e.target === els.infoModal) els.infoModal.classList.remove('active');
    });

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

        if (finalTag) {
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
    document.getElementById('tile-type').addEventListener('change', syncTileTypeSections);
    document.getElementById('gear-subtype').addEventListener('change', syncTileTypeSections);
    document.getElementById('weapon-template').addEventListener('change', (e) => {
        applyWeaponTemplate(e.target.value);
    });

    // XP Estimation
    els.btnEstimateXp.addEventListener('click', () => {
        const diceStr = document.getElementById('tile-dice').value.trim();
        const { dice: diceArray, invalid } = parseDiceInput(diceStr);
        if (invalid.length > 0) {
            alert(getDiceValidationMessage('Tile dice'));
            return;
        }
        const { xp, unknownTags } = poolEngine.estimateTileXpDetails(diceArray, currentFormTags, getFormArmorType(), { weapon: getFormWeapon() });
        els.tileXp.value = xp;
        renderXpEstimateNote(unknownTags);
    });
}

export function openModal(tile = null) {
    els.modal.classList.add('active');
    els.form.reset();
    document.querySelectorAll('.color-cb').forEach(cb => cb.checked = false);
    currentFormTags = [];
    els.tagCustomInput.style.display = 'none';
    renderXpEstimateNote([]);

    const armorMaterial = document.getElementById('armor-material');
    const armorCoverage = document.getElementById('armor-coverage');
    const gearSubtype = document.getElementById('gear-subtype');
    const weaponTemplate = document.getElementById('weapon-template');
    const weaponCategory = document.getElementById('weapon-category');
    const weaponRange = document.getElementById('weapon-range');
    const weaponSkill = document.getElementById('weapon-skill');

    if (tile) {
        document.getElementById('modal-title').innerText = 'Edit Tile';
        document.getElementById('tile-id').value = tile.id;
        const tileType = tile.type || 'Skill';
        document.getElementById('tile-type').value = tileType;
        gearSubtype.value = tile.gearSubtype || (tile.weapon ? 'Weapon' : tile.armorType ? 'Armor' : 'Custom');
        weaponTemplate.value = tile.weapon?.templateId || '';
        weaponCategory.value = tile.weapon?.category || '';
        weaponRange.value = tile.weapon?.range || '';
        weaponSkill.value = tile.weapon?.skill || '';
        armorMaterial.value = tile.armorType?.material || '';
        armorCoverage.value = tile.armorType?.coverage || '';
        document.getElementById('tile-is-spellcast').checked = !!tile.isSpellcastSkill;
        document.getElementById('tile-name').value = tile.name;
        document.getElementById('tile-description').value = tile.description || '';
        document.getElementById('tile-dice').value = tile.dice.join(', ');
        if (Array.isArray(tile.tags)) {
            currentFormTags = tile.tags.map(t => String(t).trim()).filter(Boolean);
        } else if (tile.tags) {
            // Legacy comma-string fallback (older exports).
            currentFormTags = String(tile.tags).split(',').map(t => t.trim()).filter(Boolean);
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
        gearSubtype.value = 'Custom';
        weaponTemplate.value = '';
        weaponCategory.value = '';
        weaponRange.value = '';
        weaponSkill.value = '';
        armorMaterial.value = '';
        armorCoverage.value = '';
        document.getElementById('tile-is-spellcast').checked = false;
        document.getElementById('tile-description').value = '';
        els.tileXp.value = 0;
        els.btnDelete.style.display = 'none';
    }
    
    syncTileTypeSections();
    renderFormTags();
}

export function renderFormTags() {
    els.tagsContainer.innerHTML = '';
    currentFormTags.forEach((tag, index) => {
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
        removeBtn.textContent = '\u00d7';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.color = '#ff3333';
        removeBtn.style.fontWeight = 'bold';
        removeBtn.style.background = 'transparent';
        removeBtn.style.border = 'none';
        removeBtn.style.padding = '0';
        removeBtn.addEventListener('click', () => {
            currentFormTags.splice(index, 1);
            renderFormTags();
        });

        div.appendChild(tagText);
        div.appendChild(removeBtn);
        els.tagsContainer.appendChild(div);
    });

    renderTileTagLimitStatus();
}

export function closeModal() {
    els.modal.classList.remove('active');
}

export function saveTileFromForm() {
    const id = document.getElementById('tile-id').value;
    const type = document.getElementById('tile-type').value;
    const isSpellcastSkill = type === 'Skill' && document.getElementById('tile-is-spellcast').checked;
    const name = document.getElementById('tile-name').value.trim();
    const description = document.getElementById('tile-description').value.trim();
    const diceStr = document.getElementById('tile-dice').value.trim();
    const tags = [...currentFormTags];
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
    const gearSubtype = getFormGearSubtype();
    const weapon = getFormWeapon();

    const existingTile = id ? dataManager.state.tiles.find(t => t.id === id) : null;
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
        gearSubtype,
        weapon,
        armorType,
        isBurnt: existingTile?.isBurnt || false,
        isBuried: existingTile?.isBuried || false
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
