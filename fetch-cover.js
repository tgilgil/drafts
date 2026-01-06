const https = require('https');
const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, 'posts');

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
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
      })
      .on('error', reject);
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'post';
}

function googleCoverUrl(volumeId) {
  return `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=1`;
}

async function searchBook(title) {
  const q = encodeURIComponent(title);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`;
  const json = await httpGetJson(url);
  const volume = json.items?.[0];
  if (!volume) return { volumeId: null, api: url };
  return { volumeId: volume.id, api: url };
}

function loadMarkdown(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseFrontMatter(raw) {
  if (!raw.startsWith('---')) return { meta: {}, body: raw.trim(), raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: raw.trim(), raw };
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
  return { meta, body, endIndex: end + 4, raw };
}

function writeFrontMatter(filePath, meta, body) {
  const header = Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const next = `---\n${header}\n---\n\n${body}\n`;
  fs.writeFileSync(filePath, next, 'utf8');
}

async function updateCover(title, opts) {
  const slug = opts.slug || slugify(title);
  const filePath = path.join(POSTS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Post not found at ${filePath}`);
  }
  const raw = loadMarkdown(filePath);
  const { meta, body } = parseFrontMatter(raw);
  if (meta.cover && !opts.force) {
    console.log(`Cover already set for ${slug}: ${meta.cover}`);
    return;
  }

  const { volumeId, api } = await searchBook(meta.title || title);
  if (!volumeId) {
    throw new Error(`No volume found via Google Books. Query: ${api}`);
  }
  const coverUrl = googleCoverUrl(volumeId);
  meta.cover = coverUrl;
  writeFrontMatter(filePath, meta, body);
  console.log(`Set cover for ${slug} -> ${coverUrl}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Usage: node fetch-cover.js "Book Title" [--slug=custom] [--force]');
    console.log('Looks up a Google Books volume and writes its cover URL into front matter.');
    process.exit(1);
  }
  const title = args[0];
  const opts = { slug: '', force: false };
  args.slice(1).forEach((arg) => {
    if (arg === '--force') opts.force = true;
    else if (arg.startsWith('--slug=')) opts.slug = arg.slice(7);
  });

  try {
    await updateCover(title, opts);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
