const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')
const ruler = require('cheap-ruler')(45.41, 'meters')
const rbush = require('geojson-rbush')

const sidewalkTree = rbush()

const roadsWithBothSidewalks = [];
const roadsWithLeftSidewalks = [];
const roadsWithRightSidewalks = [];
const roadsWithNoSidewalks = [];
const roadsToSplit = [];
const roadsTooShort = [];

const inPedDataPath = "data/ottawa_full_sidewalks.json"
const inRoadDataPath = "data/ottawa_full_roads.json"
const outRoadsWithBothSidewalksPath = "data/roads_with_both_sidewalks.json"
const outroadsWithNoSidewalksPath = "data/roads_without_sidewalks.json"
const outRoadsToSplitPath = "data/roads_to_split.json"
const outRoadsWithLeftSidewalksPath = "data/roads_with_left_sidewalks.json"
const outRoadsWithRightSidewalksPath = "data/roads_with_right_sidewalks.json"
const outRoadsTooShortPath = "data/roads_too_short.json"

const kOffsetFromRoadEnd = 5   //disregard kRoadTestStep meters from road end
const kRoadTestStep = 3        //test points with kRoadTestStep meters staticBasePath
const kPointDistanceNearby = 15 //if there is a sidewalk within kPointDistanceNearby meters - point has sidewalk
const kPointsWithSidewalksThreshold = 0.80 //kPointsWithSidewalksThreshold of road points have sidewalk nearby -> road has sidewalk
const kTooShortThreshold = 20

console.time('Time')
console.log('Loading sidewalks ...')
let footways = reader(inPedDataPath)
footways.features = footways.features.filter(footway => footway.properties.WALK_TYPE == "SIDEWALK" &&
  (footway.geometry.type=='LineString' || footway.geometry.type=='MultiLineString'));
sidewalkTree.load(footways)

console.log('Loading roads ...')

let roads = reader(inRoadDataPath).features.filter(road => road.geometry.type=='LineString' &&
  (!road.properties.name || road.properties.name.indexOf('Transitway')==-1) &&
  (road.properties.highway == "trunk" ||
  road.properties.highway == "trunk_link" ||
  road.properties.highway == "secondary" ||
  road.properties.highway == "secondary_link" ||
  road.properties.highway == "tertiary_link" ||   //do we need to tag links at all?
  road.properties.highway == "residential" ||
  road.properties.highway == "service" ||
  road.properties.highway == "tertiary" ||
  road.properties.highway == "unclassified" ));

console.log('Loaded', footways.features.length,'sidewalks and', roads.length,'roads')

