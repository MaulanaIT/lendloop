# Design notes

The UI was designed first as a clickable prototype
(`design-references/LendLoop.dc.html`, renders in `design-references/screenshots/`)
from a written design brief. The prototype is the source of truth for layout and
copy. This note records why it looks and behaves the way it does, the decisions
the prototype annotated on screen, what was cut on purpose, and where the build
differs from it.

## Goals

The evaluation criteria shaped the design as much as the product did. Each
criterion has something on screen that answers it:

| Criterion | Answer in the UI |
|---|---|
| Code structure | A small set of reusable pieces: `StatusBadge`, `ToolCard` (public / member variants with owner and admin flags), `ActivityTimeline` (loan detail and inline in every loan row), shadcn-style primitives and token names, so design and code use the same vocabulary. |
| Security-minded thinking | Data minimization is *visible*: public cards show name + category only, contact unlocks only after approval, admins never see emails, the automation log shows field *names*, and the Configuration card shows whether a secret exists, never its value. 403 and 404 are chosen deliberately. Actions a role can't take are hidden; actions that are blocked right now are disabled with the reason. |
| UX and practicality | Filters in the URL, a calendar that blocks booked days, inline validation, optimistic updates, loading / empty / error states on every screen, a bottom tab bar on mobile, 44px touch targets. |
| Integration reliability | A per-loan activity timeline (the bonus), and an admin Automation console with deliveries, reminder runs, retries, failures, ignored duplicates, idempotency keys, signing status and secret presence. Failures are never silent: red Admin badge, banner, and a calm fallback message for users. |
| Documentation | Key decisions are annotated in the prototype (below), and the README reuses them. |

## Visual direction: "Community Toolshed"

Warm, minimal, trustworthy. There is **one brand color (teal)**, and every other
color carries meaning: loan status, category, Trusted Lender, Admin, and
automation failures. That way the signals an evaluator looks for stand out.

Rejected directions:
- **Hardware Store** (orange + black): too loud, and it clashes with the
  overdue / warning colors.
- **Civic Calm** (blue + grey): generic SaaS, and its blue collides with the
  "Approved" status.

### Tokens (summary; full set in `app/globals.css`)

| Token | Light | Dark |
|---|---|---|
| background / foreground | `#FBFAF7` / `#1C1917` | `#0E0D0B` / `#F5F5F4` |
| card / muted | `#FFFFFF` / `#F5F5F4` | `#1C1917` / `#292524` |
| border | `#E7E5E4` | `#3A3532` |
| primary (hover) | `#0F766E` (`#115E59`) | `#2DD4BF` (`#5EEAD4`) |
| accent / primary-subtle | `#CCFBF1` / `#F0FDFA` | `#134E4A` / `#042F2E` |
| destructive | `#B91C1C` | `#F87171` |

- **Semantic colors** for success / warning / danger / info alerts and toasts,
  and one color pair per loan status: Pending amber, Approved blue, On loan
  violet, Overdue red, Returned green, Declined slate, Cancelled stone with a
  border, Return reported neutral.
- **People badges:** Trusted Lender is teal with `BadgeCheck`; Admin is inverted
  ink with `ShieldHalf`.
- **Categories** have an icon and a tile color each (Power tools `Drill` orange,
  Hand tools `Hammer` yellow, Garden `Sprout` green, Kitchen `CookingPot` rose,
  Camping `Tent` sky, Cleaning `SprayCan` violet, Ladders & moving `Truck`
  indigo, Other `Shapes` stone). They replace photos. Category color appears only
  on tiles and chip icons; chip text stays foreground.
- **Type:** Bricolage Grotesque 600/700 for headings and the wordmark, Inter
  400/500/600 for UI (14px UI, 16px body), JetBrains Mono for IDs, keys and admin
  timestamps, and `tabular-nums` for dates and counts. The hero is 48px with
  −0.02em tracking.
