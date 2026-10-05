import { NEWS_CONFIG, fetchStories } from './news-provider.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { stories: [], status: 'loading', errorMessage: '', category: 'All', region: 'All', query: '', refreshTimer: null, tickerPaused: false };
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function safeMediaUrl(value) {
  if (!value) return '';
  try { const url = new URL(String(value), location.href); return url.protocol === 'https:' || url.origin === location.origin ? url.href : ''; }
  catch { return ''; }
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'TIME UNAVAILABLE';
  const minutes = Math.max(0, Math.floor((Date.now() - date) / 60_000));
  if (minutes < 1) return 'JUST NOW';
  if (minutes < 60) return `${minutes} MIN AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} HR${hours > 1 ? 'S' : ''} AGO`;
  return `${Math.floor(hours / 24)} DAY${hours > 48 ? 'S' : ''} AGO`;
}

function renderStories() {
  const normalizedQuery = state.query.trim().toLocaleLowerCase();
  const results = state.stories.filter(story => {
    const matchesCategory = state.category === 'All' || story.category === state.category || (state.category === 'Africa' && story.region === 'Africa');
    const matchesRegion = state.region === 'All' || story.region === state.region;
    const searchable = [story.title, story.summary, story.category, story.region, story.location, story.source, ...(story.topics || [])].join(' ').toLocaleLowerCase();
    return matchesCategory && matchesRegion && (!normalizedQuery || searchable.includes(normalizedQuery));
  }).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  $('#result-count').textContent = results.length;
  if ($('#total-stories')) $('#total-stories').textContent = String(state.stories.length).padStart(2, '0');
  $('#reset-filters').hidden = state.category === 'All' && state.region === 'All' && !state.query;
  const loading = state.status === 'loading' && results.length === 0;
  $('#loading-state').hidden = !loading;
  $('#stories').hidden = results.length === 0;
  $('#empty-state').hidden = results.length !== 0 || loading;
  $('#empty-title').textContent = state.status === 'error' && results.length === 0 ? 'Feed unavailable' : 'No stories found';
  $('#empty-copy').textContent = state.status === 'error' && results.length === 0 ? state.errorMessage : 'Try a different topic, region, or search.';
  $('#stories').innerHTML = results.map((story, index) => `
    <article class="story-card" tabindex="0" role="button" aria-label="Read: ${escapeHtml(story.title)}" data-story-id="${escapeHtml(story.id)}" style="animation-delay:${Math.min(index, 6) * 45}ms">
      <div class="story-content">
        <div class="story-meta"><span class="story-category">${escapeHtml(story.category.toUpperCase())}</span><span class="meta-sep">/</span><span>${escapeHtml(story.location.toUpperCase())}</span><span class="meta-sep">/</span><span>${escapeHtml(relativeTime(story.publishedAt))}</span><span class="demo-tag">${story.demo ? 'DEMO' : 'LIVE INDEX'}</span></div>
        <h3 class="story-title">${escapeHtml(story.title)}</h3>${story.summary ? `<p class="story-summary">${escapeHtml(story.summary)}</p>` : '<p class="story-summary">Headline indexed from live publisher coverage. Open the source for the full report.</p>'}
        <div class="story-bottom"><span>↗</span><span class="story-source">${escapeHtml(story.source)}</span><span class="ai-mini">${story.demo ? 'SAMPLE' : 'LIVE HEADLINE'}</span></div>
      </div>${safeMediaUrl(story.imageUrl) ? `<div class="story-thumb photo-thumb"><img src="${escapeHtml(safeMediaUrl(story.imageUrl))}" alt="${escapeHtml(story.imageAlt || story.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"><span>${story.demo || story.imageIsIllustrative ? 'ILLUSTRATIVE PHOTO' : 'SOURCE PHOTO'}</span></div>` : `<div class="story-thumb ${escapeHtml(story.imageClass)}" aria-hidden="true"><div class="thumb-art">${story.category === 'Technology' ? '⌘' : story.category === 'Science' ? '✳' : story.category === 'Sports' ? '◉' : story.category === 'Health' ? '+' : story.category === 'Business' ? '↗' : story.category === 'Entertainment' ? '✧' : '◎'}</div><span>${escapeHtml(story.imageLabel)}</span></div>`}
    </article>`).join('');
}

