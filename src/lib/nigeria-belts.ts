import proj4 from "proj4";

// Nigerian cadastral coordinates are almost never plain GPS lat/long.
// Real plans use one of two systems, and which one is in force is stated
// on the plan itself (e.g. "ORIGIN:- U.T.M. (ZONE 31)") -- it should never
// be inferred purely from which state the buyer typed into a form.
export type NigeriaBelt = "west" | "mid" | "east";
export type UtmZone = 31 | 32;
export type ProjectionSystem =
  | { type: "belt"; belt: NigeriaBelt }
  | { type: "utm"; zone: UtmZone };

// Definitions pulled verbatim from EPSG (epsg.io/26391, /26392, /26393,
// /26331, /26332) -- don't hand-edit these, a wrong constant silently
// shifts every plotted point.
const BELT_PROJ4: Record<NigeriaBelt, string> = {
  // EPSG:26391 -- Minna / Nigeria West Belt
  west:
    "+proj=tmerc +lat_0=4 +lon_0=4.5 +k=0.99975 +x_0=230738.26 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs +type=crs",
  // EPSG:26392 -- Minna / Nigeria Mid Belt
  mid:
    "+proj=tmerc +lat_0=4 +lon_0=8.5 +k=0.99975 +x_0=670553.98 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs +type=crs",
  // EPSG:26393 -- Minna / Nigeria East Belt
  east:
    "+proj=tmerc +lat_0=4 +lon_0=12.5 +k=0.99975 +x_0=1110369.7 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs +type=crs",
};

const UTM_PROJ4: Record<UtmZone, string> = {
  // EPSG:26331 -- Minna / UTM zone 31N (common on Lagos-area plans)
  31: "+proj=utm +zone=31 +a=6378249.145 +rf=293.465 +towgs84=-93.6,-83.7,113.8,0,0,0,0 +units=m +no_defs +type=crs",
  // EPSG:26332 -- Minna / UTM zone 32N
  32: "+proj=utm +zone=32 +a=6378249.145 +rf=293.465 +towgs84=-93.6,-83.7,113.8,0,0,0,0 +units=m +no_defs +type=crs",
};

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

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

// Every Nigerian state name (+ FCT), for scanning a plan's own OCR text to
// find which state it says it's in -- preferred over the buyer-typed form
// field, since the form is free text and the plan is the source of truth.
export const NIGERIA_STATE_NAMES = [...Object.keys(STATE_BELT), "fct", "abuja"];

export function beltForState(state: string): NigeriaBelt | null {
  const key = state.trim().toLowerCase();
  return STATE_BELT[key] ?? null;
}

export type LatLng = { lat: number; lng: number };

// Converts one Nigerian cadastral easting/northing pair to WGS84 lat/lng.
// Throws if proj4 can't parse the definition (shouldn't happen -- these are
// fixed, verified strings above).
export function pointToLatLng(easting: number, northing: number, system: ProjectionSystem): LatLng {
  const def = system.type === "belt" ? BELT_PROJ4[system.belt] : UTM_PROJ4[system.zone];
  const [lng, lat] = proj4(def, WGS84, [easting, northing]);
  return { lat, lng };
}
