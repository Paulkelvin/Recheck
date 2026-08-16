import {
  pointToLatLng,
  beltForState,
  findStateInText,
  type LatLng,
  type ProjectionSystem,
  type UtmZone,
} from "./nigeria-belts";

// Best-effort, fully automatic extraction of a plot's beacon coordinates from
// an uploaded survey plan, for the free pre-payment map preview. No human
// reviews this before it's shown -- so every step here is a chance to be
// silently wrong, and each one has a gate that fails closed into
// "unavailable" instead of guessing. A visitor seeing no preview is fine;
// a visitor seeing their land in the wrong place is not.
//
// The plan itself is the source of truth, not the buyer-typed intake form --
// a garbled state field shouldn't block a perfectly readable plan, and a
// plan's own printed "ORIGIN:" line is more reliable than guessing a
// projection from a free-text state name. The form's state is only a
// last-resort fallback when the plan doesn't say.

export type PlanOcrResult =
  | { status: "available"; coordinates: LatLng[]; note?: string; debug?: OcrDebugInfo }
  | { status: "unavailable"; reason: string; note?: string; debug?: OcrDebugInfo };

// x/y (the bearing's anchor position) are carried along so the boundary's
// known geometry -- see edgesFromBeaconPositions -- can be used to order
// legs for large plots, without needing a second lookup back to whichever
// candidate produced each leg.
type LegCandidate = { bearingDeg: number; distanceM: number; x?: number; y?: number };

type OcrDebugInfo = {
  words: OcrWord[];
  avgConfidence: number | null;
  rows: string[][];
  pairs: Array<[number, number]>;
  method?: "table" | "traverse";
  startPoint?: [number, number];
  legs?: LegCandidate[];
  closureErrorM?: number;
  projection?: string;
  areaCheck?: { statedM2: number; computedM2: number } | null;
  beaconCount?: number;
  hadConflict?: boolean;
};

const MIN_CONFIDENCE = 0.6;
const MIN_POINTS = 3;
const MAX_LEGS_FOR_PERMUTATION_SEARCH = 8;
// A beacon table's easting/northing values should span a plausible plot --
// too tight and it's probably noise, too wide and the parser likely grabbed
// unrelated numbers (page numbers, plan numbers, scale ratios) off the page.
const MIN_SPAN_METERS = 3;
const MAX_SPAN_METERS = 3000;
// Rough lat/lng box for Nigeria -- a final check that the converted points
// actually landed in the country instead of somewhere the projection math
// doesn't apply.
const NIGERIA_BOUNDS = { minLat: 4, maxLat: 14, minLng: 2.5, maxLng: 14.7 };

const COORD_PATTERN = /^-?\d{4,7}\.\d{1,3}$|^-?\d{5,7}$/;
// Deliberately allows as few as 3 leading digits: plans print these with a
// thousands space ("748 024.989mN"), which OCR returns as two tokens, so the
// suffixed half arrives truncated and is repaired by resolveGridValue below.
const NORTHING_TOKEN = /^(\d{3,7}(?:\.\d{1,3})?)mN$/i;
const EASTING_TOKEN = /^(\d{3,7}(?:\.\d{1,3})?)mE$/i;
const GRID_PREFIX_TOKEN = /^\d{1,3}$/;
// Nigerian grid values are 6-7 digits; anything outside this is a bad join.
const MIN_GRID_VALUE = 100_000;
const MAX_GRID_VALUE = 2_000_000;

