export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI Mentor is not configured yet. Missing OPENROUTER_API_KEY on the server.' });
  }

  try {
    const { systemPrompt, messages } = req.body || {};
    if (!systemPrompt || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    const payload = {
      model: 'openrouter/free',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    };

    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://rtrade-xworld.vercel.app',
        'X-Title': 'RTrade AI Mentor',
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('OpenRouter error:', upstream.status, errText);
      return res.status(502).json({ error: `AI Mentor is temporarily unavailable (${upstream.status}). Try the statistical Coach instead.` });
    }

    const data = await upstream.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(502).json({ error: 'AI Mentor returned an empty response. Please try again.' });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Mentor function error:', err);
    return res.status(500).json({ error: 'Something went wrong reaching the AI Mentor.' });
  }
  }