for (let road of roads) {
  const roadlen = ruler.lineDistance(road.geometry.coordinates)
  let offset = kOffsetFromRoadEnd;
  let foundSidewalk=false
  let pointsTotal=0;
  let pointsWithBothSidewalks=0, pointsWithLeftSidewalk=0, pointsWithRightSidewalk=0, pointsWithNoSidewalks=0;
  const bbox = turf.bbox(road)
  bbox[0]-=0.001    //expand bbox by 0.001 ~ 100m
  bbox[1]-=0.001
  bbox[2]+=0.001
  bbox[3]+=0.001

  let nearby = sidewalkTree.search(bbox).features
  let ptPrev = ptNext = road.geometry.coordinates[0]
  while(nearby.length && (pointsTotal==0 || offset<roadlen-kOffsetFromRoadEnd)){
    if(pointsTotal==0 && offset>roadlen-kOffsetFromRoadEnd){offset = roadlen/2} //if segment is really short
    pointsTotal++;
    ptPrev = ptNext
    ptNext = ruler.along(road.geometry.coordinates, offset)

    let pointHasLeftSidewalk=false
    let pointHasRightSidewalk=false
    loop1:
    for(let footway of nearby) {
      if(footway.geometry.type=="MultiLineString")
      {
        for(let coords of footway.geometry.coordinates) {
          if(isSidewalkCloseEnough(coords, ptNext)) {
            const proj = ruler.pointOnLine(coords, ptNext).point
            if(isPointOnLeft(ptPrev,ptNext,proj)){
              pointHasLeftSidewalk=true;
            }else{
              pointHasRightSidewalk=true;
            }
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
    if(pointHasLeftSidewalk && pointHasRightSidewalk){pointsWithBothSidewalks++}
    if(!pointHasLeftSidewalk && !pointHasRightSidewalk){pointsWithNoSidewalks++}
    offset+=kRoadTestStep
  }
  road.properties.points_tested = pointsTotal
  road.properties.points_with_both_sidewalks = pointsWithBothSidewalks
  road.properties.points_with_left_sidewalk = pointsWithLeftSidewalk
  road.properties.points_with_right_sidewalk = pointsWithRightSidewalk
  road.properties.length = roadlen
  if(pointsTotal){
    if(roadlen<kTooShortThreshold)
    {
      roadsTooShort.push(road);
    }
    else if(pointsTotal && pointsWithBothSidewalks>=pointsTotal*kPointsWithSidewalksThreshold){  //kPointsWithSidewalksThreshold of points have sidewalk nearby -> good
      roadsWithBothSidewalks.push(road);
      road.properties.sidewalk = 'both'
    }
    else if(pointsTotal && pointsWithLeftSidewalk>=pointsTotal*kPointsWithSidewalksThreshold){
      roadsWithLeftSidewalks.push(road);
      road.properties.sidewalk = 'left'
    }
    else if(pointsTotal && pointsWithRightSidewalk>=pointsTotal*kPointsWithSidewalksThreshold){
      roadsWithRightSidewalks.push(road);
      road.properties.sidewalk = 'right'
    }
    else{
      roadsWithNoSidewalks.push(road)
      road.properties.sidewalk = 'no'
    }
  }
  else{ //no sidewalks nearby at all
    roadsWithNoSidewalks.push(road)
  }

  if(roadlen > 300 &&
    pointsWithNoSidewalks>pointsTotal*(1-kPointsWithSidewalksThreshold) &&
    pointsWithNoSidewalks<pointsTotal*0.5 &&
    road.properties.highway!="service")
  {
    roadsToSplit.push(road)
  }
}

function isSidewalkCloseEnough(line, pt){
  const proj = ruler.pointOnLine(line, pt).point
  const dist = ruler.distance(proj,pt)
  //const dist = turf.pointToLineDistance(pt, line, 'meters')   //more precise but ~20 times slower
  return dist < kPointDistanceNearby
}

function isPointOnLeft(ptA1, ptA2, ptB){   //returns whether point B is on the left of vector (A1,A2)
     return ((ptA2[0] - ptA1[0])*(ptB[1] - ptA1[1]) - (ptA2[1] - ptA1[1])*(ptB[0] - ptA1[0])) > 0;
}

writer(outRoadsWithBothSidewalksPath, turf.featureCollection(roadsWithBothSidewalks))
writer(outRoadsWithLeftSidewalksPath, turf.featureCollection(roadsWithLeftSidewalks))
writer(outRoadsWithRightSidewalksPath, turf.featureCollection(roadsWithRightSidewalks))
writer(outroadsWithNoSidewalksPath, turf.featureCollection(roadsWithNoSidewalks))
writer(outRoadsToSplitPath, turf.featureCollection(roadsToSplit))
writer(outRoadsTooShortPath, turf.featureCollection(roadsTooShort))


console.log('Roads with both sidewalks: ', roadsWithBothSidewalks.length)
console.log('Roads with left sidewalks: ', roadsWithLeftSidewalks.length)
console.log('Roads with right sidewalks: ', roadsWithRightSidewalks.length)
console.log('Roads with no sidewalks: ', roadsWithNoSidewalks.length)
console.log('Roads to split: ', roadsToSplit.length)
console.log('Roads too short: ', roadsTooShort.length)

console.timeEnd('Time')
