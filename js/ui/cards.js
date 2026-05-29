// NOTE: This module has circular imports with pool.js and modals.js.
// This is safe because all cross-imported symbols are functions that are
// only called at runtime (inside event handlers or render cycles), never
// during module evaluation.
import { escapeHtml, getExoticSkillLabel, getTileBoxes, isHitchedTile, RESOURCE_LABELS, tileTagList } from '../pool.js';
import { COLOR_HEX } from '../data.js';
import { uiState } from '../state.js';
import { els } from '../els.js';
import { formatAmmoBase, formatArmorBase, formatWeaponBase } from './modals.js';
import { updatePoolPreview } from './pool.js';
import { updateShadowMax } from './vitals.js';
import { renderRulesReview } from './rulesReview.js';

let dataManager;
let spellBuilder;
let openTileModalFn;
let draggedTileId = null;
let pointerDragState = null;
let suppressCardClickUntil = 0;
let reorderMode = false;

function clearDragClasses() {
    document.querySelectorAll('.tile-dragging, .tile-drop-target').forEach(card => {
        card.classList.remove('tile-dragging', 'tile-drop-target');
    });
}

function restoreCustomSortControls() {
    if (els.sortTilesBy) els.sortTilesBy.value = 'default';
    if (els.btnSortDir) {
        els.btnSortDir.dataset.dir = 'asc';
        els.btnSortDir.innerHTML = '\u2193';
    }
    if (els.ignoreFavoritesSort) els.ignoreFavoritesSort.checked = true;
}

function syncReorderButton() {
    if (!els.btnReorderTiles) return;
    els.btnReorderTiles.classList.toggle('active', reorderMode);
    els.btnReorderTiles.setAttribute('aria-pressed', reorderMode ? 'true' : 'false');
    els.btnReorderTiles.textContent = reorderMode ? 'Done' : 'Reorder';
}

function updateCustomOrder(visibleTileIds, draggedId, targetId) {
    dataManager.reorderTilesByVisibleMove(visibleTileIds, draggedId, targetId);
    restoreCustomSortControls();
    renderCards();
}

function moveTileByStep(visibleTileIds, tileId, step) {
    const currentIndex = visibleTileIds.indexOf(tileId);
    const targetId = visibleTileIds[currentIndex + step];
    if (!targetId) return;
    updateCustomOrder(visibleTileIds, tileId, targetId);
}

export function init(deps) {
    dataManager = deps.dataManager;
    openTileModalFn = deps.openTileModal;
    spellBuilder = deps.spellBuilder;

    // Search
    if (els.searchTiles) {
        els.searchTiles.addEventListener('input', () => renderCards());
        if (els.sortTilesBy) els.sortTilesBy.addEventListener('change', () => renderCards());
        if (els.ignoreFavoritesSort) els.ignoreFavoritesSort.addEventListener('change', () => renderCards());
        if (els.btnReorderTiles) {
            els.btnReorderTiles.addEventListener('click', () => {
                reorderMode = !reorderMode;
                if (reorderMode) restoreCustomSortControls();
                syncReorderButton();
                renderCards();
            });
        }
        if (els.btnSortDir) {
            els.btnSortDir.addEventListener('click', () => {
                const dir = els.btnSortDir.dataset.dir === 'asc' ? 'desc' : 'asc';
                els.btnSortDir.dataset.dir = dir;
                els.btnSortDir.innerHTML = dir === 'asc' ? '\u2193' : '\u2191';
                renderCards();
            });
        }
    }

    // Auto-filter by call colors
    els.autoFilterCall.addEventListener('change', renderCards);
}

export function handleCardClick(tile) {
    if (tile.isBurnt || tile.isBuried || tile.gearSubtype === 'Ammo') {
        // Cannot select unavailable tiles.
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
        } else if (isHitchedTile(tile)) {
            return;
        } else {
            uiState.burnTiles.push(tile);
        }
    }
    renderCards();
    updatePoolPreview();
}

