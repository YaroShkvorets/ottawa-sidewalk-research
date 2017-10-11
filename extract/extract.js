const inside = require('@turf/inside')
const { writer } = require('geojson-writer')
const { featureEach, coordEach } = require('@turf/meta')
const { featureCollection } = require('@turf/helpers')
const ruler = require('cheap-ruler')(45.34, 'meters')

// GeoJSON
const source = require('./pedestrian-network.json') // download ottawa.ca dataset from http://data.ottawa.ca/dataset/pedestrian-network/resource/e098e33a-9046-48da-bbfb-6f4a4dc2c55e
const cityBoundary = require('./ottawa_boundaries.json')
// const source = require('ottawa_canada_roads.json')    // download IMPOSM extract from https://mapzen.com/data/metro-extracts/metro/ottawa_canada/

// Paths
const targetPath = 'ottawa_urban_sidewalks.json'
// const target = "ottawa_urban_roads.json"

// BBox
const bbox = [-75.864716, 45.320289, -75.593491, 45.471688] // ottawa urban big (bayshore, southkeys)
// const bbox = [-75.7645, 45.3819, -75.7203, 45.4130]  // kitchissippi
// const bbox = [-75.757599, 45.384466, -75.666618, 45.439658]  // ottawa urban small

console.log('Features loaded:', source.features.length)

const collection = []
featureEach(source, (feature, featureIndex) => {
  let isInside = false
  coordEach(feature, coord => {
    // not inside bbox and not inside city
    isInside = isInside !== true || !ruler.insideBBox(coord, bbox) || !inside(coord, cityBoundary)
  })
  if (isInside) {
    feature.properties.id = featureIndex
    collection.push(feature)
  }
})

console.log('Features saved:', collection.length)
writer(targetPath, featureCollection(collection))
