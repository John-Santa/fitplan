# Habit tracking (Atomic Habits)
Objective: track the training habit following Atomic Habits. Branch: feat/habit-tracking. Delivery: single-pr, deployed to main on approval. Runner: `pnpm test` (vitest), `pnpm typecheck`, `pnpm build`.

## Specs
- S1 — Request: "Quiero que siga el concepto de seguimiento de este hábito, según lo planteado en habitos atómicos". Approved proposal (user: "Me gusta, vamos con eso!"):
- S2 — Habit tracker ("no rompas la cadena"): grid of the last 12 weeks, one mark per day the planned activity was kept. Training, walk and scheduled rest all count.
- S3 — Never miss twice: the streak does not reset for a single missed day. If yesterday was missed, the Hoy hero says "Ayer no se pudo, hoy no falles dos veces" and pushes today's session.
- S4 — Two-minute rule: a "Día difícil: versión mínima" button (warm-up + first exercise) that counts for the tracker.
- S5 — Identity votes: a line like "23 entrenamientos: así entrena un atleta"; each session is a vote for who you want to be.
- S6 — Implementation intention: per weekday "Entreno a las [hora] en [lugar]", shown on the Hoy card.
- S7 — Screens are drafted in Stitch for approval before the UI is coded (proposal step).

Assumptions (parent): a day is kept when a finished session exists on that date, or the user checked it in (walk/custom days have no session log, so they get a manual "Hecho" check-in); rest days are kept automatically; future days are neutral; two consecutive missed non-rest days break the streak. Check-ins and intentions persist in Config as optional fields merged with defaults (no IndexedDB version bump).

## Tasks
- [x] T1 — S2,S3,S5,S6 domain: `src/lib/habit.ts` (day status, 12-week grid, streak with never-miss-twice, votes, missed-yesterday) + Config fields `habitCheckIns`, `intentions` in mergeConfig + tests. Route: delegated (parallel with T2 Stitch). Commit 8345c1d; 325 tests green; review declined by user.
- [x] T2 — S7 Stitch screens (Hoy with streak/intention/minimal + tracker grid). Route: inline (parent, Stitch MCP). Screens a293faa3 (Hoy) and 67e94f8d (Progreso · Hábito); approved.
- [x] T3 — S2-S6 UI after screen approval. Route: delegated, 3 parallel writers (A Home, B Habit view + App + bestStreak/consistency, C minimal session).

## Log
- L1 (2026-11-10) user: "Antes de los test continuemos con un par de cosas 1. Quiero que siga el concepto de seguimiento de este hábito, según lo planteado en habitos atomicos atómicos"
- L2 (2026-11-10) user approved the five-point proposal: "Me gusta,  vamos con eso!"
- L3 (2026-11-10) user could not see the screens in Stitch (not placed on the canvas); screenshots sent. User: "Lo apruebo, tienes 12 minutos para hacerlo"
- L4 Decisions: votes count all-time (identity accumulates), plus "Mejor racha" and consistency % shown in the design.
