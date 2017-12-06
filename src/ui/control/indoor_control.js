
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

        this._map = map;

        // const container = this._container = DOM.create('div', className + '-group', map.getContainer());

        this._container = DOM.create('div', `${className} ${className}-group`);
        this._container.addEventListener('contextmenu', this._onContextMenu.bind(this));
        
        this._map.on('indoor.building.added', this.loadLevels.bind(this));
        this._map.on('indoor.level.changed', this._onLevelChanged.bind(this));
    
        this._el = map.getCanvasContainer();
        return this._container;
    }

    onRemove() {
        
    }

    loadLevels() {

        const minLevel = this._map._indoor.minLevel;
        const maxLevel = this._map._indoor.maxLevel;

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

    _onLevelChanged(e, level) {
        this._setSelected(e.level);
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
        a.addEventListener('click', this._onLevelClicked.bind(this, level));
        return a;
    }

    _onLevelClicked(level, e) {
        if(this._map.getSelectedIndoorLevel() == level) {
            return;
        }
        this._map._indoor.setLevel(level);
    }

    _onContextMenu(e) {
        e.preventDefault();
    }
}

module.exports = IndoorControl;

