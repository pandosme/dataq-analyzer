import { useEffect, useState } from 'react';
import { camerasAPI, configAPI } from '../services/api';

function isValidDays(value) {
  return value.trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

export default function RetentionSettings() {
  const [policy, setPolicy] = useState(null);
  const [defaultDays, setDefaultDays] = useState('');
  const [cameras, setCameras] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([configAPI.getRetention(), camerasAPI.getAll(false, false, true)])
      .then(([retention, devices]) => {
        if (!active) return;
        setPolicy(retention.data);
        setDefaultDays(String(retention.data.dataRetentionDays));
        setCameras(devices.data);
        setDrafts(Object.fromEntries(devices.data.map((camera) => [
          camera._id, camera.retentionDays == null ? '' : String(camera.retentionDays),
        ])));
      })
      .catch((loadError) => {
        if (active) setError(loadError.response?.data?.error || 'Could not load retention settings. Reopen this tab to retry.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const save = async (camera = null) => {
    const value = camera ? drafts[camera._id] : defaultDays;
    setSaved('');
    setError('');
    if (!(camera && value === '') && !isValidDays(value)) {
      setError('Enter a positive whole number of days, or leave camera retention blank to use the system default.');
      return;
    }
    setSaving(camera ? camera._id : 'default');
    try {
      if (camera) {
        const retentionDays = value === '' ? null : Number(value);
        await camerasAPI.update(camera._id, { retentionDays });
        setCameras((current) => current.map((item) => item._id === camera._id ? { ...item, retentionDays } : item));
        setSaved(`Retention saved for ${camera.name}.`);
      } else {
        const response = await configAPI.updateRetention(Number(value));
        setPolicy((current) => ({ ...current, ...response.data }));
        setSaved('Default retention saved.');
      }
    } catch (saveError) {
      setError(saveError.response?.data?.error || 'Could not save retention settings.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <p role="status">Loading retention settings...</p>;
  if (!policy) return <div className="settings-alert error" role="alert">{error}</div>;

  return (
    <div className="preferences-panel">
      <div className="settings-alert" role="note">
        These settings affect every instance sharing this database. Lowering retention permanently
        deletes older paths at the next scheduled cleanup. Cleanup starts at server-local midnight
        and repeats every 24 hours; saving does not delete data immediately.
      </div>
      {!policy.cleanupEnabled && (
        <div className="settings-alert" role="note">
          Cleanup is disabled on this instance. Changes still apply to other instances using the
          same database where cleanup is enabled.
        </div>
      )}
      {error && <div className="settings-alert error" role="alert">{error}</div>}
      {saved && <p className="settings-success" role="status">{saved}</p>}
      <section className="settings-section">
        <h3>System default</h3>
        <label className="settings-field">
          <span>Default retention (days)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={defaultDays}
            disabled={saving !== null}
            onChange={(event) => { setDefaultDays(event.target.value); setSaved(''); }}
          />
          <small>Saved default: {policy.dataRetentionDays} days. No restart required.</small>
        </label>
        <button className="settings-button primary" type="button" disabled={saving !== null} onClick={() => save()}>
          {saving === 'default' ? 'Saving...' : 'Save default'}
        </button>
      </section>
      <section className="settings-section">
        <h3>Per-camera retention</h3>
        <p>Leave blank to use the system default. Disabled and archived cameras are included.</p>
        {cameras.length === 0 && <p>No cameras found.</p>}
        {cameras.map((camera) => (
          <div className="settings-section" key={camera._id}>
            <label className="settings-field">
              <span>{camera.name} ({camera.serialNumber}){camera.archivedAt ? ' - Archived' : !camera.enabled ? ' - Disabled' : ''}</span>
              <input
                type="number"
                min="1"
                step="1"
                value={drafts[camera._id]}
                placeholder={`System default (${policy.dataRetentionDays} days)`}
                disabled={saving !== null}
                onChange={(event) => {
                  setDrafts((current) => ({ ...current, [camera._id]: event.target.value }));
                  setSaved('');
                }}
              />
              <small>
                Saved policy: {camera.retentionDays == null ? `System default (${policy.dataRetentionDays} days)` : `${camera.retentionDays} days`}
              </small>
            </label>
            <button className="settings-button primary" type="button" disabled={saving !== null} onClick={() => save(camera)}>
              {saving === camera._id ? 'Saving...' : `Save ${camera.name}`}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
