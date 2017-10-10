const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')

const cityBoundaryPath = "ottawa_wards-2010-2.json"
const targetPath = "city.json"

const collection = []

const wards = reader(cityBoundaryPath).features
var city = turf.polygon(wards[0].geometry.coordinates);
for(let feature of wards) {
  city = turf.union(city, turf.polygon(feature.geometry.coordinates))
}

collection.push(city)


writer(targetPath, turf.featureCollection(collection))
