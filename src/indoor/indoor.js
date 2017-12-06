
const util = require('../util/util');



class Indoor {

    constructor(map) {
    	this._map = map;
        this.selectedLevel = undefined;
    	this.minLevel = 0;
        this.maxLevel = 0;
        this.listOfLayers = []; 
        this._sourceId = -1;
    }


	addSourceId(sourceId) {

        this._sourceId = sourceId;

        const source = this._map.getSource(sourceId);
        if(source == null) {
            this._map.fire('Error', 'Unknown source id');
            return;
        } 

        source.on('data', (tile) => {this.loadLevels();});

        if(this.selectedLevel == undefined) 
            this.setLevel(Math.max(this.minLevel, 0));
        else 
            this.setLevel(this.selectedLevel);

    }

    removeSourceId(sourceId) {
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
        this._map.fire('indoor.building.added', {minLevel: minLevel, maxLevel: maxLevel});
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
			this._map.fire('indoor.level.changed', {'level': level});
        }


    }


};


module.exports = Indoor;

