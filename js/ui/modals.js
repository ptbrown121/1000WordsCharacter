import {
    formatWeaponTemplateDetails,
    getWeaponTemplateById,
    getWeaponTemplatesByCategory,
    normalizeExoticSkill,
    parseDiceInput,
    getDiceValidationMessage,
    formatTagLimitStatus,
    tagLimitErrorMessage,
    calculateHitchRebateTotal,
    getTileBoxes,
    getTileColorsFromBoxes,
    serializeTileBoxes,
    validateShadowTags
} from '../pool.js';
import { uiState } from '../state.js';
import { els } from '../els.js';
import { renderCards } from './cards.js';
import { updatePoolPreview } from './pool.js';
import { updateXpTracker } from './stats.js';
import { renderRulesReview } from './rulesReview.js';

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

export function formatAmmoBase(ammo) {
    if (!ammo) return '';
    const target = ammo.targetName ? `for ${ammo.targetName}` : 'unlinked';
    const supply = `${ammo.currentSupply ?? 0}/${ammo.maxSupply ?? 0}`;
    const replaces = ammo.replacesTag ? ` · replaces ${ammo.replacesTag}` : '';
    return `Ammo ${target} · Supply ${supply}${replaces}`;
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

function getFormAmmo() {
    if (document.getElementById('tile-type').value !== 'Gear') return null;
    if (document.getElementById('gear-subtype').value !== 'Ammo') return null;

    const targetSelect = document.getElementById('ammo-target');
    const targetTileId = targetSelect.value;
    const targetName = targetSelect.selectedOptions[0]?.dataset.weaponName || '';
    const maxSupply = Math.max(0, parseInt(document.getElementById('ammo-max-supply').value, 10) || 0);
    const currentSupply = Math.min(maxSupply, Math.max(0, parseInt(document.getElementById('ammo-current-supply').value, 10) || 0));
    const replacesTag = document.getElementById('ammo-replaces-tag').value.trim();

    return { targetTileId, targetName, currentSupply, maxSupply, replacesTag };
}

function getFormGearSubtype() {
    if (document.getElementById('tile-type').value !== 'Gear') return '';
    return document.getElementById('gear-subtype').value || 'Custom';
}

function getFormExoticSkill() {
    if (document.getElementById('tile-type').value !== 'Skill') return null;
    return normalizeExoticSkill(document.getElementById('tile-exotic-skill').value);
}

function isShadowBoxValue(value) {
    return value === 'Qi' || value === 'Id';
}

function syncTileBoxResourceVisibility() {
    document.querySelectorAll('.tile-box-type').forEach(typeSelect => {
        const index = typeSelect.dataset.boxIndex;
        const resourceSelect = document.querySelector(`.tile-box-resource[data-box-index="${index}"]`);
        if (!resourceSelect) return;
        const isShadow = isShadowBoxValue(typeSelect.value);
        resourceSelect.style.display = isShadow ? 'block' : 'none';
        if (!isShadow) resourceSelect.value = '';
    });
}

function getFormBoxes() {
    return Array.from(document.querySelectorAll('.tile-box-type')).map(typeSelect => {
        const value = typeSelect.value;
        const index = typeSelect.dataset.boxIndex;
        const resource = document.querySelector(`.tile-box-resource[data-box-index="${index}"]`)?.value || '';
        if (isShadowBoxValue(value)) return { type: 'shadow', kind: value, resource };
        if (value) return { type: 'color', color: value };
        return null;
    }).filter(Boolean);
}

function setFormBoxes(boxes = []) {
    const normalized = serializeTileBoxes(boxes);
    document.querySelectorAll('.tile-box-type').forEach(typeSelect => {
        const index = parseInt(typeSelect.dataset.boxIndex, 10);
        const box = normalized[index] || null;
        typeSelect.value = box ? (box.type === 'shadow' ? box.kind : box.color) : '';
        const resourceSelect = document.querySelector(`.tile-box-resource[data-box-index="${index}"]`);
        if (resourceSelect) resourceSelect.value = box?.type === 'shadow' ? box.resource || '' : '';
    });
    syncTileBoxResourceVisibility();
}

function populateWeaponTemplates() {
    const select = document.getElementById('weapon-template');
    if (!select || select.dataset.populated === 'true') return;

    getWeaponTemplatesByCategory().forEach(group => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.category;
        group.templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    });

    select.dataset.populated = 'true';
}

