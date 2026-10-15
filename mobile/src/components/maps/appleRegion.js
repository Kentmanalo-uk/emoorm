import { MINDORO_CENTER, PHILIPPINES_BOUNDS } from './mapUtils';

/*
 * Views for the Apple Maps versions of the maps (*.ios.js): a Leaflet-style
 * zoom level as a region, and keeping the view inside the Philippines (the
 * Leaflet maps' maxBounds: the furthest zoom-out shows the whole country).
 */

/** A region around [lat, lng] about as wide as Leaflet's view at `zoom`. */
export const regionAt = (lat, lng, zoom) => {
  const delta = 360 / 2 ** zoom;
  return {
    latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta,
  };
};

/** Oriental Mindoro, as the maps open with nothing pinned. */
export const mindoroRegion = () => regionAt(MINDORO_CENTER[0], MINDORO_CENTER[1], 9);

// Apple Maps limits zoom by the camera's distance from the ground, in metres:
// close enough for a street, no further out than the whole country.
export const PHILIPPINES_ZOOM_RANGE = { minCenterCoordinateDistance: 150, maxCenterCoordinateDistance: 3200000, animated: true };

const [[SOUTH, WEST], [NORTH, EAST]] = PHILIPPINES_BOUNDS;

/** The region moved back inside the Philippines, or null when it already is. */
export const keptInPhilippines = (region) => {
  if (!region) return null;
  const latitude = Math.min(NORTH, Math.max(SOUTH, region.latitude));
  const longitude = Math.min(EAST, Math.max(WEST, region.longitude));
  if (latitude === region.latitude && longitude === region.longitude) return null;
  return { ...region, latitude, longitude };
};
