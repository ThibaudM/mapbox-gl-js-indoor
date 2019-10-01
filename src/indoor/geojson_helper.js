// @flow

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
}
export default GeoJsonHelper;
