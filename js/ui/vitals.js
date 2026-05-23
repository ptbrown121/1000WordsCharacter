import { els } from '../els.js';
import { getEffectiveMax } from '../data.js';

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
}
