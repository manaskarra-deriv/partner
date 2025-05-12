import React, { useState, useEffect } from 'react';
import { getAnalysisData, getTeamRegions } from '../services/api'; // Import the getTeamRegions
import { Line } from 'react-chartjs-2';
import DataSourceSelector from '../components/DataSourceSelector'; // Import the DataSourceSelector
import '../App.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function CountryAnalysisPage() {
  const [filename, setFilename] = useState('Country Data'); 
  const [countryRevenueChartData, setCountryRevenueChartData] = useState({ labels: [], datasets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countryList, setCountryList] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [allCountryData, setAllCountryData] = useState([]);
  
  // Add state for collapsible section
  const [isCountrySelectionCollapsed, setIsCountrySelectionCollapsed] = useState(true);
  
  // State variables for data source and GP Team Region
  const [dataSource, setDataSource] = useState(null);

  const fetchData = (currentFileId, source = null) => {
    if (currentFileId) {
      const storedFilename = sessionStorage.getItem('processedFilename');
      if (storedFilename) setFilename(storedFilename.replace('Data', 'Country Analysis'));
      setLoading(true);
      setError(null);
      
      // Always fetch all data - date filtering is done via hard-coded date range inside the component
      getAnalysisData(currentFileId, '', source)
        .then(response => {
          const analysisData = response.data;
          if (analysisData?.performance_analysis?.country_revenue_trends) {
            const countryData = analysisData.performance_analysis.country_revenue_trends;
            
            // Filter data to include only Oct 2024 through April 2025
            const filteredData = countryData.filter(item => {
              const dateParts = item.Month.split('-');
              if (dateParts.length >= 2) {
                const year = parseInt(dateParts[0], 10);
                const month = parseInt(dateParts[1], 10);
                // Include only Oct-Dec 2024 and Jan-Apr 2025
                return (year === 2024 && month >= 10) || (year === 2025 && month <= 4);
              }
              return false; // Exclude data with unrecognized format
            });
            
            // Save all filtered data
            setAllCountryData(filteredData);
            
            // Find countries that have at least some revenue
            const countryRevenueSums = {};
            
            // Calculate total revenue for each country
            filteredData.forEach(item => {
              const country = item.Country;
              const revenue = parseFloat(item['Deriv Revenue']) || 0;
              
              if (!countryRevenueSums[country]) {
                countryRevenueSums[country] = 0;
              }
              
              countryRevenueSums[country] += revenue;
            });
            
            // Filter to only include countries with positive revenue
            const countriesWithRevenue = Object.keys(countryRevenueSums)
              .filter(country => countryRevenueSums[country] > 0)
              .sort();
              
            console.log(`Found ${countriesWithRevenue.length} countries with positive revenue out of ${Object.keys(countryRevenueSums).length} total countries`);
            
            // Set the list of countries with revenue
            setCountryList(countriesWithRevenue);
            
            // If there are countries, automatically select the first one
            if (countriesWithRevenue.length > 0) {
              setSelectedCountry(countriesWithRevenue[0]);
              updateChartForCountry(countriesWithRevenue[0], filteredData);
            } else {
              setCountryRevenueChartData({ labels: [], datasets: [] });
              setError('No countries with positive revenue found in the data.');
            }
          } else {
            setCountryRevenueChartData({ labels: [], datasets: [] });
          }
        })
        .catch(err => {
          console.error("Error fetching country analysis data:", err);
          const errorMessage = err.response?.data?.error || err.message || 'Failed to load country analysis data.';
          setError(errorMessage);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setError('No file processed. Please upload a file first to see country analysis.');
      setLoading(false);
    }
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
    
    // Initial data fetch
    if (currentFileId) {
      fetchData(currentFileId, dataSource);
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
    } else if (dataSource === 'combined') {
      currentFileId = dynamicWorksId || myAffiliateId;
    }
    
    if (currentFileId) {
      fetchData(currentFileId, dataSource !== 'combined' ? dataSource : null);
    }
  }, [dataSource]);
  
  // New function to update chart for a specific country
  const updateChartForCountry = (country, data = allCountryData) => {
    if (!country || !data.length) return;
    
    // Filter data for the selected country
    const countryData = data.filter(item => item.Country === country);
    
    // Sort by month
    const sortedData = [...countryData].sort((a, b) => {
      const aDate = new Date(a.Month);
      const bDate = new Date(b.Month);
      return aDate - bDate;
    });
    
    // Get the months (should be Oct 2024 through Apr 2025)
    const months = sortedData.map(item => item.Month);
    
    // Update chart data
    setCountryRevenueChartData({
      labels: months,
      datasets: [{
        label: `${country} Revenue`,
        data: sortedData.map(item => item['Deriv Revenue']),
        borderColor: 'rgba(66, 133, 244, 1)',  // Google Blue
        backgroundColor: 'rgba(66, 133, 244, 0.2)',
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        fill: true
      }]
    });
  };
  
  // Handle country selection
  const handleCountrySelect = (country) => {
    setSelectedCountry(country);
    updateChartForCountry(country);
    setSearchTerm(''); // Clear search after selection
  };
  
  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  // Filter country list based on search term
  const filteredCountries = countryList.filter(country => 
    country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Enhanced chart options for a more modern look
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            family: "'Inter', sans-serif",
            size: 12
          },
          padding: 20,
          usePointStyle: true,
          boxWidth: 6
        }
      },
      title: {
        display: true,
        text: `${selectedCountry} Monthly Revenue (Oct 2024 - Apr 2025)`,
        font: { 
          size: 16,
          family: "'Inter', sans-serif",
          weight: 'bold'
        },
        padding: {
          top: 10,
          bottom: 20
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#2b2d42',
        bodyColor: '#555b6e',
        borderColor: '#e4e6e8',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        bodyFont: {
          family: "'Inter', sans-serif"
        },
        titleFont: {
          family: "'Inter', sans-serif",
          weight: 'bold'
        },
        callbacks: {
          label: function(context) {
            return `Revenue: ${context.raw.toLocaleString('en-US', { 
              style: 'currency', 
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            })}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            family: "'Inter', sans-serif"
          },
          callback: function(value) {
            return value.toLocaleString('en-US', { 
              style: 'currency', 
              currency: 'USD',
              notation: 'compact',
              compactDisplay: 'short'
            });
          }
        },
        title: {
          display: true,
          text: 'Deriv Revenue',
          font: {
            family: "'Inter', sans-serif",
            size: 14,
            weight: 'bold'
          }
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            family: "'Inter', sans-serif"
          },
          maxRotation: 45,
          minRotation: 45
        },
        title: {
          display: true,
          text: 'Month',
          font: {
            family: "'Inter', sans-serif",
            size: 14,
            weight: 'bold'
          }
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    },
    animations: {
      tension: {
        duration: 1000,
        easing: 'easeInOutQuad'
      }
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="loading"></div>
          <p style={{ marginTop: '20px' }}>Loading country analysis data...</p>
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

  return (
    <div className="page-container">
      <h1>PartnerDashboard Country Revenue Analysis</h1>
      
      {/* Data Source Selector */}
      <DataSourceSelector
        selectedSource={dataSource}
        onSourceChange={setDataSource}
      />
      
      {/* Country Selection UI */}
      <div className="card country-selection-card">
        <div className="country-selection-header" onClick={() => setIsCountrySelectionCollapsed(!isCountrySelectionCollapsed)}>
          <div className="header-left">
            <span className="highlight-icon">🌎</span>
            <h3>Select a Country</h3>
          </div>
          <div className="collapse-toggle">
            {selectedCountry && (
              <span className="selected-country-indicator">
                Selected: <strong>{selectedCountry}</strong>
              </span>
            )}
            <span className="toggle-icon">
              {isCountrySelectionCollapsed ? '▼' : '▲'}
            </span>
          </div>
        </div>
        
        {!isCountrySelectionCollapsed && (
          <div className="country-selection-container">
            <p className="selection-subtitle">
              Showing {countryList.length} countries with positive revenue
            </p>
            <div className="country-search-container">
              <div className="search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search countries..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="country-search-input"
                />
                {searchTerm && (
                  <button 
                    className="clear-search-btn"
                    onClick={() => setSearchTerm('')}
                  >
                    ✕
                  </button>
                )}
              </div>
              
              {searchTerm && filteredCountries.length > 0 && (
                <div className="country-dropdown search-dropdown">
                  {filteredCountries.map(country => (
                    <div 
                      key={country}
                      onClick={() => handleCountrySelect(country)}
                      className="country-option"
                    >
                      {country}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="country-buttons">
              {countryList.map(country => (
                <button
                  key={country}
                  onClick={() => handleCountrySelect(country)}
                  className={`country-button ${selectedCountry === country ? 'active' : ''}`}
                >
                  {country}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Country Revenue Chart */}
      {countryRevenueChartData.datasets.length > 0 ? (
        <div className="card chart-card">
          <div className="chart-header">
            <h2>{selectedCountry} Monthly Revenue</h2>
            <div className="chart-details">
              <div className="chart-period">Oct 2024 - Apr 2025</div>
              {dataSource && dataSource !== 'combined' && 
                <div className="chart-source">Source: {dataSource === 'myAffiliate' ? 'MyAffiliate' : 'PartnerDashboard'}</div>}
            </div>
          </div>
          <div className="chart-container">
            <Line options={chartOptions} data={countryRevenueChartData} />
          </div>
          <div className="chart-footer">
            <div className="chart-stat">
              <span className="stat-label">Average Revenue:</span>
              <span className="stat-value">
                {(() => {
                  const values = countryRevenueChartData.datasets[0].data;
                  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
                  return avg.toLocaleString('en-US', { 
                    style: 'currency', 
                    currency: 'USD',
                    maximumFractionDigits: 0
                  });
                })()}
              </span>
            </div>
            <div className="chart-stat">
              <span className="stat-label">Peak Revenue:</span>
              <span className="stat-value">
                {(() => {
                  const values = countryRevenueChartData.datasets[0].data;
                  const max = Math.max(...values);
                  return max.toLocaleString('en-US', { 
                    style: 'currency', 
                    currency: 'USD',
                    maximumFractionDigits: 0
                  });
                })()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="card empty-chart-card">
          <div className="no-data-message">
            <span className="no-data-icon">📊</span>
            <p>No revenue data available for {selectedCountry || 'the selected country'}.</p>
          </div>
        </div>
      )}

      <style jsx>{`
        .country-selection-card {
          margin-bottom: 24px;
          transition: all 0.3s ease;
          border-top: 4px solid var(--primary);
        }
        
        .country-selection-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          cursor: pointer;
          user-select: none;
        }
        
        .country-selection-header:hover {
          background-color: rgba(67, 97, 238, 0.03);
        }
        
        .header-left {
          display: flex;
          align-items: center;
        }
        
        .header-left h3 {
          margin: 0;
          font-size: 1.3rem;
        }
        
        .collapse-toggle {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .selected-country-indicator {
          font-size: 0.9rem;
          color: var(--medium-text);
        }
        
        .toggle-icon {
          font-size: 0.8rem;
          color: var(--medium-text);
          transition: transform 0.3s ease;
        }

        .country-selection-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: relative;
          z-index: 5;
          padding: 0 16px 16px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .country-selection-container h3 {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
          font-size: 1.3rem;
        }

        .highlight-icon {
          margin-right: 8px;
          font-size: 1.5rem;
        }

        .country-search-container {
          position: relative;
          margin-bottom: 8px;
        }

        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          color: var(--medium-text);
          font-size: 1rem;
        }

        .country-search-input {
          width: 100%;
          padding: 12px 40px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          font-size: 0.95rem;
          transition: all 0.2s ease;
        }

        .country-search-input:focus {
          box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.15);
          border-color: var(--primary);
        }

        .clear-search-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          color: var(--medium-text);
          cursor: pointer;
          font-size: 1rem;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          width: 24px;
          height: 24px;
        }

        .clear-search-btn:hover {
          background-color: rgba(0, 0, 0, 0.05);
          color: var(--dark-text);
        }

        .country-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid var(--border-color);
          border-radius: 0 0 var(--radius-md) var(--radius-md);
          box-shadow: var(--shadow-md);
          max-height: 200px;
          overflow-y: auto;
          z-index: 100;
        }

        .country-option {
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .country-option:hover {
          background: rgba(67, 97, 238, 0.05);
        }

        .country-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .country-button {
          padding: 10px 16px;
          border-radius: 100px;
          border: 1px solid var(--border-color);
          background: white;
          color: var(--medium-text);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .country-button:hover {
          border-color: var(--primary);
          color: var(--primary);
          transform: translateY(-2px);
        }
        
        .country-button.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
          box-shadow: 0 4px 8px rgba(67, 97, 238, 0.25);
        }

        .chart-card {
          border-top: 4px solid var(--primary-light);
          position: relative;
          z-index: 1;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        
        .chart-details {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .chart-period, .chart-source {
          padding: 8px 16px;
          background: rgba(67, 97, 238, 0.1);
          border-radius: 100px;
          color: var(--primary);
          font-weight: 500;
          font-size: 0.9rem;
        }

        .chart-container {
          height: 400px;
          margin-bottom: 24px;
        }

        .chart-footer {
          display: flex;
          gap: 24px;
          border-top: 1px solid var(--border-color);
          padding-top: 16px;
        }

        .chart-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-label {
          font-size: 0.85rem;
          color: var(--medium-text);
        }

        .stat-value {
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--primary);
        }

        .empty-chart-card {
          height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .no-data-message {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .no-data-icon {
          font-size: 3rem;
          opacity: 0.5;
        }

        @media (max-width: 768px) {
          .chart-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .chart-footer {
            flex-direction: column;
            gap: 16px;
          }
        }

        .selection-subtitle {
          color: var(--medium-text);
          font-size: 0.9rem;
          margin-top: -12px;
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}

export default CountryAnalysisPage; 