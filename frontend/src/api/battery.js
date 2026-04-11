import axios from 'axios';

const api = axios.create({ baseURL: '/api/battery' });

// Attach JWT from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const getPorts = () => api.get('/ports');
export const getStatus = () => api.get('/status');
export const checkHealth = () => api.get('/health');
export const downloadReport = () =>
  api.get('/report/download', { responseType: 'blob' });

export const uploadTemplate = (formData) =>
  api.post('/upload-template', formData);

export const getTemplateInfo = () => api.get('/template-info');

export const downloadReportFromTemplate = (records) =>
  api.post('/download-report', { records }, { responseType: 'blob' });

export const uploadArchive = (formData) =>
  api.post('/upload-archive', formData);

export const getArchiveInfo = () => api.get('/archive-info');

export const downloadArchiveReport = (records) =>
  api.post('/download-archive-report', { records }, { responseType: 'blob' });
