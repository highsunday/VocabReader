import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { translations } from "../src/i18n.js";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(websiteRoot, "index.html");

const pages = [
  {
    locale: "en",
    htmlLang: "en",
    canonical: "https://www.vocabreader.site/en/",
    output: resolve(websiteRoot, "en/index.html"),
  },
  {
    locale: "zh-Hant",
    htmlLang: "zh-Hant",
    canonical: "https://www.vocabreader.site/zh-tw/",
    output: resolve(websiteRoot, "zh-tw/index.html"),
  },
];

function escapeHtmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}

function replaceAttribute(tag, attribute, value) {
  const escaped = escapeHtmlAttribute(value);
  const pattern = new RegExp(`(\\s${attribute}=")[^"]*(")`);
  if (!pattern.test(tag)) {
    const closing = tag.endsWith("/>") ? "/>" : ">";
    return `${tag.slice(0, -closing.length).trimEnd()} ${attribute}="${escaped}"${closing}`;
  }
  return tag.replace(pattern, `$1${escaped}$2`);
}

function requireCopy(copy, key) {
  const value = copy[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing localized homepage copy for ${key}`);
  }
  return value;
}

function localizeAttribute(html, dataAttribute, targetAttribute, copy) {
  const pattern = new RegExp(`<[^>]+\\s${dataAttribute}="([^"]+)"[^>]*>`, "g");
  return html.replace(pattern, (tag, key) =>
    replaceAttribute(tag, targetAttribute, requireCopy(copy, key)),
  );
}

function localizeText(html, copy) {
  const pattern = /(<([a-z][\w-]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/gi;
  return html.replace(pattern, (_match, opening, _tag, key, _content, closing) =>
    `${opening}${escapeHtmlText(requireCopy(copy, key))}${closing}`,
  );
}

function localizeHomepage(template, page) {
  const copy = translations[page.locale];
  let html = template;

  html = html.replace(/<html lang="[^"]+">/, `<html lang="${page.htmlLang}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtmlText(requireCopy(copy, "meta.title"))}</title>`);
  html = html.replace(
    /<meta\b[^>]*\sname="description"[^>]*>/,
    (tag) => replaceAttribute(tag, "content", requireCopy(copy, "meta.description")),
  );
  html = html.replace(
    /<link\b[^>]*\srel="canonical"[^>]*>/,
    (tag) => replaceAttribute(tag, "href", page.canonical),
  );
  html = localizeText(html, copy);
  html = localizeAttribute(html, "data-i18n-alt", "alt", copy);
  html = localizeAttribute(html, "data-i18n-aria-label", "aria-label", copy);
  html = html.replace(
    new RegExp(`(<a\\b[^>]*\\sdata-locale="${page.locale}"[^>]*)(>)`),
    '$1 data-active="true"$2',
  );

  return `<!-- Generated from index.html and src/i18n.js. Do not edit directly. -->\n${html}`;
}

const template = await readFile(templatePath, "utf8");
for (const page of pages) {
  await mkdir(dirname(page.output), { recursive: true });
  await writeFile(page.output, localizeHomepage(template, page), "utf8");
}
