import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Loader,
  MultiSelect,
  SegmentedControl,
  Select,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import PropTypes from 'prop-types';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { occupancyAPI } from '../services/api';
import './OccupancyChart.css';

const RANGE_OPTIONS = [
  { label: '15 minutes', value: '15m', durationMs: 15 * 60 * 1000 },
  { label: '30 minutes', value: '30m', durationMs: 30 * 60 * 1000 },
  { label: '1 Hour', value: '1h', durationMs: 60 * 60 * 1000 },
  { label: '6 Hours', value: '6h', durationMs: 6 * 60 * 60 * 1000 },
  { label: '12 Hours', value: '12h', durationMs: 12 * 60 * 60 * 1000 },
  { label: '1 Day', value: '1d', durationMs: 24 * 60 * 60 * 1000 },
  { label: '1 Week', value: '1w', durationMs: 7 * 24 * 60 * 60 * 1000 },
];

const SERIES_COLORS = ['#147d6c', '#c3652d', '#356ba6', '#b74355', '#718338', '#8c5d34', '#277f8d', '#575e68'];

function toLocalInputValue(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
}

function formatTick(timestamp, range) {
  const options = range === '1w'
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : range === '1d'
      ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat(undefined, options).format(new Date(timestamp));
}

function formatTimeline(from, to, range) {
  const shortRange = !['1d', '1w'].includes(range);
  const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  if (shortRange && new Date(from).toDateString() === new Date(to).toDateString()) {
    return `${dateFormat.format(from)}, ${timeFormat.format(from)} - ${timeFormat.format(to)}`;
  }
  return `${new Date(from).toLocaleString()} - ${new Date(to).toLocaleString()}`;
}

