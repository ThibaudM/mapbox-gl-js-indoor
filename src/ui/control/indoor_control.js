// @flow

import {bindAll} from '../../util/util';
import DOM from '../../util/dom';
import type Indoor from '../../indoor/indoor';
import type Map from '../map';
import type {Level, LevelsRange} from '../../indoor/types';

const className = 'mapboxgl-ctrl';

/**
 * Creates a indoor control with floors buttons

 * @implements {IControl}
 */
class IndoorControl {
    _map: Map;
    _indoor: Indoor;
    _container: HTMLElement;
    _levelsButtons: Array<HTMLElement>;
    _selectedButton: ?HTMLElement;

    constructor() {
        this._levelsButtons = [];
        this._selectedButton = null;

        bindAll([
            '_onLevelChanged',
            '_onLevelRangeChanged',
            '_onContextMenu'
        ], this);
    }

    onAdd(map: Map) {
        this._map = map;
        this._indoor = map._indoor;

        // Create container
        this._container = DOM.create('div', (`${className} ${className}-group`));
        this._container.addEventListener('contextmenu', this._onContextMenu);

        // If indoor layer is already loaded, update levels
        if (map.getLevel() !== null) {
            this._setSelected(map.getLevel());
        }

        // Register to indoor events
        this._indoor.on('level.range.changed', this._onLevelRangeChanged);
        this._map.on('level', this._onLevelChanged);

        return this._container;
    }

    onRemove() {
        this._indoor.off('level.range.changed', this._onLevelRangeChanged);
        this._map.off('level', this._onLevelChanged);
    }

    _onLevelRangeChanged(range: LevelsRange) {
        if (range === null) {
            this._removeNavigationBar();
        } else {
            this._loadNavigationBar(range);
        }
    }

    _onLevelChanged() {
        const level = this._map.getLevel();
        if (level !== null) {
            this._setSelected(level);
        }
    }

    _loadNavigationBar(range: LevelsRange) {

        this._container.style.visibility = 'visible';

        this._levelsButtons = [];
        while (this._container.firstChild) {
            this._container.removeChild(this._container.firstChild);
        }

        for (let i = range.min; i <= range.max; i++) {
            this._levelsButtons[i] = this._createLevelButton(i);
        }

        if (this._map.getLevel() !== null) {
            this._setSelected(this._map.getLevel());
        }
    }

    _removeNavigationBar() {
        this._container.style.visibility = 'hidden';
    }

    _setSelected(level: Level | null) {
        if (this._levelsButtons.length === 0) {
            return;
        }

        if (this._selectedButton) {
            this._selectedButton.style.fontWeight = "normal";
        }
        if (level !== null && this._levelsButtons[level]) {
            this._levelsButtons[level].style.fontWeight = "bold";
            this._selectedButton = this._levelsButtons[level];
        }
    }

    _createLevelButton(level: Level) {
        const a = DOM.create('button', `${className}-icon`, this._container);
        a.innerHTML = level.toString();
        a.addEventListener('click', () => {
            if (this._map.getLevel() === level) return;
            this._map.setLevel(level);
        });
        return a;
    }

    _onContextMenu(e: Event) {
        e.preventDefault();
    }
}

export default IndoorControl;
