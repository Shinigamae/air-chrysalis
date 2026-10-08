import { navigation } from "./site";

/*
 * Card art is imported, not referenced by path, so it goes through
 * astro:assets: the build resizes and re-encodes each photo and the card
 * serves a srcset. The originals live in src/assets/home/ for that reason —
 * anything in public/ is copied out byte for byte. See IMAGES.md.
 */
import buildArchiveImage from "@/assets/home/build-archive.jpg";
import gamingLogImage from "@/assets/home/gaming-log.jpg";
import readingLogImage from "@/assets/home/reading-log.jpg";
import workshopImage from "@/assets/home/workshop.jpg";

/**
 * Homepage content — Figma "02 — Homepage" (4:3).
 *
 * Kept out of the template so the copy is editable in one place.
 *
 * The four cards do not carry their own descriptions. Each one is a door to a
 * section, and the section already has a line describing itself in
 * `navigation` — writing it twice meant the homepage and the page it linked
 * to could disagree about what the section was for, and for a while they did.
 */

/** The section's own tagline, so a card and its destination cannot drift. */
function summaryFor(href: string): string {
  const entry = navigation.find((nav) => nav.href === href);
  if (!entry) throw new Error(`No navigation entry for ${href}`);
  return entry.summary;
}

/**
 * The hero says the job first. A first-time visitor gets the role, one line
 * of what that means, and two doors — the work and the resume — before
 * anything else on the page asks for attention.
 *
 * CODE. BUILD. PLAY. READ. stays, set smaller beside it: still the brand, now
 * the second thing read rather than the first. Its words come from
 * `lifestyle.cards` below plus CODE for the Workshop, so each one still opens
 * the section it names.
 */
export const hero = {
  eyebrow: "01 / HELLO",
  title: ["TECHNICAL PROJECT MANAGER.", "SOFTWARE ENGINEER AT HEART."],
  lead: "I lead software teams, design systems, and still build things.",
  focus: "ARCHITECTURE · DELIVERY · ENGINEERING LEADERSHIP",
  primary: { label: "VIEW MY WORK →", href: "/workshop" },
  secondary: { label: "RESUME →", href: "/resume" },
  /** Reads off the four words stacked beside it. */
  intro:
    "One of these pays the bills. The other three explain where the evenings went.",
} as const;

/**
 * What I do — five practices, the last one short on purpose. The homepage
 * shows these; the Workshop's CAPABILITIES is the long form, so the two say
 * different amounts of one thing rather than the same thing twice.
 */
export const whatIDo = {
  eyebrow: "02 / WHAT I DO",
  title: "WHAT I DO",
  summary: "A record of what I have built, led, fixed, and learned.",
  items: [
    {
      title: "TECHNICAL PROJECT MANAGEMENT",
      body: "Turning ambiguous requirements into executable plans, milestones, ownership, and predictable delivery.",
    },
    {
      title: "ENGINEERING LEADERSHIP",
      body: "Leading developers, reviewing technical decisions, setting engineering standards, and keeping delivery aligned with business goals.",
    },
    {
      title: "SOFTWARE ARCHITECTURE",
      body: "Designing systems that balance maintainability, performance, security, scalability, and operational cost.",
    },
    {
      title: "DELIVERY & TRANSFORMATION",
      body: "Modernising legacy systems, coordinating migrations, and helping teams through difficult technical change.",
    },
    {
      title: "SOFTWARE ENGINEERING",
      body: "Still writing code when the problem demands it.",
    },
  ],
} as const;

/** The long form of WHAT I DO, on the Workshop. Grouped, not a keyword wall. */
export const capabilities = [
  {
    label: "PROJECT & DELIVERY",
    items: ["Technical project management", "Agile & Kanban delivery", "Planning & estimation", "Stakeholder management", "Risk management", "Cross-functional coordination"],
  },
  {
    label: "ENGINEERING",
    items: ["Software development", "Code review", "System design", "API design", "Database design", "Testing", "DevOps"],
  },
  {
    label: "ARCHITECTURE",
    items: ["Cloud architecture", "Application modernisation", "Integration", "Security", "Scalability", "Cost optimisation"],
  },
  {
    label: "TECHNOLOGY",
    items: [".NET", "Angular", "Azure", "SQL Server", "Java", "AWS"],
  },
] as const;

