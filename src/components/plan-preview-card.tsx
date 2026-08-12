"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

type PreviewState =
  | { status: "not_attempted" | "processing" }
  | { status: "available"; coordinates: { lat: number; lng: number }[] }
  | { status: "unavailable"; reason: string | null };

const REASON_MESSAGES: Record<string, string> = {
  not_configured: "Map preview isn't available right now.",
  no_document: "Upload a survey plan to get a free map preview.",
  unknown_belt: "We couldn't place this state on the survey grid.",
  ocr_failed: "We couldn't read the uploaded document.",
  low_confidence: "The uploaded document wasn't clear enough to read automatically.",
  insufficient_coordinates: "We couldn't find plot coordinates on this document.",
  implausible_coordinates: "The coordinates we found didn't look right, so we're not showing them.",
  outside_nigeria: "The coordinates we found didn't check out, so we're not showing them.",
};

function unavailableMessage(reason: string | null): string {
  if (reason && REASON_MESSAGES[reason]) return REASON_MESSAGES[reason];
  return "We couldn't automatically read coordinates from this plan, so we can't show a map preview. This doesn't affect your check — our team still reviews your documents directly.";
}

export function PlanPreviewCard({ reportId }: { reportId: string }) {
  const [state, setState] = useState<PreviewState>({ status: "not_attempted" });
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/land-reports/${reportId}/preview`);
        if (!res.ok || cancelled) return;
        const data = await res.json();

        if (cancelled) return;

        if (data.status === "available") {
          setState({ status: "available", coordinates: data.coordinates });
        } else if (data.status === "unavailable") {
          setState({ status: "unavailable", reason: data.reason ?? null });
        } else {
          setState({ status: data.status });
          timer = setTimeout(poll, 2500);
        }
      } catch {
        if (!cancelled) setState({ status: "unavailable", reason: null });
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

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || state.status !== "available") return;

        const bounds = new google.maps.LatLngBounds();
        state.coordinates.forEach((p) => bounds.extend(p));

        const map = new google.maps.Map(mapRef.current, {
          center: state.coordinates[0],
          zoom: 18,
          mapTypeId: "satellite",
          disableDefaultUI: true,
          zoomControl: true,
        });
        map.fitBounds(bounds, 40);

        new google.maps.Polygon({
          paths: state.coordinates,
          strokeColor: "#facc15",
          strokeWeight: 3,
          fillColor: "#facc15",
          fillOpacity: 0.25,
          map,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unavailable", reason: "not_configured" });
      });

    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.status === "not_attempted") return null;

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Free plot preview</p>
        <p className="text-xs text-muted">
          Automatically generated from your survey plan — not part of your paid review.
        </p>
      </div>

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
        <div ref={mapRef} className="h-56 w-full border-t border-border sm:h-72" />
      )}
    </div>
  );
}
