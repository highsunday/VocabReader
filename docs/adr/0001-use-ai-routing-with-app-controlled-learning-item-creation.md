---
status: accepted
---

# Use AI routing with App-controlled learning-item creation

Natural-language learning-item intent and targets are identified semantically by the AI in any
language, instead of by Renderer keyword or regular-expression lists. A positive route starts an
internal second stage: the App validates at most 50 targets, performs exact-title candidate lookup,
and invokes the fixed `create-learning-items` skill; the AI never receives direct library access or
submission authority. This adds one internal AI turn for positive natural-language requests, but
keeps multilingual coverage independent of UI vocabularies while preserving the App's candidate,
artifact, and atomic-write trust boundaries.

## Consequences

- The first routing message and artifact are internal; the user sees one preparation state and one
  final creation result.
- Clear targets skip conversational confirmation, while ambiguous, hypothetical, quoted, or
  negative requests remain ordinary conversation.
- A mistaken positive route can only create a pending draft batch. The user must still submit it
  explicitly and may abandon it without changing the learning library.
- Typed button, invitation, and workflow-continuation paths bypass AI routing and retain their
  direct creation flow.
