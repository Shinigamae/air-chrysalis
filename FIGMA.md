You are the lead frontend architect for my personal website project: SHINIGAMAE.DEV.

We are now moving from the Figma design phase into implementation.

IMPORTANT:
Do not redesign the website or invent a new visual direction.
The visual/design direction has already been established in Figma and should be treated as the source of truth for the design language.

Your task in this step is ONLY to build the application foundation / App Shell and establish a clean frontend architecture that we can build the rest of the website on top of.

==================================================
PROJECT CONTEXT
==================================================

SHINIGAMAE.DEV is a personal digital workshop / archive.

The website will contain:

- Home
- Workshop
- Builds
- Games
- Books
- Lab

The overall design language is:

- Dark editorial
- Technical manual
- Premium / minimal
- PlayStation UI influence
- Mechanical / engineering-inspired details
- Photography-driven
- Strong negative space
- Thin borders and structured panels
- Technical metadata
- Modern typography
- Restrained animation

IMPORTANT:
This is NOT generic cyberpunk.

Avoid:
- excessive neon
- glowing UI everywhere
- hacker aesthetics
- overly rounded SaaS cards
- glassmorphism
- excessive gradients
- noisy backgrounds
- unnecessary animations

The intended feeling is closer to:

"premium personal archive + technical workshop + modern editorial publication"

==================================================
DESIGN TOKENS
==================================================

Use these as the initial source of truth.

Colors:

Canvas / Graphite:
#09090B

Panel:
#18181B

Border / Divider:
#27272A

Primary Text:
#E4E4E7

Muted Text:
#A1A1AA

Signal / Accent Cyan:
#38BDF8

Typography:

Primary:
Space Grotesk

Technical / metadata:
IBM Plex Mono

Spacing system:

8px base unit

8
16
24
40
64

Border radius:

4px
8px

Motion:

150–220ms

Animation should be subtle and purposeful.

==================================================
EXISTING DESIGN SYSTEM
==================================================

The Figma design already establishes these reusable components:

- Sidebar
- Sidebar Item
- Top Bar
- Mobile Navigation
- Page Header
- Section Header
- Editorial Card
- Status Label
- Filter Control
- Spec Row

These should become reusable frontend components.

Do NOT create separate one-off versions of these components for every page.

Build a coherent component system.

==================================================
STEP 1 — APP SHELL
==================================================

Your immediate goal is to implement:

1. Global design tokens
2. Global typography
3. Application layout
4. Desktop sidebar
5. Desktop top bar
6. Mobile navigation/header
7. Routing structure
8. Basic responsive behavior
9. Component architecture
10. Page placeholders

Refer to this architecture:

Astro
├── TailwindCSS
├── React components only where useful
├── Static content
└── JSON / Markdown data

with content structure may look like this:

content/
├── builds/
│   ├── astray-gold-frame.json
│   └── destiny-gundam.json
├── games/
│   └── games.json
├── books/
│   └── books.json
└── projects/
    └── projects.json

Later we will add a proper backend (.NET REST API) with database in near future.

Do NOT build detailed page content yet.

We will implement Home, Workshop, Builds, Games, Books and Lab properly in later steps.

==================================================
APPLICATION STRUCTURE
==================================================

The intended navigation is:

SHINIGAMAE.DEV

HOME
WORKSHOP
BUILDS
GAMES
BOOKS
LAB

Desktop:

┌───────────────────────────────────────────────┐
│ SIDEBAR │ TOP BAR                             │
│         │                                     │
│ HOME    │                                     │
│ WORKSHOP│         PAGE CONTENT                │
│ BUILDS  │                                     │
│ GAMES   │                                     │
│ BOOKS   │                                     │
│ LAB     │                                     │
│         │                                     │
└───────────────────────────────────────────────┘

Mobile:

┌───────────────────────────┐
│ LOGO              MENU    │
├───────────────────────────┤
│                           │
│       PAGE CONTENT        │
│                           │
└───────────────────────────┘

The desktop sidebar should disappear/reconfigure at the mobile breakpoint.

Do not simply shrink the desktop sidebar into mobile.

==================================================
ROUTING
==================================================

Create routes for:

/
 /workshop
 /builds
 /games
 /books
 /lab

Each route should initially render a minimal placeholder using the shared PageHeader component.

The routing architecture should make it easy to add nested detail pages later, for example:

/builds/:slug
/games/:slug
/books/:slug

Do not implement the detail pages yet.

==================================================
COMPONENT ARCHITECTURE
==================================================

Create a clean reusable structure.

For example:

components/
  layout/
    AppShell
    Sidebar
    SidebarItem
    TopBar
    MobileNavigation

  ui/
    PageHeader
    SectionHeader
    EditorialCard
    StatusLabel
    FilterControl
    SpecRow

pages/
  Home
  Workshop
  Builds
  Games
  Books
  Lab

styles/
  tokens
  typography
  globals

Use sensible naming based on the framework already present in the repository.

Do not blindly create this exact directory structure if the existing project has a better established convention.

First inspect the repository.

==================================================
IMPORTANT DEVELOPMENT RULE
==================================================

