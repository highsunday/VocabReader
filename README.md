<p align="center">
  <strong>English</strong> · <a href="README.zh-TW.md">繁體中文</a>
</p>

<h1 align="center">VocabReader</h1>

<p align="center">
  <strong>Turn every moment of confusion into something you can remember and use.</strong><br />
  VocabReader is a desktop app that brings EPUB reading, AI explanations, vocabulary management, and active practice together.<br />
  Go from understanding a passage to spaced review, writing, and speaking without jumping between a reader, dictionary, chatbot, and flashcard app.
</p>

<p align="center">
  <img alt="Early Preview" src="https://img.shields.io/badge/status-early_preview-C66A32?style=flat-square" />
  <img alt="macOS and Windows" src="https://img.shields.io/badge/platform-macOS_%7C_Windows-315F4B?style=flat-square" />
  <img alt="Codex powered" src="https://img.shields.io/badge/AI-Codex_powered-315F4B?style=flat-square&logo=openai&logoColor=white" />
  <img alt="No API key for text AI" src="https://img.shields.io/badge/text_AI-no_API_key-315F4B?style=flat-square" />
  <img alt="Free and open source" src="https://img.shields.io/badge/app-free_%26_open_source-C66A32?style=flat-square" />
</p>

<p align="center">
  <a href="https://github.com/highsunday/VocabReader/releases"><strong>Download for macOS or Windows</strong></a>
  ·
  <a href="#key-features"><strong>Explore the features</strong></a>
  ·
  <a href="https://github.com/highsunday/VocabReader/issues"><strong>Share feedback</strong></a>
</p>

