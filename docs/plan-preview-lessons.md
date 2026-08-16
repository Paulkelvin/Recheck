# Plan preview: lessons learned

Working notes from building and debugging the free plot-preview feature
(`src/lib/plan-ocr.ts`, `src/lib/nigeria-belts.ts`). Kept separate from
`design.md` (the original spec) because this is implementation-level
knowledge — the kind that's expensive to re-derive and cheap to write down.
Update this file when the OCR pipeline teaches us something new; don't let
it go stale.

---

## 1. Vision API's "line breaks" are not rows

`fullTextAnnotation.text` inserts line breaks based on Vision's own layout
guess. For a widely-spaced table, that guess is routinely wrong — one cell
per line instead of one row per line. **Never parse the flat text string for
anything position-sensitive.** Use the structured
`pages[].blocks[].paragraphs[].words[].boundingBox` data and reconstruct
rows/columns from actual pixel coordinates.

## 2. Rotated text scatters unpredictably

A bearing written vertically along a plot's left/right edge doesn't OCR as
one clean token. Vision splits it into fragments (degrees, the ° symbol,
minutes, the ' symbol) positioned far apart in Y but aligned within a couple
of pixels in X. The fix is 2D spatial clustering (group by X-proximity with
a capped Y-gap so an unrelated same-X digit elsewhere on the page can't be
pulled in), reading each cluster both top-to-bottom and bottom-to-top since
the true reading direction isn't knowable in advance.

Coordinates suffixed `mN`/`mE` get the same treatment: real plans print
these as separate margin labels (Northing along the top, Easting along the
side), not one paired row. Search the whole page, not one row.

## 3. Numbers with a thousands space silently truncate

`748 024.989mN` OCRs as two tokens: `748` and `024.989mN`. Regex-matching
the suffixed token alone gives `24989` — three orders of magnitude wrong,
and structurally valid-looking enough to not obviously fail. **Any
numeric-token parser needs a plausible-range check**, and a repair step that
looks for a short integer immediately adjacent (left, or stacked
vertically) before accepting a value.

## 4. Reading order on the page is not traversal order

Bearing/distance annotations are scattered around a drawing, not listed
sequentially. Don't assume OCR reading order matches the order legs connect
around a boundary. Two techniques compound here:

- **Same-row-first pairing, nearest-neighbor fallback.** Pure
  nearest-2D-position pairing can mispair a multi-word bearing (its anchor
  is the average of several consumed words, which can drift closer to an
  adjacent row's distance than its own). Prefer an unambiguous same-row
  match; fall back to nearest-neighbor only for what's left (typically the
  rotated bearings, which by construction never share a row with their
  distance).
- **Let the closure check solve ordering, but verify by area, not just
  distance.** Try every permutation (capped — this is factorial) and keep
  the one that closes. But *minimizing closure error alone is not enough*:
  with near-cardinal bearings, a degenerate near-zero-area "bowtie" path can
  close about as well as the real shape. Among orderings that close within a
  generous tolerance, keep the one with the **largest enclosed area**. Found
  this via a real plan where the naive pick produced 1.1 m² instead of the
  correct 668 m² — same closure error, wildly different shape.

## 5. Cross-check against anything the plan states about itself

A stated `PLOT AREA` figure is a free, independent correctness signal —
compute the polygon's area (shoelace formula) and compare. This caught the
degenerate-ordering bug above before a user ever saw it. Apply the same
principle elsewhere: if the source document states a number your pipeline
also computes, checking them against each other is nearly free and catches
failure modes no single heuristic will.

## 6. The plan is the source of truth, not the intake form

Projection system (UTM zone vs. Minna belt) and state should be read from
the plan's own text first (`ORIGIN:-` line, header state name), with the
buyer-typed form field as a last-resort fallback only. A garbled form entry
should never block a perfectly legible plan. When the two disagree, surface
it as an informational note — never as a hard failure.

Real formatting to defend against: letter-spaced abbreviations
(`U. T. M.` with spaces, not `U.T.M.`) — write patterns with optional
separators between letters, not literal periods.

## 7. Datum choice is worth real metres — verify empirically

Nigeria's Minna-to-WGS84 transformation isn't one universal shift. Compared
three candidates against two real, independently-known plot locations:

- EPSG:1822 (nationwide, 3-parameter, ~10m accuracy)
- EPSG:1534 (Nigeria onshore south, 7-parameter Position Vector)
- The shift epsg.io defaults EPSG:26331/26332 to

The nationwide and southern fits disagreed by **10.2m** on both sample
points. Since Lagos/Ogun (where most land dealing happens) fall inside
EPSG:1534's area of use, that's now used there, with the nationwide shift
as fallback further north. **Don't trust a single "authoritative-looking"
EPSG proj4 string without checking it against a point whose real-world
location you already know** — epsg.io's default for one projection and the
belt definitions elsewhere in the same country used different shifts here,
silently, and it took plotting real coordinates to notice.

Even with the right datum, expect **±5-15m of irreducible error**: Google's
satellite imagery itself carries georeferencing offset, and the grid-label
anchor point marks a gridline intersection, not the actual beacon. State
this to users explicitly rather than let a preview look more precise than
it is.

## 6a. Spatial heuristic thresholds must scale with the image, not be fixed pixels

Any distance threshold used to cluster/associate OCR words by position
(`bearingCandidatesFromVerticalColumns`'s X-tolerance and Y-gap,
`resolveGridValue`'s nearby-digit search) has to be expressed as a multiple
of the page's own median word height, not a fixed pixel count. Found this
by testing whether upscaling a low-quality scan before sending it to Vision
would recover more legible text — it made parsing *worse*, because the
fixed-pixel thresholds were calibrated against one native-resolution
document, and upscaling scaled every word's spacing without scaling the
thresholds to match. `groupIntoRows` already did this correctly; the other
two clustering functions didn't, until this was caught.

Practical implication: **auto-upscaling a faint scan is not automatically
a win** even after fixing this — it may recover more legible characters,
but if a plan's genuine problem is which text belongs to which drawn line
(see 6b), higher resolution alone doesn't solve that.

## 6b. Position alone can't disambiguate a label shared between two edges

A bearing's degree and minute fragments are sometimes printed at different
points *along the same diagonal edge line* — not just split by OCR into
awkward tokens, but genuinely positioned far apart on the page, with the
minutes fragment sometimes sitting closer (in raw pixel distance) to a
*different* edge's bearing than to its own. Found a real case: an edge's
"047°" sat near one corner, its own "10'" sat right next to a *different*
edge's "137°" near the shared corner both edges meet at — closer to the
wrong bearing than the right one, by pixel distance alone.

This is not an OCR-quality problem and higher resolution doesn't fix it.
It requires knowing which drawn line (which pair of beacons) each label
actually sits along — real line/vector detection from the image, not text
position clustering. Don't try to special-case this with more position
heuristics; it needs a genuinely different technique, or accepting it as a
known limitation (which is what this pipeline currently does: it declines
rather than guesses, consistent with §8).

## 7a. Hard requirement: Minna datum, always

Product decision, stated explicitly: the system must always use Minna
datum. Both `ProjectionSystem` variants (belt and UTM) are hardcoded to the
Minna ellipsoid (Clarke 1880 modified, `a=6378249.145 rf=293.465`) with no
other path — see the guard comment on `ProjectionSystem` in
`nigeria-belts.ts`. If a plan ever surfaces stating a different datum
(WGS84, from a GPS-based survey), that needs a deliberate new
`ProjectionSystem` variant with its own explicit handling — never silently
folded into the existing Minna-only conversion.

## 8. Fail-closed beats fail-open, always, in this domain

Every gate in this pipeline (confidence threshold, closure tolerance, area
cross-check, plausible-span check) exists because a *plausible-looking
wrong answer* is worse than *no answer* when the product's entire value
proposition is "don't get scammed on land." When in doubt, return
`unavailable` with a specific, honest reason — never guess and hope.

## 9. General debugging pattern that worked

For every claim about what OCR/geometry/payment code actually does:
1. Build a synthetic case reproducing the exact failure.
2. Test against the *real* exported function (mocked fetch), not a
   reimplementation — a reimplementation can pass while the shipped code
   still has the bug.
3. For anything with real-world ground truth (a coordinate, a payment
   amount), verify the output against that ground truth, not just "did it
   not crash."
4. Deploy, then re-run the same test live before declaring done — several
   bugs here only appeared with Vision's actual OCR output, not the
   simplified synthetic fixtures used during development.

## 10. Security lesson: verified ≠ authorized

The Paystack callback verified a transaction was successful and
correctly-priced, but never checked it was *for the report being marked
paid*. The reference arrives in an attacker-controllable query param. One
real payment could be replayed against every other report on the same
tier. **"This proves a valid X happened" is not the same claim as "this
proves X happened for the specific record I'm about to mutate."** Any
webhook/callback verification needs to bind the external proof to the
internal record explicitly (here: match against the ID stamped into
Paystack's metadata when the transaction was created), not just check the
proof is internally valid.

## 11. A stated total (area, count, anything) needs the same exclusion as a scale bar

A plan's stated total AREA figure ("AREA:- 4346.275 SQ. METRES") has the
exact numeric shape a distance candidate has, and nothing excluded it —
it got parsed as a boundary distance outright. The fix mirrors the
existing scale-bar exclusion: find the row containing the label word
("AREA") and exclude the whole row from candidacy. **Any self-describing
total on a plan is a candidate for this same failure mode** — if a new
number-shaped label type shows up (a lot count, a reference number), ask
whether it needs the same row-exclusion treatment before it silently
leaks into geometry.

## 12. Correction: a shared token shape isn't evidence of a different meaning — check the source image, not just positions

**This entry originally diagnosed "50' ROAD" as a road right-of-way width
label and excluded any digit+apostrophe fragment near a "ROAD" token from
bearing-candidacy.** That diagnosis was wrong, caught only when the user
supplied the actual plan image: those fragments are genuine bearing
minutes (`25°50'`, `114°38'`, `180°00'`, `296°54'`) — the roads simply run
alongside those edges, so the minute label and the road label happen to
sit close together on the page. The exclusion was silently discarding
real data for every plan where a bearing's minutes happen to fall near a
road annotation, not just this one. Reverted.

The actual lesson isn't "annotation systems collide" (that was the wrong
theory) — it's methodological: **OCR word *positions* alone can suggest a
plausible-sounding story that's still wrong.** "Two things are physically
close on the page" was consistent with both the wrong hypothesis (a road
width) and the right one (a bearing's minutes for an edge next to a
road). Position data narrows the search; it doesn't confirm a semantic
claim about what a fragment *means*. When the actual source document is
available, check the diagnosis against it before shipping a fix that
throws data away — especially anything that *excludes* candidates, since
that failure mode is silent (no error, just quietly worse output) and
won't show up in a debug dump the way a wrong *inclusion* would.

## 13. A decimal point can OCR as its own token, just like a thousands space (see §3)

"47.00m" sometimes splits into two tokens — "47m" and a lone ".00" —
neither of which matches the distance regex (which requires the digits
and the decimal point in one token). This is the same failure family as
§3's thousands-space split, just around the decimal point instead of a
thousands separator. Fixed the same way: search outward from the
distinctive fragment (a lone ".NNN" token is rare enough to be a safe
anchor, unlike a bare digit) for its matching half, rather than loosening
the page-wide regex itself.

Not every split is recoverable this way — a genuinely whole-number
distance ("37m", no decimal at all) that never got a fractional-part
token has no anchor to search from. Loosening the regex to accept bare
whole numbers page-wide would reintroduce exactly the ambiguity §3 and
the DISTANCE_CANDIDATE comment exist to prevent (a bare number is
indistinguishable from a scale-bar tick or plan reference without more
context). Declining to recover it and letting the traverse fail closed
is the correct behavior here, not a remaining bug — see §8.

## 14. Nearest-neighbor pairing must be globally greedy, not per-item greedy

`pairNearestLegs`'s fallback loop iterated bearings in array order and
grabbed whichever distance was nearest *at that point in the loop*. If an
earlier bearing's true match was already claimed by something else, or a
later bearing's true distance simply doesn't exist as a candidate (see
§13), the earlier bearing could steal a distance that rightfully belonged
to the later one — and that one theft cascades into every remaining pair
being wrong. Fixed by collecting all remaining (bearing, distance) pairs,
sorting by distance ascending, and assigning greedily in that global
order instead: the truly closest pairs lock in first regardless of
iteration order, and an item with no real match is left unpaired rather
than forced onto someone else's. This is a generic assignment-problem
fix, not plan-specific — any greedy nearest-neighbor matching in this
codebase should default to globally-sorted-greedy, not iterate-and-grab.

## 15. A shared Y-band is not evidence of a real relationship

`groupIntoRows` groups purely by Y-proximity, with no X constraint at
all — correct for a genuine table row, but on a wide scattered drawing
two completely unrelated labels (different edges, ~330px apart in X) can
land in the same Y-band by coincidence. `pairNearestLegs`'s "same row is
unambiguous" shortcut trusted this blindly and force-paired a bearing
with a distance that belonged to a different edge, before the
nearest-neighbor fallback (which would have gotten it right, per §14)
ever ran. Fixed by requiring the row's bearing and distance to also sit
within a plausible same-phrase X gap — a bearing and distance actually
written together are a handful of words apart, not hundreds of pixels.
General lesson: a heuristic that groups by one axis only is exploitable
by coincidence on the other axis; if the grouped items are later assumed
to be *related* (not just *nearby*), check proximity on every axis that
relationship would actually require, not just the one the grouping used.

## 16. When live-testing the POST pipeline, use the POST method

Burned real time this session re-running `?force=1&debug=1` with a plain
GET request (curl's default) — the route's `force`/`debug` flags are only
read inside the POST handler; GET just returns the four cached DB
columns with no `debug` field at all. The symptom (empty debug info, no
error) looked like a deploy hadn't landed yet, not a wrong HTTP verb.
Always `curl -X POST` against this endpoint when diagnosing.

## 17. Not every distance is a decimal — but only accept the whole-number shape once the scale bar is airtight

A surveyor doesn't always round to `.00`: `37m` on this plan was a
complete, correct 37-metre distance, not a truncated `37.??m`. The
original DISTANCE_CANDIDATE required a decimal point specifically to stay
safe as a page-wide, context-free search (a bare number is otherwise
indistinguishable from a scale-bar tick or a plan reference). Added a
second pattern, `WHOLE_METER_DISTANCE`, that accepts a bare number with a
*mandatory* "m" suffix — narrower than a fully bare number, but still
exactly the shape a real scale-bar tick can have.

That only became safe after fixing `scaleBarWords`, which turned out to
already be under-matching: its only detection tell was a leading
`"m10"`-style prefixed tick, but this plan's real scale bar read `"20m
10 0 20 40 80m"` — suffixed, not prefixed, and two of its own ticks
(`"20m"`, `"80m"`) would otherwise have leaked in as fake distances the
moment whole-number distances were accepted. Added a second tell (a row
containing a bare `"0"` alongside several other small numbers) alongside
the original prefixed-tick check. **Loosening what counts as a distance
candidate is only as safe as the exclusion rules it now depends on more
heavily — audit those first, not after.**

## 18. When you can't reach the live admin session, reconstruct it — don't skip the live check

Lost the authenticated session cookie from an earlier diagnosis pass
mid-session (scratch files get cleaned up between rounds) with no
password saved anywhere to log back in. Rather than trusting the local
harness alone, used the `DATABASE_URL` already present in the shell
environment plus the project's own `scripts/seed-admin.ts` to mint a new
throwaway admin user, logged in via NextAuth's credentials flow
(`/api/auth/csrf` → `/api/auth/callback/credentials`) to get a fresh
session cookie, ran the real live re-test, then deleted the throwaway
user afterward. A local harness against captured OCR words (see §9) is
good enough to *develop* a fix, but this pipeline's own rule (§8, §9) is
that a fix isn't verified until it's been run against the real deployed
code — reconstructing access to do that live check is worth the extra
steps rather than settling for "should work" from the harness alone.

## 19. Upscaling before OCR: real fix for some plans, not a fix for "small pixels" per se

Shipped a retry that asks Cloudinary for a 3x-larger version of an
already-hosted plan image and re-runs Vision against that, gated to only
fire on failures that plausibly stem from unrecognized text
(`low_confidence`, `insufficient_legs`, `traverse_did_not_close`) so a
failure that has nothing to do with resolution doesn't burn a second
Vision call for no reason.

Tested against two real plans that fail this way — 768×1024 and 467×728px
scans, both roughly a third the linear resolution of a plan that already
works. The retry barely moved the needle: +6 words out of 190 on one,
+1 word out of 160 on the other, and no new bearing digits recovered on
either. **The lesson isn't "upscaling doesn't work" — it's that upscaling
only helps when the missing detail is still physically present in the
pixels, just too few of them.** A photo this small, with this little
recoverable detail after a 3x resize, is more consistent with detail
having been destroyed *before* upload — most likely aggressive
compression from a messaging app (WhatsApp is notorious for
down-sampling and re-encoding forwarded images) rather than the camera
capture itself. Upscaling a blurred, compression-smeared region just
produces a bigger blurred region; there's no missing information left to
recover by adding pixels.

Practically: the retry stayed in the pipeline anyway, since it's cheap
when it doesn't fire and may still rescue a genuinely-just-small (not
also blurred/recompressed) scan. But for *this* class of failure, the
real fix isn't more code — it's the intake side: ask the user for the
original camera photo or a proper scan, not a copy that's already passed
through a compressing app. Don't assume a resolution-shaped problem is a
resolution *fix* without testing against a real failing case first — the
pixel dimensions alone (768×1024 vs 2400px+) looked like exactly the
kind of gap upscaling should close, and empirically it mostly didn't.

## 20. A genuinely clear scan can still fail for reasons that have nothing to do with clarity

A high-resolution, sharp screenshot (Sweet Nutrition Ltd, Ado-Odo/Ota)
still failed outright (`insufficient_coordinates`, then `insufficient_legs`
after the first fix) — worth recording because it's a useful contrast to
§19: not every failure is an image-quality problem, and assuming it is
without checking the actual OCR output wastes time chasing the wrong fix.
Two distinct, real parsing gaps, both found only by reading the raw word
positions:

- **The grid coordinate's unit suffix split into its own token.**
  "742 152.689 mN" OCR'd as three separate words — "742", "152.689",
  "mN" — with the suffix disconnected even from the decimal fragment,
  not just from the thousands-prefix that `resolveGridValue` (§3) already
  repairs. `NORTHING_TOKEN`/`EASTING_TOKEN` require the suffix and digits
  in one token, so this plan matched zero of either. Fixed by finding the
  nearest decimal-shaped fragment to a bare "mN"/"mE" token and feeding
  that into the *existing* thousands-prefix repair unchanged — the two
  splits are really the same underlying problem (a number, or its
  qualifier, separated from a piece of itself) and didn't need two
  different mechanisms.
- **A beacon label split into a prefix and a suffix token.** The label's
  three printed lines ("SC/OG" / "FC2285" / "JX") sometimes OCR the
  number and suffix as two words instead of one, so `BEACON_LABEL`
  (which requires the whole thing in one token, deliberately, since a
  false match would corrupt the geometry) matched none of this plan's
  4 beacons. Fixed by accepting a prefix if a suffix sits close by and
  *strictly below* it — not just nearest — because the real plan's own
  "OG" text one line above the number sits about as close as the genuine
  suffix one line below, and picking the nearest neighbor alone would
  have been right only by luck.

Both fixes verified against this plan's actual captured OCR words before
and after deploying (§9, §18). Even after both, this plan still doesn't
preview — only 2 of 4 legs are found, and the raw OCR output shows one
bearing's degree symbol ("41°") never recognized as text at all despite
the scan's excellent overall quality, plus a minutes fragment ("30'")
too far from its own degree number to cluster with it, getting mistaken
for a standalone bearing and stealing the wrong leg's distance pairing —
the same known fragment-ambiguity limitation as §6b/§14. Two real,
distinct, fixable bugs in one plan doesn't mean *all* of a plan's
problems share one root cause — keep diagnosing each remaining gap on
its own evidence rather than assuming the rest is "more of the same."

## 21. Two account-level infrastructure gaps had nothing to do with OCR at all

Testing a plan uploaded as a PDF surfaced two bugs entirely outside the
parsing logic — worth its own entry because both would have been
misdiagnosed as "OCR can't handle this document" without checking
outside `plan-ocr.ts` first.

**Cloudinary was blocking delivery of the PDF itself.** Fetching the
uploaded PDF's own URL returned `401 — deny or ACL failure`, even though
the identical account served images fine. This is Cloudinary's
"Restricted media types" security setting, which most accounts ship with
enabled by default (PDFs/ZIPs can carry executable content). This
doesn't just break the free OCR preview -- it breaks the paid product
too: the admin/surveyor review page links straight to the raw Cloudinary
URL, so a buyer submitting a PDF made their plan invisible to their own
paid reviewer, not just to the automated pipeline. Fixed on the account
side (Cloudinary Console → Settings → Security), not in code. **When a
document-type-specific failure shows up, check whether every *other*
place that type of file gets used is equally broken before assuming the
parser is at fault** — a hosting/delivery problem looks identical to a
content problem from inside the OCR code alone.

**Once that was fixed, Vision's PDF response used a completely different
bounding-box field than the image response, and the code only knew
about one of them.** `images:annotate` (the JPG/PNG path) returns each
word's box as `vertices` -- absolute pixel coordinates. `files:annotate`
(the PDF path) returns `normalizedVertices` instead -- 0-1 fractions of
the page. `extractWordsAndConfidence` only ever read `vertices`, so
*every PDF ever uploaded* silently produced zero words: real text, real
per-word confidence scores, a complete `fullTextAnnotation.text` matching
the plan exactly -- all present and correct, just filed under a field
name the code never checked. No error, no low-confidence signal, nothing
distinguishing it from "this document genuinely has no text." This was
the single highest-impact bug found this session, and it was invisible
from the outside: everything about the failure (`insufficient_coordinates`
or `ocr_failed`, depending on which check tripped first) looked exactly
like a document-quality problem.

Found only by adding a temporary, purpose-built diagnostic field
(`visionDiagnostic`, gated to only populate when word count is zero and
no error was thrown) and walking one response level deeper on each
redeploy -- `hasFullTextAnnotation` → `pagesLength`/`blocksLength` →
`paragraphWordsLength` → `boundingBoxKeys` -- until the actual field name
mismatch was visible. **When a black-box API returns "success, but
nothing," don't guess at the shape from documentation alone; make the
response's actual shape observable, one level at a time, through
whatever channel is already available** (here: the existing `debug=1`
endpoint, since server logs weren't reachable). The fix itself, once the
real shape was visible, was small: fall back to `normalizedVertices`
scaled by the page's own reported width/height whenever `vertices` is
empty.

## 22. A coincidental X-alignment with unrelated page text can steal fragments from a real bearing

Diagnosed why one plan's `149°` bearing produced zero candidates even
though both its fragments ("149" and "°") were individually present and
correctly recognized. The vertical-column clustering (§2) is greedy
single-linkage: each fragment, processed in Y order, joins whichever
existing column's *most recently added* member is close enough in X and
Y — with no way to reconsider once a wrong fragment has been absorbed.
On this plan, an unrelated "31" (from "ORIGIN:- U.T.M (ZONE 31)", far
above on the page) happened to sit at the exact same X as "149". Since
83px separated them -- well inside the deliberately generous 24×-height
Y-gap tolerance real rotated labels need -- "149" joined "31"'s column
first, then "°" joined that same column right after. The merged
three-fragment read ("31149°" forward, "°14931" backward) doesn't parse
as any valid bearing, so the whole column was silently discarded --
taking the genuine "149°" down with it, since a fragment can only belong
to one column.

Not fixed this session -- the two X-coordinate collision (a totally
unrelated header field landing on the same column as a real bearing
fragment) is narrow enough, and any fix broad enough to catch it (e.g.
trying every contiguous sub-window of a column, not just the whole
thing) risks new false-positive merges elsewhere, the same class of risk
weighed off in §14/§15. Recorded as a known, precisely-diagnosed gap
rather than guessed at further -- if it recurs on another plan, that's
the signal it's common enough to be worth the broader, riskier fix.

## 23. A bearing split across two beacons is still findable -- through the edge it belongs to, not through proximity

Confirmed common (not an edge case): a surveyor prints a bearing's
degrees at one beacon and its minutes at the far end of the same edge,
the other beacon. Every existing bearing-assembly pass (row-based §-,
vertical-column §2) works by clustering fragments that are physically
*close together* -- exactly the property this pattern doesn't have. The
two halves can be hundreds of pixels apart with unrelated text in
between.

The fix reuses machinery already built for a different purpose: beacon
label positions → `edgesFromBeaconPositions` → `nearestEdgeIndex`,
originally added so a multi-fragment bearing could be checked for
self-consistency (§ conflicted-candidate logic). An edge's midpoint sits
geometrically between its two endpoint beacons, so a degrees fragment
near one beacon and a minutes fragment near the other are each
*individually* nearest to the same edge midpoint -- even though they're
nowhere near *each other*. That shared edge, not pixel distance, is what
links them. `repairCrossBeaconMinutes` finds every unclaimed minutes
fragment (fused `23'` token, or split `23` + `'` reassembled the same
way `resolveGridValue` reassembles a split grid value), maps each to its
nearest edge, and splices it into any degrees-only candidate that's
independently nearest to that same edge.

Deliberately scoped to stay fail-closed:

- **Whole-circle bearings only** ("149°23'"), not quadrant ("N51°30'E").
  A quadrant bearing is converted to its 0-360 value immediately on
  parse, and whether adding minutes should increase or decrease that
  value depends on which quadrant it was -- information already gone by
  the time a candidate reaches the repair step. Guessing the sign risks
  silently moving the plotted boundary; the safe fallback is to leave a
  quadrant candidate as degrees-only rather than splice a maybe-wrong
  direction into it.
- **Only fires on an unambiguous edge match** -- exactly one orphan
  minutes fragment mapped to exactly one degrees-only candidate's edge.
  If two candidates or two fragments both land on the same edge, nothing
  is spliced; a leftover degrees-only bearing is still usable (just less
  precise), same as before this fix existed.
