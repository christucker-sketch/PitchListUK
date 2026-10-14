import {geoAlbersUsa} from 'd3-geo';
let projection,key;
export function projectUS(lat,lng,metadata){
 const next=JSON.stringify([metadata.scale,metadata.translate]);if(next!==key){projection=geoAlbersUsa().scale(metadata.scale).translate(metadata.translate);key=next;}
 return projection([lng,lat]);
}