![A VocabReader library containing Harry Potter and the Sorcerer's Stone and Harry Potter and the Chamber of Secrets](docs/readme-assets/library-overview.png)

## Make every reading session build real language ability

The frustrating part of reading in another language is not encountering an unfamiliar word. It is looking that word up, understanding it for a moment, and then forgetting it. A reader can display the book, a dictionary can define a word, a chatbot can answer a question, and a flashcard app can schedule reviews—but turning all of those scattered results into a sustainable learning process takes work.

VocabReader connects the entire flow:

**Import an EPUB → Read and mark questions → Get contextual explanations → Create learning items → Review with spaced repetition → Practise through writing and speaking**

VocabReader does not use AI to replace reading, and it is not an automatic whole-book translation tool. It preserves the process of reading and thinking for yourself, offers focused help when you ask for it, and carries the material worth learning into later practice.

### What makes it different

- **Explanations stay connected to the text:** AI interprets words, phrases, sentence patterns, and meaning using the current book, chapter, and reading segment—not an isolated dictionary entry.
- **What you look up remains useful:** Valuable explanations can become learning items that preserve the intended sense and continue into review and production practice.
- **Understanding, memory, and use form one workflow:** Reading exercises check immediate comprehension, spaced repetition strengthens long-term recall, and writing and speaking turn recognition into active use.
- **Your learning data is local-first:** Books, progress, annotations, learning items, and review history are stored on your current device and can be exported as a portable backup.

## Key features

### 1. Build your own EPUB learning library

After you import an EPUB, VocabReader organises its title, author, cover, chapters, and nested sections so novels, nonfiction, and specialist books can become long-term learning material. It remembers the current chapter, reading position, reading segment, and annotations for each book, allowing you to continue where you left off after switching books or reopening the app.

You can adjust the reading font size, content width, and line spacing. The original text and AI Tutor remain side by side, so asking a question, checking an explanation, and returning to the book all happen in one workspace—without copying entire pages into another service.

> VocabReader supports common text, images, tables, and lists in standard EPUB 2 and EPUB 3 files. DRM-protected books and EPUBs that depend on complex interactivity, media, or custom presentation are not guaranteed to render correctly.

### 2. Control exactly what the AI can read

Each chapter has `START` and `END` range markers that define the current reading segment. AI conversations, annotation explanations, reading exercises, and retelling practice use only the text inside this range. This prevents unread parts of the chapter from leaking into an answer and avoids sending an unnecessarily long chapter all at once.

Ask freely about the meaning of a passage, a word's sense in context, sentence structure, grammar, tone, or the author's choice of expression. AI Tutor answers from the current reading context and supports multi-turn conversations, so you can keep exploring after the first explanation.

![AI Tutor answering questions about meaning and grammar from the current reading segment](docs/readme-assets/ask-ai-context.gif)

### 3. Mark and explain the parts you actually find difficult

Highlight unfamiliar words, phrases, or complete sentences as you read. Annotations keep their position in the source text, so you do not have to leave the book at every interruption or manually collect a list of disconnected questions.

When you finish a reading segment, AI can organise all annotations in that segment by type and source order, explaining:

- A word's contextual meaning, part of speech, common collocations, pronunciation, or frequent mistakes.
- Reusable phrases, fixed expressions, and grammar units.
- The syntax, grammar relationships, tone, and an easier paraphrase of a complex sentence.
- The estimated CEFR level and a concise review hint for each item in the current context.

Unmarked text is used only as context. AI does not indiscriminately explain or translate the entire segment, keeping the response focused while preserving a read-first, analyse-later rhythm.

![AI classifying and explaining annotations in their reading context](docs/readme-assets/explain-reader-annotations.gif)

### 4. Keep what is worth remembering in the Learning Library

After an annotation explanation, choose which words and reusable phrases should enter the Learning Library. AI prepares drafts for confirmation first, preventing sentence-level analysis, unrelated details, or duplicate items from being saved automatically. You can also ask to add an item in natural language during an AI conversation—no rigid command syntax is required.

A learning item can contain much more than a surface translation:

- The intended sense inferred from the reading context and the item type; different senses of the same term can be stored separately.
- CEFR level, part of speech or phrase category, pronunciation, and common collocations.
- Three to five natural examples, plus genuinely useful notes on nuance, usage, or common mistakes.
- An optional caution note and representative image, along with its study state, review count, and next due time.

Open any item for full details, revise it with AI assistance, or move it to the trash. The library distinguishes new, studying, familiar, and strong items, while also showing due and scheduled states, so a growing collection remains manageable.

![Turning annotation explanations into reusable learning items](docs/readme-assets/add-cards-from-explanation.gif)

![Creating a learning item from an AI conversation using natural language](docs/readme-assets/add-card-with-command.gif)

### 5. Review with AI-generated papers and FSRS scheduling

Learning items enter an FSRS-based spaced-repetition schedule, so you do not have to decide manually what to study each day. VocabReader selects new and due items for a review paper, and AI writes a fresh contextual sentence for each target sense. This reduces dependence on memorising the fixed layout or wording of a card.

For every question, recall what the highlighted term means in that sentence. After you submit the complete paper, AI evaluates meaning, explains expression issues, and provides a suggested answer. You then confirm how the item felt—`Forgotten`, `Hard`, `Good`, or `Easy`. Only after confirmation does VocabReader write the review history and calculate the next due time.

Daily limits for new and due items, as well as the number of questions per paper, are configurable. VocabReader retains review progress, past answers, and solid-recall results. You can leave while a paper is being generated or before it is confirmed and return to the same work later in the app session.

![Answering a scheduled review paper, reading AI feedback, and confirming recall ratings](docs/readme-assets/spaced-review-workflow.gif)

### 6. Check whether you truly understood through quizzes and retelling

After finishing a reading segment, generate multiple-choice and open-ended questions directly from it. These exercises test comprehension, inference, and detail within the segment rather than isolated vocabulary. Submit your answers to receive question-by-question grading and an overall review.

Segment retelling asks you to restate the same content in the source language and in your own words. AI provides separate feedback on omissions, misunderstandings, organisation, and language, turning “I think I understood it” into active retrieval and expression. Segment exercises do not change the spaced-repetition schedule of any learning item.

### 7. Use several learned items in one piece of writing

Sentence Practice selects a group of learning items that have already entered review. Use every required item naturally in one story or short passage, moving vocabulary into a coherent context instead of writing several unrelated example sentences.

AI checks whether every item is present, whether it carries the intended sense, whether its form is natural, and whether the passage's grammar and collocations work. If revision is needed, your original draft remains available for editing and resubmission. Once the requirements are met, you receive a complete revision, item-by-item explanations, and a record of how each required term functions in the passage. When you need inspiration, AI can also generate several reference passages using the same set of items.

Sentence Practice has its own daily goal, all-time result, and recent 30-day activity view, but it never changes the FSRS schedule. Remembering an item and using it successfully in writing remain separate, visible forms of progress.

![Using several learning items in one passage and receiving AI feedback](docs/readme-assets/sentence-practice.gif)

### 8. Practise pronunciation, rhythm, and fluency with Listen & Repeat

Paste any-language text into Listen & Repeat. AI finds natural semantic and rhythmic boundaries, after which you can play the AI model, record yourself, and compare the two recordings one segment at a time.

Two practice modes are available:

- **Progressive:** Build stability with shorter chunks before unlocking and recording the complete long chunk.
- **Advanced:** Practise full sentences or natural long chunks directly when you already have a stronger speaking foundation.

You can work manually or use Continuous mode to move through model playback, countdown, recording, saving, and the next segment automatically. The app tracks a daily goal, all-time completions, and recent activity. Your recordings and generated model audio remain on the current device.

The current version is designed for listening, self-recording, and A/B playback. It does not transcribe your voice or generate an automatic pronunciation score. AI model speech requires your own OpenAI API key.

![Splitting material into natural chunks, playing the AI model, and recording your own voice](docs/readme-assets/listen-and-repeat.gif)

### 9. Keep each learning language in its own workspace

VocabReader provides complete, separate workspaces for **English, Japanese, Traditional Chinese, and Korean**. Each workspace has its own book library, Learning Library, AI conversations, reading progress, review schedule, and practice state, so material from different languages is never mixed together.

The explanation language is configured separately from the learning language. For example, you can read Japanese while receiving explanations in Traditional Chinese; reading exercises and retelling still use the language you are learning. EPUBs in other languages can also be imported, read, and discussed with AI, but item classification, speech, and the complete learning workflow have not been optimised for every language.

![Annotating a different-language text, receiving contextual explanations, and creating learning items](docs/readme-assets/japanese-learning-workflow.gif)

![Switching learning languages and loading separate libraries and learning data](docs/readme-assets/switch-learning-language.gif)

## How VocabReader differs from a general AI chatbot

| General AI chatbot | VocabReader |
|---|---|
| You paste the source text and background again for every new conversation | AI Tutor uses the reading segment you explicitly define |
| Useful answers remain buried in chat history | Explanations can become learning items and continue into practice |
| Common definitions may not match the passage | Each learning item preserves the intended contextual sense |
| General chat does not manage memory scheduling | FSRS schedules the next review from confirmed recall results |
| Reading, organising, reviewing, and producing happen in separate tools | One app connects comprehension, memory, writing, and speaking |

## Text AI does not require a separate API key

VocabReader is free and open source. If your ChatGPT account has access to Codex, VocabReader reuses the local Codex sign-in. AI conversations, annotation explanations, learning-item creation and editing, spaced review, reading exercises, retelling, writing feedback, and Listen & Repeat text segmentation do not require you to create or enter a separate OpenAI API key.

> [!NOTE]
> You need a signed-in installation of Codex Desktop or Codex CLI. Only the optional AI model speech and read-selection-aloud features require your own OpenAI API key. If you do not use AI speech, no API key is needed.

## Who VocabReader is for

VocabReader is a good fit if you:

- Want to use novels, nonfiction, or specialist books as language-learning material.
- Are frequently interrupted by unfamiliar words, phrases, complex sentences, or grammar while reading.
- Want the app to schedule future practice from actual review results instead of merely collecting vocabulary.
- Prefer building a personal learning library from real reading contexts over studying a generic word list.
- Want to practise reading comprehension, retelling, integrated writing, pronunciation, and shadowing in one place.
- Study more than one language and want each language's books, progress, and learning items kept separate.
- Have a ChatGPT account with Codex access and want to reuse that sign-in without configuring a text-AI API key.

### Current product boundaries

VocabReader is currently an Early Preview desktop app focused on active reading and practice. It does not provide automatic whole-book translation, a mobile app, live cloud sync, or fully offline AI. You can export a ZIP backup and restore it on another computer, but this is a full data-transfer mechanism—not two-way sync or a merge import.

## Install and get started

1. Download the macOS Apple Silicon, macOS Intel, or Windows 64-bit build from [GitHub Releases](https://github.com/highsunday/VocabReader/releases).
2. Make sure Codex Desktop or Codex CLI is installed and signed in with a ChatGPT account that can use Codex.
3. Open VocabReader, choose a learning language, and import an EPUB you have the right to use.

> [!IMPORTANT]
> VocabReader is currently an Early Preview, and its installers are not yet developer-signed. macOS or Windows may show an “unidentified developer,” “cannot verify developer,” or “unknown publisher” warning the first time you open it. Download only from this project's official Releases page and confirm that the filename matches your platform.

<p align="center">
  <a href="https://github.com/highsunday/VocabReader/releases"><strong>Download VocabReader</strong></a>
</p>

<details>
<summary><strong>How data is stored and transmitted</strong></summary>

| Data | How it is handled |
|---|---|
| EPUBs, book library, reading progress, annotations, Learning Library, review history, and AI conversations | Stored in local Electron user data. VocabReader does not create a cloud account. |
| Listen & Repeat material, learner recordings, and AI model audio | Stored on the current device. VocabReader does not create a cloud recording library or transcribe your voice. |
| AI explanations, question generation, grading, and text segmentation | Only when you invoke the relevant feature, the required reading segment, learning items, answers, or practice material is sent to Codex. |
| Read-selection-aloud and AI model speech | Only when you explicitly request playback, the required text is sent using the OpenAI API key you configured. |
| Backups | Books, learning items, review data, activity statistics, and shared settings can be exported manually as a portable ZIP. AI conversations, the current review paper, Listen & Repeat material, and audio are excluded. Restoring replaces the destination data completely; it is not cloud sync. |

</details>

<details>
<summary><strong>Run from source and develop</strong></summary>

You need Node.js, npm, and a Codex installation that can run `codex app-server`.

```bash
git clone https://github.com/highsunday/VocabReader.git
cd VocabReader
npm install
npm run dev
```

VocabReader uses Electron, React, TypeScript, Fastify, SQLite, `ts-fsrs`, Codex App Server, Vitest, and Playwright.

```text
apps/
├── desktop/   Electron main, preload, React renderer, and desktop tests
└── server/    Fastify Reader Server and API boundary
```

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

To build an installer for the current platform, use the desktop workspace's `dist:mac:arm64`, `dist:mac:x64`, or `dist:win:x64` script. Official releases are built by GitHub Actions on the corresponding native runners.

</details>

## Contributing

- Star this repository to follow future releases.
- Report problems or propose ideas in [Issues](https://github.com/highsunday/VocabReader/issues).
- Fork the project, create a branch, and open a pull request.

## License

VocabReader is available under the [MIT License](LICENSE).
