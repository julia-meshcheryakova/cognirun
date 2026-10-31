import { judgeRequest } from '../question-server/llmJudge.js';
import { guard, clientIp } from '../question-server/apiGuard.js';

export default async function handler(req, res) {
  const check = guard('judge', {
    method: req.method,
    origin: req.headers.origin,
    host: req.headers.host,
    ip: clientIp((name) => req.headers[name]),
    size: req.headers['content-length'],
    extraOrigins: process.env.ALLOWED_ORIGINS,
  });
  for (const [k, v] of Object.entries(check.headers)) res.setHeader(k, v);
  if (!check.ok) return check.body ? res.status(check.status).json(check.body) : res.status(check.status).end();
  const { status, body } = await judgeRequest(req.body ?? {});
  res.status(status).json(body);
}
