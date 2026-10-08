/**
 * /about — copy in one place, like `home.ts`.
 *
 * A first draft, assembled from what the site and the resume already say.
 * Rewrite freely: this page is the one meant to be in my own words.
 */
export const about = {
  who: [
    'Technical Project Manager by title, software engineer by temperament. I started out writing production .NET, grew into leading the team that wrote it, and now run delivery for distributed teams — offshore centres, client stakeholders and all.',
    'Most of that work has been healthcare, security, agriculture and social platforms, delivered for clients in Australia, New Zealand, the US and Asia from Ho Chi Minh City.',
  ],
  philosophy: {
    quote:
      'I understand software deeply enough to build it, and delivery deeply enough to lead the people who build it.',
    points: [
      'A plan is only as good as the technical assumptions under it — so I keep enough depth to challenge them.',
      'Teams ship better when the standards are explicit and the reasons behind them are, too.',
      'Write it down. Every project on this site has a "lessons learned", because the next one needs it.',
      'Still build things. It keeps the estimates honest.',
    ],
  },
  interests: [
    { label: 'BUILDING', body: 'Gunpla and scale models — slow, fiddly, and documented.', href: '/builds' },
    { label: 'PLAYING', body: 'PlayStation, mostly. Platinums, occasionally on purpose.', href: '/games' },
    { label: 'READING', body: 'Murakami more than is reasonable; history and science when not.', href: '/books' },
    { label: 'TRAVELLING', body: 'Photographs from the places that were worth the flight.', href: '/journeys' },
  ],
} as const;
