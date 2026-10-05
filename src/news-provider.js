/**
 * Keyless live news adapter. GDELT's public DOC API indexes reporting from
 * publishers worldwide; article text remains with the original publishers.
 * Its wildcard CORS support lets this static site query it directly.
 */
const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const QUERY = '(world OR politics OR business OR technology OR science OR sports OR health OR climate OR Ghana OR Africa)';

export const NEWS_CONFIG = Object.freeze({
  endpoint: (window.TRENDZ_NEWS_API_URL || import.meta.env?.VITE_NEWS_API_URL || GDELT_ENDPOINT).trim(),
  refreshIntervalMs: 60_000,
  mode: 'live',
});

export async function fetchStories() {
  const url = new URL(NEWS_CONFIG.endpoint, window.location.href);
  if (url.origin === 'https://api.gdeltproject.org') {
    url.search = new URLSearchParams({ query: QUERY, mode: 'artlist', format: 'json', maxrecords: '75', timespan: '24h', sort: 'datedesc' });
  }
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`News source returned HTTP ${response.status}`);
  const payload = await response.json();
  const records = Array.isArray(payload) ? payload : payload.articles || payload.stories;
  if (!Array.isArray(records)) throw new Error('The live news source returned an unexpected response.');
  return url.origin === 'https://api.gdeltproject.org'
    ? records.map(normalizeGdeltStory).filter(Boolean)
    : records.map(normalizeProviderStory);
}

function normalizeProviderStory(item) {
  if (!item?.id || !item?.title || !item?.source) throw new Error('Each provider story needs an id, title, and source.');
  return {
    ...item,
    id: clean(item.id), title: clean(item.title), source: clean(item.source),
    articleUrl: safeHttpUrl(item.articleUrl || item.url),
    imageUrl: safeHttpUrl(item.imageUrl),
    imageCreditUrl: safeHttpUrl(item.imageCreditUrl),
    demo: false,
  };
}

function normalizeGdeltStory(item) {
  const title = clean(item.title);
  const articleUrl = safeHttpUrl(item.url);
  if (!title || !articleUrl) return null;
  const host = new URL(articleUrl).hostname.replace(/^www\./, '');
  const country = clean(item.sourcecountry || 'Worldwide');
  const category = inferCategory(title, country);
  const publishedAt = parseGdeltDate(item.seendate);
  return {
    id: articleUrl,
    title,
    category,
    region: inferRegion(country),
    location: country === 'Worldwide' ? 'Worldwide sources' : `${country} publisher`,
    source: clean(item.domain || host),
    articleUrl,
    publishedAt,
    summary: '',
    topics: [category, country].filter(Boolean),
    imageUrl: safeHttpUrl(item.socialimage),
    imageAlt: `Image supplied with reporting from ${clean(item.domain || host)}`,
    imageCredit: clean(item.domain || host),
    imageCreditUrl: articleUrl,
    imageIsIllustrative: false,
    demo: false,
  };
}

function clean(value) { return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim(); }
function safeHttpUrl(value) {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}
function parseGdeltDate(value) {
  const raw = String(value || '');
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  return match ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`).toISOString() : '';
}
function inferCategory(title, country) {
  if (/\bghana\b/i.test(country) || /\bghana|accra|kumasi\b/i.test(title)) return 'Ghana';
  const rules = [
    ['Sports', /sport|football|soccer|cricket|tennis|olympic|nba|fifa|championship|match|league/i],
    ['Technology', /technology|artificial intelligence|\bAI\b|software|cyber|chip|robot|startup/i],
    ['Science', /science|space|NASA|research|study finds|scientist|discovery/i],
    ['Business', /business|market|economy|trade|company|shares|stocks|bank|jobs|inflation/i],
    ['Health', /health|hospital|medical|disease|vaccine|doctor|WHO\b/i],
    ['Climate', /climate|weather|storm|flood|wildfire|heatwave|emissions|renewable/i],
    ['Entertainment', /film|movie|music|celebrity|culture|actor|festival|streaming/i],
    ['Politics', /politic|election|president|government|parliament|minister|vote|congress/i],
    ['Africa', /africa|nigeria|kenya|ghana|south africa|senegal|ethiopia/i],
  ];
  return rules.find(([, pattern]) => pattern.test(title))?.[0] || 'World';
}
function inferRegion(country) {
  const value = country.toLowerCase();
  if (/ghana|nigeria|kenya|africa|egypt|senegal|ethiopia|uganda|tanzania|rwanda|morocco|somalia|sudan|zimbabwe|cameroon|ivory coast/.test(value)) return 'Africa';
  if (/china|india|japan|korea|singapore|australia|new zealand|philippines|indonesia|pakistan|taiwan|thailand|vietnam|asia/.test(value)) return 'Asia Pacific';
  if (/united states|canada|mexico|brazil|argentina|chile|colombia|americas|peru/.test(value)) return 'Americas';
  if (/united kingdom|britain|france|germany|italy|spain|europe|ukraine|russia|netherlands|sweden|poland/.test(value)) return 'Europe';
  if (/israel|palestine|iran|iraq|syria|lebanon|saudi|qatar|yemen|middle east|turkey/.test(value)) return 'Middle East';
  return 'World';
}
