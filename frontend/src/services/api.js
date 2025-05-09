import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:5000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const uploadFile = (file, source) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source', source);

  return apiClient.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const getAnalysisData = (fileId, queryParams = '', source = null) => {
  let updatedQueryParams = queryParams;
  if (source) {
    const prefix = queryParams ? '&' : '?';
    updatedQueryParams += `${prefix}source=${source}`;
  }
  
  return apiClient.get(`/get-analysis-data/${fileId}${updatedQueryParams}`);
};

export const getTopPartner = (fileId, metric, year, month, source = null) => {
  const payload = { fileId, metric, year, month };
  if (source) {
    payload.source = source;
  }
  
  return apiClient.post('/get-top-partner', payload);
};

export const getComparisonData = (metricsToCompare, timeframe = 'monthly') => {
  const myAffiliateId = sessionStorage.getItem('myAffiliateId');
  const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
  
  if (!myAffiliateId || !dynamicWorksId) {
    return Promise.reject(new Error('Both data sources must be available for comparison'));
  }
  
  return apiClient.post('/get-comparison-data', {
    myAffiliateId,
    dynamicWorksId,
    metricsToCompare,
    timeframe
  });
};

export const sendMessageToChatbot = (fileId, query, chatHistory = [], source = null, additionalParams = {}) => {
  // Base payload
  const payload = { 
    fileId, 
    query, 
    chat_history: chatHistory,
    ...additionalParams // Include any additional parameters passed
  };
  
  // Add source if provided
  if (source) {
    payload.source = source;
  }
  
  // For combined analysis, make sure all required parameters are included
  if (source === 'combined') {
    payload.combinedAnalysis = true;
  }
  
  return apiClient.post('/chat', payload);
};

export const getTeamRegions = (fileId) => {
  return apiClient.get(`/get-team-regions/${fileId}`);
};

// You can add more API functions here as needed
// for example, to fetch specific chart data if you decide to have separate endpoints for them.

export const getStoredFiles = () => {
  return apiClient.get('/load-stored-files');
}; 