// @flow

import {Event, ErrorEvent, Evented} from '../util/evented';
import GeoJsonHelper from './geojson_helper';
import MercatorCoordinate from '../../src/geo/mercator_coordinate';
import Map from '../ui/map';
import LngLatBounds from '../geo/lng_lat_bounds';
import defaultLayers from './default_style_helper';

import type {GeoJSON} from '@mapbox/geojson-types';
import type {LayerSpecification, FilterSpecification} from '../style-spec/types';
import type {Level, LevelsRange} from './types';

type SavedFilter = {
    layerId: string,
    filter: FilterSpecification
}

type IndoorMap = {
    bounds: LngLatBounds,
    geojson: GeoJSON,
    layers: Array<LayerSpecification>,
    levelsRange: LevelsRange,
    beforeLayerId?: string
};

const SOURCE_ID = "indoor";

const LAYERS_TO_REMOVE = ['poi-scalerank4-l15', 'poi-scalerank4-l1', 'poi-scalerank3', 'road-label-small'];

/**
 * Manage indoor levels
 * @extends Evented
 * @param {Map} map the Mapbox map
 */
class Indoor extends Evented {

    _map: Map;
    _savedFilters: Array<SavedFilter>;
    _indoorMaps: Array<IndoorMap>;
    _selectedMap: IndoorMap | null;
    _previousSelectedMap: IndoorMap | null;
    _previousSelectedLevel: Level | null;

    constructor(map: Map) {
        super();

        this._map = map;
        this._indoorMaps = [];
        this._savedFilters = [];
        this._selectedMap = null;

        this._map.on('level', () => this._updateFiltering());

        this._map.on('load', () => {
            this._updateSelectedMapIfNeeded();
            this._map.on('moveend', () => this._updateSelectedMapIfNeeded());
        });
    }

    addMap(geojson: GeoJSON, layers?: Array<LayerSpecification>, beforeLayerId?: string) {

        const {bounds, levelsRange} = GeoJsonHelper.extractLevelsRangeAndBounds(geojson);

        this._indoorMaps.push({
            bounds,
            geojson,
            layers: layers ? layers : defaultLayers,
            levelsRange,
            beforeLayerId
        });

        this._updateSelectedMapIfNeeded();
    }

    /**
     * ***********************
     * Handle level change
     * ***********************
     */

    addLayerForFiltering(layerId: string) {
        this._savedFilters.push({
            layerId,
            filter: this._map.getFilter(layerId) || ["all"]
        });
    }

    removeLayerFromFiltering(layerId: string) {
        this._savedFilters = this._savedFilters.filter(obj => obj.layerId !== layerId);
    }

    _updateFiltering() {

        const level = this._map.getLevel();

        let filterFn;

        if (level !== null) {
            filterFn = (filter: FilterSpecification): FilterSpecification => ["all", filter, ["any", ["!", ["has", "level"]], ["inrange", ["get", "level"], level.toString()]]];
        } else {
            filterFn = (filter: FilterSpecification): FilterSpecification => filter;
        }

        this._savedFilters.forEach(({layerId, filter}) => this._map.setFilter(layerId, filterFn(filter)));
    }

    /**
     * **************
     * Layer creation
     * **************
     */

    _updateSelectedMap(indoorMap: IndoorMap | null) {

        if (this._selectedMap !== null) {
            this._selectedMap.layers.forEach(({id}) => {
                this.removeLayerFromFiltering(id);
                this._map.removeLayer(id);
            });
            this._map.removeSource(SOURCE_ID);
        }

        if (!indoorMap) {
            LAYERS_TO_REMOVE.forEach(layerId => {
                this._map.setLayoutProperty(layerId, 'visibility', 'visible');
            });
            const mapLevel = this._map.getLevel();
            if (this._selectedMap !== null && mapLevel !== null) {
                const {levelsRange} = this._selectedMap;
                this._previousSelectedLevel = mapLevel <= levelsRange.max && mapLevel >= levelsRange.min ? mapLevel : null;
            } else {
                this._previousSelectedLevel = null;
            }
            this._map.setLevel(null);
            this.fire(new Event('level.range.changed', null));
            return;
        }

        const {geojson, layers, levelsRange, beforeLayerId} = indoorMap;

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
                layers.forEach(layer => {
                    this._map.addLayer(layer, beforeLayerId);
                    this.addLayerForFiltering(layer.id);
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

                const currentLevel = this._map.getLevel();
                if (this._previousSelectedMap === indoorMap && this._previousSelectedLevel !== null) {
                    // This enable to zoom out, then zoom in to a building at the same zoom level.
                    this._map.setLevel(this._previousSelectedLevel);
                } else if (currentLevel === null || currentLevel < levelsRange.min || currentLevel > levelsRange.max) {
                    const defaultLevel = Math.max(Math.min(0, levelsRange.max), levelsRange.min);
                    this._map.setLevel(defaultLevel);
                }
                this._updateFiltering();
                this._previousSelectedMap = indoorMap;

                this.fire(new Event('loaded', {sourceId: SOURCE_ID}));

            })

            // Catch errors
            .catch(error => {
                this.fire(new ErrorEvent(error));
            });
    }

    removeMap(geojson: GeoJSON) {
        this._indoorMaps = this._indoorMaps.filter(indoorMap => indoorMap.geojson !== geojson);
        this._updateSelectedMapIfNeeded();
    }

    /**
     * ***********************
     * Check for level changes
     * ***********************
     */

    _updateSelectedMapIfNeeded() {
        const closestMap = this.closestMap();
        if (closestMap !== this._selectedMap) {
            this._updateSelectedMap(closestMap);
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
            const {x:x1, y:y1} = MercatorCoordinate.fromLngLat(p1);
            const {x:x2, y:y2} = MercatorCoordinate.fromLngLat(p2);
            return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        };

        /*
         * If there is multiple maps at this step, select the closest
         */
        let minDist = Number.POSITIVE_INFINITY;
        let closestMap = null;
        for (const map of mapsInBounds) {
            const _dist = dist(map.bounds.getCenter(), cameraBounds.getCenter());
            if (_dist < minDist) {
                closestMap = map;
                minDist = _dist;
            }
        }
        return closestMap;
    }
}

export default Indoor;

