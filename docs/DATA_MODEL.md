# Margins — Data Model

## The core problem

Every hard question in this app reduces to one thing: **how do you name a piece
of scripture so that the name stays valid forever?**

An annotation written by a grandfather in 2011 has to still attach to the right
words when it is read in 2051 — after the app has been rewritten, after the
reader has switched from KJV to ESV, after the note has travelled through a CSV
file, a share bundle, and two phones. If the address breaks, the inheritance
breaks, and the entire premise of the product goes with it.

So the model is built on one rule:

> **Annotations address canonical verse positions, never text.**

No character offsets, no substring matches, no per-translation paragraph IDs. A
note is anchored to "the 16th verse of the 3rd chapter of John," which is a fact
about the canon, not a fact about a particular publisher's typesetting.

Three consequences fall out of this, and they are the reason the rule is worth
the constraint it imposes:

1. **Translations are swappable.** Switching KJV → ESV re-renders the text; every
   annotation still lands correctly, because nothing pointed at the text.
2. **The ESV licensing problem becomes survivable.** Licensed text can be
   downloaded, revoked, or replaced without touching a single user note. Users
   never lose their own work because of someone else's contract.
3. **Share bundles are small and durable.** A commentary file carries references
   and notes, not scripture, so it does not redistribute copyrighted text — a
   `.margins` file containing 800 notes is well under a megabyte and is legal to
   email regardless of which translation either party is reading.

The cost is that sub-verse (word-level) highlighting is not expressible, since
"the third word" is a fact about a translation. That is why it is out of scope
for Phase 1 — it is a deliberate trade, not an oversight. See *Future
migrations* below.

## Verse identity

Each canonical verse gets a single integer ID, packed from book/chapter/verse:

```
verseId = bookNumber * 1_000_000 + chapter * 1_000 + verse

    Genesis 1:1    →  1_001_001
    John 3:16      → 43_003_016
    Revelation 22:21 → 66_022_021
```

`bookNumber` is 1–66 in canonical Protestant order. Chapters cap at 150 (Psalms)
and verses at 176 (Psalm 119:176), so the 1,000-wide fields have generous
headroom, and the largest possible ID (~66 million) is far inside both JS's safe
integer range and SQLite's 64-bit `INTEGER`.

This encoding is doing real work — it is not just a convenience:

- **It sorts.** `ORDER BY verse_id` is canonical order, for free. No join to a
  book-order table, no composite sort key.
- **It makes ranges into arithmetic.** "Everything in John 3" is
  `verse_id BETWEEN 43_003_001 AND 43_003_999`. "Everything in John" is
  `BETWEEN 43_000_000 AND 43_999_999`. Whole chapters and whole books need no
  special-casing anywhere in the query layer.
- **It is stable and self-describing.** The ID decodes to a reference with pure
  arithmetic and no lookup, which means a corrupted or hand-edited share file is
  still readable by a human being.

Books also carry a **USFM code** (`GEN`, `JHN`, `REV`) — the publishing-industry
standard. Bundles are written with USFM codes rather than raw integers, so a
`.margins` file stays legible and stays portable if the numeric scheme ever
changes. The integer is the internal representation; USFM is the wire format.

### Canon vs. translation

The canon table defines which verse IDs *exist*. A given translation may not
have text for all of them — modern translations omit verses the KJV includes
(Matthew 17:21, Acts 8:37, and others), usually relegating them to footnotes.

The model treats this as normal rather than exceptional:

- The canon is the union — the maximal address space.
- A translation is a sparse map from verse ID to text.
- An annotation on a verse a translation lacks is **not deleted**. It renders
  attached to the surrounding passage with a note explaining that this
  translation omits the verse.

Destroying a grandfather's note because the reader switched translations would
be an unforgivable data loss, and it is exactly the bug this design forecloses.

## Ranges

Every annotation covers a **closed range of verse IDs**: `start_verse_id` to
`end_verse_id`. A single verse is a range where both ends are equal.

This is the whole mechanism. Verse, multi-verse, chapter, and book annotations
are not four features — they are one feature with different endpoints:

| Selection      | start          | end            |
|----------------|----------------|----------------|
| John 3:16      | 43_003_016     | 43_003_016     |
| John 3:16–17   | 43_003_016     | 43_003_017     |
| John 3 (chapter) | 43_003_001   | 43_003_036     |
| John (book)    | 43_001_001     | 43_021_025     |

