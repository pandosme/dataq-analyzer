import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../context/AuthContext';
import { useUserPreferences } from '../context/UserPreferencesContext';
import AdminUsers from './AdminUsers';
import RetentionSettings from './RetentionSettings';
import './SettingsDialog.css';

function SettingsDialog({ initialSection, onClose }) {
  const { user } = useAuth();
  const canManageUsers = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState(
    initialSection === 'administration' && canManageUsers ? 'administration' : 'display'
  );
  const {
    dateFormat,
    timeFormat,
    theme,
    videoPreTime,
    videoPostTime,
    systemConfig,
    userPreferences,
    updatePreferences,
  } = useUserPreferences();
  const [formData, setFormData] = useState({
    dateFormat: '',
    timeFormat: '',
    theme: '',
    videoPreTime: '',
    videoPostTime: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFormData({
      dateFormat: userPreferences.dateFormat || '',
      timeFormat: userPreferences.timeFormat || '',
      theme: userPreferences.theme || '',
      videoPreTime: userPreferences.videoPlayback?.preTime?.toString() || '',
      videoPostTime: userPreferences.videoPlayback?.postTime?.toString() || '',
    });
  }, [userPreferences]);

  const handleChange = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setSaved(false);
    setError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updatePreferences({
        dateFormat: formData.dateFormat || null,
        timeFormat: formData.timeFormat || null,
        theme: formData.theme || null,
        videoPlayback: {
          preTime: formData.videoPreTime === '' ? null : Number(formData.videoPreTime),
          postTime: formData.videoPostTime === '' ? null : Number(formData.videoPostTime),
        },
      });
      setSaved(true);
    } catch (saveError) {
      setError(saveError.response?.data?.error || 'Unable to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFormData({
      dateFormat: '',
      timeFormat: '',
      theme: '',
      videoPreTime: '',
      videoPostTime: '',
    });
    setSaved(false);
  };

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div>
            <h2 id="settings-title">
              {activeTab === 'retention' ? 'Data retention' : activeTab === 'administration' ? 'Administration' : 'My display'}
            </h2>
            <span>
              {activeTab === 'retention'
                ? 'System default and per-camera retention'
                : activeTab === 'administration'
                ? 'Manage administrators and viewers'
                : `Personal preferences for ${user?.username}`}
            </span>
          </div>
          <button className="settings-close" type="button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>

        <nav className="settings-tabs" aria-label="Settings sections">
          <button
            type="button"
            className={activeTab === 'display' ? 'active' : ''}
            onClick={() => setActiveTab('display')}
          >
            My display
          </button>
          {canManageUsers && (
            <button
              type="button"
              className={activeTab === 'administration' ? 'active' : ''}
              onClick={() => setActiveTab('administration')}
            >
              User administration
            </button>
          )}
          {canManageUsers && (
            <button
              type="button"
              className={activeTab === 'retention' ? 'active' : ''}
              onClick={() => setActiveTab('retention')}
            >
              Data retention
            </button>
          )}
        </nav>

        <div className="settings-content">
          {activeTab === 'retention' && canManageUsers ? (
            <RetentionSettings />
          ) : activeTab === 'administration' ? (
            <AdminUsers />
          ) : (
            <div className="preferences-panel">
              <section className="settings-section">
                <div className="section-heading">
                  <h3>Display</h3>
                </div>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>Date format</span>
                    <select value={formData.dateFormat} onChange={(event) => handleChange('dateFormat', event.target.value)}>
                      <option value="">System default ({systemConfig.dateFormat})</option>
                      <option value="US">MM/DD/YYYY</option>
                      <option value="EU">DD/MM/YYYY</option>
                      <option value="ISO">YYYY-MM-DD</option>
                    </select>
                    <small>Current: {dateFormat}</small>
                  </label>

                  <label className="settings-field">
                    <span>Time format</span>
                    <select value={formData.timeFormat} onChange={(event) => handleChange('timeFormat', event.target.value)}>
                      <option value="">System default ({systemConfig.timeFormat})</option>
                      <option value="12h">12-hour</option>
                      <option value="24h">24-hour</option>
                    </select>
                    <small>Current: {timeFormat}</small>
                  </label>

                  <label className="settings-field settings-field-wide">
                    <span>Theme</span>
                    <div className="settings-segmented">
                      {[
                        ['', 'Default'],
                        ['light', 'Light'],
                        ['dark', 'Dark'],
                      ].map(([value, label]) => (
                        <button
                          key={label}
                          type="button"
                          className={formData.theme === value ? 'active' : ''}
                          onClick={() => handleChange('theme', value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <small>Current: {theme === 'dark' ? 'Dark' : 'Light'}</small>
                  </label>
                </div>
              </section>

              <section className="settings-section">
                <div className="section-heading">
                  <h3>Video timing</h3>
                </div>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>Seconds before event</span>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={formData.videoPreTime}
                      placeholder={String(systemConfig.playback.preTime)}
                      onChange={(event) => handleChange('videoPreTime', event.target.value)}
                    />
                    <small>Current: {videoPreTime}s</small>
                  </label>
                  <label className="settings-field">
                    <span>Seconds after event</span>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={formData.videoPostTime}
                      placeholder={String(systemConfig.playback.postTime)}
                      onChange={(event) => handleChange('videoPostTime', event.target.value)}
                    />
                    <small>Current: {videoPostTime}s</small>
                  </label>
                </div>
              </section>

              {error && <div className="settings-alert error">{error}</div>}
              <footer className="settings-actions">
                <button className="settings-button secondary" type="button" onClick={handleReset}>
                  Reset
                </button>
                <div>
                  {saved && <span className="settings-success">Saved</span>}
                  <button className="settings-button primary" type="button" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save preferences'}
                  </button>
                </div>
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

SettingsDialog.propTypes = {
  initialSection: PropTypes.oneOf(['display', 'administration']).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SettingsDialog;