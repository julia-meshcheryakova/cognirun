import { judgeRequest } from '../question-server/llmJudge.js';

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { status, body } = await judgeRequest(req.body ?? {});
  res.status(status).json(body);
}