export function renderCards() {
    els.cardContainer.innerHTML = '';
    syncReorderButton();
    els.cardContainer.classList.toggle('card-grid-reorder-mode', reorderMode);
    
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
            const tagsText = tileTagList(tile).join(' ');
            const searchableText = `${tile.name} ${(tile.colors || []).join(' ')} ${tile.type || 'Skill'} ${tile.gearSubtype || ''} ${tagsText} ${formatArmorBase(tile.armorType)} ${formatWeaponBase(tile.weapon)} ${formatAmmoBase(tile.ammo)} ${tile.description || ''}`.toLowerCase();
            if (!searchableText.includes(searchTerm)) return false;
        }
        
        // Auto-Filter by Call Colors
        if (activeCallColors.length > 0) {
            const hasMatchingColor = (tile.colors || []).some(c => activeCallColors.includes(c));
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

    const visibleTileIds = filteredTiles.map(tile => tile.id);

    filteredTiles.forEach(tile => {
        const div = document.createElement('div');
        div.className = 'tile-card';
        div.draggable = reorderMode;
        div.dataset.tileId = tile.id;
        if (reorderMode) div.classList.add('tile-reorder-mode');
        const tileNameLabel = escapeHtml(tile.name);
        const armorLabel = formatArmorBase(tile.armorType);
        const weaponLabel = formatWeaponBase(tile.weapon);
        const ammoLabel = formatAmmoBase(tile.ammo);
        const isAmmo = tile.type === 'Gear' && tile.gearSubtype === 'Ammo';
        const isHitched = isHitchedTile(tile);
        const exoticLabel = getExoticSkillLabel(tile.exoticSkill);
        const linkedAmmoTiles = tile.weapon
            ? dataManager.state.tiles.filter(t => t.gearSubtype === 'Ammo' && t.ammo?.targetTileId === tile.id && !t.isBuried)
            : [];
        const needsAmmoLink = Boolean(tile.weapon)
            && tileTagList(tile).some(tag => String(tag).toLowerCase() === 'reload')
            && linkedAmmoTiles.length === 0;
        
        // Gradient background based on 2 colors
        const boxes = getTileBoxes(tile);
        let c1 = COLOR_HEX[(tile.colors || [])[0]] || '#444';
        let c2 = COLOR_HEX[(tile.colors || [])[1]] || c1;
        div.style.background = `linear-gradient(135deg, ${c1}44, ${c2}44)`;
        div.style.border = `1px solid ${c1}88`;

        if (uiState.callTile && uiState.callTile.id === tile.id) div.classList.add('selected-call');
        if (uiState.burnTiles.some(t => t.id === tile.id)) div.classList.add('selected-burn');
        if (tile.isBurnt) div.classList.add('tile-burnt');
        if (tile.isBuried) div.classList.add('tile-buried');
        if (isAmmo) div.classList.add('tile-ammo-card');

        const actionButtons = tile.isBuried
            ? `<button class="btn-restore-tile" title="Restore ${tileNameLabel}" aria-label="Restore ${tileNameLabel}">Restore</button>`
            : isAmmo
                ? `<div class="tile-card-actions">
                    <button class="btn-use-ammo" ${tile.ammo?.currentSupply > 0 ? '' : 'disabled'} title="Use ammo from ${tileNameLabel}" aria-label="Use ammo from ${tileNameLabel}">Use</button>
                    <button class="btn-restock-ammo" title="Restock ${tileNameLabel}" aria-label="Restock ${tileNameLabel}">Restock</button>
                    <button class="btn-bury-tile" title="Bury ${tileNameLabel}" aria-label="Bury ${tileNameLabel}">Bury</button>
                </div>`
            : tile.isBurnt
                ? `<button class="btn-unburn" title="Un-burn ${tileNameLabel}" aria-label="Un-burn ${tileNameLabel}">Un-burn</button>`
                : `<div class="tile-card-actions">
                    ${isHitched ? '<span class="tile-hitch-note" title="Hitched tiles cost 1 EN when called and cannot be burned">Hitch: 1 EN</span>' : `<button class="btn-burn-instant" title="Burn ${tileNameLabel}" aria-label="Burn ${tileNameLabel}">Burn</button>`}
                    <button class="btn-bury-tile" title="Bury ${tileNameLabel}" aria-label="Bury ${tileNameLabel}">Bury</button>
                </div>`;

        div.innerHTML = `
            <div class="tile-badges">
                ${reorderMode ? `<span class="tile-drag-handle" title="Drag ${tileNameLabel} to reorder">Move</span>` : ''}
                ${boxes.map(box => {
                    const label = box.type === 'shadow'
                        ? `${box.kind} -> ${RESOURCE_LABELS[box.resource] || 'Resource'}`
                        : box.color;
                    const chipColor = box.type === 'shadow' ? COLOR_HEX[box.kind] : COLOR_HEX[box.color];
                    const textColor = ['Yellow', 'Qi'].includes(box.type === 'shadow' ? box.kind : box.color) ? 'black' : 'white';
                    return `<span class="badge" style="background:${chipColor}; color:${textColor}">${escapeHtml(label)}</span>`;
                }).join('')}
                ${tile.type ? `<span class="badge tile-type-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);">${escapeHtml(String(tile.type).toUpperCase())}</span>` : `<span class="badge tile-type-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);">SKILL</span>`}
                ${tile.gearSubtype ? `<span class="badge tile-subtype-badge" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2);">${escapeHtml(String(tile.gearSubtype).toUpperCase())}</span>` : ''}
                ${exoticLabel ? `<span class="badge exotic-skill-badge">${escapeHtml(exoticLabel)}</span>` : ''}
                ${tile.weapon?.category ? `<span class="badge weapon-category-badge" style="background: rgba(51, 153, 255, 0.2); color: #99ccff; border: 1px solid rgba(153,204,255,0.6);">${escapeHtml(tile.weapon.category)}</span>` : ''}
                <span class="badge" style="background: rgba(255, 215, 0, 0.2); color: #ffd700; border: 1px solid #ffd700; margin-left: auto;">${tile.xpCost !== undefined ? escapeHtml(tile.xpCost) : 0} XP</span>
            </div>
            <div class="tile-card-content">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="tile-name" style="margin-bottom: 0;">${escapeHtml(tile.name)}</div>
                    <button class="btn-favorite ${tile.isFavorite ? 'active' : ''}" title="Toggle Favorite" aria-label="Toggle Favorite">\u2605</button>
                </div>
                ${reorderMode ? `<div class="tile-reorder-controls" aria-label="Reorder ${tileNameLabel}">
                    <button type="button" class="btn-tile-move-up" aria-label="Move ${tileNameLabel} up">Up</button>
                    <button type="button" class="btn-tile-move-down" aria-label="Move ${tileNameLabel} down">Down</button>
                </div>` : ''}
                <div class="tile-tags">${escapeHtml(tileTagList(tile).join(', '))}</div>
                ${armorLabel ? `<div class="tile-armor" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">\ud83d\udee1\ufe0f ${escapeHtml(armorLabel)}</div>` : ''}
                ${weaponLabel ? `<div class="tile-weapon" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">${escapeHtml(weaponLabel)}</div>` : ''}
                ${linkedAmmoTiles.length ? `<div class="tile-ammo-links" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">Ammo: ${escapeHtml(linkedAmmoTiles.map(t => `${t.name} ${t.ammo?.currentSupply ?? 0}/${t.ammo?.maxSupply ?? 0}`).join(', '))}</div>` : ''}
                ${needsAmmoLink ? `<div class="tile-ammo-warning" style="font-size: 0.8rem; color: #ffd166; margin-top: 0.25rem;">Reload weapon has no linked ammo</div>` : ''}
                ${ammoLabel ? `<div class="tile-ammo" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">${escapeHtml(ammoLabel)}</div>` : ''}
                <div class="tile-dice">${isAmmo ? 'No dice' : escapeHtml((tile.dice || []).join(', '))}</div>
                <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
                    <button class="btn-edit-tile" aria-label="Edit ${tileNameLabel}" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; cursor: pointer;">\u270f\ufe0f Edit</button>
                    ${tile.description ? `<button class="btn-details" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; cursor: pointer;">Details \u25bc</button>` : ''}
                </div>
                ${tile.description ? `<div class="tile-description" style="display: none; margin-top: 0.5rem; font-size: 0.9rem; font-style: italic; color: var(--text-secondary); background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(tile.description)}</div>` : ''}
            </div>
            ${actionButtons}
        `;

        if (reorderMode) {
            const btnMoveUp = div.querySelector('.btn-tile-move-up');
            const btnMoveDown = div.querySelector('.btn-tile-move-down');
            if (btnMoveUp) {
                btnMoveUp.disabled = visibleTileIds.indexOf(tile.id) === 0;
                btnMoveUp.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moveTileByStep(visibleTileIds, tile.id, -1);
                });
            }
            if (btnMoveDown) {
                btnMoveDown.disabled = visibleTileIds.indexOf(tile.id) === visibleTileIds.length - 1;
                btnMoveDown.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moveTileByStep(visibleTileIds, tile.id, 1);
                });
            }

            div.addEventListener('pointerdown', (e) => {
                if (e.target.closest('button, select, input, textarea, a')) return;
                pointerDragState = {
                    tileId: tile.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    targetId: '',
                    active: false
                };
                div.setPointerCapture?.(e.pointerId);
            });
            div.addEventListener('pointermove', (e) => {
                if (!pointerDragState || pointerDragState.tileId !== tile.id) return;
                const distance = Math.hypot(e.clientX - pointerDragState.startX, e.clientY - pointerDragState.startY);
                if (!pointerDragState.active && distance < 8) return;

                pointerDragState.active = true;
                suppressCardClickUntil = Date.now() + 600;
                e.preventDefault();
                clearDragClasses();
                div.classList.add('tile-dragging');

                const targetCard = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.tile-card');
                const targetId = targetCard?.dataset.tileId || '';
                if (targetId && targetId !== tile.id) {
                    targetCard.classList.add('tile-drop-target');
                    pointerDragState.targetId = targetId;
                } else {
                    pointerDragState.targetId = '';
                }
            });
            div.addEventListener('pointerup', (e) => {
                if (!pointerDragState || pointerDragState.tileId !== tile.id) return;
                const targetId = pointerDragState.targetId;
                const wasActive = pointerDragState.active;
                pointerDragState = null;
                div.releasePointerCapture?.(e.pointerId);
                clearDragClasses();
                if (wasActive) {
                    suppressCardClickUntil = Date.now() + 600;
                    e.preventDefault();
                    e.stopPropagation();
                }
                if (wasActive && targetId) {
                    updateCustomOrder(visibleTileIds, tile.id, targetId);
                }
            });
            div.addEventListener('pointercancel', () => {
                pointerDragState = null;
                clearDragClasses();
            });

            div.addEventListener('dragstart', (e) => {
                draggedTileId = tile.id;
                suppressCardClickUntil = Date.now() + 600;
                div.classList.add('tile-dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', tile.id);
                }
            });

            div.addEventListener('dragover', (e) => {
                const incomingId = draggedTileId || e.dataTransfer?.getData('text/plain');
                if (!incomingId || incomingId === tile.id) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                div.classList.add('tile-drop-target');
            });

            div.addEventListener('dragleave', () => {
                div.classList.remove('tile-drop-target');
            });

            div.addEventListener('drop', (e) => {
                const incomingId = e.dataTransfer?.getData('text/plain') || draggedTileId;
                if (!incomingId || incomingId === tile.id) return;
                e.preventDefault();
                e.stopPropagation();
                draggedTileId = null;
                suppressCardClickUntil = Date.now() + 600;
                updateCustomOrder(visibleTileIds, incomingId, tile.id);
            });

            div.addEventListener('dragend', () => {
                draggedTileId = null;
                suppressCardClickUntil = Date.now() + 600;
                clearDragClasses();
            });
        }

        const btnFavorite = div.querySelector('.btn-favorite');
        if (btnFavorite) {
            btnFavorite.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isFavorite = !tile.isFavorite;
                dataManager.saveState();
                renderCards();
            });
        }

        if (tile.isBuried) {
            const btnRestore = div.querySelector('.btn-restore-tile');
            btnRestore.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isBuried = false;
                dataManager.updateTile(tile);
                renderCards();
                updatePoolPreview();
                updateShadowMax();
                renderRulesReview();
            });
        } else if (isAmmo) {
            const btnUseAmmo = div.querySelector('.btn-use-ammo');
            const btnRestockAmmo = div.querySelector('.btn-restock-ammo');
            const btnBury = div.querySelector('.btn-bury-tile');

            btnUseAmmo.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.ammo = tile.ammo || { currentSupply: 0, maxSupply: 0, replacesTag: 'Reload' };
                tile.ammo.currentSupply = Math.max(0, (parseInt(tile.ammo.currentSupply, 10) || 0) - 1);
                dataManager.updateTile(tile);
                renderCards();
                renderRulesReview();
            });
            btnRestockAmmo.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.ammo = tile.ammo || { currentSupply: 0, maxSupply: 0, replacesTag: 'Reload' };
                tile.ammo.currentSupply = Math.max(0, parseInt(tile.ammo.maxSupply, 10) || 0);
                dataManager.updateTile(tile);
                renderCards();
                renderRulesReview();
            });
            btnBury.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isBuried = true;
                tile.isBurnt = false;
                dataManager.updateTile(tile);
                renderCards();
                updatePoolPreview();
                updateShadowMax();
                renderRulesReview();
            });
        } else if (tile.isBurnt) {
            const btnUnburn = div.querySelector('.btn-unburn');
            btnUnburn.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isBurnt = false;
                dataManager.updateTile(tile);
                renderCards();
                updatePoolPreview();
                renderRulesReview();
            });
        } else {
            const btnBurn = div.querySelector('.btn-burn-instant');
            if (btnBurn) {
                btnBurn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tile.isBurnt = true;
                    if (uiState.callTile && uiState.callTile.id === tile.id) uiState.callTile = null;
                    uiState.burnTiles = uiState.burnTiles.filter(t => t.id !== tile.id);
                    dataManager.updateTile(tile);
                    renderCards();
                    updatePoolPreview();
                    renderRulesReview();
                });
            }
            const btnBury = div.querySelector('.btn-bury-tile');
            btnBury.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isBuried = true;
                tile.isBurnt = false;
                if (uiState.callTile && uiState.callTile.id === tile.id) uiState.callTile = null;
                uiState.burnTiles = uiState.burnTiles.filter(t => t.id !== tile.id);
                dataManager.updateTile(tile);
                renderCards();
                updatePoolPreview();
                updateShadowMax();
                renderRulesReview();
            });
        }

        const btnEdit = div.querySelector('.btn-edit-tile');
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            if (tile.isSpell) {
                spellBuilder.openWizard(tile);
            } else {
                openTileModalFn(tile);
            }
        });

        if (tile.description) {
            const btnDetails = div.querySelector('.btn-details');
            const descDiv = div.querySelector('.tile-description');
            btnDetails.addEventListener('click', (e) => {
                e.stopPropagation();
                if (descDiv.style.display === 'none') {
                    descDiv.style.display = 'block';
                    btnDetails.innerText = 'Details \u25b2';
                } else {
                    descDiv.style.display = 'none';
                    btnDetails.innerText = 'Details \u25bc';
                }
            });
        }

        // Click to Select for Pool
        div.addEventListener('click', () => {
            if (reorderMode) return;
            if (Date.now() < suppressCardClickUntil) return;
            handleCardClick(tile);
        });
        
        // Long press or right click to Edit
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (tile.isSpell) {
                spellBuilder.openWizard(tile);
            } else {
                openTileModalFn(tile);
            }
        });

        els.cardContainer.appendChild(div);
    });
}
