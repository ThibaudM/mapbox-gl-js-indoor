// @flow

import LngLatBounds from "../geo/lng_lat_bounds";

class GeoJsonHelper {
    static generateOsmFilterTagsToMaki() {
        return [
            {
                filter: ['filter-==', 'amenity', 'fast_food'],
                maki: 'fast-food'
            },
            {
                filter: ['filter-==', 'amenity', 'restaurant'],
                maki: 'restaurant'
            },
            {
                filter: ['filter-==', 'amenity', 'cafe'],
                maki: 'cafe'
            },
            {
                filter: ['filter-==', 'amenity', 'bank'],
                maki: 'bank'
            },
            {
                filter: ['filter-==', 'amenity', 'toilets'],
                maki: 'toilet'
            },
            {
                filter: ['filter-==', 'shop', 'travel_agency'],
                maki: 'suitcase'
            },
            {
                filter: ['filter-==', 'shop', 'convenience'],
                maki: 'grocery'
            },
            {
                filter: ['filter-==', 'shop', 'bakery'],
                maki: 'bakery'
            },
            {
                filter: ['filter-==', 'shop', 'chemist'],
                maki: 'pharmacy'
            },
            {
                filter: ['filter-==', 'shop', 'clothes'],
                maki: 'clothing-store'
            },
            {
                filter: ['filter-==', 'highway', 'steps'],
                maki: 'entrance'
            },
            {
                filter: ['has', 'shop'],
                maki: 'shop'
            }
        ];
    }
    /**
     * Get the bounds of a feature object
     *
     * @param {Object} feature The feature object
     * @returns {LngLatBounds} The feature bounds
     */
    static getFeatureBounds({geometry}) {

        const bounds = new LngLatBounds();

        const coordinates = geometry.coordinates;

        if (geometry.type === 'Point') {

            bounds.extend(coordinates);

        } else if (geometry.type === 'LineString') {

            coordinates.forEach(_coordinates => {
                bounds.extend(_coordinates);
            });

        } else if (geometry.type === 'Polygon') {

            coordinates.forEach(_coordinates => {
                _coordinates.forEach(__coordinates => {
                    bounds.extend(__coordinates);
                });
            });

        } else if (geometry.type === 'MultiPolygon') {

            coordinates.forEach(_coordinates => {
                _coordinates.forEach(__coordinates => {
                    __coordinates.forEach(___coordinates => {
                        bounds.extend(___coordinates);
                    });
                });
            });

        }

        return bounds;
    }

    /**
     * Extract level from feature
     *
     * @param {Object} feature geojson feature
     * @returns {Array|Number} the level or the range of level.
     */
    static extractLevelFromFeature(feature) {
        const propertyLevel = feature.properties.level;
        if (!propertyLevel) {
            return;
        }
        const splitLevel = propertyLevel.split(';');
        if (splitLevel.length === 1) {
            const level = parseFloat(propertyLevel);
            if (!isNaN(level)) {
                return level;
            }
        } else if (splitLevel.length === 2) {
            const level1 = parseFloat(splitLevel[0]);
            const level2 = parseFloat(splitLevel[1]);
            if (!isNaN(level1) && !isNaN(level2)) {
                return [
                    Math.min(level1, level2),
                    Math.max(level1, level2)
                ];
            }
        }
    }

    static extractLevelsRangeAndBounds(geojson) {
        let minLevel = Infinity;
        let maxLevel = -Infinity;

        const bounds = new LngLatBounds();

        geojson.features.forEach(feature => {
            const level = this.extractLevelFromFeature(feature);

            if (!level) {
                return;
            }

            bounds.extend(GeoJsonHelper.getFeatureBounds(feature));

            if (typeof level === 'number') {
                minLevel = Math.min(minLevel, level);
                maxLevel = Math.max(maxLevel, level);
            } else if (Array.isArray(level)) {
                minLevel = Math.min(minLevel, level[0]);
                maxLevel = Math.max(maxLevel, level[1]);
            }

        });

        if (minLevel === Infinity || maxLevel === -Infinity) {
            throw new Error('No level found');
        }
        return {
            levelsRange: [minLevel, maxLevel],
            bounds
        };
    }
}
export default GeoJsonHelper;
