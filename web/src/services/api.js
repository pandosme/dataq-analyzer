import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      window.dispatchEvent(new Event('auth-expired'));
    }
    return Promise.reject(error);
  }
);

const getApi = () => api;

export const appInfoAPI = {
  get: async () => {
    const response = await api.get('/info');
    return response.data;
  },
};

// Cameras API
export const camerasAPI = {
  getAll: async (enabledOnly = false, includeStats = false, includeArchived = false) => {
    const response = await getApi().get('/cameras', {
      params: { enabled: enabledOnly, stats: includeStats, archived: includeArchived },
    });
    return response.data;
  },

  getById: async (id) => {
    const response = await getApi().get(`/cameras/${id}`);
    return response.data;
  },

  getSnapshot: async (serialNumber) => {
    const response = await getApi().get(`/cameras/${serialNumber}/snapshot`);
    return response.data;
  },

  update: async (id, data) => {
    const response = await getApi().put(`/cameras/${id}`, data);
    return response.data;
  },

  // Permanently removes the device and every path/occupancy event it recorded.
  removePermanently: async (id) => {
    const response = await getApi().delete(`/cameras/${id}/permanent`);
    return response.data;
  },
};

// Path Events API
export const pathsAPI = {
  query: async (filters) => {
    // Build MongoDB query object from frontend filters
    const mongoQuery = {};
    const options = {
      sort: { timestamp: -1 },
    };

    // REQUIRED: serial (camera serial number)
    if (filters.serial) {
      mongoQuery.serial = filters.serial;
    }

    // REQUIRED: timestamp range (from/to converted to $gte/$lte)
    // Timestamps are stored as EPOCH milliseconds in the database
    if (filters.from || filters.to) {
      mongoQuery.timestamp = {};
      if (filters.from) {
        mongoQuery.timestamp.$gte = new Date(filters.from).getTime();
      }
      if (filters.to) {
        mongoQuery.timestamp.$lte = new Date(filters.to).getTime();
      }
    }

    // OPTIONAL: class (exact match or array for $in, null/empty means all)
    if (filters.class) {
      mongoQuery.class = Array.isArray(filters.class) ? { $in: filters.class } : filters.class;
    }

    // OPTIONAL: minDwell (dwell >= minDwell) — kept for backward compat
    // Skip when 0: $gte:0 is a no-op that excludes documents missing the field
    if (filters.minDwell !== undefined && filters.minDwell !== null && filters.minDwell !== '' && parseFloat(filters.minDwell) > 0) {
      mongoQuery.dwell = { $gte: parseFloat(filters.minDwell) };
    }

    // OPTIONAL: minIdle constrains individual points within path[] (d is the
    // per-point idle time) — a document only qualifies if it has at least one
    // point that idled >= minIdle.
    const pathElemMatch = {};

    // Skip when 0: $gte:0 is a no-op that excludes documents missing the field
    if (filters.minIdle !== undefined && filters.minIdle !== null && filters.minIdle !== '' && parseFloat(filters.minIdle) > 0) {
      pathElemMatch.d = { $gte: parseFloat(filters.minIdle) };
    }

    if (Object.keys(pathElemMatch).length > 0) {
      mongoQuery.path = { $elemMatch: pathElemMatch };
    }

    // OPTIONAL: minAge (age >= minAge)
    // Skip when 0: $gte:0 is a no-op that excludes documents missing the field
    if (filters.minAge !== undefined && filters.minAge !== null && filters.minAge !== '' && parseFloat(filters.minAge) > 0) {
      mongoQuery.age = { $gte: parseFloat(filters.minAge) };
    }

    // OPTIONAL: direction filters (dy/dx)
    // dy < 0 means object moved up in the frame
    if (filters.dy !== undefined && filters.dy !== null) {
      if (filters.dy === 'up') {
        mongoQuery.dy = { $lt: 0 };
      } else if (filters.dy === 'down') {
        mongoQuery.dy = { $gt: 0 };
      } else if (typeof filters.dy === 'object') {
        mongoQuery.dy = filters.dy; // Allow direct operator objects
      }
    }

    // dx < 0 means object moved left in the frame
    if (filters.dx !== undefined && filters.dx !== null) {
      if (filters.dx === 'left') {
        mongoQuery.dx = { $lt: 0 };
      } else if (filters.dx === 'right') {
        mongoQuery.dx = { $gt: 0 };
      } else if (typeof filters.dx === 'object') {
        mongoQuery.dx = filters.dx; // Allow direct operator objects
      }
    }

    // OPTIONAL: color (exact match, null/empty means all)
    if (filters.color) {
      mongoQuery.color = filters.color;
    }

    // OPTIONAL: color2 (exact match, null/empty means all)
    if (filters.color2) {
      mongoQuery.color2 = filters.color2;
    }

    if (filters.anomalyOnly) {
      mongoQuery.anomaly = true;
    }

    const areaExpressions = [];
    const addAreaExpression = (area, pointIndex) => {
      if (!area) return;
      const minX = Math.min(area.x1, area.x2);
      const maxX = Math.max(area.x1, area.x2);
      const minY = Math.min(area.y1, area.y2);
      const maxY = Math.max(area.y1, area.y2);
      areaExpressions.push({
        $and: [
          { $gte: [{ $arrayElemAt: ['$path.x', pointIndex] }, minX] },
          { $lte: [{ $arrayElemAt: ['$path.x', pointIndex] }, maxX] },
          { $gte: [{ $arrayElemAt: ['$path.y', pointIndex] }, minY] },
          { $lte: [{ $arrayElemAt: ['$path.y', pointIndex] }, maxY] },
        ],
      });
    };

    addAreaExpression(filters.entryArea, 0);
    addAreaExpression(filters.exitArea, -1);
    if (areaExpressions.length > 0) {
      mongoQuery.$expr = areaExpressions.length === 1
        ? areaExpressions[0]
        : { $and: areaExpressions };
    }

    // OPTIONAL: minDistance (calculated distance >= minDistance)
    // Note: Distance filtering requires aggregation pipeline, not simple query
    // This would need to be implemented on the backend with $expr
    if (filters.minDistance !== undefined && filters.minDistance !== null && filters.minDistance !== '') {
      // For now, log warning - this requires backend aggregation support
      console.warn('minDistance filter requires backend aggregation support - not yet implemented');
    }

    // Options: limit
    if (filters.limit !== undefined && filters.limit !== null) {
      options.limit = parseInt(filters.limit, 10);
    }

    // Options: skip (pagination)
    if (filters.skip !== undefined && filters.skip !== null) {
      options.skip = parseInt(filters.skip, 10);
    }

    const response = await getApi().post('/paths/query', {
      query: mongoQuery,
      options: options,
    });
    return response.data;
  },

  getById: async (id) => {
    const response = await getApi().get(`/paths/${id}`);
    return response.data;
  },

  getStats: async (serialNumber, filters) => {
    const response = await getApi().get(`/paths/stats/${serialNumber}`, {
      params: filters,
    });
    return response.data;
  },
};

