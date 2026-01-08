const fs = require('fs');
const path = require('path');
const https = require('https');

const POSTS_DIR = path.join(__dirname, 'posts');
const DIST_DIR = path.join(__dirname, 'dist');
const POSTS_DIST = path.join(DIST_DIR, 'posts');
const SITE_TITLE = 'Ali in Drafts';
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const FEED_PATH = 'rss.xml';
const MAX_RATING = 5;

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function inlineMarkdown(text) {
  let output = text;
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${escapeHtml(url)}">${label}</a>`);
  output = output.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return output;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inList = false;
  let inCode = false;
  const codeLines = [];

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  const closeCode = () => {
    if (inCode) {
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLines.length = 0;
      inCode = false;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inCode) {
        closeCode();
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      if (!inList) {
        closeCode();
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^\s*[-*+]\s+/, ''))}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      closeCode();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      closeCode();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      closeCode();
      html.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, '').trim())}</blockquote>`);
      continue;
    }

    closeList();
    closeCode();
    html.push(`<p>${inlineMarkdown(line.trim())}</p>`);
  }

  closeList();
  closeCode();

  return html.join('\n');
}

function parseFrontMatter(raw) {
  if (!raw.startsWith('---')) {
    return { meta: {}, body: raw.trim() };
  }

  const end = raw.indexOf('\n---', 3);
  if (end === -1) {
    return { meta: {}, body: raw.trim() };
  }

  const header = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const meta = {};

  header
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [key, ...rest] = line.split(':');
      if (!key || rest.length === 0) return;
      meta[key.trim().toLowerCase()] = rest.join(':').trim();
    });

  return { meta, body };
}

function writeFrontMatter(filePath, meta, body) {
  const header = Object.entries(meta)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const content = `---\n${header}\n---\n\n${body}\n`;
  fs.writeFileSync(filePath, content, 'utf8');
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'post';
}

function clampRating(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return Math.min(MAX_RATING, Math.max(0, Math.round(num * 2) / 2));
}

function httpGetJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

function extractIsbn(volume) {
  const ids = volume?.volumeInfo?.industryIdentifiers || [];
  const isbn13 = ids.find((i) => i.type === 'ISBN_13');
  const isbn10 = ids.find((i) => i.type === 'ISBN_10');
  return isbn13?.identifier || isbn10?.identifier || null;
}

function googleCoverUrl(volumeId) {
  return `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=1`;
}

async function searchBook(title) {
  const q = encodeURIComponent(title);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`;
  const json = await httpGetJson(url);
  const volume = json.items?.[0];
  if (!volume) return { isbn: null, volumeId: null, api: url };
  const isbn = extractIsbn(volume);
  return { isbn, volumeId: volume.id, api: url };
}

function renderStars(rating) {
  const safe = clampRating(rating);
  if (safe === null) return '';
  const full = Math.floor(safe);
  const half = safe % 1 ? 1 : 0;
  const empty = MAX_RATING - full - half;
  const star = '&#9733;'; // filled star
  const halfStar = '&#9733;'; // re-use star for half; keeps ASCII source
  const emptyStar = '&#9734;'; // outline star
  return `${star.repeat(full)}${half ? halfStar : ''}${emptyStar.repeat(empty)}`;
}

function feedUrl() {
  return FEED_PATH;
}

function feedAbsoluteUrl() {
  if (!SITE_URL) return '';
  return `${SITE_URL}/${FEED_PATH}`;
}

