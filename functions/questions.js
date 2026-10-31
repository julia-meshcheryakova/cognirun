// Cloudflare Pages Function: GET /questions[?category=]. Mirrors api/questions.mjs.
import { QUESTION_LIBRARY as lib } from '../question-server/questions.js';

export function onRequest({ request }) {
  const cat = new URL(request.url).searchParams.get('category');
  const out = cat ? { ...lib, questions: lib.questions.filter((q) => q.category === cat) } : lib;
  return Response.json(out, { headers: { 'access-control-allow-origin': '*' } });
}
