import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { camerasAPI } from '../services/api';

function CameraSelector({ selectedCamera, onCameraChange }) {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCameras();
    const refreshTimer = window.setInterval(() => loadCameras(false), 10000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  const loadCameras = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
        setError(null);
      }
      const response = await camerasAPI.getAll(true); // Only enabled cameras
      setCameras(response.data || []);
    } catch (err) {
      if (showLoading) setError('Failed to load cameras');
      console.error('Error loading cameras:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  if (loading) {
    return <div className="camera-selector">Loading cameras...</div>;
  }

  if (error) {
    return (
      <div className="camera-selector error">
        {error}
        <button onClick={loadCameras}>Retry</button>
      </div>
    );
  }

  return (
    <div className="camera-selector">
      <label htmlFor="camera-select">Select Camera:</label>
      <select
        id="camera-select"
        value={selectedCamera || ''}
        onChange={(e) => onCameraChange(e.target.value)}
      >
        <option value="">-- Select a camera --</option>
        {cameras.map((camera) => (
          <option key={camera._id} value={camera.serialNumber}>
            {camera.name} ({camera.serialNumber})
          </option>
        ))}
      </select>
    </div>
  );
}

CameraSelector.propTypes = {
  selectedCamera: PropTypes.string,
  onCameraChange: PropTypes.func.isRequired,
};

export default CameraSelector;
