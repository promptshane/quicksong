# Claude Code Working Rules — QuickSong

This file exists to protect the repository workflow while product decisions are being developed outside the local coding session.

## Source of truth

- The GitHub repository is `promptshane/quicksong`.
- The working branch is `main`.
- `QUICKSONG_SPEC.md` is the product specification and is updated remotely during product-design conversations.
- `CLAUDE.md` may also be updated remotely.
- The local desktop copy may therefore be behind GitHub even when the application code itself looks current.

## Before starting any coding task

1. Inspect the current local repository and `git status`.
2. Fetch the latest `origin/main`.
3. Bring the latest remote `main` into the local working copy safely before editing.
4. Read the current remote-synced `QUICKSONG_SPEC.md` and this `CLAUDE.md` before making product changes.
5. Never replace a newer remote spec with an older local copy.

If the local working tree has uncommitted changes, preserve them and reconcile deliberately. Do not use destructive reset/checkout commands merely to make the tree clean.

## Product-spec protection

Unless the user explicitly asks you to edit the product specification:

- treat `QUICKSONG_SPEC.md` as read-only;
- do not regenerate it;
- do not rewrite it based on your interpretation of the app;
- do not revert remote edits;
- do not include incidental formatting changes.

The same protection applies to `CLAUDE.md`.

If there is a conflict involving either file, prefer the newest remote version unless the user explicitly instructs otherwise.

## Before committing or pushing

1. Review `git diff` and `git status`.
2. Fetch `origin/main` again in case the spec changed while you were coding.
3. Rebase/merge safely as appropriate.
4. Preserve the latest remote versions of `QUICKSONG_SPEC.md` and `CLAUDE.md`.
5. Re-run relevant tests/build after reconciliation.
6. Commit the intended application changes.
7. Push to `main` normally.

Never force-push.

Never delete or overwrite remote documentation simply because the local folder started from an older state.

## General principle

Application code is being developed locally, while product decisions may be written directly to GitHub between coding sessions. Always synchronize first, preserve remote documentation, and reconcile instead of overwriting.