function renderTicker() {
  const headlines = state.stories.slice(0, 7).map(story => `<span class="ticker-item"><b>${escapeHtml(story.category.toUpperCase())}</b>${escapeHtml(story.title)}</span>`).join('');
  $('#ticker-track').innerHTML = headlines + headlines;
  $('#ticker-track').classList.toggle('paused', state.tickerPaused);
}

function renderTrends() {
  const counts = new Map();
  state.stories.forEach(story => counts.set(story.category, (counts.get(story.category) || 0) + 1));
  const trends = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
  $('#trending-list').innerHTML = trends.length ? trends.map(([topic, count], index) => `<div class="trending-item"><span class="trending-rank">0${index + 1}</span><a href="#latest" class="trending-topic" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</a><span class="trend-change">${count} ${count === 1 ? 'STORY' : 'STORIES'}</span></div>`).join('') : '<p class="side-note">TOPICS WILL APPEAR WHEN LIVE HEADLINES LOAD</p>';
  const regionCounts = new Map();
  state.stories.forEach(story => { const key = story.region.toUpperCase(); regionCounts.set(key, (regionCounts.get(key) || 0) + 1); });
  $$('.regions-card .region-stat').forEach(row => {
    const region = row.querySelector('span').textContent.trim().toUpperCase();
    const count = regionCounts.get(region) || 0;
    row.querySelector('b').innerHTML = `${count.toString().padStart(2, '0')} <small>STORIES</small>`;
  });
  $('.trend-card .side-note').textContent = 'MOST FREQUENT CATEGORIES IN THE LIVE INDEX';
}

function openStory(story) {
  if (!story) return;
  const imageUrl = safeMediaUrl(story.imageUrl);
  const imageCreditLink = safeMediaUrl(story.imageCreditUrl);
  const imageDetail = imageUrl ? `<figure class="detail-photo"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(story.imageAlt || story.title)}"><figcaption>${story.demo || story.imageIsIllustrative ? 'ILLUSTRATIVE PHOTO · ' : 'PHOTO · '}${imageCreditLink ? `<a href="${escapeHtml(imageCreditLink)}" target="_blank" rel="noreferrer">${escapeHtml(story.imageCredit || 'Photo source')} ↗</a>` : escapeHtml(story.imageCredit || 'Photo source')}</figcaption></figure>` : '';
  const videoSource = safeMediaUrl(story.videoUrl);
  const articleSource = safeMediaUrl(story.articleUrl);
  const videoDetail = videoSource ? `<p class="story-video-link">VIDEO · <a href="${escapeHtml(videoSource)}" target="_blank" rel="noreferrer">${escapeHtml(story.videoTitle || 'View source video')} ↗</a> · ${escapeHtml(story.videoCredit || story.source)}</p>` : '';
  $('#article-detail').innerHTML = `<div class="article-detail-meta"><span class="story-category">${escapeHtml(story.category.toUpperCase())}</span><span>/</span><span>${escapeHtml(story.location.toUpperCase())}</span><span>/</span><span>${escapeHtml(relativeTime(story.publishedAt))}</span><span class="demo-tag">${story.demo ? 'DEMO STORY' : 'LIVE INDEX'}</span></div><h2>${escapeHtml(story.title)}</h2>${imageDetail}${story.summary ? `<p class="detail-summary">${escapeHtml(story.summary)}</p><div class="detail-box"><b>${story.summaryByAi ? '✳ AI-GENERATED SUMMARY' : 'SUMMARY'}</b><p>${escapeHtml(story.summary)}</p></div>` : '<div class="detail-box"><b>LIVE HEADLINE</b><p>This is a headline indexed from current publisher coverage. TRENDZ AI does not reproduce the full article or generate an AI summary. Open the publisher’s original report for the complete story.</p></div>'}${story.whyItMatters ? `<div class="detail-box"><b>WHY IT MATTERS</b><p>${escapeHtml(story.whyItMatters)}</p></div>` : ''}${articleSource ? `<p class="story-video-link"><a href="${escapeHtml(articleSource)}" target="_blank" rel="noreferrer">READ THE ORIGINAL REPORT ↗</a></p>` : ''}${videoDetail}<div class="detail-footer">GDELT INDEX · ORIGINAL PUBLISHER: ${escapeHtml(story.source)} · ${escapeHtml(new Date(story.publishedAt).toLocaleString())}</div>`;
  $('#article-dialog').showModal();
}