// Most Nigerian survey plans don't list every beacon's absolute coordinate --
// they give one starting beacon's Easting/Northing, then a "traverse": a
// bearing + distance for each boundary leg, walking around back to the
// start. Reconstructing the plot means real trigonometry, and a misread
// digit or a wrong bearing convention produces a plausible-looking but
// wrong-shaped polygon -- exactly the silent-wrong-answer risk this whole
// pipeline exists to avoid. The closure check below (does the traverse
// actually walk back to where it started?) is the real safety net, the same
// check a surveyor uses to validate their own fieldwork.
const QUADRANT_BEARING = /^([NS])(\d{1,2})[°ºo](\d{1,2})?['′]?(\d{1,2}(?:\.\d+)?)?["″]?([EW])$/i;
const WHOLE_CIRCLE_BEARING = /^(\d{1,3})[°ºo](\d{1,2})?['′]?(\d{1,2}(?:\.\d+)?)?["″]?$/;
// A page-wide distance candidate requires a decimal point (an "m" suffix is
// allowed but not required) -- real survey distances are conventionally
// recorded to decimal precision, e.g. "18.24m" or "30.00", and requiring
// the decimal point is what makes a page-wide search safe without row/table
// context: a bare whole number (a scale-bar tick like "40m", a plan
// reference) has none.
const DISTANCE_CANDIDATE = /^\d{1,4}\.\d{1,3}m?$/i;
// Nigerian beacon labels observed on every real plan so far, from three
// different surveyors/states: 2 letters + 4 digits + 2 letters
// (DF8477YE, CA8698PE, AD6105GE). Deliberately strict -- a false match here
// would corrupt the edge geometry below, and missing a genuine beacon just
// degrades to the existing behavior, so under-matching is the safe failure.
const BEACON_LABEL = /^[A-Z]{2}\d{4}[A-Z]{2}$/i;
const MAX_BEARING_TOKEN_SPAN = 4;
// Expressed as multiples of the page's median word height rather than fixed
// pixels -- see medianWordHeight's comment. Calibrated against a real plan
// at native resolution (median word height 9px, tolerance 20px, gap 220px)
// and kept as the same ratios: 2.2x median height for X-alignment, and a
// generous 24x for the Y-gap real rotated labels span between their degree
// and minute fragments.
const VERTICAL_CLUSTER_X_TOLERANCE_RATIO = 2.2;
const VERTICAL_CLUSTER_MAX_Y_GAP_RATIO = 24;
// Road right-of-way width labels ("50' ROAD") use the exact same bare
// digit + minute-symbol token shape as a bearing's minute fragment, printed
// close to the word "ROAD". Calibrated against a real plan where the
// closest such pair was 55px apart in Y with a 23px median word height
// (ratio ~2.4) -- 3.5x leaves margin without reaching the 24x column Y-gap,
// so it can't accidentally swallow a genuine same-column bearing fragment.
const ROAD_LABEL_PROXIMITY_RATIO = 3.5;
// Closure tolerance: a real traverse should walk back to its starting
// point. Allow up to 1% of the total perimeter or 2m, whichever is more
// forgiving, to absorb ordinary OCR digit noise without accepting a
// traverse that clearly doesn't close.
const CLOSURE_TOLERANCE_RATIO = 0.01;
const CLOSURE_TOLERANCE_MIN_M = 2;
// Cross-check against a plan's own stated plot area, when OCR finds one --
// allow generous slack since both the OCR'd area figure and the computed
// polygon carry their own noise.
const AREA_TOLERANCE_RATIO = 0.15;

type OcrWord = { text: string; x: number; y: number; height: number };

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch document (${res.status})`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

async function runVisionOcr(
  docUrl: string,
  apiKey: string,
): Promise<{ words: OcrWord[]; avgConfidence: number | null; fullText: string }> {
  const isPdf = docUrl.toLowerCase().includes(".pdf");

  if (isPdf) {
    const content = await fetchAsBase64(docUrl);
    const res = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            inputConfig: { content, mimeType: "application/pdf" },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            pages: [1],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Vision API error (${res.status})`);
    const data = await res.json();
    const pageResponse = data.responses?.[0]?.responses?.[0];
    assertNoVisionError(pageResponse);
    return extractWordsAndConfidence(pageResponse);
  }

  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { source: { imageUri: docUrl } },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Vision API error (${res.status})`);
  const data = await res.json();
  assertNoVisionError(data.responses?.[0]);
  return extractWordsAndConfidence(data.responses?.[0]);
}

// The batch endpoint returns HTTP 200 even when the individual image failed
// (bad image data, quota exceeded, permission denied) -- the real failure
// is nested in responses[0].error, and `res.ok` alone never sees it. Left
// unchecked, this was silently indistinguishable from "the plan genuinely
// has no readable text on it": both produce an empty word list, so a quota
// or auth problem misreported itself as "insufficient_coordinates" -- a
// document-quality verdict about a plan that was never actually read.
function assertNoVisionError(response: unknown): void {
  const err = (response as { error?: { code?: number; message?: string } } | undefined)?.error;
  if (err) throw new Error(`Vision API returned an error: ${err.code} ${err.message}`);
}

type VisionVertex = { x?: number; y?: number };
type VisionWord = {
  confidence?: number;
  boundingBox?: { vertices?: VisionVertex[] };
  symbols?: Array<{ text?: string }>;
};

// Reconstructs each word's text and vertical position from Vision's
// structured response, instead of using fullTextAnnotation.text -- Vision
// inserts line breaks based on its own layout guess, which for a
// widely-spaced table or a rotated label routinely scatters related content
// across several "lines". Row/cluster reconstruction below uses actual word
// geometry instead.
function extractWordsAndConfidence(response: unknown): {
  words: OcrWord[];
  avgConfidence: number | null;
  fullText: string;
} {
  const r = response as {
    fullTextAnnotation?: {
      text?: string;
      pages?: Array<{
        blocks?: Array<{ paragraphs?: Array<{ words?: VisionWord[] }> }>;
      }>;
    };
  };

  const words: OcrWord[] = [];
  const confidences: number[] = [];

  for (const page of r?.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          const text = (word.symbols ?? []).map((s) => s.text ?? "").join("");
          const vertices = word.boundingBox?.vertices ?? [];
          if (!text || vertices.length === 0) continue;

          const ys = vertices.map((v) => v.y ?? 0);
          const xs = vertices.map((v) => v.x ?? 0);
          words.push({
            text,
            x: Math.min(...xs),
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
            height: Math.max(...ys) - Math.min(...ys) || 20,
          });

          if (typeof word.confidence === "number") confidences.push(word.confidence);
        }
      }
    }
  }

  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;

  return { words, avgConfidence, fullText: r?.fullTextAnnotation?.text ?? "" };
}

// Groups words into table rows by vertical position instead of Vision's text
// line breaks: sort by Y, start a new row whenever the gap to the next word
// exceeds half a typical word's height, then sort each row left-to-right.
// A page scanned or exported at a different resolution scales every word's
// pixel size and spacing together, so word height is the natural "ruler" to
// measure other pixel distances against instead of a fixed constant --
// found this the hard way: sending a 3x-upscaled version of the same
// document (to test whether upscaling recovers faint text) fed the exact
// same fixed-pixel clustering thresholds words three times further apart,
// and broke clustering that worked fine at native resolution.
function medianWordHeight(words: OcrWord[]): number {
  if (words.length === 0) return 20;
  const heights = words.map((w) => w.height).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}

function groupIntoRows(words: OcrWord[]): OcrWord[][] {
  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.y - b.y);
  const medianHeight = medianWordHeight(sorted);
  const rowGapThreshold = medianHeight * 0.6;

  const rows: OcrWord[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prevRow = rows[rows.length - 1];
    const rowY = prevRow.reduce((sum, w) => sum + w.y, 0) / prevRow.length;
    if (Math.abs(sorted[i].y - rowY) <= rowGapThreshold) {
      prevRow.push(sorted[i]);
    } else {
      rows.push([sorted[i]]);
    }
  }

  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

// --- Projection detection: the plan's own text is authoritative -----------

// Scans the plan's OCR text for its own stated coordinate system, preferring
// that over anything inferred from the buyer-typed intake form. Falls back to
// the state named on the plan, and only then to the form's state.
function detectProjection(
  fullText: string,
  formState: string,
): { system: ProjectionSystem; label: string } | null {
  const upper = fullText.toUpperCase();

  // A stated zone number is the reliable signal, not how the surveyor chose
  // to spell the projection. Real plans write the same thing at least three
  // ways -- "U.T.M.", letter-spaced "U. T. M.", and spelled out as
  // "UNIVERSAL" -- and matching on the wording alone missed the third,
  // which then fell through to guessing a belt from the state name and put
  // an Osun plot 623km away in Kaduna. That wrong position is still inside
  // Nigeria, so no downstream bounds check would have caught it.
  //
  // 31 and 32 are the only UTM zones covering Nigeria, and the Minna belts
  // are named (West/Mid/East) rather than numbered, so a stated "ZONE 31"
  // or "ZONE 32" is unambiguous.
  const zoneMatch = upper.match(/\bZONE\s*(3[12])\b/);
  if (zoneMatch) {
    const zone = Number(zoneMatch[1]) as UtmZone;
    return { system: { type: "utm", zone }, label: `utm-zone-${zone}` };
  }

  const belt = /WEST\s+BELT/.test(upper)
    ? "west"
    : /MID\s+BELT/.test(upper)
      ? "mid"
      : /EAST\s+BELT/.test(upper)
        ? "east"
        : null;
  if (belt) return { system: { type: "belt", belt }, label: `belt-${belt}` };

  // The plan didn't state a system directly -- fall back to whichever
  // Nigerian state name appears on the plan itself (its header almost always
  // names the state), and only then to the buyer's form field.
  const effectiveState = findStateInText(fullText) ?? formState;
  const stateBelt = beltForState(effectiveState);
  if (!stateBelt) return null;

  return { system: { type: "belt", belt: stateBelt }, label: `belt-${stateBelt}` };
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Tells the buyer when the plan disagrees with what they typed. Deliberately
// computed independently of which projection branch was taken above -- the
// discrepancy matters just as much on a plan that states its own UTM zone as
// on one we had to infer a belt for. Purely informational: the preview is
// still shown, since the plan is the document of record and a fumbled form
// field is not a reason to withhold a correct result.
function locationDiscrepancyNote(fullText: string, formState: string): string | undefined {
  const planState = findStateInText(fullText);
  if (!planState) return undefined;

  const typed = formState.trim().toLowerCase();
  // Nothing meaningful to compare against if the buyer's entry isn't a
  // recognizable state in the first place.
  if (!beltForState(typed) || typed === planState) return undefined;

  return `This plan says it's in ${titleCase(planState)} State, but ${titleCase(typed)} was entered on the form. The map below follows the plan.`;
}

