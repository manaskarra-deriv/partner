import React, { useState, useEffect } from 'react';
import { getAnalysisData } from '../services/api';
import DateRangeSelector from '../components/DateRangeSelector';
import DataSourceSelector from '../components/DataSourceSelector';
// import { Bar } from 'react-chartjs-2'; // Uncomment if adding charts later
import './DashboardPage.css'; // Re-use some styling if applicable, or create new CSS

function PartnerPerformancePage() {
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('positive'); // For tab navigation
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
    preset: 'all'
  });
  // Add data source state
  const [dataSource, setDataSource] = useState(null);

  const fetchData = (currentFileId, dateParams = {}, source = null) => {
    setLoading(true);
    setError(null);
    
    // Construct query parameters for date filtering
    let queryParams = '';
    if (dateParams.startDate && dateParams.endDate) {
      queryParams = `?startDate=${dateParams.startDate}&endDate=${dateParams.endDate}&preset=${dateParams.preset || 'all'}`;
    }
    
    getAnalysisData(currentFileId, queryParams, source)
      .then(response => {
        setPerformanceData(response.data?.performance_analysis);
      })
      .catch(err => {
        console.error("Error fetching partner performance data:", err);
        setError(err.response?.data?.error || err.message || 'Failed to load data.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const myAffiliateId = sessionStorage.getItem('myAffiliateId');
    const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
    let currentFileId;
    
    // Set initial data source
    if (myAffiliateId && dynamicWorksId) {
      setDataSource('myAffiliate'); // Default to myAffiliate instead of dynamicWorks
      currentFileId = myAffiliateId;
    } else if (dynamicWorksId) {
      setDataSource('dynamicWorks');
      currentFileId = dynamicWorksId;
    } else if (myAffiliateId) {
      setDataSource('myAffiliate');
      currentFileId = myAffiliateId;
    } else {
      setDataSource(null);
      currentFileId = sessionStorage.getItem('currentFileId'); // Fallback
    }
    
    if (currentFileId) {
      fetchData(currentFileId, dateRange, dataSource);
    } else {
      setError('No file processed. Please upload a file.');
      setLoading(false);
    }
  }, []);
  
  // Handle data source change
  useEffect(() => {
    if (!dataSource) return;
    
    let currentFileId;
    const myAffiliateId = sessionStorage.getItem('myAffiliateId');
    const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
    
    if (dataSource === 'myAffiliate') {
      currentFileId = myAffiliateId;
    } else if (dataSource === 'dynamicWorks') {
      currentFileId = dynamicWorksId;
    }
    
    if (currentFileId) {
      fetchData(currentFileId, dateRange, dataSource);
    }
  }, [dataSource]);

  const handleDateRangeChange = (newDateRange) => {
    setDateRange(newDateRange);
    
    let currentFileId;
    if (dataSource === 'myAffiliate') {
      currentFileId = sessionStorage.getItem('myAffiliateId');
    } else if (dataSource === 'dynamicWorks') {
      currentFileId = sessionStorage.getItem('dynamicWorksId');
    } else {
      currentFileId = sessionStorage.getItem('currentFileId'); // Fallback
    }
    
    if (currentFileId) {
      fetchData(currentFileId, newDateRange, dataSource);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="loading"></div>
          <p style={{ marginTop: '20px' }}>Loading partner performance data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="error-message">Error: {error}</div>
        </div>
      </div>
    );
  }

  if (!performanceData) {
    return (
      <div className="page-container">
        <div className="card">
          <p>No performance data available.</p>
        </div>
      </div>
    );
  }

  const { partners_with_positive_commissions, underperforming_partners, top_partners_by_revenue } = performanceData;

  // Tab navigation styles
  const tabStyle = {
    display: 'flex',
    borderBottom: '1px solid var(--border-color)',
    marginBottom: '25px',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    padding: '0 10px'
  };
  
  const tabItemStyle = (isActive) => ({
    padding: '12px 24px',
    marginRight: '12px',
    cursor: 'pointer',
    fontWeight: isActive ? '600' : '400',
    color: isActive ? 'var(--primary)' : 'var(--medium-text)',
    borderBottom: isActive ? '3px solid var(--primary)' : 'none',
    transition: 'all 0.3s ease',
    marginBottom: '-1px'
  });

  return (
    <div className="page-container">
      <h1>PartnerDashboard Partner Performance Analysis</h1>
      
      <div className="controls-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '20px' }}>
        {/* Data Source Selector */}
        <DataSourceSelector
          selectedSource={dataSource}
          onSourceChange={setDataSource}
        />
        
        {/* Date Range Selector */}
        <DateRangeSelector onDateRangeChange={handleDateRangeChange} />
      </div>
      
      {/* Modern tab navigation */}
      <div style={tabStyle}>
        <div 
          style={tabItemStyle(activeTab === 'positive')} 
          onClick={() => setActiveTab('positive')}
        >
          Partners Generating Revenue
        </div>
        <div 
          style={tabItemStyle(activeTab === 'top')} 
          onClick={() => setActiveTab('top')}
        >
          Top 10 Partners
        </div>
        <div 
          style={tabItemStyle(activeTab === 'underperforming')} 
          onClick={() => setActiveTab('underperforming')}
        >
          Underperforming Partners
        </div>
      </div>

      {/* Partners Generating Commission Section */}
      {activeTab === 'positive' && (
        <div className="card">
          <h2>Partners Generating Revenue (via Commissions)</h2>
          <p style={{ color: 'var(--medium-text)', marginBottom: '20px' }}>
            These partners have earned positive commissions over multiple months, representing key revenue-generating affiliates.
          </p>
          
          {partners_with_positive_commissions && partners_with_positive_commissions.length > 0 ? (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Partner ID</th>
                    <th>Country</th>
                    <th>Region</th>
                    <th>Months with +Commission</th>
                    <th>Total Commissions Received</th>
                  </tr>
                </thead>
                <tbody>
                  {partners_with_positive_commissions.map((partner, index) => (
                    <tr key={`pos-${index}`}>
                      <td><strong>{partner['Partner ID']}</strong></td>
                      <td>{partner.Country || 'N/A'}</td>
                      <td>{partner.Region || 'N/A'}</td>
                      <td>{partner.PositiveCommissionMonths}</td>
                      <td style={{ color: 'var(--success)' }}>
                        {Number(partner.TotalCommissionsReceived).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="info-message" style={{ padding: '15px', backgroundColor: 'rgba(76, 201, 240, 0.1)', borderRadius: '8px' }}>
              No partners found with positive commissions in this dataset.
            </div>
          )}
        </div>
      )}

      {/* Top Partners by Revenue (already in dashboard, but can be here too for context) */}
      {activeTab === 'top' && (
        <div className="card">
          <h2>Top 10 Partners (by Total Deriv Revenue)</h2>
          <p style={{ color: 'var(--medium-text)', marginBottom: '20px' }}>
            These are the highest-performing partners based on total Deriv Revenue generated, representing your most valuable affiliates.
          </p>
          
          {top_partners_by_revenue && top_partners_by_revenue.length > 0 ? (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Partner ID</th>
                    <th>Country</th>
                    <th>Region</th>
                    <th>Total Deriv Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {top_partners_by_revenue.map((partner, index) => (
                    <tr key={`top-${index}`}>
                      <td><strong>{partner['Partner ID']}</strong></td>
                      <td>{partner.Country || 'N/A'}</td>
                      <td>{partner.Region || 'N/A'}</td>
                      <td style={{ color: index < 3 ? 'var(--success)' : 'inherit' }}>
                        {Number(partner['Deriv Revenue']).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="info-message" style={{ padding: '15px', backgroundColor: 'rgba(76, 201, 240, 0.1)', borderRadius: '8px' }}>
              No top partner data available.
            </div>
          )}
        </div>
      )}

      {/* Underperforming Partners Section */}
      {activeTab === 'underperforming' && (
        <div className="card">
          <h2>Underperforming Partners (Negative or Zero Deriv Revenue)</h2>
          <p style={{ color: 'var(--medium-text)', marginBottom: '20px' }}>
            These partners have negative or zero Deriv Revenue, indicating potential issues or fraudulent activities that may require investigation.
          </p>
          
          {underperforming_partners && underperforming_partners.length > 0 ? (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Partner ID</th>
                    <th>Country</th>
                    <th>Region</th>
                    <th>Sum of Negative/Zero Deriv Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {underperforming_partners.map((partner, index) => (
                    <tr key={`under-${index}`}>
                      <td><strong>{partner['Partner ID']}</strong></td>
                      <td>{partner.Country || 'N/A'}</td>
                      <td>{partner.Region || 'N/A'}</td>
                      <td style={{ color: 'var(--danger)' }}>
                        {Number(partner['Deriv Revenue']).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="info-message" style={{ padding: '15px', backgroundColor: 'rgba(76, 201, 240, 0.1)', borderRadius: '8px' }}>
              No partners identified as underperforming (based on Deriv Revenue &lt;= 0) in this dataset.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PartnerPerformancePage; 