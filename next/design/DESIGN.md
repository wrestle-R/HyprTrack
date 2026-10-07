# Time leaves a trace

Five separate section references were generated with the built-in image
tool before implementing the website. `prompts.json` records the full prompts;
`hero.png`, `features.png`, `themes.png`, `install.png`, and `docs.png` preserve
the original references. They are design material and are not shipped as
website backgrounds.

## Extraction and implementation

- **Hero:** an open, asymmetric two-column composition. A heavy two-line
  headline contrasts with one large italic serif word. The right side is
  a 24-hour instrument, built as SVG and connected to a native range input.
  Its sample activity uses orange, moss, neutral, and untracked segments.
  Fine hour ticks and the moving pointer have a real reading purpose.
- **Product:** a large screenshot occupies the wide side of the layout;
  three plain selectors sit alongside it. A low, ruled three-column row
  explains the product. Real repository screenshots replace the concept's
  invented app UI. Captions identify the screenshots as sample data.
- **Rhythm:** a carbon-black section changes the visual tempo. The left
  side is a six-palette preview; the right is an analog focus timer.
  One vertical rule separates the two without extra wrappers. Exact
  desktop palette colors are kept in `lib/site.ts`.
- **Install:** oversized two-line type and simple actions balance a single
  dark, copyable terminal. Code scrolls within its own area. The footer
  remains a low horizontal strip separated by a fine rule.
- **Docs:** an unboxed chapter rail, a fine divider, and a generous article
  column. Large editorial titles introduce readable body copy, numbered
  sections, and clear code examples. On phones, chapters collapse behind
  an accessible button, keeping the article close to the top.

## Visual system

Bone paper `#f3f0e8`, carbon `#191916`, burnt orange `#e96a36`, and muted
moss define the palette. Small orange text uses a darker shade for contrast;
dark backgrounds use a lighter orange. Rules are quiet and thin. Buttons
have minimal rounding. There are no gradients, nested marketing cards,
stock photos, invented testimonials, or activity data from a real user.

Bricolage Grotesque supplies the heavy display voice, Outfit the readable
body, and Instrument Serif the expressive italics. The existing HyprTrack
pulse mark ties the website to the desktop app. Font files and licenses are
self-hosted.

The four signature components are the day dial, screenshot explorer,
palette preview, and focus dial. The two primary motion cues are the moving
day pointer and the circular appearance reveal. A short fade accompanies
screenshot changes. Reduced-motion settings remove decorative motion.

Desktop layouts use generous gutters and deliberately varied section
rhythm. At tablet widths the screenshot selectors move below the preview;
on phones the hero, theme demo, focus dial, and installation become separate
readable blocks. Interactions keep their labels and native keyboard controls.
