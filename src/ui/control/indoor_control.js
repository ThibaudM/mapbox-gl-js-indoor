// @flow

import DOM from '../../util/dom';
import type Indoor from '../indoor/indoor';

/**
 * Creates a indoor control with floors buttons

 * @implements {IControl}
 */
class IndoorControl {
    _indoor: Indoor;
    _container: HTMLElement;
    _levelsButtons: Array<number, HTMLElement>;
    _selectedButton: ?HTMLElement;

    constructor() {
        this._levelsButtons = {};
        this._selectedButton = null;
    }

    onAdd(map) {

        this._indoor = map._indoor;

        // Create container
        this._container = DOM.create('div', (`${this._className} ${this._className}-group`));
        this._container.addEventListener('contextmenu', this._onContextMenu.bind(this));
        this._el = map.getCanvasContainer();


        // If indoor layer is already loaded, update levels 
        if(this._indoor.loaded()) {
            this.loadLevels();

            if(this._indoor.selectedLevel != undefined) {
                this._setSelected(map._indoor.selectedLevel)
            }
        } 

        // Register to indoor events
        this._indoor.on('building.added', (data) => { this.loadNavigationBar(data); });
        this._indoor.on('building.removed', () => { this.removeNavigationBar(); });
        this._indoor.on('level.changed', (e) => {
            this._setSelected(e.level);
        });

        return this._container;
    }


    onRemove() {
        
    }

    loadNavigationBar(data) {

        this._container.style.visibility = 'visible';

        while (this._container.firstChild) {
            this._container.removeChild(this._container.firstChild);
        }

        for (let i = data.minLevel; i <= data.maxLevel; i++) { 
            this._levelsButtons[i] = this._createLevelButton(i);
        }

        // if(this._selectedButton == null) {
            if(this._indoor.selectedLevel != undefined) {
                this._setSelected(this._indoor.selectedLevel);
            } else {
                this._setSelected(0);
            }
        // }
    }

    removeNavigationBar() {
        this._container.style.visibility = 'hidden';
        // this._selectedButton = null;
    }


    _setSelected(level) {

        if(this._selectedButton != null) {
            this._selectedButton.style.fontWeight = "normal";
        }
        this._levelsButtons[level].style.fontWeight = "bold";
        this._selectedButton = this._levelsButtons[level];

    }

    _createLevelButton(level) {
        const a = DOM.create('button', `${this._className}-icon`, this._container);
        a.innerHTML = level.toString();
        a.addEventListener('click', (e) => { 
            if(this._indoor._selectedLevel == level) return;
            this._indoor.setLevel(level);
        });
        return a;
    }


    _onContextMenu(e) {
        e.preventDefault();
    }
}

export default IndoorControl;
