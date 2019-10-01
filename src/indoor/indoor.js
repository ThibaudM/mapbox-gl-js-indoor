// @flow

import {Event, ErrorEvent, Evented} from '../util/evented';
import {getJSON} from '../util/ajax';
import GeoJsonHelper from './geojson_helper';

// import type Map from '../ui/map';
import type StyleLayer from './style_layer';

const MIN_TIME_BETWEEN_LOADING_LEVELS = 500; // in ms
const SOURCE_ID = "indoor";

class Indoor extends Evented {

    _map: Map;
    selectedLevel: ?number;
    minLevel: number;
    maxLevel: number;
    indoorLayers: Array<String>;
    indoorFilters: Array<Json>;
    _sourceLoaded: boolean;
    _styleLoaded: boolean;
    _loaded: boolean;
    _timestampLoadLevels: number;
    _currentTimeout: boolean;

    constructor(map: Map) {
        super();
        this._map = map;
        this.selectedLevel = undefined;
        this.minLevel = 0;
        this.maxLevel = 0;
        this.indoorLayers = [];
        this.indoorFilters = [];
        this._sourceLoaded = false;
        this._styleLoaded = false;
        this._loaded = false;
        this._timestampLoadLevels = 0;
        this._currentTimeout = false;
    }

    createIndoorLayer(sourceUrl: string, styleUrl: string, imagesUrl: any) {

        // Load source
        const source = this._map.addSource(SOURCE_ID, {
            type: "geojson",
            data: sourceUrl
        });

        source.on('data', (e) => {
            if (e.dataType == "source" &&
                e.sourceDataType != "metadata" &&
                e.sourceDataType != "content") {
                this._sourceLoaded = true;
                this._endCreationProcess();
            }
        });

        source.on('data', () => {
            this.tryToLoadLevels();
        });

        // this._map.on('move', (e) => {
        //     this.tryToLoadLevels();
        // });

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

        // Load Style
        const request = this._map._requestManager.transformRequest(styleUrl);
        getJSON(request, (error, json) => {
            if (error) {
                this.fire(new ErrorEvent('error', {error}));
                return;
            }
            for (let i = 0; i < json.length; i++) {
                const layer = json[i];
                if (layer.id === "poi-indoor") {
                    this.createPoiLayers(layer);
                } else {
                    this._map.addLayer(layer);
                }
            }

            const layersToRemove = ['poi-scalerank4-l15', 'poi-scalerank4-l1', 'poi-scalerank3', 'road-label-small'];
            layersToRemove.forEach(layerId => {
                this._map.setLayoutProperty(layerId, 'visibility', 'none');
            });

            this.initializeFilters();

            this._styleLoaded = true;
            this._endCreationProcess();
        });

    }

    createPoiLayers(metaLayer) {

        GeoJsonHelper.generateOsmFilterTagsToMaki().forEach(poi => {
            const newLayer = JSON.parse(JSON.stringify(metaLayer));
            newLayer.id += `-${poi.maki}`;
            newLayer.filter = poi.filter;
            newLayer.layout['icon-image'] = (`${poi.maki}-15`);
            this._map.addLayer(newLayer);
        });

    }

    tryToLoadLevels() {
        if (new Date().getTime() - this._timestampLoadLevels > MIN_TIME_BETWEEN_LOADING_LEVELS) {
            this.loadLevels();
        } else if (!this._currentTimeout) {
            const that = this;
            setTimeout(() => {
                that.loadLevels();
                that._currentTimeout = false;
            }, MIN_TIME_BETWEEN_LOADING_LEVELS);
            this._currentTimeout = true;
        }
    }

    _endCreationProcess() {

        if (this._loaded || !this._sourceLoaded || !this._styleLoaded) {
            return;
        }

        // We need to load levels at least once if user wants to call setLevel() after loaded event.
        this.loadLevels();

        this._loaded = true;
        this.fire(new Event('loaded', {sourceId: SOURCE_ID}));
    }

    removeIndoorLayer() {

        // TODO remove source and layers

        this._loaded = false;
        // const index = this._sourceId.indexOf(sourceId);
        // if (index > -1) {
        //     this._sourceId.splice(index, 1);
        // }
        // // this.loadLevels();
    }

    initializeFilters() {

        for (const key in this._map.style._layers) {
            const layer = this._map.style._layers[key];

            if (SOURCE_ID === layer.source && layer.id !== "buildings" && layer.id !== "buildings-background") {
                let currentFilter = this._map.getFilter(layer.id);
                if (currentFilter == null) {
                    currentFilter = ["all"];
                }
                // A map cannot be used due to the "Map keyword" which is already used by Mapbox
                // So we have to handle two lists
                this.indoorLayers.push(layer.id);
                this.indoorFilters.push(currentFilter);
                // this.indoorLayers.set(layer.id, currentFilter);
            }
        }
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

        if (level > this.maxLevel || level < this.minLevel) {
            return;
        }

        const buildingsLayerId = this._map.getLayer("buildings").id;
        const visibility = this._map.getLayoutProperty(buildingsLayerId, 'visibility');
        if (level >= 0 && visibility === 'none') {
            this._map.setLayoutProperty(buildingsLayerId, 'visibility', 'visible');
        } else if (level < 0 && visibility === 'visible') {
            this._map.setLayoutProperty(buildingsLayerId, 'visibility', 'none');
        }

        for (let i = 0; i < this.indoorLayers.length; i++) {
            const layerId = this.indoorLayers[i];
            const filter = this.indoorFilters[i];
            this._map.setFilter(layerId, ["all", filter, ["any", ["!", ["has", "level"]], ["inrange", ["get", "level"], level]]]);
        }

        if (this.selectedLevel !== level) {
            this.selectedLevel = level;
            this.fire(new Event('level.changed', {level}));
        }

    }

    loaded() {
        return this._loaded;
    }

}

export default Indoor;