Ranges are stored **clamped to real verses** — a chapter annotation ends at the
chapter's actual last verse, not at `x_xxx_999`. This keeps overlap tests honest
and keeps the stored data meaningful when read by a human.

Ranges may cross chapter boundaries (Romans 8:38–39 into 9:1 is a legitimate
selection). They may not cross book boundaries; a selection spanning books is
split into one annotation per book at save time, because a note about "Jude
through Revelation" is almost always a mis-drag rather than an intention.

**Finding what to display** is one indexed query — the standard interval
overlap test:

```sql
SELECT * FROM annotations
WHERE start_verse_id <= :range_end
  AND end_verse_id   >= :range_start
```

With an index on `(start_verse_id, end_verse_id)` this is a range scan, which is
more than sufficient at personal scale (a prolific writer produces thousands of
annotations, not millions). If a future power user changes that, the escape
hatch is an R-tree virtual table, which SQLite supports natively and which
accepts the same start/end columns unchanged.

## How this is stored in Phase 1

The tables below are the **logical model**. Phase 1 persists them as a single
JSON document (one file on native, IndexedDB on web), not as SQLite.

That is a deliberate scale judgement, not a shortcut. A prolific writer produces
thousands of annotations, not millions; at that size the whole database is a few
hundred kilobytes, every query in the app is a filter over an array, and the
overlap test below runs in well under a frame. In exchange the app gets one code
path on iOS, Android and web, with no native module, no WASM, and no
cross-platform adapter drift.

The entity shapes here are exactly the rows a SQLite schema would hold, and
`src/domain/db.ts` is the only module that queries them — so the migration, when
data volume or sync justifies it, is an adapter swap rather than a redesign.
Column types are given in SQLite terms throughout, because that is the target.

## Entities

### `authors`

Everyone who can write notes: the local user, plus every person whose commentary
has been imported.

| column | type | notes |
|---|---|---|
| `id` | TEXT PK | UUID. Generated once, travels with the author forever. |
| `display_name` | TEXT | "Harold Harpster" — shown next to their notes. |
| `is_self` | INTEGER | Exactly one row has 1: the device owner. |
| `color` | TEXT | Stable per-author accent, assigned on import. |
| `created_at` | INTEGER | Epoch ms. |

The author `id` is the identity that survives sharing. Re-importing an updated
bundle from the same grandfather updates his existing author row rather than
creating "Harold Harpster (2)" — the single most likely real-world annoyance,
designed out from the start.

### `annotations`

The heart of the app. One table for highlights and notes alike.

| column | type | notes |
|---|---|---|
| `id` | TEXT PK | UUID, stable across export/import. |
| `author_id` | TEXT FK | Who wrote it. |
| `start_verse_id` | INTEGER | Inclusive. |
| `end_verse_id` | INTEGER | Inclusive. |
| `color` | TEXT NULL | Highlight color; NULL means note-only. |
| `body` | TEXT NULL | Note text; NULL means highlight-only. |
| `body_format` | TEXT | `plain` in Phase 1. Reserved for rich text. |
| `created_at` | INTEGER | Epoch ms. Preserved through import. |
| `updated_at` | INTEGER | Epoch ms. |
| `source` | TEXT | `manual` \| `csv` \| `bundle`. Provenance. |
| `commentary_id` | TEXT NULL FK | Which imported commentary delivered it. |
| `deleted_at` | INTEGER NULL | Soft delete — see below. |

A highlight and a note are the same object with different fields populated. This
is why "highlight this verse" and "comment on this verse" are one gesture in the
UI rather than two: the model never forced them apart.

**Constraint:** at least one of `color` or `body` must be non-NULL. An annotation
with neither is invisible and unreachable — a leak, not a record.

**Soft delete** exists because of sharing. If a bundle is re-imported after the
reader deleted one of its notes, a hard delete would silently resurrect it.
`deleted_at` remembers the reader's decision. Deleted rows are excluded
everywhere by a view, not by discipline in each query.

### `commentaries`

A named, authored collection — the unit that gets shared.

| column | type | notes |
|---|---|---|
| `id` | TEXT PK | UUID, stable across re-export. |
| `author_id` | TEXT FK | Who wrote it. |
| `title` | TEXT | "Harold Harpster's Notes". |
| `description` | TEXT NULL | Optional preface — a real feature: this is where someone explains what they were doing and who they were writing for. |
| `is_imported` | INTEGER | 1 = read-only, from someone else. |
| `is_visible` | INTEGER | Layer toggle in the reader. |
| `version` | INTEGER | Bumped on export; used to detect re-imports. |
| `imported_at` | INTEGER NULL | Epoch ms. |

