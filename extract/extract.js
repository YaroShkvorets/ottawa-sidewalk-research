const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')
const ruler = require('cheap-ruler')(45.34, 'meters')

const sourcePath = "ottawa_pedestrian_network.json"   //download ottawa.ca dataset from http://data.ottawa.ca/dataset/pedestrian-network/resource/e098e33a-9046-48da-bbfb-6f4a4dc2c55e
//const sourcePath = "ottawa_canada_roads.geojson"    //download IMPOSM extract from https://mapzen.com/data/metro-extracts/metro/ottawa_canada/
const targetPath = "ottawa_urban_sidewalks.json"
//const targetPath = "ottawa_urban_roads.json"
const cityBoundaryPath = "ottawa_boundaries.json"

const collection = []

//const bbox = [-75.7645,45.3819,-75.7203,45.4130]  //kitchissippi
//const bbox = [-75.757599,45.384466,-75.666618,45.439658]  //ottawa urban small
const bbox = [-75.864716,45.320289,-75.593491,45.471688]  //ottawa urban big (bayshore, southkeys)

const features = reader(sourcePath).features
console.log('Features loaded:', features.length)

var data = reader(cityBoundaryPath);
var city = turf.polygon(data.features[0].geometry.coordinates);

let id=1;
loop1:
for(let feature of features) {
  if(!feature.geometry) continue;
  for(const point of turf.explode(feature).features) {
    if(!ruler.insideBBox(point.geometry.coordinates, bbox) || !turf.inside(point,city)){  //not inside bbox and not inside city
        continue loop1
    }            
  }
  feature.properties.id=id++;
  collection.push(feature)
}




console.log('Features saved:', collection.length)

writer(targetPath, turf.featureCollection(collection))
