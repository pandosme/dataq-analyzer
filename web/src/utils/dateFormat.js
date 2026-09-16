/**
 * Utility functions for formatting dates according to system settings
 */

/**
 * Format a date/time according to the specified format
 * @param {Date|string|number} date - The date to format
 * @param {string} dateFormat - 'US', 'EU', or 'ISO'
 * @param {string} timeFormat - '12h' or '24h' (optional, defaults based on dateFormat)
 * @returns {string} Formatted date string
 */
export const formatDateTime = (date, dateFormat = 'US', timeFormat = null) => {
  if (!date) return '-';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  // Determine time format if not specified
  const use12Hour = timeFormat === '12h' || (timeFormat === null && dateFormat === 'US');

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 || 12;
  const hours = String(use12Hour ? hours12 : hours24).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours24 >= 12 ? 'PM' : 'AM';

  const timeStr = use12Hour
    ? `${hours}:${minutes}:${seconds} ${ampm}`
    : `${hours}:${minutes}:${seconds}`;

  if (dateFormat === 'EU') {
    // EU format: DD/MM/YYYY HH:mm:ss or DD/MM/YYYY hh:mm:ss AM/PM
    return `${day}/${month}/${year} ${timeStr}`;
  } else if (dateFormat === 'ISO') {
    // ISO format: YYYY-MM-DD HH:mm:ss (always 24-hour)
    const hours24Str = String(hours24).padStart(2, '0');
    return `${year}-${month}-${day} ${hours24Str}:${minutes}:${seconds}`;
  } else {
    // US format: MM/DD/YYYY hh:mm:ss AM/PM or MM/DD/YYYY HH:mm:ss
    return `${month}/${day}/${year} ${timeStr}`;
  }
};

/**
 * Format just the date (no time)
 * @param {Date|string|number} date - The date to format
 * @param {string} format - 'US', 'EU', or 'ISO'
 * @returns {string} Formatted date string
 */
export const formatDate = (date, format = 'US') => {
  if (!date) return '-';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  if (format === 'EU') {
    // EU format: DD/MM/YYYY
    return `${day}/${month}/${year}`;
  } else if (format === 'ISO') {
    // ISO format: YYYY-MM-DD
    return `${year}-${month}-${day}`;
  } else {
    // US format: MM/DD/YYYY
    return `${month}/${day}/${year}`;
  }
};

/**
 * Format just the time
 * @param {Date|string|number} date - The date to format
 * @param {string} timeFormat - '12h' or '24h'
 * @returns {string} Formatted time string
 */
export const formatTime = (date, timeFormat = '12h') => {
  if (!date) return '-';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  const hours24 = d.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours24 >= 12 ? 'PM' : 'AM';

  if (timeFormat === '24h') {
    // 24-hour format: 22:02:10
    const hours = String(hours24).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  } else {
    // 12-hour format: 10:02:10 PM
    const hours = String(hours12).padStart(2, '0');
    return `${hours}:${minutes}:${seconds} ${ampm}`;
  }
};
