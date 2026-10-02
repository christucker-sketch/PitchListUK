import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeResolvedAddress, assertPublicDns } from '../../operations/findpitches-v2/public-source-dns.mjs';

test('public IPv4 is allowed and private, loopback and metadata addresses are denied',()=>{
  for(const ip of ['1.1.1.1','8.8.8.8','104.16.132.229']) assert.equal(isSafeResolvedAddress(ip,4),true,ip);
  for(const ip of ['127.0.0.1','10.2.3.4','192.168.1.2','169.254.169.254','172.19.0.10'])
    assert.equal(isSafeResolvedAddress(ip,4),false,ip);
});
test('public IPv6 allowed; ULA, link-local, mapped private and unspecified denied',()=>{
  assert.equal(isSafeResolvedAddress('2606:4700:4700::1111',6),true);
  for(const ip of ['::1','::','fc00::1','fe80::2','::ffff:10.2.3.4','::ffff:127.0.0.1'])
    assert.equal(isSafeResolvedAddress(ip,6),false,ip);
  assert.equal(isSafeResolvedAddress('::ffff:8.8.8.8',6),true);
});
test('every DNS result must be public, and numeric hosts never resolve',async()=>{
  const publicLookup=async()=>[{address:'1.1.1.1',family:4},{address:'2606:4700:4700::1111',family:6}];
  await assert.doesNotReject(assertPublicDns('https://public.example.org/event',{resolve:publicLookup}));
  await assert.rejects(assertPublicDns('https://public.example.org/event',{resolve:async()=>[
    {address:'8.8.8.8',family:4},{address:'10.0.0.9',family:4}
  ]}),/private_or_unknown_dns_rejected/);
  await assert.rejects(assertPublicDns('http://127.0.0.1/',{resolve:()=>{throw Error('must not resolve')}}),/literal_ip_not_allowed/);
  await assert.rejects(assertPublicDns('https://public.example.org',{resolve:async()=>[]}),/private_or_unknown_dns_rejected/);
});
