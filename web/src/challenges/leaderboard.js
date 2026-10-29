/**
 * Challenge leaderboard from the `challenge_leaderboard` RPC (see
 * supabase/migrations). Resolves to null when the app is local-only, so the
 * Challenges screen falls back to the runner's own attempts.
 */
export async function loadChallengeLeaderboard(auth, challengeId, { limit = 50 } = {}) {
  await auth.init();
  const client = auth.client();
  if (!client) return null;
  const { data, error } = await client.rpc('challenge_leaderboard', {
    p_challenge_id: challengeId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    displayName: row.display_name,
    points: row.points,
    durationS: row.duration_s,
    isMe: Boolean(row.is_me),
  }));
}