// --- Start coordinate detection --------------------------------------------

// Nigerian plans conventionally print the Northing and Easting of the
// nearest grid intersection as separate margin labels (e.g. "715041.281mN"
// along the top, "584652.633mE" along the side) rather than as one paired
// row -- so this searches the whole page, not just one row, for exactly one
// of each suffix.
// Repairs a grid value that OCR split at the thousands space. The leading
// group is rejoined from the nearest short integer sitting either
// immediately to the left (a horizontal margin label) or directly
// above/below (a label rotated 90 degrees along the drawing's edge, which is
// how the easting is usually printed). The rejoined value is only accepted
// if it lands in a plausible range, so a coincidental nearby number can't
// silently relocate the whole plot.
function resolveGridValue(token: OcrWord, raw: string, words: OcrWord[]): number | null {
  const direct = Number(raw);
  if (Number.isFinite(direct) && direct >= MIN_GRID_VALUE && direct <= MAX_GRID_VALUE) {
    return direct;
  }

  // Same resolution-relative reasoning as the vertical bearing clustering
  // above -- fixed pixel distances here would misfire on a page scanned or
  // exported at a different size.
  const scale = medianWordHeight(words);
  const closeGap = scale * 1.7;
  const lineWidth = scale * 10;

  let best: { value: number; distance: number } | null = null;
  for (const candidate of words) {
    if (candidate === token || !GRID_PREFIX_TOKEN.test(candidate.text)) continue;

    const dx = token.x - candidate.x;
    const dy = token.y - candidate.y;
    const sameLineToTheLeft = Math.abs(dy) <= closeGap && dx > 0 && dx <= lineWidth;
    const stackedVertically = Math.abs(dx) <= closeGap && Math.abs(dy) <= lineWidth;
    if (!sameLineToTheLeft && !stackedVertically) continue;

    const value = Number(`${candidate.text}${raw}`);
    if (!Number.isFinite(value) || value < MIN_GRID_VALUE || value > MAX_GRID_VALUE) continue;

    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { value, distance };
  }

  return best?.value ?? null;
}

function findStartCoordinateGlobal(words: OcrWord[]): [number, number] | null {
  const northings = words.filter((w) => NORTHING_TOKEN.test(w.text));
  const eastings = words.filter((w) => EASTING_TOKEN.test(w.text));
  if (northings.length !== 1 || eastings.length !== 1) return null;

  const northing = resolveGridValue(
    northings[0],
    northings[0].text.match(NORTHING_TOKEN)![1],
    words,
  );
  const easting = resolveGridValue(eastings[0], eastings[0].text.match(EASTING_TOKEN)![1], words);
  if (northing === null || easting === null) return null;

  return [easting, northing];
}