- **Shape and depth:** `--radius: 0.75rem`. Cards and dialogs are 12px, buttons
  and inputs 8px (Clerk's appearance uses the same 0.5rem), category tiles 10px,
  badges and chips fully round. Shadows are warm and sparing in light mode; dark
  mode uses borders and raised surfaces instead.
- **Motion:** 150ms ease-out hovers, 200ms dialogs and toasts, cards lift 1px.
  With `prefers-reduced-motion`, only fades remain.
- **Icons:** Lucide at stroke 1.75 (a global `svg.lucide` rule): 16 inline, 20
  in buttons and nav, 24 in tiles.
- **Logo:** a 32px rounded teal square with a two-arrow loop, one arrowhead
  shaped like a house roof, and the lowercase wordmark "lend**loop**". A dashed
  loop ring frames empty-state icons.
- **Layout:** 4px spacing base, `max-w-6xl` container, 2 columns from 640px,
  desktop nav from 768px, 3 columns + side panel from 1024px, 4 columns in
  Browse from 1280px. Light, dark and system themes.

## Prototype annotations

The prototype pins sticky-note callouts ("Prototype annotation") next to the
decisions they explain. All of them, by screen:

**Landing**
- Public query returns a projected DTO: `{_id, name, category}`. Nothing else
  leaves the server.

**Browse**
- URL: `/tools?…`. Filters live in the query string, so links, refresh and Back
  keep them.
- Availability is computed per viewer on the server. Non-owners see an overdue
  tool as plain "On loan"; the borrower and due date never leave the server.

**Tool detail**
- The calendar query returns booked date ranges only. No borrower IDs or names
  are sent, and pending requests never block days.
- Owner email is returned only to a borrower with an approved or active loan.
  Everyone else gets name, lending since and loan count.
- Overlap and the 14-day limit are re-checked inside the Convex mutation. Client
  checks only give fast feedback.
- Overdue is derived from dates, never stored. "I've returned it" only notifies
  the owner; the loan stays open until they mark it returned.
- Only the owner can mark a loan returned. The mutation checks
  `tool.ownerId === ctx.userId`; admin role doesn't bypass it.
- Admins can't edit or approve on others' listings, so those controls aren't
  rendered. Remove is a soft delete with a required reason.

**List / edit form**
- Field rules mirror the Convex mutation validator (name 3–60, description
  10–280). The server re-validates; its errors map back onto these fields.

**My listings**
- Delete is refused by the Convex mutation while a loan is active or approved.
  The disabled button and its tooltip mirror that rule.
- Removed listings are shown only to their owner (and admins). The reason is
  shown; the admin's name isn't, so moderation stays impersonal.

**My requests**
- Overdue is derived from dates, never stored. Contact is returned by a
  party-scoped query only once a loan is approved.
- Borrowers see "Delayed — retrying automatically", never attempt counts or
  error codes. Those stay in the admin Automation view.

**Incoming requests**
- Approve is one Convex mutation: the loan is approved and every overlapping
  pending request is declined with "Dates taken" in the same transaction.
- Each action checks the loan's current status server-side. If it changed, the
  mutation rejects and the list refetches instead of overwriting.

**Loan detail**
- Non-party opening this URL gets 404, not 403.
- Duplicate write-backs are ignored by idempotency key; users never see them.
- (Admin view) Admins only view other people's loans; approve and return stay
  with the owner.

**Admin**
- Users: roles are seeded server-side; no "make admin" UI on purpose (privilege
  escalation).
- Automation: the failure banner counts automation failures in the last 24h with
  no successful retry. A failure that later succeeded (L-1042, attempt 2) doesn't
  count.
- Automation, "Retry now": *Build if time allows.* Fallback: the n8n link, with
  n8n's error workflow handling retries. (It was built.)

**System states**
- 404: Not a party → 404, not 403, so loan IDs don't leak. Removed listings also
  404 for anyone but the owner and admins.
- 403 (edit someone else's listing): Convex re-checks `ownerId` on every
  mutation, so a hand-typed edit URL can't save anything. Admins get this page
  too: they can remove listings, not edit them.
- 403 (admin area): 403 is only used for role-gated areas (`/admin/*`) and
  owner-only pages. Role is checked in every Convex function, not just in the nav.
- Error-code mapping (`ConvexError` code → UI): `FORBIDDEN` → 403 toast for
  actions, 403 page for routes · `NOT_FOUND` → 404 page · `CONFLICT` → "Those
  dates were just booked." · `VALIDATION` → field errors · `UNAUTHENTICATED` →
  sign-in redirect.
- Sign-in: placeholder for Clerk's modal. The app only receives a session; role
  comes from the Convex users table, never from client claims.

## Deliberate scope cuts

Left out on purpose (design brief, A10):

- **Chat**: replaced by "contact unlocked after approval".
- **Maps / location**: location data is sensitive.
- **Payments / deposits.**
- **Ratings / reviews**: the Trusted Lender badge is the trust mechanism.
- **Photo upload**: moderation risk and GPS leaks through EXIF; category tiles
  instead.
- **Free-text message with a request**: it would end up in the n8n payload.
  Declines use preset reasons for the same reason.
- **Notification center and notification settings**: noted for production.
- **Public profiles.**
- **Role management / "make admin" UI.**
- **Analytics charts.**
- **Loan extensions, waitlists, recurring loans.**
- **Marketing sections** (testimonials, pricing, FAQ).
- **"Not received" flow and pausing reminders after a reported return**: more
  states the n8n overdue endpoint would have to respect.
- **An inbound-security card with rejection counts**: counting would mean a
  database write per unsigned request, which is itself an abuse vector.
  Rejections are logged instead.
- **Admins editing others' listings or overriding approve / return** on others'
  loans: admins remove and view. On their own tools they act like any user.
- **The role switcher**: prototype-only. The build uses seeded demo accounts
  (see the README).

Marked optional in the brief and **built**: "Retry now" on the Automation page,
"I've returned it" for borrowers, dark mode, the expandable reminder-run rows,
the first-run banner and the offline pill.

## Where the build differs from the prototype

"By design" means the prototype won over the written brief or ticket text.

**Shell and shared components**
- Date picker: two months on desktop, one on mobile; the narrow tool-detail
  panel always shows one month with prev/next. *By design.*
- The avatar menu labels non-admins "Member"; admin tables say "User". *By design.*
- "Owner notified ✓" renders a green check icon instead of the ✓ character.
- Decline-reason chips are toggle buttons, so a chosen reason can be cleared.
- Extra confirm dialogs (cancel request / booking, delete listing, "I've returned
  it") use the prototype's copy. *By design.*
- Clerk 7.9 removed `SignedIn` / `SignedOut`. The landing CTA checks `useAuth()`
  and shows "Go to the board" once signed in.

**Tools**
- The request panel has more states than the brief lists: "You're booked", "You
  have it until", "Due back" (with "I've returned it" and "View loan"), the
  unlocked owner email, and, for owners, the current loan with Mark returned.
  *By design.*
- A tool still out past its due date shows non-owners the prototype's "This
  tool hasn't come back from its last loan yet" message instead of the request
  form. *By design.*
- **Removed listings 404 on their detail page for everyone**, the owner and admins
  included (the prototype lets those two open it). Owners see them in My listings,
  admins in Admin → Listings, without a link.
- When the server says the dates were just booked, the panel clears the picked
  dates and shows "Those dates were just booked. Pick new dates." inline and as
  a toast, instead of the server's "Booked Nov 8–9…" text.
- The remove dialog loads `admin.listings` while it's open to get the impact
  numbers; there is no per-listing impact query.

**My loans**
- A request that arrives live doesn't switch the owner's tab (the prototype
  jumps to "Needs response"); it slides in with a highlight and a screen-reader
  announcement. Approving does follow the row to "Active & upcoming".
- The "I've returned it" dialog uses the full tool name ("Bosch cordless drill
  18V", not "the drill"); there is no short-name field.
- Loan detail offers Approve, Decline and Cancel as well, driven by what the
  server allows.
- "Mark returned →" deep-links to `/me/incoming?tab=active` or `?tab=overdue`.

**Admin**
- Removed listings have no link and no ⋯ menu.
- "Remove listing" is offered on every live listing in Admin → Listings,
  including the admin's own (the backend allows it). The tool card hides it on
  your own tool.
- The loans table shows plain "Returned" (as the prototype does).
- The Configuration card shows the real state of each variable; the prototype's
  "example: a missing variable" demo block is dropped.
- Duplicate write-backs are stored as attempts of a delivery and shown as their
  own slate rows after it. Rows sort failed, then retrying, then newest.
- "Retry now" only queues the retry, so the toast ("Delivered on retry." /
  "Retry failed.") follows the live result.
- Event wording the prototype didn't name was added in the same voice: "Request
  approved", "Loan cancelled", "Marked returned", "Decline notice sent".
- The "Failed (24h)" card uses the same number as the banner and nav badge.
- The Trusted Lender switch opens its confirm popover from an anchor, because a
  popover trigger would add ARIA attributes `role="switch"` doesn't allow.
- The banner's Review button opens Automation unfiltered; "Review failures" on
  the page applies the Failed filter.

**Automation (n8n)**
- n8n execution IDs are n8n's numeric IDs ("26"), not the prototype's
  `exec_48213` (the seed keeps the prototype's style).
- Email retries are an explicit Send → Wait 5s → Send chain, not n8n's "Retry
  On Fail", which never fires on a node that routes errors to its error output
  (details in `docs/integration.md`).
- A failed reminder write-back doesn't stop the run: it counts as failed so the
  run summary is still posted.
