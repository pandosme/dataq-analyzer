import { useState } from 'react';
import { format } from 'date-fns';
import './FilterPanel.css';

const TIME_RANGES = [
  { label: 'Last Hour', hours: 1 },
  { label: 'Last 2 Hours', hours: 2 },
  { label: 'Last 3 Hours', hours: 3 },
  { label: 'Last 6 Hours', hours: 6 },
  { label: 'Last 12 Hours', hours: 12 },
  { label: 'Last Day', hours: 24 },
  { label: 'Last 2 Days', hours: 48 },
  { label: 'Last 3 Days', hours: 72 },
  { label: 'Last Week', hours: 168 },
  { label: 'Last 2 Weeks', hours: 336 },
  { label: 'Last Month', hours: 720 },
];

function FilterPanel({
  onFilterChange,
  cameraDetails,
  mode = 'default',
}) {
  const isDwell = mode === 'dwell';
  const [timeMode, setTimeMode] = useState('preset'); // 'preset' or 'custom'
  const [selectedRange, setSelectedRange] = useState('24'); // hours
  const [filters, setFilters] = useState({
    from: format(new Date(Date.now() - 24 * 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm"),
    to: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    class: '',
    minDwell: '0',
    minIdle: '5',
    limit: isDwell ? '5000' : '500',
  });

  const handleChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTimeRangeChange = (hours) => {
    setSelectedRange(hours);
    const to = new Date();
    const from = new Date(Date.now() - hours * 60 * 60 * 1000);
    setFilters((prev) => ({
      ...prev,
      from: format(from, "yyyy-MM-dd'T'HH:mm"),
      to: format(to, "yyyy-MM-dd'T'HH:mm"),
    }));
  };

  const handleApply = () => {
    // Convert to API format
    const apiFilters = {
      class: filters.class || undefined,
      limit: filters.limit ? parseInt(filters.limit) : (isDwell ? 5000 : 500),
    };
    // Dwell Heatmap has a fixed 1-month time window and its own idle-time
    // filter (set in App.jsx) — the generic time range / min-dwell controls
    // don't apply there.
    if (!isDwell) {
      apiFilters.from = filters.from ? new Date(filters.from).toISOString() : undefined;
      apiFilters.to = filters.to ? new Date(filters.to).toISOString() : undefined;
      apiFilters.minDwell = filters.minDwell ? parseFloat(filters.minDwell) : undefined;
    } else {
      apiFilters.minIdle = filters.minIdle !== '' ? parseFloat(filters.minIdle) : 5;
    }
    onFilterChange(apiFilters);
  };

  const handleReset = () => {
    setTimeMode('preset');
    setSelectedRange('24');
    const defaultFilters = {
      from: format(new Date(Date.now() - 24 * 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm"),
      to: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      class: '',
      minDwell: '0',
      minIdle: '5',
      limit: isDwell ? '5000' : '500',
    };
    setFilters(defaultFilters);
    if (isDwell) {
      onFilterChange({ class: undefined, limit: 5000, minIdle: 5 });
      return;
    }
    onFilterChange({
      from: new Date(defaultFilters.from).toISOString(),
      to: new Date(defaultFilters.to).toISOString(),
      minDwell: 0,
      limit: 500,
    });
  };

  return (
    <div className="filter-panel">
      {/* Dwell Heatmap: fixed time window (set automatically) */}
      {isDwell && (
        <div className="filter-group">
          <label>Time Range:</label>
          <div className="fixed-range-note">
            Always last 30 days.
          </div>
        </div>
      )}

      {/* Min Idle Filter (Dwell Heatmap) */}
      {isDwell && (
        <div className="filter-group">
          <label htmlFor="filter-min-idle">Min Idle Time (seconds):</label>
          <input
            id="filter-min-idle"
            type="number"
            value={filters.minIdle}
            onChange={(e) => handleChange('minIdle', e.target.value)}
            placeholder="5"
            min="0"
            step="1"
          />
          <div className="fixed-range-note">
            Points where an object idled less than this are excluded from the
            query entirely.
          </div>
        </div>
      )}

      {/* Time Selection Mode */}
      {!isDwell && (
        <div className="filter-group">
          <label>Time Selection:</label>
          <div className="time-mode-selector">
            <button
              className={timeMode === 'preset' ? 'active' : ''}
              onClick={() => setTimeMode('preset')}
            >
              Preset Ranges
            </button>
            <button
              className={timeMode === 'custom' ? 'active' : ''}
              onClick={() => setTimeMode('custom')}
            >
              Custom Range
            </button>
          </div>
        </div>
      )}

      {/* Preset Time Ranges */}
      {!isDwell && timeMode === 'preset' && (
        <div className="filter-group">
          <label htmlFor="filter-time-range">Time Range:</label>
          <select
            id="filter-time-range"
            value={selectedRange}
            onChange={(e) => handleTimeRangeChange(parseInt(e.target.value))}
          >
            {TIME_RANGES.map((range) => (
              <option key={range.hours} value={range.hours}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Custom Date Range */}
      {!isDwell && timeMode === 'custom' && (
        <>
          <div className="filter-group">
            <label htmlFor="filter-from">From:</label>
            <input
              id="filter-from"
              type="datetime-local"
              value={filters.from}
              onChange={(e) => handleChange('from', e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="filter-to">To:</label>
            <input
              id="filter-to"
              type="datetime-local"
              value={filters.to}
              onChange={(e) => handleChange('to', e.target.value)}
            />
          </div>
        </>
      )}

      {/* Min Dwell Filter */}
      {!isDwell && (
        <div className="filter-group">
          <label htmlFor="filter-min-dwell">Min Dwell Time (seconds):</label>
          <input
            id="filter-min-dwell"
            type="number"
            value={filters.minDwell}
            onChange={(e) => handleChange('minDwell', e.target.value)}
            placeholder="5"
            min="0"
            step="1"
          />
        </div>
      )}

      {/* Object Class Filter */}
      <div className="filter-group">
        <label htmlFor="filter-class">Object Class:</label>
        <select
          id="filter-class"
          value={filters.class}
          onChange={(e) => handleChange('class', e.target.value)}
        >
          <option value="">All</option>
          {(cameraDetails?.labels || ['Human', 'Vehicle', 'Bike', 'LicensePlate', 'Bag', 'Head', 'Animal', 'Car', 'Truck', 'Bus', 'Other']).map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </select>
      </div>

      {/* Max Results Filter */}
      <div className="filter-group">
        <label htmlFor="filter-limit">Max Results:</label>
        <input
          id="filter-limit"
          type="number"
          value={filters.limit}
          onChange={(e) => handleChange('limit', e.target.value)}
          placeholder={isDwell ? '5000' : '500'}
          min="1"
          max={isDwell ? 20000 : 10000}
          step="100"
        />
      </div>

      {/* Action Buttons */}
      <div className="filter-actions">
        <button onClick={handleApply} className="btn-primary">
          Apply Filters
        </button>
        <button onClick={handleReset} className="btn-secondary">
          Reset
        </button>
      </div>
    </div>
  );
}

export default FilterPanel;
