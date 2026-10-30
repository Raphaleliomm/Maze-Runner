'use client';

import { useCallback, useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export type GeoStatus = 'disabled' | 'locating' | 'ready' | 'error';

/** A foreground-only watch. Disabling it immediately clears the browser watch and position. */
export function useGeolocation(enabled: boolean, background = false) {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GeoStatus>('disabled');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Synchronize the browser's external geolocation subscription with consent.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!enabled) {
      setPosition(null);
      setError(null);
      setStatus('disabled');
      return;
    }
    const nativeBackground = background && Capacitor.isNativePlatform();
    if (!nativeBackground && !('geolocation' in navigator)) {
      setError('This browser does not support location.');
      setStatus('error');
      return;
    }
    setStatus('locating');
    setError(null);
    let active = true;
    if (nativeBackground) {
      const tracker = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
      let watcherId: string | undefined;
      void tracker.addWatcher({ backgroundTitle: 'Maze-Runner', backgroundMessage: 'Dein Standort wird während der laufenden Runde geteilt.', requestPermissions: true, stale: false, distanceFilter: 5 }, (result, failure) => {
        if (!active) return;
        if (failure) { setError(failure.message || 'Standort nicht verfügbar.'); setStatus('error'); return; }
        if (!result) return;
        setPosition({ latitude: result.latitude, longitude: result.longitude, accuracy: result.accuracy, timestamp: result.time ?? Date.now() });
        setError(null); setStatus('ready');
      }).then(id => { watcherId = id; if (!active) void tracker.removeWatcher({ id }); }).catch(failure => { if (active) { setError(failure instanceof Error ? failure.message : 'Standort nicht verfügbar.'); setStatus('error'); } });
      return () => { active = false; if (watcherId) void tracker.removeWatcher({ id: watcherId }); };
    }
    const watch = navigator.geolocation.watchPosition(
      (result) => {
        if (!active) return;
        setPosition({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy, timestamp: result.timestamp });
        setError(null);
        setStatus('ready');
      },
      (failure) => {
        if (!active) return;
        setError(failure.code === 1 ? 'Location permission was denied. Enable it in your browser settings and try again.' : failure.code === 2 ? 'Location is unavailable. Move outdoors or check your device settings.' : 'Location timed out. Check your signal and try again.');
        setStatus('error');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => { active = false; navigator.geolocation.clearWatch(watch); };
  }, [enabled, attempt, background]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { position: enabled ? position : null, error: enabled ? error : null, status: enabled ? status : 'disabled' as GeoStatus, retry };
}
