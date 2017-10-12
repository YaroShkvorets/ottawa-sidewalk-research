const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')
const ruler = require('cheap-ruler')(45.41, 'meters')
const rbush = require('geojson-rbush')

const sidewalkTree = rbush()

roadsWithSidewalks = [];
roadsWithLeftSidewalks = [];
roadsWithRightSidewalks = [];
roadsWithoutSidewalks = [];
roadsToSplit = [];

const inPedDataPath = "data/ottawa_central_sidewalks.json"
const inRoadDataPath = "data/ottawa_central_roads.json"
const outRoadsWithSidewalksPath = "data/ottawa_central_roads_with_sidewalks.json"
const outRoadsWithoutSidewalksPath = "data/ottawa_central_roads_without_sidewalks.json"
const outRoadsToSplitPath = "data/ottawa_central_roads_to_split.json"
const outRoadsWithLeftSidewalksPath = "data/ottawa_central_roads_with_left_sidewalks.json"
const outRoadsWithRightSidewalksPath = "data/ottawa_central_roads_with_right_sidewalks.json"

const kOffsetFromRoadEnd = 5   //disregard kRoadTestStep meters from road end
const kRoadTestStep = 3        //test points with kRoadTestStep meters staticBasePath
const kPointDistanceNearby = 18 //if there is a sidewalk within kPointDistanceNearby meters - point has sidewalk
const kPointsWithSidewalksThreshold = 0.80 //kPointsWithSidewalksThreshold of road points have sidewalk nearby -> road has sidewalk

console.time('Time')
console.log('Loading sidewalks ...')
let footways = reader(inPedDataPath)
footways.features = footways.features.filter(footway => footway.properties.WALK_TYPE == "SIDEWALK" &&
  (footway.geometry.type=='LineString' || footway.geometry.type=='MultiLineString'));
sidewalkTree.load(footways)

console.log('Loading roads ...')

let roads = reader(inRoadDataPath).features.filter(road => road.geometry.type=='LineString' &&
  (road.properties.type == "trunk" ||
  road.properties.type == "secondary" ||
  road.properties.type == "residential" ||
  road.properties.type == "service" ||
  road.properties.type == "tertiary" ||
  road.properties.type == "unclassified" ));

console.log('Loaded', footways.features.length,'sidewalks and', roads.length,'roads')

for (let road of roads) {
  const roadlen = ruler.lineDistance(road.geometry.coordinates)
  let offset = kOffsetFromRoadEnd;
  let foundSidewalk=false
  let pointsTotal=0;
  let pointsWithSidewalk=0, pointsWithLeftSidewalk=0, pointsWithRightSidewalk=0;
  const bbox = turf.bbox(road)
  bbox[0]-=0.001    //expand bbox by 0.001 ~ 100m
  bbox[1]-=0.001
  bbox[2]+=0.001
  bbox[3]+=0.001

  let nearby = sidewalkTree.search(bbox).features
  let ptPrev = ptNext = road.geometry.coordinates
  while(nearby.length && (pointsTotal==0 || offset<roadlen-kOffsetFromRoadEnd)){
    pointsTotal++;
    ptPrev = ptNext
    ptNext = ruler.along(road.geometry.coordinates, offset)
    
    let pointHasLeftSidewalk=false
    let pointHasRightSidewalk=false
    loop1:
    for(let footway of nearby) {
      if(footway.geometry.type=="MultiLineString")    //TODO: left/right for multilinestring
      {
        for(let coords of footway.geometry.coordinates) {
          if(isSidewalkCloseEnough(coords, ptNext)) {
            pointsWithSidewalk++;
            break loop1;
          }
        }
      }
      else {
        if(isSidewalkCloseEnough(footway.geometry.coordinates, ptNext)) {
          const proj = ruler.pointOnLine(footway.geometry.coordinates, ptNext).point
          if(isPointOnLeft(ptPrev,ptNext,proj)){
            pointHasLeftSidewalk=true;
          }else{
            pointHasRightSidewalk=true;
          }
        }
      }
    }
    if(pointHasLeftSidewalk){pointsWithLeftSidewalk++}
    if(pointHasRightSidewalk){pointsWithRightSidewalk++}
    if(pointHasLeftSidewalk || pointHasRightSidewalk){pointsWithSidewalk++}
    offset+=kRoadTestStep
  }
  road.properties.points_tested = pointsTotal
  road.properties.points_with_sidewalk = pointsWithSidewalk
  road.properties.points_with_left_sidewalk = pointsWithLeftSidewalk
  road.properties.points_with_right_sidewalk = pointsWithRightSidewalk
  road.properties.length = roadlen
  if(pointsTotal && pointsWithSidewalk>=pointsTotal*kPointsWithSidewalksThreshold){  //kPointsWithSidewalksThreshold of points have sidewalk nearby -> good
    //console.log(road.properties.name, 'has a sidewalk - ',roadlen,'meters long')
    roadsWithSidewalks.push(road);
  }
  else {
    roadsWithoutSidewalks.push(road)
  }
  if(pointsTotal && pointsWithLeftSidewalk>=pointsTotal*kPointsWithSidewalksThreshold){  
    roadsWithLeftSidewalks.push(road);
  }
  if(pointsTotal && pointsWithRightSidewalk>=pointsTotal*kPointsWithSidewalksThreshold){  
    roadsWithRightSidewalks.push(road);
  }
  if(roadlen > 300 &&
    pointsWithSidewalk<pointsTotal*kPointsWithSidewalksThreshold &&
    pointsWithSidewalk>pointsTotal*0.5 &&
    road.properties.type!="service")
  {
    roadsToSplit.push(road)
  }
}

function isSidewalkCloseEnough(line, pt){
  const proj = ruler.pointOnLine(line, pt).point
  const dist = ruler.distance(proj,pt)
  return dist < kPointDistanceNearby
}

function isPointOnLeft(ptA1, ptA2, ptB){   //returns whether point B is on the left of vector (A1,A2)
     return ((ptA2[0] - ptA1[0])*(ptB[1] - ptA1[1]) - (ptA2[1] - ptA1[1])*(ptB[0] - ptA1[0])) > 0;
}

writer(outRoadsWithSidewalksPath, turf.featureCollection(roadsWithSidewalks))
writer(outRoadsWithLeftSidewalksPath, turf.featureCollection(roadsWithLeftSidewalks))
writer(outRoadsWithRightSidewalksPath, turf.featureCollection(roadsWithRightSidewalks))
writer(outRoadsWithoutSidewalksPath, turf.featureCollection(roadsWithoutSidewalks))
writer(outRoadsToSplitPath, turf.featureCollection(roadsToSplit))


console.log('Roads with sidewalks: ', roadsWithSidewalks.length)
console.log('Roads with left sidewalks: ', roadsWithLeftSidewalks.length)
console.log('Roads with right sidewalks: ', roadsWithRightSidewalks.length)
console.log('Roads without sidewalks: ', roadsWithoutSidewalks.length)
console.log('Roads to split: ', roadsToSplit.length)

console.timeEnd('Time')