function renderLayout({ title, content, description = '', extraMeta = '', includeHomeLink = false }) {
  const rssHref = feedAbsoluteUrl() || feedUrl();
  const rssLink = `<link rel="alternate" type="application/rss+xml" title="${SITE_TITLE}" href="${rssHref}" />`;
  const navLinks = [
    includeHomeLink ? '<a href="../../index.html">Home</a>' : '',
  ].filter(Boolean).join('');
  const footer = `<footer><a href="${feedUrl()}">RSS</a></footer>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  ${rssLink}
  ${extraMeta}
  <style>
    :root {
      --ink: #1f2933;
      --stone: #eaecee;
      --paper: #fdfdfc;
      --accent: #e76f51;
      --accent-2: #2a9d8f;
      --muted: #6b7280;
      --shadow: 0 14px 40px rgba(31, 41, 51, 0.1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at 20% 20%, #f3f3ff 0, transparent 25%), var(--paper);
      color: var(--ink);
      font-family: "Archivo", "Helvetica Neue", Arial, sans-serif;
      line-height: 1.7;
      padding: 32px 20px 80px;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    header { max-width: 880px; margin: 0 auto 32px; padding-bottom: 16px; border-bottom: 1px solid var(--stone); }
    .logo {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: inline-flex;
      align-items: center;
      gap: 12px;
    }
    .logo span {
      display: inline-flex;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      box-shadow: var(--shadow);
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
    }
    main { max-width: 880px; margin: 0 auto; background: white; border-radius: 18px; padding: 28px; box-shadow: var(--shadow); }
    footer { max-width: 880px; margin: 18px auto 0; color: var(--muted); font-size: 14px; text-align: right; }
    .post-hero {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 18px;
      align-items: center;
      margin-bottom: 22px;
    }
    .cover {
      width: 100%;
      max-width: 200px;
      border-radius: 12px;
      box-shadow: var(--shadow);
      object-fit: cover;
    }
    .post-card {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 18px 16px;
      border-radius: 14px;
      border: 1px solid var(--stone);
      transition: transform 120ms ease, box-shadow 120ms ease, border 120ms ease;
      margin-bottom: 12px;
    }
    .post-card:hover {
      transform: translateY(-2px);
      border-color: rgba(231, 111, 81, 0.4);
      box-shadow: var(--shadow);
    }
    .post-card h2 { margin: 0; font-size: 22px; }
    .post-card time { color: var(--muted); font-size: 14px; }
    .post-card p { margin: 4px 0 0; color: #3f4a54; }
    article h1 { margin-top: 0; font-size: 32px; }
    article h2 { margin-top: 28px; }
    article pre { background: #0b1726; color: #f4f7fb; padding: 14px; border-radius: 10px; overflow-x: auto; }
    article code { background: #f5f7fa; padding: 2px 5px; border-radius: 6px; font-size: 0.95em; }
    article ul { padding-left: 18px; }
    .meta { color: var(--muted); margin: 0 0 16px; }
    .rating { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #f59e0b; }
    .rating .stars { letter-spacing: 2px; }
    .rating .value { color: var(--muted); font-weight: 600; }
    nav a { margin-right: 10px; font-weight: 600; }
    @media (max-width: 640px) {
      main { padding: 20px; }
      .post-card { grid-template-columns: 1fr; }
      .post-hero { grid-template-columns: 1fr; }
      .cover { max-width: 100%; justify-self: start; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo"><span>ag</span>${SITE_TITLE}</div>
    <nav>${navLinks}</nav>
  </header>
  <main>
    ${content}
  </main>
  ${footer}
</body>
</html>`;
}

function renderIndex(posts) {
  const cards = posts
    .map((post) => {
      const url = `posts/${post.slug}/index.html`;
      const rating = post.rating !== null ? `<div class="rating"><span class="stars">${renderStars(post.rating)}</span><span class="value">${post.rating}/5</span></div>` : '';
      return `<article class="post-card">
        <div>
          <h2><a href="${url}">${post.title}</a></h2>
          <p>${post.summary || ''}</p>
          ${rating}
        </div>
        <time>${post.dateLabel || ''}</time>
      </article>`;
    })
    .join('\n');

  const content = `<article>
    <p class="meta">A space for drafts, doubts, and ideas that aren’t done yet</p>
    ${cards || '<p>No posts yet. Add a markdown file in <code>posts/</code>.</p>'}
  </article>`;

  return renderLayout({
    title: SITE_TITLE,
    description: 'Reading notes and highlights captured in markdown.',
    content,
  });
}

