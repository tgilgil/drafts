# Book Notes Blog

A lightweight, markdown-first blog for short reflections on books. Add a markdown file in `posts/`, run `node build.js`, and open the generated HTML in `dist/`.

## Workflow

1. Add a markdown file in `posts/` with front matter:

   ```md
   ---
   title: My Book Title
   date: 2024-10-10
   summary: One-line description for the index page.
   tags: optional, comma-separated
   ---

   # Your notes
   ...
   ```

2. Build the site:

   ```sh
   node build.js
   ```

   Output goes to `dist/`.

3. Preview locally (serves `dist/`):

   ```sh
   node preview.js
   ```

   Then open `http://localhost:8080`.

## Notes

- Markdown supports headings, lists, block quotes, inline code, fenced code blocks, bold/italics, and links.
- Posts are sorted by `date` (newest first); if no date is given, they fall back to alphabetical order by title.
- `slug` can be added to the front matter to override the URL-friendly path derived from `title`.
- Add `cover: https://...` to show a book cover image on a post, and `rating: 4.5` (0–5, halves ok) to render a star rating.
- An RSS feed is generated at `dist/rss.xml`. Set `SITE_URL` when building to control absolute links in the feed.

## Scaffold a new book review

Generate a ready-to-fill template:

```sh
node new-review.js "Book Title" --rating=4.5
```

Options:
- `--slug` to override the filename/URL
- `--cover` for a remote or local image path
- `--rating` for a 0–5 score (supports halves)

### Automatically fetch a cover by title

Use Google Books to find a volume, then set the Google Books cover URL into front matter:

```sh
node fetch-cover.js "Book Title" --slug=optional-slug
```

Flags:
- `--slug` if the filename differs from the title-derived slug
- `--force` to overwrite an existing `cover`

This script requires network access and writes the `cover` field directly into the markdown file under `posts/`.

### Automatic cover lookup during build

When `node build.js` runs, it now tries to fill any missing `cover` values (only for posts that define a `cover` field) by querying Google Books for a volume and writing the matching Google cover URL back into the markdown file. If lookup fails or there’s no network, the build continues without a cover.
