import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadFile, getStoredFiles } from '../services/api';
import './UploadPage.css';

function UploadPage() {
  const [files, setFiles] = useState({
    myAffiliate: null,
    dynamicWorks: null
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [storedFiles, setStoredFiles] = useState([]);
  const [loadingStoredFiles, setLoadingStoredFiles] = useState(true);
  const fileInputRefs = {
    myAffiliate: useRef(null),
    dynamicWorks: useRef(null)
  };
  const navigate = useNavigate();

  // Load stored files on component mount
  useEffect(() => {
    const fetchStoredFiles = async () => {
      try {
        setLoadingStoredFiles(true);
        const response = await getStoredFiles();
        if (response.data && response.data.storedFiles) {
          // Group files by source
          const groupedFiles = response.data.storedFiles.reduce((acc, file) => {
            acc[file.source] = acc[file.source] || [];
            acc[file.source].push(file);
            return acc;
          }, {});
          
          // Sort files in each group by upload date (newest first)
          Object.keys(groupedFiles).forEach(source => {
            groupedFiles[source].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
          });
          
          setStoredFiles(groupedFiles);
        }
      } catch (err) {
        console.error('Error fetching stored files:', err);
        setError('Failed to load previously uploaded files.');
      } finally {
        setLoadingStoredFiles(false);
      }
    };
    
    fetchStoredFiles();
  }, []);

  const handleFileChange = (event, source) => {
    const file = event.target.files[0];
    if (file) {
      setFiles(prev => ({
        ...prev,
        [source]: file
      }));
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!files.myAffiliate && !files.dynamicWorks) {
      setError('Please select at least one file to upload.');
      return;
    }

    setUploading(true);
    setError(null);
    
    // Simulate upload progress for better UX
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 500);

    try {
      // Create array of file upload promises
      const uploadPromises = [];
      const fileIds = {};
      
      if (files.myAffiliate) {
        const myAffiliatePromise = uploadFile(files.myAffiliate, 'myAffiliate')
          .then(response => {
            fileIds.myAffiliateId = response.data.fileId;
          });
        uploadPromises.push(myAffiliatePromise);
      }
      
      if (files.dynamicWorks) {
        const dynamicWorksPromise = uploadFile(files.dynamicWorks, 'dynamicWorks')
          .then(response => {
            fileIds.dynamicWorksId = response.data.fileId;
          });
        uploadPromises.push(dynamicWorksPromise);
      }
      
      // Wait for all uploads to complete
      await Promise.all(uploadPromises);
      
      // Set progress to 100% when complete
      setUploadProgress(100);
      clearInterval(progressInterval);
      
      // Store the file IDs in session storage
      if (fileIds.myAffiliateId) {
        sessionStorage.setItem('myAffiliateId', fileIds.myAffiliateId);
      }
      if (fileIds.dynamicWorksId) {
        sessionStorage.setItem('dynamicWorksId', fileIds.dynamicWorksId);
      }
      
      // Set current active file ID (for backward compatibility)
      if (fileIds.dynamicWorksId) {
        sessionStorage.setItem('currentFileId', fileIds.dynamicWorksId);
      } else if (fileIds.myAffiliateId) {
        sessionStorage.setItem('currentFileId', fileIds.myAffiliateId);
      }
      
      sessionStorage.setItem('processedFilename', "Partner Data");
      
      // Delay navigation to show 100% completion
      setTimeout(() => {
        navigate('/dashboard');
      }, 500);
      
    } catch (err) {
      console.error('Upload error:', err);
      clearInterval(progressInterval);
      setUploadProgress(0);
      const errorMessage = err.response?.data?.error || err.message || 'An unexpected error occurred.';
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleLoadStoredFile = (fileId, source) => {
    // Store the selected file ID in session storage
    if (source === 'myAffiliate') {
      sessionStorage.setItem('myAffiliateId', fileId);
    } else if (source === 'dynamicWorks') {
      sessionStorage.setItem('dynamicWorksId', fileId);
      // Also set as current file ID for backward compatibility
      sessionStorage.setItem('currentFileId', fileId);
    }
    
    navigate('/dashboard');
  };

  return (
    <div className="page-container upload-page-container">
      <h1 className="upload-heading">Partner Analytics Platform</h1>
      <p className="upload-subheading">Upload your partner data files to access advanced analytics, visualizations, and AI-powered insights for better business decisions.</p>
      
      {/* Previously Uploaded Files Section */}
      {!loadingStoredFiles && Object.keys(storedFiles).length > 0 && (
        <div className="stored-files-section">
          <h2>Previously Uploaded Files</h2>
          <p>Load any of your previously uploaded files to continue analysis:</p>
          
          <div className="stored-files-container">
            {storedFiles.myAffiliate && storedFiles.myAffiliate.length > 0 && (
              <div className="stored-files-group">
                <h3>MyAffiliate Files</h3>
                <ul className="stored-files-list">
                  {storedFiles.myAffiliate.map(file => (
                    <li key={file.fileId} className="stored-file-item">
                      <div className="stored-file-info">
                        <span className="stored-file-name">{file.filename}</span>
                        <span className="stored-file-date">Uploaded: {new Date(file.uploadDate).toLocaleString()}</span>
                      </div>
                      <button 
                        className="load-file-button"
                        onClick={() => handleLoadStoredFile(file.fileId, 'myAffiliate')}
                      >
                        Load
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {storedFiles.dynamicWorks && storedFiles.dynamicWorks.length > 0 && (
              <div className="stored-files-group">
                <h3>DynamicWorks Files</h3>
                <ul className="stored-files-list">
                  {storedFiles.dynamicWorks.map(file => (
                    <li key={file.fileId} className="stored-file-item">
                      <div className="stored-file-info">
                        <span className="stored-file-name">{file.filename}</span>
                        <span className="stored-file-date">Uploaded: {new Date(file.uploadDate).toLocaleString()}</span>
                      </div>
                      <button 
                        className="load-file-button"
                        onClick={() => handleLoadStoredFile(file.fileId, 'dynamicWorks')}
                      >
                        Load
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="upload-card">
        <div className="upload-icon">📊</div>
        <h2>Upload New Partner Data</h2>
        <p>Please upload your partner data files to begin analysis</p>
        
        <div className="upload-controls">
          {/* MyAffiliate File Upload */}
          <div className="file-input-container">
            <label className="file-input-label" htmlFor="my-affiliate-upload">
              <span className="upload-icon-small">📁</span>
              <span>MyAffiliate Data: Drag file here or click to browse</span>
              {files.myAffiliate && <span className="file-name">{files.myAffiliate.name}</span>}
            </label>
            <input 
              id="my-affiliate-upload"
              ref={fileInputRefs.myAffiliate}
              type="file" 
              onChange={(e) => handleFileChange(e, 'myAffiliate')} 
              accept=".xlsx" 
              className="file-input"
            />
          </div>
          
          {/* DynamicWorks File Upload */}
          <div className="file-input-container">
            <label className="file-input-label" htmlFor="dynamic-works-upload">
              <span className="upload-icon-small">📁</span>
              <span>DynamicWorks Data: Drag file here or click to browse</span>
              {files.dynamicWorks && <span className="file-name">{files.dynamicWorks.name}</span>}
            </label>
            <input 
              id="dynamic-works-upload"
              ref={fileInputRefs.dynamicWorks}
              type="file" 
              onChange={(e) => handleFileChange(e, 'dynamicWorks')} 
              accept=".xlsx" 
              className="file-input"
            />
          </div>
          
          <button 
            onClick={handleUpload} 
            disabled={uploading || (!files.myAffiliate && !files.dynamicWorks)} 
            className="upload-button"
          >
            {uploading ? 'Processing data...' : 'Upload and Analyze'}
          </button>
          
          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>

        {error && <div className="error-message">Error: {error}</div>}
      </div>
      
      <div className="upload-features">
        <div className="feature-item">
          <div className="feature-icon">📈</div>
          <h3 className="feature-title">Interactive Dashboards</h3>
          <p className="feature-description">Visualize partner performance with real-time, interactive dashboards that adapt to your specific needs.</p>
        </div>
        
        <div className="feature-item">
          <div className="feature-icon">🌍</div>
          <h3 className="feature-title">Regional Analysis</h3>
          <p className="feature-description">Analyze performance data by country and region to identify your top-performing markets.</p>
        </div>
        
        <div className="feature-item">
          <div className="feature-icon">🤖</div>
          <h3 className="feature-title">AI-Powered Insights</h3>
          <p className="feature-description">Use our AI Assistant to ask questions and get instant insights about your partner performance data.</p>
        </div>
        
        <div className="feature-item">
          <div className="feature-icon">💼</div>
          <h3 className="feature-title">Partner Performance</h3>
          <p className="feature-description">Identify your top-performing partners and those needing attention with detailed metrics.</p>
        </div>
      </div>
    </div>
  );
}

export default UploadPage; 