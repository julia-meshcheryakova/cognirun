/**
 * Weekly challenges. Placeholder owned by the Weekly challenges thread.
 * It receives `startRun({ course, challengeId, questionIds })` to launch a run
 * on a fixed question set.
 */
export function renderChallenges(root) {
  root.innerHTML = `
    <main class="screen">
      <h1>Challenges</h1>
      <p class="lede">Weekly challenges in 3K, 5K and 10K are coming soon.</p>
    </main>`;
}
