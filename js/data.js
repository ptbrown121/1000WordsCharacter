export const STAT_COLORS = {
    'BODY': 'Red',
    'POWER': 'Orange',
    'SOUL': 'Yellow',
    'FOCUS': 'Green',
    'MIND': 'Blue',
    'SPEED': 'Purple',
    'Id': 'Black',
    'Qi': 'White'
};

export const COLOR_HEX = {
    'Red': '#ff3333',
    'Orange': '#ff9933',
    'Yellow': '#ffcc00',
    'Green': '#33cc33',
    'Blue': '#3399ff',
    'Purple': '#9933ff',
    'Black': '#444444',
    'White': '#ffffff'
};

export const VALID_DICE = new Set(['d3', 'd4', 'd6', 'd8', 'd10', 'd12', 'd14', 'd16']);

/**
 * In-place migration: ensure tile.tags is a string[] of trimmed tag strings.
 * Legacy saves stored it as a comma-separated string; SpellBuilder once
 * stored it as a list of {name, xp} objects. This normalizer is idempotent
 * and is called both when loading from localStorage and when importing JSON.
 *
 * Also strips a known-bad tag pattern: spells saved before the
 * "preview-as-tag" bug fix have the auto-generated description sentence
 * (always starting with "Effect:") incorrectly appended to tile.tags. We
 * detect those by `isSpell && tag.startsWith('Effect:')` and drop them.
 * Real player-authored tags do not begin with "Effect:" - the rulebook's
 * tag taxonomy does not include such a tag.
 */
export function normalizeTileTags(tile) {
    if (!tile || typeof tile !== 'object') return;
    const raw = tile.tags;

    if (raw == null || raw === '') {
        tile.tags = [];
        return;
    }

    const items = Array.isArray(raw) ? raw : String(raw).split(',');
    const isSpell = Boolean(tile.isSpell);
    tile.tags = items
        .map(item => {
            if (item && typeof item === 'object') return String(item.name || '').trim();
            return String(item || '').trim();
        })
        .filter(Boolean)
        .filter(tag => !(isSpell && tag.startsWith('Effect:')));
}

function normalizeNumber(value, fallback = 0) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTileMetadata(tile) {
    if (!tile || typeof tile !== 'object') return;

    if (tile.isBurnt === undefined) tile.isBurnt = false;
    if (tile.isBuried === undefined) tile.isBuried = false;
    if (tile.gearSubtype === undefined && tile.type === 'Gear') {
        tile.gearSubtype = tile.ammo ? 'Ammo' : tile.weapon ? 'Weapon' : tile.armorType ? 'Armor' : 'Custom';
    }

    if (tile.type === 'Gear' && tile.gearSubtype === 'Ammo') {
        const ammo = tile.ammo || {};
        const maxSupply = Math.max(0, normalizeNumber(ammo.maxSupply ?? ammo.supplyMax, 1));
        const currentSupply = Math.min(maxSupply, Math.max(0, normalizeNumber(ammo.currentSupply, maxSupply)));
        tile.ammo = {
            targetTileId: String(ammo.targetTileId || ''),
            targetName: String(ammo.targetName || ''),
            currentSupply,
            maxSupply,
            replacesTag: String(ammo.replacesTag || 'Reload').trim()
        };
        tile.dice = [];
        if (!Array.isArray(tile.colors)) tile.colors = [];
    }

    normalizeTileTags(tile);
}

/**
 * Effective max for a vital resource: base max + permanent bonus + temporary bonus.
 *
 * `key` is the resource prefix used in state: 'hp' | 'en' | 'rx' | 'sh'.
 * For HP/EN/RX, the base is `${key}Max`. SH has no stored max - its base is
 * derived from the tile mosaic at call time, so callers pass it via the
 * optional `baseOverride` argument.
 *
 * Always returns a finite integer, defaulting any missing/non-numeric piece
 * to 0. This is the single source of truth for the (max + perm + temp) sum
 * that previously appeared inline in render.js, vitals.js Rest, and vitals.js
 * Auto-Calculate Vitals.
 */
export function getEffectiveMax(state, key, baseOverride) {
    const toInt = (v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
    };
    const base = baseOverride !== undefined ? toInt(baseOverride) : toInt(state?.[`${key}Max`]);
    const perm = toInt(state?.[`${key}Perm`]);
    const temp = toInt(state?.[`${key}Temp`]);
    return base + perm + temp;
}

