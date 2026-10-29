import test from 'node:test';
import assert from 'node:assert/strict';
import { seedRequests } from './domain.ts';
import { requestIdentity } from './request-identity.ts';

test('named request bylines use the current username', () => {
  const request = seedRequests.find(row => row.authorId === 'maria')!;
  assert.deepEqual(requestIdentity(request,{maria:'maria-new'},'Grace Church'),{name:'Maria',username:'maria-new',organization:undefined});
});
test('anonymous bylines never reveal an account handle', () => {
  const request = {...seedRequests[0],anonymous:true};
  const identity = requestIdentity(request,{[request.authorId]:'private-handle'},'Grace Church');
  assert.equal(identity.username,undefined);
  assert.equal(JSON.stringify(identity).includes('private-handle'),false);
  assert.notEqual(identity.name,request.authorName);
});
test('only the actual group delivery names its organization; personal copies do not inherit affiliation', () => {
  const request = seedRequests.find(row => row.authorId === 'elena')!;
  assert.equal(requestIdentity({...request,recipient:'grace'},{elena:'elena'},'Grace Church').organization,'Grace Church');
  assert.equal(requestIdentity({...request,recipient:'maria'},{elena:'elena'},'Grace Church').organization,undefined);
});
test('unknown account identifiers do not become invented usernames', () => {
  assert.equal(requestIdentity({...seedRequests[0],authorId:'unknown-uuid'},{}).username,undefined);
});
