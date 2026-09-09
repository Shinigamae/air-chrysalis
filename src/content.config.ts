import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { file, glob } from 'astro/loaders';

/**
 * Content collections — shaped from Figma "03 — Content Systems" (11:74).
 *
 * Layout follows the structure sketched in FIGMA.md: builds are one file per
 * entry (they grow indefinitely and each carries a photo set), while games,
 * books and projects are single JSON arrays.
 *
 * These schemas are also the contract the .NET API will need to satisfy
 * later, so they are deliberately explicit rather than loose.
 */

/** Figma "Status Label" (33:41) variants. */
const status = z.enum(['live', 'archive', 'draft']);

/**
 * A / BUILD ARCHIVE — "RG / 1:144 / MOBILE SUIT", model name,
 * "Series · Manufacturer · Build date", build notes, photo set.
 */
const builds = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/builds' }),
  schema: z.object({
    title: z.string(),
    /** Kit grade — RG, MG, HG, PG. Rendered in the kicker. */
    grade: z.string(),
    scale: z.string(),
    kind: z.string(),
    series: z.string(),
    manufacturer: z.string(),
    buildDate: z.string(),
    summary: z.string(),
    /** Panel lining / custom paint / decals / modifications. */
    notes: z.array(z.string()).default([]),
    status: status.default('archive'),
    /** Ordinal shown as "01 —" in card metadata; also the sort key. */
    index: z.number().int().positive(),
    hero: z.string().optional(),
    gallery: z.array(z.string()).default([]),
  }),
});

/**
 * B / GAMING LOG — platform, year, progress, rating, status, review excerpt,
 * screenshots treated as the visual anchor.
 */
const games = defineCollection({
  loader: file('./src/content/games/games.json'),
  schema: z.object({
    title: z.string(),
    platform: z.string(),
    year: z.number().int(),
    /** Percent complete, 0-100. */
    progress: z.number().min(0).max(100),
    /** Out of 10, matching "Rating 8.5 / 10". */
    rating: z.number().min(0).max(10).nullish(),
    playStatus: z.enum(['in-progress', 'finished', 'abandoned', 'backlog']),
    /** True for the single "CURRENTLY PLAYING" feature slot. */
    current: z.boolean().default(false),
    review: z.string(),
    screenshots: z.array(z.string()).default([]),
    status: status.default('archive'),
  }),
});

/**
 * C / READING LOG — title/author, source and rating, a short personal
 * thought rather than a review score, and a position on the year's timeline.
 */
const books = defineCollection({
  loader: file('./src/content/books/books.json'),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    source: z.string().default('GOODREADS'),
    /** Out of 5, matching "RATING 4 / 5". */
    rating: z.number().min(0).max(5).nullish(),
    thought: z.string(),
    /** ISO date; drives the reading timeline and ordering. */
    finishedOn: z.string().optional(),
    /** True for the single "CURRENT BOOK" feature slot. */
    current: z.boolean().default(false),
    cover: z.string().optional(),
    status: status.default('archive'),
  }),
});

/**
 * D / WORKSHOP / PROJECTS — the case-study pattern:
 * problem → approach → result → stack → lessons learned.
 */
const projects = defineCollection({
  loader: file('./src/content/projects/projects.json'),
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    year: z.number().int(),
    /** Curated display order, ascending. Ties on year are not meaningful. */
    order: z.number().int().positive(),
    problem: z.string(),
    approach: z.string(),
    result: z.string(),
    stack: z.array(z.string()).default([]),
    lessons: z.array(z.string()).default([]),
    status: status.default('live'),
    href: z.url().optional(),
  }),
});

export const collections = { builds, games, books, projects };
