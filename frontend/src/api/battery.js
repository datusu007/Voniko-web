import axios from 'axios';

// ✅ Battery service chạy trực tiếp trên máy client
const BATTERY_LOCAL_URL = 'http://localhost:8765';

const batteryApi = axios.create({ baseURL: BATTERY_LOCAL_URL });

// Auth vẫn qua server
const serverApi = axios.create({ baseURL: '/api/battery' });

serverApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ✅ Các lệnh điều khiển → gọi thẳng localhost:8765
export const getPorts    = () => batteryApi.get('/ports');
export const getStatus   = () => batteryApi.get('/status');
export const connectDevice = (data) => batteryApi.post('/connect', data);
export const disconnectDevice = () => batteryApi.post('/disconnect');
export const startTest   = (data) => batteryApi.post('/start', data);
export const stopTest    = () => batteryApi.post('/stop');
export const clearSession = () => batteryApi.delete('/session');

// ✅ Stream SSE trực tiếp từ localhost
export const getBatteryStreamUrl = () => `${BATTERY_LOCAL_URL}/stream`;

// ✅ Download report → qua server (cần auth)
export const downloadReport = () =>
  serverApi.get('/report/download', { responseType: 'blob' });

export const uploadTemplate = (formData) =>
  serverApi.post('/upload-template', formData);

export const getTemplateInfo = () => serverApi.get('/template-info');

export const downloadReportFromTemplate = (records) =>
  serverApi.post('/download-report', { records }, { responseType: 'blob' });

export const uploadArchive = (formData) =>
  serverApi.post('/upload-archive', formData);

export const getArchiveInfo = () => serverApi.get('/archive-info');

export const downloadArchiveReport = (records) =>
  serverApi.post('/download-archive-report', { records }, { responseType: 'blob' });

// ✅ Kiểm tra local service có chạy không
export const checkLocalHealth = () =>
  batteryApi.get('/ports', { timeout: 3000 });
