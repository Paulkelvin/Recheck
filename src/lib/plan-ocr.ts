import { beaconToLatLng, beltForState, type LatLng, type NigeriaBelt } from "./nigeria-belts";

// Best-effort, fully automatic extraction of a plot's beacon coordinates from
// an uploaded survey plan, for the free pre-payment map preview. No human
// reviews this before it's shown -- so every step here is a chance to be
// silently wrong, and each one has a gate that fails closed into
// "unavailable" instead of guessing. A visitor seeing no preview is fine;
// a visitor seeing their land in the wrong place is not.

export type PlanOcrResult =
  | { status: "available"; coordinates: LatLng[]; debug?: OcrDebugInfo }
  | { status: "unavailable"; reason: string; debug?: OcrDebugInfo };

type OcrDebugInfo = {
  words: OcrWord[];
  avgConfidence: number | null;
  rows: string[][];
  pairs: Array<[number, number]>;
  method?: "table" | "traverse";
  legs?: Array<{ bearingDeg: number; distanceM: number }>;
  closureErrorM?: number;
};

const MIN_CONFIDENCE = 0.6;
const MIN_POINTS = 3;
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
const DISTANCE_PATTERN = /^(\d{1,4}(?:\.\d{1,3})?)m?$/i;
const MAX_BEARING_TOKEN_SPAN = 4;
// Closure tolerance: a real traverse should walk back to its starting
// point. Allow up to 1% of the total perimeter or 2m, whichever is more
// forgiving, to absorb ordinary OCR digit noise without accepting a
// traverse that clearly doesn't close.
const CLOSURE_TOLERANCE_RATIO = 0.01;
const CLOSURE_TOLERANCE_MIN_M = 2;

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
): Promise<{ words: OcrWord[]; avgConfidence: number | null }> {
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
  return extractWordsAndConfidence(data.responses?.[0]);
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
// widely-spaced table routinely puts one cell per "line" instead of one row
// per line. Row reconstruction below uses actual word geometry instead.
function extractWordsAndConfidence(response: unknown): {
  words: OcrWord[];
  avgConfidence: number | null;
} {
  const r = response as {
    fullTextAnnotation?: {
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

  return { words, avgConfidence };
}

// Groups words into table rows by vertical position instead of Vision's text
// line breaks: sort by Y, start a new row whenever the gap to the next word
// exceeds half a typical word's height, then sort each row left-to-right.
function groupIntoRows(words: OcrWord[]): OcrWord[][] {
  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.y - b.y);
  const medianHeight = sorted.map((w) => w.height).sort((a, b) => a - b)[
    Math.floor(sorted.length / 2)
  ];
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

// Within each reconstructed row, a numeric token is a candidate beacon
// coordinate. A row is only used if exactly two tokens in the whole row
// match the coordinate pattern -- extra numbers (a beacon label like "12",
// a third stray value) make the row ambiguous, so it's skipped rather than
// guessed at.
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

// Tries to read a bearing starting at row word index `start`, spanning up to
// MAX_BEARING_TOKEN_SPAN consecutive words concatenated together (OCR may
// split "N45°30'E" into several words at the symbol boundaries). Returns the
// whole-circle bearing and how many words it consumed, or null.
function matchBearingAt(rowTexts: string[], start: number): { bearingDeg: number; span: number } | null {
  for (let span = 1; span <= MAX_BEARING_TOKEN_SPAN && start + span <= rowTexts.length; span++) {
    const joined = rowTexts.slice(start, start + span).join("").replace(/\s+/g, "");

    const quadrant = joined.match(QUADRANT_BEARING);
    if (quadrant) {
      const angle = dmsToDecimalDegrees(quadrant[2], quadrant[3], quadrant[4]);
      const wcb = quadrantToWholeCircle(quadrant[1], angle, quadrant[5]);
      if (wcb !== null) return { bearingDeg: wcb, span };
    }

    const wholeCircle = joined.match(WHOLE_CIRCLE_BEARING);
    if (wholeCircle) {
      const wcb = dmsToDecimalDegrees(wholeCircle[1], wholeCircle[2], wholeCircle[3]);
      if (wcb >= 0 && wcb <= 360) return { bearingDeg: wcb, span };
    }
  }
  return null;
}

// A row is a usable traverse leg only if it has exactly one identifiable
// bearing and exactly one identifiable distance. A bare numeric label next
// to them (a beacon numbered "2", say) would make it ambiguous which number
// is the distance, so that's skipped rather than guessed at -- but an
// alphanumeric label like "PB1" isn't itself a candidate distance, so it's
// left alone.
function legFromRow(row: OcrWord[]): { bearingDeg: number; distanceM: number } | null {
  const texts = row.map((w) => w.text);
  const bareNumber = /^\d+(\.\d+)?$/;

  for (let i = 0; i < texts.length; i++) {
    const bearing = matchBearingAt(texts, i);
    if (!bearing) continue;

    const remaining = [...texts.slice(0, i), ...texts.slice(i + bearing.span)];
    const distanceMatches = remaining.filter((t) => DISTANCE_PATTERN.test(t));
    const otherNumeric = remaining.filter(
      (t) => !DISTANCE_PATTERN.test(t) && bareNumber.test(t),
    );
    if (otherNumeric.length > 0) continue;

    // A bare integer sitting next to a decimal number is almost always a
    // beacon label ("1", "2", ...) rather than the distance -- real
    // traverse distances are conventionally recorded to decimal precision.
    // Only fall back to a bare integer as the distance when it's the only
    // number left.
    const decimalDistances = distanceMatches.filter((t) => t.includes("."));
    const candidates = decimalDistances.length > 0 ? decimalDistances : distanceMatches;

    if (candidates.length === 1) {
      const distanceM = Number(candidates[0].replace(/m$/i, ""));
      if (Number.isFinite(distanceM) && distanceM > 0) {
        return { bearingDeg: bearing.bearingDeg, distanceM };
      }
    }
  }
  return null;
}

function parseLegs(rows: OcrWord[][]): Array<{ bearingDeg: number; distanceM: number }> {
  const legs: Array<{ bearingDeg: number; distanceM: number }> = [];
  for (const row of rows) {
    const leg = legFromRow(row);
    if (leg) legs.push(leg);
  }
  return legs;
}

// Walks a traverse from a starting easting/northing through each leg's
// bearing and distance. Returns every vertex including a final "closing"
// point computed from the last leg -- that closing point should land back
// on the start; how far off it lands is the closure error checked below.
function walkTraverse(
  start: [number, number],
  legs: Array<{ bearingDeg: number; distanceM: number }>,
): Array<[number, number]> {
  const points: Array<[number, number]> = [start];
  for (const leg of legs) {
    const [easting, northing] = points[points.length - 1];
    const rad = (leg.bearingDeg * Math.PI) / 180;
    points.push([easting + leg.distanceM * Math.sin(rad), northing + leg.distanceM * Math.cos(rad)]);
  }
  return points;
}

function closureErrorMeters(
  start: [number, number],
  closingPoint: [number, number],
): number {
  return Math.hypot(closingPoint[0] - start[0], closingPoint[1] - start[1]);
}

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

export async function extractPlanPreview(
  docUrl: string,
  state: string,
  includeDebug = false,
): Promise<PlanOcrResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return { status: "unavailable", reason: "not_configured" };
  }

  const belt: NigeriaBelt | null = beltForState(state);
  if (!belt) {
    return { status: "unavailable", reason: "unknown_belt" };
  }

  let words: OcrWord[];
  let avgConfidence: number | null;
  try {
    ({ words, avgConfidence } = await runVisionOcr(docUrl, apiKey));
  } catch (err) {
    console.error("[plan-ocr] Vision API call failed:", err);
    return { status: "unavailable", reason: "ocr_failed" };
  }

  const rows = groupIntoRows(words);
  const pairs = pairsFromRows(rows);
  // Always fully populated internally; only decided whether to expose at
  // each return via `includeDebug ? debugInfo : undefined`, so its shape
  // never has to be reasoned about as partial.
  const debugInfo: OcrDebugInfo = {
    words,
    avgConfidence,
    rows: rows.map((r) => r.map((w) => w.text)),
    pairs,
  };
  const debug = () => (includeDebug ? debugInfo : undefined);

  if (avgConfidence !== null && avgConfidence < MIN_CONFIDENCE) {
    return { status: "unavailable", reason: "low_confidence", debug: debug() };
  }

  // Path A: a full beacon coordinate table (every corner's Easting/Northing
  // listed directly) -- the simpler, more reliable case when it's there.
  if (pairs.length >= MIN_POINTS) {
    if (!withinPlausibleSpan(pairs)) {
      return { status: "unavailable", reason: "implausible_coordinates", debug: debug() };
    }

    const points = pairs.map(([easting, northing]) => beaconToLatLng(easting, northing, belt));

    if (!withinNigeria(points)) {
      return { status: "unavailable", reason: "outside_nigeria", debug: debug() };
    }

    debugInfo.method = "table";
    return { status: "available", coordinates: points, debug: debug() };
  }

  // Path B: one starting beacon's coordinate plus a bearing/distance
  // traverse for the rest -- the more common real-world case. Only attempt
  // this when exactly one coordinate-shaped row was found; two or more
  // without reaching MIN_POINTS is ambiguous (a broken table, not a clean
  // single start point) and isn't worth guessing at.
  if (pairs.length === 1) {
    const legs = parseLegs(rows);
    debugInfo.legs = legs;

    if (legs.length < MIN_POINTS) {
      return { status: "unavailable", reason: "insufficient_coordinates", debug: debug() };
    }

    const traverse = walkTraverse(pairs[0], legs);
    const vertices = traverse.slice(0, -1); // exclude the computed closing point
    const closingPoint = traverse[traverse.length - 1];
    const closureError = closureErrorMeters(pairs[0], closingPoint);
    const perimeter = legs.reduce((sum, l) => sum + l.distanceM, 0);
    const tolerance = Math.max(CLOSURE_TOLERANCE_MIN_M, perimeter * CLOSURE_TOLERANCE_RATIO);
    debugInfo.closureErrorM = closureError;

    if (closureError > tolerance) {
      return { status: "unavailable", reason: "traverse_did_not_close", debug: debug() };
    }

    if (!withinPlausibleSpan(vertices as Array<[number, number]>)) {
      return { status: "unavailable", reason: "implausible_coordinates", debug: debug() };
    }

    const points = vertices.map(([easting, northing]) => beaconToLatLng(easting, northing, belt));

    if (!withinNigeria(points)) {
      return { status: "unavailable", reason: "outside_nigeria", debug: debug() };
    }

    debugInfo.method = "traverse";
    return { status: "available", coordinates: points, debug: debug() };
  }

  return { status: "unavailable", reason: "insufficient_coordinates", debug: debug() };
}
