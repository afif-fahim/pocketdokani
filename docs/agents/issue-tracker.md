# Issue tracker: GitHub

Issues and specs live in https://github.com/afif-fahim/pocketdokani. Use the `gh` CLI from this repository.

## Conventions

- Verify the target before the first issue write: `gh repo view --json nameWithOwner`. The expected repository is `afif-fahim/pocketdokani`.
- Create: `gh issue create --title "..." --body-file <file>`. Use UTF-8 files for multiline bodies and comments.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`. Add label and state filters as needed.
- Comment: `gh issue comment <number> --body-file <file>`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post the explanation first, then `gh issue close <number>`. This preserves explanations even when an issue is already closed.
- Sub-issues: use native parent/child relationships when available. Otherwise put `Part of #<parent>` in the child and link it from a task list in the parent.
- Blocking: use native issue dependencies when available. Otherwise put `Blocked by: #<number>` at the top of the child. Work is startable when all blockers are closed.

Infer the repository from `origin`. Publish tickets into this repository. When a skill says "publish to the issue tracker", create a GitHub issue. When it says "fetch the relevant ticket", read that issue.

## Pull requests as a triage surface

**PRs as a request surface: no.**
