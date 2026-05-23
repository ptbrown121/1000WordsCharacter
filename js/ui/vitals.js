import { els } from '../els.js';

let dataManager;
let poolEngine;
let renderAll;

export function init(deps) {
    dataManager = deps.dataManager;
    poolEngine = deps.poolEngine;
    renderAll = deps.renderAll;

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

    // Auto-Calculate Vitals
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
    const shEffMax = shBase + (dataManager.state.shPerm || 0) + (dataManager.state.shTemp || 0);
    els.valShMax.innerText = shEffMax;
    renderTempBadge(els.shTempBadge, dataManager.state.shTemp);
}
