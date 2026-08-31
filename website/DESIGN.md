---
name: VocabReader Website
description: A warm, screenshot-led editorial product story for contextual language learning.
colors:
  paper: "#f6f3eb"
  paper-raised: "#fffdf8"
  paper-muted: "#eeece3"
  ink: "#273129"
  ink-soft: "#5d685f"
  forest: "#315f4b"
  forest-deep: "#173c30"
  forest-soft: "#dfe9df"
  copper: "#b86842"
  line: "#d8d3c7"
  line-strong: "#bfc4ba"
  white: "#ffffff"
typography:
  display:
    fontFamily: '"Vocab Serif", Georgia, "Times New Roman", serif'
    fontSize: "clamp(3rem, 6vw, 5.2rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  display-en:
    fontFamily: '"Vocab Serif", Georgia, "Times New Roman", serif'
    fontSize: "clamp(2.7rem, 4.4vw, 4rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  display-zh-hant:
    fontFamily: '"Vocab Serif", Georgia, "Times New Roman", serif'
    fontSize: "clamp(2.9rem, 4.4vw, 4rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"Vocab Serif", Georgia, "Times New Roman", serif'
    fontSize: "clamp(2.15rem, 4vw, 3.55rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Vocab Serif", Georgia, "Times New Roman", serif'
    fontSize: "clamp(1.55rem, 2.5vw, 2.2rem)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "0.82rem"
    fontWeight: 760
    lineHeight: 1.6
    letterSpacing: "0.03em"
  action:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "0.95rem"
    fontWeight: 750
    lineHeight: 1.6
  nav-label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "0.8rem"
    fontWeight: 720
    lineHeight: 1.6
rounded:
  compact: "8px"
  brand: "9px"
  nav-control: "10px"
  control: "11px"
  frame: "14px"
  icon: "16px"
  circle: "50%"
spacing:
  tight: "8px"
  control: "12px"
  inline: "16px"
  cluster: "24px"
  content: "28px"
  section-compact: "64px"
  section-generous: "clamp(100px, 12vw, 168px)"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.white}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.forest-deep}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.forest-deep}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    height: "48px"
  nav-action:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.forest-deep}"
    typography: "{typography.nav-label}"
    rounded: "{rounded.nav-control}"
    padding: "7px 11px"
    height: "38px"
  media-frame:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.frame}"
    padding: "0"
---

# Design System: VocabReader Website

## Overview

**Creative North Star: "The Contextual Reading Desk"**

The VocabReader website feels like a calm reading desk where a real book, a pencil note, and a focused tutor can share one surface. Warm paper, forest ink, literary headings, and fine rules make the experience editorial and trustworthy; the interface remains quiet enough for the product screenshots and workflow recordings to carry the proof.

Reading growth is the lead promise: the learner brings an original EPUB that stretches their current ability, makes difficult language comprehensible in context, preserves what is worth learning, and expands what they can read next. Contextual AI is the supporting capability, with the user's ChatGPT sign-in through Codex presented as the practical connection that enables text help without a separate API key. The primary product tour follows the learning loop in one fixed order: independent reading → contextual understanding → learning cards → spaced review → active writing and speaking. Copy leads with this cumulative reading outcome while real product evidence proves how each step works.

**Key Characteristics:**

- Warm paper surfaces with deep forest ink and a single copper orientation accent.
- Literary serif headlines paired with plain, highly legible sans-serif product copy.
- Real screenshots and workflow recordings as the dominant visual evidence, with MP4 preferred and GIF retained as fallback.
- Fine rules, modest radii, and low-opacity shadows that clarify structure.
- Restrained 160–180ms interaction motion with a complete reduced-motion fallback.

## Colors

The palette is a bookish field of warm paper and botanical ink, with muted surfaces for pacing and copper reserved for tiny directional marks.

### Primary

- **Forest Green** (`colors.forest`): Primary actions, active emphasis, bullets, and links; it signals forward movement without becoming loud.
- **Deep Forest Ink** (`colors.forest-deep`): Headlines, brand typography, high-emphasis labels, and the full-width problem band.
- **Soft Forest Wash** (`colors.forest-soft`): A restrained hover fill for the compact GitHub action.

### Secondary

