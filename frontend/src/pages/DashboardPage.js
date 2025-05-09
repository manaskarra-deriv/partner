import React, { useState, useEffect } from 'react';
import { getAnalysisData, getTopPartner, getComparisonData } from '../services/api';
import { Line } from 'react-chartjs-2';
import DataSourceSelector from '../components/DataSourceSelector';
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
import './DashboardPage.css';

// Chart.js registration
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function DashboardPage() {
  const [fileId, setFileId] = useState(null);
  const [filename, setFilename] = useState('Uploaded Data');
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data processing for Charts
  const [monthlyRevenueChartData, setMonthlyRevenueChartData] = useState({ labels: [], datasets: [] });
  const [regionalTrendsChartData, setRegionalTrendsChartData] = useState({ labels: [], datasets: [] });

  // Top Partner query and result
  const [topPartnerMetric, setTopPartnerMetric] = useState('Deriv Revenue');
  const [topPartnerYear, setTopPartnerYear] = useState(new Date().getFullYear());
  const [topPartnerMonth, setTopPartnerMonth] = useState(4);
  const [topPartnerResult, setTopPartnerResult] = useState(null);
  const [isFetchingTopPartner, setIsFetchingTopPartner] = useState(false);
  const [topPartnerError, setTopPartnerError] = useState(null);
  
  // Data source selection
  const [dataSource, setDataSource] = useState(null);

  // Fetch data based on the selected data source
  const fetchData = (currentFileId, source = null) => {
    if (currentFileId) {
      const storedFilename = sessionStorage.getItem('processedFilename');
      if (storedFilename) setFilename(storedFilename);
      setLoading(true);
      setError(null);
      
      getAnalysisData(currentFileId, '', source)
        .then(response => {
          setAnalysisData(response.data);
        })
        .catch(err => {
          console.error("Error fetching analysis data:", err);
          const errorMessage = err.response?.data?.error || err.message || 'Failed to load analysis data.';
          setError(errorMessage);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setError('No file processed yet. Please upload a file first.');
      setLoading(false);
    }
  };

  // Initial data load
  useEffect(() => {
    const myAffiliateId = sessionStorage.getItem('myAffiliateId');
    const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
    let currentFileId;
    
    // Set initial data source
    if (myAffiliateId && dynamicWorksId) {
      setDataSource('myAffiliate'); // Default to myAffiliate when both are available
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
    
    // Set the file ID for use in other functions
    if (currentFileId) {
      setFileId(currentFileId);
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
    }
    
    if (currentFileId) {
      setFileId(currentFileId);
      fetchData(currentFileId, dataSource);
    }
  }, [dataSource]);

  useEffect(() => {
    if (analysisData && analysisData.kpis && analysisData.kpis.monthly_kpis) {
      const monthlyKpis = analysisData.kpis.monthly_kpis;
      // Filter data to only keep until April 2025
      const filteredKpis = monthlyKpis.filter(item => {
        const dateParts = item.Month.split('-');
        if (dateParts.length >= 2) {
          const year = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10);
          // Keep data until April 2025
          return year < 2025 || (year === 2025 && month <= 4);
        }
        return false;
      });
      
      // Sort by month
      filteredKpis.sort((a, b) => new Date(a.Month) - new Date(b.Month)); 
      setMonthlyRevenueChartData({
        labels: filteredKpis.map(d => d.Month),
        datasets: [
          {
            label: 'Deriv Revenue',
            data: filteredKpis.map(d => d.monthly_deriv_revenue),
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            tension: 0.3,
          },
          {
            label: 'Expected Revenue',
            data: filteredKpis.map(d => d.monthly_expected_revenue),
            borderColor: 'rgb(53, 162, 235)',
            backgroundColor: 'rgba(53, 162, 235, 0.5)',
            tension: 0.3,
          },
        ],
      });
    } else {
      setMonthlyRevenueChartData({ labels: [], datasets: [] });
    }

    if (analysisData?.performance_analysis?.regional_revenue_trends) {
      const regionalData = analysisData.performance_analysis.regional_revenue_trends;
      
      // Filter data to only keep until April 2025
      const filteredRegionalData = regionalData.filter(item => {
        const dateParts = item.Month.split('-');
        if (dateParts.length >= 2) {
          const year = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10);
          // Keep data until April 2025
          return year < 2025 || (year === 2025 && month <= 4);
        }
        return false;
      });
      
      // Get unique sorted months (labels)
      const months = [...new Set(filteredRegionalData.map(d => d.Month))].sort();
      
      // Get unique regions
      const regions = [...new Set(filteredRegionalData.map(d => d.Region))];
      
      // Prepare datasets for each region
      const datasets = regions.map((region, index) => {
        // Enhanced color palette for better visibility
        const colors = [
          'rgba(255, 99, 132, 0.8)',   // Pink
          'rgba(54, 162, 235, 0.8)',   // Blue
          'rgba(255, 206, 86, 0.8)',   // Yellow
          'rgba(75, 192, 192, 0.8)',   // Teal
          'rgba(153, 102, 255, 0.8)',  // Purple
          'rgba(255, 159, 64, 0.8)',   // Orange
          'rgba(76, 201, 240, 0.8)',   // Light blue
          'rgba(67, 97, 238, 0.8)',    // Indigo
          'rgba(247, 37, 133, 0.8)',   // Hot pink
          'rgba(58, 134, 255, 0.8)',   // Sky blue
          'rgba(131, 56, 236, 0.8)',   // Violet
          'rgba(251, 133, 0, 0.8)'     // Amber
        ];
        const color = colors[index % colors.length]; 
        
        // For each month, find the revenue for the current region
        const data = months.map(month => {
          const entry = filteredRegionalData.find(d => d.Month === month && d.Region === region);
          return entry ? entry['Deriv Revenue'] : 0;
        });
        
        return {
          label: region,
          data: data,
          borderColor: color.replace('0.8', '1'),
          backgroundColor: color,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        };
      });

      // Filter out regions that have no contribution (all zeros)
      const nonZeroDatasets = datasets.filter(dataset => 
        dataset.data.some(value => value !== 0)
      );

      setRegionalTrendsChartData({ labels: months, datasets: nonZeroDatasets });
    } else {
      setRegionalTrendsChartData({ labels: [], datasets: [] });
    }

  }, [analysisData]); // Re-run when analysisData changes

  const handleTopPartnerSubmit = async (event) => {
    event.preventDefault();
    if (!fileId || !topPartnerMetric || !topPartnerYear || !topPartnerMonth) {
      setTopPartnerError("Please ensure file is processed and all fields are set.");
      return;
    }
    setIsFetchingTopPartner(true);
    setTopPartnerError(null);
    setTopPartnerResult(null);
    try {
      const source = dataSource !== 'combined' ? dataSource : null;
      const response = await getTopPartner(fileId, topPartnerMetric, topPartnerYear, topPartnerMonth, source);
      setTopPartnerResult(response.data);
    } catch (err) {
      console.error("Error fetching top partner:", err);
      setTopPartnerError(err.response?.data?.error || err.message || "Failed to fetch top partner.");
    }
    finally {
      setIsFetchingTopPartner(false);
    }
  };

  if (loading) {
    return <div className="page-container dashboard-container"><p>Loading dashboard data...</p></div>;
  }

  if (error) {
    return <div className="page-container dashboard-container error-message"><p>Error: {error}</p></div>;
  }

  if (!analysisData) {
    return <div className="page-container dashboard-container"><p>No data to display. Please try <a href="/">uploading a file</a> again.</p></div>;
  }

  const { kpis, performance_analysis } = analysisData;

  // --- Chart Options (Enhanced) --- 
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          usePointStyle: true,
          padding: 20,
          font: { size: 11 }
        }
      },
      title: {
        display: true,
        text: 'Monthly Revenue Trends (Oct 2024 - Apr 2025)',
        font: { size: 14, weight: 'bold' },
        padding: {
          top: 10,
          bottom: 30
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1c1c27',
        bodyColor: '#4e4e67',
        borderColor: '#e9ecef',
        borderWidth: 1,
        usePointStyle: true,
        boxWidth: 8,
        boxPadding: 6,
        padding: 12,
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.raw.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
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
          callback: function(value) {
            return value.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              notation: 'compact',
              compactDisplay: 'short'
            });
          }
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          padding: 10,
          font: {
            size: 11
          }
        },
        afterFit: function(scaleInstance) {
          // Add more bottom padding to ensure labels are fully visible
          scaleInstance.paddingBottom = 30;
        }
      }
    },
    layout: {
      padding: {
        bottom: 30
      }
    }
  };
  
  const regionalChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          boxWidth: 12,
          usePointStyle: true,
          padding: 10,
          font: { size: 11 }
        },
        display: true,
        maxHeight: 80
      },
      title: {
        display: true,
        text: 'Monthly Deriv Revenue by Region (Oct 2024 - Apr 2025)',
        font: { size: 14, weight: 'bold' },
        padding: {
          top: 10,
          bottom: 30
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1c1c27',
        bodyColor: '#4e4e67',
        borderColor: '#e9ecef',
        borderWidth: 1,
        usePointStyle: true,
        boxWidth: 8,
        boxPadding: 6,
        padding: 12,
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${context.raw.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
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
          callback: function(value) {
            return value.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              notation: 'compact',
              compactDisplay: 'short'
            });
          }
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          padding: 10,
          font: {
            size: 11
          }
        },
        afterFit: function(scaleInstance) {
          // Add more bottom padding to ensure labels are fully visible
          scaleInstance.paddingBottom = 30;
        }
      }
    },
    layout: {
      padding: {
        bottom: 30
      }
    }
  };

  return (
    <div className="page-container dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Partner Analytics Dashboard</h1>
        <p className="dashboard-subtitle">Real-time performance insights for April 2025. Understand your partner network's revenue, commissions, and client acquisition metrics at a glance.</p>
      </div>
      
      {/* Data Source Selector */}
      <DataSourceSelector
        selectedSource={dataSource}
        onSourceChange={setDataSource}
      />

      {/* KPIs Section */}
      {kpis && kpis.total_kpis && (
        <div className="kpi-section card">
          <h2>High-Level KPIs (Total)</h2>
          <div className="kpi-grid">
            <div className="kpi-item">
              <div className="kpi-item-title">Expected Revenue</div>
              <span>{Number(kpis.total_kpis.total_expected_revenue).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</span>
            </div>
            <div className="kpi-item">
              <div className="kpi-item-title">Deriv Revenue</div>
              <span>{Number(kpis.total_kpis.total_deriv_revenue).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</span>
            </div>
            <div className="kpi-item">
              <div className="kpi-item-title">Partner Commissions</div>
              <span>{Number(kpis.total_kpis.total_partner_commissions).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</span>
            </div>
            <div className="kpi-item">
              <div className="kpi-item-title">Total Deposits</div>
              <span>{Number(kpis.total_kpis.total_total_deposits).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</span>
            </div>
            <div className="kpi-item">
              <div className="kpi-item-title">First-Time Traders</div>
              <span>{Number(kpis.total_kpis.total_ftt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Monthly KPIs Table */}
      {analysisData?.kpis?.monthly_kpis?.length > 0 ? (
        <div className="monthly-kpis-section card">
          <h2>
            Monthly KPIs
            <span className="period-badge">Oct 2024 - Apr 2025</span>
          </h2>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Expected Revenue</th>
                  <th>Deriv Revenue</th>
                  <th>Partner Commissions</th>
                  <th>Total Deposits</th>
                  <th>Active Clients</th>
                  <th>FTT</th>
                </tr>
              </thead>
              <tbody>
                {kpis.monthly_kpis
                  .filter(monthData => {
                    const dateParts = monthData.Month.split('-');
                    if (dateParts.length >= 2) {
                      const year = parseInt(dateParts[0], 10);
                      const month = parseInt(dateParts[1], 10);
                      return year < 2025 || (year === 2025 && month <= 4);
                    }
                    return false;
                  })
                  .map((monthData, index) => (
                    <tr key={index}>
                      <td>{monthData.Month}</td>
                      <td>{Number(monthData.monthly_expected_revenue).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</td>
                      <td>{Number(monthData.monthly_deriv_revenue).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</td>
                      <td>{Number(monthData.monthly_partner_commissions).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</td>
                      <td>{Number(monthData.monthly_total_deposits).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</td>
                      <td>{Number(monthData.monthly_active_clients).toLocaleString()}</td>
                      <td>{Number(monthData.monthly_ftt).toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="monthly-kpis-section card">
          <h2>Monthly KPIs</h2>
          <p>No monthly data available to chart.</p>
        </div>
      )}

      {/* Chart Section: Side-by-side Monthly and Regional Charts */}
      <div className="side-by-side-charts">
        {/* Monthly Revenue Chart */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Monthly Revenue Trends</h3>
            <div className="chart-period">Oct 2024 - Apr 2025</div>
          </div>
          <div className="chart-container">
            <Line options={lineChartOptions} data={monthlyRevenueChartData} />
          </div>
        </div>

        {/* Regional Trends Chart */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">Regional Performance</h3>
            <div className="chart-period">April 2025</div>
          </div>
          <div className="chart-container">
            <Line options={regionalChartOptions} data={regionalTrendsChartData} />
          </div>
        </div>
      </div>
      
      {/* Section for Top Partner Query */}
      <div className="top-partner-query-section card">
        <h2>Find Top Partner for Specific Metric & Month</h2>
        <form onSubmit={handleTopPartnerSubmit} className="top-partner-form">
          <div>
            <label htmlFor="tp-metric">Metric:</label>
            <select 
              id="tp-metric" 
              value={topPartnerMetric} 
              onChange={(e) => setTopPartnerMetric(e.target.value)}
            >
              <option value="Deriv Revenue">Deriv Revenue</option>
              <option value="Expected Revenue">Expected Revenue</option>
              <option value="Partner Commissions">Partner Commissions</option>
              <option value="Total Deposits">Total Deposits</option>
              <option value="Active Clients">Active Clients</option>
              <option value="FTT">FTT</option>
            </select>
          </div>
          <div>
            <label htmlFor="tp-year">Year:</label>
            <input 
              type="number" 
              id="tp-year" 
              value={topPartnerYear} 
              onChange={(e) => setTopPartnerYear(parseInt(e.target.value, 10))}
              placeholder="YYYY"
            />
          </div>
          <div>
            <label htmlFor="tp-month">Month (1-12):</label>
            <input 
              type="number" 
              id="tp-month" 
              value={topPartnerMonth} 
              onChange={(e) => setTopPartnerMonth(parseInt(e.target.value, 10))}
              min="1" max="12"
              placeholder="MM"
            />
          </div>
          <button type="submit" disabled={isFetchingTopPartner || !fileId}>
            {isFetchingTopPartner ? 'Fetching...' : 'Get Top Partner'}
          </button>
        </form>
        
        {topPartnerError && <p className="error-message" style={{marginTop: '10px'}}>{topPartnerError}</p>}
        
        {topPartnerResult && (
          <div className="top-partner-result">
            {topPartnerResult.message ? (
              <p>{topPartnerResult.message}</p>
            ) : topPartnerResult.error ? (
              <p className="error-message">Error: {topPartnerResult.error}</p>
            ) : (
              <div>
                <strong>Top Partner for {topPartnerResult.Metric || topPartnerMetric} in {topPartnerResult.Month}/{topPartnerResult.Year}:</strong>
                
                <div className="partner-details">
                  <div className="partner-detail-item">
                    <div className="detail-label">Partner ID</div>
                    <div className="detail-value">{topPartnerResult['Partner ID']}</div>
                  </div>
                  
                  <div className="partner-detail-item">
                    <div className="detail-label">{topPartnerResult.Metric || topPartnerMetric}</div>
                    <div className="detail-value">{Number(topPartnerResult[topPartnerResult.Metric || topPartnerMetric]).toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}</div>
                  </div>
                  
                  <div className="partner-detail-item">
                    <div className="detail-label">Country</div>
                    <div className="detail-value">{topPartnerResult.Country}</div>
                  </div>
                  
                  <div className="partner-detail-item">
                    <div className="detail-label">Region</div>
                    <div className="detail-value">{topPartnerResult.Region}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .side-by-side-charts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        
        .chart-card {
          background-color: var(--card-bg);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          padding: var(--space-lg);
          transition: box-shadow 0.3s ease, transform 0.3s ease;
          border: 1px solid var(--border-color);
          height: 650px;
        }
        
        .chart-card:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-2px);
        }
        
        .chart-container {
          height: 100%;
          width: 100%;
        }
        
        @media (max-width: 992px) {
          .side-by-side-charts {
            grid-template-columns: 1fr;
          }
          
          .chart-card {
            height: 500px;
          }
        }
      `}</style>
    </div>
  );
}

export default DashboardPage; 