export const occupancyAPI = {
  getAreas: async (serial) => {
    const response = await getApi().get('/occupancy/areas', { params: { serial } });
    return response.data;
  },

  getSeries: async ({ serial, area, range, to }) => {
    const response = await getApi().get('/occupancy/series', {
      params: { serial, area, range, to },
    });
    return response.data;
  },
};

// Authentication API
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  // Get current user
  me: async () => {
    const response = await getApi().get('/auth/me');
    return response.data;
  },
};

export const usersAPI = {
  list: async () => {
    const response = await getApi().get('/auth/users');
    return response.data;
  },

  create: async (user) => {
    const response = await getApi().post('/auth/users', user);
    return response.data;
  },

  update: async (id, user) => {
    const response = await getApi().put(`/auth/users/${id}`, user);
    return response.data;
  },

  remove: async (id) => {
    const response = await getApi().delete(`/auth/users/${id}`);
    return response.data;
  },
};

// User Preferences API
export const userPreferencesAPI = {
  getPreferences: async () => {
    const response = await getApi().get('/users/me/preferences');
    return response.data;
  },

  updatePreferences: async (preferences) => {
    const response = await getApi().put('/users/me/preferences', preferences);
    return response.data;
  },
};

// Configuration API
export const configAPI = {
  getRetention: async () => {
    const response = await getApi().get('/config/retention');
    return response.data;
  },

  updateRetention: async (dataRetentionDays) => {
    const response = await getApi().put('/config/retention', { dataRetentionDays });
    return response.data;
  },

  getSystemConfig: async () => {
    const response = await getApi().get('/config/system');
    return response.data;
  },

  updateSystemConfig: async (config) => {
    const response = await getApi().put('/config/system', config);
    return response.data;
  },
};

