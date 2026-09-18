export function buildMediaMtxPlaybackUrl(serverUrl, recordingName, startTime, durationSeconds) {
  const baseUrl = serverUrl.replace(/\/+$/, '');
  const recordingPath = encodeURIComponent(recordingName.trim().toLowerCase());
  const params = new URLSearchParams({
    path: decodeURIComponent(recordingPath),
    start: startTime.toISOString(),
    duration: String(Math.max(1, Math.ceil(durationSeconds))),
    format: 'mp4',
  });

  return `${baseUrl}/get?${params}`;
}