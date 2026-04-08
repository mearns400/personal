module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { nodeId, messages } = req.body;

  if (!nodeId || !messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'nodeId and messages are required' });
  }

  // Fetch node context from Supabase (public read, use service key)
  let nodeContext = '';
  let nodeName = nodeId;
  try {
    const nodeUrl = `${process.env.SUPABASE_URL}/rest/v1/nodes?id=eq.${encodeURIComponent(nodeId)}&select=label,sub,ai_summary,is_locked`;
    const nodeRes = await fetch(nodeUrl, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });
    if (nodeRes.ok) {
      const nodes = await nodeRes.json();
      if (nodes.length > 0) {
        const n = nodes[0];
        nodeName = n.label || nodeId;
        nodeContext = n.ai_summary
          ? n.ai_summary
          : `${n.label}${n.sub ? ' — ' + n.sub : ''}`;
      }
    }
  } catch (e) {
    // If Supabase fetch fails, proceed without extra context
  }

  const systemPrompt = `You are the AI on Andrew Mearns's personal portfolio website. Think of yourself as Andrew's sharp, curious representative — not a chatbot, not a FAQ bot.

About Andrew: former enterprise sales pro turned AI engineer and consultant. Based in Charlottesville, VA. UVA alum (philosophy, politics, law). Endurance athlete. He thinks like a seller: understand the customer's pain first, then position the solution.

Your job right now: have a real conversation about the specific thing the visitor clicked on. Be genuinely curious about them. Ask what they're building, what problem they're trying to solve, what brought them to this corner of the site. When the moment feels right — not forced — suggest they reach out directly: mearns400@gmail.com.

Tone rules:
- Casual, punchy. Short answers. Not padded.
- Ask one good follow-up question per response max.
- Never say "Great question!" or similar filler.
- Third person when referring to Andrew (e.g. "he built that to..." not "I built that to...")
- If a visitor seems like a legit hiring or consulting lead, lean into it naturally.

Current topic (what the visitor clicked on):
${nodeContext || nodeName}`;

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
        max_tokens: 400,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Anthropic error: ${err}` });
    }

    const data = await response.json();
    return res.status(200).json({ message: data.content[0].text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
