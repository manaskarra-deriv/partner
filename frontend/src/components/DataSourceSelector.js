import React from 'react';

/**
 * Component for toggling between MyAffiliate and DynamicWorks data sources
 */
function DataSourceSelector({ selectedSource, onSourceChange }) {
  const sources = [
    { id: 'myAffiliate', label: 'MyAffiliate', icon: '📈' },
    { id: 'dynamicWorks', label: 'DynamicWorks', icon: '📉' }
  ];
  
  // Check if the sources are available in sessionStorage
  const myAffiliateId = sessionStorage.getItem('myAffiliateId');
  const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
  
  // Determine which sources are available
  const availableSources = sources.filter(source => {
    if (source.id === 'myAffiliate' && !myAffiliateId) return false;
    if (source.id === 'dynamicWorks' && !dynamicWorksId) return false;
    return true;
  });
  
  // If no sources are selected, use the first available one
  const currentSource = selectedSource || (availableSources.length > 0 ? availableSources[0].id : null);

  return (
    <div className="data-source-selector">
      <div className="data-source-label">Data Source:</div>
      <div className="data-source-options">
        {availableSources.map(source => (
          <button
            key={source.id}
            className={`data-source-button ${currentSource === source.id ? 'active' : ''}`}
            onClick={() => onSourceChange(source.id)}
          >
            <span className="data-source-icon">{source.icon}</span>
            {source.label}
          </button>
        ))}
      </div>
      
      <style jsx>{`
        .data-source-selector {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        
        .data-source-label {
          font-weight: 500;
          color: var(--dark-text);
        }
        
        .data-source-options {
          display: flex;
          gap: 8px;
        }
        
        .data-source-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 100px;
          font-size: 0.9rem;
          border: 1px solid var(--border-color);
          background: white;
          color: var(--dark-text);
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 500;
        }
        
        .data-source-button:hover {
          border-color: var(--primary);
          color: var(--primary);
          background-color: rgba(67, 97, 238, 0.05);
        }
        
        .data-source-button.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        
        .data-source-icon {
          font-size: 1.1rem;
        }
      `}</style>
    </div>
  );
}

export default DataSourceSelector; 