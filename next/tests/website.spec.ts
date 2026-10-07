import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const chapters = ["getting-started","collector","themes-and-focus","mappings","shortcuts","updating","privacy","troubleshooting"];

test("home and every handbook chapter render without browser errors", async ({page}) => {
  const errors:string[] = [];
  page.on("pageerror",error => errors.push(error.message));
  for (const path of ["/",...chapters.map(slug => `/docs/${slug}`),"/releases"]) {
    const response = await page.goto(path);
    expect(response?.status(),path).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),path).toBe(true);
    await expect(page.locator('a[href*="releases/download/v2.1.0/"]').first()).toHaveAttribute("href",/HyprTrack\.Desktop_2\.1\.0_amd64\.AppImage$/);
  }
  expect(errors).toEqual([]);
});

test("responsive layouts keep the page and major text inside the viewport",async({page}) => {
  for (const width of [320,360,480,640,768,1024,1280,1440,1920]) {
    await page.setViewportSize({width,height:900});
    for (const path of ["/","/docs/updating","/docs/collector","/releases"]) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth),`${path} at ${width}px`).toBeLessThanOrEqual(width + 1);
      const clipped = await page.locator("h1,h2,.hero-description,.section-heading > p").evaluateAll(nodes => nodes.filter(node => {const r=node.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth+1;}).map(node => node.textContent));
      expect(clipped,`${path} text at ${width}px`).toEqual([]);
    }
  }
});

test("the day instrument responds to keyboard input",async({page}) => {
  await page.goto("/");
  const slider=page.getByRole("slider",{name:/Drag through a day/});
  await expect(page.locator(".dial-time")).toHaveText("08:42");
  await slider.fill("660");
  await expect(page.locator(".dial-time")).toHaveText("11:00");
  await expect(page.locator(".dial-app")).toHaveText("Firefox");
  await slider.focus(); await page.keyboard.press("ArrowRight");
  await expect(page.locator(".dial-time")).toHaveText("11:01");
});

test("all six palettes and both preview modes respond",async({page}) => {
  await page.goto("/");
  for (const name of ["Sage","Ocean","Sand","Rose","Plum","Orange"]) {
    await page.getByRole("radio",{name,exact:true}).check();
    await expect(page.locator(".theme-demo")).toHaveAttribute("data-palette",name.toLowerCase());
    await page.getByRole("button",{name:"Light",exact:true}).click();
    await expect(page.locator(".theme-demo")).toHaveAttribute("data-mode","light");
    await page.getByRole("button",{name:"Dark",exact:true}).click();
    await expect(page.locator(".theme-demo")).toHaveAttribute("data-mode","dark");
  }
});

