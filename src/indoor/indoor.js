// @flow

import {Event, ErrorEvent, Evented} from '../util/evented';
import {getJSON} from '../util/ajax';
import GeoJsonHelper from './geojson_helper';
import {bindAll} from '../util/util';

// import type Map from '../ui/map';
import type StyleLayer from './style_layer';

const MIN_TIME_BETWEEN_LOADING_LEVELS = 500; // in ms
const SOURCE_ID = "indoor";

class Indoor extends Evented {

    _map: Map;
    _source: Source;
    _minLevel: number;
    _maxLevel: number;
    indoorFilters: Object;
    _timestampLoadLevels: number;
    _currentTimeout: boolean;

    constructor(map: Map) {
        super();

        this._map = map;
        this.reset();

        this._map.on('level', () => this._onLevelChanged(map.getLevel()));

        bindAll([
            '_onSourceDataChanged',
            '_onLevelChanged',
            'tryToLoadLevels',
            'loadLevels'
        ], this);
    }

    reset() {
        this._minLevel = Number.MAX_SAFE_INTEGER;
        this._maxLevel = Number.MIN_SAFE_INTEGER;
        this.indoorFilters = {};
        this._timestampLoadLevels = 0;
        this._currentTimeout = false;
    }

    /**
     * ***********************
     * Handle level change
     * ***********************
     */

    _onLevelChanged(newLevel) {
        Object.keys(this.indoorFilters)
            .forEach(layerId => {
                const filter = this.indoorFilters[layerId];
                this._map.setFilter(layerId, newLevel === null ? filter : ["all", filter, ["any", ["!", ["has", "level"]], ["inrange", ["get", "level"], newLevel]]]);
            });
    }

    /**
     * **************
     * Layer creation
     * **************
     */

    createIndoorLayer(source: SourceSpecification, styleUrl: string, imagesUrl: any) {

        if (this._map.getSource('indoor')) {
            this.removeIndoorLayer();
        }

        this.reset();

        Promise.resolve()
            // Load Source
            .then(() => {
                return new Promise(resolve => {
                    this._source = this._map.addSource(SOURCE_ID, {
                        type: "geojson",
                        data: source
                    });
                    this._source.on('data', this._onSourceDataChanged);

                    this._source.on('data', data => {
                        if (data.dataType === "source" &&
                            data.sourceDataType === "metadata") {
                            this._source.off('data', this);
                            resolve();
                        }
                    });
                });
            })

            // Load Layers from JSON style file
            .then(() => {
                const request = this._map._requestManager.transformRequest(styleUrl);
                return new Promise((resolve, reject) => {
                    getJSON(request, (error, json) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve(json);
                    });
                });
            })

            // Add layers and save filters
            .then((json) => {
                const saveFilter = layer => {
                    // Fill indoorFilters with existing filters
                    let currentFilter = this._map.getFilter(layer.id);
                    if (!currentFilter) {
                        currentFilter = ["all"];
                    }
                    this.indoorFilters[layer.id] = currentFilter;
                };

                for (let i = 0; i < json.length; i++) {
                    const layer = json[i];

                    if (layer.id === "poi-indoor") {
                        this.createPoiLayers(layer).forEach(layer => {
                            this._map.addLayer(layer);
                            saveFilter(layer);
                        });
                    } else {
                        this._map.addLayer(layer);
                        saveFilter(layer);
                    }
                }
            })

            // Remove some layers for rendering
            .then(() => {
                const layersToRemove = ['poi-scalerank4-l15', 'poi-scalerank4-l1', 'poi-scalerank3', 'road-label-small'];
                layersToRemove.forEach(layerId => {
                    this._map.setLayoutProperty(layerId, 'visibility', 'none');
                });
            })

            // End of creation
            .then(() => {
                this._source.on('data', this._onSourceDataChanged);

                this.on('level.range.changed', range => {
                    if (this._map.getLevel() !== null) {
                        this._onLevelChanged(this._map.getLevel());
                    } else {
                        const defaultLevel = Math.max(Math.min(0, range.maxLevel), range.minLevel);
                        this._map.setLevel(defaultLevel);
                    }
                    this.off('level.range.changed', this);
                });

                this.fire(new Event('loaded', {sourceId: SOURCE_ID}));
            })

            // Catch errors
            .catch(error => {
                this.fire(new ErrorEvent('error', {error}));
            });

