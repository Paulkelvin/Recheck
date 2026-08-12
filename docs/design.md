# Land Scam Check — Technical Design Spec

Working name: **Land Scam Check**
Purpose: Help land buyers in Nigeria verify surveyors, survey plans, and land status before paying — reduce fake plans, double-selling, government-acquisition surprises, and land disputes.

---

## 1. Problem Scope

**Top-tier pain points (money/land lost, primary focus):**
1. Fake or forged survey plans
2. Overlapping plans / double-selling (same land sold to multiple buyers)
3. Government acquisition / land under commitment
4. Family or communal land disputes over unclear boundaries

**Core supporting problems:**
5. No easy way to verify a surveyor's registration/license status
6. No discoverable public directory of licensed surveyors

**Secondary value-adds (included in the paid report):**
7. Land size/measurement mismatch (paper vs. actual)
8. Encumbrances — hidden mortgage, lien, or court case on the land

Dropped for MVP: zoning/land-use checks, flood zone checks, document checklist generator, price benchmarking.

---

## 2. Product Framing

Avoid technical/legal language ("due diligence"). Use fear/pain language that mirrors how users actually think:

| Technical term | User-facing language |
|---|---|
| Land Due Diligence Report | Land Scam Check |
| Plan authenticity check | "Is this survey plan real?" |
| Overlap/double-selling check | "Has this land been sold to someone else?" |
| Government acquisition check | "Can the government take this land back?" |
| Family/dispute check | "Is anyone else claiming this land?" |
| Size verification | "Am I getting the size I'm paying for?" |
| Encumbrance check | "Does this land have hidden debt or court cases?" |
| Verify Surveyor Registration | "Is your surveyor real?" |

Homepage should lead with the fear, not the service description, e.g.:
> "Before you pay for that land — make sure it's not fake, not already sold to someone else, and not something the government can take back."

---

## 3. Tech Stack

- **Frontend:** Next.js + Tailwind
- **Backend:** Next.js API routes (Playwright job runner can be a separate Node service if needed)
- **Database:** Neon (serverless Postgres — auto-wakes on request, no manual restart needed)
- **File uploads:** Cloudinary (survey plan docs/images)
- **Auth:** Clerk (fast setup) or Auth.js/NextAuth (self-hosted, no user cap, fully free)
- **Automation:** Playwright (Node), run as a queued backend job — not client-triggered
- **Payments:** Paystack or Flutterwave
- **Hosting:** Vercel (frontend/API); Playwright job runner may need a small VPS or Railway service since serverless functions don't handle long-running headless browser processes well

**Cost note:** All free tiers to start. First likely cost is hosting for the Playwright job runner once running automated checks at volume; Cloudinary may need a paid tier if document upload volume grows.

**Access control note:** Since there's no Supabase Row Level Security, enforce access control in the API layer — check `user.role` / `user.id` in every route.

---

## 4. Data Models

**users**
- id, name, email, phone, role (buyer / surveyor / admin)

**surveyor_checks** (Tier 1)
- id, surveyor_name, reg_number, status (registered / not_found / suspended), checked_at, method (automated / manual), raw_result (text)

**land_reports** (Tier 2 — core product)
- id, user_id, status (submitted, under_review, surveyor_assigned, ready)
- location (state, lga, address)
- plan_number, seller_name
- uploaded_docs (array of Cloudinary URLs)
- payment_status, amount_paid
- assigned_surveyor_id (nullable)
- created_at, updated_at

**report_findings** (one row per check type, belongs to a land_report)
- id, land_report_id, check_type (plan_authenticity, overlap, acquisition, dispute, size, encumbrance), result (pass / fail / flagged / inconclusive), notes, evidence_url

**surveyors_directory**
- id, name, reg_number, firm_name, state, city, phone, email, surcon_verified (bool), verified_at, listing_status (active / pending)

**surveyor_scan_log** (Playwright automation audit trail)
- id, surveyor_check_id, run_at, success (bool), error_message, screenshot_url (optional, for manual review on failure)

---

## 5. Surveyor Verification (Tier 1)

**Important constraint:** SURCON's verification portal (accountsurcon.ng) disallows automated access per its robots.txt. Build this as an internal ops tool with automation as an optional speed-up, manual fallback always available — not something end users trigger directly against the live site on demand.

**Flow:**
1. Job queued with `{name or reg_number}`
2. Playwright launches headless browser → navigates to the verification page
3. Fills search field, submits, waits for result
4. Scrapes: name, reg number, status, firm
5. Writes to `surveyor_checks` + `surveyor_scan_log`
6. On scrape failure (selector not found, blocked, CAPTCHA) → flag `method: manual`, alert admin to check by hand

**Design notes:**
- Rate-limit the queue (e.g. max 1 check per few seconds) — don't run on-demand per user click
- Ship the manual-entry version first; layer in Playwright automation later once the rest of the product is live

**API:**
```
POST /api/surveyor-check
  → creates job in queue
  → returns { checkId, status: "pending" }

GET /api/surveyor-check/:id
  → returns { status, result }
```

---

## 6. Land Scam Check Report (Tier 2 — main product)

**User-facing pages:**
- `/check` — intake form: location (state/LGA), survey plan number, seller's name, document upload (Cloudinary)
- `/check/payment` — Paystack/Flutterwave checkout
- `/check/:id/status` — tracker: Submitted → Assigned → In Progress → Ready
- `/check/:id/report` — final report (visible only after payment + completion), showing each finding in plain user-facing language

**Admin dashboard:**
- `/admin/reports` — queue of submitted reports, assign to partner surveyor
- `/admin/reports/:id` — form for surveyor/admin to fill in each `report_findings` row (pass / fail / flagged per check type)
- On save, when all findings are filled → status auto-updates to "ready" → triggers email/SMS to user

---

## 7. Surveyor Directory

- `/directory` — searchable list, filterable by state
- `/directory/:id` — surveyor profile page, shows "SURCON Verified ✓" badge if `surcon_verified = true`
- `/for-surveyors` — signup form → creates a pending listing → admin manually verifies via Tier 1 check before activating

---

## 8. Suggested Build Order

1. Database schema + auth (users, roles)
2. Tier 1: manual surveyor check form + admin manual-entry fallback (ship without Playwright first)
3. Tier 2: intake form → payment → admin findings entry → report view
4. Directory: listing + signup
5. Playwright automation layered in last, as an optional speed-up for Tier 1, with manual fallback always available

---

## 9. Legal/Compliance Notes (not legal advice — confirm with a Nigerian lawyer before launch)

- Don't scrape SURCON in bulk or bypass their robots.txt at scale; keep automated lookups low-volume, rate-limited, and framed as an internal ops aid with manual fallback
- Don't imply official SURCON affiliation/endorsement in branding or copy
- Position the platform as a facilitator/directory — professional judgment on plan authenticity should route through actual licensed partner surveyors, not be presented as the platform's own determination
- Handling personal data (names, land documents, ID numbers) brings this under Nigeria's NDPR — basic consent and privacy practices should be in place before collecting user documents