// Counter Sets API
// Transforms backend field names (total/byClass/mqttTopic/mqttInterval)
// to frontend field names (value/classes/mqtt.topic/mqtt.intervalSeconds)
const _toFrontendCounterSet = (cs) => {
  if (!cs) return null;
  const resetAt = cs.resetAt || null;
  const counters = (cs.counters || []).map(c => ({
    id:        c.id,
    from:      c.from,
    to:        c.to,
    name:      c.name || '',
    enabled:   c.enabled !== false,
    value:     c.total ?? c.value ?? 0,
    classes:   c.byClass instanceof Map ? Object.fromEntries(c.byClass) : (c.byClass || c.classes || {}),
    lastReset: c.lastReset || resetAt || null,
    arrowConfig: c.arrowConfig || null,
  }));
  return {
    _id:           cs._id,
    name:          cs.name,
    serial:        cs.serial,
    objectClasses: cs.objectClasses || [],
    zones:         cs.zones || [],
    counters,
    mqtt: {
      enabled:         !!(cs.mqttTopic),
      topic:           cs.mqttTopic || '',
      intervalSeconds: cs.mqttInterval ?? 60,
    },
    flowViewConfig: cs.flowViewConfig || {
      arrowColor: '#3498db',
      arrowOpacity: 0.7,
      selectedClass: null,
      displayMode: 'total',
    },
    days:      cs.days ?? 0,
    backfill:  cs.backfill || null,
    resetAt,
    createdAt: cs.createdAt,
    updatedAt: cs.updatedAt,
  };
};

const _toBackendBody = (body) => {
  const out = { ...body };
  if (body.mqtt) {
    // If enabled is explicitly false, clear the topic so MQTT stops
    out.mqttTopic    = body.mqtt.enabled ? (body.mqtt.topic || '') : '';
    out.mqttInterval = body.mqtt.intervalSeconds ?? 60;
    delete out.mqtt;
  }
  return out;
};

export const countersAPI = {
  list: async () => {
    const response = await getApi().get('/counters');
    return (response.data.data || []).map(_toFrontendCounterSet);
  },

  get: async (id) => {
    const response = await getApi().get(`/counters/${id}`);
    return _toFrontendCounterSet(response.data.data);
  },

  create: async (body) => {
    const response = await getApi().post('/counters', _toBackendBody(body));
    return _toFrontendCounterSet(response.data.data);
  },

  update: async (id, body) => {
    const response = await getApi().put(`/counters/${id}`, _toBackendBody(body));
    return _toFrontendCounterSet(response.data.data);
  },

  delete: async (id) => {
    await getApi().delete(`/counters/${id}`);
  },

  resetAll: async (id) => {
    const response = await getApi().post(`/counters/${id}/reset`);
    return _toFrontendCounterSet(response.data.data);
  },

  resetOne: async (id, counterId) => {
    const encoded = encodeURIComponent(counterId);
    const response = await getApi().post(`/counters/${id}/counters/${encoded}/reset`);
    return _toFrontendCounterSet(response.data.data);
  },

  getBackfill: async (id) => {
    const response = await getApi().get(`/counters/${id}/backfill`);
    return response.data.data;
  },

  startBackfill: async (id) => {
    const response = await getApi().post(`/counters/${id}/backfill`);
    return response.data.data;
  },
};

// Health check
export const healthCheck = async () => {
  const response = await getApi().get('/health');
  return response.data;
};

export default getApi;
