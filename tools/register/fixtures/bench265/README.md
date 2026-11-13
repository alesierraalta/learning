# Fixtures #265: the bench run that the note-first reader is measured against

Copied from the third bench run (PR #264, `findings-3.md`, `/tmp/bench3-shots/vault`), unchanged:

- `notas/<topic>.md` — the part note the agy tutor wrote. The gates and the register measure this file.
- `paginas/<topic>.html` — the rich page the same turn wrote beside it. The reader served this one in that run.
- `quiz/<topic>.json` — the part's mini-quiz (`mini-quiz/p1.json`). Every answer key is A, B or C in order.
- `tcp-handshake/` — the whole TCP part as a vault folder (plan, note, page, mini-quiz), for the reader tests.

Do not edit these files: they are the evidence. A test that needs a different page writes its own.
