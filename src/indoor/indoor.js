// @flow

import {Event, ErrorEvent, Evented} from '../util/evented';
import GeoJsonHelper from './geojson_helper';
import {bindAll} from '../util/util';
import MercatorCoordinate from '../../src/geo/mercator_coordinate';
import Map from '../ui/map';

import type {GeoJSON} from '@mapbox/geojson-types';
import type {LayerSpecification, FilterSpecification} from '../style-spec/types';
import type {Level, IndoorMap} from './types';
import StyleLayer from '../style/style_layer';

type LayerFilter = {
    layer: LayerSpecification,
    filter: FilterSpecification
}

const SOURCE_ID = "indoor";

const LAYERS_TO_REMOVE = ['poi-scalerank4-l15', 'poi-scalerank4-l1', 'poi-scalerank3', 'road-label-small'];

/**
 * Manage indoor levels
 * @extends Evented
 * @param {Map} map the Mapbox map
 */
class Indoor extends Evented {

    _map: Map;
    _originalFilters: Array<LayerFilter>;
    _timestampLoadLevels: number;
    _currentTimeout: boolean;
    _indoorMaps: Array<IndoorMap>;
    _selectedMap: ?IndoorMap;

    constructor(map: Map) {
        super();

        this._map = map;
        this._indoorMaps = [];
        this._originalFilters = [];
        this._selectedMap = null;

        this._map.on('level', () => this._onLevelChanged(map.getLevel()));

        this._map.on('load', () => {
            this.updateSelectedMapIfNeeded();
            this._map.on('moveend', () => this.updateSelectedMapIfNeeded());
        });

        bindAll([
            '_onLevelChanged'
        ], this);
    }

    addMap(geojson: GeoJSON, layers: Array<LayerSpecification>) {

        const {bounds, levelsRange} = GeoJsonHelper.extractLevelsRangeAndBounds(geojson);

        this._indoorMaps.push({
            bounds,
            geojson,
            layers,
            levelsRange
        });

        this.updateSelectedMapIfNeeded();
    }

    /**
     * ***********************
     * Handle level change
     * ***********************
     */

    _onLevelChanged(newLevel: ?Level) {

        let filterFn;

        if (newLevel !== null && typeof newLevel !== 'undefined') {
            filterFn = (filter: FilterSpecification): FilterSpecification => ["all", filter, ["any", ["!", ["has", "level"]], ["inrange", ["get", "level"], newLevel.toString()]]];
        } else {
            filterFn = (filter: FilterSpecification): FilterSpecification => filter;
        }

        this._originalFilters.forEach(({layer, filter}) => {
            this._map.setFilter(layer.id, filterFn(filter));
        });
    }

    /**
     * **************
     * Layer creation
     * **************
     */

    updateSelectedMap(indoorMap: ?IndoorMap) {

        if (this._map.getSource(SOURCE_ID)) {
            (Object.values(this._map.style._layers): any).forEach((layer: StyleLayer) => {
                if (layer.source === SOURCE_ID) {
                    this._map.removeLayer(layer.id);
                }
            });
            this._map.removeSource(SOURCE_ID);
        }

        this._originalFilters = [];

        if (!indoorMap) {
            LAYERS_TO_REMOVE.forEach(layerId => {
                this._map.setLayoutProperty(layerId, 'visibility', 'visible');
            });
            this._map.setLevel(null);
            this.fire(new Event('level.range.changed', null));
            return;
        }

        const {geojson, layers, levelsRange} = indoorMap;

        Promise.resolve()
            // Load Source
            .then(() => {
                return new Promise(resolve => {

                    const source = this._map.addSource(SOURCE_ID, {
                        type: "geojson",
                        data: geojson
                    });

                    source.on('data', data => {
                        if (data.dataType === "source" &&
                            data.sourceDataType === "metadata") {
                            source.off('data', this);
                            resolve();
                        }
                    });
                });
            })

            // Add layers and save filters
            .then(() => {
                const saveFilter = layer => {
                    this._originalFilters.push({
                        layer,
                        filter: this._map.getFilter(layer.id) || ["all"]
                    });
                };

                layers.forEach(layer => {
                    if (layer.id === "poi-indoor") {
                        this.createPoiLayers(layer).forEach(layer => {
                            this._map.addLayer(layer);
                            saveFilter(layer);
                        });
                    } else {
                        this._map.addLayer(layer);
                        saveFilter(layer);
                    }
                });
            })

            // Remove some layers for rendering
            .then(() => {
                LAYERS_TO_REMOVE.forEach(layerId => {
                    this._map.setLayoutProperty(layerId, 'visibility', 'none');
                });
            })

            // End of creation
            .then(() => {

                this.fire(new Event('level.range.changed', levelsRange));

                if (this._map.getLevel() !== null) {
                    this._onLevelChanged(this._map.getLevel());
                } else {
                    const defaultLevel = Math.max(Math.min(0, levelsRange.max), levelsRange.min);
                    this._map.setLevel(defaultLevel);
                }

                this.fire(new Event('loaded', {sourceId: SOURCE_ID}));

            })

            // Catch errors
            .catch(error => {
                this.fire(new ErrorEvent(error));
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

    createPoiLayers(metaLayer: LayerSpecification) {

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

    removeMap(geojson: GeoJSON) {
        this._indoorMaps = this._indoorMaps.filter(indoorMap => indoorMap.geojson !== geojson);
        this.updateSelectedMapIfNeeded();
    }

    /**
     * ***********************
     * Check for level changes
     * ***********************
     */

    updateSelectedMapIfNeeded() {
        const closestMap = this.closestMap();
        if (closestMap !== this._selectedMap) {
            this._selectedMap = closestMap;
            this.updateSelectedMap(closestMap);
        }
    }

    closestMap() {

        if (this._map.getZoom() < 17) {
            return null;
        }

        const cameraBounds = this._map.getBounds();

        const overlap = (bounds1, bounds2) => {
            // If one rectangle is on left side of other
            if (bounds1.getWest() > bounds2.getEast() || bounds2.getWest() > bounds1.getEast()) {
                return false;
            }

            // If one rectangle is above other
            if (bounds1.getNorth() < bounds2.getSouth() || bounds2.getNorth() < bounds1.getSouth()) {
                return false;
            }

            return true;
        };

        const mapsInBounds = this._indoorMaps.filter(indoorMap =>
            overlap(indoorMap.bounds, cameraBounds)
        );

        if (mapsInBounds.length === 0) {
            return null;
        }

        if (mapsInBounds.length === 1) {
            return mapsInBounds[0];
        }

        const dist = (p1, p2) => {
            const {x:x1, y:y1} = MercatorCoordinate.fromLngLat(p1);
            const {x:x2, y:y2} = MercatorCoordinate.fromLngLat(p2);
            return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        };

        // Verify this formula
        return mapsInBounds[
            mapsInBounds
                .map(map => dist(map.bounds.getCenter(), cameraBounds.getCenter()))
                .reduce((iMin, x, i, arr) => x < arr[iMin] ? i : iMin, Infinity)
        ];
    }
}

export default Indoor;

