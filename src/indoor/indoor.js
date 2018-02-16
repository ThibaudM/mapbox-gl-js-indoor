// @flow

const Evented = require('../util/evented');
const ajax = require('../util/ajax');
const MIN_TIME_BETWEEN_LOADING_LEVELS = 500; // in ms

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
        this._timestampLoadLevels = 0;
        this._current_timeout = false;
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

        source.on('data', (tile) => {
            this.tryToLoadLevels();
        });

        this._map.on('move', (e) => {
            this.tryToLoadLevels();
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

    tryToLoadLevels() {
        if(new Date().getTime() - this._timestampLoadLevels > MIN_TIME_BETWEEN_LOADING_LEVELS) {
            this.loadLevels();
        } else if(!this._current_timeout) {
            var that = this;  
            setTimeout(function() { 
                that.loadLevels(); 
                that._current_timeout = false;
            }, MIN_TIME_BETWEEN_LOADING_LEVELS);
            this._current_timeout = true;
        }
    }

    _endCreationProcess() {

        if(this._loaded || !this._sourceLoaded || !this._styleLoaded) {
            return;
        }

        // this.loadLevels();

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
        // this.loadLevels();
    }

    loadLevels() {

        this._timestampLoadLevels = new Date().getTime();

        let maxLevel = 0;
        let minLevel = 0;
        

        const features = this._map.querySourceFeatures(this._sourceId, {sourceLayer: "indoor", 
            filter: ["has", "level"]});

        for (let i = 0; i < features.length; i++) { 
            if(maxLevel < features[i].properties.level) {
                maxLevel = features[i].properties.level;
            }
            if(minLevel > features[i].properties.level) {
                minLevel = features[i].properties.level;
            }
        }
        



        if(this.minLevel == minLevel && this.maxLevel == maxLevel)
            return;
        
        this.minLevel = minLevel;
        this.maxLevel = maxLevel;

        if(minLevel == 0 && maxLevel == 0) {
            this.fire('building.removed');
        } else {
            this.fire('building.added', {minLevel: minLevel, maxLevel: maxLevel});            
        }


        // First time try to set current level to 0
        if(this.selectedLevel == undefined && (minLevel != 0 || maxLevel != 0)) {
            this.setLevel(Math.max(this.minLevel, 0));
        }


        if(minLevel != 0 || maxLevel != 0) {
            if(this.selectedLevel > this.maxLevel) {
                this.setLevel(this.maxLevel);
            }
            else if(this.selectedLevel < this.minLevel) {
                this.setLevel(this.minLevel);
            }
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

