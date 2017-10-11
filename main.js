const path = require('path')
const { writer } = require('geojson-writer')
const { featureCollection } = require('@turf/helpers')
const { lineEach } = require('@turf/meta')
const rbush = require('geojson-rbush').default
const ruler = require('cheap-ruler')(45.34, 'meters')

const tree = {
  sidewalks: rbush(),
  roads: rbush()
}

const roadsWithSidewalks = []
const roadsWithoutSidewalks = []

// Data
const footways = require('./data/ottawa_urban_sidewalks.json')
const roads = require('./data/ottawa_urban_roads.json')
const outRoadsWithSidewalksPath = path.join(__dirname, 'data', 'ottawa_urban_roads_with_sidewalks.json')
const outRoadsWithoutSidewalksPath = path.join(__dirname, 'data', 'ottawa_urban_roads_without_sidewalks.json')
console.log('Reading', footways.features.length, 'footways and', roads.features.length, 'roads')

const kOffsetFromRoadEnd = 5               // disregard kRoadTestStep meters from road end
const kRoadTestStep = 5                    // test points with kRoadTestStep meters staticBasePath
const kPointDistanceNearby = 18            // if there is a sidewalk within kPointDistanceNearby meters - point has sidewalk
const kPointsWithSidewalksThreshold = 0.80 // kPointsWithSidewalksThreshold of road points have sidewalk nearby -> road has sidewalk

console.time('Time')
lineEach(footways, (footway) => {
  if (footway.properties.WALK_TYPE === 'SIDEWALK') {
    tree.sidewalks.insert(footway)
  }
})

roads.features = roads.features.filter(road => {
  if (road.geometry.type !== 'LineString') return false
  const type = road.properties.type
  return ['trunk', 'secondary', 'residential', 'service', 'tertiary', 'unclassified'].indexOf(type) !== -1
})

console.log('Loaded', tree.sidewalks.all().features.length, 'sidewalks and', roads.features.length, 'roads')
let totalRoadsWithSidewalk = 0

for (let road of roads.features) {
  const roadlen = ruler.lineDistance(road.geometry.coordinates)
  let offset = kOffsetFromRoadEnd
  let foundSidewalk = false
  let pointsTotal = 0
  let pointsWithSidewalk = 0
  while (pointsTotal === 0 || offset < roadlen - kOffsetFromRoadEnd) {
    pointsTotal++
    const pt = ruler.along(road.geometry.coordinates, offset)
    let nearby = tree.sidewalks.search(road)
    for (let footway of nearby.features) {
      if (isSidewalkCloseEnough(footway.geometry.coordinates, pt)) {
        pointsWithSidewalk++
        break
      }
    }
    offset += kRoadTestStep
  }
  road.properties.points_tested = pointsTotal
  road.properties.points_with_sidewalk = pointsWithSidewalk
  road.properties.length = roadlen
  if (pointsWithSidewalk >= pointsTotal * kPointsWithSidewalksThreshold) {  // kPointsWithSidewalksThreshold of points have sidewalk nearby -> good
    totalRoadsWithSidewalk++
    // console.log(road.properties.name, 'has a sidewalk - ',roadlen,'meters long')
    roadsWithSidewalks.push(road)
  } else {
    roadsWithoutSidewalks.push(road)
  }
}

function isSidewalkCloseEnough (line, pt) {
  const proj = ruler.pointOnLine(line, pt).point
  const dist = ruler.distance(proj, pt)
  if (dist < kPointDistanceNearby) {
    return true
  }
  return false
}

writer(outRoadsWithSidewalksPath, featureCollection(roadsWithSidewalks))
writer(outRoadsWithoutSidewalksPath, featureCollection(roadsWithoutSidewalks))

console.log('Matched sidewalks for', totalRoadsWithSidewalk, '/', roads.length, 'roads')
console.timeEnd('Time')
