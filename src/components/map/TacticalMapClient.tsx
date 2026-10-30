'use client';

import { useEffect, useState } from 'react';
import L from 'leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { LocateFixed, Navigation } from 'lucide-react';
import type { TacticalMapProps, MapLocation } from './TacticalMap';
import { distanceMeters } from '@/lib/geo/distance';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './tactical-map.css';

const icon = (kind: string) => L.divIcon({ className: 'tactical-icon', html: `<span class="map-dot map-dot--${kind}"></span>`, iconSize: [24, 24], iconAnchor: [12, 12] });
const hunterIcon = icon('hunter');
const pingIcon = icon('ping');
const radarIcon = icon('radar');
const ownIcon = icon('own');

function VectorBasemap() {
  const map = useMap();
  useEffect(() => {
    setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    const layer = maplibreGL({ style: 'https://tiles.openfreemap.org/styles/dark' }).addTo(map);
    map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://openfreemap.org/">OpenFreeMap</a>');
    return () => { layer.remove(); };
  }, [map]);
  return null;
}

function Camera({ center, radius, own, following, setFollowing, recenter }: Pick<TacticalMapProps, 'center' | 'radius' | 'own'> & { following: boolean; setFollowing: (value: boolean) => void; recenter: number }) {
  const map = useMap();
  useMapEvents({ dragstart: () => setFollowing(false) });
  useEffect(() => { map.fitBounds(L.latLng(center.latitude, center.longitude).toBounds(radius * 2), { padding: [36, 36], animate: false }); }, [map, center.latitude, center.longitude, radius]);
  useEffect(() => { if (following && own) map.panTo([own.latitude, own.longitude], { animate: true }); }, [map, following, own, recenter]);
  return null;
}

function Markers({ items, type }: { items: MapLocation[]; type: 'hunter' | 'ping' | 'radar' }) {
  const marker = type === 'hunter' ? hunterIcon : type === 'ping' ? pingIcon : radarIcon;
  return items.map((item) => <Marker key={`${type}-${item.player_id}`} position={[item.lat, item.lng]} icon={marker}><Tooltip direction="top" offset={[0, -10]} permanent>{item.name} · {type === 'ping' ? 'PING' : type === 'radar' ? 'RADAR' : 'HUNTER'}{type !== 'ping' && Date.now() - Date.parse(item.updated_at) > 30000 ? ' · LAST KNOWN' : ''}<br /><span>{new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></Tooltip></Marker>);
}

export default function TacticalMapClient({ center, radius, own, hunters, pings, radar = [], radarActive = false }: TacticalMapProps) {
  const [following, setFollowing] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [outside, setOutside] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const distance = own ? distanceMeters(center, own) : 0;
  // Persist the previous boundary state to apply hysteresis between GPS fixes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!own) { setOutside(false); return; }
    // Hysteresis and reported accuracy avoid warnings flickering near the boundary.
    const tolerance = Math.max(10, Math.min(own.accuracy, 50));
    setOutside(previous => previous ? distance > radius - tolerance : distance > radius + tolerance);
  }, [distance, own, radius]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 10000); return () => window.clearInterval(timer); }, []);
  const stale = own && now - own.timestamp > 30000;
  const tileUrl = process.env.NEXT_PUBLIC_TILE_URL;
  const attribution = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  return <div className="tactical-map-wrap">
    <MapContainer center={[center.latitude, center.longitude]} zoom={15} zoomControl={true} className="tactical-map">
      {tileUrl ? <TileLayer url={tileUrl} attribution={attribution} /> : <VectorBasemap />}
      <Camera center={center} radius={radius} own={own} following={following} setFollowing={setFollowing} recenter={recenter} />
      <Circle center={[center.latitude, center.longitude]} radius={radius} pathOptions={{ color: outside ? '#ff493b' : '#ff6b55', weight: outside ? 4 : 2, opacity: .85, fillOpacity: .025, dashArray: '8 8' }} />
      {own && <><Circle center={[own.latitude, own.longitude]} radius={own.accuracy} pathOptions={{ color: '#3dbbff', weight: 1, opacity: .5, fillColor: '#3dbbff', fillOpacity: .1 }} /><Marker position={[own.latitude, own.longitude]} icon={ownIcon}><Tooltip direction="top" offset={[0, -10]}>YOU{stale ? ' · LAST KNOWN' : ''}</Tooltip></Marker></>}
      <Markers items={hunters} type="hunter" /><Markers items={pings} type="ping" /><Markers items={radar} type="radar" />
    </MapContainer>
    {radarActive && <div className="radar-sweep" aria-hidden="true" />}
    {outside && <div className="boundary-warning" role="alert">OUTSIDE PLAY AREA · approximately {Math.max(0, Math.round(distance - radius))} m beyond boundary</div>}
    {stale && <div className="gps-stale">GPS STALE · last position shown</div>}
    <div className="map-controls"><button type="button" aria-label="Recenter and follow my position" title="Recenter and follow" disabled={!own} onClick={() => { setFollowing(true); setRecenter(n => n + 1); }}><LocateFixed size={19} /></button><button type="button" aria-label={following ? 'Disable follow mode' : 'Enable follow mode'} aria-pressed={following} title="Toggle follow" disabled={!own} onClick={() => setFollowing(!following)}><Navigation size={18} fill={following ? 'currentColor' : 'none'} /></button></div>
  </div>;
}

