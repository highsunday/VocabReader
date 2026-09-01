import "./styles.css";
import { detectLocale, localeFromPath, storageKey, translations } from "./i18n.js";

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
    // The language still switches when storage is unavailable.
  }
}

function applyLocale(locale, { persist = false } = {}) {
  const copy = translations[locale] || translations.en;
  document.documentElement.lang = locale;
  document.title = copy["meta.title"];
  document.querySelector('meta[name="description"]')?.setAttribute("content", copy["meta.description"]);

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (copy[key]) node.textContent = copy[key];
  });

  document.querySelectorAll("[data-i18n-alt]").forEach((node) => {
    const key = node.dataset.i18nAlt;
    if (copy[key]) node.setAttribute("alt", copy[key]);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    const key = node.dataset.i18nAriaLabel;
    if (copy[key]) node.setAttribute("aria-label", copy[key]);
  });

  document.querySelectorAll("[data-locale]").forEach((link) => {
    if (link.dataset.locale === locale) {
      link.dataset.active = "true";
    } else {
      delete link.dataset.active;
    }
  });

  if (persist) storeLocale(locale);
}

const pathLocale = localeFromPath(window.location.pathname);
const initialLocale = pathLocale || detectLocale({
  stored: readStoredLocale(),
  languages: navigator.languages?.length ? navigator.languages : [navigator.language]
});

applyLocale(initialLocale);

document.querySelectorAll("[data-locale]").forEach((link) => {
  link.addEventListener("click", () => storeLocale(link.dataset.locale));
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const workflowVideos = document.querySelectorAll("video[data-workflow-video]");

function syncWorkflowVideoMotion() {
  workflowVideos.forEach((video) => {
    if (reducedMotion.matches) {
      video.removeAttribute("autoplay");
      video.pause();
      video.currentTime = 0;
      return;
    }

    video.setAttribute("autoplay", "");
    video.play().catch(() => {
      // The GIF poster remains visible if the browser blocks autoplay.
    });
  });
}

syncWorkflowVideoMotion();
if (typeof reducedMotion.addEventListener === "function") {
  reducedMotion.addEventListener("change", syncWorkflowVideoMotion);
} else {
  reducedMotion.addListener(syncWorkflowVideoMotion);
}

const header = document.querySelector(".site-header");
const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 16);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });
