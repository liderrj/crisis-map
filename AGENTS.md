<!-- SPECKIT START -->
**Current plan**: [`specs/001-crisis-map-mvp/plan.md`](specs/001-crisis-map-mvp/plan.md) — read it before working on the CrisisMap MVP feature (branch `001-crisis-map-mvp`). Supporting docs sit alongside it: `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/api.md`.

This repo is a Spec Kit (v0.8.11) spec-driven-development workspace. The CrisisMap MVP is being specified; application code does not exist yet.

## Workflow
- SpecKit slash commands drive the SDD cycle in order: `speckit.constitution` → `speckit.specify` → `speckit.clarify` → `speckit.plan` → `speckit.tasks` → `speckit.implement`. Optional: `speckit.checklist`, `speckit.analyze`, `speckit.taskstoissues`.
- The bundled workflow `specs/speckit/workflow.yml` enforces review gates between specify→plan→tasks→implement (approve/reject). Reject aborts the flow.
- The `git` extension (`.specify/extensions/git/`) auto-creates a feature branch on `before_specify`. Branch names must follow `NNN-kebab-case` (sequential numbering) or `YYYYMMDD-HHMMSS-kebab-case` (timestamp); `speckit.git.validate` enforces this.

## Branching & commits
- All SDD work happens on a numbered feature branch (e.g. `001-crisis-map-spec`). Do not commit specs/plans/tasks to `main`.
- Auto-commit hooks fire after every SpecKit command but are **disabled by default**. Configure in `.specify/extensions/git/git-config.yml` (`auto_commit.<command>.enabled: true`).
- Commit only via SpecKit hooks or explicit user request — do not amend, force-push, or commit secrets.

## Where things live
- `.opencode/commands/` — OpenCode slash-command definitions that invoke SpecKit.
- `.specify/scripts/powershell/` — PowerShell-only helper scripts (no bash counterparts installed). Use these, not raw `git`/`specify` CLI, when a hook calls for them.
- `.specify/templates/` — spec, plan, tasks, checklist, constitution templates (unfilled).
- `.specify/memory/constitution.md` — the ratified project constitution (v1.2.0); read it before writing specs or plans — it locks the stack and principles.

## Conventions
- Shell on this host is PowerShell 7+; scripts under `.specify/scripts/powershell/` reflect that. Do not assume bash.
- Templates contain `[PLACEHOLDER]` tokens — replace with real content, do not leave them verbatim.
- Generated specs/plans/tasks land under `specs/NNN-feature-name/` once a feature branch exists.

## Don'ts
- Do not invent build/test/lint/typecheck commands — none are configured yet. Ask the user before adding tooling.
- Do not bypass review gates in `.specify/workflows/speckit/workflow.yml`.
- Do not run `git init` — the repo is already initialized.
<!-- SPECKIT END -->
