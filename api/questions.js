import { QUESTION_LIBRARY as lib } from '../question-server/questions.js';

export default function handler(req, res) {
  const cat = req.query?.category;
  const out = cat ? { ...lib, questions: lib.questions.filter((q) => q.category === cat) } : lib;
  res.setHeader('access-control-allow-origin', '*');
  res.status(200).json(out);
}