- **Margin Copper** (`colors.copper`): Used only as the short rule preceding audience-list items, adding one warm point of orientation.
- **Critical Red** (`colors.critical`): Reserved for factual access requirements that would otherwise change a visitor's decision, such as the ChatGPT subscription requirement for text AI.

### Neutral

- **Reading Paper** (`colors.paper`): The default page and sticky-header surface.
- **Raised Paper** (`colors.paper-raised`): Screenshot frames, the audience band, and quiet raised controls.
- **Muted Paper** (`colors.paper-muted`): Workflow and footer bands that separate long editorial sections without introducing a new hue.
- **Reader Ink** (`colors.ink`): Default body text.
- **Soft Reader Ink** (`colors.ink-soft`): Supporting copy, captions, and secondary navigation.
- **Fine Rule** (`colors.line`): Lightweight dividers and frame borders.
- **Strong Rule** (`colors.line-strong`): Structural section boundaries and secondary-control borders.
- **White** (`colors.white`): Text on forest actions and the dark problem band.

### Named Rules

**The Forest-and-Paper Rule.** Forest carries action and authority; paper carries space. Copper never becomes a competing call-to-action color.

## Typography

**Display Font:** Vocab Serif (with Georgia and Times New Roman fallbacks)
**Body Font:** Inter (with the system sans-serif stack)
**Label Font:** Inter (with the system sans-serif stack)

**Character:** The serif voice makes the promise feel rooted in serious reading, while the sans-serif voice keeps product facts, navigation, and controls direct. Typography supplies the personality, so it does not need decorative graphics around it.

### Hierarchy

- **Display** (700, `typography.display`, 0.98): Hero statement only; compact leading creates a memorable editorial block without compromising scanning.
- **Headline** (700, `typography.headline`, 1.08): Major section propositions and concluding calls to action.
- **Title** (700, `typography.title`, 1.18): Feature and showcase story headings.
- **Body** (400, `typography.body`, 1.6): Explanatory copy, typically held to 70 characters or fewer; hero copy narrows further to 55 characters.
- **Label** (760, `typography.label`, 0.03em): Small contextual labels such as the Codex connection, where uppercase is used sparingly.
- **Action** (750, `typography.action`, 1.6): Primary and secondary call-to-action text.
- **Navigation Label** (720, `typography.nav-label`, 1.6): The compact GitHub navigation action.

### Named Rules

**The Editorial Contrast Rule.** Serif carries ideas; sans serif carries explanation and action. Do not use the display face for paragraphs or dense interface labels.

## Layout

The desktop shell is capped at 1180px with 24px gutters. Wide sections pair one measured column of copy with a larger product-evidence column; the hero uses a 0.9-to-1.3 ratio, while ordinary feature stories give screenshots roughly 1.25 parts of the available width. Reversed stories preserve that evidence-first emphasis by assigning the first, product-media column the larger share, making the spaced-review workflow readable without enlarging the surrounding copy. The learning-card stage becomes a full-width evidence plane with the library overview and individual card detail in equal, top-aligned columns. The writing-and-speaking stage also uses the full shell: its copy sits above two equal, top-aligned screenshots so both interfaces remain legible. Editorial borders and generous vertical intervals distinguish sections instead of card grids.

At 960px, navigation links disappear and multi-column stories stack into a single column capped at 760px. Reversed desktop stories return to copy-first source order before their media. At 620px, page gutters become 14px, the header tightens to 68px, buttons become full-width, paired screenshots stack, and section padding settles at 84px. Long bilingual headings use balanced wrapping, and the 320px minimum width remains usable.

Whitespace follows an intentionally broad rhythm: small control gaps use the tight, control, inline, cluster, and content steps; major bands use the compact or generous section steps. Screenshot evidence should retain at least equal visual weight to its accompanying copy on wide screens.

## Elevation & Depth

The system is flat by default and uses a restrained hybrid of border structure and ambient shadow. Fine rules organize almost every section. Shadows are reserved for real product evidence, the production icon, and the sticky header only after scrolling; they never turn editorial copy blocks into floating cards.

### Shadow Vocabulary

- **Scrolled Header** (`0 8px 24px rgb(37 49 39 / 7%)`): Appears only after the page has moved beyond its initial position.
- **Brand Icon** (`0 12px 28px rgb(32 65 52 / 16%)`): Gives the production icon a small, tactile lift in the hero.
- **Product Evidence** (`0 20px 48px rgb(48 58 49 / 11%)`): The standard ambient lift for screenshot frames.
- **Motion Evidence** (`0 18px 44px rgb(48 58 49 / 9%)`): A slightly quieter lift for workflow recordings.

