import proj4 from "proj4";

// Nigerian cadastral coordinates are almost never plain GPS lat/long -- they're
// Minna Datum Transverse Mercator eastings/northings in one of three 4-degree-wide
// belts. Definitions pulled verbatim from EPSG (epsg.io/26391, /26392, /26393) --
// don't hand-edit these, a wrong constant silently shifts every plotted point.
export type NigeriaBelt = "west" | "mid" | "east";

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

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

// Belts are officially defined by longitude (west of 6°30'E / between 6°30'E
// and 10°30'E / east of 10°30'E), not by state. States that straddle a
// boundary are assigned to whichever belt their capital/majority of territory
// falls in -- a practical approximation, not an official partition. If a plan's
// text explicitly names a belt, prefer that over this lookup.
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

export function beltForState(state: string): NigeriaBelt | null {
  const key = state.trim().toLowerCase();
  return STATE_BELT[key] ?? null;
}

export type LatLng = { lat: number; lng: number };

// Converts one Minna Datum easting/northing pair to WGS84 lat/lng for the
// given belt. Throws if proj4 can't parse the definition (shouldn't happen --
// these are fixed, verified strings above).
export function beaconToLatLng(easting: number, northing: number, belt: NigeriaBelt): LatLng {
  const [lng, lat] = proj4(BELT_PROJ4[belt], WGS84, [easting, northing]);
  return { lat, lng };
}