Your own annotations do not need a commentary row — they belong to you
implicitly, and `commentary_id` is NULL until you publish a collection. A
commentary is an act of curation, not a container you must choose up front.

### `translations` / `verses`

| `translations` | | |
|---|---|---|
| `id` | TEXT PK | `kjv`, `esv`. |
| `name` | TEXT | "King James Version". |
| `license` | TEXT | "Public Domain" / license identifier. |
| `is_installed` | INTEGER | Downloaded and ready. |

| `verses` | | |
|---|---|---|
| `translation_id` | TEXT | Composite PK with `verse_id`. |
| `verse_id` | INTEGER | Canonical address. |
| `text` | TEXT | The verse text. |

Scripture text lives entirely here; **no other table stores scripture**, which is
what makes a licensed translation cleanly removable.

In Phase 1 this is a bundled asset rather than a table: one JSON file per book,
lazily loaded, with search as a linear scan over the 31,100 verses (a few tens
of milliseconds — see `src/bible/text.ts`). The upgrade path is SQLite FTS5 over
the same verse IDs, which changes nothing about annotations.

A note on the source text: the public-domain KJV used here marks the
translators' marginal apparatus (`{firmament: Heb. expansion}`) with the same
braces it uses for KJV's italicised supplied words (`the earth {was} without
form`). The first is editorial and must not be printed; the second is scripture
and must be kept. `scripts/build-translation.mjs` separates them by shape and
`src/bible/text.test.ts` asserts across all 31,100 verses that no apparatus
leaks into the text.

## The share bundle (`.margins`)

JSON, not CSV. CSV cannot carry author identity, a commentary title and preface,
a version, and a set of annotations in one file without becoming a fragile
convention — and this file is the thing a family archives for decades.

```jsonc
{
  "format": "margins.commentary",
  "formatVersion": 1,
  "exportedAt": "2026-09-06T12:00:00Z",
  "author":   { "id": "uuid", "displayName": "Harold Harpster" },
  "commentary": {
    "id": "uuid",
    "title": "Harold Harpster's Notes",
    "description": "Notes from forty years of Sunday school.",
    "version": 3
  },
  "annotations": [
    {
      "id": "uuid",
      "ref":  { "start": "JHN 3:16", "end": "JHN 3:17" },
      "color": "amber",
      "body": "The whole gospel in one sentence.",
      "createdAt": "2011-04-02T00:00:00Z"
    }
  ]
}
```

Design decisions worth stating:

- **References are USFM strings, not integers.** The file stays human-readable
  and survives any future change to the internal ID scheme. A person opening
  this in a text editor in 2051 can understand it without the app.
- **Stable UUIDs throughout.** Re-importing a newer version of a commentary
  updates annotations in place and adds new ones, rather than duplicating the
  whole set. `formatVersion` gates the migration path.
- **No scripture text.** Keeps the file small, and keeps it clear of any
  translation's copyright.
- **No device or account identifiers.** The file contains what the author wrote
  and nothing about where they wrote it.

## CSV import

The forgiving path in, for material that already exists elsewhere.

```csv
reference,note,color,tags,created_at
"John 3:16","The whole gospel in one sentence.",amber,"gospel;love",2011-04-02
"Romans 8","Paul's argument turns here.",,"study",
"Ps 119:105",,green,,
```

`reference` is required, plus at least one of `note` or `color`. Headers are
matched case- and whitespace-insensitively with aliases. Every row is resolved
through the same reference parser the app's jump-to-reference box uses, so the
two can never disagree about what `1 Jn 2` means.

Import is a **two-phase operation**: parse and report, then commit on
confirmation. Rows that fail to resolve are reported with their line numbers and
offered back as a corrections CSV. Nothing is written until the user confirms —
because a writer importing forty years of notes needs to know that all forty
years arrived.

## Future migrations this model already accommodates

- **Sub-verse highlighting.** Add nullable `start_offset`/`end_offset` plus the
  `translation_id` they were authored against. Verse-level annotations keep NULL
  offsets and are unaffected; offset-bearing ones degrade to verse-level when
  read in a different translation. No table rewrite.
- **Rich text.** `body_format` already exists; add a `markdown` value.
- **Sync.** Every row has a stable UUID and an `updated_at`, which is the minimum
  needed for last-writer-wins reconciliation. No schema change to start.
- **Deuterocanonical books.** Book numbers 67+ append without renumbering the
  existing 66, so no stored verse ID ever changes meaning.
