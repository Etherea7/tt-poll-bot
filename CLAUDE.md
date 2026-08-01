<!-- Shared rules live in AGENTS.md. Keep this file thin. -->

@AGENTS.md

## Claude Code overrides

<!-- Claude-specific instructions only; shared rules live in AGENTS.md. -->

- Workflow skills: `/wf-feature` to build a ready spec, `/wf-debug` for defects,
  `/wf-plan` when requirements are unclear, `/wf-improve` to prioritize next
  work. Resume the work item's `checklist.md` rather than restarting.
- For explorer delegations use the built-in `Explore` agent; for mechanical
  implementation against a precise brief use `general-purpose`. Briefs must be
  self-contained — subagents inherit no conversation history.
- Verify subagent output against the filesystem and `git diff` yourself. A
  subagent's claim is not evidence.
