// @flow

import { Event, ErrorEvent, Evented } from '../util/evented';
import GeoJsonHelper from './geojson_helper';
import { bindAll } from '../util/util';
import MercatorCoordinate from '../../src/geo/mercator_coordinate';

// import type Map from '../ui/map';
import type StyleLayer from './style_layer';

const SOURCE_ID = "indoor";

const LAYERS_TO_REMOVE = ['poi-scalerank4-l15', 'poi-scalerank4-l1', 'poi-scalerank3', 'road-label-small'];

class Indoor extends Evented {

    _map: Map;
    _source: Source;
    _minLevel: number;
    _maxLevel: number;
    indoorFilters: Object;
    _timestampLoadLevels: number;
    _currentTimeout: boolean;
    _indoorMaps: Array;

    constructor(map: Map) {
        super();

        this._map = map;
        this._indoorMaps = [];
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

    addMap(geojson: GeoJSONSourceSpecification, layers: Array<LayerSpecification>, imagesUrl: any) {

        const { bounds, levelsRange } = GeoJsonHelper.extractLevelsRangeAndBounds(geojson);

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

    _onLevelChanged(newLevel) {
        if (!this.indoorFilters) {
            return;
        }
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

    updateSelectedMap(indoorMap) {

        if (this._map.getSource(SOURCE_ID)) {
            this._map.getStyle().layers.forEach(layer => {
                if (layer.source === SOURCE_ID) {
                    this._map.removeLayer(layer.id);
                }
            });
            this._map.removeSource(SOURCE_ID);
        }

        this.indoorFilters = {};

        if (!indoorMap) {
            LAYERS_TO_REMOVE.forEach(layerId => {
                this._map.setLayoutProperty(layerId, 'visibility', 'visible');
            });
            this.fire(new Event('level.range.changed', null));
            return;
        }

        const { geojson, layers, levelsRange } = indoorMap;

        Promise.resolve()
            // Load Source
            .then(() => {
                return new Promise(resolve => {

                    this._source = this._map.addSource(SOURCE_ID, {
                        type: "geojson",
                        data: geojson
                    });

                    this._source.on('data', data => {
                        if (data.dataType === "source" &&
                            data.sourceDataType === "metadata") {
                            this._source.off('data', this);
                            resolve();
                        }
                    });
                });
            })

            // Add layers and save filters
            .then(() => {
                const saveFilter = layer => {
                    // Fill indoorFilters with existing filters
                    let currentFilter = this._map.getFilter(layer.id);
                    if (!currentFilter) {
                        currentFilter = ["all"];
                    }
                    this.indoorFilters[layer.id] = currentFilter;
                };

                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];

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
                LAYERS_TO_REMOVE.forEach(layerId => {
                    this._map.setLayoutProperty(layerId, 'visibility', 'none');
                });
            })

            // End of creation
            .then(() => {

                this.on('level.range.changed', range => {
                    if (this._map.getLevel() !== null) {
                        this._onLevelChanged(this._map.getLevel());
                    } else {
                        const defaultLevel = Math.max(Math.min(0, range.maxLevel), range.minLevel);
                        this._map.setLevel(defaultLevel);
                    }
                    this.off('level.range.changed', this);
                });

            })

            .then(() => {
                this.fire(new Event('level.range.changed', { minLevel: levelsRange[0], maxLevel: levelsRange[1] }));
            })

            .then(() => {
                this.fire(new Event('loaded', { sourceId: SOURCE_ID }));
            })

            // Catch errors
            .catch(error => {
                this.fire(new ErrorEvent('error', { error }));
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

    removeMap(geojson) {
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
            this.updateSelectedMap(closestMap);
            this._selectedMap = closestMap;
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
            const { x1, y1 } = MercatorCoordinate.fromLngLat(p1);
            const { x2, y2 } = MercatorCoordinate.fromLngLat(p2);
            return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        };

        // TODO Verify
        return mapsInBounds[
            mapsInBounds
                .map(map => dist(map.bounds.getCenter(), cameraBounds.getCenter()))
                .reduce((iMin, x, i, arr) => x < arr[iMin] ? i : iMin, Infinity)
        ];
    }
}

export default Indoor;