export default function OccupancyChart({ selectedCamera }) {
  const [areas, setAreas] = useState([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedRange, setSelectedRange] = useState('1h');
  const [endTime, setEndTime] = useState(Date.now());
  const [series, setSeries] = useState(null);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setAreas([]);
    setSelectedArea('');
    setSeries(null);
    setSelectedLabels([]);
    setError('');
    if (!selectedCamera) return () => { active = false; };

    occupancyAPI.getAreas(selectedCamera)
      .then((response) => {
        if (!active) return;
        const nextAreas = response.data || [];
        setAreas(nextAreas);
        setSelectedArea(nextAreas[0]?.area || '');
      })
      .catch((requestError) => {
        if (!active) return;
        console.error('Failed to load occupancy areas:', requestError);
        setError('Could not load occupancy areas.');
      });

    return () => { active = false; };
  }, [selectedCamera]);

  const loadSeries = useCallback(async () => {
    if (!selectedCamera || !selectedArea) return;
    try {
      setLoading(true);
      setError('');
      const response = await occupancyAPI.getSeries({
        serial: selectedCamera,
        area: selectedArea,
        range: selectedRange,
        to: endTime,
      });
      const nextSeries = response.data;
      setSeries(nextSeries);
      setSelectedLabels((current) => {
        const available = nextSeries?.labels || [];
        const retained = current.filter((label) => available.includes(label));
        return retained.length > 0 ? retained : available;
      });
    } catch (requestError) {
      console.error('Failed to load occupancy series:', requestError);
      setError('Could not load occupancy history.');
    } finally {
      setLoading(false);
    }
  }, [endTime, selectedArea, selectedCamera, selectedRange]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  const selectedDuration = RANGE_OPTIONS.find((option) => option.value === selectedRange)?.durationMs || 0;
  const latestPoint = series?.points?.at(-1);
  const totalOccupancy = useMemo(
    () => selectedLabels.reduce((total, label) => total + (latestPoint?.[label] || 0), 0),
    [latestPoint, selectedLabels]
  );
  const timelineTicks = useMemo(() => {
    if (!series) return [];
    const tickCount = selectedRange === '1w' ? 7 : 6;
    const interval = (series.to - series.from) / tickCount;
    return Array.from({ length: tickCount + 1 }, (_, index) => series.from + (interval * index));
  }, [selectedRange, series]);

  const shiftTimeline = (direction) => {
    setEndTime((current) => current + (direction * selectedDuration));
  };

  const handleAreaChange = (value) => {
    setSelectedArea(value || '');
    setSelectedLabels([]);
    setSeries(null);
  };

  const handleRangeChange = (value) => {
    setSelectedRange(value);
    setEndTime(Date.now());
  };

  if (!selectedCamera) {
    return <div className="occupancy-state">Select a camera to view occupancy history.</div>;
  }

  return (
    <section className="occupancy-view" aria-label="Occupancy analysis">
      <div className="occupancy-controls">
        <Select
          label="Area"
          value={selectedArea}
          onChange={handleAreaChange}
          data={areas.map(({ area }) => ({ value: area, label: area }))}
          placeholder={areas.length ? 'Select area' : 'No occupancy areas'}
          allowDeselect={false}
          disabled={areas.length === 0}
        />
        <MultiSelect
          label="Labels"
          value={selectedLabels}
          onChange={setSelectedLabels}
          data={(series?.labels || []).map((label) => ({ value: label, label }))}
          placeholder="Select labels"
          searchable
          clearable
        />
        <TextInput
          label="Timeline ends"
          type="datetime-local"
          value={toLocalInputValue(endTime)}
          onChange={(event) => {
            const timestamp = new Date(event.currentTarget.value).getTime();
            if (Number.isFinite(timestamp)) setEndTime(timestamp);
          }}
        />
        <div className="timeline-actions" aria-label="Adjust timeline">
          <Tooltip label="Previous period">
            <ActionIcon variant="default" size="lg" onClick={() => shiftTimeline(-1)} aria-label="Previous period">
              <ChevronLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <Button variant="default" onClick={() => setEndTime(Date.now())}>Now</Button>
          <Tooltip label="Next period">
            <ActionIcon
              variant="default"
              size="lg"
              onClick={() => shiftTimeline(1)}
              disabled={endTime >= Date.now()}
              aria-label="Next period"
            >
              <ChevronRight size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh occupancy history">
            <ActionIcon variant="default" size="lg" onClick={loadSeries} disabled={loading} aria-label="Refresh occupancy history">
              <RefreshCw size={17} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>

      <div className="occupancy-range-selector">
        <span>Range</span>
        <SegmentedControl
          value={selectedRange}
          onChange={handleRangeChange}
          data={RANGE_OPTIONS.map(({ label, value }) => ({ label, value }))}
        />
      </div>

      <div className="occupancy-chart-heading">
        <div>
          <h2>{selectedArea || 'Occupancy'}</h2>
          {series && <p>{formatTimeline(series.from, series.to, selectedRange)}</p>}
        </div>
        {latestPoint && (
          <div className="occupancy-current">
            <span>Current total</span>
            <strong>{totalOccupancy}</strong>
          </div>
        )}
      </div>

      <div className="occupancy-chart-shell" aria-live="polite">
        {loading && !series ? (
          <div className="occupancy-state"><Loader size="sm" /> Loading occupancy history</div>
        ) : error ? (
          <div className="occupancy-state occupancy-error">
            <span>{error}</span>
            <Button size="xs" variant="light" onClick={loadSeries}>Retry</Button>
          </div>
        ) : areas.length === 0 ? (
          <div className="occupancy-state">No occupancy messages have been stored for this camera.</div>
        ) : !series?.points?.length ? (
          <div className="occupancy-state">No occupancy values are available in this timeline.</div>
        ) : selectedLabels.length === 0 ? (
          <div className="occupancy-state">Select at least one label to draw the graph.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series.points} margin={{ top: 12, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#dfe5e2" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={[series.from, series.to]}
                ticks={timelineTicks}
                tickFormatter={(value) => formatTick(value, selectedRange)}
                minTickGap={34}
                tick={{ fill: '#68756f', fontSize: 12 }}
                axisLine={{ stroke: '#c7d1cd' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, 'auto']}
                width={42}
                tick={{ fill: '#68756f', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <ChartTooltip
                labelFormatter={(value) => new Date(value).toLocaleString()}
                formatter={(value, name) => [value, name]}
              />
              <Legend iconType="plainline" />
              {selectedLabels.map((label, index) => (
                <Line
                  key={label}
                  type="stepAfter"
                  dataKey={label}
                  name={label}
                  stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={series.points.length <= 2 ? { r: 3 } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
        {loading && series && <Loader className="occupancy-refreshing" size="xs" />}
      </div>
    </section>
  );
}

OccupancyChart.propTypes = {
  selectedCamera: PropTypes.string,
};