// NOTE: This module has circular imports with pool.js and modals.js.
// This is safe because all cross-imported symbols are functions that are
// only called at runtime (inside event handlers or render cycles), never
// during module evaluation.
import { escapeHtml, tileTagList } from '../pool.js';
import { COLOR_HEX } from '../data.js';
import { uiState } from '../state.js';
import { els } from '../els.js';
import { formatArmorBase, formatWeaponBase } from './modals.js';
import { updatePoolPreview } from './pool.js';
import { updateShadowMax } from './vitals.js';

let dataManager;
let spellBuilder;
let openTileModalFn;

export function init(deps) {
    dataManager = deps.dataManager;
    openTileModalFn = deps.openTileModal;
    spellBuilder = deps.spellBuilder;

    // Search
    if (els.searchTiles) {
        els.searchTiles.addEventListener('input', () => renderCards());
        if (els.sortTilesBy) els.sortTilesBy.addEventListener('change', () => renderCards());
        if (els.ignoreFavoritesSort) els.ignoreFavoritesSort.addEventListener('change', () => renderCards());
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
    if (tile.isBurnt || tile.isBuried) {
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
        } else {
            uiState.burnTiles.push(tile);
        }
    }
    renderCards();
    updatePoolPreview();
}

export function renderCards() {
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
            const tagsText = tileTagList(tile).join(' ');
            const searchableText = `${tile.name} ${(tile.colors || []).join(' ')} ${tile.type || 'Skill'} ${tile.gearSubtype || ''} ${tagsText} ${formatArmorBase(tile.armorType)} ${formatWeaponBase(tile.weapon)} ${tile.description || ''}`.toLowerCase();
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
        const weaponLabel = formatWeaponBase(tile.weapon);
        
        // Gradient background based on 2 colors
        let c1 = COLOR_HEX[tile.colors[0]] || '#444';
        let c2 = COLOR_HEX[tile.colors[1]] || c1;
        div.style.background = `linear-gradient(135deg, ${c1}44, ${c2}44)`;
        div.style.border = `1px solid ${c1}88`;

        if (uiState.callTile && uiState.callTile.id === tile.id) div.classList.add('selected-call');
        if (uiState.burnTiles.some(t => t.id === tile.id)) div.classList.add('selected-burn');
        if (tile.isBurnt) div.classList.add('tile-burnt');
        if (tile.isBuried) div.classList.add('tile-buried');

        const actionButtons = tile.isBuried
            ? `<button class="btn-restore-tile" title="Restore ${tileNameLabel}" aria-label="Restore ${tileNameLabel}">Restore</button>`
            : tile.isBurnt
                ? `<button class="btn-unburn" title="Un-burn ${tileNameLabel}" aria-label="Un-burn ${tileNameLabel}">Un-burn</button>`
                : `<div class="tile-card-actions">
                    <button class="btn-burn-instant" title="Burn ${tileNameLabel}" aria-label="Burn ${tileNameLabel}">Burn</button>
                    <button class="btn-bury-tile" title="Bury ${tileNameLabel}" aria-label="Bury ${tileNameLabel}">Bury</button>
                </div>`;

        div.innerHTML = `
            <div class="tile-badges">
                ${tile.colors.map(c => `<span class="badge" style="background:${COLOR_HEX[c]}; color:${c==='White'||c==='Yellow'?'black':'white'}">${escapeHtml(c)}</span>`).join('')}
                ${tile.type ? `<span class="badge tile-type-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);">${escapeHtml(String(tile.type).toUpperCase())}</span>` : `<span class="badge tile-type-badge" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);">SKILL</span>`}
                <span class="badge" style="background: rgba(255, 215, 0, 0.2); color: #ffd700; border: 1px solid #ffd700; margin-left: auto;">${tile.xpCost !== undefined ? escapeHtml(tile.xpCost) : 0} XP</span>
            </div>
            <div class="tile-card-content">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="tile-name" style="margin-bottom: 0;">${escapeHtml(tile.name)}</div>
                    <button class="btn-favorite ${tile.isFavorite ? 'active' : ''}" title="Toggle Favorite" aria-label="Toggle Favorite">\u2605</button>
                </div>
                <div class="tile-tags">${escapeHtml(tileTagList(tile).join(', '))}</div>
                ${armorLabel ? `<div class="tile-armor" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">\ud83d\udee1\ufe0f ${escapeHtml(armorLabel)}</div>` : ''}
                ${weaponLabel ? `<div class="tile-weapon" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">${escapeHtml(weaponLabel)}</div>` : ''}
                <div class="tile-dice">${escapeHtml(tile.dice.join(', '))}</div>
                <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem;">
                    <button class="btn-edit-tile" aria-label="Edit ${tileNameLabel}" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; cursor: pointer;">\u270f\ufe0f Edit</button>
                    ${tile.description ? `<button class="btn-details" style="background: rgba(255,255,255,0.1); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; cursor: pointer;">Details \u25bc</button>` : ''}
                </div>
                ${tile.description ? `<div class="tile-description" style="display: none; margin-top: 0.5rem; font-size: 0.9rem; font-style: italic; color: var(--text-secondary); background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(tile.description)}</div>` : ''}
            </div>
            ${actionButtons}
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

        if (tile.isBuried) {
            const btnRestore = div.querySelector('.btn-restore-tile');
            btnRestore.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isBuried = false;
                dataManager.updateTile(tile);
                renderCards();
                updatePoolPreview();
                updateShadowMax();
            });
        } else if (tile.isBurnt) {
            const btnUnburn = div.querySelector('.btn-unburn');
            btnUnburn.addEventListener('click', (e) => {
                e.stopPropagation();
                tile.isBurnt = false;
                dataManager.updateTile(tile);
                renderCards();
                updatePoolPreview();
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
        div.addEventListener('click', () => handleCardClick(tile));
        
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
