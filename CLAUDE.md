# Saree Business App — Project Context

This file is auto-loaded by Claude Code at the start of every session in
this folder. It exists so you don't have to re-explain the project.

## This is the v2 experimental fork

This folder (`saree-app-v2`) is a **full copy of the original `saree-app`**,
made 2026-08-15 as a sandbox for structural changes too big to risk on the
live production app directly — a weaver financial ledger/wages, per-saree
serialization, material wastage reporting, and a few other gaps identified
against a reference ERP mockup (see the roadmap below). It has its own git
history (no shared remote with the original), its own local Postgres
database (`saree_app_v2` on the same local server, port 5433 — completely
separate from the original's `saree_app` DB), and its own dev port
(`3010`, so both copies can run side by side; see `package.json`'s
`dev`/`start` scripts and `.env`'s `NEXTAUTH_URL`). It currently shares the
same Supabase Storage project/bucket as the original for damage photos —
fine for local dev, revisit if this copy ever goes to production.

Everything below this point was copied verbatim from the original's
CLAUDE.md at fork time and describes the **starting state** — treat it as
already-true baseline, not aspirational. New work in this fork should be
documented the same way (append to relevant sections, add a roadmap entry)
so this file stays accurate as the two projects diverge.

## What this is

A multi-user Next.js + PostgreSQL + Prisma web app for a saree business.
It's a **stock-tracking tool first** — raw-material purchases, production,
weaver work, godown/home stock, sales, parties, and a damage/repair
register — not a billing/GST system. Purchase and Sale invoice numbers are
typed in by hand from the physical bill copy (see Conventions below); the
app doesn't generate its own official invoice numbering. The business
operates across **three firms** for purchasing and selling, but production
and inventory are shared.

Full functional spec lives in `README.md`. The data model lives in
`prisma/schema.prisma` — read that first for any new feature, since it
already defines most of the entities you'll need.

## Roles

Two roles only — **Master** and **Worker**. There is no Weaver login.

- **Master** — full access to everything, including user/permission
  management.
- **Worker** — a **fixed** capability set, not configurable per account:
  Saree Receiving, Warp Alerts, Assign Warp, Material Issue, Damage Entry
  (mapped to permission keys `sareeReceiving` / `warpAlerts` /
  `assignWarp` / `materialIssue` / `damageEntry` in
  `src/lib/permissions.ts`). Workers never get Purchases, Sales, Payments,
  Reports, or master-data editing. There is no per-worker checkbox UI
  anymore — `can()` hardcodes this set.
- **Weavers are master data, not accounts.** `WeaverProfile` is a
  standalone table (own `name`/`mobile`/`address`/`isActive` fields,
  `WeaverSareeType` join for the saree types they weave) with **no
  required link to `User`** — weavers don't log in. The 2 legacy weaver
  logins were disabled (`role: WORKER, isActive: false`) rather than
  deleted, to preserve their historical `WorkTicket` foreign keys; new
  weavers created going forward have no `User` at all.

## Spec expansion project (in progress)

The business owner supplied a much larger 27-section spec (React +
Supabase + RLS + strict Head/Worker model) for what the app should
eventually cover. Decision: **extend the current stack** (Next.js +
Prisma + Postgres + NextAuth) rather than rewrite it — most of the spec is
already implemented here — and only bring in Supabase for the one gap
with zero existing implementation, damage-photo storage. Being delivered
in phases with a checkpoint after each:

1. ✅ **Role Simplification & Foundation** (done) — collapsed to
   Master/Worker, removed Weaver login, added `SareeType.jariPerSaree` /
   `weftGramsPerSaree` / `alternateNames`, reworked `RawMaterial.unit`
   from a 2-value enum to free text + a `category` enum
   (`WARP`/`WEFT`/`JARI`/`OTHER`, with the "Warp is always Nos, never Kg"
   rule enforced in the create/edit action, not the schema).
2. ✅ **Masters completion** (done) — `Firm.contactInfo`, `Party.email`,
   new `Branch` model (multi-branch per party, selectable on Sale/Purchase
   with address auto-fill, printed on the PDF bill when set),
   `StockLocation.address` (Godowns tab renamed/relabeled, still handles
   both GODOWN and HOME kind), new **Raw Material Master**
   (`/settings/raw-materials`, didn't exist before — `currentStock` stays
   read-only/transaction-driven, only name/category/unit/lowStockLevel are
   editable), and a Weaver detail page (`/settings/weavers/[id]`, static
   fields at the time — performance stats were added in phase 5 once
   warp-cycle history existed). Also fixed a pre-existing `tsc` bug in
   `PartiesClient.tsx`
   (edit-form `type` field was typed too narrowly) while rewriting that
   file for the email/branches additions.
3. ✅ **Purchase/Return correctness** (done) — `Purchase.purchaseNumber`
   (auto `PUR-000001`, same counter pattern as `damage.ts`'s
   `nextDamageNumber`), `purchaseType` (`WITH_INVOICE`/`WITHOUT_INVOICE` —
   `invoiceNumber` is now `String?`, required only for `WITH_INVOICE`,
   enforced via a zod `.refine`), `lrNumber`/`ewayBillNumber`. Fixed the
   Purchase Return gap: `PurchaseReturnItem` line items are now
   **required** (at least one), scoped in the UI to the original
   purchase's own raw materials, and reliably decrement
   `RawMaterial.currentStock` — previously this was a single optional
   material/quantity pair that was easy to skip, silently leaving stock
   wrong. (Sales Return has the same "no over-return quantity cap"
   limitation as before — not touched this phase, noted as a follow-up
   since the spec does call for it on the sales side.)
4. ✅ **Warp Dyeing / Warp Cycle / Warp Alert / Assign Warp / Material
   Issue / Saree Receiving / 24th-saree changeover** (done — merged with
   what was originally a separate phase 5, since removing the Weaver
   self-report portal in phase 1 had silently broken the old
   `WorkTicket` "Collect" flow; shipping the new flow incomplete would
   have just left production broken in a different way). See "Warp
   Dyeing / Production workflow" below for the full model.
5. ✅ **Sales auto-numbering / courier & freight fields / Sales Return
   redesign / damage photos / Weaver Performance** (done) —
   `Sale.saleNumber` (auto `SAL-000001`, same counter pattern),
   `ewayBillNumber`/`courierLrNumber`/`courierCharges`/`freightStatus`.
   `SalesReturn` gained required `SalesReturnItem` line items (mirroring
   Purchase Return's phase-3 fix) that both **cap the returned quantity**
   against what's actually left on the original `SaleItem` (spec section
   14) and route by **condition** — `GOOD` back to `FinishedStockBalance`
   NORMAL stock, `DAMAGED` into a new `DamageRegister` entry instead
   (spec's "Good → Saree Stock, Damaged → Damage Section" rule, not
   previously implemented). `DamageRegister` gained `repairable`
   (renamed `repairVendor`→`repairer` for spec-field parity),
   `repairAmount`, a `NON_REPAIRABLE` terminal status +
   `markNonRepairable` action, and an optional `weaverId` on damage
   reports (needed so Weaver Performance's damage-rate stat means
   anything — previously no UI ever set it). Damage photos wired to
   **Supabase Storage** end-to-end (`src/lib/storage.ts`,
   `uploadDamagePhotos` action, upload UI on both the report form and a
   per-entry "Photos" modal) — ✅ credentials now supplied and real upload
   is live-verified (see "Supabase Storage" below). Weaver Performance
   stats now live on `/settings/weavers/[id]` — see "Warp Dyeing /
   Production workflow" above for what they're computed from.
6. **Reports** (via `recharts`, ✅ done — see "Reports" below) + mobile/PWA
   polish (✅ done — see "Mobile / PWA" below). The audit-log/error-handling
   gap that used to be bundled into this phase is ✅ done too (see "Known
   gaps" below for what changed). **Phase 6, and the whole spec-expansion
   project, is now complete.**

Full per-phase design detail lives in the plan doc from the planning
session; re-derive it from this file + the schema if that's unavailable.

## What's built so far

- Full Prisma schema (all entities: users/roles, firms, parties, raw
  materials + stock ledger, warp batches w/ 24-saree capacity, weaver work
  tickets, collections, finished-stock balances, godown→home transfers,
  purchases/sales + returns, payments, damage register, audit log).
- Auth: NextAuth, mobile + password login, JWT session carrying role only
  (no per-user permissions in the token — Worker access is fixed, see
  Roles above).
- Role-aware sidebar (`src/components/Sidebar.tsx`) — shows only what the
  signed-in user is permitted to see.
- Dashboard with live stats pulled from the DB.
- **Masters CRUD, all done:**
  - Party Master (`/parties`) — suppliers/customers, Purchase/Sales/Both.
    Each row also links out to `/payments/[partyId]` via a **"Statement"**
    link (`FileClock` icon) — the same party-ledger detail page Payments
    uses, just surfaced here too so you don't have to go find the party
    again from the Payments list. Always visible (not gated behind
    `canEdit`, unlike Edit/Deactivate) since viewing a statement isn't an
    edit action.
  - Settings (`/settings`, Master-only, tabbed): Firms, Saree Types (name +
    alternate names + Jari/Weft consumption), Stock Locations, Weavers
    (master data only, multi saree-type assignment, no login), Worker
    Accounts (creates login; no permission checkboxes — access is fixed).
- **Orders** (`/orders`, `orders` permission key, Master-only) — records a
  customer order *before* production starts: party (+ their mobile/address
  shown read-only once picked), saree type, quantity, price per saree
  (→ auto-computed total), warp/weft/jari colour (free text, same "shade
  book, not a dropdown" convention as `DyeingShadeLine.shadeNumber`),
  description, due date, notes. Auto `orderNumber` (`ORD-000001`, same
  counter pattern as Purchase/Sale/Damage/Dyeing). `Order.status` is a
  **manual checklist** the Master clicks through — `ORDER_PLACED` →
  `WARP_DYEING` → `WEAVING` → `READY` → `DELIVERED`, or sideways to a
  terminal `CANCELLED` from any non-final state — deliberately **not**
  derived from real `DyeingBatch`/`WarpAssignment`/`SareeReceivingEntry`
  records, since one warp's 24 sarees go into general stock rather than
  being earmarked for a specific order; linking status to real production
  records would need a much larger rework of how output gets attributed.
  `Order` doesn't touch stock or create a `Sale` — it's purely an intake/
  tracking record; converting a fulfilled order into an actual `Sale` (with
  its own stock decrement) is a manual, separate step for now.
- **Purchase Entry** (`/purchases`, `/purchases/new`) — auto internal
  `purchaseNumber` (`PUR-000001`) + firm + party + branch (optional,
  address auto-fill), With/Without Invoice `purchaseType` (invoice number
  required only for With Invoice), LR/E-Way Bill numbers, raw material
  line items (each with a **"+ Add new raw material…"** option that opens
  a small inline create form — Name/Category/Unit — so a new Jari brand
  or Weft colour never has to be pre-registered in Settings before you can
  log buying it), GST calc, stock ledger update, printable PDF bill, and
  returns with **required** line items that reliably decrement stock.
  **JARI-category line items are the one exception to "stock ledger
  update"** — see "Jari Lots" below; they land as an unassigned lot
  instead of moving `RawMaterial.currentStock` directly.
- **Warp Dyeing** (`/production`) — Send Warp for Dyeing (shade
  distribution per physical warp, validated to sum to 24), Receive Dyed
  Warp, Dyed Warp Stock, Dyeing History. Master-only (dyeing isn't in
  Worker's fixed 5-key set). The old Warp Batch/Work Ticket UI that used
  to live here is gone from the active UI (see "Warp Dyeing / Production
  workflow" below) — the underlying `WarpBatch`/`WorkTicket`/
  `WorkTicketMaterial`/`Collection` tables and their historical rows are
  untouched, just no longer written to.
- **Warp Alerts & Assignment** (`/warp-alerts`) — per-weaver current-warp
  progress (X/24), 18-23 alert badge, Assign Warp modal (reserves dyed
  warp stock by shade), "Enter warp start date" and the 24th-saree
  changeover actions.
- **Material Issue** (`/material-issue`) — weaver + saree type + count
  (1-6), Weft (select-or-type a colour) auto-calculated from
  `SareeType.weftGramsPerSaree` and deducted from stock, and Jari issued
  as a **mix of two brands** ("Jari 1"/"Jari 2", each its own
  `RawMaterial` row) with per-brand quantities the Master can edit freely
  — see "Jari brands & Weft colours" below for why.
- **Saree Receiving** (`/saree-receiving`) — the 1-23 tick grid per active
  warp assignment; column 24 is gated by the changeover rule. Clicking an
  **already-ticked** cell (instead of being a no-op) opens a choice: **Unreceive**
  (`unreceiveSaree` in `sareeReceiving.ts` — undoes a mis-click, deleting the
  `SareeReceivingEntry` and reversing the `FinishedStockBalance` NORMAL
  increment; blocked once the 24th has been marked woven for that warp, since
  that step already required all 23 to be genuinely received) or **Mark as
  Damaged** (routes to `/damage?locationId=&sareeTypeId=&weaverId=`, which
  `DamageClient.tsx` reads on mount to pre-fill and auto-open the report-damage
  modal, then clears the URL via `router.replace` — the receiving entry itself
  is left alone, since the saree really was received, just turned out damaged;
  the normal `reportDamage` action's NORMAL→DAMAGED stock move handles the rest).
- **Stock** (`/stock`) — raw material levels, finished-stock-by-location
  table, Godown → Home transfer, and Master-only **"Adjust stock"** on
  both sections (`src/lib/actions/stockAdjustment.ts`) — a free-form
  Add/Subtract stock-level change with no Purchase/Sale/reason required,
  for opening stock, count corrections, or anything else that doesn't fit
  the normal transactional flows. Matches the rest of the production
  chain (see "None of the production-chain stock checks block anymore"
  below) in not blocking on the result going negative. Raw material
  adjustments are logged as a `RawMaterialTransaction` with
  `type: 'ADJUSTMENT'` (the same type any other non-purchase stock
  correction uses) and `refType: 'ManualAdjustment'`, quantity signed
  +/- by direction; finished saree adjustments just increment/decrement
  `FinishedStockBalance` NORMAL directly at the chosen location. (This
  superseded an earlier Add-only "Add opening stock" feature — same idea,
  generalized once real usage showed a one-way opening-stock tool wasn't
  enough for day-to-day corrections.)
- **Jari Lots** (`/jari-lots`, `jariLots` permission key, Master-only) —
  unopened boxes of Jari received via Purchase, waiting to be checked and
  named a brand before they count as Raw Material stock. See "Jari Lots
  (unassigned-brand receiving)" below for the full flow.
- **Sales Entry** (`/sales`, `/sales/new`) — auto internal `saleNumber`
  (`SAL-000001`) + firm + customer + branch, manually-entered invoice
  number, E-Way Bill/Courier-LR numbers, courier charges, freight
  Paid/To-Pay status, saree type/qty sold from a chosen Home stock
  location only, GST calc, atomic stock decrement, printable PDF bill,
  and **returns with required line items** capped against remaining
  quantity and routed by Good/Damaged condition (see roadmap phase 5).
  An **"Opening / historical entry"** checkbox on the New Sale form sets
  `Sale.isOpeningEntry` — still a full Sale record (saleNumber, invoice
  number, GST, line items, shows in Sales history/Reports and feeds the
  party's ledger balance normally) but `createSale` skips the stock-
  sufficiency check and the `FinishedStockBalance` decrement entirely, and
  the Home-stock-location field isn't required — for backdating a bill
  whose goods already left stock before this app existed to track them.
  Shows an "Opening" badge in the Sales list.
- **Damage & repair register** (`/damage`) — report a damaged saree
  (moves 1 unit from `NORMAL` to `DAMAGED` in `FinishedStockBalance`,
  optional weaver attribution, optional `repairable` Y/N, optional
  photos), then walk it through `SENT_FOR_REPAIR` → `UNDER_REPAIR` →
  `REPAIRED` (with `repairer` + `repairAmount`) → back to `NORMAL` stock,
  or sideways to the terminal `NON_REPAIRABLE` status from any
  pre-`REPAIRED` state, each stock-affecting step moving
  `FinishedStockBalance` in lockstep with `DamageRegister.status`. Photos
  upload to Supabase Storage (one or more per entry, addable at report
  time or later) — see roadmap phase 5 for the "code complete, untested
  without live credentials" caveat.
- **Payments & Party Ledger** (`/payments`, `/payments/[partyId]`) — party
  list with a computed running balance, a Record Payment modal (direction
  defaults from `Party.type`, both screens use the same modal/action), and
  a per-party ledger detail page showing every Purchase/Sale/Return/
  Payment chronologically with a running balance column. See "Payments &
  Party Ledger" below for the balance formula. No GST/billing logic, as
  scoped. `Payment` create is append-only — no edit/delete action, same
  "correct via a new entry" reasoning as `Branch`'s missing delete.
- **Reports** (`/reports`) — sales/purchase trends, stock and damage
  snapshots, weaver and party leaderboards. See "Reports" below.

## Reports

`/reports` (`reports` key, Master-only) is a single read-only page —
`src/app/reports/page.tsx` fetches and aggregates in Node (no SQL
`GROUP BY date_trunc`; row volumes are small enough that pulling raw rows
for the last 12 months and reducing in JS is simpler than raw SQL), and
hands serialized data to `src/app/reports/ReportsClient.tsx` (`recharts`
bar/pie charts + plain tables). Sections: KPI cards (this-month sales/
purchases with a vs-last-month %, total receivable/payable, open damage
count, low-stock count, warps in progress, repair rate), a 12-month sales
vs purchases trend, sales-by-firm and top-saree-types-sold bars, a raw
material stock-status table (low-stock rows sorted first), a finished
stock-by-location stacked bar (Normal/In-repair/Damaged), a damage-by-type
pie + status summary, an all-time weaver leaderboard (links to
`/settings/weavers/[id]`), and top-5 receivables/payables (links to
`/payments/[partyId]`). No date-range picker — trend charts are a fixed
last-12-months window, leaderboards/stock/damage are all-time snapshots;
add a picker later if the business asks for one.

The party-balance formula (see "Payments & Party Ledger" below) is now
centralized in `src/lib/partyBalance.ts`'s `computePartyBalances()` —
`/payments` and `/reports` both call it instead of each having their own
copy. Only the per-party chronological walk in `/payments/[partyId]`
stays separate, since it threads a running total through ordered rows
rather than producing one aggregate per party.

While in here, also swapped the dashboard's stale `WorkTicket.count()`
stat card (frozen since phase 4 moved production off `WorkTicket`) for a
`WarpAssignment`-status-`STARTED` count, and excluded `NON_REPAIRABLE`
(a terminal, no-action-needed disposition, like `BACK_TO_NORMAL_STOCK`)
from both the dashboard's and Reports' "open damage" counts — it was
previously counted as still-open on the dashboard, which overstated it.

## Mobile / PWA

- **Responsive nav** (`src/components/Sidebar.tsx`) — still one component,
  still `<Sidebar />` with no prop changes, so none of the ~16 pages that
  render it needed touching. Below Tailwind's `md` breakpoint the desktop
  `<aside>` (`hidden md:flex`) disappears and three `md:hidden` pieces
  take over: a fixed top bar (app name + a hamburger button), a fixed
  bottom tab bar (Dashboard + the user's first 3 permitted nav items +
  a "More" tab — Master has 13 possible nav items, nowhere near fitting
  in a bottom bar), and a full-screen slide-up sheet (opened by either
  the hamburger or "More") listing every permitted item plus Sign out.
  Both the top bar and bottom bar are `fixed` with an explicit `h-16`, and
  `globals.css` pads `body` (`padding-top`/`padding-bottom`, only
  `@media (max-width: 767px)`) by that same amount so fixed chrome never
  covers page content — done once at the `body` level specifically so the
  ~16 pages' own `<main className="flex-1 p-8">` never needed editing.
  Bottom-nav padding also adds `env(safe-area-inset-bottom)` for iOS home
  indicator clearance.
- **Saree Receiving grid** (`SareeReceivingClient.tsx`) — tick buttons
  went from `h-7 w-7` (28px, well under the ~44px touch-target guideline)
  to `h-11 w-11` (44px) with `touch-manipulation`; the 24th-saree
  cut/mark-woven cell widened to match. The table still scrolls
  horizontally on narrow screens (`overflow-x-auto`, sticky weaver-name
  column) — expected and fine at 24 columns, same pattern used elsewhere
  (Settings tabs, below).
- **Settings tabs** (`SettingsTabs.tsx`) — 6 tabs in a row had no overflow
  handling and would clip/wrap on a narrow screen; added `overflow-x-auto`
  + `whitespace-nowrap`.
- **PWA manifest + icons** — `src/app/manifest.ts` (served at
  `/manifest.webmanifest` via Next's file convention), `start_url: '/'`
  (redirects to `/dashboard` or `/login` depending on session — safer
  than hardcoding `/dashboard`, which would render blank for a logged-out
  visitor before the dashboard fix below). Icons are **static PNGs** in
  `public/icons/` (32/192/512/512-maskable/apple-180), not dynamically
  rendered — `next/og`'s `ImageResponse` crashes on import on Windows dev
  (see gotcha below), and static files are the more conventional choice
  for PWA icons anyway (faster, cacheable, no per-request render cost).
  Generated once by a since-deleted throwaway script using a hand-rolled
  PNG encoder (Node's built-in `zlib` only, no new dependency) — a solid
  brand-700 background with a brand-300 ring + white center dot, no text
  (avoids needing font rasterization entirely). Regenerate by writing a
  similar script if the icon design ever needs to change; there's no
  build-time dependency on it now. `layout.tsx` declares `metadata.icons`
  (`icon`/`apple`) manually since there's no `icon.tsx` file-convention
  route to auto-inject those `<link>` tags anymore, plus a `viewport`
  export (`themeColor`, no zoom lock — WCAG 1.4.4 wants pinch-zoom left
  alone) and `appleWebApp` meta for "Add to Home Screen" behavior. No
  service worker / offline caching — deliberately out of scope
  ("installable manifest" was the ask, not offline support, and caching
  live stock/sales data offline risks showing stale numbers, which is
  worse than no offline support for a stock-tracking tool).
- **Gotcha, worth knowing before touching icons again:** `next/og`'s
  `ImageResponse` (bundled with this Next 14.2.35) has a real bug —
  at **module import time** (unconditional, before any of your code
  runs) it builds a `file://` URL for its default font via
  `path.join(import.meta.url, ...)`, and `path.join` uses backslashes on
  Windows, corrupting the URL and throwing `ERR_INVALID_URL` on literally
  every request, regardless of whether you pass a custom `fonts` option.
  No newer 14.2.x patch fixes it (checked — 14.2.35 is latest). This is
  why icon generation went static instead of using the `icon.tsx` /
  `apple-icon.tsx` file-convention routes (tried first, hit this,
  pivoted). If `next` ever gets upgraded past this bug, dynamic
  `ImageResponse`-based OG images would work again, but there's no
  pressing reason to switch back.
- **Middleware gap, found while testing the above:** `src/middleware.ts`'s
  matcher excluded `login`/`api/auth`/`_next/static`/`_next/image`/
  `favicon.ico` but nothing else — so `/manifest.webmanifest` and
  `/icons/*.png` were silently redirecting to the NextAuth sign-in page
  for logged-out requests, which would have quietly broken install
  prompts and home-screen icons for anyone not already signed in (exactly
  the audience most likely to be looking at an install prompt). Fixed by
  adding `manifest.webmanifest` and `icons` to the matcher's exclusion
  list.
- **Unrelated bug fixed in passing:** `dashboard/page.tsx` used to do
  `getServerSession()` + `if (!session) return null` directly instead of
  the `requireUser()` helper every other page uses — an unauthenticated
  visitor got a blank page instead of a redirect to `/login`. Swapped to
  `requireUser()` for consistency; found this while picking `start_url`
  for the manifest and didn't want the installed PWA's default screen to
  be capable of rendering blank.

## Warp Dyeing / Production workflow

This replaced the old `WarpBatch`/`WorkTicket`/`Collection` flow in phase
4. Chain: `DyeingBatch` (send, decrements raw Warp stock) →
`DyeingBatchWarp` (one row per physical warp) → `DyeingShadeLine` (shade
number + sent/received quantity, sent validated to sum to 24 per warp) →
receiving fills in each line's `receivedQuantity`/`shadeNumber` →
`WarpAssignment` (assign a weaver + saree type + **one whole physical
warp**) → `SareeReceivingEntry` (one row per saree number 1-24, 1-23
immediately increment `FinishedStockBalance`).

**A warp is always handed to a weaver whole, never split by shade
quantity** — this replaced an earlier design (removed this session) where
receiving pooled every warp's shades into a single `DyedWarpStock` table
keyed by shade number, and assigning meant hand-typing a combination of
shade quantities that summed to 24. That flattened out exactly the thing
the business cares about — a single physical warp is often a mix of
several shades (e.g. 4 colours × 6 sarees each) — and made assignment a
manual re-entry of numbers the Master had already typed in at receive
time. Now `WarpAssignment.dyeingBatchWarpId` (nullable, `@unique`) links
straight to the specific `DyeingBatchWarp` being handed over; "available
to assign" is just `DyeingBatchWarp` rows with `receivedAt` set and no
linked `WarpAssignment` (`/production`'s "Dyed Warp Stock" section is a
grid of these — one card per physical warp, shade composition as chips —
and the same query feeds the warp picker in `/warp-alerts`'s Assign Warp
modal, `assignWarp` in `warpAssignments.ts`). `assignWarp` re-checks
`receivedAt`/no-existing-assignment inside the transaction (not just
trusting the option list), so a warp can't be double-assigned even under
concurrent requests. **Shade number is still optional at send time** (the
dyeing house often hasn't decided it yet) — `DyeingShadeLine.shadeNumber`
can be sent blank, but `receiveDyedWarp` requires a non-blank shade before
that line's `receivedQuantity` can be saved, since a received-but-nameless
shade would show up unusably in the assign picker.

`WarpAssignmentShadeLine` (free-text shade + quantity, directly on
`WarpAssignment`) is now legacy-only — kept in the schema so
pre-migration assignments (made before `dyeingBatchWarpId` existed) keep
their historical shade breakdown, but `assignWarp` no longer writes to it;
new assignments derive shade composition live from
`dyeingBatchWarp.shadeLines` instead of duplicating it. No retroactive
linking was attempted for old rows — checked before shipping this and
confirmed harmless: in production, the one pre-existing `WarpAssignment`
had used the old flow's "no shade specified" option, so it never actually
decremented the old pooled stock, meaning every already-received physical
warp was genuinely still unassigned under the new model too.

**None of the production-chain stock checks block anymore** — deliberate,
so the physical flow (weaver receives sarees) never waits on the paper
flow (accurate stock counts) catching up. `sendForDyeing` decrements
`RawMaterial.currentStock` (raw Warp) without checking it's sufficient
first, and `issueMaterial` decrements Jari/Weft `RawMaterial.currentStock`
the same unchecked way — both happily go negative instead of throwing.
The business's actual workflow: enter real warp/jari/weft counts once, at
the next changeover, rather than blocking day-to-day production entry on
them being accurate in the moment. Warp *assignment* is the one exception
to this philosophy (see above) — since a warp is now a specific physical
object rather than a fungible quantity, "assign before it's dyed" isn't a
stock-accuracy shortcut anymore, it's just handing over a warp that
doesn't exist yet, so `assignWarp` does require picking a real received,
unassigned `DyeingBatchWarp`.

**The 24th saree is special** (spec section 9 — it stays physically on the
loom to help join the new warp, so it must not be auto-received):
`WarpAssignment.twentyFourthWovenAt` records "done on the machine" with
**no** stock effect; only after the *next* assignment's `warpStartDate` is
recorded (→ `STARTED`) does `cutAndReceiveTwentyFourth` become callable,
which creates the 24th `SareeReceivingEntry`, bumps stock, and marks the
old assignment `COMPLETED`.

**Non-obvious gotcha:** a weaver can legitimately have **two** `STARTED`
`WarpAssignment` rows at once during a changeover — the old one (24th
woven, awaiting cut) and the new one (already active). Anywhere you query
"the weaver's current assignment," `.find()`-ing the first `STARTED` row
is wrong. Use `twentyFourthWovenAt: null` to mean "the one actively
accumulating progress" (used for the 18/24 alert and Material Issue), but
when linking `WarpAssignment.previousAssignmentId` for changeover-duration
tracking in `assignWarp` (`src/lib/actions/warpAssignments.ts`), fall back
to the awaiting-cut one if no active one exists — that's the *normal* case
(assigning the next warp right after the current one's 24th is woven), and
excluding it there would silently leave `previousAssignmentId` null. Hit
this exact bug once already; a full lifecycle Prisma smoke test (send →
receive → assign → receive 1-23 → mark 24th woven → assign+start the next
→ cut the 24th → verify stock/status/chaining, then clean up) is what
caught it — worth re-running after any change to this chain.

## Jari brands & Weft colours

Jari and Weft aren't single aggregate raw materials — the business mixes
different Jari **brands** together to get a custom colour, and Weft comes
in different **colours**. Rather than a new variant sub-model, each brand
or colour is just its own `RawMaterial` row under `category: 'JARI'` /
`category: 'WEFT'` (e.g. two rows named after two Jari brands) — this
already gets full Purchase-entry and Stock-page tracking for free with no
schema change, since `RawMaterial` was always "any named material with a
category."

The only place that used to assume a single canonical Jari and single
canonical Weft material was `issueMaterial` (`src/lib/actions/materialIssue.ts`),
which hard-required exactly one of each. That's gone, but **brand
attribution for Jari is entirely optional** (revised after the first cut
required exactly two brands every time — real usage doesn't always track
brand at issue time) — `MaterialIssue.jariIssued` is a standalone total
field (defaults to `SareeType.jariPerSaree * count`, fully editable) that
gets recorded *regardless* of whether a brand is picked. "Jari 1" / "Jari
2" are two independent optional `RawMaterial` pickers on top of that
total, each with its own quantity field:

- **Neither picked** — the total is still recorded on `MaterialIssue`,
  but no `RawMaterial.currentStock` is touched and no
  `RawMaterialTransaction` is created for Jari at all. Nothing to
  reconcile until stock is trued up separately (e.g. via Stock's Adjust
  Stock tool).
- **One picked** — that brand is debited the *full* total, not half.
- **Both picked** — split however the two quantity fields say (defaults
  to an even 50/50 of the total, but `.5` and `1.5` is a completely
  normal real split, not a bug — fully editable, and the two quantities
  don't have to sum back to the total field exactly).

Weft is a single select-or-type combobox (native `<input list>` +
`<datalist>`) — typing a colour that doesn't match an existing Weft
`RawMaterial` (case-insensitive) creates one on the fly inside the same
transaction (`unit: 'Kg'`, matching the existing Weft convention) rather
than blocking on it being pre-registered in Settings. Weft quantity
itself is *not* optional/brand-split like Jari — spec section 10's
"never typed in by hand" still holds there, only the colour choice is
flexible.

`MaterialIssue` itself doesn't gain new columns for which brands/colour
were used — that lives in `RawMaterialTransaction` (`refType:
'MaterialIssue'`, `refId: <issue id>`, one row per Jari brand + one for
Weft), matching how `DyeingBatch` doesn't duplicate its own line items
either. `/material-issue`'s "Recent issues" table batch-fetches those
transactions by `refId` and groups them in JS (not per-row queries) to
show the brand/colour breakdown next to each historical entry.

## Jari Lots (unassigned-brand receiving)

The Jari brand isn't just optional at *issue* time (above) — it's often
unknown at *receiving* time too: an unopened box from a supplier doesn't
say which brand mix it is until the Master physically checks it. So a
`JariLot` (`jariLots` permission key, Master-only, `/jari-lots`) sits
between Purchase and Raw Material stock specifically for JARI-category
line items:

- `createPurchase` (`src/lib/actions/purchases.ts`) checks each line
  item's `RawMaterial.category`. Non-Jari items behave exactly as before
  (increment `currentStock`, write a `PURCHASE_IN` `RawMaterialTransaction`).
  A **JARI** item instead creates a `JariLot` (status `UNASSIGNED`,
  `partyId` from the purchase, `quantity`/`unit` from the line item,
  `sourceMaterialName` copied from whichever `RawMaterial` was picked on
  the line purely for display) — `RawMaterial.currentStock` is **not**
  touched for that line at all. In practice the Master just picks a
  generic placeholder Jari material (e.g. "Jari (Unassigned)") on the
  Purchase form for these lines, same as any other raw material — no
  Purchase UI change was needed, only `createPurchase`'s stock-effect
  branches on category.
- `/jari-lots` lists every `UNASSIGNED` lot (party, originating purchase,
  quantity, received date) plus a "Recently assigned" history table. Each
  unassigned row has an **"Assign brand"** button opening a modal with a
  select-or-type brand name field (same `<input list>`/`<datalist>`
  combobox pattern as Weft's colour picker) — typing an existing brand
  name (case-insensitive match) reuses that `RawMaterial`; typing a new
  one creates it (`category: 'JARI'`, `unit` copied from the lot).
- `assignJariBrand` (`src/lib/actions/jariLots.ts`) is where the stock
  effect actually happens — resolves/creates the brand `RawMaterial`,
  increments its `currentStock` by the lot's quantity, writes a
  `PURCHASE_IN` `RawMaterialTransaction` (`refType: 'JariLot'`, `refId:
  <lot id>` — mirrors a normal purchase's transaction, just deferred),
  and flips the lot to `ASSIGNED` (`assignedMaterialId`/`assignedAt`/
  `assignedById`). Blocked (returns an error) if the lot was already
  assigned — no re-assignment path, matching `Branch`'s and `Payment`'s
  "correct via a new entry" convention rather than allowing edits.
- No schema link back from `RawMaterial` to "which lots became this
  brand" beyond the `JariLot.assignedMaterialId` FK itself — same
  reasoning as `MaterialIssue`/`DyeingBatch` not duplicating their line
  items elsewhere; `JariLot` rows are the traceable record.

## Payments & Party Ledger

`Party.openingBalance` and every party's running balance mean **"amount
this party owes the business"** — positive = they owe us (customer debt),
negative = we owe them (supplier debt). Both `/payments` (summary, all
parties) and `/payments/[partyId]` (full chronological ledger for one
party) compute it with the same formula, applied on top of
`openingBalance`:

- `+ Sale.totalAmount`, `- SalesReturn.amount` (customer owes more / less)
- `- Purchase.totalAmount`, `+ PurchaseReturn.amount` (we owe supplier more / less)
- `- Payment` where `direction: RECEIVED` (they paid down what they owed)
- `+ Payment` where `direction: PAID` (we paid down what we owed)

A `BOTH`-type party (buys from and sells to the business) gets one **net**
balance, not separate payable/receivable figures — deliberate, to match
`Party.openingBalance` being a single field, not two. `/payments` computes
it in bulk via `groupBy` per party; `/payments/[partyId]` walks the same
five tables chronologically for one party and threads a running total
through them, so if the formula ever changes it must change in both
places (there's no shared helper — `groupBy` and the row-by-row walk
don't factor cleanly into one).

## Sales Return: cap + condition routing

`createSalesReturn` (`src/lib/actions/sales.ts`) takes a required
`SalesReturnItem[]` — each line is `{ saleItemId, quantity, condition }`.
Validation caps the **combined** requested quantity per `saleItemId`
against `SaleItem.quantity` minus everything already returned against it
in prior `SalesReturn`s — not each line checked in isolation. **Gotcha hit
once, now fixed:** a single return can legitimately have two lines against
the *same* `saleItemId` (e.g. 1 Good + 1 Damaged out of one sold line), and
checking each line separately against the same DB-read "remaining" value
would let both pass even if their sum exceeds what's left. The fix
aggregates requested quantity per `saleItemId` first, then validates the
sum. Covered by a smoke test in the phase-5 verification pass — worth
re-checking if this function's validation loop is ever touched again.
`GOOD` items increment `FinishedStockBalance` NORMAL at the return's
chosen location; `DAMAGED` items increment `FinishedStockBalance` DAMAGED
at that location **and** create a `DamageRegister` row (status `DAMAGED`,
`damageType: 'OTHER'`) — one per damaged saree, so a return of 3 damaged
sarees makes 3 separate damage-register rows, each individually walkable
through the repair lifecycle afterward.

## Printable Bills (Purchase & Sale)

`src/app/purchases/[id]/print/route.tsx` and `src/app/sales/[id]/print/route.tsx`
render a proper GST-invoice layout (maroon section-header bars, Bill
From/To + Bill Details two-column block, item table with HSN/SAC, amount
in words, a Paid/Balance box, and a CGST+SGST/IGST breakdown table) —
redesigned to match a real reference bill the business uses, not the
original bare-bones table. Both routes duplicate their own `StyleSheet`
rather than sharing one, matching this codebase's existing per-route
convention.

- **The ₹ glyph doesn't exist in the PDF's base Helvetica font** (only
  basic Latin/WinAnsi is guaranteed in `@react-pdf/renderer`'s built-in
  fonts) — it silently renders as a garbled fallback glyph instead of
  throwing, so this was easy to miss until actually opening a generated
  PDF. Every amount uses `formatCurrency`/`formatNumber` from
  `src/lib/numberToWords.ts` (prefixes `Rs.` instead) rather than the
  literal `₹` character. If a custom font with the glyph is ever embedded
  instead, this convention can be dropped, but there's no pressing need.
- **HSN/SAC codes** are optional (`RawMaterial.hsnCode` /
  `SareeType.hsnCode`, editable in their Settings pages) — printed on the
  bill when set, `—` otherwise. Not required to save a Purchase/Sale.
- **Tax type (CGST+SGST vs IGST)** is auto-detected in
  `computeTaxBreakdown()` (`src/lib/gst.ts`) by comparing the first 2
  digits of the Firm's and Party's GSTIN (the real GST place-of-supply
  rule — same state → split the rate across CGST+SGST, different state →
  full rate as IGST). Falls back to IGST when either GSTIN is missing
  rather than omitting the tax line entirely. `stateFromGstin()` in the
  same file also drives the printed "State: NN-Name" line and "Place of
  supply" (the *firm's* state on a Purchase bill — money/goods are
  arriving there; the *party's* state on a Sale bill — goods are going
  there).
- **Paid / Balance** are computed live from linked `Payment` rows
  (`purchaseId`/`saleId` + the matching `direction`), not stored on the
  Purchase/Sale itself — so recording a payment later automatically
  updates the next time the bill is printed.
- **Amount in words** (`amountInWords()` in `src/lib/numberToWords.ts`)
  spells out the Indian numbering system (Crore/Lakh/Thousand), e.g.
  207900 → "Two Lakh Seven Thousand Nine Hundred Rupees only" — verified
  against the reference bill's own wording for the same amount.

## Conventions already established

- Server Actions live in `src/lib/actions/<entity>.ts`, each function
  validates input with `zod` and starts with a
  `requireMasterForAction()` / `requirePermissionForAction(key)` call from
  `src/lib/session.ts`. Follow this pattern for new actions. Every action
  that mutates data — including the master-data CRUD files
  (`firms.ts`/`locations.ts`/`sareeTypes.ts`/`users.ts`/`weavers.ts`/
  `parties.ts`, brought in line with the rest in phase 6) — wraps the
  write in `prisma.$transaction`, calls `writeAuditLog`, and returns
  `{ error? }` from a try/catch rather than letting a failure (e.g. a
  P2002 unique violation on `Firm.name`/`SareeType.name`/
  `StockLocation.name`/`User.mobile`) throw uncaught. `User` audit
  payloads strip `passwordHash` before writing before/after JSON.
- Pages that need access control call `requireMaster()` /
  `requirePermission(key)` from the same file (redirects instead of
  throwing, since these run in server components).
- Shared form UI: `src/components/ui/Form.tsx` (Field, TextInput, Select,
  TextArea, PrimaryButton, SecondaryButton) and `src/components/ui/Modal.tsx`.
  Reuse these rather than writing new form styling.
- List+modal CRUD pattern: server component page fetches data with
  Prisma and passes it to a `'use client'` sibling component
  (`<Entity>Client.tsx`) that owns the modal/table/form state and calls
  the server actions directly. See `src/app/parties/` as the reference
  example.
- Any Decimal fields from Prisma must be `.toString()`'d before being
  passed from a server component into a client component (see
  `src/app/parties/page.tsx`).
- Every stock-affecting mutation (collection, transfer, sale, purchase,
  return, damage) must be wrapped in `prisma.$transaction(...)` so the
  `RawMaterial.currentStock` / `FinishedStockBalance` ledgers never drift
  out of sync with the source records.
- Purchase/Sale `invoiceNumber` is **user-entered, not generated** — the
  business copies it from the physical bill. It's still `@unique` in the
  schema (nullable on `Purchase` now, to allow multiple Without-Invoice
  purchases), so the action catches a Prisma `P2002` and returns a
  friendly "already recorded" error rather than crashing (see
  `src/lib/actions/purchases.ts` / `sales.ts`). `Purchase.purchaseNumber`
  is the separate **auto-generated** internal number (`PUR-000001`); the
  same `next<Entity>Number(tx) → count+1, padStart(6,'0')` counter pattern
  is used by `damage.ts` (`DMG-`), `purchases.ts` (`PUR-`), `sales.ts`
  (`SAL-`), and `dyeing.ts` (`DYE-`) — reuse it for any future
  auto-numbered entity rather than inventing a new scheme.
- Multi-state stock movement (e.g. damage → repair → back to stock) moves
  one `FinishedStockBalance` row's quantity between `StockState` values
  via a small `moveStockState(tx, locationId, sareeTypeId, from, to)`
  helper — see `src/lib/actions/damage.ts` for the pattern if another
  feature needs a similar state machine.
- Schema changes against the live local DB use the **staged `db push`**
  pattern when adding required columns to non-empty tables: add the field
  nullable, `db push`, backfill via a script, flip it to required, `db
  push` again. See the git history around the role-simplification change
  for a worked example. Take a row-level JSON backup of affected tables
  before any destructive-looking push.

## Known gaps

- `Branch` has no delete action, only create/edit — deliberate, since
  `Sale.branchId` / `Purchase.branchId` can reference one and deleting
  would orphan historical records. Fix typos via edit instead.
- `createPurchaseReturn` still doesn't cap returned quantity against
  what's left on the original purchase (`createSalesReturn` now does, as
  of phase 5 — see "Sales Return: cap + condition routing" above). The
  spec only explicitly calls this out for Sales Return, so Purchase
  Return's version is a smaller, optional follow-up rather than a hard
  gap, but the two are inconsistent now — worth aligning if it comes up.

## Supabase Storage

Live and verified as of this session — `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET="damage-photos"`
are all set in `.env`. The `damage-photos` bucket was created private by
default (Supabase's default for a new bucket); `src/lib/storage.ts` uses
`getPublicUrl()` (a plain, non-expiring URL, matching `photoUrls: String[]`
being stored permanently in `DamageRegister` — not a signed/expiring URL),
so the bucket **must stay public** for photo display to keep working.
Flipped via the Storage API (`supabase.storage.updateBucket(bucket, {
public: true })`) using the service-role key rather than the dashboard.
Verified end-to-end with a real upload (real `DamageRegister` row, real
file upload, fetched the public URL back over HTTP to confirm it's
actually servable — not just that a URL string comes back — then
persisted `photoUrls` and cleaned up). If the bucket is ever recreated or
its visibility toggled off, photo display will silently start 400ing
again — same class of failure as this session's initial private-bucket
default.

## Next up (in order)

1. ✅ **Payments & party ledger** (done) — see "Payments & Party Ledger"
   above for the balance formula.
2. ✅ **Master-data CRUD audit-log/error-handling gap** (done) — see
   Conventions above.
3. ✅ **Reports** (done) — see "Reports" above.
4. ✅ **Supabase Storage credentials + live verification** (done) — see
   "Supabase Storage" above.
5. ✅ **Mobile/PWA polish** (done) — see "Mobile / PWA" above.

All 6 phases of the spec-expansion project are now complete. Nothing is
queued next — whatever comes up in normal use of the app from here is
regular maintenance/bugfix/feature work, not roadmap work (in the
*original* `saree-app` — this fork's own roadmap is below).

## v2 structural-gap roadmap (this fork only)

**All 12 of the 12 identified gaps are now done** — the plan's own 7
phases shipped first (11 gaps), then #11 (originally scoped
defer-until-needed) was requested and closed too. Identified by comparing
the app against a reference ERP mockup the business owner supplied, phased
into 7 build phases in the planning session's plan doc (re-derive from
there if unavailable — same doc also covers the original, now-superseded
4-phase alerts/forecasting plan). Each phase: implement → `tsc` + build →
DB round-trip smoke test → live smoke test → checkpoint before starting
the next. Several phases deviated from their original plan-doc sketch
once real schema/data realities surfaced during implementation — each
deviation is called out inline below; none were silent.

Nothing has been pushed anywhere — this fork has no git remote. Whatever
comes up in normal use from here is regular maintenance/feature work, not
roadmap work — there is no more identified roadmap work outstanding.

**Big structural gaps** (different data model, not just missing screens):
1. ✅ **Weaver financial ledger** (done) — `WeaverLedgerEntry` (signed
   ledger-of-events, mirrors `RawMaterialTransaction`'s pattern: positive
   = business owes weaver, negative = weaver advanced beyond what's
   earned), `WeaverWage` (quantity × rate, posts a credit), `WeaverPayment`
   (posts a debit-to-balance, optionally linked to a specific
   `WeaverWage` the same way `Payment.purchaseId`/`saleId` optionally
   link — no `paymentStatus` flag on `WeaverWage` itself, "paid" is
   always computed live from linked payments, same convention as
   Purchase/Sale bills computing Paid/Balance). Deliberately separate
   from `Payment`/`Party` — weavers stay master data, not accounts, per
   the original app's own design decision. Manual entry only (not
   auto-derived from `MaterialIssue`/`WarpAssignment`) — see
   `src/lib/actions/weaverLedger.ts`. UI: `/settings/weavers` list gets a
   Balance column, `/settings/weavers/[id]` gets a full Ledger section
   (`WeaverLedgerClient.tsx`) with four entry-type buttons and a
   chronological running-balance table.
2. ✅ **Wages/labour tracking** (done, folded into #1 above) —
   `recordWeaverWage` in `weaverLedger.ts`.
3. ✅ **Per-saree identity** (done) — extended `SareeReceivingEntry`
   in place (it already was "one row per physical saree") rather than a
   separate model: `serialNumber` (auto `SR-000001`, same
   `next<Entity>Number` counter pattern, via `nextSareeSerial()` in
   `sareeReceiving.ts`), `weightGram`/`designName` (filled in after the
   fact via `updateSareeDetails`), `warpColour`/`weftColour`/`jariColour`
   (auto-denormalized at receive time by `deriveSareeColours()` — warp
   from the physical warp's `DyeingShadeLine`s, weft/jari from the most
   recent `MaterialIssue`'s `RawMaterialTransaction` rows — approximate
   by nature, editable after), `photoUrls` (`uploadSareePhotos`, reusing
   `src/lib/storage.ts`'s now-generalized `uploadPhoto(folder, id, file)`
   — was `uploadDamagePhoto`, renamed since it's shared with damage
   photos now; Supabase paths gained a `damage/`/`saree/` folder prefix
   as part of that generalization), `status` (`IN_STOCK`/`SOLD`/`DAMAGED`,
   **informational only** — nothing sets it away from `IN_STOCK` yet,
   Sale/Damage still transact by aggregate quantity, not specific
   serials; that remains a stretch item, not done). Both places that
   create a `SareeReceivingEntry` — `receiveSaree` and the 24th-saree
   changeover's `cutAndReceiveTwentyFourth` — populate the new fields via
   the same two shared helpers. New `/saree-book` page (`sareeReceiving`
   permission key, same as Saree Receiving) lists every saree with an
   Edit-details action and a per-saree Photos modal (mirrors
   `DamageClient.tsx`'s photo-upload pattern). `SareeReceivingClient.tsx`'s
   tick action now opens a non-blocking "Add details" modal on success,
   prefilled with the auto-derived colours.
4. ✅ **Material reconciliation** (done) — `/settings/weavers/[id]` gained
   a "Material Reconciliation" section, one row per completed
   `WarpAssignment`. **Deviated from the original plan sketch**: rather
   than netting Warp+Weft+Jari material weight against total saree
   weight (the reference mockup's approach), it compares Weft
   issued-vs-formula-expected (grams) and Jari issued-vs-formula-expected
   (Nos) separately — both dimensionally valid actual-vs-`SareeType`-rate
   comparisons — with total saree weight received shown as its own
   informational stat, not netted in. The mockup's combined-weight
   approach doesn't actually work against this schema: Warp and Jari are
   both counted in Nos here (see `RawMaterialCategory`'s "Warp is always
   Nos" convention and `SareeType.jariPerSaree`'s own "Nos" comment), not
   grams, so summing them with Weft's gram figure would mix incompatible
   units. Computed inline in the page's server component, no new schema
   or action (read-only). Missing-weight sarees are flagged inline rather
   than blocking the section.
5. ✅ **"Purai" (production batch) grouping** (done) — new
   `ProductionBatch` model, purely additive: `WarpAssignment`,
   `MaterialIssue`, and `WeaverWage` each gained an optional
   `productionBatchId`. Doesn't touch any of those models' own lifecycle —
   a warp assignment tagged into a Purai still goes through assign →
   start → receive → 24th-changeover exactly as before; tagging is just a
   label. `batchNumber` is sequential **per weaver** (this weaver's Purai
   1, 2, 3...), enforced via `@@unique([weaverId, batchNumber])` +
   `nextBatchNumber(tx, weaverId)` in `src/lib/actions/productionBatches.ts`
   (same counter pattern as everywhere else, just weaver-scoped instead of
   global). New `/production-batches` page (Master-only): pick a weaver,
   see their Purai batches as cards, each with three "add existing
   untagged entry" pickers and a completion-checklist modal that always
   lets you "Complete Anyway" (matches this codebase's don't-block
   philosophy and the reference mockup's own override button).
   **Two deliberate simplifications vs. the original plan sketch:**
   - `ProductionBatchStatus` is 2 values (`IN_PRODUCTION`/`COMPLETED`),
     not 4 (`DRAFT`/`IN_PRODUCTION`/`COMPLETED`/`LOCKED`) — a
     just-created empty batch isn't meaningfully different from an
     in-production one, and the mockup itself treated Completed/Locked as
     the same visual state. `unlockProductionBatch` reverts
     `COMPLETED` → `IN_PRODUCTION`, mirroring the mockup's "Unlock for
     Edit."
   - `WeaverLedgerEntry` (Phase 1's ad-hoc adjustments) does **not** get a
     `productionBatchId` — the checklist's "wages entered and paid" check
     only needs `WeaverWage` (tagged) plus its linked `WeaverPayment` rows
     (same live-computed-from-links pattern as Phase 1, not a stored
     `paymentStatus` flag), so tagging generic ledger adjustments to a
     batch had no concrete use yet. Add it later if a real need shows up.

**Smaller but real gaps:**
6. ✅ **Dyeing billing** (done) — `DyeingBatch` gained optional
   `partyId`/`charges`/`expectedReturnDate`; `sendForDyeing` accepts all
   three (none required — the send/receive flow works identically with
   none set). `Payment` gained an optional `dyeingBatchId` alongside its
   existing `purchaseId`/`saleId`, same validation pattern
   (`recordPayment` checks the batch belongs to the party being paid).
   `/production`'s Send-for-Dyeing form shows the billing fields only once
   at least one `DYEING`-type party exists; Dyeing History table gained
   Dyeing House/Charges columns.
7. ✅ **Transporter/Agent/Job-Worker/Dyeing party types** (done, shipped
   together with #6 since #6 needed a `DYEING` party type to exist) —
   extended the `PartyType` enum with `TRANSPORTER`/`DYEING`/`AGENT`/
   `JOB_WORKER` alongside `PURCHASE`/`SALES`/`BOTH`, per the design
   decision made during planning (concrete enum values, not a generic
   Ledger Type master). `/parties`' type dropdown, filter, and
   `createParty`'s zod schema all updated. **Touched shared, already-relied
   upon logic** — `computePartyBalances()` (`partyBalance.ts`) gained a
   `dyeingSums` groupBy subtracted the same direction as Purchase (money
   owed to a supplier-like party); the per-party chronological ledger walk
   in `/payments/[partyId]/page.tsx` got the matching "Dyeing Charges" row
   type added, since CLAUDE.md's own documented convention is that this
   formula has no shared helper and must change in both places together —
   confirmed via a DB-level test that a party's balance moves correctly
   from a charge and back to zero after a linked payment, and that parties
   with no dyeing activity are unaffected. The PAID/RECEIVED direction
   default on the Record Payment modal (`PaymentsClient.tsx`,
   `PartyLedgerClient.tsx`) now treats all four supplier-like types
   (`PURCHASE`/`TRANSPORTER`/`DYEING`/`AGENT`/`JOB_WORKER`) as defaulting
   to PAID, not just `PURCHASE`.
8. ✅ **Simplified P&L** (done) — new `Expense` model
   (`MANUFACTURING`/`OTHER` category, optional `firmId`, append-only like
   `Payment`) + `src/lib/actions/expenses.ts`'s `recordExpense`.
   `/reports` gained a "Profit & Loss" section — Sales − Purchases − Wages
   − Expenses = Net Margin, explicitly labeled "simplified, cash-basis,
   not full accrual/COGS costing" (no per-item costing engine exists or is
   planned). Wages here means the sum of ALL `WeaverWage.amount` in the
   period regardless of whether it's been paid yet (Phase 1's
   payment-status-computed-from-links convention) — a wage is an incurred
   labour cost the moment the work is recorded, not when cash moves. A
   "Record Expense" button lives right on the Reports page itself (Reports
   is otherwise read-only, but this is the same low-friction "act near
   where you see the number" precedent as `/stock`'s Adjust Stock buttons).
9. ✅ **Stock valuation** (done) — computed reads, no new stock-tracking
   schema: raw material value = `currentStock × most recent
   PurchaseItem.rate` for that material (rows pulled and reduced in JS,
   same "no SQL GROUP BY" convention already used elsewhere on
   `/reports`); finished saree value = `FinishedStockBalance.quantity ×
   SareeType.costPrice` (new optional field, manually maintained in
   Settings → Saree Types — no automatic costing). `/stock` gained a Value
   column on both sections plus a "priced items only" total row; unpriced
   materials/saree types show `—` rather than being assumed zero.
10. ✅ **Saree Colour / Jari Code masters** (done) — **scoped down from
    the mockup's four independent colour masters to two** (`SareeColourMaster`,
    `JariCodeMaster`), both new short code+name master-data models with
    Settings tabs (`/settings/colours`, `/settings/jari-codes`), sharing
    one generic `CodeNameMasterClient` component (`src/components/`) since
    their CRUD shape is identical — genuinely repeated UI, not a premature
    abstraction. `SareeReceivingEntry` (Phase 2) gained optional
    `sareeColourId`/`jariCodeId` FKs **alongside**, not replacing, its
    existing free-text `warpColour`/`weftColour`/`jariColour` fields —
    Warp/Weft colour already have real, working representations
    (`DyeingShadeLine.shadeNumber` and the Jari/Weft `RawMaterial`-row
    convention documented in "Jari brands & Weft colours"), so only the
    two gaps that had *no* structured master at all (the saree's own
    displayed colour, and the Jari brand-mix short code recorded per
    saree) got new models.
11. ✅ **Item Group classification** (done — requested explicitly after the
    other 11, despite being scoped lowest-priority/defer-until-needed in
    the plan) — **deliberately not a model rename**. `SareeType` gained an
    `itemGroup` enum (`SAREE`/`DHOTI`/`WASTE`/`OTHER`, `@default(SAREE)`)
    rather than being renamed to a generic "Item" model: `sareeTypeId` is
    referenced by ~10 other models
    (`WarpAssignment`/`MaterialIssue`/`SaleItem`/`FinishedStockBalance`/
    `DamageRegister`/`Order`/`WeaverWage`/etc.) and the label is pervasive
    throughout the UI text across dozens of files — a full rename would
    have been a large, risky mechanical sweep for a cosmetic difference,
    since every one of those relations already treats `sareeTypeId` as a
    generic "which finished-good type" FK with zero saree-specific
    business logic gating it. Confirmed this with a DB-level test: created
    a `DHOTI`-group entry and pushed it through `FinishedStockBalance` and
    a `Sale`/`SaleItem` exactly like a real saree, using the *existing*
    unmodified actions — no other file needed to change for a non-saree
    item to actually work end-to-end. `jariPerSaree`/`weftGramsPerSaree`
    (saree-weaving-specific) just default to 0 for non-`SAREE` groups, no
    schema-level enforcement (same "rule lives in the action/UI, not the
    schema" convention as `RawMaterialCategory`'s Warp-is-always-Nos
    rule). `/settings/saree-types` (nav label and route deliberately left
    unrenamed) gained a Group column + selector; Sales/Stock/Reports/etc.
    needed **zero** changes since they already fetch saree types
    generically.
12. ✅ **Reports date-range + firm filter** (done, built together with #8
    since both needed the same `sales`/`purchases`/`saleItems` fetch) —
    `/reports` accepts `?from=&to=&firmId=` query params, defaulting to
    the original fixed last-12-months window when absent.
    `monthKeysBetween()` replaced the old fixed-length `last12MonthKeys()`
    to handle arbitrary ranges. **Deliberately partial scope**: the filter
    only affects the trend chart, sales-by-firm, top-saree-types, and P&L
    (everything derived from those three now-filterable queries) — the
    KPI "this month vs. last month" cards and the all-time snapshots
    (stock status, weaver leaderboard, damage, receivables/payables) keep
    their existing fixed behavior unchanged, since a custom date range
    doesn't map cleanly onto "this calendar month" or a point-in-time
    snapshot. Retrofitting every section of an already-intricate dashboard
    to one filter would have been a much bigger redesign than closing this
    specific gap called for.

## Setup

See `README.md` for `npm install` / `.env` / `db:push` / `db:seed` steps.
Default Master login after seeding: mobile `9999999999`, password
`changeme123`.
