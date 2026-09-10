# Image replacement guide

Every image in the site is currently a **labelled placeholder** that displays
its own filename, pixel size and purpose. To use a real photo, overwrite the
file at the same path with the same filename — nothing in the code needs to
change.

All files live under `public/images/`. Paths in the content JSON are written as
`/images/...`; the base path (`/air-chrysalis`) is added at render time by
`withBase()`, so **do not put the base in the content files**.

Regenerate the placeholders at any time (they are deterministic):

```sh
npm run placeholders
```

It launches a headless browser to render them, so there is no image library in
`package.json`. Set `CHROME_PATH` if it cannot find Chrome or Edge. It only
writes the filenames it knows about, so real photos at other names are safe.

---

## Keeping the same filename but a different format

If you replace a `.jpg` with a `.png` or `.webp`, the filename in the content
file must change too. Where to edit:

| Kind | File to edit | Field |
| --- | --- | --- |
| Home cards | `src/config/home.ts` | `selectedWork.cards[].image` |
| Builds | `src/content/builds/<slug>.json` | `hero`, `gallery[]` |
| Games | `src/content/games/games.json` | `screenshots[]` |
| Books | `src/content/books/books.json` | `cover` |

Simplest path: **keep the `.jpg` extension** and just overwrite the file.

---

## 1. Home cards — 4 images

Shown on `/` in the "A FEW THINGS I MAKE" row. Cropped to the Editorial Card
media plate (**2.59 : 1**), so keep the subject centred.

| File | Size | Card |
| --- | --- | --- |
| `home/workshop.jpg` | 1164 × 450 | WORKSHOP — Software / Projects |
| `home/build-archive.jpg` | 1164 × 450 | BUILD ARCHIVE — Gunpla / Models |
| `home/gaming-log.jpg` | 1164 × 450 | GAMING LOG — PlayStation / Games |
| `home/reading-log.jpg` | 1164 × 450 | READING LOG — Books / Goodreads |

---

## 2. Builds — no images to replace

The BUILD ARCHIVE is generated from the Blogspot feed by `npm run blog:sync`,
and its images come with it:

- **hero** — the YouTube thumbnail of the build's video, at `maxresdefault`.
- **photo set** — the photos in the post, hotlinked from Google's CDN and
  rewritten to `/s1600/` so the archive shows the originals rather than
  Blogger's display crops.

Nothing lives in `public/images/builds/`. To change what a build shows, change
the post: the next sync picks it up.

---

## 3. Games — 6 images

Screenshots are **16 : 9**. The **first** screenshot in each array does triple
duty: the index card, the "CURRENTLY PLAYING" feature plate, and the detail
hero. Screenshots after the first appear only in the detail page grid.

| File | Size | Where it appears |
| --- | --- | --- |
| `games/where-winds-meet-01.jpg` | 1920 × 1080 | Card + currently-playing feature + detail hero |
| `games/where-winds-meet-02.jpg` | 1920 × 1080 | Detail screenshot grid |
| `games/where-winds-meet-03.jpg` | 1920 × 1080 | Detail screenshot grid |
| `games/elden-ring-01.jpg` | 1920 × 1080 | Card + detail hero |
| `games/armored-core-vi-01.jpg` | 1920 × 1080 | Card + detail hero |
| `games/silksong-01.jpg` | 1920 × 1080 | Card + detail hero |

`where-winds-meet` is the entry with `current: true`, which is why it gets the
feature slot. Moving that flag to another game moves the feature with it.

---

## 4. Books — no images to replace

The READING LOG is generated from Goodreads by `npm run books:sync`, and cover
art comes with it — `book_large_image_url`, hotlinked from `i.gr-assets.com`.

Nothing lives in `public/images/books/`. To change a cover, change the edition
on Goodreads: the next sync picks it up.

---

## Practical notes

**Sizes are generous on purpose.** They are roughly 2× the largest rendered
size, so images stay sharp on high-DPI screens. Larger than that is wasted
bytes; smaller will look soft.

**Everything is cropped with `object-cover`**, meaning it fills the plate and
overflows on the long axis. Centre your subject. Nothing is letterboxed.

**No image optimisation yet.** Files in `public/` are served exactly as
committed — no resizing, no WebP conversion, no responsive `srcset`. The 23
placeholders total about 660 KB; real photography will be far heavier. When it
lands, consider `astro:assets` (move files from `public/` to `src/assets/` and
import them) for automatic resizing and format conversion.

**Alt text.** Builds, games and books derive alt text from the entry title.
Home card images are decorative (`alt=""`) because the card title beside them
already carries the meaning. If a home image becomes informative, give it real
alt text in `src/pages/index.astro`.
