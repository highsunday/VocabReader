# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary visitor is a Traditional Chinese- or English-speaking language learner
with enough foundation to follow the main idea of an original-language book, but who
is still interrupted by unfamiliar words, phrases, and structures. They want to learn
from EPUB books they chose themselves and may not be familiar with GitHub, installer
architectures, command-line setup, or unsigned-app security prompts.

## Product Purpose

The website helps a prospective learner understand VocabReader, decide whether its
reading-to-practice workflow fits, and safely download, install, and connect the
desktop app to Codex. Success means a non-technical visitor can choose the correct
installer, understand why the operating system shows a warning, complete the bounded
override, sign in to Codex, and open VocabReader without searching through GitHub.

## Positioning

VocabReader is a reading-first language-learning app for learners who want to read
original EPUB books slightly beyond their current ability. Context-aware AI makes the
parts blocking comprehension understandable; selected words and phrases then retain
their precise reading context through learning cards, spaced review, and active writing
and speaking practice. Every book should expand what the learner can read next.

The product does not choose a precisely levelled book, replace independent reading, or
translate a whole book automatically. It reuses the learner's local Codex sign-in for
text AI instead of asking them to paste a ChatGPT password or create a separate text-AI
API key.

## Operating Context

- The marketing homepage introduces the product and routes its primary download action
  to the website's dedicated `/download/` guide.
- The download guide is the user-facing installation surface; GitHub Releases remains
  the public file host, version record, and source-of-truth repository.
- Windows users install an x64 NSIS executable. macOS users choose an Apple Silicon or
  Intel DMG, move VocabReader to Applications, and may need to use Privacy & Security's
  bounded **Open Anyway** control.
- Text AI requires a local Codex CLI or compatible desktop installation signed in to a
  ChatGPT account with Codex access. VocabReader starts `codex app-server` locally.

## Capabilities and Constraints

- The website is a bilingual, static Vite site with no analytics, cookies, account,
  backend, CMS, or Microsoft Store dependency.
- Installers are free Early Preview builds hosted by the official
  `highsunday/VocabReader` GitHub repository.
- Installers are not Apple Developer ID-notarized or Windows Authenticode-signed.
  The site must describe the warning honestly and must never claim the files were
  verified by Apple or Microsoft.
- The site may explain the minimum per-app override but must not instruct visitors to
  disable Gatekeeper, SmartScreen, antivirus protection, or system-wide security.
- The guide links to official Apple, Microsoft, OpenAI, and GitHub sources where they
  materially help visitors verify a step.
- The guide provides current release fallbacks and may resolve newer public GitHub
  Release assets client-side without introducing a private token.

## Brand Commitments

- Preserve the VocabReader name and the exact production App Icon.
- Preserve the established warm-paper, forest-ink, literary-editorial website identity.
- Use calm, factual, learner-friendly copy. Explain unsigned status before asking for a
  security override; never pressure the visitor or minimize the platform warning.
- Keep GitHub visible as verifiable evidence without making its engineering interface
  the primary installation experience.

## Evidence on Hand

- Production App Icon: `public/assets/vocabreader-icon.png`.
- Authentic VocabReader screenshots and workflow recordings are listed in
  `.impeccable/asset-inventory.md`.
- Public source, MIT License, Actions history, and installers:
  `https://github.com/highsunday/VocabReader`.
- Official Codex CLI installation and ChatGPT sign-in instructions:
  `https://learn.chatgpt.com/docs/codex/cli` and
  `https://learn.chatgpt.com/docs/auth`.
- No testimonials, usage metrics, malware-audit claim, or third-party endorsement is
  available and none may be invented.

## Product Principles

- Explain before asking the visitor to override a warning.
- Keep the safe path short: choose, download, install, connect Codex, open.
- Use official sources and public build evidence to earn trust rather than reassurance
  without proof.
- Keep learning value on the homepage and technical setup on the download guide.
- Never trade away operating-system security for installation convenience.

## Accessibility & Inclusion

The website must remain keyboard operable, preserve visible focus, support reduced
motion, avoid horizontal overflow at a 320px minimum width, and provide complete
Traditional Chinese and English instructions with equivalent meaning.