function renderPostPage(post) {
  const meta = [];
  if (post.dateLabel) meta.push(`<time datetime="${post.date}">${post.dateLabel}</time>`);
  if (post.meta.tags) meta.push(`<span>Tags: ${post.meta.tags}</span>`);

  const cover = post.cover ? `<img class="cover" src="${escapeHtml(post.cover)}" alt="Cover of ${escapeHtml(post.title)}" loading="lazy" />` : '';
  const rating = post.rating !== null ? `<div class="rating"><span class="stars">${renderStars(post.rating)}</span><span class="value">${post.rating}/5</span></div>` : '';

  const content = `<article>
    <div class="post-hero">
      ${cover ? `<div>${cover}</div>` : ''}
      <div>
        <h1>${post.title}</h1>
        <p class="meta">${meta.join(' · ')}</p>
        ${rating}
      </div>
    </div>
    ${post.html}
  </article>`;

  return renderLayout({
    title: `${post.title} — ${SITE_TITLE}`,
    description: post.summary || post.title,
    content,
    includeHomeLink: true,
  });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toRssDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toUTCString();
}

function renderRss(posts) {
  const lastBuild = new Date().toUTCString();
  const baseUrl = SITE_URL;
  const items = posts.map((post) => {
    const link = baseUrl ? `${baseUrl}/posts/${post.slug}/index.html` : `posts/${post.slug}/index.html`;
    const pubDate = toRssDate(post.date);
    const description = post.summary || '';
    return [
      '<item>',
      `<title>${escapeXml(post.title)}</title>`,
      `<link>${escapeXml(link)}</link>`,
      `<guid>${escapeXml(link)}</guid>`,
      description ? `<description>${escapeXml(description)}</description>` : '',
      `<content:encoded><![CDATA[${post.html}]]></content:encoded>`,
      pubDate ? `<pubDate>${pubDate}</pubDate>` : '',
      '</item>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml('Reading notes and highlights captured in markdown.')}</description>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    ${items}
  </channel>
</rss>`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) {
    throw new Error('No posts directory found. Create a posts/ folder with markdown files.');
  }
  const files = fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.md'));
  return files.map((file) => {
    const fullPath = path.join(POSTS_DIR, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const { meta, body } = parseFrontMatter(raw);
    const title = meta.title || path.basename(file, '.md');
    const slug = slugify(meta.slug || title);
    const html = markdownToHtml(body);
    const summary = meta.summary || '';
    const dateLabel = formatDate(meta.date);
    const cover = meta.cover || '';
    const rating = clampRating(meta.rating);

    return {
      file,
      filePath: fullPath,
      title,
      slug,
      summary,
      date: meta.date || '',
      dateLabel,
      meta,
      cover,
      rating,
      html,
      body,
    };
  });
}

async function ensureCovers(posts) {
  for (const post of posts) {
    const hasCoverField = Object.prototype.hasOwnProperty.call(post.meta, 'cover');
    if (!hasCoverField || post.cover) continue;
    const title = post.meta.title || post.title;
    try {
      const { volumeId } = await searchBook(title);
      if (!volumeId) {
        console.log(`No volume found for "${title}". Skipping cover.`);
        continue;
      }
      const coverUrl = googleCoverUrl(volumeId);
      post.cover = coverUrl;
      post.meta.cover = coverUrl;
      writeFrontMatter(post.filePath, post.meta, post.body);
      console.log(`Auto-set cover for ${post.slug} -> ${coverUrl}`);
    } catch (err) {
      console.log(`Cover lookup failed for "${title}": ${err.message}`);
    }
  }
}

async function build() {
  const posts = loadPosts().sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    return a.title.localeCompare(b.title);
  });

  await ensureCovers(posts);

  ensureDir(POSTS_DIST);

  const indexHtml = renderIndex(posts);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, FEED_PATH), renderRss(posts), 'utf8');

  posts.forEach((post) => {
    const postDir = path.join(POSTS_DIST, post.slug);
    ensureDir(postDir);
    const html = renderPostPage(post);
    fs.writeFileSync(path.join(postDir, 'index.html'), html, 'utf8');
  });

  console.log(`Built ${posts.length} post${posts.length === 1 ? '' : 's'} to dist/`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
