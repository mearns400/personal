// POST /api/import-parse
// Takes a blob of text, returns chunked entries with suggested cell tags.
// No DB writes — preview only.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  const prompt = `You are parsing content for Andrew Mearns's personal portfolio.

The portfolio is organised as a matrix with these columns and rows:

COLUMNS:
- work: professional career — jobs, companies, sales, business, consulting
- run: running and endurance sports — training, races, fitness, coaching
- ai: artificial intelligence — building AI products, prompt engineering, agents, automation, LLMs

ROWS:
- experience: background and history — what he has done, where he has been, roles held
- leadership: leading people, influence, strategy, coaching, setting direction
- technology: tools, tech stacks, platforms, technical skills and methods
- accomplishments: results, wins, achievements, measurable outcomes, milestones

YOUR TASK:
1. Break the provided text into discrete entries. Each entry should be one standalone, meaningful piece of information — typically one bullet point or 1–2 sentences worth. Don't merge unrelated facts.
2. For each entry, identify which matrix cells it belongs to. An entry can belong to multiple cells.
3. Assign a confidence score (0.0–1.0) for each cell tag. Only include tags with confidence >= 0.4.
4. If content is clearly unrelated to any cell, still assign the closest match.

Return ONLY valid JSON — no markdown, no explanation, nothing else:

{
  "entries": [
    {
      "content": "the entry text, preserved as-is or lightly cleaned",
      "tags": [
        { "col": "work", "row": "experience", "confidence": 0.9 }
      ]
    }
  ]
}

Content to parse:
${content.trim()}`;

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
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Anthropic error: ${err}` });
    }

    const data = await response.json();
    const raw = data.content[0].text.trim();

    // Strip markdown code fences if Claude added them anyway
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response as JSON', raw });
    }

    if (!parsed.entries || !Array.isArray(parsed.entries)) {
      return res.status(500).json({ error: 'Unexpected AI response shape', raw });
    }

    return res.status(200).json({ entries: parsed.entries });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
