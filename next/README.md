# HyprTrack website

The public feature showcase and handbook for HyprTrack Desktop. Built with
Next.js 16, React, TypeScript, and plain CSS. Deployed on Vercel as the
`hyprtrack` project at [hyprtrack-delta.vercel.app](https://hyprtrack-delta.vercel.app).
This site is independent of the desktop collector and
never reads a user's activity database.

## Development

Use Node.js 24 (Node.js 20.9 or later is supported):

```sh
cd next
npm ci
npm run dev
```

## Check and build

```sh
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

The browser suite starts its own production server on port 3817. It checks
the handbook, mobile navigation, keyboard controls, nine viewport widths,
copy buttons, all six palettes, appearance persistence, timer deadlines,
restricted storage, 404s, metadata routes, and WCAG accessibility rules.
`PLAYWRIGHT_CHROMIUM_PATH` can select a system browser. Set
`PLAYWRIGHT_BASE_URL` to check a deployed version instead of starting a local
server.

## Deployment

From the repository root, link the `hyprtrack` Vercel project and deploy.
The project's root-directory setting is `next`:

```sh
cd ..
npx vercel link --project hyprtrack
npx vercel deploy --prod
```

The Git-connected Vercel project uses repository root directory `next` and
the Next.js framework preset. The root `.vercelignore` limits CLI uploads to
website source, excluding desktop files, local environments, and build output.
Node.js 24 is recommended. No
secrets are needed by the website. The canonical URL uses
`VERCEL_PROJECT_PRODUCTION_URL` on Vercel, or `NEXT_PUBLIC_SITE_URL` when
explicitly configured.

`lib/site.ts` is the source of truth for the desktop version, release links,
install command, handbook chapters, and palette colors. Update it with a
new desktop release, and review the release page and corresponding docs.

## Design and assets

The site uses an editorial time-journal design: warm paper, carbon ink,
orange accents, an interactive day dial, real desktop screenshots, and a
theme and focus playground. Design references and the original generation
prompts are in `design/`. See [design notes](design/DESIGN.md).

Fonts are served locally with their OFL licenses in `public/fonts`. The
desktop screenshots are the repository's sample-data screenshots, not
personal activity. The browser playground uses illustrative data, and its
timer is stored only in the current browser.

Official references: [Next.js App Router](https://nextjs.org/docs/app),
[Vercel CLI deployments](https://vercel.com/docs/cli/deploy).