test("website appearance persists and respects reduced motion",async({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await page.getByRole("button",{name:"Switch to dark mode"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await page.reload();
  await expect(page.getByRole("button",{name:"Switch to light mode"})).toBeVisible();
  await page.getByRole("button",{name:"Switch to light mode"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
});

test("appearance fades when view transitions are unavailable",async({page}) => {
  await page.addInitScript(() => Object.defineProperty(document,"startViewTransition",{value:undefined}));
  await page.goto("/");
  await page.getByRole("button",{name:"Switch to dark mode"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await expect(page.getByRole("button",{name:"Switch to light mode"})).toBeVisible();
  await page.getByRole("button",{name:"Switch to light mode"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
});

test("screenshot tabs replace the image and work from the keyboard",async({page}) => {
  await page.goto("/");
  await page.getByRole("tab",{name:/A lighter view/}).click();
  await expect(page.getByRole("tabpanel").getByRole("img")).toHaveAttribute("alt",/light overview/);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab",{name:/Time to focus/})).toHaveAttribute("aria-selected","true");
  await expect(page.getByRole("tabpanel").getByRole("img")).toHaveAttribute("alt",/Pomodoro/);
});

test("timer counts down, pauses, restores, completes, and resets",async({page}) => {
  await page.clock.install({time:new Date("2026-10-07T12:00:00Z")});
  await page.clock.pauseAt(new Date("2026-10-07T12:01:00Z"));
  await page.goto("/");
  await page.getByRole("button",{name:"Start a session"}).click();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("timer")).toHaveText("24:00");
  await page.getByRole("button",{name:"Pause the session"}).click();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("timer")).toHaveText("24:00");
  await page.reload();
  await expect(page.getByRole("button",{name:"Resume the session"})).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("24:00");
  await page.getByRole("button",{name:"Resume the session"}).click();
  await page.clock.fastForward(1_440_000);
  await expect(page.getByRole("timer")).toHaveText("00:00");
  await expect(page.getByText("Session complete. Take a moment for yourself.")).toBeVisible();
  await page.getByRole("button",{name:"Short break",exact:true}).click();
  await expect(page.getByRole("timer")).toHaveText("05:00");
  await page.getByRole("button",{name:"Long break",exact:true}).click();
  await expect(page.getByRole("timer")).toHaveText("15:00");
  await page.getByRole("button",{name:"Reset timer"}).click();
  await expect(page.getByRole("timer")).toHaveText("15:00");
});

test("timer retains its deadline across a running reload",async({page}) => {
  await page.clock.install({time:new Date("2026-10-07T12:00:00Z")});
  await page.clock.pauseAt(new Date("2026-10-07T12:01:00Z"));
  await page.goto("/");
  await page.getByRole("button",{name:"Start a session"}).click();
  await expect(page.getByRole("button",{name:"Pause the session"})).toBeVisible();
  await page.clock.fastForward(120_000);
  await expect(page.getByRole("timer")).toHaveText("23:00");
  await page.reload();
  await expect(page.getByRole("timer")).toHaveText("23:00");
  await expect(page.getByRole("button",{name:"Pause the session"})).toBeVisible();
});

test("docs search, mobile navigation, and adjacent chapters work",async({page},testInfo) => {
  await page.goto("/docs");
  await expect(page).toHaveURL(/\/docs\/getting-started$/);
  if (testInfo.project.name === "mobile") await page.getByRole("button",{name:/Chapters/}).click();
  await page.getByRole("searchbox",{name:"Find a chapter"}).fill("collector");
  await expect(page.getByRole("navigation",{name:"Documentation chapters",exact:true}).getByRole("link")).toHaveCount(1);
  await page.getByRole("navigation",{name:"Documentation chapters",exact:true}).getByRole("link",{name:"The collector"}).click();
  await expect(page).toHaveURL(/\/docs\/collector$/);
  await page.getByRole("navigation",{name:"Adjacent documentation chapters"}).getByRole("link",{name:/Next.*Themes/}).click();
  await expect(page).toHaveURL(/\/docs\/themes-and-focus$/);
});

test("mobile menu closes with Escape and navigation",async({page},testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  await page.getByRole("button",{name:"Open menu"}).click();
  await expect(page.getByRole("navigation",{name:"Main navigation"})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button",{name:"Open menu"})).toBeFocused();
  await page.getByRole("button",{name:"Open menu"}).click();
  await page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:"Docs"}).click();
  await expect(page).toHaveURL(/getting-started$/);
  await expect(page.getByRole("button",{name:"Open menu"})).toBeVisible();
});

test("install commands copy exactly and remain selectable",async({page,context}) => {
  await context.grantPermissions(["clipboard-read","clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button",{name:"Copy Quick start / Arch Linux x86_64 commands"}).click();
  await expect(page.getByText("Copied",{exact:true})).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("releases/download/v2.1.0/HyprTrack.Desktop_2.1.0_amd64.AppImage");
  expect(copied).toContain("chmod +x ~/.local/bin/hyprtrack-desktop.AppImage");
});

test("restricted browser storage does not break interactions",async({page}) => {
  await page.addInitScript(() => {Object.defineProperty(window,"localStorage",{get(){throw new Error("Storage unavailable");}});});
  await page.goto("/");
  await page.getByRole("button",{name:"Switch to dark mode"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await page.getByRole("button",{name:"Start a session"}).click();
  await expect(page.getByRole("button",{name:"Pause the session"})).toBeVisible();
});

test("unknown chapters return a useful 404 and metadata routes work",async({page,request}) => {
  const response = await page.goto("/docs/missing-chapter");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading",{name:/This moment got away/})).toBeVisible();
  for (const path of ["/sitemap.xml","/robots.txt","/icon.svg","/opengraph-image"]) expect((await request.get(path)).status(),path).toBe(200);
});

test("key pages and both appearances pass automated accessibility checks",async({page}) => {
  for (const path of ["/","/docs/getting-started","/docs/shortcuts","/releases"]) {
    await page.goto(path);
    const results = await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
    expect(results.violations.map(v => ({id:v.id,nodes:v.nodes.map(n => n.target)})),path).toEqual([]);
  }
  await page.goto("/");
  await page.getByRole("button",{name:"Switch to dark mode"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  const dark = await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(dark.violations.map(v => ({id:v.id,nodes:v.nodes.map(n => n.target)}))).toEqual([]);
});
