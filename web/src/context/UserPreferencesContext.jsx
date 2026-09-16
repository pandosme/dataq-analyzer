import { createContext, useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { configAPI, userPreferencesAPI } from '../services/api';
import { useAuth } from './AuthContext';

const UserPreferencesContext = createContext();

// LocalStorage key for caching user preferences
const PREFERENCES_CACHE_KEY = 'userPreferences';

// Load cached preferences from localStorage
const loadCachedPreferences = () => {
  try {
    const cached = localStorage.getItem(PREFERENCES_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (error) {
    console.error('Failed to load cached preferences:', error);
    return {};
  }
};

// Save preferences to localStorage
const saveCachedPreferences = (preferences) => {
  try {
    localStorage.setItem(PREFERENCES_CACHE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save cached preferences:', error);
  }
};

// Apply theme to document
const applyTheme = (theme) => {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark-theme');
  } else {
    document.documentElement.classList.remove('dark-theme');
  }
};

export const UserPreferencesProvider = ({ children }) => {
  // Load cached preferences immediately (synchronously)
  const cachedPrefs = loadCachedPreferences();

  // Apply cached theme immediately to prevent flash
  if (cachedPrefs.theme) {
    applyTheme(cachedPrefs.theme);
  }

  const { isAuthenticated } = useAuth();

  // System defaults (from server)
  const [systemConfig, setSystemConfig] = useState({
    dateFormat: 'US',
    timeFormat: '12h',
    timezone: 'America/New_York',
    playback: {
      preTime: 5,
      postTime: 10,
    },
  });

  // User preferences (override system defaults)
  const [userPreferences, setUserPreferences] = useState(cachedPrefs);

  const [loading, setLoading] = useState(true);

  // Load system config and user preferences when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadSettings = async () => {
      try {
        // Load system config
        const systemResponse = await configAPI.getSystemConfig();
        if (systemResponse.success && systemResponse.data) {
          setSystemConfig({
            dateFormat: systemResponse.data.dateFormat || 'US',
            timeFormat: systemResponse.data.timeFormat || '12h',
            timezone: systemResponse.data.timezone || 'America/New_York',
            playback: {
              preTime: systemResponse.data.playback?.preTime || 5,
              postTime: systemResponse.data.playback?.postTime || 10,
            },
          });
        }

        // Load user preferences
        try {
          const userResponse = await userPreferencesAPI.getPreferences();
          if (userResponse.success && userResponse.data) {
            setUserPreferences(userResponse.data);

            // Cache preferences in localStorage
            saveCachedPreferences(userResponse.data);

            // Apply theme (might be different from cached if changed on another device)
            if (userResponse.data.theme) {
              applyTheme(userResponse.data.theme);
            } else if (cachedPrefs.theme) {
              // If server has no theme but cache does, clear the theme
              applyTheme('light');
            }

            if (import.meta.env.DEV) {
              console.log('User preferences loaded from server:', userResponse.data);
            }
          }
        } catch {
          // User preferences might not exist yet, that's okay
          if (import.meta.env.DEV) {
            console.log('No user preferences found on server, using cached/defaults');
          }
        }
      } catch (error) {
        if (error.message?.includes('No server selected')) {
          console.log('No server selected yet, using default settings');
        } else {
          console.error('Failed to load settings:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Update user preferences
  const updatePreferences = async (newPreferences) => {
    try {
      const response = await userPreferencesAPI.updatePreferences(newPreferences);
      if (response.success && response.data) {
        setUserPreferences(response.data);

        // Cache updated preferences
        saveCachedPreferences(response.data);

        // Apply theme if changed
        if (newPreferences.theme !== undefined) {
          applyTheme(newPreferences.theme || 'light');
        }

        if (import.meta.env.DEV) {
          console.log('User preferences updated:', response.data);
        }
      }
    } catch (error) {
      console.error('Failed to update preferences:', error);
      throw error;
    }
  };

  // Computed values (user preferences override system defaults)
  const dateFormat = userPreferences.dateFormat || systemConfig.dateFormat;
  const timeFormat = userPreferences.timeFormat || systemConfig.timeFormat;
  const timezone = userPreferences.timezone || systemConfig.timezone;
  const theme = userPreferences.theme || 'light';
  const videoPreTime = userPreferences.videoPlayback?.preTime ?? systemConfig.playback.preTime;
  const videoPostTime = userPreferences.videoPlayback?.postTime ?? systemConfig.playback.postTime;

  return (
    <UserPreferencesContext.Provider
      value={{
        // Current effective values (with user overrides)
        dateFormat,
        timeFormat,
        timezone,
        theme,
        videoPreTime,
        videoPostTime,

        // Raw values for settings UI
        systemConfig,
        userPreferences,

        // Methods
        updatePreferences,
        loading,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
};

UserPreferencesProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
};
