export function archiveBucket() {
  const objects=new Map();
  return {objects,async get(key){const bytes=objects.get(key);return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;},async put(key,data){if(objects.has(key))return null;objects.set(key,new Uint8Array(data));return {};}};
}
