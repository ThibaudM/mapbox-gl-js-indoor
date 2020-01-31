// @flow

import type {GeoJSON} from '@mapbox/geojson-types';
import type {LayerSpecification} from '../style-spec/types';
import LngLatBounds from '../geo/lng_lat_bounds';

export type Level = number;

export type LevelsRange = {
    min: Level,
    max: Level
};

export type IndoorMap = {
    bounds: LngLatBounds,
    geojson: GeoJSON,
    layers: Array<LayerSpecification>,
    levelsRange: LevelsRange
};
