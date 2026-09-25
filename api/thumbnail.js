const sharp = require('sharp');
const STORAGE_ORIGIN = new URL(process.env.SUPABASE_URL || 'https://kfriqckayjehbigvrnys.supabase.co').origin;
const MAX_BYTES = 6 * 1024 * 1024;

// The signed storage URL is the access credential. Never accept arbitrary hosts,
// public storage URLs, redirects, or paths outside our private image bucket.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).end();
  let source;
  try {
    if (typeof req.query.image !== 'string' || req.query.image.length > 4096) throw new Error();
    source = new URL(req.query.image);
    if (source.origin !== STORAGE_ORIGIN || source.username || source.password ||
        !source.pathname.startsWith('/storage/v1/object/sign/selling-images/') ||
        !source.searchParams.get('token')) throw new Error();
  } catch { return res.status(400).end(); }

  try {
    const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok) return res.status(404).end();
    if (!response.headers.get('content-type')?.startsWith('image/') || Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      return res.status(413).end();
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > MAX_BYTES) throw new Error('Image too large');
      chunks.push(chunk);
    }
    const thumbnail = await sharp(Buffer.concat(chunks), { limitInputPixels: 64_000_000 })
      .rotate().resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72, effort: 2 }).toBuffer();
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Browser-only caching: private photos must never enter a shared CDN cache.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).send(thumbnail);
  } catch { return res.status(502).end(); }
};
