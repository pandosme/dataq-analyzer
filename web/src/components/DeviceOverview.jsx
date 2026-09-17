import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Loader, Modal, Table, Text, Tooltip } from '@mantine/core';
import { Activity, ArrowRight, Database, RefreshCw, Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import { camerasAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './DeviceOverview.css';

function relativeTime(value, now) {
  if (!value) return 'Never';
  const elapsedMinutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes === 1) return '1 minute ago';
  if (elapsedMinutes < 60) return `${elapsedMinutes} minutes ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'No data';
}

export default function DeviceOverview({ onOpenDevice }) {
  const { user } = useAuth();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  // Device queued for permanent removal, awaiting confirmation
  const [deviceToRemove, setDeviceToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const canRemoveDevices = user?.role === 'admin';

  const loadDevices = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      setError('');
      const response = await camerasAPI.getAll(true, true);
      setDevices(response.data || []);
    } catch (requestError) {
      console.error('Failed to load device overview:', requestError);
      setError('Could not load devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmRemoveDevice = useCallback(async () => {
    if (!deviceToRemove) return;
    try {
      setRemoving(true);
      setRemoveError('');
      await camerasAPI.removePermanently(deviceToRemove._id);
      setDeviceToRemove(null);
      await loadDevices(true);
    } catch (requestError) {
      console.error('Failed to remove device:', requestError);
      setRemoveError(requestError?.response?.data?.error || 'Could not remove the device.');
    } finally {
      setRemoving(false);
    }
  }, [deviceToRemove, loadDevices]);

  useEffect(() => {
    loadDevices(true);
    const refreshTimer = window.setInterval(() => loadDevices(false), 30000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [loadDevices]);

  return (
    <section className="device-overview" aria-labelledby="devices-title">
      <div className="page-heading">
        <div>
          <p className="page-kicker">System overview</p>
          <h2 id="devices-title">Devices</h2>
          <p className="page-description">Live status and available path history.</p>
        </div>
        <Tooltip label="Refresh device status">
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Refresh device status"
            onClick={() => loadDevices(true)}
            disabled={loading}
          >
            <RefreshCw size={17} />
          </ActionIcon>
        </Tooltip>
      </div>

      <div className="overview-summary" aria-label="Device summary">
        <div>
          <Activity size={18} />
          <span><strong>{devices.filter((device) => device.deviceStatus?.connected).length}</strong> connected</span>
        </div>
        <div>
          <Database size={18} />
          <span><strong>{devices.reduce((total, device) => total + (device.pathCount || 0), 0).toLocaleString()}</strong> stored paths</span>
        </div>
      </div>

      <div className="device-table-shell">
        {loading && devices.length === 0 ? (
          <div className="overview-state"><Loader size="sm" /> Loading devices</div>
        ) : error ? (
          <div className="overview-state overview-error">
            <span>{error}</span>
            <Button variant="light" size="xs" onClick={() => loadDevices(true)}>Retry</Button>
          </div>
        ) : devices.length === 0 ? (
          <div className="overview-state">No devices have been discovered yet.</div>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Device</Table.Th>
                  <Table.Th>Model</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Last message</Table.Th>
                  <Table.Th>Stored history</Table.Th>
                  {canRemoveDevices && <Table.Th aria-label="Remove device" />}
                  <Table.Th aria-label="Open device" />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {devices.map((device) => (
                  <Table.Tr
                    key={device._id}
                    className="device-row"
                    tabIndex={0}
                    onClick={() => onOpenDevice(device.serialNumber)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onOpenDevice(device.serialNumber);
                    }}
                  >
                    <Table.Td>
                      <div className="device-identity">
                        <strong>{device.name}</strong>
                        <span>{[device.location, device.serialNumber].filter(Boolean).join(' · ')}</span>
                      </div>
                    </Table.Td>
                    <Table.Td>{device.model || 'Unknown model'}</Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={device.deviceStatus?.connected ? 'teal' : 'gray'}
                        leftSection={<span className={`status-dot ${device.deviceStatus?.connected ? 'online' : ''}`} />}
                      >
                        {device.deviceStatus?.connected ? 'Connected' : 'Offline'}
                      </Badge>
                    </Table.Td>
                    <Table.Td title={device.deviceStatus?.lastSeen ? new Date(device.deviceStatus.lastSeen).toLocaleString() : ''}>
                      {relativeTime(device.deviceStatus?.lastSeen, now)}
                    </Table.Td>
                    <Table.Td title={device.firstPathAt ? `${formatDate(device.firstPathAt)} – ${formatDate(device.lastPathAt)}` : ''}>
                      <strong>{device.storedDays || 0} days</strong>
                      <span className="path-count">{(device.pathCount || 0).toLocaleString()} paths</span>
                    </Table.Td>
                    {canRemoveDevices && (
                      <Table.Td>
                        <Tooltip label="Remove device permanently">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={`Remove ${device.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setRemoveError('');
                              setDeviceToRemove(device);
                            }}
                          >
                            <Trash2 size={17} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    )}
                    <Table.Td>
                      <ArrowRight className="row-arrow" size={18} aria-hidden="true" />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </div>

      <Modal
        opened={Boolean(deviceToRemove)}
        onClose={() => (removing ? null : setDeviceToRemove(null))}
        title="Remove device permanently"
        centered
      >
        <Text size="sm">
          <strong>{deviceToRemove?.name}</strong> ({deviceToRemove?.serialNumber}) and all of its
          recorded data will be deleted. This cannot be undone.
        </Text>
        <Text size="sm" mt="sm" c="dimmed">
          {(deviceToRemove?.pathCount || 0).toLocaleString()} stored paths will be deleted. If the
          device is still publishing to MQTT it will be discovered again as a new device.
        </Text>
        {removeError && <Text size="sm" mt="sm" c="red">{removeError}</Text>}
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setDeviceToRemove(null)} disabled={removing}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmRemoveDevice} loading={removing}>
            Remove permanently
          </Button>
        </Group>
      </Modal>
    </section>
  );
}

DeviceOverview.propTypes = {
  onOpenDevice: PropTypes.func.isRequired,
};