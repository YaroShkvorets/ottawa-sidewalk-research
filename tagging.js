const reader = require('geojson-writer').reader
const xmldom = require('xmldom').DOMParser
var XMLSerializer = require('xmldom').XMLSerializer;
const fs = require('fs');


const inTaggedRoadsFiles = ["data/roads_with_both_sidewalks.json", "data/roads_with_left_sidewalks.json", "data/roads_with_right_sidewalks.json", "data/roads_without_sidewalks.json"]

const inOsmSource = "osm/ottawa_all_roads.osm"
const outOsmSource = "osm/ottawa_all_roads_with_sidewalks.osm"

const serializer = new XMLSerializer();
const road_sidewalk_tags = {}
let totalTagged = 0

console.time('Time')
console.log('Loading tagged roads ...')
for(let i in inTaggedRoadsFiles){
  let tagged_roads = reader(inTaggedRoadsFiles[i])
  for(let feature of tagged_roads.features) {
    if(feature.properties.sidewalk){
      road_sidewalk_tags[feature.properties.osm_id] = feature.properties.sidewalk
    }
  }
}

fs.readFile(inOsmSource, 'utf-8', function (err, data) {
  if (err) {
    throw err;
  }

  const doc = new xmldom().parseFromString(data, 'application/xml');
  const ways = doc.getElementsByTagName('way');
  for (let i in ways) {
    let way = ways[i]
    for(let j in way.attributes){
      let attr = way.attributes[j]
      if (attr.name=='id') {
        const id = attr.value;
        const sidewalk_tag = road_sidewalk_tags[id];
        if(sidewalk_tag){
          let replaced = false
          for(let k in way.childNodes){
            let node = way.childNodes[k]
            if(!node.attributes){continue}
            let attr = node.attributes[0]
            if (node.attributes[0].name=='k' && node.attributes[0].value=='sidewalk') {
              replaced = true
              if(node.attributes[1].value!=sidewalk_tag){
                way.setAttribute('action', 'modify');
                node.setAttribute('v', sidewalk_tag)
                console.log('For way id#', id, 'changed sidewalk tag to', sidewalk_tag)
                totalTagged++
              }
            }

          }
          if(!replaced){
            tag = doc.createElement("tag");
            tag.setAttribute('k', 'sidewalk')
            tag.setAttribute('v', sidewalk_tag);
            way.appendChild(tag)
            way.setAttribute('action', 'modify');
            console.log('For way id#', id, 'created sidewalk tag with', sidewalk_tag)
            totalTagged++
          }
          //console.log('Modified way id#', id, 'sidewalk tag to', sidewalk_tag)
        }

      }
    }
  }
console.log("Saved! Total tagged roads:", totalTagged);/*
  fs.writeFile(outOsmSource, serializer.serializeToString(doc), function(err) {
    if(err) {
        return console.log(err);
    }
    
  });*/
});




console.timeEnd('Time')
