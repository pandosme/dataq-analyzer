import { useState, useEffect, useCallback } from 'react';
import { ActionIcon, Button, Drawer, Menu, SegmentedControl, Select, Tooltip } from '@mantine/core';
import { Activity, ChevronDown, LogOut, Search, Settings, SlidersHorizontal } from 'lucide-react';
import FilterPanel from './components/FilterPanel';
import FlowHeatmap from './components/FlowHeatmap';
import DwellHeatmap from './components/DwellHeatmap';
import ForensicSearch from './components/ForensicSearch';
import LiveData from './components/LiveData';
import ThreeColumnLayout from './components/ThreeColumnLayout';
import Login from './components/Login';
import SettingsDialog from './components/SettingsDialog';
import Counters from './components/Counters';
import DeviceOverview from './components/DeviceOverview';
import OccupancyChart from './components/OccupancyChart';
import { appInfoAPI, pathsAPI, camerasAPI } from './services/api';
import { useAuth } from './context/AuthContext';
import { useWebSocket } from './context/WebSocketContext';
import './App.css';

// Use cases shown in the workspace's "Use case" selector, in display order.
const USE_CASES = [
  { label: 'Flow', value: 'flow-heatmap' },
  { label: 'Dwell', value: 'dwell-heatmap' },
  { label: 'Occupancy', value: 'occupancy' },
  { label: 'Forensic', value: 'forensic-search' },
  { label: 'Live', value: 'live-view' },
  { label: 'Counters', value: 'counters' },
];
const WORKSPACE_MODES = USE_CASES.map((useCase) => useCase.value);

// Dwell Heatmap: always queries a fixed 1-month window and excludes points
// where objects idled for less than DWELL_MIN_IDLE seconds.
const DWELL_TIME_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
const DWELL_MIN_IDLE = 5;
const DWELL_DEFAULT_LIMIT = 5000;

// Force the Dwell Heatmap's time window and result limit, regardless of what
// the (shared) FilterPanel sends. minIdle is user-configurable (Filters
// panel), defaulting to DWELL_MIN_IDLE when not set.
const applyDwellDefaults = (f = {}) => {
  const now = new Date();
  const minIdle = (f.minIdle !== undefined && f.minIdle !== null && f.minIdle !== '')
    ? parseFloat(f.minIdle)
    : DWELL_MIN_IDLE;
  return {
    ...f,
    from: new Date(now.getTime() - DWELL_TIME_RANGE_MS).toISOString(),
    to: now.toISOString(),
    minIdle,
    limit: f.limit || DWELL_DEFAULT_LIMIT,
  };
};

