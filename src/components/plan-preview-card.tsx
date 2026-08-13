"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, MapsLoadError } from "@/lib/google-maps-loader";

type PreviewState =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "available"; coordinates: { lat: number; lng: number }[]; note: string | null }
  | { status: "unavailable"; reason: string | null; note: string | null };

const POLL_INTERVAL_MS = 2500;
// OCR on a large scan takes a few seconds; this bounds the wait at roughly
// two minutes. Without a cap, a row that never reaches a terminal state
// would have every open tab polling this endpoint forever.
const MAX_POLLS = 48;

const REASON_MESSAGES: Record<string, string> = {
  not_configured: "Map preview isn't available right now.",
  no_document: "Upload a survey plan to get a free map preview.",
  unknown_belt: "We couldn't work out which part of Nigeria this plan covers.",
  ocr_failed: "We couldn't read the uploaded document.",
  low_confidence: "The uploaded document wasn't clear enough to read automatically.",
  insufficient_coordinates: "We couldn't find plot coordinates on this document.",
  insufficient_legs:
    "We found where this plot starts, but couldn't read its boundary bearings clearly enough.",
  conflicting_labels:
    "We found where this plot starts, but some of its boundary measurements didn't add up consistently.",
  implausible_coordinates: "The coordinates we found didn't look right, so we're not showing them.",
  outside_nigeria: "The coordinates we found didn't check out, so we're not showing them.",
  traverse_did_not_close: "The plot boundary we calculated didn't add up, so we're not showing it.",
  area_mismatch: "The area we calculated didn't match what's on the plan, so we're not showing it.",
  too_many_legs: "This plan has more boundary points than we can automatically check.",
  unexpected_error: "Something went wrong while reading this plan.",
  timed_out: "This is taking longer than expected, so we've stopped waiting.",
  map_unavailable: "We read your plan fine, but the map couldn't load just now.",
};

const FALLBACK_MESSAGE =
  "We couldn't automatically read coordinates from this plan, so we can't show a map preview.";

function unavailableMessage(reason: string | null): string {
  const specific = reason ? REASON_MESSAGES[reason] : undefined;
  return `${specific ?? FALLBACK_MESSAGE} This doesn't affect your check — our team still reviews your documents directly.`;
}

export function PlanPreviewCard({ reportId }: { reportId: string }) {
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    let triggered = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/land-reports/${reportId}/preview`);
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "unavailable", reason: null, note: null });
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (data.status === "available") {
          setState({ status: "available", coordinates: data.coordinates, note: data.note ?? null });
          return;
        }
        if (data.status === "unavailable") {
          setState({ status: "unavailable", reason: data.reason ?? null, note: data.note ?? null });
          return;
        }

        // Nothing has run for this report yet -- kick it off. Reports
        // created outside the intake form (a re-check) never get triggered
        // otherwise, and the intake form's trigger is fire-and-forget so it
        // can be lost. Claiming the job is atomic server-side, so a
        // duplicate trigger is harmless.
        if (data.status === "not_attempted" && !triggered) {
          triggered = true;
          fetch(`/api/land-reports/${reportId}/preview`, { method: "POST" }).catch(() => {});
        }

        setState({ status: "processing" });

        polls += 1;
        if (polls >= MAX_POLLS) {
          setState({ status: "unavailable", reason: "timed_out", note: null });
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setState({ status: "unavailable", reason: null, note: null });
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reportId]);

  useEffect(() => {
    if (state.status !== "available" || !mapRef.current) return;
    let cancelled = false;

    const coordinates = state.coordinates;
    const note = state.note;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current) return;

        const bounds = new google.maps.LatLngBounds();
        coordinates.forEach((p) => bounds.extend(p));

        const map = new google.maps.Map(mapRef.current, {
          center: coordinates[0],
          zoom: 18,
          mapTypeId: "satellite",
          disableDefaultUI: true,
          zoomControl: true,
        });
        map.fitBounds(bounds, 40);

        new google.maps.Polygon({
          paths: coordinates,
          strokeColor: "#facc15",
          strokeWeight: 3,
          fillColor: "#facc15",
          fillOpacity: 0.25,
          map,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Only a genuinely missing key is "not configured" -- anything else
        // (a rejected key, a blocked script, a render error) is a map
        // problem, and reporting it as a config problem sent a previous
        // debugging session chasing the wrong thing entirely.
        const reason =
          err instanceof MapsLoadError && err.kind === "not_configured"
            ? "not_configured"
            : "map_unavailable";
        console.error("[plan-preview] map render failed:", err);
        setState({ status: "unavailable", reason, note });
      });

    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.status === "idle") return null;

  const note = state.status === "available" || state.status === "unavailable" ? state.note : null;

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Free plot preview</p>
        <p className="text-xs text-muted">
          Automatically generated from your survey plan — not part of your paid review.
        </p>
      </div>

      {note && (
        <p className="border-t border-border bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {note}
        </p>
      )}

      {state.status === "processing" && (
        <div className="flex h-56 items-center justify-center border-t border-border text-sm text-muted">
          Reading your survey plan...
        </div>
      )}

      {state.status === "unavailable" && (
        <div className="border-t border-border px-4 py-6 text-sm text-muted">
          {unavailableMessage(state.reason)}
        </div>
      )}

      {state.status === "available" && (
        <>
          <div ref={mapRef} className="h-56 w-full border-t border-border sm:h-72" />
          <p className="border-t border-border px-4 py-3 text-xs text-muted">
            Indicative position only. The outline is drawn from your plan&apos;s own
            coordinates, but satellite imagery and datum conversion each shift things
            by a few metres — treat it as roughly where the plot sits, not as a
            boundary you can build to.
          </p>
        </>
      )}
    </div>
  );
}
