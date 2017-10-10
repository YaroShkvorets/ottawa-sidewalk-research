const reader = require('geojson-writer').reader
const writer = require('geojson-writer').writer
const turf = require('@turf/turf')
const ruler = require('cheap-ruler')(45.34, 'meters')
const rbush = require('rbush')

const tree = {
  sidewalks: rbush(),
  roads: rbush()
}

roadsWithSidewalks = [];
roadsWithoutSidewalks = [];

const inPedDataPath = "data/ottawa_urban_sidewalks.json"
const inRoadDataPath = "data/ottawa_urban_roads.json"
const outRoadsWithSidewalksPath = "data/ottawa_urban_roads_with_sidewalks.json"
const outRoadsWithoutSidewalksPath = "data/ottawa_urban_roads_without_sidewalks.json"

const kOffsetFromRoadEnd = 5   //disregard kRoadTestStep meters from road end
const kRoadTestStep = 5        //test points with kRoadTestStep meters staticBasePath
const kPointDistanceNearby = 18 //if there is a sidewalk within kPointDistanceNearby meters - point has sidewalk
const kPointsWithSidewalksThreshold = 0.80 //kPointsWithSidewalksThreshold of road points have sidewalk nearby -> road has sidewalk
console.time('Time')
console.log('Loading sidewalks ...')
let footways = reader(inPedDataPath).features
let i=0;
while(i<footways.length){
  const bbox = turf.bbox(footways[i])
  if (footways[i].properties.WALK_TYPE == "SIDEWALK" && 
      (footways[i].geometry.type=='LineString' || footways[i].geometry.type=='MultiLineString')) {  //could also be multilinestring
    tree.sidewalks.insert({
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
      feature: footways[i]
    })
    i++;
  }
  else {
    footways.splice(i,1)  //throw away all footways that are not sidewalks
  }
}

console.log('Loading roads ...')

let roads = reader(inRoadDataPath).features
i=0;
while(i<roads.length){
  if (roads[i].geometry.type=='LineString' &&
      (roads[i].properties.type == "trunk" || 
      roads[i].properties.type == "secondary" || 
      roads[i].properties.type == "residential" || 
      roads[i].properties.type == "service" || 
      roads[i].properties.type == "tertiary" ||
      roads[i].properties.type == "unclassified" )) {
    /*
      const bbox = turf.bbox(roads[i])
      tree.roads.insert({   //no use in tree for now
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
      feature: roads[i]
    })*/
    i++
  }
  else {
    roads.splice(i,1)   //throw away all ways that can't have sidewalks
  }
}

console.log('Loaded', footways.length,'sidewalks and', roads.length,'roads')
//console.log('Footways:', tree.sidewalks.all.length, ' Roads:', tree.roads.all.length)
let totalRoadsWithSidewalk=0;

for (let road of roads) {
  const roadlen = ruler.lineDistance(road.geometry.coordinates)
  let offset = kOffsetFromRoadEnd;  
  let foundSidewalk=false
  let pointsTotal=0;
  let pointsWithSidewalk=0;
  while(pointsTotal==0 || offset<roadlen-kOffsetFromRoadEnd){    
    pointsTotal++;
    const pt = ruler.along(road.geometry.coordinates, offset)
    const bbox = turf.bbox(road)
    let nearby = tree.sidewalks.search({
      minX: bbox[0]-0.0005,
      minY: bbox[1]-0.0005,
      maxX: bbox[2]+0.0005,
      maxY: bbox[3]+0.0005
    })
    loop1:
    for(let footway of nearby) {      
      if(footway.feature.geometry.type=="MultiLineString")
      {
        for(let coords of footway.feature.geometry.coordinates) {
          if(isSidewalkCloseEnough(coords, pt)) {
            pointsWithSidewalk++;
            break loop1;
          }
        }
      }
      else {
        if(isSidewalkCloseEnough(footway.feature.geometry.coordinates, pt)) {
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
  if(pointsWithSidewalk>=pointsTotal*kPointsWithSidewalksThreshold){  //kPointsWithSidewalksThreshold of points have sidewalk nearby -> good
    totalRoadsWithSidewalk++
    //console.log(road.properties.name, 'has a sidewalk - ',roadlen,'meters long')
    roadsWithSidewalks.push(road);
  }
  else {
    roadsWithoutSidewalks.push(road)
  }
}

function isSidewalkCloseEnough(line, pt)
{
  const proj = ruler.pointOnLine(line, pt).point;
  const dist = ruler.distance(proj,pt);
  if(dist < kPointDistanceNearby){
    return true;
  }  
  return false;
}

writer(outRoadsWithSidewalksPath, turf.featureCollection(roadsWithSidewalks))
writer(outRoadsWithoutSidewalksPath, turf.featureCollection(roadsWithoutSidewalks))

console.log('Matched sidewalks for', totalRoadsWithSidewalk, '/', roads.length, 'roads')
console.timeEnd('Time')


//now start server and serve map.html
var path = require('path');  
var http = require('http');
var fs = require('fs');

var staticBasePath = '.';

var staticServe = function(req, res) {  
    var fileLoc = path.resolve(staticBasePath);
    if(req.url=='' || req.url=='/'){req.url='/index.html';}
    fileLoc = path.join(fileLoc, req.url);
    try{      
      data = fs.readFileSync(fileLoc);
      res.statusCode = 200;
      res.write(data);
    }
    catch(err){
      res.writeHead(404, 'Not Found');
      res.write('404: File Not Found!');
    }
    
    return res.end();
};

console.log('Open map in browser: http://localhost:8080')
var httpServer = http.createServer(staticServe);
httpServer.listen(8080);  
