import { QUESTION_LIBRARY as lib } from '../question-server/questions.js';

export default function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.status(200).json({
    ok: true,
    questions: lib.questions.length,
    eleven: Boolean(process.env.ELEVENLABS_API_KEY),
  });
}