function inferShowOptionalStats(state) {
    const hasOptionalStats = Boolean(state?.stats?.Id || state?.stats?.Qi);
    const hasOptionalTiles = (state?.tiles || []).some(tile =>
        (tile.colors || []).some(color => color === 'Black' || color === 'White')
    );

    return hasOptionalStats || hasOptionalTiles;
}

const DEFAULT_STATE = {
    name: 'Hero Name',
    xpEarned: 75,
    hp: 0,
    hpMax: 0,
    hpTemp: 0,
    hpPerm: 0,
    en: 0,
    enMax: 0,
    enTemp: 0,
    enPerm: 0,
    rx: 0,
    rxMax: 0,
    rxTemp: 0,
    rxPerm: 0,
    sh: 0,
    shTemp: 0,
    shPerm: 0,
    showOptionalStats: false,
    stats: {
        'BODY': '',
        'POWER': '',
        'SOUL': '',
        'FOCUS': '',
        'MIND': '',
        'SPEED': '',
        'Id': '',
        'Qi': ''
    },
    tiles: [], // { id, name, colors: [], dice: [], tags: '', xpCost: 0 }
    journal: [] // { id, title, content }
};

export class DataManager {
    constructor() {
        this.loadRoster();
        this.state = this.loadState(this.activeCharId);
    }

    loadRoster() {
        const savedRoster = localStorage.getItem('1000words_roster');
        const active = localStorage.getItem('1000words_active_char');
        
        // Migration of old single-character save
        const legacySave = localStorage.getItem('1000words_state');
        
        if (savedRoster) {
            this.roster = JSON.parse(savedRoster);
            this.activeCharId = active || (this.roster.length > 0 ? this.roster[0].id : null);
            
            // If legacy save exists and roster somehow loaded, we should probably just leave it alone or migrate it.
            // Assuming normal case where legacy save is migrated below.
        } else if (legacySave) {
            const charId = crypto.randomUUID();
            let name = 'Hero Name';
            try { name = JSON.parse(legacySave).name || 'Hero Name'; } catch {
                // Legacy save is unreadable - keep the default name and continue migrating
                // the raw blob below; the user can rename later.
            }
            this.roster = [{ id: charId, name }];
            this.activeCharId = charId;
            try {
                localStorage.setItem('1000words_state_' + charId, legacySave);
                localStorage.removeItem('1000words_state'); // Migrate it out
            } catch (e) {
                console.error('Failed to migrate legacy save to localStorage', e);
                window.dispatchEvent(new CustomEvent('storage-error', { detail: { error: e, operation: 'loadRoster' } }));
            }
            this.saveRoster();
        } else {
            const charId = crypto.randomUUID();
            this.roster = [{ id: charId, name: 'Hero Name' }];
            this.activeCharId = charId;
            this.saveRoster();
        }
        
        // Ensure activeCharId is valid
        if (!this.roster.find(r => r.id === this.activeCharId) && this.roster.length > 0) {
            this.activeCharId = this.roster[0].id;
        }
    }

    saveRoster() {
        try {
            localStorage.setItem('1000words_roster', JSON.stringify(this.roster));
            if (this.activeCharId) {
                localStorage.setItem('1000words_active_char', this.activeCharId);
            }
        } catch (e) {
            console.error('Failed to save roster to localStorage', e);
            window.dispatchEvent(new CustomEvent('storage-error', { detail: { error: e, operation: 'saveRoster' } }));
        }
    }

    loadState(charId) {
        if (!charId) return JSON.parse(JSON.stringify(DEFAULT_STATE));
        const saved = localStorage.getItem('1000words_state_' + charId);
        if (saved) {
            try {
                const state = JSON.parse(saved);
                const hadShowOptionalStats = state.showOptionalStats !== undefined;
                // Migrate missing fields from DEFAULT_STATE
                for (const key of Object.keys(DEFAULT_STATE)) {
                    if (state[key] === undefined) {
                        state[key] = JSON.parse(JSON.stringify(DEFAULT_STATE[key]));
                    }
                }
                if (!hadShowOptionalStats) {
                    state.showOptionalStats = inferShowOptionalStats(state);
                }
                (state.tiles || []).forEach(normalizeTileMetadata);
                return state;
            } catch (e) {
                console.error("Failed to parse saved state", e);
            }
        }
        return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }

