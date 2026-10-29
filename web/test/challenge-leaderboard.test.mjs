import assert from 'node:assert/strict';
import test from 'node:test';

import { loadChallengeLeaderboard } from '../src/challenges/leaderboard.js';

function fakeAuth(client) {
  return { init: async () => {}, client: () => client };
}

test('local-only: no client means no leaderboard', async () => {
  assert.equal(await loadChallengeLeaderboard(fakeAuth(null), '2026-W44-3k'), null);
});

test('maps RPC rows to the screen shape', async () => {
  let call;
  const client = {
    rpc: async (name, args) => {
      call = { name, args };
      return {
        data: [{ rank: 1, display_name: 'Ann', points: 300, duration_s: 1100, is_me: true }],
        error: null,
      };
    },
  };
  const rows = await loadChallengeLeaderboard(fakeAuth(client), '2026-W44-3k');
  assert.deepEqual(call, {
    name: 'challenge_leaderboard',
    args: { p_challenge_id: '2026-W44-3k', p_limit: 50 },
  });
  assert.deepEqual(rows, [{ displayName: 'Ann', points: 300, durationS: 1100, isMe: true }]);
});

test('RPC errors reject so the screen can fall back', async () => {
  const client = { rpc: async () => ({ data: null, error: new Error('boom') }) };
  await assert.rejects(loadChallengeLeaderboard(fakeAuth(client), 'x'), /boom/);
});
