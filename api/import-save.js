// POST /api/import-save
// Saves confirmed entries + their cell tags to Supabase.
// Requires Authorization: Bearer <ADMIN_SECRET> header.

const VALID_COLS = ['work', 'run', 'ai'];
const VALID_ROWS = ['experience', 'leadership', 'technology', 'accomplishments'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Auth check
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token || token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { entries } = req.body;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'entries array is required' });
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'Supabase env vars not set' });
  }

  const supaHeaders = {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  let saved = 0;
  const errors = [];

  for (const entry of entries) {
    if (!entry.content || !entry.content.trim()) continue;

    // Validate and sanitise tags
    const tags = (entry.tags || []).filter(t =>
      VALID_COLS.includes(t.col) &&
      VALID_ROWS.includes(t.row) &&
      typeof t.confidence === 'number' &&
      t.confidence >= 0 &&
      t.confidence <= 1
    );

    try {
      // 1. Insert the entry
      const entryRes = await fetch(`${SUPA_URL}/rest/v1/entries`, {
        method: 'POST',
        headers: supaHeaders,
        body: JSON.stringify([{
          content: entry.content.trim(),
          source: 'paste'
        }])
      });

      if (!entryRes.ok) {
        const err = await entryRes.text();
        errors.push({ content: entry.content.slice(0, 60), error: err });
        continue;
      }

      const [savedEntry] = await entryRes.json();

      // 2. Insert cell tags (skip if none)
      if (tags.length > 0) {
        const tagRes = await fetch(`${SUPA_URL}/rest/v1/entry_cell_tags`, {
          method: 'POST',
          headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify(tags.map(t => ({
            entry_id: savedEntry.id,
            col: t.col,
            row: t.row,
            confidence: t.confidence
          })))
        });

        if (!tagRes.ok) {
          const err = await tagRes.text();
          errors.push({ content: entry.content.slice(0, 60), error: `tags failed: ${err}` });
          // Entry saved — don't fail the whole thing, just log
        }
      }

      saved++;
    } catch (err) {
      errors.push({ content: entry.content.slice(0, 60), error: err.message });
    }
  }

  return res.status(200).json({ saved, errors: errors.length ? errors : undefined });
};