    saveState() {
        if (!this.activeCharId) return;
        try {
            localStorage.setItem('1000words_state_' + this.activeCharId, JSON.stringify(this.state));
        } catch (e) {
            console.error('Failed to save state to localStorage', e);
            window.dispatchEvent(new CustomEvent('storage-error', { detail: { error: e, operation: 'saveState' } }));
        }
        
        // Also update roster name if it changed
        const rosterEntry = this.roster.find(r => r.id === this.activeCharId);
        if (rosterEntry && rosterEntry.name !== this.state.name) {
            rosterEntry.name = this.state.name;
            this.saveRoster();
        }
    }

    updateStat(statName, value) {
        this.state.stats[statName] = value;
        this.saveState();
    }

    updateResource(type, value) {
        this.state[type] = value;
        this.saveState();
    }

    updateName(name) {
        this.state.name = name;
        this.saveState();
    }

    addTile(tile) {
        if (!tile.id) tile.id = crypto.randomUUID();
        normalizeTileMetadata(tile);
        this.state.tiles.push(tile);
        this.saveState();
    }

    updateTile(updatedTile) {
        normalizeTileMetadata(updatedTile);
        const idx = this.state.tiles.findIndex(t => t.id === updatedTile.id);
        if (idx !== -1) {
            this.state.tiles[idx] = updatedTile;
            this.saveState();
        }
    }

    deleteTile(id) {
        this.state.tiles = this.state.tiles.filter(t => t.id !== id);
        this.saveState();
    }

    switchCharacter(id) {
        if (this.roster.find(r => r.id === id)) {
            this.activeCharId = id;
            this.saveRoster();
            this.state = this.loadState(this.activeCharId);
        }
    }

    createNewCharacter(name = "Hero Name") {
        const charId = crypto.randomUUID();
        this.roster.push({ id: charId, name });
        this.activeCharId = charId;
        this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        this.state.name = name;
        this.saveState();
        this.saveRoster();
        return charId;
    }

    deleteCurrentCharacter() {
        if (this.roster.length === 1) {
            this.clearState();
            return;
        }
        
        localStorage.removeItem('1000words_state_' + this.activeCharId);
        this.roster = this.roster.filter(r => r.id !== this.activeCharId);
        this.activeCharId = this.roster[0].id;
        this.saveRoster();
        this.state = this.loadState(this.activeCharId);
    }

    exportState() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `1000words_${this.state.name.replace(/\s+/g, '_')}.json`);
        dlAnchorElem.click();
    }

    importState(jsonString, overwrite = false) {
        try {
            const newState = JSON.parse(jsonString);
            if (newState.stats && newState.tiles) {
                // Backward compatibility
                if (newState.xpEarned === undefined) newState.xpEarned = 75;
                if (newState.hpMax === undefined) newState.hpMax = newState.hp || 10;
                if (newState.enMax === undefined) newState.enMax = newState.en || 10;
                if (newState.rxMax === undefined) newState.rxMax = newState.rx || 10;
                if (newState.sh === undefined) newState.sh = 0;
                if (newState.showOptionalStats === undefined) {
                    newState.showOptionalStats = inferShowOptionalStats(newState);
                }
                // Vital bonuses backward compat
                ['hpTemp','hpPerm','enTemp','enPerm','rxTemp','rxPerm','shTemp','shPerm'].forEach(k => {
                    if (newState[k] === undefined) newState[k] = 0;
                });
                if (!newState.journal) newState.journal = [];
                
                newState.tiles.forEach(t => {
                    if (t.xpCost === undefined) t.xpCost = 0;
                    normalizeTileMetadata(t);
                });
                
                if (overwrite) {
                    this.state = newState;
                    this.saveState();
                } else {
                    const charId = crypto.randomUUID();
                    const name = newState.name || 'Imported Hero';
                    this.roster.push({ id: charId, name });
                    this.activeCharId = charId;
                    this.state = newState;
                    this.saveState();
                    this.saveRoster();
                }
                
                return true;
            }
        } catch (e) {
            console.error("Invalid JSON format", e);
        }
        return false;
    }

    clearState() {
        this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        this.saveState();
    }
}
