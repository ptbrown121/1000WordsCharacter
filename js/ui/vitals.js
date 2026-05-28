import { els } from '../els.js';
import { getEffectiveMax } from '../data.js';
import { formatAberration, getAvailableShadowAbilities, getShadowTagCounts } from '../pool.js';

let dataManager;
let poolEngine;
let renderAll;

const toInt = (value) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
};

export function init(deps) {
    dataManager = deps.dataManager;
    poolEngine = deps.poolEngine;
    renderAll = deps.renderAll;

    els.valHp.addEventListener('change', (e) => dataManager.updateResource('hp', toInt(e.target.value)));
    els.valEn.addEventListener('change', (e) => dataManager.updateResource('en', toInt(e.target.value)));
    els.valRx.addEventListener('change', (e) => dataManager.updateResource('rx', toInt(e.target.value)));
    els.valSh.addEventListener('change', (e) => { dataManager.state.sh = toInt(e.target.value); dataManager.saveState(); });
    if (els.valAberration) {
        els.valAberration.addEventListener('change', (e) => {
            dataManager.state.aberration = toInt(e.target.value);
            dataManager.saveState();
            renderShadowStatus();
        });
    }
    if (els.btnShadowToggle && els.shadowPanelBody) {
        els.btnShadowToggle.addEventListener('click', () => {
            const isOpening = els.shadowPanelBody.hidden;
            els.shadowPanelBody.hidden = !isOpening;
            els.btnShadowToggle.setAttribute('aria-expanded', String(isOpening));
            els.btnShadowToggle.textContent = isOpening ? 'Hide' : 'Show';
        });
    }
    if (els.btnShadowInfo && els.shadowInfoModal) {
        els.btnShadowInfo.addEventListener('click', () => {
            renderShadowStatus();
            els.shadowInfoModal.classList.add('active');
        });
    }
    if (els.btnShadowInfoClose && els.shadowInfoModal) {
        els.btnShadowInfoClose.addEventListener('click', () => {
            els.shadowInfoModal.classList.remove('active');
        });
        els.shadowInfoModal.addEventListener('click', (e) => {
            if (e.target === els.shadowInfoModal) els.shadowInfoModal.classList.remove('active');
        });
    }

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
        const state = dataManager.state;
        state.hp = getEffectiveMax(state, 'hp');
        state.en = getEffectiveMax(state, 'en');
        state.rx = getEffectiveMax(state, 'rx');
        state.sh = getEffectiveMax(state, 'sh', poolEngine.calculateShadowMax(state.tiles));
        state.tiles.forEach(t => t.isBurnt = false);
        dataManager.saveState();
        renderAll();
    });

    // Auto-Calculate Vitals
    els.btnCalcVitals.addEventListener('click', () => {
        const state = dataManager.state;
        const resourceMaxes = poolEngine.calculateResourceMaxes(state.tiles);

        state.hpMax = resourceMaxes.hp;
        state.hp = getEffectiveMax(state, 'hp');

        state.enMax = resourceMaxes.en;
        state.en = getEffectiveMax(state, 'en');

        state.rxMax = resourceMaxes.rx;
        state.rx = getEffectiveMax(state, 'rx');

        state.sh = getEffectiveMax(state, 'sh', resourceMaxes.sh);

        dataManager.saveState();
        renderAll();
    });
}

export function renderTempBadge(badgeEl, tempVal) {
    const val = parseInt(tempVal, 10) || 0;
    if (val > 0) {
        badgeEl.innerText = `+${val} Temp`;
        badgeEl.style.display = 'inline-block';
    } else {
        badgeEl.style.display = 'none';
    }
}

export function updateShadowMax() {
    const shBase = poolEngine.calculateShadowMax(dataManager.state.tiles);
    const shEffMax = getEffectiveMax(dataManager.state, 'sh', shBase);
    els.valShMax.innerText = shEffMax;
    renderTempBadge(els.shTempBadge, dataManager.state.shTemp);
    renderShadowStatus();
}

export function renderShadowStatus() {
    if (!els.shadowAlignmentDisplay || !dataManager || !poolEngine) return;
    const shBase = poolEngine.calculateShadowMax(dataManager.state.tiles);
    const maxShadow = getEffectiveMax(dataManager.state, 'sh', shBase);
    const tagCounts = getShadowTagCounts(dataManager.state.tiles);
    const aberration = toInt(dataManager.state.aberration);
    if (els.valAberration) els.valAberration.value = aberration;
    els.shadowAlignmentDisplay.textContent = formatAberration(aberration, maxShadow, tagCounts);

    if (!els.shadowAbilitiesDisplay) return;
    const abilities = getAvailableShadowAbilities(aberration, maxShadow, tagCounts);
    if (maxShadow <= 0) {
        els.shadowAbilitiesDisplay.textContent = 'No Qi or Id boxes: no Shadow abilities available.';
        return;
    }
    els.shadowAbilitiesDisplay.innerHTML = abilities.length
        ? abilities.map(ability => `<div><strong>${ability.side}</strong>: ${ability.label}</div>`).join('')
        : 'No Shadow abilities available at this Aberration.';
}