function populateAmmoTargets(selectedId = '', editingTileId = '') {
    const select = document.getElementById('ammo-target');
    if (!select) return;

    const previousValue = selectedId || select.value;
    select.innerHTML = '<option value="">-- Select weapon --</option>';
    const weaponTiles = (dataManager?.state?.tiles || [])
        .filter(tile => tile.id !== editingTileId)
        .filter(tile => tile.type === 'Gear' && tile.gearSubtype === 'Weapon' && tile.weapon);

    weaponTiles.forEach(tile => {
        const option = document.createElement('option');
        option.value = tile.id;
        option.textContent = `${tile.name} (${formatWeaponBase(tile.weapon)})`;
        option.dataset.weaponName = tile.name;
        select.appendChild(option);
    });

    const hasPreviousValue = Boolean(previousValue)
        && Array.from(select.options).some(option => option.value === previousValue);
    if (hasPreviousValue) {
        select.value = previousValue;
    } else if (!previousValue && weaponTiles.length === 1) {
        select.value = weaponTiles[0].id;
    } else {
        select.value = '';
    }
}

function syncAmmoNameFromTarget() {
    const nameInput = document.getElementById('tile-name');
    const selectedName = document.getElementById('ammo-target').selectedOptions[0]?.dataset.weaponName || '';
    if (selectedName && !nameInput.value.trim()) {
        nameInput.value = `${selectedName} Ammo`;
    }
}

