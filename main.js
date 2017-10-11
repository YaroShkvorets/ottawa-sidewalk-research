const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')
const ruler = require('cheap-ruler')(45.34, 'meters')
const rbush = require('geojson-rbush')

const tree = {
  sidewalks: rbush()
}

roadsWithSidewalks = [];
roadsWithoutSidewalks = [];
roadsToSplit = [];

const inPedDataPath = "data/ottawa_central_sidewalks.json"
const inRoadDataPath = "data/ottawa_central_roads.json"
const outRoadsWithSidewalksPath = "data/ottawa_central_roads_with_sidewalks.json"
const outRoadsWithoutSidewalksPath = "data/ottawa_central_roads_without_sidewalks.json"
const outRoadsToSplitPath = "data/ottawa_central_roads_to_split.json"


const kOffsetFromRoadEnd = 5   //disregard kRoadTestStep meters from road end
const kRoadTestStep = 5        //test points with kRoadTestStep meters staticBasePath
const kPointDistanceNearby = 18 //if there is a sidewalk within kPointDistanceNearby meters - point has sidewalk
const kPointsWithSidewalksThreshold = 0.80 //kPointsWithSidewalksThreshold of road points have sidewalk nearby -> road has sidewalk

console.time('Time')
console.log('Loading sidewalks ...')
let footways = reader(inPedDataPath)
footways.features = footways.features.filter(footway => footway.properties.WALK_TYPE == "SIDEWALK" &&
  (footway.geometry.type=='LineString' || footway.geometry.type=='MultiLineString'));
tree.sidewalks.load(footways)

console.log('Loading roads ...')

let roads = reader(inRoadDataPath).features.filter(road => road.geometry.type=='LineString' &&
  (road.properties.type == "trunk" ||
  road.properties.type == "secondary" ||
  road.properties.type == "residential" ||
  road.properties.type == "service" ||
  road.properties.type == "tertiary" ||
  road.properties.type == "unclassified" ));

console.log('Loaded', footways.features.length,'sidewalks and', roads.length,'roads')
//console.log('Footways:', tree.sidewalks.all.length, ' Roads:', tree.roads.all.length)

for (let road of roads) {
  const roadlen = ruler.lineDistance(road.geometry.coordinates)
  let offset = kOffsetFromRoadEnd;
  let foundSidewalk=false
  let pointsTotal=0;
  let pointsWithSidewalk=0;
  const bbox = turf.bbox(road)
  bbox[0]-=0.001    //expand bbox by 0.001 ~ 100m
  bbox[1]-=0.001
  bbox[2]+=0.001
  bbox[3]+=0.001

  let nearby = tree.sidewalks.search(bbox).features
  while(nearby.length && (pointsTotal==0 || offset<roadlen-kOffsetFromRoadEnd)){
    pointsTotal++;
    const pt = ruler.along(road.geometry.coordinates, offset)

    loop1:
    for(let footway of nearby) {
      if(footway.geometry.type=="MultiLineString")
      {
        for(let coords of footway.geometry.coordinates) {
          if(isSidewalkCloseEnough(coords, pt)) {
            pointsWithSidewalk++;
            break loop1;
          }
        }
      }
      else {
        if(isSidewalkCloseEnough(footway.geometry.coordinates, pt)) {
          pointsWithSidewalk++;
          break;
        }
      }

    }
    offset+=kRoadTestStep
  }
  road.properties.points_tested = pointsTotal
  road.properties.points_with_sidewalk = pointsWithSidewalk
  road.properties.length = roadlen
  if(pointsTotal && pointsWithSidewalk>=pointsTotal*kPointsWithSidewalksThreshold){  //kPointsWithSidewalksThreshold of points have sidewalk nearby -> good
    //console.log(road.properties.name, 'has a sidewalk - ',roadlen,'meters long')
    roadsWithSidewalks.push(road);
  }
  else {
    roadsWithoutSidewalks.push(road)
  }
  if(roadlen > 300 &&
    pointsWithSidewalk<pointsTotal*kPointsWithSidewalksThreshold &&
    pointsWithSidewalk>pointsTotal*0.5 &&
    road.properties.type!="service")
  {
    roadsToSplit.push(road)
  }
}

function isSidewalkCloseEnough(line, pt)
{
  const proj = ruler.pointOnLine(line, pt).point
  const dist = ruler.distance(proj,pt)
  return dist < kPointDistanceNearby
}

writer(outRoadsWithSidewalksPath, turf.featureCollection(roadsWithSidewalks))
writer(outRoadsWithoutSidewalksPath, turf.featureCollection(roadsWithoutSidewalks))
writer(outRoadsToSplitPath, turf.featureCollection(roadsToSplit))



console.log('Roads with sidewalks: ', roadsWithSidewalks.length)
console.log('Roads without sidewalks: ', roadsWithoutSidewalks.length)
console.log('Roads to split: ', roadsToSplit.length)

console.timeEnd('Time')
