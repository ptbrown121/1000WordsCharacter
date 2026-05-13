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

const DEFAULT_STATE = {
    name: 'Hero Name',
    xpEarned: 75,
    hp: 0,
    hpMax: 0,
    en: 0,
    enMax: 0,
    rx: 0,
    rxMax: 0,
    sh: 0,
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
    tiles: [] // { id, name, colors: [], dice: [], tags: '', xpCost: 0 }
};

export class DataManager {
    constructor() {
        this.state = this.loadState();
    }

    loadState() {
        const saved = localStorage.getItem('1000words_state');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse saved state", e);
            }
        }
        return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }

    saveState() {
        localStorage.setItem('1000words_state', JSON.stringify(this.state));
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
        if (!tile.id) tile.id = Date.now().toString();
        this.state.tiles.push(tile);
        this.saveState();
    }

    updateTile(updatedTile) {
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

    exportState() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `1000words_${this.state.name.replace(/\s+/g, '_')}.json`);
        dlAnchorElem.click();
    }

    importState(jsonString) {
        try {
            const newState = JSON.parse(jsonString);
            if (newState.stats && newState.tiles) {
                // Backward compatibility
                if (newState.xpEarned === undefined) newState.xpEarned = 75;
                if (newState.hpMax === undefined) newState.hpMax = newState.hp || 10;
                if (newState.enMax === undefined) newState.enMax = newState.en || 10;
                if (newState.rxMax === undefined) newState.rxMax = newState.rx || 10;
                if (newState.sh === undefined) newState.sh = 0;
                
                newState.tiles.forEach(t => {
                    if (t.xpCost === undefined) t.xpCost = 0;
                    if (t.isBurnt === undefined) t.isBurnt = false;
                });
                
                this.state = newState;
                this.saveState();
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
