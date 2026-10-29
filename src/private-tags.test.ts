import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPrivateTags, normalizeTag, requestMatchesSearch, savePrivateTags, tagTone } from './private-tags.ts';
import { seedRequests } from './domain.ts';

test('tags normalize hashtags and repeated whitespace without markup or links', () => {
  assert.equal(normalizeTag(' #Financial  Help '),'financial help');
  assert.equal(normalizeTag('Ｆａｍｉｌｙ'),'family');
  for (const invalid of ['', '<script>', 'https://test.org', 'x'.repeat(33)]) assert.throws(()=>normalizeTag(invalid));
});
test('personal tags are separate from prayer deliveries and remembered in a private catalog', () => {
  const state=emptyPrivateTags();
  const request=structuredClone(seedRequests[0]);
  const before=JSON.stringify(request);
  const saved=savePrivateTags(state,request.sourceId,[{label:'#Financial',tone:'sky'}]);
  assert.equal(JSON.stringify(request),before);
  assert.deepEqual(state,emptyPrivateTags());
  assert.deepEqual(saved.catalog,[{label:'financial',tone:'sky'}]);
  const cleared=savePrivateTags(saved,request.sourceId,[]);
  assert.equal(cleared.requests[request.sourceId].length,0);
  assert.equal(cleared.catalog[0].label,'financial');
  assert.deepEqual(emptyPrivateTags().catalog,[]);
});
test('tags deduplicate by normalized name, retain gradients, and enforce bounds', () => {
  const saved=savePrivateTags(emptyPrivateTags(),'source',[{label:'Family',tone:'rose'},{label:'#family',tone:'sage'}]);
  assert.deepEqual(saved.requests.source,[{label:'family',tone:'sage'}]);
  assert.throws(()=>savePrivateTags(saved,'source',Array.from({length:9},(_,i)=>({label:`tag ${i}`,tone:'sky'}))));
  assert.equal(tagTone('health'),'sage');
  assert.equal(tagTone('custom topic'),tagTone('custom topic'));
});
test('own request search supports private hashtag search and ordinary text independently', () => {
  const request=seedRequests[0],tags=[{label:'financial',tone:'sky' as const}];
  assert.equal(requestMatchesSearch(request,'#finance',tags),false);
  assert.equal(requestMatchesSearch(request,'#financial',tags),true);
  assert.equal(requestMatchesSearch(request,'financial',tags),true);
  assert.equal(requestMatchesSearch(request,'#financial',[]),false);
  assert.equal(requestMatchesSearch(request,request.topic,[]),true);
  assert.equal(requestMatchesSearch(request,`#${request.topic}`,[]),false);
});
