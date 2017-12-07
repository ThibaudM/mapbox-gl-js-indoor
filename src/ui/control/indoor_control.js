
const DOM = require('../../util/dom');
const util = require('../../util/util');

const className = 'mapboxgl-ctrl';

/**
 * Creates a indoor control with floors buttons

 * @implements {IControl}
 */
class IndoorControl {

    constructor() {
        this._levelsButtons = {};
        this._selectedButton = null;
    }

    onAdd(map) {

        this._indoor = map._indoor;

        // Create container
        this._container = DOM.create('div', `${className} ${className}-group`);
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
        this._indoor.on('building.added', () => { this.loadLevels(); });
        this._indoor.on('level.changed', (e) => {
            this._setSelected(e.level);
        });

        return this._container;
    }


    onRemove() {
        
    }

    loadLevels() {

        const minLevel = this._indoor.minLevel;
        const maxLevel = this._indoor.maxLevel;

        if(minLevel == maxLevel && maxLevel == 0) {
            this._container.style.visibility = 'hidden';
            this._selectedButton = null;
            return;
        } else {
            this._container.style.visibility = 'visible';
        }


        while (this._container.firstChild) {
            this._container.removeChild(this._container.firstChild);
        }

        for (let i = minLevel; i <= maxLevel; i++) { 
            this._levelsButtons[i] = this._createLevelButton(i);
        }

        if(this._selectedButton == null) {
            this._setSelected(0);
        }
    }


    _setSelected(level) {

        if(this._selectedButton != null) {
            this._selectedButton.style.fontWeight = "normal";
        }
        this._levelsButtons[level].style.fontWeight = "bold";
        this._selectedButton = this._levelsButtons[level];

    }

    _createLevelButton(level) {
        const a = DOM.create('button', className + '-icon', this._container);
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

module.exports = IndoorControl;

