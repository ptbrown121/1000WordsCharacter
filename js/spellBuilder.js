import { VALID_DICE } from './data.js';
import { PoolEngine } from './pool.js';

export class SpellBuilder {
    constructor(dataManager, renderCallback) {
        this.dataManager = dataManager;
        this.renderCallback = renderCallback;
        
        this.currentStep = 1;
        this.totalSteps = 5;
        this.editingTileId = null;
        this.poolEngine = new PoolEngine();

        this.currentFormTags = [];

        this.modal = document.getElementById('spell-modal');
        this.form = document.getElementById('spell-form');
        this.btnNext = document.getElementById('btn-spell-next');
        this.btnPrev = document.getElementById('btn-spell-prev');
        this.btnSave = document.getElementById('btn-spell-save');
        this.btnCancel = document.getElementById('btn-spell-cancel');
        this.btnDelete = document.getElementById('btn-spell-delete');
        this.xpBadge = document.getElementById('spell-xp-badge');
        this.tagLimitStatus = document.getElementById('spell-tag-limit-status');
        
        // Tag Elements
        this.tagSelect = document.getElementById('spell-tag-select');
        this.tagCustomInput = document.getElementById('spell-tag-custom-input');
        this.tagCustomXp = document.getElementById('spell-tag-custom-xp');
        this.tagCustomInput = document.getElementById('spell-tag-custom-input');
        this.tagCustomXp = document.getElementById('spell-tag-custom-xp');
        this.btnAddTag = document.getElementById('btn-spell-add-tag');
        this.tagsContainer = document.getElementById('spell-tags-container');

        this.actionSelect = document.getElementById('spell-action');
        this.btnAddAction = document.getElementById('btn-spell-add-action');
        this.actionsContainer = document.getElementById('spell-actions-container');
        this.currentActions = [];
        
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
        document.getElementById('spell-dice').addEventListener('input', () => this.calculateXP());

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

        this.btnAddAction.addEventListener('click', () => {
            const val = this.actionSelect.value;
            if (!val) return;
            
            const opt = this.actionSelect.options[this.actionSelect.selectedIndex];
            const text = opt.text.split('(')[0].trim();
            const xp = parseInt(opt.dataset.xp || 0);

            if (this.currentActions.some(a => a.val === val)) return;

            this.currentActions.push({ val, text, xp });
            this.renderActions();
            this.calculateXP();
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

            const isExempt = document.getElementById('spell-tag-exempt').checked;
            if (isExempt) {
                val = `${val} (Exempt)`;
            }

            this.currentFormTags.push({ name: val, xp: xp });
            
            document.getElementById('spell-tag-exempt').checked = false;
            
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
        this.currentActions = [];
        this.form.reset();
        this.tagCustomInput.style.display = 'none';
        this.tagCustomXp.style.display = 'none';
        ['spell-range', 'spell-area', 'spell-volume', 'spell-displacement', 'spell-duration'].forEach(id => {
            const div = document.getElementById(`${id}-custom`);
            if (div) div.style.display = 'none';
        });
        
        const chainTargetSelect = document.getElementById('spell-chain-target');
        if (chainTargetSelect) {
            chainTargetSelect.innerHTML = '<option value="">-- No Specific Spellcast Skill --</option>';
            const skills = (this.dataManager.state.tiles || []).filter(t => t.type === 'Skill' && t.isSpellcastSkill);
            skills.forEach(skill => {
                const opt = document.createElement('option');
                opt.value = skill.name;
                opt.textContent = skill.name;
                chainTargetSelect.appendChild(opt);
            });
        }
        
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
                        if (el.tagName === 'SELECT' && el.value === 'custom') {
                            const customDiv = document.getElementById(`${el.id}-custom`);
                            if (customDiv) customDiv.style.display = 'flex';
                        }
                    }
                }
            });
            
            if (tile.description) {
                document.getElementById('spell-description').value = tile.description;
            } else {
                document.getElementById('spell-description').value = '';
            }
            
            document.querySelectorAll('.spell-mod').forEach(input => {
                const key = `spell-mod-val-${input.dataset.label}`;
                if (tile.spellState[key] !== undefined) {
                    input.value = tile.spellState[key];
                }
            });

            if (tile.spellState.tagsList) {
                this.currentFormTags = [...tile.spellState.tagsList];
            }
            
            if (tile.spellState.actionsList) {
                this.currentActions = [...tile.spellState.actionsList];
            } else if (tile.spellState['spell-action']) {
                const legacyVal = tile.spellState['spell-action'];
                Array.from(this.actionSelect.options).forEach(opt => {
                    if (opt.value === legacyVal) {
                        this.currentActions.push({
                            val: opt.value,
                            text: opt.text.split('(')[0].trim(),
                            xp: parseInt(opt.dataset.xp || 0)
                        });
                    }
                });
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
        this.renderActions();
        this.updateWizardUI();
        this.calculateXP();
        this.modal.classList.add('active');
    }

    renderActions() {
        if (!this.actionsContainer) return;
        this.actionsContainer.innerHTML = '';
        this.currentActions.forEach((act, index) => {
            const span = document.createElement('span');
            span.className = 'badge';
            span.style.background = 'rgba(255,255,255,0.2)';
            span.style.color = 'white';
            span.style.display = 'flex';
            span.style.alignItems = 'center';
            span.style.gap = '0.3rem';
            span.innerHTML = `${act.text} (${act.xp > 0 ? '+'+act.xp : act.xp}🗱) <button type="button" style="background:transparent;border:none;color:white;cursor:pointer;font-weight:bold;">×</button>`;
            
            span.querySelector('button').addEventListener('click', () => {
                this.currentActions.splice(index, 1);
                this.renderActions();
                this.calculateXP();
            });
            
            this.actionsContainer.appendChild(span);
        });
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

        this.renderTagLimitStatus();
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

    getSpellDiceInfo() {
        const diceRaw = document.getElementById('spell-dice').value.trim();
        const diceTokens = diceRaw ? diceRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : ['d4'];

        return {
            diceArray: diceTokens.filter(die => VALID_DICE.has(die)),
            invalidDice: diceTokens.filter(die => !VALID_DICE.has(die))
        };
    }

    summarizeTagLimitExemptions(tagLimit) {
        const exemptNames = tagLimit.exemptTags.map(tag => tag.name).filter(Boolean);
        if (exemptNames.length === 0) return '';

        const visibleNames = exemptNames.slice(0, 3).join(', ');
        const remaining = exemptNames.length > 3 ? ` +${exemptNames.length - 3} more` : '';
        return ` Exempt: ${visibleNames}${remaining}.`;
    }

    formatTagLimitStatus(tagLimit) {
        const exemptText = this.summarizeTagLimitExemptions(tagLimit);
        if (tagLimit.valid) {
            return `Tag limit: ${tagLimit.count}/${tagLimit.limit} countable tags.${exemptText}`;
        }

        return `Too many countable tags: ${tagLimit.count}/${tagLimit.limit}. Remove ${tagLimit.overage} or increase dice.${exemptText}`;
    }

    tagLimitErrorMessage(tagLimit) {
        const countableNames = tagLimit.countableTags.map(tag => tag.name).filter(Boolean).join(', ');
        const tagsText = countableNames ? ` Countable tags: ${countableNames}.` : '';
        return `This spell has ${tagLimit.count} countable tags, but its dice allow ${tagLimit.limit}. Remove ${tagLimit.overage} countable tag${tagLimit.overage === 1 ? '' : 's'} or increase its dice.${tagsText}`;
    }

    renderTagLimitStatus() {
        if (!this.tagLimitStatus) return null;

        const { diceArray, invalidDice } = this.getSpellDiceInfo();
        this.tagLimitStatus.classList.remove('valid', 'invalid');

        if (invalidDice.length > 0) {
            this.tagLimitStatus.textContent = 'Spell dice must use only: d3, d4, d6, d8, d10, d12, d14, or d16.';
            this.tagLimitStatus.classList.add('invalid');
            return null;
        }

        const tagLimit = this.poolEngine.calculateTagLimit(diceArray, this.currentFormTags);
        this.tagLimitStatus.textContent = this.formatTagLimitStatus(tagLimit);
        this.tagLimitStatus.classList.add(tagLimit.valid ? 'valid' : 'invalid');
        return tagLimit;
    }

    calculateBaseXP() {
        let xp = 0;

        // School
        const school = document.getElementById('spell-school').value;
        if (school === 'Divergent') xp += 2;

        // Base actions
        this.currentActions.forEach(act => xp += act.xp);

        // Tags List
        this.currentFormTags.forEach(t => xp += t.xp);

        const getSelectXP = (id) => {
            const sel = document.getElementById(id);
            if (!sel) return 0;
            if (sel.value === 'custom') {
                return parseInt(document.getElementById(`${id}-custom-xp`).value || 0);
            }
            return parseInt(sel.value || 0);
        };

        // Metrics
        xp += getSelectXP('spell-range');
        xp += getSelectXP('spell-area');
        xp += getSelectXP('spell-volume');
        xp += getSelectXP('spell-displacement');
        xp += getSelectXP('spell-duration');

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

        return xp;
    }

    calculateXP() {
        const baseXp = this.calculateBaseXP();
        const { diceArray, invalidDice } = this.getSpellDiceInfo();
        const diceXp = invalidDice.length > 0 ? 0 : this.poolEngine.calculateOptimalXpCost(diceArray);
        const totalXp = Math.max(0, baseXp + diceXp);
        const diceLabel = invalidDice.length > 0 ? 'invalid dice' : `${diceXp} dice`;

        this.xpBadge.textContent = `${totalXp} 🗱 (${baseXp} base + ${diceLabel})`;
        this.renderTagLimitStatus();
        return totalXp;
    }

    generatePreview() {
        const actionTexts = this.currentActions.map(act => act.text);
        const actionText = actionTexts.length > 0 ? actionTexts.join(', ') : 'None';
        
        const getSelectText = (id) => {
            const sel = document.getElementById(id);
            if (!sel) return '';
            if (sel.value === 'custom') {
                const name = document.getElementById(`${id}-custom-name`).value.trim();
                return name || 'Custom';
            }
            return sel.options[sel.selectedIndex].text.split('(')[0].trim();
        };

        const rangeText = getSelectText('spell-range');
        const areaText = getSelectText('spell-area');
        const volumeText = getSelectText('spell-volume');
        const displacementText = getSelectText('spell-displacement');
        const durationText = getSelectText('spell-duration');
        
        let mods = [];
        document.querySelectorAll('.spell-mod').forEach(input => {
            const count = parseInt(input.value || 0);
            if (count > 0) {
                const label = input.dataset.label;
                mods.push(count > 1 ? `${label} x${count}` : label);
            }
        });
        
        let desc = `Effect: ${actionText}.`;
        if (rangeText && rangeText !== 'None' && rangeText !== 'Single / None') desc += ` Range: ${rangeText}.`;
        if (areaText && areaText !== 'None' && areaText !== 'Single / None') desc += ` Area: ${areaText}.`;
        if (volumeText && volumeText !== 'None' && volumeText !== 'Single / None') desc += ` Volume: ${volumeText}.`;
        if (displacementText && displacementText !== 'None' && displacementText !== 'Single / None') desc += ` Displacement: ${displacementText}.`;
        if (durationText && durationText !== 'None' && durationText !== 'Single / None') desc += ` Duration: ${durationText}.`;
        if (this.currentFormTags.length > 0) {
            desc += ` Tags: ${this.currentFormTags.map(t => t.name).join(', ')}.`;
        }
        if (mods.length > 0) desc += ` Modifiers: ${mods.join(', ')}.`;
        
        document.getElementById('spell-preview-desc').textContent = desc;
    }

    saveSpell() {
        const name = document.getElementById('spell-name').value.trim() || 'Custom Spell';
        const { diceArray, invalidDice } = this.getSpellDiceInfo();

        if (diceArray.length === 0 || invalidDice.length > 0) {
            alert('Spell dice must use only: d3, d4, d6, d8, d10, d12, d14, or d16.');
            return;
        }

        const tagLimit = this.poolEngine.calculateTagLimit(diceArray, this.currentFormTags);
        this.renderTagLimitStatus();
        if (!tagLimit.valid) {
            alert(this.tagLimitErrorMessage(tagLimit));
            return;
        }
        
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
        
        const chainTarget = document.getElementById('spell-chain-target');
        if (chainTarget && chainTarget.value) {
            tagsArr.push(`Chain ${chainTarget.value}`);
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
            actionsList: [...this.currentActions],
            'spell-range': document.getElementById('spell-range').value,
            'spell-range-custom-name': document.getElementById('spell-range-custom-name').value,
            'spell-range-custom-xp': document.getElementById('spell-range-custom-xp').value,
            'spell-area': document.getElementById('spell-area').value,
            'spell-area-custom-name': document.getElementById('spell-area-custom-name').value,
            'spell-area-custom-xp': document.getElementById('spell-area-custom-xp').value,
            'spell-volume': document.getElementById('spell-volume').value,
            'spell-volume-custom-name': document.getElementById('spell-volume-custom-name').value,
            'spell-volume-custom-xp': document.getElementById('spell-volume-custom-xp').value,
            'spell-displacement': document.getElementById('spell-displacement').value,
            'spell-displacement-custom-name': document.getElementById('spell-displacement-custom-name').value,
            'spell-displacement-custom-xp': document.getElementById('spell-displacement-custom-xp').value,
            'spell-duration': document.getElementById('spell-duration').value,
            'spell-duration-custom-name': document.getElementById('spell-duration-custom-name').value,
            'spell-duration-custom-xp': document.getElementById('spell-duration-custom-xp').value,
            'spell-custom-tags': document.getElementById('spell-custom-tags').value,
            'spell-unchained': document.getElementById('spell-unchained').checked,
            'spell-chain-target': document.getElementById('spell-chain-target') ? document.getElementById('spell-chain-target').value : '',
            tagsList: [...this.currentFormTags]
        };
        
        document.querySelectorAll('.spell-mod').forEach(input => {
            spellState[`spell-mod-val-${input.dataset.label}`] = input.value;
        });

        const description = document.getElementById('spell-description').value.trim();

        const newSpell = {
            id: this.editingTileId || Date.now().toString(),
            type: 'Gear',
            name,
            description,
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
