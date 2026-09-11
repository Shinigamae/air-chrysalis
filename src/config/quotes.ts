/**
 * Footer quotes — the line that closes every page.
 *
 * These are typed out here rather than synced. Goodreads retired their API in
 * 2020 and the surviving RSS feeds are per *shelf*: they carry books, ratings
 * and review text, which is what `npm run books:sync` lives on, and they
 * carry nothing about quotes. A quote page on goodreads.com is HTML only, so
 * a sync would mean scraping a page that is free to change shape — a lot of
 * moving parts for a list that grows a line at a time by hand.
 *
 * So: a curated list. Short passages, each credited to its book, which is the
 * form a quotation is allowed to travel in anyway.
 *
 * To add another author, add entries with a new `author`. Nothing filters on
 * it — the footer draws from every quote in the list — so the shelf can widen
 * without touching the component.
 */

export interface Quote {
  /** The passage, without surrounding quote marks — the footer adds those. */
  text: string;
  author: string;
  /** The book it comes from. Shown after the author, so keep it as titled. */
  source: string;
}

/*
 * Kept short on purpose. This sits in a one- or two-line footer under every
 * page, so a passage that runs past about 140 characters starts to look like
 * a paragraph that lost its page. The long ones here are trimmed to the
 * sentence that carries the thought.
 */
export const quotes: readonly Quote[] = [
  {
    text: 'If you only read the books that everyone else is reading, you can only think what everyone else is thinking.',
    author: 'Haruki Murakami',
    source: 'Norwegian Wood',
  },
  {
    text: 'Death is not the opposite of life, but a part of it.',
    author: 'Haruki Murakami',
    source: 'Norwegian Wood',
  },
  {
    text: 'What happens when people open their hearts? They get better.',
    author: 'Haruki Murakami',
    source: 'Norwegian Wood',
  },
  {
    text: "When you come out of the storm, you won't be the same person who walked in. That's what this storm's all about.",
    author: 'Haruki Murakami',
    source: 'Kafka on the Shore',
  },
  {
    text: 'Memories warm you up from the inside. But they also tear you apart.',
    author: 'Haruki Murakami',
    source: 'Kafka on the Shore',
  },
  {
    text: 'Silence, I discover, is something you can actually hear.',
    author: 'Haruki Murakami',
    source: 'Kafka on the Shore',
  },
  {
    text: 'Time weighs down on you like an old, ambiguous dream.',
    author: 'Haruki Murakami',
    source: 'Kafka on the Shore',
  },
  {
    text: 'Every one of us is losing something precious to us. That is part of what it means to be alive.',
    author: 'Haruki Murakami',
    source: 'Kafka on the Shore',
  },
  {
    text: "Closing your eyes and plugging up your ears won't make time stand still.",
    author: 'Haruki Murakami',
    source: 'Kafka on the Shore',
  },
  {
    text: 'I can bear any pain as long as it has meaning.',
    author: 'Haruki Murakami',
    source: '1Q84',
  },
  {
    text: "Whatever it is you're seeking won't come in the form you're expecting.",
    author: 'Haruki Murakami',
    source: '1Q84',
  },
  {
    text: 'A certain type of perfection can only be realized through a limitless accumulation of the imperfect.',
    author: 'Haruki Murakami',
    source: '1Q84',
  },
  {
    text: 'Anyone who falls in love is searching for the missing pieces of themselves.',
    author: 'Haruki Murakami',
    source: 'Sputnik Sweetheart',
  },
  {
    text: "If you can love someone with your whole heart, even one person, then there's salvation in life.",
    author: 'Haruki Murakami',
    source: 'Sputnik Sweetheart',
  },
  {
    text: 'The past increases, the future recedes. Possibilities decreasing, regrets mounting.',
    author: 'Haruki Murakami',
    source: 'Dance Dance Dance',
  },
  {
    text: "There's no such thing as perfect writing, just like there's no such thing as perfect despair.",
    author: 'Haruki Murakami',
    source: 'Hear the Wind Sing',
  },
  {
    text: 'Pain is inevitable. Suffering is optional.',
    author: 'Haruki Murakami',
    source: 'What I Talk About When I Talk About Running',
  },
] as const;

/**
 * One quote, picked at random.
 *
 * Called once per page render, which means the pick happens at build time and
 * every page of the build closes on a different line. That is the whole
 * effect: no script ships, nothing shifts after paint, and a rebuild reshuffles
 * the site. The cost is that two builds of the same commit are not
 * byte-identical — nothing here depends on them being so.
 *
 * A quote that changed on every *visit* would have to be picked in the
 * browser, and that trade is a flash of empty footer against a line that
 * only moves when the site is rebuilt. The line won.
 */
export function pickQuote(): Quote {
  return quotes[Math.floor(Math.random() * quotes.length)];
}
