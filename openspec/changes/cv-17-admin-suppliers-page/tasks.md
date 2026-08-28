## 1. Dependencies

- [ ] 1.1 Add `"@medusajs/js-sdk": "2.18.0"` and `"@medusajs/icons": "2.18.0"` to
      the `dependencies` block of `apps/backend/package.json`, keeping the
      alphabetical order of the existing `@medusajs/*` lines. Verify with
      `npm install` from the repo root followed by
      `git diff --stat package-lock.json` — the lockfile should change only by
      adding the two direct edges, and `npm ls @medusajs/js-sdk @medusajs/icons`
      should still report `2.18.0` with no `invalid` or `deduped` warnings.

## 2. The SDK client

- [ ] 2.1 Create `apps/backend/src/admin/lib/sdk.ts` exporting one configured
      `Medusa` instance from `@medusajs/js-sdk`, with
      `baseUrl: import.meta.env.VITE_BACKEND_URL || "/"`,
      `debug: import.meta.env.DEV` and `auth: { type: "session" }`. See
      design.md Decision 1 — `auth.type` must be exactly `"session"`, or every
      admin request answers 401. Verify by running `npm run dev` in
      `apps/backend` and confirming it compiles with no error naming this file;
      nothing renders it yet.
- [ ] 2.2 In the same file, export a `Supplier` type with exactly the fields the
      API returns after it strips the token: `id`, `name`, `email`, `phone`,
      `collection_address: string | null`. Do not add `api_token` — its absence
      is what makes D-003 a compile-time guarantee. Verify by opening the file
      in the editor and confirming no TypeScript error is reported.

## 3. The list page

- [ ] 3.1 Create `apps/backend/src/admin/routes/suppliers/page.tsx` with a
      default-exported component and
      `export const config = defineRouteConfig({ label: "Suppliers", icon: Buildings })`
      from `@medusajs/admin-sdk`, importing `Buildings` from `@medusajs/icons`.
      Verify: with the dev server running, "Suppliers" appears in the sidebar at
      `http://localhost:9000/app` and clicking it opens `/app/suppliers`
      (spec: *Suppliers entry in the admin sidebar*, both scenarios).
- [ ] 3.2 In that component, load the list with
      `useQuery({ queryKey: ["suppliers"], queryFn: () => sdk.client.fetch<{ suppliers: Supplier[] }>("/admin/suppliers") })`
      from `@tanstack/react-query`. No `enabled` option — the query must run on
      mount. Verify in the browser devtools Network tab: opening the page fires
      exactly one request to `/admin/suppliers` with no query string
      (spec: *One request, no query parameters*).
      If the page instead throws "No QueryClient set", the dashboard is not
      providing one above admin route extensions and this change needs its own
      QueryClientProvider — stop and raise it rather than working around it.
- [ ] 3.3 Add the four render states as early returns, in this order:
      `isPending` → a `Spinner` from `@medusajs/ui`; `isError` → a `Text`
      saying the suppliers could not be loaded; zero suppliers → a `Text`
      saying there are none yet; otherwise fall through to the table. Order
      matters (design.md Decision 5). Verify each state in section 6.
- [ ] 3.4 Render the loaded state as a `@medusajs/ui` `Table` with a header row
      of Name / Email / Phone and one `Table.Row` per supplier, keyed by
      `supplier.id`. Wrap the whole thing in a `Container` with `px-6 py-4`
      padding, and use `Text` rather than raw `p`/`span` for cell content.
      Verify: with at least two suppliers in the database the page shows a
      header row plus one row per supplier, each with the right values
      (spec: *Suppliers exist*).
- [ ] 3.5 Render each supplier's name inside a `Link` from `react-router-dom`
      with `to={`/suppliers/${supplier.id}`}` — no `/app` prefix, the dashboard
      router already supplies it (design.md Decision 7). Verify: the name is an
      underlined/hoverable anchor, reachable by pressing Tab, and its status-bar
      target ends in `/app/suppliers/<that id>`
      (spec: *The link is a real link*).

## 4. The detail page

- [ ] 4.1 Create `apps/backend/src/admin/routes/suppliers/[id]/page.tsx` with a
      default-exported component that reads the id with `useParams()` from
      `react-router-dom`. This route needs no `defineRouteConfig` — it must not
      appear in the sidebar. Verify: navigating to `/app/suppliers/<some id>`
      renders the new component and the sidebar still shows one "Suppliers"
      entry, not two.
- [ ] 4.2 Load the supplier with
      `useQuery({ queryKey: ["supplier", id], queryFn: () => sdk.client.fetch<{ supplier: Supplier }>(`/admin/suppliers/${id}`) })`.
      Verify in the Network tab: one request to `/admin/suppliers/<id>` on
      mount.
