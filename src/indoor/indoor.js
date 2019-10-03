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
    selectedLevel: ?number;
    minLevel: number;
    maxLevel: number;
    indoorFilters: Object;
    _timestampLoadLevels: number;
    _currentTimeout: boolean;

    constructor(map: Map) {
        super();

        this._map = map;
        this.initialize();

        bindAll([
            '_onSourceDataChanged',
            'loadLevels'
        ], this);
    }

    initialize() {
        this.selectedLevel = undefined;
        this.minLevel = 0;
        this.maxLevel = 0;
        this.indoorFilters = {};
        this._timestampLoadLevels = 0;
        this._currentTimeout = false;
    }

    createIndoorLayer(source: SourceSpecification, styleUrl: string, imagesUrl: any) {

        if (this._map.getSource('indoor')) {
            this._map.removeIndoorLayer();
        }

        this.initialize();

        Promise.resolve()
            // Load Source
            .then(() => {

                this._source = this._map.addSource(SOURCE_ID, {
                    type: "geojson",
                    data: source
                });

                this._source.on('data', data => {
                    if (data.dataType === "source" &&
                        data.sourceDataType === "metadata") {
                        this._source.off('data', this);
                        Promise.resolve();
                    }
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

                // We need to load levels at least once if user wants to call setLevel() after loaded event.
                this.loadLevels();

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

    _onSourceDataChanged() {
        this.tryToLoadLevels();
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

    tryToLoadLevels() {
        if (new Date().getTime() - this._timestampLoadLevels > MIN_TIME_BETWEEN_LOADING_LEVELS) {
            this.loadLevels();
        } else if (!this._currentTimeout) {
            setTimeout(() => {
                this.loadLevels();
                this._currentTimeout = false;
            }, MIN_TIME_BETWEEN_LOADING_LEVELS);
            this._currentTimeout = true;
        }
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

    loadLevels() {

        this._timestampLoadLevels = new Date().getTime();

        let maxLevel = 0;
        let minLevel = 0;

        const features = this._map.querySourceFeatures(SOURCE_ID, {filter: ["has", "level"]});

        for (let i = 0; i < features.length; i++) {

            const propertyLevel = features[i].properties.level;
            if (isNaN(propertyLevel)) {
                const m = RegExp("(-?\\d+);(-?\\d+)", "g").exec(features[i].properties.level);
                if (m == null || m.length !== 3) continue;
                const min = parseInt(m[1]);
                const max = parseInt(m[2]);
                if (minLevel > min) minLevel = min;
                if (maxLevel < max) maxLevel = max;
            }

            if (minLevel > propertyLevel) minLevel = parseInt(propertyLevel);
            if (maxLevel < propertyLevel) maxLevel = parseInt(propertyLevel);
        }

        if (this.minLevel === minLevel && this.maxLevel === maxLevel)
            return;

        this.minLevel = minLevel;
        this.maxLevel = maxLevel;

        if (minLevel === 0 && maxLevel === 0) {
            this.fire(new Event('building.removed'));
        } else {
            this.fire(new Event('building.added', {minLevel, maxLevel}));
        }

        // First time try to set current level to 0
        if (this.selectedLevel === undefined && (minLevel !== 0 || maxLevel !== 0)) {
            this.setLevel(Math.max(this.minLevel, 0));
        }

        if (minLevel !== 0 || maxLevel !== 0) {
            if (this.selectedLevel > this.maxLevel) {
                this.setLevel(this.maxLevel);
            } else if (this.selectedLevel < this.minLevel) {
                this.setLevel(this.minLevel);
            }
        }
    }

    setLevel(level) {

        if (this.selectedLevel === level) {
            return;
        }
        this.selectedLevel = level;

        Object.keys(this.indoorFilters)
            .forEach(layerId => {
                const filter = this.indoorFilters[layerId];
                this._map.setFilter(layerId, ["all", filter, ["any", ["!", ["has", "level"]], ["inrange", ["get", "level"], level]]]);

            });

        this.fire(new Event('level.changed', {level}));
    }
}

export default Indoor;

