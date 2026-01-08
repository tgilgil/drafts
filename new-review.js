const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, 'posts');

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'post';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = { title: '', slug: '', cover: '', rating: '' };
  argv.forEach((arg) => {
    if (arg.startsWith('--slug=')) args.slug = arg.slice(7);
    else if (arg.startsWith('--cover=')) args.cover = arg.slice(8);
    else if (arg.startsWith('--rating=')) args.rating = arg.slice(9);
    else if (!args.title) args.title = arg;
  });
  return args;
}

function ensurePostsDir() {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
}

function createTemplate({ title, slug, cover, rating }) {
  const safeSlug = slug || slugify(title);
  const filepath = path.join(POSTS_DIR, `${safeSlug}.md`);
  if (fs.existsSync(filepath)) {
    console.error(`File already exists: ${filepath}`);
    process.exit(1);
  }

  const contents = `---
title: ${title}
date: ${today()}
summary: One-line hook for the review.
cover: ${cover || ''}
rating: ${rating || '4'}
tags: review, book
---

## Why I Read It

## Thoughts
`;

  fs.writeFileSync(filepath, contents, 'utf8');
  console.log(`Created ${filepath}`);
}

function main() {
  const { title, slug, cover, rating } = parseArgs(process.argv.slice(2));
  if (!title) {
    console.log('Usage: node new-review.js "Book Title" [--slug=custom-slug] [--cover=url] [--rating=4.5]');
    process.exit(1);
  }
  ensurePostsDir();
  createTemplate({ title, slug, cover, rating });
}

main();