// Within each reconstructed row, a numeric token is a candidate beacon
// coordinate. A row is only used if exactly two tokens in the whole row
// match the coordinate pattern -- extra numbers (a beacon label like "12",
// a third stray value) make the row ambiguous, so it's skipped rather than
// guessed at. Fallback for plans that do list a beacon's coordinate as one
// clean row, without the mN/mE suffix convention.
function pairsFromRows(rows: OcrWord[][]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const row of rows) {
    const numeric = row.map((w) => w.text).filter((t) => COORD_PATTERN.test(t));
    if (numeric.length !== 2) continue;
    const [a, b] = numeric.map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) pairs.push([a, b]);
  }
  return pairs;
}

// --- Boundary geometry from beacon label positions ----------------------
//
// Beacon labels (CA8698PE, AD6105GE, ...) are large, clean text -- read with
// far higher confidence than the small, easily-scattered bearing/distance
// annotations. Their pixel positions on the page are a second, independent
// source of the boundary's actual shape, usable two ways below: as a real
// cross-check on whether a bearing candidate's own fragments agree on which
// edge they belong to, and as an ordering strategy for polygons too large
// for the exhaustive permutation search.
//
// This does NOT resolve the corner-shared-label ambiguity found on a real
// plan (verified: the ambiguous fragment there was still geometrically
// closer to the wrong edge's midpoint than the right one) -- it makes
// exactly that kind of contradiction detectable instead of silently
// mis-assigned, and extends what a beacon-position, non-exhaustive ordering
// can attempt for plans with more sides than 8. It is not a substitute for
// seeing which drawn line a label actually sits along.
type Edge = { midX: number; midY: number };

function extractBeaconPositions(words: OcrWord[]): Array<{ x: number; y: number }> {
  return words.filter((w) => BEACON_LABEL.test(w.text)).map((w) => ({ x: w.x, y: w.y }));
}

// Beacons are drawn at roughly their true relative positions on the page --
// sorting by angle around their centroid recovers the polygon's actual
// vertex cycle without needing to know which text label belongs to which
// edge at all.
function edgesFromBeaconPositions(beacons: Array<{ x: number; y: number }>): Edge[] {
  if (beacons.length < 3) return [];

  const cx = beacons.reduce((s, b) => s + b.x, 0) / beacons.length;
  const cy = beacons.reduce((s, b) => s + b.y, 0) / beacons.length;
  const ordered = [...beacons].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );

  return ordered.map((b, i) => {
    const next = ordered[(i + 1) % ordered.length];
    return { midX: (b.x + next.x) / 2, midY: (b.y + next.y) / 2 };
  });
}