### Named Rules

**The Evidence Plane Rule.** Elevation belongs to product evidence and transient navigation state, not to feature copy or decorative containers.

## Shapes

Corners are modest and practical. Buttons use a gently curved control radius (`rounded.control`), compact navigation actions use the tighter navigation radius (`rounded.nav-control`), and screenshot frames use the broader frame radius (`rounded.frame`). The production icon keeps its existing squarish silhouette with 9–16px rounding depending on size. Circles are limited to step markers and tiny list bullets; most structure comes from straight one-pixel rules.

Borders are always fine and low-contrast. Screenshot and control silhouettes should feel like carefully handled paper or desktop windows, never soft capsules or inflated glass surfaces.

## Components

### Buttons

- **Shape:** Gently curved rectangular controls (`rounded.control`) with a minimum 48px height and 12px by 18px padding.
- **Primary:** Forest Green fill with White text; used for the free-download action.
- **Hover / Focus:** The fill deepens to Deep Forest Ink and the control rises by 1px over 160ms. Keyboard focus uses a visible 3px muted-forest outline with a 4px offset.
- **Secondary:** Transparent Reading Paper field, Strong Rule border, and Deep Forest Ink text; hover raises by 1px, darkens the border, and introduces Raised Paper.

### Cards / Containers

- **Corner Style:** Screenshot and recorded workflow evidence uses the frame radius (`rounded.frame`).
- **Background:** Raised Paper behind real product imagery.
- **Shadow Strategy:** Product Evidence by default; Motion Evidence for animated workflows.
- **Border:** One-pixel Fine Rule.
- **Internal Padding:** No padding around imagery; optional captions use the inline spacing step with a Fine Rule above.

### Navigation

The sticky navigation is a flat Reading Paper band, serif-branded at the left and sans-serif elsewhere. Desktop links use Soft Reader Ink and transition to Forest Green on hover. The language switch is deliberately typographic and borderless; `aria-pressed` changes the active locale to Deep Forest Ink at a stronger weight. The GitHub action is the sole raised compact control. Below 960px the section links disappear; below 620px its label becomes visually hidden while the inline star remains.

### Editorial Workflow Row

Each workflow step is a border-separated row with a 40px circular index, a compact serif title, and supporting sans-serif copy. The number shrinks to 36px on narrow screens. It is a sequential reading device, not an independently elevated card.

### Product Evidence Frame

Screenshots and workflow recordings fill their frame edge to edge, retain their source aspect ratio, and carry useful alternative text. MP4 recordings use lightweight static posters and stop when reduced motion is preferred; GIF remains a compatibility fallback. The hero frame may use a 0.35-degree rotation on wide screens, removed on mobile. Product imagery is always authentic VocabReader evidence; stock or generated stand-ins are outside the system.

### Named Rules

**The Quiet State Rule.** Hover and focus should clarify an existing control with color, border, or at most 1px of lift; they should not introduce glow, scale, or promotional motion.

## Do's and Don'ts

### Do:

- **Do** lead with the outcome of reading slightly beyond the learner's current ability and expanding what they can read next.
- **Do** present contextual AI as the comprehension aid and Codex as the enabling connection, not as the product's final value.
- **Do** keep the primary tour in learning order: independent reading → contextual understanding → learning cards → spaced review → active writing and speaking.
- **Do** let real VocabReader screenshots and workflow recordings carry the visual proof.
- **Do** use fine rules and generous whitespace to create editorial grouping.
- **Do** preserve keyboard focus, useful image alternatives, bilingual text resilience, and reduced-motion behavior.
- **Do** make free download the primary action while keeping Early Preview status, platform, and AI setup boundaries as quiet factual context.

### Don't:

- **Don't** convert the story into a generic matrix of interchangeable feature cards.
- **Don't** introduce neon, glow, glassmorphism, heavy gradients, or black-and-orange Impeccable styling.
- **Don't** decorate empty space with blobs, oversized icons, floating badges, or marketing effects.
- **Don't** invent testimonials, customer logos, usage metrics, or comparative claims.
- **Don't** let Codex branding eclipse VocabReader or imply that AI replaces the learner's first reading.