Before changing anything:

1. Inspect the existing repository.
2. Identify:
   - framework
   - package manager
   - routing solution
   - styling approach
   - existing component structure
   - existing dependencies
   - build tooling
3. Do not replace the existing stack unless there is a strong technical reason.
4. Reuse existing infrastructure where appropriate.
5. Keep the implementation idiomatic for the project's framework.

If the repository is already partially implemented, preserve useful existing work.

Do not blindly overwrite files.

==================================================
DESIGN IMPLEMENTATION
==================================================

Implement the design tokens in the project's native styling system.

For example, if appropriate:

--color-canvas: #09090B
--color-panel: #18181B
--color-border: #27272A
--color-text: #E4E4E7
--color-muted: #A1A1AA
--color-signal: #38BDF8

Spacing should follow the 8px system.

Typography should distinguish:

Display / headings:
Space Grotesk

Technical metadata:
IBM Plex Mono

Metadata should feel intentionally technical rather than decorative.

Examples:

BUILD / 001
CUSTOM BUILD
2026.09
STATUS: ARCHIVE

==================================================
SIDEBAR
==================================================

The desktop sidebar should feel like a permanent navigation rail.

Include:

SHINIGAMAE.DEV
PERSONAL DIGITAL WORKSHOP

Navigation:

HOME
WORKSHOP
BUILDS
GAMES
BOOKS
LAB

The active navigation item should be clearly identifiable but restrained.

Use the cyan accent as a signal rather than flooding the interface with cyan.

The sidebar should have:

- dark graphite background
- subtle border
- strong spacing
- technical typography
- restrained active state

==================================================
TOP BAR
==================================================

Create a reusable desktop TopBar.

It should provide:

- current page/context
- optional metadata
- restrained technical UI

Do not fill it with unnecessary controls.

Keep it minimal.

==================================================
MOBILE NAVIGATION
==================================================

Create a mobile navigation/header that replaces the desktop sidebar.

Requirements:

- compact
- dark
- clean
- responsive
- easy to extend later

Use the same visual language as desktop.

Do not attempt to squeeze the desktop sidebar into the mobile layout.

==================================================
RESPONSIVE BEHAVIOR
==================================================

Establish a sensible responsive foundation.

At minimum consider:

Desktop
Tablet
Mobile

The design should preserve:

- negative space
- typography hierarchy
- readable content width
- consistent spacing

Do not use arbitrary per-component breakpoints everywhere.

Prefer a small coherent breakpoint system.

==================================================
ACCESSIBILITY
==================================================

Build the foundation correctly.

Include:

- semantic navigation
- accessible buttons
- keyboard focus states
- sufficient contrast
- proper heading hierarchy
- aria labels where necessary
- visible focus indication
- reduced-motion consideration

Do not sacrifice the visual design for accessibility, but do not ignore accessibility either.

==================================================
ANIMATION
==================================================

Keep motion restrained.

Use approximately:

150–220ms

Good examples:

- navigation state transitions
- hover state
- subtle border/accent transitions
- mobile menu transition

Avoid:

- constant animations
- excessive transforms
- glowing effects
- parallax
- gimmicky transitions

==================================================
CODE QUALITY
==================================================

Prioritize:

- reusable components
- clear naming
- separation of concerns
- type safety if supported
- minimal duplication
- maintainability
- responsive behavior
- accessibility

Do not over-engineer.

Do not create an elaborate design-system framework inside the project.

The goal is a clean foundation that can evolve.

==================================================
WHAT NOT TO DO
==================================================

Do NOT:

- redesign the visual identity
- introduce a different color palette
- add gradients everywhere
- turn it into a cyberpunk website
- add unnecessary 3D effects
- add excessive glassmorphism
- add huge animated backgrounds
- build all six pages in detail
- create fake content systems yet
- add unnecessary libraries
- rewrite the entire project architecture without justification
- optimize prematurely
- build backend/CMS functionality yet

==================================================
DELIVERABLE
==================================================

At the end of this step, I expect:

1. A working application shell.
2. Global design tokens.
3. Typography setup.
4. Desktop sidebar.
5. Desktop top bar.
6. Mobile navigation/header.
7. Responsive layout foundation.
8. Routes for all six main sections.
9. Reusable component structure.
10. Minimal placeholder pages.
11. No build/lint/type errors.
12. A clean foundation ready for Step 2.

==================================================
WORKFLOW
==================================================

Work incrementally.

First inspect the repository and explain what you found.

Then propose the smallest implementation plan needed for Step 1.

Then implement it.

After implementation:

- run the appropriate build command
- run lint/type checks if available
- fix any errors
- inspect the resulting UI if the environment allows it

Do not stop after merely creating files.

Verify that the application actually runs.

==================================================
IMPORTANT FINAL REQUIREMENT
==================================================

When finished, report:

A. What you changed
B. Which files were created/modified
C. How the architecture is structured
D. What commands/checks you ran
E. Whether the build passes
F. Any remaining issues
G. What you recommend for Step 2

Do not proceed into detailed page design for Step 2 unless I explicitly ask you to.

Start by inspecting the existing repository.