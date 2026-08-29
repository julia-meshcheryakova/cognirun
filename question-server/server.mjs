import { createServer } from 'node:http';

import { QUESTION_LIBRARY as library } from './questions.js';

const PORT = Number(process.env.PORT ?? 4000);

function payload(category) {
  if (!category) return library;
  return {
    ...library,
    categories: [category],
    questions: library.questions.filter((q) => q.category === category),
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === '/health') return send(200, { ok: true, questions: library.questions.length });
  if (url.pathname !== '/questions') return send(404, { error: 'not found' });

  const category = url.searchParams.get('category');
  if (category && !library.categories.includes(category)) {
    return send(400, { error: `unknown category: ${category}` });
  }
  send(200, payload(category));
});

server.listen(PORT, () => {
  console.log(`question server on http://localhost:${PORT}/questions`);
});
