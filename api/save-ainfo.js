module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { table, record, adminSecret } = req.body;

  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ALLOWED_TABLES = ['ainfo_company', 'ainfo_role', 'ainfo_accomplishments', 'ainfo_personal'];
  if (!ALLOWED_TABLES.includes(table)) {
    return res.status(400).json({ error: `Invalid table: ${table}` });
  }
  if (!record || !record.start_date) {
    return res.status(400).json({ error: 'start_date is required' });
  }

  // ─── 1. Build AI prompt based on table type ───────────────────────────────
  function buildPrompt(table, record) {
    let context = '';
    if (table === 'ainfo_company') {
      context = `Company: ${record.company_name}\nDates: ${record.start_date} → ${record.end_date || 'present'}\nDescription: ${record.description || ''}`;
    } else if (table === 'ainfo_role') {
      context = `Title: ${record.title}\nDates: ${record.start_date} → ${record.end_date || 'present'}\nResponsibilities: ${record.responsibilities || ''}`;
    } else if (table === 'ainfo_accomplishments') {
      context = `Dates: ${record.start_date} → ${record.end_date || record.start_date}\nAccomplishment: ${record.description}`;
    } else if (table === 'ainfo_personal') {
      context = `Dates: ${record.start_date} → ${record.end_date || record.start_date}\nDescription: ${record.description}`;
    }

    return `You generate punchy portfolio labels and chat summaries for Andrew Mearns (AI engineer, former enterprise sales).

RECORD TYPE: ${table.replace('ainfo_', '')}
${context}

Return ONLY valid JSON (no markdown, no explanation):
{
  "ai_title": "3-6 word punchy title, all lowercase — lead with impact if there's a metric",
  "ai_summary": "2-4 sentences written in third person about Andrew. Casual but credible. Subtly sells his value. Ends with a question that invites the visitor to share their own situation."
}`;
  }

  // ─── 2. Call Anthropic ────────────────────────────────────────────────────
  let ai_title = null;
  let ai_summary = null;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: buildPrompt(table, record) }]
      })
    });

    if (aiRes.ok) {
      const aiData = await aiRes.json();
      let text = aiData.content[0].text.trim();
      text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(text);
      ai_title   = parsed.ai_title   || null;
      ai_summary = parsed.ai_summary || null;
    }
  } catch (e) {
    // AI failure is non-fatal — record still saves, ai fields stay null
    console.error('AI generation failed:', e.message);
  }

  // ─── 3. Insert into Supabase ─────────────────────────────────────────────
  const payload = { ...record, ai_title, ai_summary };
  // Remove id if empty (let Supabase generate uuid)
  if (!payload.id) delete payload.id;

  const sbRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/${table}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!sbRes.ok) {
    const err = await sbRes.text();
    return res.status(500).json({ error: `Supabase error: ${err}` });
  }

  const saved = await sbRes.json();
  return res.status(200).json({ success: true, record: Array.isArray(saved) ? saved[0] : saved });
};
