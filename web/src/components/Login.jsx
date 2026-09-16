import { useState } from 'react';
import PropTypes from 'prop-types';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Login.css';

function Login({ appName }) {
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.username || !formData.password) {
      setError('Please enter username and password');
      return;
    }

    try {
      setLoading(true);
      const response = await authAPI.login(formData);

      if (response.success) {
        login(response.data.user, response.data.token);
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (err) {
      let errorMessage;

      if (err.response?.status === 401) {
        errorMessage = 'Invalid username or password';
      } else if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        errorMessage = `Cannot connect to ${appName || 'the application'}. Please try again.`;
      } else {
        errorMessage = err.response?.data?.error || 'Login failed. Please try again.';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container-videox">
      <div className="login-card-videox">
        <div className="login-header-videox">
          <h1>{appName}</h1>
          <p>Path and Flow Analysis System</p>
        </div>

        {error && <div className="error-message-videox">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="credentials-section">
              <div className="form-group-login">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Enter your username"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="form-group-login">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className="btn-continue" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
          </div>
        </form>
      </div>
    </div>
  );
}

Login.propTypes = {
  appName: PropTypes.string.isRequired,
};

export default Login;
