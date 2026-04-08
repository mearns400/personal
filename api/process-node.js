module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { rawContent, parentLabel, adminSecret } = req.body;

  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!rawContent || rawContent.trim().length < 5) {
    return res.status(400).json({ error: 'Need more content to work with' });
  }

  const prompt = `You parse raw personal/professional notes into structured portfolio website data.

RAW NOTES:
${rawContent}

PARENT CONTEXT: ${parentLabel || 'top level of portfolio site'}

Return ONLY valid JSON (no markdown, no explanation) with these exact fields:
{
  "label": "2-4 word node title, all lowercase, punchy",
  "sub": "subtitle max 8 words — lead with a metric if one exists (e.g. '$1.2m arr', '60% faster')",
  "type": "branch or job or leaf — branch=major life category, job=role/company/project, leaf=specific achievement/detail",
  "suggested_id": "kebab-case unique id e.g. dynamo-rag-pipeline",
  "ai_summary": "3-5 sentences a chatbot uses to discuss this with site visitors. Written in third person about Andrew. Casual but credible. Subtly sells his value without being sycophantic. Ends with one question that invites the visitor to share their situation.",
  "suggested_children": [
    { "label": "...", "sub": "...", "type": "leaf", "suggested_id": "..." }
  ]
}

Only include suggested_children if the raw content clearly has multiple distinct sub-topics worth their own nodes. Otherwise return an empty array.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Anthropic error: ${err}` });
    }

    const data = await response.json();
    let text = data.content[0].text.trim();

    // Strip markdown fences if model wraps in them
    text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
