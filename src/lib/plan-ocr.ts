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
  const debug = includeDebug
    ? { words, avgConfidence, rows: rows.map((r) => r.map((w) => w.text)), pairs }
    : undefined;

  if (avgConfidence !== null && avgConfidence < MIN_CONFIDENCE) {
    return { status: "unavailable", reason: "low_confidence", debug };
  }

  if (pairs.length < MIN_POINTS) {
    return { status: "unavailable", reason: "insufficient_coordinates", debug };
  }

  if (!withinPlausibleSpan(pairs)) {
    return { status: "unavailable", reason: "implausible_coordinates", debug };
  }

  const points = pairs.map(([easting, northing]) => beaconToLatLng(easting, northing, belt));

  if (!withinNigeria(points)) {
    return { status: "unavailable", reason: "outside_nigeria", debug };
  }

  return { status: "available", coordinates: points, debug };
}
