# Decisions

Technical decisions taken during the build, and open questions that need
a business call from the CEO.

Status: `decided` · `pending-rida` · `revisit-post-mvp`

---

## D-001 — No supplier activation state in the MVP

**Date:** 2026-08-17
**Status:** pending-rida
**Linear:** CV-30

**Decision.** The `supplier` model has no `is_active` / `status` field.
Every supplier in the database is considered active.

**Why.** For the MVP and the closed pilot, suppliers are created manually
by the operator. Creating a supplier *is* the approval. Adding a state
field would mean checking it in every route, the submission middleware,
and the order routing logic — cost spread across the codebase for a
guarantee we already get from the manual process.

**What we lose.** No way to suspend a supplier without deleting them.
No self-service signup possible without adding this back.

**To confirm with Rida.** Is there a real case where a supplier must be
temporarily blocked (unpaid, quality issues, dispute) during the pilot?
If yes, this comes back before the demo, not after.

---

## D-002 — Static token auth for the pilot (M3a), not real accounts (M3b)

**Date:** 2026-08-17
**Status:** pending-rida
**Linear:** CV-31

**Decision.** Each supplier gets a static API token, generated at creation
and stored in the database. It is sent as an HTTP header on every request.
No login screen, no password, no session. Full account-based auth (M3b) is
deferred post-MVP.

**Why.** ~3h instead of ~13h. Medusa's custom actor-type auth has
documented pitfalls (middleware wildcards, authenticated vendors unable to
use the admin UI). For a demo and a closed pilot with ~5 known suppliers,
a token is enough: we hand it to them directly, they paste it into the
submission form.

**What we lose.** Whoever holds the token *is* the supplier — no per-person
revocation without rotating the whole token. No password recovery flow.
Not acceptable for public signup.

**To confirm with Rida.** Are pilot suppliers comfortable pasting a token
into a form, or does the absence of a normal login hurt credibility during
the demo? If it does, M3b returns to MVP scope and the demo date moves.
