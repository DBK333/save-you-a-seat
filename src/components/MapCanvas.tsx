import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Plus,
  Minus,
  LocateFixed,
  Layers,
  ArrowUpRight,
  MousePointer2,
} from "lucide-react";
import type { Coordinates, Facility } from "../domain/types";
import { config } from "../config";
import { AUSTRALIA_MAP_BOUNDS, isSupportedOrigin } from "../domain/coverage";
import "./map.css";
export interface MapCanvasProps {
  facilities: Facility[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  origin: Coordinates | null;
  onOriginChange: (coords: Coordinates) => void;
  pickOrigin: boolean;
  onPickOriginDone: () => void;
}
const centre = { lat: -37.8291, lng: 144.9948 };
const bounds = {
  north: -37.8235,
  south: -37.8343,
  west: 144.9878,
  east: 145.0035,
};
let mapsPromise: Promise<void> | undefined;
function loadGoogleMaps(): Promise<void> {
  if (typeof google !== "undefined" && google.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const callback = "__syasMapsReady";
    const target = window as unknown as Record<string, unknown>;
    target[callback] = () => {
      resolve();
      delete target[callback];
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: config.mapsKey,
      v: "weekly",
      loading: "async",
      callback,
      libraries: "marker",
      region: "AU",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      mapsPromise = undefined;
      delete target[callback];
      reject(new Error("Google Maps could not be loaded."));
    };
    target.gm_authFailure = () => {
      mapsPromise = undefined;
      reject(new Error("Google Maps could not authenticate this website."));
    };
    document.head.appendChild(script);
  });
  return mapsPromise;
}
function position(point: Coordinates) {
  return {
    left: `${((point.lng - bounds.west) / (bounds.east - bounds.west)) * 100}%`,
    top: `${((bounds.north - point.lat) / (bounds.north - bounds.south)) * 100}%`,
  };
}
export function MapCanvas(props: MapCanvasProps) {
  const {
    facilities,
    selectedId,
    onSelect,
    origin,
    onOriginChange,
    pickOrigin,
    onPickOriginDone,
  } = props;
  const mapElement = useRef<HTMLDivElement>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [originError, setOriginError] = useState("");
  function chooseOrigin(coords: Coordinates) {
    if (!isSupportedOrigin(coords)) {
      setOriginError(
        "Choose a starting point within our Melbourne coverage: Cremorne and University of Melbourne.",
      );
      return;
    }
    setOriginError("");
    latest.current.onOriginChange(coords);
    latest.current.onPickOriginDone();
  }
  useEffect(() => {
    if (!config.mapsKey || !mapElement.current) return;
    let active = true;
    let click: google.maps.MapsEventListener | undefined;
    const timeout = window.setTimeout(() => {
      if (active && !map.current)
        setError("Google Maps is taking too long to load.");
    }, 15000);
    loadGoogleMaps()
      .then(async () => {
        const { Map } = (await google.maps.importLibrary(
          "maps",
        )) as google.maps.MapsLibrary;
        await google.maps.importLibrary("marker");
        if (!active || !mapElement.current) return;
        map.current = new Map(mapElement.current, {
          center: centre,
          zoom: 16,
          mapId: config.mapId || "DEMO_MAP_ID",
          colorScheme: google.maps.ColorScheme.DARK,
          disableDefaultUI: true,
          zoomControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          restriction: {
            latLngBounds: AUSTRALIA_MAP_BOUNDS,
            strictBounds: true,
          },
        });
        click = map.current.addListener(
          "click",
          (event: google.maps.MapMouseEvent) => {
            if (latest.current.pickOrigin && event.latLng) {
              chooseOrigin(event.latLng.toJSON());
            }
          },
        );
        setReady(true);
        setError(null);
        window.clearTimeout(timeout);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      click?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    const markers = facilities.map((f) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = `syas-map-marker ${f.type === "meeting_room" ? "room" : "toilet"} ${selectedId === f.id ? "selected" : ""}`;
      node.setAttribute("aria-label", `Show ${f.name}`);
      node.textContent = f.type === "toilet" ? "WC" : "▦";
      node.addEventListener("click", () => onSelect(f.id));
      return new google.maps.marker.AdvancedMarkerElement({
        map: map.current,
        position: f.location,
        content: node,
        title: f.name,
        zIndex: selectedId === f.id ? 20 : 1,
      });
    });
    if (origin) {
      const node = document.createElement("div");
      node.className = "origin-marker";
      node.setAttribute("aria-label", "Selected starting point");
      markers.push(
        new google.maps.marker.AdvancedMarkerElement({
          map: map.current,
          position: origin,
          content: node,
          zIndex: 30,
        }),
      );
    }
    return () =>
      markers.forEach((marker) => {
        marker.map = null;
      });
  }, [ready, facilities, selectedId, onSelect, origin]);
  useEffect(() => {
    const selected = facilities.find((f) => f.id === selectedId);
    if (selected && map.current) map.current.panTo(selected.location);
  }, [selectedId, facilities]);
  function adjustZoom(change: number) {
    if (map.current)
      map.current.setZoom((map.current.getZoom() || 16) + change);
    else setZoom((z) => Math.max(1, Math.min(1.5, z + change * 0.1)));
  }
  function choosePreviewOrigin(event: React.MouseEvent<HTMLDivElement>) {
    if (!pickOrigin || !previewElement.current) return;
    const r = previewElement.current.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width,
      y = (event.clientY - r.top) / r.height;
    chooseOrigin({
      lat: bounds.north - y * (bounds.north - bounds.south),
      lng: bounds.west + x * (bounds.east - bounds.west),
    });
  }
  return (
    <section
      className={`map-canvas ${pickOrigin ? "picking" : ""}`}
      aria-label="Location map"
    >
      <div
        className="google-map-layer"
        ref={mapElement}
        aria-label="Google Maps"
      />
      {(!ready || error) && (
        <div
          className="map-preview"
          ref={previewElement}
          onClick={choosePreviewOrigin}
        >
          <div
            className="preview-cartography"
            style={{ transform: `scale(${zoom})` }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 1000 900" preserveAspectRatio="none">
              <defs>
                <pattern
                  id="blocks"
                  width="128"
                  height="109"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(-9)"
                >
                  <rect
                    x="9"
                    y="9"
                    width="104"
                    height="82"
                    rx="6"
                    fill="#25282b"
                    stroke="#35383a"
                  />
                  <path d="M21 24h80v50H21Z" fill="#292d2f" />
                  <path
                    d="M39 9v82M9 51h104"
                    stroke="#333638"
                    strokeWidth="2"
                  />
                </pattern>
              </defs>
              <rect width="1000" height="900" fill="#1d2225" />
              <rect width="1000" height="900" fill="url(#blocks)" />
              <path
                d="M-90 720Q290 630 450 715T1100 800L1100 970H-90Z"
                fill="#233c44"
              />
              <path
                d="M-90 705Q290 615 450 700T1100 785"
                stroke="#405348"
                strokeWidth="21"
                fill="none"
              />
              <path
                d="M-90 705Q290 615 450 700T1100 785"
                stroke="#5c6255"
                strokeWidth="2"
                strokeDasharray="5 5"
                fill="none"
              />
              <path
                d="M-20 157L1040 31M118-40L277 797M521-70L682 920M955-40L806 939M-20 507L1090 358"
                stroke="#444549"
                strokeWidth="24"
              />
              <path
                d="M-20 157L1040 31M118-40L277 797M521-70L682 920M955-40L806 939M-20 507L1090 358"
                stroke="#62605a"
                strokeWidth="2"
              />
              <path d="M60 49L1030 263" stroke="#484d51" strokeWidth="12" />
              <path
                d="M60 49L1030 263"
                stroke="#81827b"
                strokeWidth="2"
                strokeDasharray="5 5"
              />
              <path d="M38 577L156 557 177 665 59 689Z" fill="#35443a" />
              <path d="M710 531L789 520 780 655 730 640Z" fill="#33453a" />
            </svg>
            <span className="street swan">SWAN STREET</span>
            <span className="street balmain">BALMAIN STREET</span>
            <span className="street cremorne">CREMORNE STREET</span>
            <span className="street church">CHURCH STREET</span>
            <span className="area-label">
              CREMORNE<span>MELBOURNE</span>
            </span>
            <span className="river-label">Yarra River</span>
          </div>
          {facilities.map((f) => (
            <button
              key={f.id}
              className={`preview-pin ${f.type === "meeting_room" ? "room" : "toilet"} ${selectedId === f.id ? "selected" : ""}`}
              style={position(f.location)}
              aria-label={`Show ${f.name}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!pickOrigin) onSelect(f.id);
                else {
                  chooseOrigin(f.entranceLocation || f.location);
                }
              }}
            >
              <span>{f.type === "toilet" ? "WC" : "▦"}</span>
              {selectedId === f.id && (
                <span className="pin-label">{f.name}</span>
              )}
            </button>
          ))}
          {origin && (
            <div
              className="origin-marker preview-origin"
              style={position(origin)}
              title="Selected starting point"
            />
          )}
        </div>
      )}
      <div className="map-location-label">
        <span className="location-dot" />
        <span>Cremorne, Melbourne</span>
        <span className="map-location-tag">AUSTRALIA</span>
      </div>
      {pickOrigin && (
        <div className="map-pick-hint" role="status">
          <MousePointer2 size={17} /> Click a starting point{" "}
          {ready ? "on the map" : "on this illustrative preview"}
        </div>
      )}
      {pickOrigin && originError && (
        <div className="map-origin-error" role="alert">
          {originError}
        </div>
      )}
      {!ready && (
        <div className="map-connection-note">
          <div className="map-note-icon">
            <MapPin size={20} />
          </div>
          <div>
            <strong>
              {config.mapsKey
                ? error
                  ? "Map unavailable"
                  : "Connecting to Google Maps…"
                : "Your neighbourhood, at a glance"}
            </strong>
            <p>
              {error || "Illustrative preview · not for navigation."}{" "}
              {!config.mapsKey && "Google Maps is not connected yet."}
            </p>
          </div>
          <span className="preview-badge">
            {config.mapsKey ? "Map status" : "Preview"}
          </span>
        </div>
      )}
      <div className="map-controls">
        <button aria-label="Zoom in" onClick={() => adjustZoom(1)}>
          <Plus size={20} />
        </button>
        <button aria-label="Zoom out" onClick={() => adjustZoom(-1)}>
          <Minus size={20} />
        </button>
        <button
          aria-label="Recenter on Cremorne"
          onClick={() => {
            map.current?.panTo(centre);
            map.current?.setZoom(16);
            setZoom(1);
          }}
        >
          <LocateFixed size={19} />
        </button>
      </div>
      <div className="map-legend">
        <Layers size={15} />
        <span>
          <i className="legend-dot toilet" /> Toilets
        </span>
        <span>
          <i className="legend-dot room" /> Meeting rooms
        </span>
      </div>
      <a
        className="map-open-link"
        href="https://www.google.com/maps/search/?api=1&query=Cremorne%2C+Victoria%2C+Australia"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open area in Google Maps <ArrowUpRight size={13} />
      </a>
    </section>
  );
}
export default MapCanvas;