function nearestEdgeIndex(x: number, y: number, edges: Edge[]): number {
  let best = 0;
  let bestDist = Infinity;
  edges.forEach((e, i) => {
    const d = Math.hypot(e.midX - x, e.midY - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

// --- Bearing parsing ---------------------------------------------------

function dmsToDecimalDegrees(deg: string, min?: string, sec?: string): number {
  return Number(deg) + Number(min ?? 0) / 60 + Number(sec ?? 0) / 3600;
}

// Converts a quadrant bearing (e.g. N45°30'E) to a whole-circle bearing
// (0-360, clockwise from North) -- the form the traverse math below needs.
function quadrantToWholeCircle(letter1: string, angle: number, letter2: string): number | null {
  const ns = letter1.toUpperCase();
  const ew = letter2.toUpperCase();
  if (angle < 0 || angle > 90) return null;
  if (ns === "N" && ew === "E") return angle;
  if (ns === "S" && ew === "E") return 180 - angle;
  if (ns === "S" && ew === "W") return 180 + angle;
  if (ns === "N" && ew === "W") return 360 - angle;
  return null;
}

function bearingFromString(text: string): number | null {
  const quadrant = text.match(QUADRANT_BEARING);
  if (quadrant) {
    const angle = dmsToDecimalDegrees(quadrant[2], quadrant[3], quadrant[4]);
    const wcb = quadrantToWholeCircle(quadrant[1], angle, quadrant[5]);
    if (wcb !== null) return wcb;
  }
  const wholeCircle = text.match(WHOLE_CIRCLE_BEARING);
  if (wholeCircle) {
    const wcb = dmsToDecimalDegrees(wholeCircle[1], wholeCircle[2], wholeCircle[3]);
    if (wcb >= 0 && wcb <= 360) return wcb;
  }
  return null;
}

// `conflicted` marks a multi-fragment bearing whose own pieces don't agree
// on which boundary edge they belong to -- see the conflict check in
// bearingCandidatesFromVerticalColumns. A conflicted candidate is dropped
// rather than guessed at, same fail-closed principle as everything else.
type BearingCandidate = {
  bearingDeg: number;
  x: number;
  y: number;
  rowIndex?: number;
  conflicted?: boolean;
};

// Case 1: a bearing whose fragments share one row -- horizontal labels
// (typically the top/bottom sides of a plot) OCR this way. Scans each row
// for up to MAX_BEARING_TOKEN_SPAN consecutive words joining into a valid
// bearing (Vision may split "N45°30'E" at the symbol boundaries). Returns
// which words it consumed so the vertical-column pass (below) doesn't
// independently re-detect the same fragments -- two horizontally-adjacent
// characters are often close enough in both X and Y to also look like a
// rotated column, which would otherwise silently duplicate the bearing.
// Tags each candidate with its row index so pairing (below) can prefer an
// unambiguous same-row distance over a merely-nearest one.
function bearingCandidatesFromRows(rows: OcrWord[][]): { candidates: BearingCandidate[]; consumed: Set<OcrWord> } {
  const candidates: BearingCandidate[] = [];
  const consumed = new Set<OcrWord>();
  rows.forEach((row, rowIndex) => {
    const texts = row.map((w) => w.text);
    for (let i = 0; i < texts.length; i++) {
      for (let span = 1; span <= MAX_BEARING_TOKEN_SPAN && i + span <= texts.length; span++) {
        const joined = texts.slice(i, i + span).join("").replace(/\s+/g, "");
        const deg = bearingFromString(joined);
        if (deg !== null) {
          const consumedWords = row.slice(i, i + span);
          consumedWords.forEach((w) => consumed.add(w));
          const x = consumedWords.reduce((s, w) => s + w.x, 0) / consumedWords.length;
          const y = consumedWords.reduce((s, w) => s + w.y, 0) / consumedWords.length;
          candidates.push({ bearingDeg: deg, x, y, rowIndex });
          break;
        }
      }
    }
  });
  return { candidates, consumed };
}

// Case 2: a bearing rotated 90° in the source drawing (typically the left/
// right sides of a plot) -- Vision reads it top-to-bottom, splitting the
// degrees and minutes far apart in Y even though they share almost exactly
// the same X (measured from real plans: within a couple of pixels). Groups
// digit/symbol fragments into X-aligned columns and tries reading each
// column both top-to-bottom and bottom-to-top, since a rotated label's true
// reading direction isn't known in advance. Excludes anything the row-based
// pass already used, and anything on an obvious scale-bar row.
function bearingCandidatesFromVerticalColumns(
  words: OcrWord[],
  exclude: Set<OcrWord>,
  edges: Edge[],
): BearingCandidate[] {
  const fragmentPattern = /^\d{1,3}$/;
  const symbolPattern = /^[°ºo'′"″]+$/;
  const scale = medianWordHeight(words);

  // Road right-of-way width labels ("50' ROAD") are printed as a bare
  // digit next to a minute-symbol, right beside the word "ROAD" -- the
  // exact token shape a bearing-minute fragment has. Drop any fragment
  // found within a few word-heights of a "ROAD" token before clustering,
  // so it can't get pulled into an unrelated edge's bearing column.
  const roadWords = words.filter((w) => /^ROAD$/i.test(w.text));
  const roadRadius = scale * ROAD_LABEL_PROXIMITY_RATIO;
  const nearRoadLabel = (w: OcrWord) =>
    roadWords.some((r) => Math.abs(r.x - w.x) <= roadRadius && Math.abs(r.y - w.y) <= roadRadius);

  const fragments = words.filter(
    (w) =>
      !exclude.has(w) &&
      (fragmentPattern.test(w.text) || symbolPattern.test(w.text)) &&
      !nearRoadLabel(w),
  );

  const xTolerance = scale * VERTICAL_CLUSTER_X_TOLERANCE_RATIO;
  const maxYGap = scale * VERTICAL_CLUSTER_MAX_Y_GAP_RATIO;

  // Single-linkage clustering by Y: a fragment joins a column only if it's
  // both X-aligned with AND within a plausible Y-gap of that column's
  // nearest member -- X-alignment alone isn't enough, since an unrelated
  // digit hundreds of pixels away elsewhere on the page (a plan number, a
  // block number) can share the same X purely by coincidence.
  const columns: OcrWord[][] = [];
  for (const w of [...fragments].sort((a, b) => a.y - b.y)) {
    const column = columns.find((c) => {
      const nearest = c[c.length - 1];
      return Math.abs(nearest.x - w.x) <= xTolerance && Math.abs(w.y - nearest.y) <= maxYGap;
    });
    if (column) column.push(w);
    else columns.push([w]);
  }

  const candidates: BearingCandidate[] = [];
  for (const column of columns) {
    if (column.length < 2) continue;
    const sorted = [...column].sort((a, b) => a.y - b.y);
    const forward = sorted.map((w) => w.text).join("");
    const backward = [...sorted].reverse().map((w) => w.text).join("");

    for (const candidate of [forward, backward]) {
      const deg = bearingFromString(candidate);
      if (deg !== null) {
        const x = sorted.reduce((s, w) => s + w.x, 0) / sorted.length;
        const y = sorted.reduce((s, w) => s + w.y, 0) / sorted.length;

        // Each fragment was written by the surveyor next to one specific
        // edge. If the fragments making up this single bearing don't agree
        // on which edge that is -- checked against edge midpoints derived
        // from the reliably-read beacon positions, not against each other
        // -- something is wrong with how they were grouped, so the whole
        // candidate is marked and dropped downstream rather than guessed at.
        const conflicted =
          edges.length > 0 &&
          new Set(sorted.map((w) => nearestEdgeIndex(w.x, w.y, edges))).size > 1;

        candidates.push({ bearingDeg: deg, x, y, conflicted });
        break;
      }
    }
  }
  return candidates;
}

// A plan's scale bar ("m10 5 0 10 20 30 40m") reads as a row of small
// plain and "m"-suffixed numbers -- exactly the shape a real distance
// candidate has. Its distinctive tell is the leading "m10"/"m5"-style tick
// label (a bare "m" immediately followed by digits, not found in normal
// distance or bearing text), so any row containing one is excluded wholesale
// from both distance and bearing candidacy.
function scaleBarWords(rows: OcrWord[][]): Set<OcrWord> {
  const excluded = new Set<OcrWord>();
  for (const row of rows) {
    if (row.some((w) => /^m\d+(\.\d+)?$/i.test(w.text))) {
      row.forEach((w) => excluded.add(w));
    }
  }
  return excluded;
}

// A plan's stated total AREA figure ("AREA:- 4346.275 SQ. METRES") has the
// exact numeric shape DISTANCE_CANDIDATE looks for -- decimal, 1-4 digits
// before the point -- and left unexcluded gets treated as a real boundary
// distance. Its tell is sharing a row with the word "AREA" itself, so
// exclude that row wholesale, same principle as scaleBarWords.
function areaWords(rows: OcrWord[][]): Set<OcrWord> {
  const excluded = new Set<OcrWord>();
  for (const row of rows) {
    if (row.some((w) => /^-*AREA[:\-]*$/i.test(w.text))) {
      row.forEach((w) => excluded.add(w));
    }
  }
  return excluded;
}

type DistanceCandidate = { distanceM: number; x: number; y: number; rowIndex?: number };

// Distances are searched for anywhere on the page, not row-restricted --
// requiring a decimal point (see DISTANCE_CANDIDATE) is what keeps this
// safe without row/table context. Each match is tagged with its row index
// (when it belongs to one) so pairing (below) can prefer an unambiguous
// same-row bearing over a merely-nearest one.
function distanceCandidates(
  words: OcrWord[],
  rows: OcrWord[][],
  exclude: Set<OcrWord>,
): DistanceCandidate[] {
  const rowIndexOf = new Map<OcrWord, number>();
  rows.forEach((row, i) => row.forEach((w) => rowIndexOf.set(w, i)));

  return words
    .filter((w) => !exclude.has(w) && DISTANCE_CANDIDATE.test(w.text))
    .map((w) => ({
      distanceM: Number(w.text.replace(/m$/i, "")),
      x: w.x,
      y: w.y,
      rowIndex: rowIndexOf.get(w),
    }));
}

// Pairs bearings with distances in two passes. First: any row that holds
// exactly one row-based bearing and exactly one distance is paired directly
// -- unambiguous, and immune to the second pass's failure mode (see below).
// Second, for whatever's left (typically the rotated/vertical-column
// bearings, which by construction never share a row with their distance):
// nearest not-yet-claimed distance by straight 2D pixel distance. Pure
// nearest-neighbor alone can mispair a multi-word bearing (whose anchor is
// the average position of several consumed words, and so can drift closer
// to an adjacent row's distance than to its own) -- the same-row pass
// avoids that failure mode wherever a row makes the pairing unambiguous. A
// wrong pairing either way is still caught downstream by the closure check,
// so this only needs to be a good heuristic, not a proof.
function pairNearestLegs(
  bearings: BearingCandidate[],
  distances: DistanceCandidate[],
): LegCandidate[] {
  const legs: LegCandidate[] = [];
  const usedBearings = new Set<BearingCandidate>();
  const usedDistances = new Set<DistanceCandidate>();

  const rowCounts = new Map<number, { bearings: BearingCandidate[]; distances: DistanceCandidate[] }>();
  for (const b of bearings) {
    if (b.rowIndex === undefined) continue;
    const entry = rowCounts.get(b.rowIndex) ?? { bearings: [], distances: [] };
    entry.bearings.push(b);
    rowCounts.set(b.rowIndex, entry);
  }
  for (const d of distances) {
    if (d.rowIndex === undefined) continue;
    const entry = rowCounts.get(d.rowIndex) ?? { bearings: [], distances: [] };
    entry.distances.push(d);
    rowCounts.set(d.rowIndex, entry);
  }
  for (const { bearings: rowBearings, distances: rowDistances } of rowCounts.values()) {
    if (rowBearings.length === 1 && rowDistances.length === 1) {
      legs.push({
        bearingDeg: rowBearings[0].bearingDeg,
        distanceM: rowDistances[0].distanceM,
        x: rowBearings[0].x,
        y: rowBearings[0].y,
      });
      usedBearings.add(rowBearings[0]);
      usedDistances.add(rowDistances[0]);
    }
  }

  const remaining = distances.filter((d) => !usedDistances.has(d));
  for (const bearing of bearings) {
    if (usedBearings.has(bearing) || remaining.length === 0) continue;
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((d, i) => {
      const dist = Math.hypot(d.x - bearing.x, d.y - bearing.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    const [match] = remaining.splice(bestIdx, 1);
    legs.push({ bearingDeg: bearing.bearingDeg, distanceM: match.distanceM, x: bearing.x, y: bearing.y });
  }

  return legs;
}

// --- Traverse math ----------------------------------------------------

// Walks a traverse from a starting easting/northing through each leg's
// bearing and distance, in the given order. Returns every vertex including
// a final "closing" point computed from the last leg -- that closing point
// should land back on the start; how far off it lands is the closure error.
function walkTraverse(start: [number, number], legs: LegCandidate[]): Array<[number, number]> {
  const points: Array<[number, number]> = [start];
  for (const leg of legs) {
    const [easting, northing] = points[points.length - 1];
    const rad = (leg.bearingDeg * Math.PI) / 180;
    points.push([easting + leg.distanceM * Math.sin(rad), northing + leg.distanceM * Math.cos(rad)]);
  }
  return points;
}

function closureErrorMeters(start: [number, number], closingPoint: [number, number]): number {
  return Math.hypot(closingPoint[0] - start[0], closingPoint[1] - start[1]);
}

function polygonAreaM2(points: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) {
      yield [items[i], ...perm];
    }
  }
}

type ClosingResult = { order: LegCandidate[]; closureError: number; points: Array<[number, number]> };

// Greedily assigns each leg to the nearest not-yet-claimed edge in a given
// (already rotated/directed) sequence of edge midpoints, by the leg's own
// anchor position. Only used as a fallback for polygons too large for
// exhaustive search -- for anything the permutation search can afford, that
// remains the primary strategy, since it doesn't depend on legs carrying
// position info or on beacon labels having been found at all.
function assignLegsToEdgeSequence(legs: LegCandidate[], edgeSequence: Edge[]): LegCandidate[] | null {
  if (legs.length !== edgeSequence.length) return null;
  if (legs.some((l) => l.x === undefined || l.y === undefined)) return null;

  const remaining = [...legs];
  const ordered: LegCandidate[] = [];
  for (const edge of edgeSequence) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((leg, i) => {
      const d = Math.hypot(leg.x! - edge.midX, leg.y! - edge.midY);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

// The order legs were found in (page reading order) has no reliable
// relationship to the order they actually connect around the boundary --
// annotations are scattered around a drawing, not listed sequentially. So
// instead of guessing an order, every permutation (up to a sane cap) is
// walked. Closure error alone isn't a safe tiebreaker: with near-cardinal
// bearings (east/west/south/north-ish, common on rectangular plots) more
// than one ordering can retrace its own path back close to the start
// without ever tracing the actual boundary -- a degenerate near-zero-area
// "bowtie" that closes about as well as the real rectangle does. Among
// every ordering that closes within a generous multiple of tolerance, the
// one enclosing the LARGEST area is kept, since a coincidentally-closing
// degenerate path has a much smaller area than the true shape. The real
// (tighter) closure tolerance is still enforced by the caller afterward.
//
// Above MAX_LEGS_FOR_PERMUTATION_SEARCH, exhaustive search is no longer
// affordable (factorial growth), so beacon-position-derived edge order
// (see edgesFromBeaconPositions) is tried instead -- every rotation and
// both directions of the beacon-cyclic sequence, since which beacon in that
// sequence corresponds to the known starting coordinate isn't itself known.
function bestClosingOrder(
  start: [number, number],
  legs: LegCandidate[],
  edges: Edge[] = [],
): ClosingResult | null {
  if (legs.length > MAX_LEGS_FOR_PERMUTATION_SEARCH) {
    if (edges.length !== legs.length) return null;

    let best: ClosingResult | null = null;
    for (let rotation = 0; rotation < edges.length; rotation++) {
      for (const direction of [1, -1] as const) {
        const rotated = edges.map((_, i) => edges[(rotation + i * direction + edges.length) % edges.length]);
        const assigned = assignLegsToEdgeSequence(legs, rotated);
        if (!assigned) continue;

        const traverse = walkTraverse(start, assigned);
        const closureError = closureErrorMeters(start, traverse[traverse.length - 1]);
        if (!best || closureError < best.closureError) {
          best = { order: assigned, closureError, points: traverse.slice(0, -1) };
        }
      }
    }
    return best;
  }

  const perimeter = legs.reduce((sum, l) => sum + l.distanceM, 0);
  const searchTolerance = Math.max(CLOSURE_TOLERANCE_MIN_M, perimeter * CLOSURE_TOLERANCE_RATIO) * 3;

  let smallestError: ClosingResult | null = null;
  let largestPlausible: (ClosingResult & { area: number }) | null = null;

  for (const order of permutations(legs)) {
    const traverse = walkTraverse(start, order);
    const closureError = closureErrorMeters(start, traverse[traverse.length - 1]);
    const points = traverse.slice(0, -1);

    if (!smallestError || closureError < smallestError.closureError) {
      smallestError = { order, closureError, points };
    }

    if (closureError <= searchTolerance) {
      const area = polygonAreaM2(points);
      if (!largestPlausible || area > largestPlausible.area) {
        largestPlausible = { order, closureError, points, area };
      }
    }
  }

  return largestPlausible ?? smallestError;
}

// --- Plausibility gates -------------------------------------------------

function withinPlausibleSpan(pairs: Array<[number, number]>): boolean {
  const eastings = pairs.map((p) => p[0]);
  const northings = pairs.map((p) => p[1]);
  const spanE = Math.max(...eastings) - Math.min(...eastings);
  const spanN = Math.max(...northings) - Math.min(...northings);
  const span = Math.max(spanE, spanN);
  return span >= MIN_SPAN_METERS && span <= MAX_SPAN_METERS;
}

function withinNigeria(points: LatLng[]): boolean {
  return points.every(
    (p) =>
      p.lat >= NIGERIA_BOUNDS.minLat &&
      p.lat <= NIGERIA_BOUNDS.maxLat &&
      p.lng >= NIGERIA_BOUNDS.minLng &&
      p.lng <= NIGERIA_BOUNDS.maxLng,
  );
}

// Cross-checks against a plan's own stated plot area when OCR finds one
// (e.g. "PLOT AREA:- 668.791 SQR.MTS"). Only used as a hard gate when a
// stated area was actually found; absence of one isn't itself suspicious.
function areaMismatch(fullText: string, points: Array<[number, number]>): { statedM2: number; computedM2: number } | null {
  const match = fullText.match(/(?:PLOT\s*)?AREA[:\-\s]*-?\s*(\d{2,7}(?:\.\d{1,3})?)/i);
  if (!match) return null;
  const statedM2 = Number(match[1]);
  if (!Number.isFinite(statedM2) || statedM2 <= 0) return null;
  const computedM2 = polygonAreaM2(points);
  return { statedM2, computedM2 };
}

function areaWithinTolerance(check: { statedM2: number; computedM2: number }): boolean {
  const diff = Math.abs(check.statedM2 - check.computedM2);
  return diff <= check.statedM2 * AREA_TOLERANCE_RATIO;
}

export async function extractPlanPreview(
  docUrl: string,
  state: string,
  includeDebug = false,
): Promise<PlanOcrResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return { status: "unavailable", reason: "not_configured" };
  }

  let words: OcrWord[];
  let avgConfidence: number | null;
  let fullText: string;
  try {
    ({ words, avgConfidence, fullText } = await runVisionOcr(docUrl, apiKey));
  } catch (err) {
    console.error("[plan-ocr] Vision API call failed:", err);
    return { status: "unavailable", reason: "ocr_failed" };
  }

  const projection = detectProjection(fullText, state);
  if (!projection) {
    return { status: "unavailable", reason: "unknown_belt" };
  }
  const { system } = projection;

  const rows = groupIntoRows(words);
  const pairs = pairsFromRows(rows);
  // Always fully populated internally; only decided whether to expose at
  // each return via `includeDebug ? debugInfo : undefined`.
  const debugInfo: OcrDebugInfo = {
    words,
    avgConfidence,
    rows: rows.map((r) => r.map((w) => w.text)),
    pairs,
    projection: projection.label,
  };
  const debug = () => (includeDebug ? debugInfo : undefined);

  // Built once and attached by the helpers below, so no return path can
  // silently drop the buyer-facing discrepancy warning.
  const note = locationDiscrepancyNote(fullText, state);
  const unavailable = (reason: string): PlanOcrResult => ({
    status: "unavailable",
    reason,
    note,
    debug: debug(),
  });
  const available = (coordinates: LatLng[]): PlanOcrResult => ({
    status: "available",
    coordinates,
    note,
    debug: debug(),
  });

  if (avgConfidence !== null && avgConfidence < MIN_CONFIDENCE) {
    return unavailable("low_confidence");
  }

  // Path A: a full beacon coordinate table (every corner's Easting/Northing
  // listed directly) -- the simpler, more reliable case when it's there.
  if (pairs.length >= MIN_POINTS) {
    if (!withinPlausibleSpan(pairs)) {
      return unavailable("implausible_coordinates");
    }

    const points = pairs.map(([easting, northing]) => pointToLatLng(easting, northing, system));

    if (!withinNigeria(points)) {
      return unavailable("outside_nigeria");
    }

    debugInfo.method = "table";
    return available(points);
  }

  // Path B: one starting beacon's coordinate plus a bearing/distance
  // traverse for the rest -- the more common real-world case.
  const start = findStartCoordinateGlobal(words) ?? (pairs.length === 1 ? pairs[0] : null);
  if (start) {
    debugInfo.startPoint = start;
    const beacons = extractBeaconPositions(words);
    const edges = edgesFromBeaconPositions(beacons);
    debugInfo.beaconCount = beacons.length;

    const scaleBar = scaleBarWords(rows);
    const areaRow = areaWords(rows);
    const { candidates: rowBearings, consumed } = bearingCandidatesFromRows(rows);
    const excludedFromColumns = new Set([...scaleBar, ...areaRow, ...consumed]);
    const allBearings = [
      ...rowBearings,
      ...bearingCandidatesFromVerticalColumns(words, excludedFromColumns, edges),
    ];

    // A conflicted candidate's own fragments disagree on which edge they
    // belong to -- dropped rather than guessed at, same principle as every
    // other gate here. Tracked separately so a resulting shortfall can be
    // reported as "found contradictory text" rather than "found nothing".
    const bearings = allBearings.filter((b) => !b.conflicted);
    const hadConflict = allBearings.some((b) => b.conflicted);
    debugInfo.hadConflict = hadConflict;

    const distances = distanceCandidates(words, rows, new Set([...scaleBar, ...areaRow]));
    const legs = pairNearestLegs(bearings, distances);
    debugInfo.legs = legs;

    // Distinct from "insufficient_coordinates": the plot's position was
    // found, it's the boundary itself that couldn't be read. Reporting both
    // as the same thing sends anyone debugging a plan down the wrong path.
    // "conflicting_labels" is more specific still -- text was found, but it
    // contradicted itself about which edge it belonged to.
    if (legs.length < MIN_POINTS) {
      return unavailable(hadConflict ? "conflicting_labels" : "insufficient_legs");
    }

    const best = bestClosingOrder(start, legs, edges);
    if (!best) {
      return unavailable("too_many_legs");
    }

    const perimeter = legs.reduce((sum, l) => sum + l.distanceM, 0);
    const tolerance = Math.max(CLOSURE_TOLERANCE_MIN_M, perimeter * CLOSURE_TOLERANCE_RATIO);
    debugInfo.closureErrorM = best.closureError;

    if (best.closureError > tolerance) {
      return unavailable("traverse_did_not_close");
    }

    if (!withinPlausibleSpan(best.points)) {
      return unavailable("implausible_coordinates");
    }

    const areaCheck = areaMismatch(fullText, best.points);
    debugInfo.areaCheck = areaCheck;
    if (areaCheck && !areaWithinTolerance(areaCheck)) {
      return unavailable("area_mismatch");
    }

    const points = best.points.map(([easting, northing]) => pointToLatLng(easting, northing, system));

    if (!withinNigeria(points)) {
      return unavailable("outside_nigeria");
    }

    debugInfo.method = "traverse";
    return available(points);
  }

  return unavailable("insufficient_coordinates");
}
