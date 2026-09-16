import express from 'express';
import * as authService from '../services/authService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

async function loginHandler(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
      });
    }

    const result = await authService.login(username, password);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Client login failed', { error: error.message });

    if (error.message === 'Invalid credentials' || error.message === 'Account is disabled') {
      return res.status(401).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Login failed' });
  }
}

router.post('/login', loginHandler);
router.post('/client-login', loginHandler);

/**
 * GET /api/auth/users
 */
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await authService.getAllUsers(req.user);
    res.json({ success: true, data: users });
  } catch (error) {
    logger.error('Failed to get users', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});

/**
 * POST /api/auth/users
 */
router.post('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await authService.createManagedUser(req.user, req.body);
    res.status(201).json({ success: true, data: result.user });
  } catch (error) {
    logger.error('Failed to create user', { error: error.message });
    res.status(error.status || (error.message.includes('already exists') ? 400 : 500)).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/auth/users/:id
 */
router.put('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await authService.updateUser(req.params.id, req.body, req.user);
    res.json({ success: true, data: user });
  } catch (error) {
    logger.error('Failed to update user', { error: error.message });
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/auth/users/:id
 */
router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const deleted = await authService.deleteUser(req.params.id, req.user);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    logger.error('Failed to delete user', { error: error.message });
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
