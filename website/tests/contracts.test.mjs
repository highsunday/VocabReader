import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const repoRoot = new URL("../../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

function withoutImpeccablePrompt(buffer) {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) return buffer;
  const chunks = [buffer.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const nul = data.indexOf(0);
    const isProvenance =
      (type === "tEXt" || type === "zTXt") &&
      nul !== -1 &&
      data.toString("latin1", 0, nul) === "impeccable:prompt";
    if (!isProvenance) chunks.push(buffer.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

async function visualSha256(url) {
  return createHash("sha256")
    .update(withoutImpeccablePrompt(await readFile(url)))
    .digest("hex");
}

test("TC1 exposes every required product-story section and both primary CTAs", async () => {
  const html = await text("index.html");

  for (const section of ["hero", "features", "workflow", "showcase", "audience", "get-started"]) {
    assert.match(html, new RegExp(`id=["']${section}["']`), `missing #${section}`);
  }

  assert.match(html, /github\.com\/highsunday\/VocabReader\/releases/);
  assert.match(html, /github\.com\/highsunday\/VocabReader/);
  assert.match(html, /<nav\b/);
  assert.match(html, /<main\b/);
  assert.match(html, /<footer\b/);
});

test("TC2 keeps Traditional Chinese and English translation keys symmetrical", async () => {
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);
  const zhKeys = Object.keys(translations["zh-Hant"]).sort();
  const enKeys = Object.keys(translations.en).sort();

  assert.deepEqual(zhKeys, enKeys);
  assert.ok(zhKeys.length >= 55, "expected complete page copy, not navbar-only translations");
  for (const locale of ["zh-Hant", "en"]) {
    for (const [key, value] of Object.entries(translations[locale])) {
      assert.equal(typeof value, "string", `${locale}.${key} must be a string`);
      assert.ok(value.trim(), `${locale}.${key} must not be empty`);
    }
  }
});

test("TC3 language helpers detect, normalize, and persist a complete locale", async () => {
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { detectLocale, normalizeLocale, storageKey } = await import(moduleUrl);

  assert.equal(normalizeLocale("zh-TW"), "zh-Hant");
  assert.equal(normalizeLocale("zh-Hant-TW"), "zh-Hant");
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("ja-JP"), "en");
  assert.equal(detectLocale({ stored: "en", languages: ["zh-TW"] }), "en");
  assert.equal(detectLocale({ stored: null, languages: ["zh-TW", "en-US"] }), "zh-Hant");
  assert.equal(detectLocale({ stored: null, languages: ["fr-FR"] }), "en");
  assert.equal(storageKey, "vocabreader-website-locale");
});

test("TC4 reuses the exact production App Icon and ships real PNG/GIF evidence", async () => {
  const websiteIcon = new URL("public/assets/vocabreader-icon.png", root);
  const appIcon = new URL(
    "apps/desktop/assets/icon/vocabreader-language-learning-v6.png",
    repoRoot,
  );
  assert.equal(await visualSha256(websiteIcon), await visualSha256(appIcon));

  const html = await text("index.html");
  assert.match(html, /vocabreader-icon\.png/);
  assert.match(html, /\.png["']/);
  assert.match(html, /\.gif["']/);
});

test("TC5 includes keyboard focus, reduced motion, and a mobile layout contract", async () => {
  const html = await text("index.html");
  const css = await text("src/styles.css");

  assert.match(html, /aria-label=/);
  assert.match(html, /<a\b[^>]*data-locale=["']zh-Hant["'][^>]*href=["']\/zh-tw\/["']/);
  assert.match(html, /<a\b[^>]*data-locale=["']en["'][^>]*href=["']\/en\/["']/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media\s*\([^)]*max-width:/);
  assert.match(css, /overflow-x:\s*(clip|hidden)/);
});

test("F76 TC4 website is tracked while remaining outside the App workspaces", async () => {
  const gitignore = await readFile(new URL(".gitignore", repoRoot), "utf8");
  const rootPackage = JSON.parse(await readFile(new URL("package.json", repoRoot), "utf8"));
  const vercelConfig = JSON.parse(await text("vercel.json"));

  assert.doesNotMatch(gitignore, /^\/website\/$/m);
  assert.match(gitignore, /^\/website\/\.vercel\/$/m);
  assert.deepEqual(rootPackage.workspaces, ["apps/*"]);
  assert.equal(vercelConfig.buildCommand, "npm run build");
  assert.equal(vercelConfig.outputDirectory, "dist");
  assert.deepEqual(vercelConfig.git?.deploymentEnabled, { "gh-pages": false });
});

test("TC8 foregrounds the five confirmed core product capabilities in both locales", async () => {
  const html = await text("index.html");
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);

  assert.match(html, /id=["']core-capabilities["']/);
  assert.match(html, /switch-learning-language\.gif/);
  for (const locale of ["zh-Hant", "en"]) {
    const coreCopy = Object.entries(translations[locale])
      .filter(([key]) => key.startsWith("core.") || key.startsWith("hero."))
      .map(([, value]) => value)
      .join(" ");
    assert.match(coreCopy, /AI/i, `${locale} must emphasize AI-assisted learning`);
    assert.match(coreCopy, /Codex/i, `${locale} must explain Codex connection`);
    assert.match(coreCopy, locale === "en" ? /no separate API key/i : /不需.*API key/i);
    assert.match(coreCopy, locale === "en" ? /several languages|English.*Japanese.*Korean/i : /多種語言|英文.*日文.*韓文/);
    assert.match(coreCopy, locale === "en" ? /learning card/i : /學習卡/i);
    assert.match(coreCopy, locale === "en" ? /spaced repetition/i : /間隔複習/);
  }
});

test("TC9 provides an honest bilingual GitHub Star action without invented counts", async () => {
  const html = await text("index.html");
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);

  assert.match(html, /data-star-cta/);
  assert.match(html, /data-star-cta[^>]*href=["']https:\/\/github\.com\/highsunday\/VocabReader["']/);
  assert.doesNotMatch(html, /star-count|stargazers_count/);
  assert.match(translations.en["cta.star"], /Star/);
  assert.match(translations["zh-Hant"]["cta.star"], /Star/);
});

test("TC10 tells the product story in learning order and foregrounds free download", async () => {
  const html = await text("index.html");
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);
  const evidence = [
    "ask-ai-context.gif",
    "learning-library-1440.webp",
    "learning-card-1440.webp",
    "spaced-review-workflow.gif",
    "switch-learning-language.gif",
  ].map((asset) => html.indexOf(asset));

  assert.ok(evidence.every((position) => position >= 0), "all four product stages need real evidence");
  assert.deepEqual(evidence, [...evidence].sort((a, b) => a - b), "product evidence must follow the learning order");
  assert.match(translations.en["cta.download"], /free/i);
  assert.match(translations["zh-Hant"]["cta.download"], /免費/);
  assert.doesNotMatch(translations.en["cta.download"], /Early Preview/i);
  assert.doesNotMatch(translations["zh-Hant"]["cta.download"], /Early Preview/i);
  assert.match(translations.en["hero.note"], /Early Preview/i);
  assert.match(translations["zh-Hant"]["hero.note"], /Early Preview/i);
});

test("TC11 presents the audience journey from comprehension to memory to use", async () => {
  const html = await text("index.html");
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);

  assert.match(translations.en["audience.item3"], /spaced repetition/i);
  assert.match(translations["zh-Hant"]["audience.item3"], /間隔複習/);
  assert.match(translations.en["audience.item4"], /writing.*speaking/i);
  assert.match(translations["zh-Hant"]["audience.item4"], /寫作.*口說/);
  assert.doesNotMatch(html, /You prefer local data/);
  assert.doesNotMatch(source, /你偏好本機資料/);
});

test("TC12 explains core features through learner benefits and honest ChatGPT sign-in", async () => {
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);

  for (const locale of ["zh-Hant", "en"]) {
    const copy = translations[locale];
    const allCopy = Object.values(copy).join(" ");
    assert.match(copy["hero.lead"], locale === "en" ? /every book expands.*read next/i : /每讀一本.*讀懂下一本/);
    assert.match(copy["core.codexBody"], /ChatGPT/i);
    assert.match(copy["core.codexBody"], locale === "en" ? /no (extra|separate) API key/i : /不需.*API key/i);
    assert.match(copy["features.contextBody"], locale === "en" ? /context.*understand/i : /上下文.*理解/);
    assert.match(copy["features.libraryBody"], locale === "en" ? /AI.*learning card/i : /AI.*學習卡/);
    assert.match(copy["showcase.reviewBody"], locale === "en" ? /AI.*spaced repetition/i : /AI.*間隔複習/);
    assert.doesNotMatch(allCopy, locale === "en" ? /workspace|reading segment|FSRS/i : /工作區|閱讀區段|FSRS/);
  }
});

test("the homepage leads with a contextual AI Tutor and preserves cumulative reading value", async () => {
  const html = await text("index.html");
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);
  const en = translations.en;
  const zh = translations["zh-Hant"];

  assert.match(en["hero.title"], /AI Tutor/i);
  assert.match(en["hero.title"], /books you actually want to read/i);
  assert.match(zh["hero.title"], /AI Tutor/);
  assert.match(zh["hero.title"], /真正想讀的原文/);
  assert.match(en["hero.lead"], /AI Tutor.*context/i);
  assert.match(en["hero.lead"], /every book.*read next/i);
  assert.match(zh["hero.lead"], /AI Tutor.*上下文/);
  assert.match(zh["hero.lead"], /讀懂.*下一本/);

  for (const locale of ["en", "zh-Hant"]) {
    const copy = translations[locale];
    const positioning = [
      copy["meta.description"],
      copy["problem.title"],
      copy["problem.body"],
      copy["workflow.title"],
      copy["workflow.intro"],
      copy["audience.title"],
      copy["audience.intro"],
      copy["start.title"],
    ].join(" ");
    assert.doesNotMatch(`${copy["hero.title"]} ${copy["hero.lead"]}`, /Krashen|i\s*\+\s*1|克拉申/i);
    assert.match(positioning, locale === "en" ? /read.*next/i : /讀懂.*下一本/);
    assert.match(positioning, locale === "en" ? /translation/i : /翻譯/);
  }

  assert.match(html, /href=["']#ai-tutor-demo["'][^>]*data-i18n=["']cta\.workflow["']/s);
  assert.match(html, /<article\s+id=["']ai-tutor-demo["'][^>]*class=["']feature-story["']/s);
});

test("TC31 keeps the closing CTA focused and touch targets usable", async () => {
  const html = await text("index.html");
  const css = await text("src/styles.css");
  const iconImages = html.match(/<img\b[^>]*src=["']\/favicon\.png["'][^>]*>/g) ?? [];

  assert.equal(iconImages.length, 1, "the optimized product icon should appear only in the header");
  assert.doesNotMatch(html, /<section\b[^>]*id=["']get-started["'][^>]*>[\s\S]*?<img\b/);
  assert.match(css, /\.language-switch (?:button|a)\s*{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.nav-star\s*{[^}]*min-height:\s*44px;/s);
  assert.match(css, /@media \(max-width:\s*620px\)[\s\S]*?\.nav-star\s*{[^}]*display:\s*none;/s);
  assert.match(css, /:lang\(zh-Hant\)[\s\S]*?letter-spacing:\s*0;/s);
  assert.match(css, /\.get-started\s*{[^}]*padding-block:\s*clamp\(84px,\s*8vw,\s*112px\)/s);
});

test("the English and Traditional Chinese GitHub READMEs align with the AI Tutor position", async () => {
  const readmeEn = await readFile(new URL("README.md", repoRoot), "utf8");
  const readmeZh = await readFile(new URL("README.zh-TW.md", repoRoot), "utf8");

  assert.match(readmeEn, /An AI Tutor for the books you actually want to read\./i);
  assert.match(readmeEn, /reading context you select/i);
  assert.match(readmeEn, /every book expands what you can read next/i);
  assert.match(readmeEn, /automatic whole-book translation/i);
  assert.match(readmeZh, /AI Tutor 幫你讀懂真正想讀的原文/);
  assert.match(readmeZh, /閱讀上下文/);
  assert.match(readmeZh, /每讀一本.*讀懂下一本/);
  assert.match(readmeZh, /整本自動翻譯/);
});

test("TC13 gives the paired practice screenshots the full content width", async () => {
  const css = await text("src/styles.css");

  assert.match(css, /\.showcase-row\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /\.showcase-pair\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.doesNotMatch(css, /\.showcase-pair \.media-frame:last-child\s*\{[^}]*margin-top:\s*54px/s);
});

test("TC14 aligns the Learning Library and learning-card screenshots", async () => {
  const css = await text("src/styles.css");

  assert.match(css, /\.product-evidence-pair\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.doesNotMatch(css, /\.product-evidence-pair \.media-frame:last-child\s*\{[^}]*margin-top:\s*56px/s);
});

test("TC15 gives the spaced-review product demo more visual space", async () => {
  const css = await text("src/styles.css");

  assert.match(css, /\.feature-story-reverse\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.25fr\)\s+minmax\(280px,\s*0\.75fr\)/s);
});

test("TC16 clearly warns that AI Tutor requires an eligible ChatGPT subscription", async () => {
  const html = await text("index.html");
  const css = await text("src/styles.css");
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);

  assert.match(html, /class="core-connection-important"/);
  assert.match(css, /\.core-connection \.core-connection-important\s*\{[^}]*color:\s*var\(--critical\)[^}]*font-weight:\s*700/s);
  assert.match(translations.en["core.codexImportantLabel"], /IMPORTANT/);
  assert.match(translations.en["core.codexImportant"], /ChatGPT subscription.*Codex access.*AI Tutor/i);
  assert.match(translations["zh-Hant"]["core.codexImportantLabel"], /重要/);
  assert.match(translations["zh-Hant"]["core.codexImportant"], /訂閱.*Codex.*AI Tutor/);
  for (const locale of ["en", "zh-Hant"]) {
    const namedTutorCopy = [
      translations[locale]["hero.note"],
      translations[locale]["core.codexTitle"],
      translations[locale]["core.codexBody"],
      translations[locale]["core.codexImportant"],
      translations[locale]["start.body"],
    ].join(" ");
    assert.match(namedTutorCopy, /AI Tutor/);
    assert.doesNotMatch(namedTutorCopy, /text AI|文字 AI/i);
  }
});

test("F75 TC4 progressively enhances workflow GIFs with viewport-deferred MP4 video", async () => {
  const html = await text("index.html");
  const source = await text("src/main.js");
  const videoTags = html.match(/<video\b[\s\S]*?<\/video>/g) || [];

  assert.equal(videoTags.length, 3);
  for (const name of ["ask-ai-context", "spaced-review-workflow", "switch-learning-language"]) {
    const video = videoTags.find((tag) => tag.includes(`${name}.mp4`));
    assert.ok(video, `missing ${name}.mp4 video`);
    assert.doesNotMatch(video, /\bautoplay\b/);
    assert.match(video, /\bpreload=["']none["']/);
    assert.match(video, /\bmuted\b/);
    assert.match(video, /\bloop\b/);
    assert.match(video, /\bplaysinline\b/);
    assert.match(video, new RegExp(`poster=["']/assets/${name}-poster\\.webp["']`));
    assert.match(video, new RegExp(`<source[^>]+src=["']/assets/${name}\\.mp4["'][^>]+type=["']video/mp4["']`));
    assert.match(video, new RegExp(`<img[\\s\\S]+src=["']/assets/${name}\\.gif["']`));
    assert.match(video, /\bwidth=["']800["']/);
    assert.match(video, /\bheight=["']500["']/);
    assert.match(video, /data-i18n-aria-label=/);
    await readFile(new URL(`public/assets/${name}-poster.webp`, root));
  }

  assert.match(source, /matchMedia\(["']\(prefers-reduced-motion: reduce\)["']\)/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /rootMargin:\s*["']240px 0px["']/);
  assert.match(source, /\.pause\(\)/);
  assert.match(source, /\.play\(\)/);
});

test("P2 serves the compact favicon for every visible product mark", async () => {
  for (const page of ["index.html", "download/index.html"]) {
    const html = await text(page);
    const visibleIcons = html.match(/<img\b[^>]*src=["']\/favicon\.png["'][^>]*>/g) ?? [];

    assert.ok(visibleIcons.length > 0, `${page} should use the compact product mark`);
    assert.doesNotMatch(html, /<img\b[^>]*src=["']\/assets\/vocabreader-icon\.png["']/);
  }
});

test("P2 serves responsive WebP screenshots without discarding the PNG sources", async () => {
  const html = await text("index.html");

  for (const name of [
    "reading-with-ai",
    "learning-library",
    "learning-card",
    "sentence-practice",
    "listen-and-repeat",
  ]) {
    assert.match(
      html,
      new RegExp(`srcset=["'][^"']*${name}-800\\.webp 800w, [^"']*${name}-1440\\.webp 1440w["']`),
    );
    await readFile(new URL(`public/assets/${name}-800.webp`, root));
    await readFile(new URL(`public/assets/${name}-1440.webp`, root));
    await readFile(new URL(`public/assets/${name}.png`, root));
  }
});

test("TC17 routes homepage download actions through the official install guide", async () => {
  const html = await text("index.html");
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);
  const guideLinks = html.match(/<a\b[^>]*data-download-guide[^>]*href=["']\/download\/["'][^>]*>/g) ?? [];

  assert.equal(guideLinks.length, 2, "both primary download actions must open the first-party guide");
  assert.doesNotMatch(
    html,
    /<a\b[^>]*class=["'][^"']*button-primary[^"']*["'][^>]*href=["']https:\/\/github\.com\/highsunday\/VocabReader\/releases["']/,
  );
  assert.match(translations.en["hero.note"], /unsigned.*install guide/i);
  assert.match(translations["zh-Hant"]["hero.note"], /未簽章.*安裝導覽/);
});

test("F76 TC1 builds the multi-page website from the Vercel hostname root", async () => {
  const config = await text("vite.config.js");
  const home = await text("index.html");
  const download = await text("download/index.html");

  assert.match(config, /base:\s*["']\/["']/);
  assert.doesNotMatch(config, /\/VocabReader\//);
  assert.equal((home.match(/href=["']\/download\/["']/g) ?? []).length, 2);
  assert.match(home, /href=["']\/download\/#install["']/);
  assert.match(download, /class=["']brand["'][^>]*href=["']\.\.\/["']/);
  assert.match(download, /class=["']button button-primary["'][^>]*href=["']\.\.\/["']/);
  assert.doesNotMatch(download, /href=["']\/["']/);
});

test("TC18 configures a stable multi-page build for the download guide", async () => {
  const config = await text("vite.config.js");

  assert.match(config, /index\.html/);
  assert.match(config, /download[\\/]index\.html/);
  assert.match(config, /rollupOptions/);
  assert.match(config, /input/);
});

test("keeps the Google Search Console verification file in the website build", async () => {
  const verification = await text("public/googlef3125f009a29707d.html");

  assert.equal(
    verification.trim(),
    "google-site-verification: googlef3125f009a29707d.html",
  );
});

test("F76 TC2 declares the custom production domain as the only canonical origin", async () => {
  const home = await text("index.html");
  const download = await text("download/index.html");

  assert.equal((home.match(/rel=["']canonical["']/g) ?? []).length, 1);
  assert.match(
    home,
    /<link\s+rel=["']canonical["']\s+href=["']https:\/\/www\.vocabreader\.site\/["']\s*\/?>/,
  );
  assert.equal((download.match(/rel=["']canonical["']/g) ?? []).length, 1);
  assert.match(
    download,
    /<link\s+rel=["']canonical["']\s+href=["']https:\/\/www\.vocabreader\.site\/download\/["']\s*\/?>/,
  );
  assert.doesNotMatch(`${home}\n${download}`, /vocabreader\.vercel\.app|highsunday\.github\.io/);
});

test("F76 TC2 publishes a sitemap containing only the custom-domain canonical pages", async () => {
  const sitemap = await text("public/sitemap.xml");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  assert.match(sitemap, /<urlset\b[\s\S]*?xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["'][\s\S]*?>/);
  assert.deepEqual(locations, [
    "https://www.vocabreader.site/",
    "https://www.vocabreader.site/en/",
    "https://www.vocabreader.site/zh-tw/",
    "https://www.vocabreader.site/download/",
  ]);
  assert.doesNotMatch(sitemap, /index\.html/);
});

test("F76 TC3 exposes one stable square root favicon on both pages", async () => {
  const home = await text("index.html");
  const download = await text("download/index.html");
  const favicon = await readFile(new URL("public/favicon.png", root));

  for (const html of [home, download]) {
    assert.match(
      html,
      /<link\s+rel=["']icon["']\s+type=["']image\/png["']\s+sizes=["']96x96["']\s+href=["']\/favicon\.png["']\s*\/?>/,
    );
  }

  assert.equal(favicon.readUInt32BE(16), 96);
  assert.equal(favicon.readUInt32BE(20), 96);
});

test("F76 TC4 publishes crawl guidance for the custom production hostname", async () => {
  const robots = await text("public/robots.txt");

  assert.match(robots, /^User-agent:\s*\*$/m);
  assert.match(robots, /^Allow:\s*\/$/m);
  assert.match(robots, /^Sitemap:\s*https:\/\/www\.vocabreader\.site\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /vocabreader\.vercel\.app|highsunday\.github\.io|\/VocabReader\//);
});

test("F76 TC8 declares a parseable VocabReader WebSite identity for Google", async () => {
  const home = await text("index.html");
  const match = home.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/);

  assert.ok(match, "homepage must include WebSite structured data");
  const structuredData = JSON.parse(match[1]);
  assert.deepEqual(structuredData, {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "VocabReader",
    alternateName: "VocabReader AI Tutor",
    url: "https://www.vocabreader.site/",
  });
});

test("F76 TC9 tracks one direct legacy redirect for each indexed GitHub Pages URL", async () => {
  const redirects = [
    ["legacy-github-pages/index.html", "https://www.vocabreader.site/"],
    ["legacy-github-pages/download/index.html", "https://www.vocabreader.site/download/"],
  ];

  for (const [file, destination] of redirects) {
    const html = await text(file);
    const escapedDestination = destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    assert.match(html, new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${escapedDestination}["']`));
    assert.match(html, new RegExp(`<meta\\s+http-equiv=["']refresh["']\\s+content=["']0;\\s*url=${escapedDestination}["']`));
    assert.match(html, new RegExp(`location\\.replace\\(["']${escapedDestination}["']\\)`));
    assert.match(html, new RegExp(`<a\\s+href=["']${escapedDestination}["']`));
    assert.doesNotMatch(html, /noindex|vocabreader\.vercel\.app/i);
  }
});

test("TC19 offers platform-aware official GitHub Release downloads", async () => {
  const html = await text("download/index.html");
  const helperSource = await text("src/download-helpers.js");
  const helperUrl = `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`;
  const { detectPlatform, resolveReleaseAssets } = await import(helperUrl);
  const assets = resolveReleaseAssets([
    { name: "VocabReader-0.1.5-windows-x64-setup.exe", browser_download_url: "https://example.test/win" },
    { name: "VocabReader-0.1.5-mac-arm64.dmg", browser_download_url: "https://example.test/arm" },
    { name: "VocabReader-0.1.5-mac-x64.dmg", browser_download_url: "https://example.test/x64" },
  ]);

  assert.match(html, /role=["']tablist["']/);
  assert.match(html, /data-platform=["']windows["']/);
  assert.match(html, /data-platform=["']macos["']/);
  assert.match(html, /VocabReader-0\.1\.5-windows-x64-setup\.exe/);
  assert.match(html, /VocabReader-0\.1\.5-mac-arm64\.dmg/);
  assert.match(html, /VocabReader-0\.1\.5-mac-x64\.dmg/);
  assert.equal(detectPlatform({ userAgentDataPlatform: "Windows" }), "windows");
  assert.equal(detectPlatform({ userAgentDataPlatform: "macOS" }), "macos");
  assert.equal(detectPlatform({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }), "windows");
  assert.deepEqual(assets, { windows: "https://example.test/win", macArm64: "https://example.test/arm", macX64: "https://example.test/x64" });
});

test("TC20 gives bounded unsigned-app guidance without weakening system security", async () => {
  const html = await text("download/index.html");
  const source = await text("src/download-i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { downloadTranslations } = await import(moduleUrl);
  const en = Object.values(downloadTranslations.en).join(" ");
  const zh = Object.values(downloadTranslations["zh-Hant"]).join(" ");
  const all = `${html} ${source}`;

  assert.match(en, /More info.*Run anyway/i);
  assert.match(en, /Privacy & Security.*Force Open/i);
  assert.match(en, /Do not disable SmartScreen/i);
  assert.match(en, /Keep Gatekeeper enabled/i);
  assert.match(zh, /其他資訊.*仍要執行/);
  assert.match(zh, /隱私權與安全性.*強制打開/);
  assert.doesNotMatch(all, /spctl\s+--master-disable|Set-MpPreference|DisableAntiSpyware|xattr\s+-[a-z]*r/i);
});

test("TC26 shows where to Force Open on macOS without asking users to re-verify the download source", async () => {
  const html = await text("download/index.html");
  const source = await text("src/download-i18n.js");
  const behavior = await text("src/download.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { downloadTranslations } = await import(moduleUrl);
  const en = Object.values(downloadTranslations.en).join(" ");
  const zh = Object.values(downloadTranslations["zh-Hant"]).join(" ");

  assert.match(html, /macos-privacy-security-force-open\.png/);
  assert.match(html, /data-i18n-alt=["']mac\.securityImageAlt["']/);
  assert.match(behavior, /querySelectorAll\(["']\[data-i18n-alt\]["']\)/);
  assert.match(en, /Privacy & Security.*Force Open/i);
  assert.match(zh, /隱私權與安全性.*強制打開/);
  for (const key of ["windows.step2Body", "windows.warningBody", "windows.warningLimit", "mac.step3Body", "mac.warningBody", "mac.warningLimit"]) {
    assert.doesNotMatch(downloadTranslations.en[key], /(?:confirm|verify).*official GitHub Release/i);
    assert.doesNotMatch(downloadTranslations["zh-Hant"][key], /確認.*(?:官方 GitHub Release|下載來源)/);
  }

  await readFile(new URL("public/assets/macos-privacy-security-force-open.png", root));
});

test("TC27 uses plain hero copy and pairs the two Windows SmartScreen actions", async () => {
  const html = await text("download/index.html");
  const css = await text("src/styles.css");
  const source = await text("src/download-i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { downloadTranslations } = await import(moduleUrl);

  assert.equal(downloadTranslations["zh-Hant"]["hero.title"], "下載與安裝 VocabReader");
  assert.equal(downloadTranslations.en["hero.title"], "Download and install VocabReader");
  assert.doesNotMatch(downloadTranslations["zh-Hant"]["hero.title"], /安心|信心/);
  assert.doesNotMatch(downloadTranslations.en["hero.title"], /confidence|safely/i);

  assert.match(html, /windows-smartscreen-more-info\.png/);
  assert.match(html, /windows-smartscreen-run-anyway\.png/);
  assert.match(html, /class=["']windows-security-guide["']/);
  assert.match(html, /class=["']image-callout callout-more-info["']/);
  assert.match(html, /class=["']image-callout callout-run-anyway["']/);
  assert.match(css, /\.windows-security-guide\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mac-security-guide\s*\{[^}]*max-width:\s*820px/s);
  assert.match(css, /@media\s*\([^)]*max-width:\s*700px[^}]*\}[\s\S]*\.windows-security-guide\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(downloadTranslations["zh-Hant"]["windows.image1Title"], /其他資訊/);
  assert.match(downloadTranslations["zh-Hant"]["windows.image2Title"], /仍要執行/);
  assert.match(downloadTranslations.en["windows.image1Title"], /More info/i);
  assert.match(downloadTranslations.en["windows.image2Title"], /Run anyway/i);

  await Promise.all([
    readFile(new URL("public/assets/windows-smartscreen-more-info.png", root)),
    readFile(new URL("public/assets/windows-smartscreen-run-anyway.png", root)),
  ]);
});

test("TC29 leads with the contextual AI Tutor positioning", async () => {
  const html = await text("index.html");
  const css = await text("src/styles.css");
  const source = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { translations } = await import(moduleUrl);

  assert.equal(
    translations["zh-Hant"]["hero.title"],
    "AI Tutor 幫你讀懂真正想讀的原文。",
  );
  assert.equal(
    translations.en["hero.title"],
    "An AI Tutor for the books you actually want to read.",
  );
  assert.match(translations["zh-Hant"]["hero.title"], /AI Tutor/);
  assert.match(translations.en["hero.title"], /AI Tutor/);
  assert.match(translations["zh-Hant"]["hero.lead"], /上下文/);
  assert.match(translations.en["hero.lead"], /in context/i);
  assert.doesNotMatch(translations["zh-Hant"]["hero.title"], /克拉申/);
  assert.doesNotMatch(translations.en["hero.title"], /Krashen|i\s*\+\s*1/i);
  assert.doesNotMatch(html, /class=["']hero-icon["']/);
  assert.doesNotMatch(css, /\.hero-icon\s*\{/);
});

test("TC30 keeps the English hero title at a restrained responsive size", async () => {
  const css = await text("src/styles.css");

  assert.match(
    css,
    /:lang\(en\) \.hero h1\s*\{[^}]*font-size:\s*clamp\(2\.7rem,\s*4\.4vw,\s*4rem\)/s,
  );
});

test("TC21 documents the exact official Codex install and sign-in flow", async () => {
  const html = await text("download/index.html");
  const source = await text("src/download-i18n.js");

  assert.match(html, /curl -fsSL https:\/\/chatgpt\.com\/codex\/install\.sh \| sh/);
  assert.match(html, /powershell -ExecutionPolicy ByPass -c &quot;irm https:\/\/chatgpt\.com\/codex\/install\.ps1 \| iex&quot;/);
  assert.match(html, /<code>codex login<\/code>/);
  assert.match(html, /https:\/\/learn\.chatgpt\.com\/docs\/codex\/cli/);
  assert.match(html, /https:\/\/learn\.chatgpt\.com\/docs\/auth/);
  assert.match(source, /ChatGPT/);
  assert.match(source, /Codex/);
  assert.match(source, /(?:restart|close and reopen) VocabReader|(?:重新啟動|關閉再重新開啟) VocabReader/i);
});

test("TC28 turns Codex setup into a bilingual guided flow with working copy controls", async () => {
  const html = await text("download/index.html");
  const behavior = await text("src/download.js");
  const source = await text("src/download-i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { downloadTranslations } = await import(moduleUrl);

  assert.match(html, /id=["']panel-codex-windows["']/);
  assert.match(html, /id=["']panel-codex-macos["']/);
  assert.equal((html.match(/class=["']codex-steps["']/g) || []).length, 2);
  assert.equal((html.match(/data-copy-command=/g) || []).length, 4);
  assert.match(behavior, /navigator\.clipboard\?\.writeText/);
  assert.match(behavior, /document\.execCommand\(["']copy["']\)/);
  assert.match(behavior, /querySelectorAll\(["']\[data-platform-tabs\]["']\)/);

  for (const locale of ["en", "zh-Hant"]) {
    const copy = downloadTranslations[locale];
    assert.match(copy["install.intro"], locale === "en" ? /one-time.*four steps/i : /只需.*一次.*四個步驟/);
    assert.match(copy["install.title"], /AI Tutor/);
    assert.match(copy["install.windowsOpenBody"], /PowerShell/);
    assert.match(copy["install.macOpenBody"], locale === "en" ? /Terminal/i : /終端機/);
    assert.match(copy["install.loginTitle"], /ChatGPT/i);
    assert.doesNotMatch(Object.values(copy).join(" "), /local Codex app server|本機 Codex app server/i);
    assert.doesNotMatch(Object.values(copy).join(" "), /text AI|文字 AI/i);
  }
});

test("TC22 grounds trust copy in inspectable evidence and clear data boundaries", async () => {
  const html = await text("download/index.html");
  const source = await text("src/download-i18n.js");

  assert.match(html, /github\.com\/highsunday\/VocabReader\/releases/);
  assert.match(html, /github\.com\/highsunday\/VocabReader\/actions/);
  assert.match(html, /github\.com\/highsunday\/VocabReader\/blob\/main\/LICENSE/);
  assert.match(source, /open source|開放原始碼/i);
  assert.match(source, /MIT/);
  assert.match(source, /GitHub Actions/);
  assert.match(source, /official GitHub Releases|官方 GitHub Releases/i);
  assert.match(source, /local|本機/i);
  assert.match(source, /AI|人工智慧/i);
});

test("TC23 keeps download-page translations symmetrical and complete", async () => {
  const source = await text("src/download-i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const { downloadTranslations } = await import(moduleUrl);
  const zhKeys = Object.keys(downloadTranslations["zh-Hant"]).sort();
  const enKeys = Object.keys(downloadTranslations.en).sort();

  assert.deepEqual(zhKeys, enKeys);
  assert.ok(zhKeys.length >= 55, "the guide needs complete bilingual copy");
  for (const locale of ["zh-Hant", "en"]) {
    for (const [key, value] of Object.entries(downloadTranslations[locale])) {
      assert.equal(typeof value, "string", `${locale}.${key} must be a string`);
      assert.ok(value.trim(), `${locale}.${key} must not be empty`);
    }
  }
});

test("TC24 keeps platform controls and the download layout accessible and responsive", async () => {
  const html = await text("download/index.html");
  const css = await text("src/styles.css");

  assert.match(html, /role=["']tab["']/);
  assert.match(html, /role=["']tabpanel["']/);
  assert.match(html, /aria-selected=/);
  assert.match(html, /aria-controls=/);
  assert.match(html, /aria-labelledby=/);
  assert.match(css, /\.download-page/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media\s*\([^)]*max-width:/);
  assert.match(css, /overflow-x:\s*(clip|hidden)/);
});

test("F77 TC1-TC2 emits complete English and Traditional Chinese homepage HTML", async () => {
  const en = await text("en/index.html");
  const zh = await text("zh-tw/index.html");

  assert.match(en, /<html lang=["']en["']>/);
  assert.match(en, /<title>VocabReader — An AI Tutor for the books you want to read<\/title>/);
  assert.match(en, /<link rel=["']canonical["'] href=["']https:\/\/www\.vocabreader\.site\/en\/["']/);
  assert.match(en, /<h1[^>]*>An AI Tutor for the books you actually want to read\.<\/h1>/);

  assert.match(zh, /<html lang=["']zh-Hant["']>/);
  assert.match(zh, /<title>VocabReader — AI Tutor 幫你讀懂真正想讀的原文<\/title>/);
  assert.match(zh, /<link rel=["']canonical["'] href=["']https:\/\/www\.vocabreader\.site\/zh-tw\/["']/);
  assert.match(zh, /<h1[^>]*>AI Tutor 幫你讀懂真正想讀的原文。<\/h1>/);

  for (const localized of [en, zh]) {
    assert.doesNotMatch(localized, /href=["']\.?\/en\/download\//);
    assert.doesNotMatch(localized, /href=["']\.?\/zh-tw\/download\//);
    assert.equal((localized.match(/href=["']\/download\/["']/g) ?? []).length, 2);
    assert.match(localized, /href=["']\/download\/#install["']/);
  }
});

test("F77 TC3 exposes consistent canonical, hreflang, and sitemap locale relationships", async () => {
  const pages = [await text("index.html"), await text("en/index.html"), await text("zh-tw/index.html")];
  const expectedAlternates = [
    ["en", "https://www.vocabreader.site/en/"],
    ["zh-Hant", "https://www.vocabreader.site/zh-tw/"],
    ["x-default", "https://www.vocabreader.site/"],
  ];

  for (const page of pages) {
    for (const [hreflang, href] of expectedAlternates) {
      assert.match(
        page,
        new RegExp(`<link rel=["']alternate["'] hreflang=["']${hreflang}["'] href=["']${href.replaceAll(".", "\\.")}`),
      );
    }
    assert.match(page, /<a\b[^>]*data-locale=["']zh-Hant["'][^>]*href=["']\/zh-tw\/["']/);
    assert.match(page, /<a\b[^>]*data-locale=["']en["'][^>]*href=["']\/en\/["']/);
  }

  const sitemap = await text("public/sitemap.xml");
  for (const url of [
    "https://www.vocabreader.site/",
    "https://www.vocabreader.site/en/",
    "https://www.vocabreader.site/zh-tw/",
    "https://www.vocabreader.site/download/",
  ]) {
    assert.match(sitemap, new RegExp(`<loc>${url.replaceAll(".", "\\.")}<\\/loc>`));
  }
  assert.match(sitemap, /xmlns:xhtml=["']http:\/\/www\.w3\.org\/1999\/xhtml["']/);
  assert.match(sitemap, /hreflang=["']zh-Hant["']/);
  assert.match(sitemap, /hreflang=["']x-default["']/);
});

test("F77 TC4 makes pathname locale authoritative and persists linked language choices", async () => {
  const html = await text("index.html");
  const source = await text("src/main.js");
  const i18nSource = await text("src/i18n.js");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(i18nSource).toString("base64")}`;
  const { localeFromPath } = await import(moduleUrl);

  assert.equal(localeFromPath("/en/"), "en");
  assert.equal(localeFromPath("/zh-tw/"), "zh-Hant");
  assert.equal(localeFromPath("/"), null);
  assert.match(source, /localeFromPath\(window\.location\.pathname\)/);
  assert.match(source, /addEventListener\(["']click["']/);
  assert.doesNotMatch(source, /preventDefault\(\)/);
  assert.match(html, /<a\b[^>]*data-locale=["']zh-Hant["'][^>]*href=["']\/zh-tw\/["']/);
});

test("F77 TC6 configures generated locale entries for the Vite multi-page build", async () => {
  const packageJson = JSON.parse(await text("package.json"));
  const config = await text("vite.config.js");

  assert.match(packageJson.scripts.dev, /generate-localized-homepages/);
  assert.match(packageJson.scripts.build, /generate-localized-homepages/);
  assert.match(packageJson.scripts.test, /generate-localized-homepages/);
  assert.match(config, /en[\\/]index\.html/);
  assert.match(config, /zh-tw[\\/]index\.html/);
});