        // // Load images
        // const requestImages = this._map._transformRequest(imagesUrl);
        // getJSON(requestImages, (error, json) => {
        //     if (error) {
        //         this.fire(new ErrorEvent('error', {error}));
        //         return;
        //     }

        //     var imagesToLoad = 0;
        //     for(var key in json)
        //         if(json.hasOwnProperty(key))
        //             imagesToLoad++;

        //     for (const imageId in json) {
        //         const imageUrl = json[imageId];

        //         this._map.loadImage(imageUrl, function(error, image) {
        //             if (error) throw error;
        //             map.addImage(imageId, image);
        //             imagesToLoad--;
        //             if(imagesToLoad == 0) {
        //                 //ended
        //             }
        //         });
        //     }
        // });
    }

    createPoiLayers(metaLayer) {

        const newLayers = [];

        const osmFilterTagsToMaki = GeoJsonHelper.generateOsmFilterTagsToMaki();
        for (let i = 0; i < osmFilterTagsToMaki.length; i++) {
            const poi = osmFilterTagsToMaki[i];
            const newLayer = JSON.parse(JSON.stringify(metaLayer));
            newLayer.id += `-${poi.maki}`;
            newLayer.filter = poi.filter;
            newLayer.layout['icon-image'] = (`${poi.maki}-15`);
            newLayers.push(newLayer);
        }
        return newLayers;
    }

    removeIndoorLayer() {
        this._source.off('data', this._onSourceDataChanged);

        this._map.getStyle().layers.forEach(layer => {
            if (layer.source === SOURCE_ID) {
                this._map.removeLayer(layer.id);
            }
        });
        this._map.removeSource(SOURCE_ID);
    }

    /**
     * ***********************
     * Check for level changes
     * ***********************
     */

    _onSourceDataChanged() {
        this.tryToLoadLevels();
    }

    tryToLoadLevels() {
        // If promise for loadLevels exists, returns it
        if (this.loadLevelsPromise) {
            return this.loadLevelsPromise;
        }

        // If diff time since last check of "loadLevels" is higher than MIN_TIME_BETWEEN_LOADING_LEVELS, loadLevels can be call directly
        if (new Date().getTime() - this._timestampLoadLevels > MIN_TIME_BETWEEN_LOADING_LEVELS) {
            this.loadLevels();
            return Promise.resolve();
        }

        // Otherwise create the promise with the timeout
        this.loadLevelsPromise = new Promise(resolve => {
            setTimeout(() => {
                this.loadLevels();
                resolve();
                this.loadLevelsPromise = null;
            }, MIN_TIME_BETWEEN_LOADING_LEVELS);
        });
    }

    /**
     * Go through level tags to know building levels range
     */
    loadLevels() {
        this._timestampLoadLevels = new Date().getTime();

        let maxLevel = Number.MIN_SAFE_INTEGER;
        let minLevel = Number.MAX_SAFE_INTEGER;

        const features = this._map.querySourceFeatures(SOURCE_ID, {filter: ["has", "level"]});

        for (let i = 0; i < features.length; i++) {
            const propertyLevel = features[i].properties.level;
            const splitLevel = propertyLevel.split(';');
            if (splitLevel.length === 1) {
                const level = parseFloat(propertyLevel);
                if (!isNaN(level)) {
                    minLevel = Math.min(minLevel, level);
                    maxLevel = Math.max(maxLevel, level);
                }
            } else if (splitLevel.length === 2) {
                const level1 = parseFloat(splitLevel[0]);
                const level2 = parseFloat(splitLevel[1]);
                if (!isNaN(level1) && !isNaN(level2)) {
                    minLevel = Math.min(minLevel, Math.min(level1, level2));
                    maxLevel = Math.max(maxLevel, Math.max(level1, level2));
                }
            }
        }

        // If the new minLevel and the new maxLevel are equals to old ones, you don't need to notify modifications
        if (this._minLevel === minLevel && this._maxLevel === maxLevel) {
            return;
        }

        if (minLevel > maxLevel) {
            this.fire(new Event('level.range.changed', null));
            this._map.setLevel(null);
        } else {
            this.fire(new Event('level.range.changed', {minLevel, maxLevel}));
        }

        this._minLevel = minLevel;
        this._maxLevel = maxLevel;
    }
}

export default Indoor;