function syncTileTypeSections() {
    const type = document.getElementById('tile-type').value;
    const gearSubtype = document.getElementById('gear-subtype').value || 'Custom';
    const isAmmo = type === 'Gear' && gearSubtype === 'Ammo';

    document.getElementById('spellcast-skill-container').style.display = type === 'Skill' ? 'block' : 'none';
    document.getElementById('exotic-skill-container').style.display = type === 'Skill' ? 'block' : 'none';
    document.getElementById('gear-subtype-container').style.display = type === 'Gear' ? 'block' : 'none';
    document.getElementById('weapon-builder-container').style.display = type === 'Gear' && gearSubtype === 'Weapon' ? 'block' : 'none';
    document.getElementById('armor-base-container').style.display = type === 'Gear' && gearSubtype === 'Armor' ? 'block' : 'none';
    document.getElementById('ammo-builder-container').style.display = isAmmo ? 'block' : 'none';

    const diceInput = document.getElementById('tile-dice');
    const diceNote = document.getElementById('tile-dice-note');
    diceInput.required = !isAmmo;
    diceInput.placeholder = isAmmo ? 'Ammo has no dice' : 'd4';
    diceNote.textContent = isAmmo ? 'Ammo gear is saved without dice and does not contribute to resource pools.' : '';
    if (isAmmo) {
        populateAmmoTargets(document.getElementById('ammo-target').value, document.getElementById('tile-id').value);
        syncAmmoNameFromTarget();
    }
    renderTileTagLimitStatus();
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

function renderWeaponTemplatePreview(templateId) {
    const preview = document.getElementById('weapon-template-preview');
    if (!preview) return;
    const template = getWeaponTemplateById(templateId);
    if (!template) {
        preview.textContent = '';
        return;
    }

    const chips = formatWeaponTemplateDetails(template).split(' · ');
    preview.innerHTML = chips.map(chip => `<span class="template-preview-chip">${chip}</span>`).join('');
}

function applyWeaponTemplate(templateId) {
    const template = getWeaponTemplateById(templateId);
    renderWeaponTemplatePreview(templateId);
    if (!template) return;

    const nameInput = document.getElementById('tile-name');
    if (!nameInput.value.trim()) {
        nameInput.value = template.name;
    }

    document.getElementById('weapon-category').value = template.category || '';
    document.getElementById('weapon-range').value = template.range || '';
    document.getElementById('weapon-skill').value = template.skill || '';
    const tagMode = document.getElementById('weapon-template-mode').value;
    if (tagMode === 'replace') {
        currentFormTags = [...(template.startingTags || [])];
        renderFormTags();
    } else {
        addMissingTemplateTags(template.startingTags || []);
    }
}

export function renderTagLimitStatus(el, diceStr, tagsArray) {
    if (!el) return null;

    el.classList.remove('valid', 'invalid');

    const isAmmo = document.getElementById('tile-type')?.value === 'Gear'
        && document.getElementById('gear-subtype')?.value === 'Ammo';
    if (isAmmo && !diceStr.trim()) {
        const tagLimit = poolEngine.calculateTagLimit([], tagsArray);
        el.textContent = `Ammo has no dice. Countable tags: ${tagLimit.count}/0.`;
        el.classList.add(tagLimit.valid ? 'valid' : 'invalid');
        return tagLimit;
    }

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
            renderRulesReview();
        }
    });

    // Tags UI
    els.tagSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        const motorizedStat = document.getElementById('tag-motorized-stat');
        const hitchValue = document.getElementById('tag-hitch-value');
        if (val === 'Custom' || val === 'Chain') {
            els.tagCustomInput.style.display = 'inline-block';
            els.tagCustomInput.placeholder = val === 'Chain' ? 'Tile Name to Chain' : 'Custom Tag Name';
            els.tagCustomInput.focus();
            motorizedStat.style.display = 'none';
            hitchValue.style.display = 'none';
        } else if (val === 'Motorized') {
            els.tagCustomInput.style.display = 'none';
            motorizedStat.style.display = 'block';
            hitchValue.style.display = 'none';
        } else if (val === 'Hitch') {
            els.tagCustomInput.style.display = 'none';
            motorizedStat.style.display = 'none';
            hitchValue.style.display = 'block';
        } else {
            els.tagCustomInput.style.display = 'none';
            motorizedStat.style.display = 'none';
            hitchValue.style.display = 'none';
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
        } else if (selVal === 'Hitch') {
            const rebate = Math.min(6, Math.max(1, parseInt(document.getElementById('tag-hitch-value').value, 10) || 3));
            finalTag = `Hitch ${rebate}`;
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
            const hitchValue = document.getElementById('tag-hitch-value');
            hitchValue.style.display = 'none';
            hitchValue.value = '3';
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
    document.getElementById('tile-exotic-skill').addEventListener('change', (e) => {
        if (e.target.value.startsWith('arcana-')) {
            document.getElementById('tile-is-spellcast').checked = true;
        }
    });
    document.getElementById('weapon-template').addEventListener('change', (e) => {
        applyWeaponTemplate(e.target.value);
    });
    document.getElementById('weapon-template-mode').addEventListener('change', () => {
        renderWeaponTemplatePreview(document.getElementById('weapon-template').value);
    });
    document.getElementById('ammo-target').addEventListener('change', () => {
        syncAmmoNameFromTarget();
    });
    document.getElementById('ammo-max-supply').addEventListener('input', () => {
        const maxSupply = Math.max(0, parseInt(document.getElementById('ammo-max-supply').value, 10) || 0);
        const currentInput = document.getElementById('ammo-current-supply');
        const currentSupply = Math.max(0, parseInt(currentInput.value, 10) || 0);
        if (currentSupply > maxSupply) currentInput.value = String(maxSupply);
    });

    // XP Estimation
    els.btnEstimateXp.addEventListener('click', () => {
        const diceStr = document.getElementById('tile-dice').value.trim();
        const { dice: diceArray, invalid } = parseDiceInput(diceStr);
        if (invalid.length > 0) {
            alert(getDiceValidationMessage('Tile dice'));
            return;
        }
        const { xp, unknownTags } = poolEngine.estimateTileXpDetails(diceArray, currentFormTags, getFormArmorType(), {
            weapon: getFormWeapon(),
            exoticSkill: getFormExoticSkill(),
            boxes: getFormBoxes()
        });
        els.tileXp.value = xp;
        renderXpEstimateNote(unknownTags);
    });

    document.querySelectorAll('.tile-box-type').forEach(select => {
        select.addEventListener('change', () => {
            syncTileBoxResourceVisibility();
            renderRulesReview();
        });
    });
    document.querySelectorAll('.tile-box-resource').forEach(select => {
        select.addEventListener('change', renderRulesReview);
    });
}

