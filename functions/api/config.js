// Cloudflare Pages Function: GET /api/config. Mirrors api/config.mjs.
export function onRequest({ env }) {
  return Response.json(
    { elevenLabs: Boolean(env.ELEVENLABS_API_KEY) },
    { headers: { 'access-control-allow-origin': '*' } },
  );
}
