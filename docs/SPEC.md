# Margins — Product Spec (Phase 1)

## The idea in one sentence

Margins lets you write what you think about scripture, and lets the people who
outlive you read the Bible with your notes sitting next to the text.

## Why this exists

The artifact this app is trying to replace is a specific physical object: a
family Bible with fifty years of underlines, dates, and cramped ballpoint notes
in the margins. Those Bibles are treasured, and they are also fragile,
single-copy, and unsearchable. Only one grandchild gets it.

That framing drives most of the product decisions below. In particular it means
the app has two distinct users who are rarely the same person:

- **The writer** is usually older, is not looking for another app, and will only
  produce notes if the act of writing one is nearly frictionless. Much of their
  existing material is already typed up somewhere — sermon prep, Word docs,
  study-group handouts. This is why bulk import is a Phase 1 feature and not a
  nice-to-have: for many writers, import *is* how their commentary gets in.
- **The reader** is usually younger, arrives because someone they love wrote
  something, and is often opening the app for the first time because of a
  shared file. Their first-run experience is not "browse the Bible" — it is
  "show me what Grandpa said."

A design that only serves the reader produces an empty app. A design that only
serves the writer produces a diary nobody inherits.

## Phase 1 scope

### 1. Read and search the Bible

- Browse by book → chapter. Continuous scroll within a chapter.
- Full-text search across the current translation, with results grouped by book.
- Jump-to-reference: type `jn 3:16`, `Romans 8`, `1 co 13` and go there.

**On the ESV.** The ESV text is copyrighted by Crossway and requires a license.
Their API terms restrict how much text can be cached locally, which collides
directly with a Bible app's need to work offline. Margins therefore treats the
translation as a **pluggable, licensed resource**, not as a hardcoded asset:

- Phase 1 ships the **KJV** (public domain) as the default, so the app is fully
  functional and offline with zero licensing exposure.
- The translation layer is defined so that ESV can be added as a downloadable
  translation once a license is in hand, without touching the annotation model.

This is the single most important architectural constraint in the app, and it is
why annotations address *verses*, never *text offsets* — see `DATA_MODEL.md`.

### 2. Highlight and comment

- Select a verse, a run of verses, a whole chapter, or a whole book.
- Apply a highlight color, attach a note, or both.
- Notes are plain text in Phase 1. (Rich text is a Phase 2 migration; the schema
  reserves a `body_format` column so it does not require a rewrite.)
- Everything persists locally and works offline.

Chapter- and book-level annotations are not a separate feature — they are just
verse ranges that happen to span a chapter or a book. One mechanism, one table,
one set of queries.

### 3. Bulk import via CSV

The writer's existing material gets in this way. The importer must be forgiving,
because the file is coming out of Excel and was not written to a spec.

- Columns: `reference`, `note`, `color`, `tags`, `created_at`. Only `reference`
  is required, plus at least one of `note` or `color`.
- Header names are matched case- and space-insensitively, with common aliases
  (`verse`/`passage`/`ref` → `reference`; `comment`/`text` → `note`).
- References are parsed permissively: `John 3:16`, `jn 3.16`, `Romans 8`,
  `1 Cor 13:4-7`, `Jude`, `Ps 119:105`.
- **The import is previewed before it commits.** The user sees how many rows
  parsed, how many failed, and exactly which references could not be resolved,
  with the row numbers. Nothing is written until they confirm.
- Failed rows are downloadable as a corrections CSV so they can be fixed and
  re-imported rather than hunted down by hand.

A silent partial import is the worst possible outcome here: the writer believes
their life's work is in the app, and a tenth of it is missing.

### 4. Consolidate into a commentary

A **commentary** is a named, authored collection of that author's annotations —
"Harold Harpster's Notes," "Bible Study 2019–2024."

- Auto-assembled from existing annotations rather than authored separately: the
  user picks which annotations belong (default: all of them), names the
  collection, and Margins orders it canonically.
- Read as a continuous document, book by book, with each note under its passage.
- Exportable as a single file.

### 5. Share and layer commentaries

- Export a commentary to a portable `.margins` file (JSON — see `DATA_MODEL.md`).
- Import someone else's file. Their notes then appear alongside the text
  wherever they apply, attributed by name.
- **Multiple commentaries can be active at once.** Each is independently
  toggleable, and each author gets a stable color/initial so a passage with
  three people's notes stays legible.
- Imported commentaries are **read-only**. You cannot edit your grandfather's
  notes, and your own notes are never silently mixed into what you re-share.

Phase 1 sharing is file-based — AirDrop, email, cloud drive. No accounts, no
server, no network dependency. This is deliberate: it makes the app fully
functional offline, removes the entire privacy surface of "your religious
annotations on someone else's server," and means a `.margins` file is an
artifact a family can archive themselves. Accounts and sync are a Phase 2
decision that should be made only once people actually want it.

## Explicitly out of scope for Phase 1

Sync/accounts, multiple translations side by side, rich text, audio notes,
verse-image sharing, reading plans, original-language tools, sub-verse (word
level) highlighting, and social/discovery features. The data model leaves room
for each; none is built.

## What "done" looks like for Phase 1

A person can install the app, read the KJV offline, highlight and annotate it,
import a CSV of 500 existing notes with a preview and an error report, export
the result as one file, send that file to their granddaughter, and have her see
their notes next to the text with their name on them — with no account, no
network, and no subscription.
