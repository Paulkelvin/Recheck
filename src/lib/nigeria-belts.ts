import proj4 from "proj4";

// Nigerian cadastral coordinates are almost never plain GPS lat/long.
// Real plans use one of two systems, and which one is in force is stated
// on the plan itself (e.g. "ORIGIN:- U.T.M. (ZONE 31)") -- it should never
// be inferred purely from which state the buyer typed into a form.
// Product requirement, not just current reality: every system this app
// understands MUST be Minna datum (Clarke 1880 modified ellipsoid,
// a=6378249.145 rf=293.465 -- see BELT_PROJ4/UTM_PROJ4 below). Nigerian
// cadastral plans are overwhelmingly still surveyed and drawn on Minna,
// even when their coordinate labels don't say so explicitly. If a plan is
// ever found stating a different datum (WGS84, e.g. from a GPS-based
// survey), that is a decision for a human to make deliberately -- add a
// new ProjectionSystem variant with its own explicit datum handling, don't
// fold it into the existing Minna-only path or infer it silently.
export type NigeriaBelt = "west" | "mid" | "east";
export type UtmZone = 31 | 32;
export type ProjectionSystem =
  | { type: "belt"; belt: NigeriaBelt }
  | { type: "utm"; zone: UtmZone };

// Projection definitions pulled verbatim from EPSG (epsg.io/26391, /26392,
// /26393, /26331, /26332), minus the datum shift, which is chosen per-point
// below. Don't hand-edit these constants -- a wrong digit silently moves
// every plotted point.
const BELT_PROJ4: Record<NigeriaBelt, string> = {
  // EPSG:26391 -- Minna / Nigeria West Belt
  west:
    "+proj=tmerc +lat_0=4 +lon_0=4.5 +k=0.99975 +x_0=230738.26 +y_0=0 +a=6378249.145 +rf=293.465 +units=m +no_defs",
  // EPSG:26392 -- Minna / Nigeria Mid Belt
  mid:
    "+proj=tmerc +lat_0=4 +lon_0=8.5 +k=0.99975 +x_0=670553.98 +y_0=0 +a=6378249.145 +rf=293.465 +units=m +no_defs",
  // EPSG:26393 -- Minna / Nigeria East Belt
  east:
    "+proj=tmerc +lat_0=4 +lon_0=12.5 +k=0.99975 +x_0=1110369.7 +y_0=0 +a=6378249.145 +rf=293.465 +units=m +no_defs",
};

const UTM_PROJ4: Record<UtmZone, string> = {
  // EPSG:26331 -- Minna / UTM zone 31N (common on Lagos/Ogun-area plans)
  31: "+proj=utm +zone=31 +a=6378249.145 +rf=293.465 +units=m +no_defs",
  // EPSG:26332 -- Minna / UTM zone 32N
  32: "+proj=utm +zone=32 +a=6378249.145 +rf=293.465 +units=m +no_defs",
};

// Getting from Minna to WGS84 needs a datum shift, and the choice is worth
// real metres on the ground -- these two place the same point 10.2m apart,
// so it is not a detail.
//
// EPSG:1822 is the nationwide 3-parameter shift (~10m, all of Nigeria).
// EPSG:1534 is a 7-parameter Position Vector transformation fitted
// specifically to Nigeria onshore south -- which is where Lagos, Ogun and
// most of the country's land dealing actually is. Measured against both
// sample plans, the southern fit and the nationwide fit disagree by 10.2m,
// so the region-specific one is used wherever it applies and the nationwide
// one only outside its area of validity.
const SHIFT_NATIONWIDE = "-92,-93,122,0,0,0,0";
const SHIFT_ONSHORE_SOUTH = "-111.92,-87.85,114.5,1.875,0.202,0.219,0.032";
// Northern edge of EPSG:1534's area of use, approximated by latitude. The
// two shifts differ by ~10m, nowhere near enough to make a point near this
// boundary fall on the wrong side of it.
const ONSHORE_SOUTH_MAX_LAT = 9;

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

function definitionFor(system: ProjectionSystem, shift: string): string {
  const base = system.type === "belt" ? BELT_PROJ4[system.belt] : UTM_PROJ4[system.zone];
  return `${base} +towgs84=${shift}`;
}

// Belts are officially defined by longitude (west of 6°30'E / between 6°30'E
// and 10°30'E / east of 10°30'E), not by state. States that straddle a
// boundary are assigned to whichever belt their capital/majority of territory
// falls in -- a practical approximation, not an official partition. This is
// a last-resort fallback only, used when the plan doesn't state its own
// origin -- see detectProjectionFromText in plan-ocr.ts, which is preferred.
const STATE_BELT: Record<string, NigeriaBelt> = {
  lagos: "west",
  ogun: "west",
  oyo: "west",
  osun: "west",
  ekiti: "west",
  ondo: "west",
  kwara: "west",
  sokoto: "west",
  kebbi: "west",
  edo: "west",
  bayelsa: "west",
  kogi: "mid",
  niger: "mid",
  fct: "mid",
  abuja: "mid",
  nasarawa: "mid",
  plateau: "mid",
  benue: "mid",
  bauchi: "mid",
  jigawa: "mid",
  kano: "mid",
  katsina: "mid",
  kaduna: "mid",
  zamfara: "mid",
  delta: "mid",
  anambra: "mid",
  enugu: "mid",
  ebonyi: "mid",
  imo: "mid",
  abia: "mid",
  rivers: "mid",
  "cross river": "mid",
  "akwa ibom": "mid",
  taraba: "east",
  adamawa: "east",
  gombe: "east",
  borno: "east",
  yobe: "east",
};

// Longest names first so a multi-word state ("cross river") is matched
// before any shorter name that might overlap it.
const STATE_NAMES_BY_SPECIFICITY = Object.keys(STATE_BELT).sort((a, b) => b.length - a.length);

export function beltForState(state: string): NigeriaBelt | null {
  const key = state.trim().toLowerCase();
  return STATE_BELT[key] ?? null;
}

// Finds which Nigerian state a plan's own text says it's in. Preferred over
// the buyer-typed form field -- the form is free text a buyer can fumble,
// the plan is the document of record. Word-boundary matched so "NIGER"
// doesn't match inside "NIGERIA".
export function findStateInText(text: string): string | null {
  const upper = text.toUpperCase();
  return (
    STATE_NAMES_BY_SPECIFICITY.find((name) =>
      new RegExp(`\\b${name.toUpperCase()}\\b`).test(upper),
    ) ?? null
  );
}

export type LatLng = { lat: number; lng: number };

// Converts one Nigerian cadastral easting/northing pair to WGS84 lat/lng.
// Runs the nationwide shift first purely to find out which region the point
// falls in, then redoes it with the southern fit when that one applies.
export function pointToLatLng(easting: number, northing: number, system: ProjectionSystem): LatLng {
  const [lng, lat] = proj4(definitionFor(system, SHIFT_NATIONWIDE), WGS84, [easting, northing]);
  if (lat >= ONSHORE_SOUTH_MAX_LAT) return { lat, lng };

  const [southLng, southLat] = proj4(definitionFor(system, SHIFT_ONSHORE_SOUTH), WGS84, [
    easting,
    northing,
  ]);
  return { lat: southLat, lng: southLng };
}
