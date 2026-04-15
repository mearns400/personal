// POST /api/generate
// Generates display content for one or all matrix cells.
// Reads entries from Supabase, calls Claude, writes back to matrix_cells.
//
// Body options:
//   {}                     → regenerate all 12 cells
//   { col, row }           → regenerate one specific cell
//
// Requires Authorization: Bearer <ADMIN_SECRET>

const COLS = ['work', 'run', 'ai'];
const ROWS = ['experience', 'leadership', 'technology', 'accomplishments'];

const COL_CONTEXT = {
  work: 'professional career — enterprise sales, consulting, business, building products',
  run:  'running and endurance sports — training, racing, coaching, fitness',
  ai:   'artificial intelligence — building AI products, LLMs, agents, automation, prompt engineering'
};

const ROW_CONTEXT = {
  experience:      'background and history — roles held, what he has done and where',
  leadership:      'leading people, strategy, influence, coaching, setting direction',
  technology:      'tools, tech stacks, platforms, technical skills and methods',
  accomplishments: 'results, wins, achievements, measurable outcomes, milestones'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Auth
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token || token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'Supabase env vars not set' });
  }

  // Determine which cells to generate
  const { col, row } = req.body || {};
  let cells = [];

  if (col && row) {
    if (!COLS.includes(col) || !ROWS.includes(row)) {
      return res.status(400).json({ error: 'Invalid col or row value' });
    }
    cells = [{ col, row }];
  } else {
    cells = COLS.flatMap(c => ROWS.map(r => ({ col: c, row: r })));
  }

  const results = [];

  for (const cell of cells) {
    try {
      // 1. Fetch all entries tagged to this cell (via embedded relation)
      const tagRes = await fetch(
        `${SUPA_URL}/rest/v1/entry_cell_tags?col=eq.${cell.col}&row=eq.${cell.row}&select=entries(content)`,
        {
          headers: {
            'apikey': SUPA_KEY,
            'Authorization': `Bearer ${SUPA_KEY}`
          }
        }
      );

      if (!tagRes.ok) {
        results.push({ ...cell, status: 'error', error: await tagRes.text() });
        continue;
      }

      const tagData = await tagRes.json();
      const contents = tagData
        .map(t => t.entries?.content)
        .filter(Boolean);

      // Skip generation if no entries — leave existing content intact
      if (contents.length === 0) {
        results.push({ ...cell, status: 'skipped', reason: 'no entries' });
        continue;
      }

      // 2. Call Claude to generate display content
      const generated = await generateCellContent(cell.col, cell.row, contents);
      if (!generated) {
        results.push({ ...cell, status: 'error', error: 'Claude returned nothing' });
        continue;
      }

      // 3. Write back to matrix_cells
      const updateRes = await fetch(
        `${SUPA_URL}/rest/v1/matrix_cells?col=eq.${cell.col}&row=eq.${cell.row}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPA_KEY,
            'Authorization': `Bearer ${SUPA_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            display_title:   generated.display_title,
            display_bullets: generated.display_bullets,
            last_generated_at: new Date().toISOString()
          })
        }
      );

      if (!updateRes.ok) {
        results.push({ ...cell, status: 'error', error: await updateRes.text() });
        continue;
      }

      results.push({ ...cell, status: 'ok', generated });

    } catch (err) {
      results.push({ ...cell, status: 'error', error: err.message });
    }
  }

  const ok    = results.filter(r => r.status === 'ok').length;
  const skip  = results.filter(r => r.status === 'skipped').length;
  const fails = results.filter(r => r.status === 'error').length;

  return res.status(200).json({ ok, skipped: skip, failed: fails, results });
};


async function generateCellContent(col, row, entries) {
  const entriesList = entries.map((e, i) => `${i + 1}. ${e}`).join('\n');

  const prompt = `You are writing display content for a section of Andrew Mearns's personal portfolio website.

The section is: ${col.toUpperCase()} × ${row.toUpperCase()}
- Column context (${col}): ${COL_CONTEXT[col]}
- Row context (${row}): ${ROW_CONTEXT[row]}

Andrew is a former enterprise sales professional turned AI engineer and builder. He also runs — marathons, trails, endurance events. His voice is direct, lowercase, no fluff.

Here are the raw entries tagged to this cell:
${entriesList}

Generate:
1. A display_title: a short, punchy lowercase phrase (5–8 words) that captures the essence of this cell. No punctuation at the end. Make it feel like a thought, not a heading.
2. display_bullets: exactly 3 concise lowercase bullet points drawn from the entries. Each should be 1 short sentence. No bullet symbols — just the text. Specific is better than general.

Return ONLY valid JSON, nothing else:
{
  "display_title": "...",
  "display_bullets": ["...", "...", "..."]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) return null;

  const data = await response.json();
  const raw = data.content[0].text.trim()
    .replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.display_title || !Array.isArray(parsed.display_bullets)) return null;
    return parsed;
  } catch {
    return null;
  }
}