function App() {
  const { isAuthenticated, loading: authLoading, user, logout } = useAuth();
  const { isConnected: wsConnected } = useWebSocket();
  const [appName, setAppName] = useState('');
  const [selectedApplication, setSelectedApplication] = useState('devices');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [cameraDetails, setCameraDetails] = useState(null);
  const [filters, setFilters] = useState({});
  const [pathData, setPathData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [settingsSection, setSettingsSection] = useState(null);
  const [devices, setDevices] = useState([]);
  const [queryOpen, setQueryOpen] = useState(false);

  useEffect(() => {
    const loadAppInfo = async () => {
      try {
        const response = await appInfoAPI.get();
        if (response.success && response.data?.appName) {
          setAppName(response.data.appName);
          document.title = response.data.appName;
        }
      } catch (err) {
        console.error('Failed to load application information:', err);
      }
    };

    loadAppInfo();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const loadDevices = async () => {
      try {
        const response = await camerasAPI.getAll(true);
        setDevices(response.data || []);
      } catch (err) {
        console.error('Failed to load device navigation:', err);
      }
    };
    loadDevices();
    const refreshTimer = window.setInterval(loadDevices, 30000);
    return () => window.clearInterval(refreshTimer);
  }, [isAuthenticated]);

  // Load camera details and snapshot when selected
  useEffect(() => {
    if (!isAuthenticated || !selectedCamera) {
      setCameraDetails(null);
      return;
    }

    const loadCameraDetails = async () => {
      try {
        const [camerasResponse, snapshotResponse] = await Promise.all([
          camerasAPI.getAll(),
          camerasAPI.getSnapshot(selectedCamera).catch((err) => {
            console.warn('Failed to load snapshot:', err);
            return null;
          }),
        ]);

        const camera = camerasResponse.data.find((c) => c.serialNumber === selectedCamera);

        if (import.meta.env.DEV) {
          console.log('Camera found:', camera);
          console.log('Snapshot response:', snapshotResponse);
        }

        // Add snapshot to camera details if available
        if (camera && snapshotResponse?.data) {
          camera.snapshot = snapshotResponse.data;
          if (import.meta.env.DEV) {
            console.log('Snapshot attached to camera:', camera.snapshot);
          }
        } else if (import.meta.env.DEV) {
          console.warn('No snapshot available for camera:', selectedCamera);
        }

        setCameraDetails(camera);
      } catch (err) {
        console.error('Error loading camera details:', err);
      }
    };

    loadCameraDetails();
  }, [selectedCamera, isAuthenticated]);

  // Load path data callback (for Flow Heatmap, Dwell Heatmap, and Forensic Search)
  const loadPathData = useCallback(async (options = null) => {
    if (!selectedCamera || !['flow-heatmap', 'dwell-heatmap', 'forensic-search'].includes(selectedApplication)) return;

    try {
      setLoading(true);
      setError(null);

      // Merge options with current filters (options override specific fields)
      const filtersToApply = options ? { ...filters, ...options } : filters;

      // Dwell Heatmap always queries the last 30 days with a 5s idle floor,
      // independent of whatever time range the FilterPanel has set.
      const baseFilters = selectedApplication === 'dwell-heatmap'
        ? applyDwellDefaults(filtersToApply)
        : filtersToApply;

      const queryFilters = {
        serial: selectedCamera,
        ...baseFilters,
      };

      const pathsResponse = await pathsAPI.query(queryFilters);
      const events = pathsResponse.data || [];

      // Calculate statistics from loaded data
      const statsMap = {};
      events.forEach(event => {
        const className = event.class || 'Unknown';
        if (!statsMap[className]) {
          statsMap[className] = {
            _id: className,
            count: 0,
            totalAge: 0,
            totalDwell: 0,
          };
        }
        statsMap[className].count += 1;
        statsMap[className].totalAge += event.age || 0;
        statsMap[className].totalDwell += event.dwell || 0;
      });

      const calculatedStats = Object.values(statsMap).map(stat => ({
        _id: stat._id,
        count: stat.count,
        avgAge: stat.totalAge / stat.count,
        avgDwell: stat.totalDwell / stat.count,
      }));

      setPathData(events);
      setStats(calculatedStats);
    } catch (err) {
      setError('Failed to load path data');
      console.error('Error loading path data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCamera, filters, selectedApplication]);

  // All applications now require manual query via "Query/Refresh" button
  // No auto-loading to give users full control over data queries

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="app-loading">
        <h2>Loading...</h2>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login appName={appName} />;
  }

  const handleCameraChange = (serialNumber) => {
    setSelectedCamera(serialNumber);
    setPathData([]);
    setStats(null);
  };

  const handleFilterChange = (newFilters) => {
    const finalFilters = selectedApplication === 'dwell-heatmap'
      ? applyDwellDefaults(newFilters)
      : newFilters;
    setFilters(finalFilters);
    setQueryOpen(false);
    // For Flow and Dwell Heatmaps, trigger data load when filters are applied
    if (selectedApplication === 'flow-heatmap' || selectedApplication === 'dwell-heatmap') {
      loadPathData(finalFilters);
    }
  };

  const handleApplicationChange = (appId) => {
    setSelectedApplication(appId);
    // Clear data when switching applications
    setPathData([]);
    setStats(null);
    setError(null);
    setQueryOpen(false);
  };

  const openDevice = (serialNumber) => {
    handleCameraChange(serialNumber);
    setSelectedApplication('live-view');
  };

  // Use base64 snapshot if available — backend may use 'image' or 'base64Image'
  const rawSnap = cameraDetails?.snapshot?.image ?? cameraDetails?.snapshot?.base64Image ?? null;
  const backgroundImage = rawSnap
    ? (rawSnap.startsWith('data:') ? rawSnap : `data:image/jpeg;base64,${rawSnap}`)
    : null;

  if (import.meta.env.DEV && (selectedApplication === 'flow-heatmap' || selectedApplication === 'dwell-heatmap')) {
    console.log(`${selectedApplication} - Background Image:`,
      backgroundImage?.substring(0, 50) + (backgroundImage?.length > 50 ? '...' : ''));
    console.log(`${selectedApplication} - Camera details:`, cameraDetails);
    console.log(`${selectedApplication} - Path data length:`, pathData?.length);
  }

  const handleLogout = () => {
    logout();
    setSelectedCamera('');
    setPathData([]);
    setStats(null);
  };

  // Shared three-column layout for Flow and Dwell heatmaps
  const renderHeatmap = (appId) => {
    const isFlow = appId === 'flow-heatmap';
    const statKey = isFlow ? 'avgAge' : 'avgDwell';
    const statLabel = isFlow ? 'Avg Age' : 'Avg Dwell';

    const middlePanel = !selectedCamera ? (
      <div className="no-camera-selected">
        <p>Select a camera to view {isFlow ? 'flow' : 'dwell'} heatmap data</p>
      </div>
    ) : isFlow ? (
      <FlowHeatmap
        pathData={pathData}
        backgroundImage={backgroundImage}
        loading={loading}
      />
    ) : (
      <DwellHeatmap
        pathData={pathData}
        backgroundImage={backgroundImage}
        loading={loading}
        filters={filters}
      />
    );

    const rightPanel = (
      <div className="right-panel-content">
        <div className="panel-section">
          <h3>Statistics</h3>
          {loading && <p className="loading-text">Loading...</p>}
          {error && <div className="error-message">{error}</div>}
          {!loading && !error && selectedCamera && (
            <p className="result-count">{pathData.length} paths loaded</p>
          )}
          {stats && stats.length > 0 && (
            <div className="stats-list">
              {stats.map((stat) => (
                <div key={stat._id} className="stat-item">
                  <strong className={`stat-class stat-class-${stat._id?.toLowerCase() || 'unknown'}`}>
                    {stat._id}:
                  </strong>
                  <ul>
                    <li>Count: {stat.count}</li>
                    <li>{statLabel}: {stat[statKey]?.toFixed(1)}s</li>
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );

    return (
      <ThreeColumnLayout middlePanel={middlePanel} rightPanel={rightPanel} />
    );
  };

  const isWorkspace = WORKSPACE_MODES.includes(selectedApplication);
  const analysisSummary = selectedApplication === 'counters'
    ? 'Counter sets across all devices'
    : selectedApplication === 'live-view'
    ? 'Live path updates as they arrive'
    : selectedApplication === 'occupancy'
    ? 'Occupancy changes over time'
    : Object.keys(filters).length === 0
    ? 'Configure a query to load path data'
    : [
        filters.class || 'All classes',
        filters.minIdle ? `Min idle ${filters.minIdle}s` : null,
        filters.minDwell ? `Min dwell ${filters.minDwell}s` : null,
        pathData.length ? `${pathData.length.toLocaleString()} results` : null,
      ].filter(Boolean).join(' · ');

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button className="brand-button" onClick={() => handleApplicationChange('devices')}>
            <span className="brand-mark"><Activity size={18} /></span>
            <span>{appName}</span>
          </button>
          <nav className="app-navigation">
            <button className={`nav-tab ${selectedApplication === 'devices' ? 'active' : ''}`} onClick={() => handleApplicationChange('devices')}>Devices</button>
            <button className={`nav-tab ${isWorkspace ? 'active' : ''}`} onClick={() => handleApplicationChange(selectedCamera ? 'live-view' : 'devices')}>Workspace</button>
          </nav>
        </div>

        <div className="header-right">
          <div className="header-actions">
            <div className="server-info">
              <span style={{
                fontSize: '0.8em',
                color: wsConnected ? '#4caf50' : '#999',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: wsConnected ? '#4caf50' : '#999'
                }}></span>
                {wsConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            <Menu shadow="md" width={210} position="bottom-end">
              <Menu.Target>
                <button className="user-trigger">{user?.username}<ChevronDown size={15} /></button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user?.role === 'admin' ? 'Administrator' : 'Viewer'}</Menu.Label>
                <Menu.Item leftSection={<Settings size={16} />} onClick={() => setSettingsSection('display')}>Display preferences</Menu.Item>
                {user?.role === 'admin' && <Menu.Item leftSection={<SlidersHorizontal size={16} />} onClick={() => setSettingsSection('administration')}>Administration</Menu.Item>}
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<LogOut size={16} />} onClick={handleLogout}>Log out</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        </div>
      </header>

      {selectedCamera && isWorkspace && (
        <div className="device-context-bar">
          <button className="back-to-devices" onClick={() => handleApplicationChange('devices')}>← Devices</button>
          <Select
            className="device-switcher"
            searchable
            allowDeselect={false}
            value={selectedCamera}
            onChange={handleCameraChange}
            data={devices.map((device) => ({ value: device.serialNumber, label: `${device.name} · ${device.serialNumber}` }))}
            aria-label="Switch device"
          />
          <Tooltip label={wsConnected ? 'Live connection active' : 'Live connection unavailable'}>
            <ActionIcon variant="subtle" color={wsConnected ? 'teal' : 'gray'} aria-label="Connection status">
              <span className={`connection-dot ${wsConnected ? 'online' : ''}`} />
            </ActionIcon>
          </Tooltip>
        </div>
      )}

      <main className="main-content">
        {selectedApplication === 'devices' && <DeviceOverview onOpenDevice={openDevice} />}

        {isWorkspace && (
          <section className="analysis-workspace">
            <div className="analysis-toolbar">
              <div className="analysis-mode">
                <span>Use case</span>
                <SegmentedControl
                  value={selectedApplication}
                  onChange={handleApplicationChange}
                  data={USE_CASES}
                />
              </div>
              <p className="query-summary">{analysisSummary}</p>
              {!['occupancy', 'live-view', 'counters'].includes(selectedApplication) && (
                <Button leftSection={<SlidersHorizontal size={16} />} onClick={() => setQueryOpen(true)}>
                  Query
                </Button>
              )}
            </div>
            <div className="analysis-content">
              {selectedApplication === 'live-view' && (
                <LiveData
                  selectedCamera={selectedCamera}
                  cameraDetails={cameraDetails}
                />
              )}
              {selectedApplication === 'flow-heatmap' && renderHeatmap('flow-heatmap')}
              {selectedApplication === 'dwell-heatmap' && renderHeatmap('dwell-heatmap')}
              {selectedApplication === 'occupancy' && <OccupancyChart selectedCamera={selectedCamera} />}
                    {selectedApplication === 'forensic-search' && (
                <ForensicSearch
                  pathData={pathData}
                  backgroundImage={backgroundImage}
                  selectedCamera={selectedCamera}
                  onCameraChange={handleCameraChange}
                  onQuery={loadPathData}
                  loading={loading}
                  cameraDetails={cameraDetails}
                  queryOpen={queryOpen}
                  onQueryClose={() => setQueryOpen(false)}
                />
              )}
            </div>
            {!['forensic-search', 'occupancy', 'live-view', 'counters'].includes(selectedApplication) && (
              <Drawer
                opened={queryOpen}
                onClose={() => setQueryOpen(false)}
                position="right"
                title={selectedApplication === 'dwell-heatmap' ? 'Dwell query' : 'Flow query'}
                size="sm"
              >
                <div className="query-drawer-intro">
                  <Search size={18} />
                  <p>Choose the path data to include in this analysis.</p>
                </div>
                <FilterPanel
                  onFilterChange={handleFilterChange}
                  cameraDetails={cameraDetails}
                  mode={selectedApplication === 'dwell-heatmap' ? 'dwell' : 'default'}
                />
              </Drawer>
            )}
          </section>
        )}

        {selectedApplication === 'counters' && (
                /* Keyed by device so switching device resets the counter views */
                <Counters key={selectedCamera} selectedCamera={selectedCamera} />
              )}
      </main>

      {settingsSection && (
        <SettingsDialog
          initialSection={settingsSection}
          onClose={() => setSettingsSection(null)}
        />
      )}
    </div>
  );
}

export default App;