export function openModal(tile = null) {
    els.modal.classList.add('active');
    els.form.reset();
    setFormBoxes([]);
    currentFormTags = [];
    els.tagCustomInput.style.display = 'none';
    const hitchValue = document.getElementById('tag-hitch-value');
    if (hitchValue) {
        hitchValue.style.display = 'none';
        hitchValue.value = '3';
    }
    renderXpEstimateNote([]);

    const armorMaterial = document.getElementById('armor-material');
    const armorCoverage = document.getElementById('armor-coverage');
    const gearSubtype = document.getElementById('gear-subtype');
    const weaponTemplate = document.getElementById('weapon-template');
    const weaponTemplateMode = document.getElementById('weapon-template-mode');
    const weaponCategory = document.getElementById('weapon-category');
    const weaponRange = document.getElementById('weapon-range');
    const weaponSkill = document.getElementById('weapon-skill');
    const ammoTarget = document.getElementById('ammo-target');
    const ammoCurrentSupply = document.getElementById('ammo-current-supply');
    const ammoMaxSupply = document.getElementById('ammo-max-supply');
    const ammoReplacesTag = document.getElementById('ammo-replaces-tag');
    const exoticSkill = document.getElementById('tile-exotic-skill');

    if (tile) {
        document.getElementById('modal-title').innerText = 'Edit Tile';
        document.getElementById('tile-id').value = tile.id;
        const tileType = tile.type || 'Skill';
        document.getElementById('tile-type').value = tileType;
        gearSubtype.value = tile.gearSubtype || (tile.ammo ? 'Ammo' : tile.weapon ? 'Weapon' : tile.armorType ? 'Armor' : 'Custom');
        weaponTemplate.value = tile.weapon?.templateId || '';
        weaponTemplateMode.value = 'add';
        weaponCategory.value = tile.weapon?.category || '';
        weaponRange.value = tile.weapon?.range || '';
        weaponSkill.value = tile.weapon?.skill || '';
        populateAmmoTargets(tile.ammo?.targetTileId || '', tile.id);
        ammoTarget.value = tile.ammo?.targetTileId || '';
        ammoCurrentSupply.value = tile.ammo?.currentSupply ?? 0;
        ammoMaxSupply.value = tile.ammo?.maxSupply ?? 1;
        ammoReplacesTag.value = tile.ammo?.replacesTag || 'Reload';
        armorMaterial.value = tile.armorType?.material || '';
        armorCoverage.value = tile.armorType?.coverage || '';
        document.getElementById('tile-is-spellcast').checked = !!tile.isSpellcastSkill;
        exoticSkill.value = tile.exoticSkill?.id || '';
        document.getElementById('tile-name').value = tile.name;
        document.getElementById('tile-description').value = tile.description || '';
        document.getElementById('tile-dice').value = (tile.dice || []).join(', ');
        if (Array.isArray(tile.tags)) {
            currentFormTags = tile.tags.map(t => String(t).trim()).filter(Boolean);
        } else if (tile.tags) {
            // Legacy comma-string fallback (older exports).
            currentFormTags = String(tile.tags).split(',').map(t => t.trim()).filter(Boolean);
        }
        
        setFormBoxes(getTileBoxes(tile));
        els.tileXp.value = tile.xpCost || 0;
        els.btnDelete.style.display = 'inline-block';
    } else {
        document.getElementById('modal-title').innerText = 'Add Tile';
        document.getElementById('tile-id').value = '';
        document.getElementById('tile-type').value = 'Skill';
        gearSubtype.value = 'Custom';
        weaponTemplate.value = '';
        weaponTemplateMode.value = 'add';
        weaponCategory.value = '';
        weaponRange.value = '';
        weaponSkill.value = '';
        populateAmmoTargets();
        ammoTarget.value = '';
        ammoCurrentSupply.value = '0';
        ammoMaxSupply.value = '1';
        ammoReplacesTag.value = 'Reload';
        armorMaterial.value = '';
        armorCoverage.value = '';
        document.getElementById('tile-is-spellcast').checked = false;
        exoticSkill.value = '';
        document.getElementById('tile-description').value = '';
        setFormBoxes([]);
        els.tileXp.value = 0;
        els.btnDelete.style.display = 'none';
    }
    
    renderWeaponTemplatePreview(weaponTemplate.value);
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
    const gearSubtype = getFormGearSubtype();
    const isAmmo = type === 'Gear' && gearSubtype === 'Ammo';
    
    const boxes = getFormBoxes();
    const checkedColors = getTileColorsFromBoxes(boxes);

    if (!isAmmo && boxes.length !== 2) {
        alert('Please select exactly 2 tile boxes.');
        return;
    }
    if (isAmmo && ![0, 2].includes(boxes.length)) {
        alert('Ammo can have no boxes or exactly 2 boxes.');
        return;
    }
    const missingShadowResource = boxes.find(box => box.type === 'shadow' && !box.resource);
    if (missingShadowResource) {
        alert(`${missingShadowResource.kind} boxes must choose Health, Energy, or Reflex.`);
        return;
    }

    const { dice: diceArray, invalid } = parseDiceInput(diceStr);
    if (invalid.length > 0 || (!isAmmo && diceArray.length === 0)) {
        alert(getDiceValidationMessage('Tile dice'));
        return;
    }
    if (isAmmo && diceArray.length > 0) {
        alert('Ammo gear does not use dice. Leave the Dice field blank.');
        return;
    }

    const tagLimit = poolEngine.calculateTagLimit(diceArray, currentFormTags);
    renderTileTagLimitStatus();
    if (!tagLimit.valid) {
        alert(tagLimitErrorMessage('This tile', tagLimit));
        return;
    }

    const armorType = getFormArmorType();
    const weapon = getFormWeapon();
    const ammo = getFormAmmo();
    const exoticSkill = getFormExoticSkill();

    const existingTile = id ? dataManager.state.tiles.find(t => t.id === id) : null;
    const tile = {
        id: id || null,
        type,
        name,
        description,
        colors: checkedColors,
        dice: isAmmo ? [] : diceArray,
        tags,
        xpCost,
        isSpellcastSkill,
        exoticSkill,
        gearSubtype,
        weapon,
        ammo,
        armorType,
        isBurnt: existingTile?.isBurnt || false,
        isBuried: existingTile?.isBuried || false
    };
    tile.boxes = boxes;

    const shadowTagIssues = validateShadowTags(tile);
    if (shadowTagIssues.length > 0) {
        alert(shadowTagIssues.map(issue => issue.message).join('\n'));
        return;
    }

    const currentHitchTotal = calculateHitchRebateTotal(dataManager.state.tiles || []);
    const nextTiles = id
        ? (dataManager.state.tiles || []).map(t => t.id === id ? tile : t)
        : [...(dataManager.state.tiles || []), tile];
    const nextHitchTotal = calculateHitchRebateTotal(nextTiles);
    if (nextHitchTotal > 6 && nextHitchTotal > currentHitchTotal) {
        alert(`Hitch rebates are capped at 6 XP per sheet. This would make ${nextHitchTotal} XP of Hitch rebates.`);
        return;
    }

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
    renderRulesReview();
}
