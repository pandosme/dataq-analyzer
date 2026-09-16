/**
 * Filter logic for WebSocket path event broadcasting
 * Applies client-specified filters to determine if an event should be sent
 */

/**
 * Check if a path event matches client-specified filters
 * @param {Object} pathEvent - Path event data
 * @param {Object} filters - Client filters
 * @param {Array<string>} filters.classes - Allowed object classes
 * @param {number} filters.minAge - Minimum age in seconds
 * @param {number} filters.minDistance - Minimum distance in pixels
 * @param {number} filters.minDwell - Minimum dwell time in seconds
 * @returns {boolean} True if event matches all filters
 */
export function matchesFilters(pathEvent, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return true; // No filters means accept all
  }

  // Filter by object class
  if (filters.classes && filters.classes.length > 0) {
    if (!filters.classes.includes(pathEvent.class)) {
      return false;
    }
  }

  // Filter by minimum age (in seconds)
  if (filters.minAge !== undefined && filters.minAge !== null) {
    if (!pathEvent.age || pathEvent.age < filters.minAge) {
      return false;
    }
  }

  // Filter by minimum distance (pixels)
  // Calculate distance as sqrt(dx^2 + dy^2)
  if (filters.minDistance !== undefined && filters.minDistance !== null) {
    if (pathEvent.dx === undefined || pathEvent.dy === undefined) {
      return false; // No displacement data
    }
    const distance = Math.sqrt(pathEvent.dx * pathEvent.dx + pathEvent.dy * pathEvent.dy);
    if (distance < filters.minDistance) {
      return false;
    }
  }

  // Filter by minimum dwell time (in seconds)
  if (filters.minDwell !== undefined && filters.minDwell !== null) {
    if (!pathEvent.dwell || pathEvent.dwell < filters.minDwell) {
      return false;
    }
  }

  return true;
}

export default {
  matchesFilters,
};
