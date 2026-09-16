import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { isAuthenticated, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000; // 1 second
  const subscriptionsRef = useRef({ cameras: [], filters: {} });
  const eventHandlersRef = useRef([]);

  const getWebSocketUrl = useCallback((authToken) => {
    if (!authToken) return null;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${window.location.host}/ws/paths?token=${authToken}`;
  }, []);

  // Subscribe to cameras
  const subscribe = useCallback((cameras = [], filters = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, subscription will be sent when connected');
      subscriptionsRef.current = { cameras, filters };
      return;
    }

    subscriptionsRef.current = { cameras, filters };

    const message = {
      type: 'subscribe',
      cameras,
      filters
    };

    if (import.meta.env.DEV) {
      console.log('Subscribing to WebSocket:', message);
    }

    wsRef.current.send(JSON.stringify(message));
  }, []);

  // Unsubscribe from cameras
  const unsubscribe = useCallback((cameras = []) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      type: 'unsubscribe',
      cameras
    };

    if (import.meta.env.DEV) {
      console.log('Unsubscribing from WebSocket:', message);
    }

    wsRef.current.send(JSON.stringify(message));

    // Update local subscription state
    subscriptionsRef.current.cameras = subscriptionsRef.current.cameras.filter(
      cam => !cameras.includes(cam)
    );
  }, []);

  // Register event handler
  const onPathEvent = useCallback((handler) => {
    eventHandlersRef.current.push(handler);

    // Return cleanup function
    return () => {
      eventHandlersRef.current = eventHandlersRef.current.filter(h => h !== handler);
    };
  }, []);

  // Send ping
  const ping = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }));
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!isAuthenticated || !token) {
      if (import.meta.env.DEV) {
        console.log('Not connecting WebSocket: not authenticated');
      }
      return;
    }

    // Don't create new connection if already connected or connecting
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWebSocketUrl(token);
    if (!wsUrl) {
      console.error('Failed to generate WebSocket URL');
      return;
    }

    try {
      if (import.meta.env.DEV) {
        console.log('Connecting to WebSocket:', wsUrl.replace(/token=.*/, 'token=***'));
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttemptsRef.current = 0;

        // Resubscribe to previous subscriptions if any
        if (subscriptionsRef.current.cameras.length > 0 || Object.keys(subscriptionsRef.current.filters).length > 0) {
          setTimeout(() => {
            subscribe(subscriptionsRef.current.cameras, subscriptionsRef.current.filters);
          }, 100);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (import.meta.env.DEV) {
            if (message.type !== 'path') {
              console.log('WebSocket message:', message);
            }
          }

          switch (message.type) {
            case 'path':
              // Store last event
              setLastEvent(message.data);

              // Notify all registered handlers
              eventHandlersRef.current.forEach(handler => {
                try {
                  handler(message.data);
                } catch (err) {
                  console.error('Error in path event handler:', err);
                }
              });
              break;

            case 'error':
              console.error('WebSocket error message:', message);
              setConnectionError(message.error);
              break;

            case 'connected':
            case 'subscribed':
            case 'unsubscribed':
            case 'pong':
              // Informational messages, already logged in dev mode
              break;

            default:
              console.warn('Unknown WebSocket message type:', message.type);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if authenticated and not a normal closure
        if (isAuthenticated && event.code !== 1000 && event.code !== 1001) {
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(
              baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
              30000 // Max 30 seconds
            );

            console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current += 1;
              connect();
            }, delay);
          } else {
            console.error('Max reconnection attempts reached');
            setConnectionError('Failed to reconnect to server');
          }
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionError(error.message);
    }
  }, [isAuthenticated, token, getWebSocketUrl, subscribe]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionError(null);
    reconnectAttemptsRef.current = 0;
    subscriptionsRef.current = { cameras: [], filters: {} };
  }, []);

  // Connect when authenticated, disconnect when not
  useEffect(() => {
    if (isAuthenticated && token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, token, connect, disconnect]);

  // Ping interval to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const intervalId = setInterval(() => {
      ping();
    }, 30000); // Ping every 30 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [isConnected, ping]);

  const value = {
    isConnected,
    connectionError,
    lastEvent,
    subscribe,
    unsubscribe,
    onPathEvent,
    ping,
    reconnect: connect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

WebSocketProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
