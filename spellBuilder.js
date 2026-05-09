export class SpellBuilder {
    constructor(dataManager, renderCallback) {
        this.dataManager = dataManager;
        this.renderCallback = renderCallback;
        
        this.currentStep = 1;
        this.totalSteps = 5;
        this.editingTileId = null;

        this.currentFormTags = [];

        this.modal = document.getElementById('spell-modal');
        this.form = document.getElementById('spell-form');
        this.btnNext = document.getElementById('btn-spell-next');
        this.btnPrev = document.getElementById('btn-spell-prev');
        this.btnSave = document.getElementById('btn-spell-save');
        this.btnCancel = document.getElementById('btn-spell-cancel');
        this.btnDelete = document.getElementById('btn-spell-delete');
        this.xpBadge = document.getElementById('spell-xp-badge');
        
        // Tag Elements
        this.tagSelect = document.getElementById('spell-tag-select');
        this.tagCustomInput = document.getElementById('spell-tag-custom-input');
        this.tagCustomXp = document.getElementById('spell-tag-custom-xp');
        this.btnAddTag = document.getElementById('btn-spell-add-tag');
        this.tagsContainer = document.getElementById('spell-tags-container');
        
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('btn-add-spell').addEventListener('click', () => {
            this.openWizard();
        });

        this.btnCancel.addEventListener('click', () => this.closeWizard());
        
        this.btnNext.addEventListener('click', () => {
            if (this.currentStep < this.totalSteps) {
                this.currentStep++;
                this.updateWizardUI();
            }
        });

        this.btnPrev.addEventListener('click', () => {
            if (this.currentStep > 1) {
                this.currentStep--;
                this.updateWizardUI();
            }
        });

        this.form.addEventListener('change', () => this.calculateXP());

        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSpell();
        });

        document.getElementById('spell-school').addEventListener('change', (e) => {
            const colorsGroup = document.getElementById('spell-colors-group');
            if (e.target.value === 'Divergent') {
                colorsGroup.style.display = 'block';
            } else {
                colorsGroup.style.display = 'none';
            }
            this.calculateXP();
        });
        
        this.tagSelect.addEventListener('change', (e) => {
            if (e.target.value === 'Custom') {
                this.tagCustomInput.style.display = 'block';
                this.tagCustomXp.style.display = 'block';
            } else {
                this.tagCustomInput.style.display = 'none';
                this.tagCustomXp.style.display = 'none';
            }
        });

        this.btnAddTag.addEventListener('click', () => {
            let val = this.tagSelect.value;
            let xp = parseInt(this.tagSelect.options[this.tagSelect.selectedIndex].dataset.xp || 0);

            if (val === 'Custom') {
                val = this.tagCustomInput.value.trim();
                xp = parseInt(this.tagCustomXp.value || 0);
                if (!val) return;
                this.tagCustomInput.value = '';
                this.tagCustomXp.value = '2';
            } else if (!val) {
                return;
            }

            this.currentFormTags.push({ name: val, xp: xp });
            this.renderTags();
            this.calculateXP();
        });
        
        this.btnDelete.addEventListener('click', () => {
            if (confirm("Delete this spell?")) {
                this.dataManager.deleteTile(this.editingTileId);
                this.closeWizard();
                this.renderCallback();
            }
        });
    }

    openWizard(tile = null) {
        this.currentStep = 1;
        this.editingTileId = tile ? tile.id : null;
        this.currentFormTags = [];
        this.form.reset();
        this.tagCustomInput.style.display = 'none';
        this.tagCustomXp.style.display = 'none';
        
        if (tile && tile.spellState) {
            // Restore fields from spellState
            document.getElementById('spell-name').value = tile.name;
            document.getElementById('spell-dice').value = tile.dice.join(', ');
            
            Object.keys(tile.spellState).forEach(key => {
                if (key.startsWith('spell-mod-val-')) return; // handled separately
                const el = document.getElementById(key);
                if (el) {
                    if (el.type === 'checkbox') {
                        el.checked = tile.spellState[key];
                    } else {
                        el.value = tile.spellState[key];
                    }
                }
            });
            
            document.querySelectorAll('.spell-mod').forEach(input => {
                const key = `spell-mod-val-${input.dataset.label}`;
                if (tile.spellState[key] !== undefined) {
                    input.value = tile.spellState[key];
                }
            });

            if (tile.spellState.tagsList) {
                this.currentFormTags = [...tile.spellState.tagsList];
            }
            
            // Restore color checkboxes if divergent
            const school = document.getElementById('spell-school').value;
            if (school === 'Divergent') {
                document.getElementById('spell-colors-group').style.display = 'block';
                const colorCbs = document.querySelectorAll('.spell-color-cb');
                colorCbs.forEach(cb => {
                    cb.checked = tile.colors.includes(cb.value);
                });
            } else {
                document.getElementById('spell-colors-group').style.display = 'none';
            }
            
            this.btnDelete.style.display = 'block';
        } else {
            this.btnDelete.style.display = 'none';
            document.getElementById('spell-colors-group').style.display = 'none';
        }

        this.renderTags();
        this.updateWizardUI();
        this.calculateXP();
        this.modal.classList.add('active');
    }

    renderTags() {
        this.tagsContainer.innerHTML = '';
        this.currentFormTags.forEach((tagObj, index) => {
            const span = document.createElement('span');
            span.className = 'badge';
            span.style.background = 'rgba(255,255,255,0.2)';
            span.style.color = 'white';
            span.style.display = 'flex';
            span.style.alignItems = 'center';
            span.style.gap = '0.3rem';
            span.innerHTML = `${tagObj.name} (${tagObj.xp > 0 ? '+'+tagObj.xp : tagObj.xp}🗱) <button type="button" style="background:transparent;border:none;color:white;cursor:pointer;font-weight:bold;">×</button>`;
            
            span.querySelector('button').addEventListener('click', () => {
                this.currentFormTags.splice(index, 1);
                this.renderTags();
                this.calculateXP();
            });
            
            this.tagsContainer.appendChild(span);
        });
    }

    closeWizard() {
        this.modal.classList.remove('active');
        this.editingTileId = null;
    }

    updateWizardUI() {
        // Show/hide steps
        for (let i = 1; i <= this.totalSteps; i++) {
            const stepEl = document.getElementById(`spell-step-${i}`);
            if (stepEl) {
                stepEl.style.display = (i === this.currentStep) ? 'block' : 'none';
            }
        }

        // Update buttons
        this.btnPrev.style.visibility = (this.currentStep === 1) ? 'hidden' : 'visible';
        
        if (this.currentStep === this.totalSteps) {
            this.btnNext.style.display = 'none';
            this.btnSave.style.display = 'block';
            this.generatePreview();
        } else {
            this.btnNext.style.display = 'block';
            this.btnSave.style.display = 'none';
        }
    }

    calculateXP() {
        let xp = 0;

        // School
        const school = document.getElementById('spell-school').value;
        if (school === 'Divergent') xp += 2;

        // Action
        const actionSel = document.getElementById('spell-action');
        const actionOpt = actionSel.options[actionSel.selectedIndex];
        if (actionOpt) xp += parseInt(actionOpt.dataset.xp || 0);

        // Tags List
        this.currentFormTags.forEach(t => xp += t.xp);

        // Range & Duration
        xp += parseInt(document.getElementById('spell-range').value || 0);
        xp += parseInt(document.getElementById('spell-duration').value || 0);

        // Modifiers (number inputs)
        document.querySelectorAll('.spell-mod').forEach(input => {
            const count = parseInt(input.value || 0);
            if (count > 0) {
                const cost = parseInt(input.dataset.xp || 0);
                xp += (cost * count);
            }
        });

        // Chaining
        if (document.getElementById('spell-unchained').checked) {
            xp += parseInt(document.getElementById('spell-unchained').value);
        }

        this.xpBadge.textContent = `${xp} 🗱 (Base)`;
        return xp;
    }

    generatePreview() {
        const action = document.getElementById('spell-action');
        const actionText = action.options[action.selectedIndex].text.split('(')[0].trim();
        
        const range = document.getElementById('spell-range');
        const rangeText = range.options[range.selectedIndex].text.split('(')[0].trim();
        
        const duration = document.getElementById('spell-duration');
        const durationText = duration.options[duration.selectedIndex].text.split('(')[0].trim();
        
        let mods = [];
        document.querySelectorAll('.spell-mod').forEach(input => {
            const count = parseInt(input.value || 0);
            if (count > 0) {
                const label = input.dataset.label;
                mods.push(count > 1 ? `${label} x${count}` : label);
            }
        });
        
        let desc = `Effect: ${actionText}. Range: ${rangeText}. Duration: ${durationText}.`;
        if (this.currentFormTags.length > 0) {
            desc += ` Tags: ${this.currentFormTags.map(t => t.name).join(', ')}.`;
        }
        if (mods.length > 0) desc += ` Modifiers: ${mods.join(', ')}.`;
        
        document.getElementById('spell-preview-desc').textContent = desc;
    }

    saveSpell() {
        const name = document.getElementById('spell-name').value.trim() || 'Custom Spell';
        const diceRaw = document.getElementById('spell-dice').value.trim();
        const diceArray = diceRaw ? diceRaw.split(',').map(s => s.trim()) : ['d4'];
        
        // Colors
        let colors = [];
        const school = document.getElementById('spell-school').value;
        if (school === 'Twist') colors = ['Green', 'Purple'];
        else if (school === 'Forge') colors = ['Red', 'Orange'];
        else if (school === 'Augur') colors = ['Blue', 'Yellow'];
        else {
            document.querySelectorAll('.spell-color-cb:checked').forEach(cb => colors.push(cb.value));
            if (colors.length < 2) colors.push('White');
            if (colors.length < 2) colors.push('Black');
        }

        // Tags string
        let tagsArr = ["Spell"];
        
        if (!document.getElementById('spell-unchained').checked) {
            tagsArr.push(`Chain ${school === 'Divergent' ? 'Skill' : school}`);
        }
        
        const customTags = document.getElementById('spell-custom-tags').value.trim();
        if (customTags) {
            customTags.split(',').forEach(t => {
                if(t.trim()) tagsArr.push(t.trim());
            });
        }
        
        this.generatePreview();
        tagsArr.push(document.getElementById('spell-preview-desc').textContent);

        // Spell State for editing
        const spellState = {
            'spell-school': document.getElementById('spell-school').value,
            'spell-action': document.getElementById('spell-action').value,
            'spell-range': document.getElementById('spell-range').value,
            'spell-duration': document.getElementById('spell-duration').value,
            'spell-custom-tags': document.getElementById('spell-custom-tags').value,
            'spell-unchained': document.getElementById('spell-unchained').checked,
            tagsList: [...this.currentFormTags]
        };
        
        document.querySelectorAll('.spell-mod').forEach(input => {
            spellState[`spell-mod-val-${input.dataset.label}`] = input.value;
        });

        const newSpell = {
            id: this.editingTileId || Date.now().toString(),
            name,
            colors: colors.slice(0, 2),
            dice: diceArray,
            tags: tagsArr.join(', '),
            xpCost: this.calculateXP(),
            isBurnt: false,
            isSpell: true,
            spellState
        };

        if (this.editingTileId) {
            this.dataManager.updateTile(newSpell);
        } else {
            this.dataManager.addTile(newSpell);
        }

        this.closeWizard();
        this.renderCallback();
    }
}
