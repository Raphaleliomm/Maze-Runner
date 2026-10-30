'use client';

import dynamic from 'next/dynamic';
import type { GeoPosition } from '@/hooks/useGeolocation';

export interface MapLocation {
  player_id: string;
  name: string;
  lat: number;
  lng: number;
  updated_at: string;
  accuracy?: number | null;
}
export interface TacticalMapProps {
  center: { latitude: number; longitude: number };
  radius: number;
  own: GeoPosition | null;
  hunters: MapLocation[];
  pings: MapLocation[];
  radar?: MapLocation[];
  radarActive?: boolean;
}

const Map = dynamic(() => import('./TacticalMapClient'), {
  ssr: false,
  loading: () => <div className="tactical-map-loading">Acquiring tactical map…</div>,
});
export default function TacticalMap(props: TacticalMapProps) { return <Map {...props} />; }
