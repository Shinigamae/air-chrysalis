/**
 * The resume, as data — the /resume page renders it, and the PDF beside it
 * in public/resume/ is the same document as it was sent out.
 *
 * Transcribed from the Technical PM CV (April 2026), with three deliberate
 * differences from the PDF:
 *
 * - No phone number, street address or email. The page is public and
 *   anything can scrape it; the reason `site.contact` is LinkedIn and not an
 *   address applies here too. The PDF carries them, and a reader who wants
 *   them has it one press away.
 *
 * - Key projects carry no dates, and are in name order. Two of the four are
 *   client engagements still running, and a "2017 – current" beside one of
 *   them tells every client reading which account has my attention — the
 *   rule the Workshop's client list follows (src/config/clients.ts). Dates on
 *   only the finished ones would say the same thing by their absence.
 *
 * - The project copy is in the past tense for the same reason: "today the
 *   team has expanded to…" dates itself and names the current one.
 *
 * Update this when the PDF changes, and `updated` with it.
 */

export interface ResumeRole {
  title: string;
  company: string;
  location: string;
  /** 'YYYY-MM'. */
  from: string;
  /** Omitted while the role is held. An employer, not a client — fine to show. */
  to?: string;
  points: string[];
}

export interface ResumeProject {
  name: string;
  domain: string;
  /** What I was on it, in a few words. */
  role: string;
  summary: string[];
  keywords: string[];
}

/** When the first role began — the start of the count the site prints. */
const FIRST_ROLE = '2011-12';

