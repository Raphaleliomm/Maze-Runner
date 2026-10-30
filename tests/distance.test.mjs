import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters } from '../src/lib/geo/distance.ts';

test('distance is zero for the same point', () => {
  const berlin = { latitude: 52.52, longitude: 13.405 };
  assert.equal(distanceMeters(berlin, berlin), 0);
});
test('one degree at the equator is approximately 111.2 km', () => {
  assert.ok(Math.abs(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111195) < 20);
});
test('distance handles antimeridian and is symmetric', () => {
  const a = { latitude: 0, longitude: 179.999 }, b = { latitude: 0, longitude: -179.999 };
  assert.ok(Math.abs(distanceMeters(a, b) - 222.4) < 1);
  assert.ok(Math.abs(distanceMeters(a, b) - distanceMeters(b, a)) < 1e-9);
});
test('short north-south movement is measured in metres', () => {
  const a = { latitude: 52, longitude: 13 }, b = { latitude: 52.0001, longitude: 13 };
  assert.ok(Math.abs(distanceMeters(a, b) - 11.12) < 0.1);
});
