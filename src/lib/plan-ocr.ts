import { beaconToLatLng, beltForState, type LatLng, type NigeriaBelt } from "./nigeria-belts";

// Best-effort, fully automatic extraction of a plot's beacon coordinates from
// an uploaded survey plan, for the free pre-payment map preview. No human
// reviews this before it's shown -- so every step here is a chance to be
// silently wrong, and each one has a gate that fails closed into
// "unavailable" instead of guessing. A visitor seeing no preview is fine;
// a visitor seeing their land in the wrong place is not.

export type PlanOcrResult =
  | { status: "available"; coordinates: LatLng[] }
  | { status: "unavailable"; reason: string };

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

const COORD_PATTERN = /-?\d{4,7}\.\d{1,3}|-?\d{5,7}\b/g;

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch document (${res.status})`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

async function runVisionOcr(
  docUrl: string,
  apiKey: string,
): Promise<{ text: string; avgConfidence: number | null }> {
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
    return extractTextAndConfidence(pageResponse);
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
  return extractTextAndConfidence(data.responses?.[0]);
}

function extractTextAndConfidence(response: unknown): {
  text: string;
  avgConfidence: number | null;
} {
  const r = response as {
    fullTextAnnotation?: {
      text?: string;
      pages?: Array<{
        blocks?: Array<{
          paragraphs?: Array<{ words?: Array<{ confidence?: number }> }>;
        }>;
      }>;
    };
  };

  const text = r?.fullTextAnnotation?.text ?? "";

  const confidences: number[] = [];
  for (const page of r?.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          if (typeof word.confidence === "number") confidences.push(word.confidence);
        }
      }
    }
  }

  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;

  return { text, avgConfidence };
}

// Pulls candidate beacon coordinate pairs out of raw OCR text: any line with
// exactly two numbers in the expected magnitude range is treated as one
// (easting, northing) point, in that order -- the conventional column order
// on Nigerian cadastral plans. Lines with 0, 1, or 3+ matches are skipped as
// noise (page numbers, plan refs, scale notes) rather than guessed at.
function parseCoordinatePairs(text: string): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const line of text.split("\n")) {
    const matches = line.match(COORD_PATTERN);
    if (!matches || matches.length !== 2) continue;
    const [a, b] = matches.map(Number);
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
): Promise<PlanOcrResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return { status: "unavailable", reason: "not_configured" };
  }

  const belt: NigeriaBelt | null = beltForState(state);
  if (!belt) {
    return { status: "unavailable", reason: "unknown_belt" };
  }

  let text: string;
  let avgConfidence: number | null;
  try {
    ({ text, avgConfidence } = await runVisionOcr(docUrl, apiKey));
  } catch (err) {
    console.error("[plan-ocr] Vision API call failed:", err);
    return { status: "unavailable", reason: "ocr_failed" };
  }

  if (avgConfidence !== null && avgConfidence < MIN_CONFIDENCE) {
    return { status: "unavailable", reason: "low_confidence" };
  }

  const pairs = parseCoordinatePairs(text);
  if (pairs.length < MIN_POINTS) {
    return { status: "unavailable", reason: "insufficient_coordinates" };
  }

  if (!withinPlausibleSpan(pairs)) {
    return { status: "unavailable", reason: "implausible_coordinates" };
  }

  const points = pairs.map(([easting, northing]) => beaconToLatLng(easting, northing, belt));

  if (!withinNigeria(points)) {
    return { status: "unavailable", reason: "outside_nigeria" };
  }

  return { status: "available", coordinates: points };
}