async function refreshFeed() {
  try {
    const stories = await fetchStories();
    if (stories) {
      state.status = 'ready';
      state.stories = stories;
      renderStories(); renderTicker(); renderTrends();
      $('#freshness').textContent = `CHECKED ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
      $('#refresh-status').textContent = 'LIVE COVERAGE · UPDATES EVERY 60 SEC';
    }
  } catch (error) {
    console.error('News refresh failed:', error);
    if (state.stories.length === 0) {
      state.status = 'error';
      state.errorMessage = String(error?.message || '').includes('429')
        ? 'The public news index is temporarily rate-limiting requests. TRENDZ AI will retry automatically.'
        : 'Could not reach the live news index. Check your connection; TRENDZ AI will retry automatically.';
    }
    renderStories();
    $('#freshness').textContent = 'PROVIDER UNAVAILABLE';
    $('#refresh-status').textContent = 'LAST CHECK FAILED · RETRYING';
    if (state.status === 'error') showToast('Live news is temporarily unavailable. The site will retry automatically.');
  }
}

function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3400);
}

function setFilter(category) {
  state.category = category;
  $$('.filter-chip').forEach(button => button.classList.toggle('active', button.dataset.category === category));
  renderStories();
}

function clearFilters() {
  state.category = 'All'; state.region = 'All'; state.query = '';
  $('#region-filter').value = 'All'; $('#search').value = '';
  setFilter('All');
}

function tickClock() {
  $('#clock').textContent = `${new Intl.DateTimeFormat('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC',hour12:false}).format(new Date())} UTC`;
}

$('.demo-banner').innerHTML = '<span class="demo-pill"><span class="pulse"></span> LIVE NEWS INDEX</span><span>Current headlines indexed from publishers worldwide by GDELT. <strong>Read each original report for full context.</strong></span><button id="demo-info" aria-label="About live news">i</button>';
$('.ai-disclosure').innerHTML = '<span>↗</span> LIVE HEADLINES · ORIGINAL PUBLISHER LINKS';
$('#hero-update-label').textContent = 'LIVE INDEX · 60 SEC REFRESH';
$('#freshness').textContent = 'CONNECTING TO LIVE NEWS';
$('#refresh-status').textContent = 'FETCHING CURRENT COVERAGE';
state.refreshTimer = setInterval(refreshFeed, NEWS_CONFIG.refreshIntervalMs);
refreshFeed();

renderStories(); renderTicker(); renderTrends(); tickClock();
setInterval(tickClock, 1000);

$('#category-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-category]'); if (button) setFilter(button.dataset.category);
});
$('#region-filter').addEventListener('change', event => { state.region = event.target.value; renderStories(); });
$('#search').addEventListener('input', event => { state.query = event.target.value; renderStories(); });
$('#reset-filters').addEventListener('click', clearFilters);
$('#clear-empty').addEventListener('click', clearFilters);
$('#stories').addEventListener('click', event => { const card = event.target.closest('[data-story-id]'); if (card) openStory(state.stories.find(story => story.id === card.dataset.storyId)); });
$('#stories').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { const card = event.target.closest('[data-story-id]'); if (card) { event.preventDefault(); openStory(state.stories.find(story => story.id === card.dataset.storyId)); } } });
$('#trending-list').addEventListener('click', event => { const link = event.target.closest('[data-topic]'); if (!link) return; event.preventDefault(); $('#search').value = link.dataset.topic; state.query = link.dataset.topic; renderStories(); $('#latest').scrollIntoView(); });
$('#all-regions').addEventListener('click', () => { $('#region-filter').focus(); $('#region-filter').scrollIntoView({behavior:'smooth',block:'center'}); });
$('#ticker-pause').addEventListener('click', event => { state.tickerPaused = !state.tickerPaused; renderTicker(); event.currentTarget.textContent = state.tickerPaused ? '▶' : 'Ⅱ'; event.currentTarget.setAttribute('aria-label', state.tickerPaused ? 'Resume headline ticker' : 'Pause headline ticker'); });
$('#theme-toggle').addEventListener('click', event => { const light = document.body.classList.toggle('light-theme'); event.currentTarget.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme'); localStorage.setItem('trendz-theme', light ? 'light' : 'dark'); });
if (localStorage.getItem('trendz-theme') === 'light') { document.body.classList.add('light-theme'); $('#theme-toggle').setAttribute('aria-label', 'Switch to dark theme'); }
$('#menu-toggle').addEventListener('click', event => { const open = $('.main-nav').classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(open)); event.currentTarget.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); });
$('.main-nav').addEventListener('click', event => { if (event.target.closest('a')) { $('.main-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded', 'false'); } });
$('#demo-info').addEventListener('click', () => $('#info-dialog').showModal());
$('#info-understood').addEventListener('click', () => $('#info-dialog').close());
$('#info-close').addEventListener('click', () => $('#info-dialog').close());
$('#modal-close').addEventListener('click', () => $('#article-dialog').close());
$$('[data-video-id]').forEach(button => button.addEventListener('click', event => {
    const { videoId, videoTitle, videoCredit, videoBadge } = event.currentTarget.dataset;
  if (!/^[\w-]{11}$/.test(videoId)) return;
  const safeTitle = videoTitle || 'Featured video';
  $('#video-player').innerHTML = `<iframe class="video-player-frame" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&amp;rel=0&amp;playsinline=1" title="${escapeHtml(safeTitle)} — NASA" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  $('#video-dialog-title').textContent = safeTitle;
  $('#video-source-note').textContent = `${videoCredit || 'NASA video source'} Player only loads after you press Play.`;
  $('#video-source-link').href = `https://www.youtube.com/watch?v=${videoId}`;
    $('.video-duration').textContent = videoBadge || 'FEATURED FILM';
    $('#video-provider-label').textContent = `VIDEO · ${(videoCredit || 'NASA').split(' · ')[0].toUpperCase()}`;
  $('.video-art > img').src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  $('.video-art > img').alt = `${safeTitle} video thumbnail`;
  $('#video-dialog').showModal();
}));
$('#video-close').addEventListener('click', () => $('#video-dialog').close());
$('#video-dialog').addEventListener('close', () => {
  $('#video-player').replaceChildren();
  const featured = $('#play-feature-video');
  $('.video-art > img').src = `https://i.ytimg.com/vi/${featured.dataset.videoId}/hqdefault.jpg`;
  $('.video-art > img').alt = `${featured.dataset.videoTitle} video preview`;
  $('.video-duration').textContent = featured.dataset.videoBadge;
  $('#video-provider-label').textContent = 'VIDEO · NASA JOHNSON';
  $('#video-source-link').href = `https://www.youtube.com/watch?v=${featured.dataset.videoId}`;
});
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement) event.target.classList.add('media-load-failed');
}, true);
$('#article-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$('#info-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$('#api-details').addEventListener('click', () => { showToast('Live headlines are indexed by GDELT DOC 2.0 and refreshed every 60 seconds.'); });
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) && !event.ctrlKey && !event.metaKey) { event.preventDefault(); $('#search').focus(); } });
