import "./styles.css";
import { detectLocale, storageKey } from "./i18n.js";
import { downloadTranslations } from "./download-i18n.js";
import { detectPlatform, resolveReleaseAssets } from "./download-helpers.js";

const releaseApi = "https://api.github.com/repos/highsunday/VocabReader/releases/latest";
let activeLocale;
let resolvedVersion;

function readStoredLocale() {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function storeLocale(locale) {
  try {
    window.localStorage.setItem(storageKey, locale);
  } catch {
    // Language switching still works if storage is unavailable.
  }
}

function updateVersionLabel() {
  const node = document.querySelector("[data-release-version]");
  if (!node) return;
  if (resolvedVersion === undefined) return;
  node.textContent = resolvedVersion || downloadTranslations[activeLocale]["hero.versionFallback"];
}

function applyLocale(locale, { persist = false } = {}) {
  const copy = downloadTranslations[locale] || downloadTranslations.en;
  activeLocale = downloadTranslations[locale] ? locale : "en";
  document.documentElement.lang = activeLocale;
  document.title = copy["meta.title"];
  document.querySelector('meta[name="description"]')?.setAttribute("content", copy["meta.description"]);

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const value = copy[node.dataset.i18n];
    if (value) node.textContent = value;
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    const value = copy[node.dataset.i18nAriaLabel];
    if (value) node.setAttribute("aria-label", value);
  });

  document.querySelectorAll("[data-i18n-alt]").forEach((node) => {
    const value = copy[node.dataset.i18nAlt];
    if (value) node.setAttribute("alt", value);
  });

  document.querySelectorAll("[data-locale]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.locale === activeLocale));
  });

  updateVersionLabel();
  if (persist) storeLocale(activeLocale);
}

function selectPlatform(platform, { focus = false } = {}) {
  const tabs = [...document.querySelectorAll('[role="tab"][data-platform]')];
  tabs.forEach((tab) => {
    const selected = tab.dataset.platform === platform;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });

  document.querySelectorAll("[data-platform-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.platformPanel !== platform;
  });
}

function bindPlatformTabs() {
  document.querySelectorAll("[data-platform-tabs]").forEach((tablist) => {
    const tabs = [...tablist.querySelectorAll('[role="tab"][data-platform]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectPlatform(tab.dataset.platform));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        selectPlatform(tabs[nextIndex].dataset.platform);
        tabs[nextIndex].focus();
      });
    });
  });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Local files and strict browsers may block the modern clipboard API.
    }
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Copy command was unavailable");
}

function bindCopyButtons() {
  document.querySelectorAll("[data-copy-command]").forEach((button) => {
    button.setAttribute("aria-live", "polite");
    button.addEventListener("click", async () => {
      const label = button.querySelector("[data-i18n]");
      const originalKey = label?.dataset.i18n;
      if (!label || !originalKey) return;

      window.clearTimeout(button.copyResetTimer);
      try {
        await copyText(button.dataset.copyCommand);
        button.dataset.copyState = "success";
        label.textContent = downloadTranslations[activeLocale]["install.copied"];
      } catch {
        button.dataset.copyState = "error";
        label.textContent = downloadTranslations[activeLocale]["install.copyFailed"];
      }

      button.copyResetTimer = window.setTimeout(() => {
        delete button.dataset.copyState;
        label.textContent = downloadTranslations[activeLocale][originalKey];
      }, 4000);
    });
  });
}

async function refreshReleaseLinks() {
  try {
    const response = await fetch(releaseApi, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const release = await response.json();
    const assets = resolveReleaseAssets(release.assets);

    for (const [kind, url] of Object.entries(assets)) {
      if (url) document.querySelector(`[data-release-asset="${kind}"]`)?.setAttribute("href", url);
    }
    if (typeof release.tag_name === "string" && release.tag_name.trim()) {
      resolvedVersion = release.tag_name.trim();
    }
  } catch {
    resolvedVersion = null;
  }
  updateVersionLabel();
}

activeLocale = detectLocale({
  stored: readStoredLocale(),
  languages: navigator.languages?.length ? navigator.languages : [navigator.language],
});
applyLocale(activeLocale);

document.querySelectorAll("[data-locale]").forEach((button) => {
  button.addEventListener("click", () => applyLocale(button.dataset.locale, { persist: true }));
});

bindPlatformTabs();
bindCopyButtons();
selectPlatform(detectPlatform({
  userAgentDataPlatform: navigator.userAgentData?.platform,
  userAgent: navigator.userAgent,
}));

const header = document.querySelector(".site-header");
const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 16);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

refreshReleaseLinks();
