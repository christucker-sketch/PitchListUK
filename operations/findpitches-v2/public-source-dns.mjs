import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Static deny list; public IPv4 must remain fetchable. Node's BlockList already
// maps IPv4 subnet checks onto IPv4-mapped IPv6 addresses; explicitly adding
// ::ffff:0:0/96 blocks EVERY IPv4 address, public as well as private.
const blocked = new BlockList();
for (const [network,bits] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],
  ['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]
]) blocked.addSubnet(network,bits,'ipv4');
for (const [network,bits] of [
  ['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]
]) blocked.addSubnet(network,bits,'ipv6');

export function isSafeResolvedAddress(address,family) {
  const protocol=family===4?'ipv4':family===6?'ipv6':null;
  return protocol!=null && isIP(address)===family && !blocked.check(address,protocol);
}

export async function assertPublicDns(url,{resolve=lookup}={}) {
  const host=new URL(url).hostname;
  if(isIP(host)) throw new Error('literal_ip_not_allowed');
  const addresses=await resolve(host,{all:true,verbatim:true});
  if(!Array.isArray(addresses)||!addresses.length||
     addresses.some(a=>!isSafeResolvedAddress(a.address,a.family))) {
    throw new Error('private_or_unknown_dns_rejected');
  }
}

// Preflight is defense in depth, not DNS-pinned egress. A production bulk
// fetch service still needs network policy to defeat DNS rebinding.
