const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kfriqckayjehbigvrnys.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_qe872JZtouSldyBjzwjR6Q_NpGaTyyq';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_REQUEST_LENGTH = 1_500_000;

const taskInstructions = {
  'write-description': 'Schreibe eine kurze Verkaufsbeschreibung mit 3 bis 5 präzisen Stichpunkten auf Deutsch. Jeder Stichpunkt muss konkret zu diesem Gegenstand passen. Verwende ausschließlich Angaben aus Produktname, vorhandener Beschreibung oder eindeutig sichtbare Merkmale des beigefügten Produktbilds. Erfinde keine Marke, Ausführung, Funktion, technische Daten, Maße oder Zustandsangaben. Keine Überschrift, keine Einleitung und keine allgemeinen Werbesätze.',
  'improve-description': 'Überarbeite die vorhandene Beschreibung zu 3 bis 5 kurzen, präzisen Stichpunkten auf Deutsch. Bewahre alle gesicherten produktspezifischen Angaben und entferne Wiederholungen sowie allgemeine Werbesätze. Ergänze nur Merkmale, die auf dem beigefügten Produktbild eindeutig erkennbar sind. Erfinde keine Marke, Ausführung, Funktion, technische Daten, Maße oder Zustandsangaben. Keine Überschrift und keine Einleitung.',
  'price-recommendation': 'Gib eine realistische Preisempfehlung in Euro. Die erste Zeile muss exakt das Format PREIS_EUR: 1250,00 verwenden, ohne Tausendertrennzeichen. Begründe die Einschätzung danach kurz, nenne bei Unsicherheit zusätzlich eine Preisspanne und stelle klar, dass es nur eine Schätzung ist.',
  custom: 'Beantworte die eigene Frage konkret auf Grundlage der Produktdaten. Wenn Informationen fehlen, sage das offen und erfinde nichts.'
};

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function authenticate(req) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: authorization } });
  if (!response.ok) return null;
  return response.json();
}

async function imageContent(imageUrl) {
  if (!imageUrl) return null;
  try {
    let mediaType = '';
    let base64 = '';
    if (imageUrl.startsWith('data:image/')) {
      const match = imageUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (!match) return null;
      mediaType = match[1]; base64 = match[2];
    } else {
      const candidate = new URL(imageUrl);
      const allowed = new URL(SUPABASE_URL);
      if (candidate.origin !== allowed.origin) return null;
      const response = await fetch(candidate);
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > 5 * 1024 * 1024) return null;
      mediaType = contentType.split(';')[0]; base64 = buffer.toString('base64');
    }
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });
  if (!process.env.ANTHROPIC_API_KEY) return sendJson(res, 500, { error: 'ANTHROPIC_API_KEY ist in Vercel noch nicht hinterlegt.' });

  const user = await authenticate(req);
  if (!user) return sendJson(res, 401, { error: 'Bitte melde dich an, bevor du die KI verwendest.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  if (JSON.stringify(body).length > MAX_REQUEST_LENGTH) return sendJson(res, 413, { error: 'Die Anfrage ist zu groß.' });
  const task = typeof body.task === 'string' ? body.task : '';
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  const product = body.product && typeof body.product === 'object' ? body.product : {};
  if (!taskInstructions[task]) return sendJson(res, 400, { error: 'Unbekannte KI-Aufgabe.' });
  if (task === 'custom' && !question) return sendJson(res, 400, { error: 'Bitte stelle eine konkrete Frage.' });
  if (!String(product.name || '').trim()) return sendJson(res, 400, { error: 'Für die KI fehlt der Produktname.' });

  const productContext = [
    `Name: ${String(product.name).slice(0, 120)}`,
    `Preis: ${Number(product.price || 0).toFixed(2)} EUR`,
    `Beschreibung: ${String(product.description || 'Keine Beschreibung vorhanden.').slice(0, 1500)}`,
    `Bild hinterlegt: ${product.imageAvailable ? 'Ja' : 'Nein'}`
  ].join('\n');
  const prompt = [
    'Produktdaten:', productContext, '',
    `Aufgabe: ${taskInstructions[task]}`,
    task === 'custom' ? `Eigene Frage: ${question}` : ''
  ].filter(Boolean).join('\n');

  try {
    const content = [{ type: 'text', text: prompt }];
    const productImage = await imageContent(typeof product.imageUrl === 'string' ? product.imageUrl : '');
    if (productImage) content.unshift(productImage);
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: 'Du bist ein sachlicher Verkaufsassistent für eine private Verkaufsübersicht. Antworte auf Deutsch und beziehe dich ausschließlich auf den konkret übergebenen Gegenstand. Vermeide austauschbare Standardtexte und unbelegte Werbeaussagen. Nenne nur Informationen, die in den Produktdaten stehen oder auf dem beigefügten Bild eindeutig erkennbar sind. Erfinde keine Produktmerkmale, Zustände oder Marktpreise.',
        messages: [{ role: 'user', content }]
      })
    });
    const data = await response.json();
    if (!response.ok) return sendJson(res, response.status >= 500 ? 502 : response.status, { error: data?.error?.message || 'Anthropic konnte die Anfrage nicht verarbeiten.' });
    let text = (data.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
    if (!text) return sendJson(res, 502, { error: 'Die KI hat keine Textantwort geliefert.' });
    let recommendedPrice = null;
    if (task === 'price-recommendation') {
      const priceMatch = text.match(/PREIS_EUR\s*:\s*([0-9]+(?:[.,][0-9]{1,2})?)/i);
      if (priceMatch) {
        recommendedPrice = Number(priceMatch[1].replace(',', '.'));
        text = text.replace(/^.*PREIS_EUR\s*:[^\n]*(?:\n|$)/im, '').trim();
      }
    }
    return sendJson(res, 200, { text, recommendedPrice, model: MODEL });
  } catch (error) {
    return sendJson(res, 502, { error: error.message || 'Die KI ist momentan nicht erreichbar.' });
  }
};