export const resume = {
  name: 'Khanh Nguyen Tuan',
  headline: 'Technical Project Manager and Team Lead',
  location: 'Ho Chi Minh City, Vietnam',
  /** When the PDF was last revised — printed so a reader knows how fresh it is. */
  updated: '2026-04',
  pdf: {
    href: '/resume/Khanh-Nguyen-Tuan-Resume.pdf',
    /** The name the browser saves it under. */
    filename: 'Khanh-Nguyen-Tuan-Resume.pdf',
    size: '232 KB',
    pages: 5,
  },

  metrics: [
    { value: `${yearsSince(FIRST_ROLE)}+`, label: 'years in delivery' },
    { value: '7 → 32', label: 'ODC members, one client' },
    { value: '200', label: 'developers, one programme' },
    { value: '2–12', label: 'month delivery timelines' },
  ],

  summary: [
    'Technical Manager and Team Lead with a record of building and scaling offshore development centres, and of delivering healthcare products that ship. Strongest at problem-solving, cross-functional communication, and building the kind of working environment that raises a team’s performance, quality and technical standards.',
    'A .NET engineer underneath: designing and building web and application solutions, and choosing between architectural patterns — monolith or microservices — for resilience and performance.',
    'End-to-end delivery, from the first proposal and estimate through documentation and UAT to the years of maintenance after.',
  ],

  accomplishments: [
    {
      lead: 'Scaled an offshore development centre from 7 to 32 billable members',
      rest: 'for a key Australian healthcare client between 2017 and 2025, widening both what the team could deliver and how much of the client’s business it covered.',
    },
    {
      lead: 'Led cross-functional, distributed teams',
      rest: 'to deliver products across several business domains, on timelines from two to twelve months between kick-off and production.',
    },
    {
      lead: 'Primary client liaison for new business and product consultation',
      rest: 'while also writing and running internal training on emerging technologies.',
    },
  ],

  experience: [
    {
      title: 'Technical Project Manager',
      company: 'TMA Solutions',
      location: 'Ho Chi Minh City',
      from: '2019-12',
      points: [
        'Introduced current technologies that moved the company’s digital transformation forward.',
        'Ran delivery on Agile, Kanban, or a mix of the two, chosen per project.',
        'Kept client data secure under strict cyber-security practice.',
        'Raised customer satisfaction by resolving technical complaints quickly.',
        'Led the development team and improved product efficiency.',
        'Wrote technical documentation and training material for the teams.',
        'Coordinated cross-functional teams toward shared project goals.',
      ],
    },
    {
      title: 'Team Lead / Project Lead',
      company: 'TMA Solutions',
      location: 'Ho Chi Minh City',
      from: '2014-03',
      to: '2019-12',
      points: [
        'Tracked team performance metrics and acted on what they showed.',
        'Mediated conflict and kept the team working together.',
        'Assessed capabilities and assigned work to match.',
        'Built the communication channels that kept information moving.',
        'Onboarded new hires so they were productive sooner.',
        'Spent three months in New Zealand each year supporting business users on site.',
      ],
    },
    {
      title: 'Software Engineer',
      company: 'TMA Solutions',
      location: 'Ho Chi Minh City',
      from: FIRST_ROLE,
      to: '2013-02',
      points: [
        'Built software shaped by client needs and technical constraints.',
        'Ran quality checks that held the product to a high standard.',
        'Delivered on schedule, mostly under a waterfall model.',
        'Resolved complex defects to keep systems running.',
        'Optimised code for performance, and integrated third-party services.',
      ],
    },
  ] satisfies ResumeRole[],

  projects: [
    {
      name: 'Australian Nursing Home Management System',
      domain: 'Healthcare · Aged care',
      role: 'Team Lead, then Technical Project Manager',
      summary: [
        'A system linking pharmacies and nursing homes to simplify medication administration for residents. It began with four developers and three QAs; I was promoted to manager at the customer’s request after a visit to their Sydney headquarters.',
        'The team grew to 14 developers, 16 QAs across manual and automated testing, and 2 business analysts, on Kanban with a predictable release rhythm — major updates monthly, hotfixes as production needed them — across the whole cycle on Azure, with CI/CD on GitHub and Azure DevOps.',
      ],
      keywords: ['.NET', 'Angular', 'Flutter', 'SQL Server', 'Azure', 'Azure DevOps', 'Kanban'],
    },
    {
      name: 'Multi-purpose Social Network Ecosystem',
      domain: 'Social · eCommerce · Booking',
      role: 'Assistant Architect',
      summary: [
        'Led the Social module of an ecosystem that also carries e-commerce and booking, built on Java microservices and a set of cross-connected Angular applications.',
        'Worked with the lead architect on the technical vision and the contracts between modules; set up project structures, documentation and communication across all of them; planned deployments and migrations; and reviewed code across frontend, backend and mobile to one standard. By the end of 2024 the programme was 200 developers under 6 product owners.',
      ],
      keywords: ['Java', 'Microservices', 'Angular', 'PostgreSQL', 'Cassandra', 'Neo4j', 'Maven', 'GitLab CI/CD'],
    },
    {
      name: 'New Zealand Kiwifruit Export Management System',
      domain: 'Fruit export · Legacy systems',
      role: 'Software Engineer, then Team Lead',
      summary: [
        'A decade-old ecosystem covering the whole business, from growers in the orchard to packhouse workers and market distribution. I joined as the only engineer, learned the business and its applications, and then formed the team that carried its development forward.',
        'Translating changing business needs into features on older technology was the core of the work — along with two to three months in New Zealand every season, alongside the users.',
      ],
      keywords: ['.NET', 'SQL Server', 'MS Office', 'On-site delivery', 'Legacy systems'],
    },
    {
      name: 'US Security Platform Management Applications',
      domain: 'Security · Multi-tenant',
      role: 'Technical Project Manager',
      summary: [
        'Led a local team of four developers on a platform used by banks, financial firms and the US Department of Defense, alongside teams in the US, UK and India.',
        'The team owned the frontend applications — investigating and resolving production issues, keeping them rare — and contributed automated tests and high unit-test coverage. Releases went out through Jenkins to AWS and GCP.',
      ],
      keywords: ['Angular', 'Automation testing', 'Unit testing', 'Jenkins', 'AWS', 'GCP'],
    },
  ] satisfies ResumeProject[],

  skills: [
    {
      label: 'ENGINEERING',
      tags: ['.NET', 'Azure', 'Java', 'Microservices', 'Angular', 'SQL databases', 'NoSQL databases'],
    },
    { label: 'DELIVERY', tags: ['Agile', 'Kanban', 'Azure DevOps', 'GitLab CI/CD', 'UAT', 'Estimation'] },
    {
      label: 'LEADERSHIP',
      tags: ['Team development', 'Project management', 'Offshore centres', 'Client relationships', 'Training'],
    },
    { label: 'TOOLS', tags: ['Jira', 'Confluence', 'Bitbucket', 'Trello', 'Slack', 'Teams', 'Discord'] },
  ],
} as const;

/** Whole years from a 'YYYY-MM' to the build date. */
export function yearsSince(from: string, now = new Date()): number {
  const [year, month] = from.split('-').map(Number);
  return Math.floor(((now.getFullYear() - year) * 12 + now.getMonth() + 1 - month) / 12);
}

/**
 * Whole years in software, counted at build time. The hero and the metrics
 * both print it, and a typed number is the kind that goes stale.
 */
export const yearsInSoftware = () => yearsSince(FIRST_ROLE);
