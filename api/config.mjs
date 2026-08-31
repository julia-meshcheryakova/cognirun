export default function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.status(200).json({ elevenLabs: Boolean(process.env.ELEVENLABS_API_KEY) });
}
