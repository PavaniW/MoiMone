import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetSpace } from '../lib/scope.js';

// A stand-in request: the user belongs to their personal space plus one shared space.
function fakeReq() {
  return { personalSpaceId: 'personal-1', spaceIds: ['personal-1', 'shared-2'] };
}

test('targetSpace defaults to the personal space when none is requested', () => {
  assert.equal(targetSpace(fakeReq()), 'personal-1');
});

test('targetSpace allows a space the user is a member of', () => {
  assert.equal(targetSpace(fakeReq(), 'shared-2'), 'shared-2');
});

test('targetSpace rejects a space the user does not belong to (no cross-tenant writes)', () => {
  assert.throws(
    () => targetSpace(fakeReq(), 'someone-elses-space'),
    (err) => err.status === 400
  );
});