- [ ] 4.3 Add three render states as early returns: `isPending` → `Spinner`;
      `isError` → a `Text` saying the supplier could not be loaded; otherwise
      the fields. There is no separate not-found branch — a 404 makes the
      fetcher throw, so it lands in `isError` (design.md Decision 5).
- [ ] 4.4 Render the four fields — name, email, phone, collection address — as
      label/value pairs, label as
      `<Text size="small" leading="compact" weight="plus">` and value as
      `<Text size="small" leading="compact">`. Render `collection_address` as a
      dash when it is `null`, never the string "null" and never an omitted row
      (spec: *Collection address is absent*). Render no other field.
      Verify: the page shows exactly these four labels and nothing else.

## 5. Lint and build

- [ ] 5.1 Run `npm run lint` from the repo root and fix anything it reports.
      Note that `src/admin/tsconfig.json` sets `noUnusedLocals` and
      `noUnusedParameters`, so a leftover import is a build failure, not a
      warning (design.md Risks). Verify: lint exits 0.
- [ ] 5.2 Run `npm run build` in `apps/backend` and verify it completes with no
      error and no warning naming a file under `src/admin/`.

## 6. Manual verification, one item per spec scenario

Run these against a dev server (`npm run dev` in `apps/backend`, dashboard at
`http://localhost:9000/app`) in this order — it walks a fresh database from
empty to populated, which is the order the states naturally occur. The seed
script creates no suppliers, so the empty state comes first for free.

- [ ] 6.1 **Empty state.** With no suppliers in the database, open
      `/app/suppliers`. It shows the "no suppliers" message, and no table header
      row (spec: *No suppliers exist*).
- [ ] 6.2 **Loading state.** In devtools, set network throttling to a slow
      profile and reload `/app/suppliers`. A spinner shows while the request is
      in flight, with no table and no error text
      (spec: *Request in flight*, list).
- [ ] 6.3 **Error state.** Stop the backend, or in devtools block the
      `/admin/suppliers` request, then reload. The page shows the error message
      and no table (spec: *Request fails*, list). Restart the backend
      afterwards.
- [ ] 6.4 **Create two suppliers** so the remaining states have data. From a
      logged-in dashboard, in the browser console:
      `await fetch("/admin/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Atlas Cuir", email: "atlas@example.test", phone: "+212600000001", collection_address: "12 Rue Test, Casablanca" }) }).then(r => r.json())`
      — then repeat with a second supplier that has **no** `collection_address`,
      so 6.8 has a null to render. Verify each call returns 201 with a
      `supplier` object. Note the api_token returned by the first call — 6.6 needs it.
- [ ] 6.5 **Loaded list.** Reload `/app/suppliers`: a header row plus exactly
      two data rows, each showing that supplier's name, email and phone
      (spec: *Suppliers exist*).
- [ ] 6.6 **No token anywhere.** In step 6.4 the `POST /admin/suppliers` response
      contained an `api_token` — copy that exact value. On the list page, use the
      browser's find (Cmd-F) to search for it, and for the word `token`. Neither
      appears, and there is no API token column (spec: *Token absent from the
      list*). The route already strips it (D-003); this confirms the page adds it
      back nowhere.
- [ ] 6.7 **Row navigation.** Tab to the first supplier's name link and press
      Enter. The URL becomes `/app/suppliers/<that id>`, the detail page renders,
      and the browser does not do a full reload — the sidebar does not flash
      (spec: *Operator activates a row's link*).
- [ ] 6.8 **Detail fields.** The detail page for the first supplier shows its
      name, email, phone and collection address. Open the second supplier's
      detail page: the collection address row is present and shows a dash
      (spec: *Supplier is rendered*, *Collection address is absent*). Search the
      page for the `api_token` value noted in 6.4, and for the word `token` —
      neither appears (spec: *Token absent from the detail page*).
- [ ] 6.9 **Detail loading and error states.** Repeat 6.2 and 6.3 against a
      detail page URL (spec: *Request in flight* / *Request fails*, detail).
- [ ] 6.10 **Unknown supplier.** Open `/app/suppliers/sup_does_not_exist`. The
      API answers 404, and the page shows the error message with no supplier
      fields (spec: *Supplier does not exist*).

## 7. Wrap up

- [ ] 7.1 Run `git status --short | grep -E "\.env|node_modules"` and confirm it
      prints nothing before proposing a commit (AGENTS.md — the repository is
      public).
- [ ] 7.2 Propose a conventional commit message (`feat: ...`) covering the two
      pages, the SDK client and the two dependency lines. Do not run
      `git commit` — the author reads the diff and commits.
- [ ] 7.3 Decide whether the "declare what the admin bundle imports" rule earns
      an ADR as **D-019** (design.md Decision 3). If yes, write it into
      `docs/decisions.md` with its `What we lose` section and add it to the
      index; if no, say so and leave the reasoning in design.md, which is
      disposable by design.
