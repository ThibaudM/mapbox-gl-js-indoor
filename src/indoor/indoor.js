// @flow

const Evented = require('../util/evented');
const ajax = require('../util/ajax');

class Indoor extends Evented {

    constructor(map) {
        super();
        this._map = map;
        this.selectedLevel = undefined;
        this.minLevel = 0;
        this.maxLevel = 0;
        this.listOfLayers = []; 
        this._sourceId = -1;
        this._sourceLoaded = false;
        this._styleLoaded = false;
        this._loaded = false;
    }

    createIndoorLayer(sourceUrl: string, sourceId: string, styleUrl: string, 
            bounds: any, minzoom: number, maxzoom: number) {

        // Load source
        const source = this._map.addSource(sourceId, {
            type: "vector",
            tiles: [ sourceUrl ],
            bounds: bounds,
            maxzoom: maxzoom,
            minzoom: minzoom
        });
        this._sourceId = sourceId;

        source.on('data', (e)=>{
            if(e.dataType == "source" &&
                e.sourceDataType != "metadata" &&
                e.sourceDataType != "content") {
                this._sourceLoaded = true;
                this._endCreationProcess();
            }
        });

        // Load style
        const request = this._map._transformRequest(styleUrl);
        ajax.getJSON(request, (error, json) => {
            if (error) {
                this.fire('error', {error});
                return;
            }
            for (var i = 0; i < json.length; i++){
                this._map.addLayer(json[i]);
            }
    
            this._styleLoaded = true;
            this._endCreationProcess();
        });

    }

    _endCreationProcess() {

        if(this._loaded || !this._sourceLoaded || !this._styleLoaded) {
            return;
        }

        this.loadLevels();

        this.fire('loaded', {sourceId: this._sourceId});
        this._loaded = true;
    }


    removeIndoorLayer(sourceId) {

        // TODO remove source and layers

        this._loaded = false;
        const index = this._sourceId.indexOf(sourceId);
        if (index > -1) {
            this._sourceId.splice(index, 1);
        }
        this.loadLevels();
    }

    loadLevels() {

        let maxLevel = 0;
        let minLevel = 0;

        
        const buildings = this._map.querySourceFeatures(this._sourceId, {sourceLayer: "indoor", 
            filter: ["==", "type", "building"]});

        for (let i = 0; i < buildings.length; i++) { 
            if('levels' in buildings[i].properties && maxLevel < buildings[i].properties.levels - 1) {
                maxLevel = buildings[i].properties.levels - 1;
            }
        }
        

        if(this.minLevel == minLevel && this.maxLevel == maxLevel)
            return;

        if(minLevel == 0 && maxLevel == 0) {
            this.selectedLevel = undefined;
        }

        
        this.minLevel = minLevel;
        this.maxLevel = maxLevel;

        // or removed
        this.fire('building.added', {minLevel: minLevel, maxLevel: maxLevel});


        if(this.selectedLevel == undefined) {
            this.setLevel(Math.max(this.minLevel, 0));
        }
        else {
            this.setLevel(this.selectedLevel);
        }
    }


    setLevel(level) {

        if(level > this.maxLevel || level < this.minLevel) {
            return;
        }

        const listOfLayers = [];
        for(const key in this._map.style._layers) {
            const layer = this._map.style._layers[key];
            if(this._sourceId == layer.source && layer.id != "buildings") {
                listOfLayers.push(layer.id);
            }
        }

        for(let j=0; j<listOfLayers.length; j++) {

            const layer = listOfLayers[j];
            let currentFilter = this._map.getFilter(layer);

            if(currentFilter == null) {
                currentFilter = ["all"];
            }

            if(currentFilter.length >= 2 && 
                currentFilter[2].length >= 1 &&
                currentFilter[2][1] == "level") {
                currentFilter = currentFilter[1];   
            } 

            this._map.setFilter(layer, ["all", currentFilter, ["==", "level", level.toString()]]);    
        }

        if(this.selectedLevel != level) {
            this.selectedLevel = level;
            this.fire('level.changed', {'level': level});
        }


    }

    loaded() {
        return this._loaded;
    }

};


module.exports = Indoor;

