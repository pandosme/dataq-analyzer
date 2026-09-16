import { useEffect, useState } from 'react';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const emptyDraft = {
  username: '',
  password: '',
  role: 'viewer',
  enabled: true,
};

function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await usersAPI.list();
      setUsers(response.data || []);
    } catch (loadError) {
      setError(loadError.response?.data?.error || 'Unable to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const beginCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setError('');
    setShowEditor(true);
  };

  const beginEdit = (user) => {
    setEditingId(user._id);
    setDraft({
      username: user.username,
      password: '',
      role: user.role,
      enabled: user.enabled !== false,
    });
    setError('');
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingId(null);
    setError('');
  };

  const setField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const saveUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        role: draft.role,
        enabled: draft.enabled,
      };
      if (!editingId) payload.username = draft.username;
      if (draft.password) payload.password = draft.password;

      if (editingId) {
        await usersAPI.update(editingId, payload);
      } else {
        await usersAPI.create(payload);
      }
      closeEditor();
      await loadUsers();
    } catch (saveError) {
      setError(saveError.response?.data?.error || 'Unable to save user');
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (user) => {
    if (!window.confirm(`Delete ${user.username}?`)) return;

    setError('');
    try {
      await usersAPI.remove(user._id);
      await loadUsers();
    } catch (removeError) {
      setError(removeError.response?.data?.error || 'Unable to delete user');
    }
  };

  return (
    <div className="users-panel">
      <div className="users-toolbar">
        <div>
          <h3>Users</h3>
          <span>Administrators manage the system. Viewers have read-only access to all data.</span>
        </div>
        <button className="settings-button primary" type="button" onClick={beginCreate}>
          Add user
        </button>
      </div>

      {error && <div className="settings-alert error">{error}</div>}

      {showEditor && (
        <form className="user-editor" onSubmit={saveUser}>
          <div className="user-editor-heading">
            <h4>{editingId ? 'Edit user' : 'New user'}</h4>
            <button type="button" className="text-button" onClick={closeEditor}>Cancel</button>
          </div>

          <div className="settings-form-grid">
            <label className="settings-field">
              <span>Username</span>
              <input
                required
                minLength="3"
                value={draft.username}
                disabled={Boolean(editingId)}
                onChange={(event) => setField('username', event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="settings-field">
              <span>{editingId ? 'New password' : 'Password'}</span>
              <input
                required={!editingId}
                minLength="6"
                type="password"
                value={draft.password}
                onChange={(event) => setField('password', event.target.value)}
                autoComplete="new-password"
                placeholder={editingId ? 'Leave unchanged' : ''}
              />
            </label>
            <label className="settings-field">
              <span>Role</span>
              <select value={draft.role} onChange={(event) => setField('role', event.target.value)}>
                <option value="viewer">Viewer</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            {editingId && (
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => setField('enabled', event.target.checked)}
                />
                <span>Account enabled</span>
              </label>
            )}
          </div>

          <div className="user-editor-actions">
            <button className="settings-button primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="settings-empty">Loading users...</div>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td><strong>{user.username}</strong></td>
                  <td><span className={`role-badge ${user.role}`}>{user.role}</span></td>
                  <td>
                    <span className={`status-badge ${user.enabled === false ? 'disabled' : 'enabled'}`}>
                      {user.enabled === false ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                  <td className="user-row-actions">
                    <button type="button" className="text-button" onClick={() => beginEdit(user)}>Edit</button>
                    {user._id !== currentUser?._id && (
                      <button type="button" className="text-button danger" onClick={() => removeUser(user)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminUsers;