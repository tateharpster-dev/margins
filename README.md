# Margins

A Bible app where the point is not the app — it's the person who used it before you.

Margins lets someone write what they think about scripture, and lets the people
who outlive them read the Bible with those notes sitting beside the text. The
artifact it's trying to replace is a family Bible with fifty years of underlines
and cramped ballpoint notes in the margins: treasured, fragile, single-copy, and
only one grandchild gets it.

## Status

Phase 1 foundations. Runs on iOS, Android and web from one codebase.

| Feature | State |
|---|---|
| Browse and search the whole Bible | Working (KJV) |
| Highlight verses, chapters, books | Working |
| Notes attached to any passage | Working |
| Bulk CSV import with preview and error report | Working |
| Consolidated commentary per author | Working |
| Share a commentary as a file | Working |
| Read several people's commentary at once | Working |

## Quick start

```bash
npm install
npm start          # then press i, a, or w
npm run web        # browser only
npm test           # domain + text layer tests
npm run typecheck
```

The bundled KJV assets are checked in, so a fresh clone runs without a build
step. To regenerate them from source: `npm run build:translation`.

## How it works

Two documents carry the thinking, and are worth reading before changing anything:

- **[docs/SPEC.md](docs/SPEC.md)** — what Phase 1 is, what it deliberately is
  not, and why the writer and the reader are different people with different
  needs.
- **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)** — verse addressing, ranges,
  entities, and the share format.

The one idea everything else rests on:

> **Annotations address canonical verse positions, never text.**

A note is anchored to "the 16th verse of the 3rd chapter of John" — a fact about
the canon, not about a publisher's typesetting. So translations are swappable,
notes survive a translation being licensed or revoked, and a shared commentary
file contains no scripture at all (a real 800-note commentary is well under a
megabyte).

### On the ESV

The ESV is copyrighted by Crossway and needs a license, and their API terms
restrict local caching in ways that collide with an offline Bible app. Margins
therefore treats the translation as a **pluggable licensed resource**: Phase 1
ships the public-domain KJV so the app is fully functional with zero licensing
exposure, and ESV drops in behind a license without touching a single user note.

### Sharing has no server

Export a commentary to a `.margins` file; send it however you like. There are no
accounts and no network dependency. That keeps the app working offline, removes
the entire privacy surface of storing someone's religious annotations on a
server, and leaves the family with a file they can archive themselves.

## Layout

```
app/                  Screens (expo-router: library, reader, search, import, …)
src/domain/           Pure logic — no React, no React Native, fully unit tested
  canon.ts            The 66 books and every chapter's verse count
  verseId.ts          The verse addressing scheme
  reference.ts        "1 Cor 13:4-7" → a verse range
  range.ts            Overlap, clamping, splitting, formatting
  csv.ts              Forgiving CSV import with a two-phase preview
  bundle.ts           The .margins share format
  db.ts               Every query and mutation in the app
src/bible/            Scripture text access and search
src/store/            React wiring, persistence, file import/export
scripts/              Translation and canon metadata generation
```

`src/domain` deliberately imports nothing from React or React Native, so the
rules of the app can be tested in plain Node — and so a native iOS client could
later reuse the same model without inheriting the UI.

## Testing

```bash
npm test
```

75+ tests over the reference parser, CSV importer, share format, database
operations and text layer. Notable coverage: every book resolves by name, USFM
code and every abbreviation; every share bundle round-trips; a note the reader
deleted is not resurrected by re-importing; and no verse in the canon leaks the
translators' marginal apparatus into the scripture text.

## License

The bundled King James Version text is in the public domain.