/**
 * Career as a progression, not a chronology: titles in the order they were
 * held, no dates. The ladder is the resume's own — no title appears here that
 * the resume does not hold.
 */
export const career = {
  eyebrow: "04 / CAREER",
  title: "CAREER",
  summary: "Progression, not a timeline.",
  steps: [
    {
      title: "SOFTWARE ENGINEER",
      body: "Building production software and learning systems from the inside out.",
    },
    {
      title: "TEAM LEAD / PROJECT LEAD",
      body: "Leading developers, technical decisions, and delivery — and growing the team that does it.",
    },
    {
      title: "TECHNICAL PROJECT MANAGER",
      body: "Leading delivery while keeping enough technical depth to challenge assumptions and make informed decisions.",
    },
  ],
} as const;

/**
 * The homepage's SELECTED WORK. Clients by name, then the projects named
 * here — never ordered by date, which would put the current engagement first.
 */
export const selectedWork = {
  eyebrow: "03 / SELECTED WORK",
  title: "SELECTED WORK",
  summary: "The strongest examples. The Workshop has the rest, in full.",
  projects: ["shinigamae-dev", "guild-management-platform"],
  action: "VIEW ALL WORK →",
} as const;

/** The homepage's closing section. */
export const contact = {
  eyebrow: "07 / CONTACT",
  title: ["NEED SOMEONE WHO UNDERSTANDS", "BOTH THE PRODUCT AND THE CODE?"],
  summary: "Let's talk.",
} as const;

export interface StatusItem {
  label: string;
  value: string;
}

/**
 * The status panel is half declared and half observed.
 *
 * `PLAYING` and `READING` are filled in from the collections by the homepage,
 * because the syncs already know the answer and a hand-typed one goes stale
 * silently — this panel claimed a game the gaming log had not shown as
 * current for months. `BUILDING` and `NEXT BUILD` stay here: they are
 * intentions, and no feed can tell you what you mean to do next.
 */
export const currentStatus = {
  eyebrow: "06 / NOW",
  label: "CURRENT STATUS",
  headline: "WORKSHOP / ONLINE",
  building: {
    label: "BUILDING",
    value: "Personal website",
  } satisfies StatusItem,
  nextBuild: {
    label: "NEXT BUILD",
    value: "Qubeley Mk. II",
  } satisfies StatusItem,
  /** Shown when nothing on a shelf is marked current. */
  idle: "—",
} as const;

/**
 * The archive, as doors. The homepage shows them as compact numbers; the
 * /lifestyle hub shows them as cards.
 */
export const lifestyle = {
  eyebrow: "05 / LIFESTYLE",
  title: "LIFESTYLE",
  summary: "Not a résumé. A record of where the time goes.",
  action: "ENTER LIFESTYLE →",
  cards: [
    {
      kicker: "BUILD",
      title: "BUILD ARCHIVE",
      subtitle: "Gunpla / Models",
      href: "/builds",
      summary: summaryFor("/builds"),
      image: buildArchiveImage,
    },
    {
      kicker: "PLAY",
      title: "GAMING LOG",
      subtitle: "PlayStation / Games",
      href: "/games",
      summary: summaryFor("/games"),
      image: gamingLogImage,
    },
    {
      kicker: "READ",
      title: "READING LOG",
      subtitle: "Books / Goodreads",
      href: "/books",
      summary: summaryFor("/books"),
      image: readingLogImage,
    },
    {
      kicker: "TRAVEL",
      title: "JOURNEYS",
      subtitle: "Places / Photographs",
      href: "/journeys",
      summary: summaryFor("/journeys"),
      image: undefined,
    },
  ],
} as const;

/** The CODE word's door — the one hero word that is not in `lifestyle`. */
export const workshopDoor = {
  kicker: "CODE",
  title: "WORKSHOP",
  href: "/workshop",
  image: workshopImage,
} as const;

/** The affordance text on every homepage card. */
export const cardAction = "VIEW →";
