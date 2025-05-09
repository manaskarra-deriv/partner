import React, { useState, useEffect } from 'react';
import { getAnalysisData } from '../services/api';
import { Line } from 'react-chartjs-2';
import DateRangeSelector from '../components/DateRangeSelector';
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

// Register Chart.js components (ensure this is done once, typically in App.js or here)
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function OverallPerformancePage() {
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState('Overall Performance');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
    preset: 'all'
  });
  const [dataSource, setDataSource] = useState(null);

  const fetchData = (currentFileId, dateParams = {}, source = null) => {
    if (currentFileId) {
      const storedFilename = sessionStorage.getItem('processedFilename');
      if (storedFilename) setFilename(storedFilename.replace('Data', 'Overall Performance'));
      setLoading(true);
      setError(null);

      // Construct query parameters for date filtering
      let queryParams = '';
      if (dateParams.startDate && dateParams.endDate) {
        queryParams = `?startDate=${dateParams.startDate}&endDate=${dateParams.endDate}&preset=${dateParams.preset || 'all'}`;
      }

      getAnalysisData(currentFileId, queryParams, source)
        .then(response => {
          const kpiData = response.data?.kpis;
          if (kpiData?.monthly_kpis && kpiData.monthly_kpis.length > 0) {
            // Filter data to only include up to April 2025
            const filteredMonthlyKpis = kpiData.monthly_kpis.filter(item => {
              const dateParts = item.Month.split('-');
              if (dateParts.length >= 2) {
                const year = parseInt(dateParts[0], 10);
                const month = parseInt(dateParts[1], 10);
                return year < 2025 || (year === 2025 && month <= 4);
              }
              return true; // Include data with unrecognized format
            });
            
            // Sort by month for proper time-series display
            const monthlyKpis = [...filteredMonthlyKpis].sort((a, b) => new Date(a.Month) - new Date(b.Month));
            
            setChartData({
              labels: monthlyKpis.map(d => d.Month),
              datasets: [
                {
                  label: 'Active Clients',
                  data: monthlyKpis.map(d => d.monthly_active_clients),
                  borderColor: 'rgb(66, 133, 244)', // Google Blue
                  backgroundColor: 'rgba(66, 133, 244, 0.2)',
                  yAxisID: 'y',
                  tension: 0.3,
                  borderWidth: 2,
                  pointRadius: 3,
                  pointHoverRadius: 6,
                  fill: true,
                },
                {
                  label: 'First-Time Traders (FTT)',
                  data: monthlyKpis.map(d => d.monthly_ftt),
                  borderColor: 'rgb(219, 68, 55)', // Google Red
                  backgroundColor: 'rgba(219, 68, 55, 0.2)',
                  yAxisID: 'y',
                  tension: 0.3,
                  borderWidth: 2,
                  pointRadius: 3,
                  pointHoverRadius: 6,
                  fill: true,
                },
                {
                  label: 'Active Partners',
                  data: monthlyKpis.map(d => d.monthly_active_partners || 0),
                  borderColor: 'rgb(15, 157, 88)', // Google Green
                  backgroundColor: 'rgba(15, 157, 88, 0.2)',
                  yAxisID: 'y',
                  tension: 0.3,
                  borderWidth: 2,
                  pointRadius: 3,
                  pointHoverRadius: 6,
                  fill: true,
                },
              ],
            });
          } else {
            setChartData({ labels: [], datasets: [] });
            setError('Monthly KPI data for the chart is not available.');
          }
        })
        .catch(err => {
          console.error("Error fetching overall performance data:", err);
          setError(err.response?.data?.error || err.message || 'Failed to load data.');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setError('No file processed. Please upload a file first.');
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
      fetchData(currentFileId, dateRange, dataSource);
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
    // We're now ignoring date range changes since we only show "All Time" data
    // This function is kept for compatibility
    console.log("Date range changes are disabled - showing All Time data only");
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    stacked: false,
    plugins: {
      title: {
        display: true,
        text: `Key Performance Indicators Over Time (Oct 2024 - Apr 2025)`,
        font: { 
          size: 18,
          family: "'Inter', sans-serif",
          weight: 'bold'
        },
        padding: {
          top: 10,
          bottom: 20
        },
        color: '#2b2d42'
      },
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
            return `${context.dataset.label}: ${context.raw.toLocaleString()}`;
          }
        }
      },
      filler: {
        propagate: false
      }
    },
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Count',
          font: {
            family: "'Inter', sans-serif",
            size: 14,
            weight: 'bold'
          }
        },
        beginAtZero: true,
        suggestedMin: 0,
        suggestedMax: function(context) {
          // Get the maximum value across all datasets and add 10% for better scaling
          const maxValue = context.chart.data.datasets.reduce((max, dataset) => {
            const datasetMax = Math.max(...dataset.data);
            return datasetMax > max ? datasetMax : max;
          }, 0);
          return maxValue * 1.1;
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            family: "'Inter', sans-serif"
          },
          callback: function(value) {
            return value.toLocaleString();
          }
        }
      },
      x: {
        title: {
          display: true,
          text: 'Month',
          font: {
            family: "'Inter', sans-serif",
            size: 14,
            weight: 'bold'
          }
        },
        grid: {
          display: false
        },
        ticks: {
          font: {
            family: "'Inter', sans-serif"
          },
          maxRotation: 45,
          minRotation: 45
        }
      }
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
          <p style={{ marginTop: '20px' }}>Loading overall performance data...</p>
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
      <h1>PartnerDashboard Overall Performance Metrics</h1>
      
      {/* Data Source Selector */}
      <div style={{ marginBottom: '20px' }}>
        <DataSourceSelector
          selectedSource={dataSource}
          onSourceChange={setDataSource}
        />
      </div>
      
      {/* Note: We're hiding the DateRangeSelector since we only show "All Time" data */}
      
      <div className="card">
        <p className="description" style={{ marginBottom: '20px', color: 'var(--medium-text)' }}>
          This chart displays the relationship between Active Clients, First-Time Traders (FTT), and Active Partners from October 2024 through April 2025,
          providing insights into the platform's growth and partner engagement.
          {dataSource && (
            <span style={{ display: 'inline-block', marginTop: '8px', fontWeight: 'bold' }}>
              Data Source: {dataSource === 'myAffiliate' ? 'MyAffiliate' : 'DynamicWorks'}
            </span>
          )}
        </p>
        
        {chartData.datasets.length > 0 ? (
          <div className="chart-container" style={{ height: '500px' }}>
            <Line options={chartOptions} data={chartData} />
          </div>
        ) : (
          <p>No data available to display the performance chart. {error || ''}</p>
        )}
      </div>
      
      {/* Additional KPI indicators section remains unchanged */}
      {chartData.datasets.length > 0 && (
        <div className="kpi-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
          <div className="card" style={{ padding: '20px', textAlign: 'center', backgroundColor: 'rgba(66, 133, 244, 0.05)', borderTop: '3px solid rgb(66, 133, 244)' }}>
            <h3 style={{ color: 'rgb(66, 133, 244)' }}>Active Clients</h3>
            <p style={{ fontSize: '14px', color: 'var(--medium-text)' }}>
              Total users actively engaging with the platform. Higher numbers indicate increased user engagement.
            </p>
          </div>
          
          <div className="card" style={{ padding: '20px', textAlign: 'center', backgroundColor: 'rgba(219, 68, 55, 0.05)', borderTop: '3px solid rgb(219, 68, 55)' }}>
            <h3 style={{ color: 'rgb(219, 68, 55)' }}>First-Time Traders</h3>
            <p style={{ fontSize: '14px', color: 'var(--medium-text)' }}>
              New users making their first trades. This metric indicates platform growth and acquisition success.
            </p>
          </div>
          
          <div className="card" style={{ padding: '20px', textAlign: 'center', backgroundColor: 'rgba(15, 157, 88, 0.05)', borderTop: '3px solid rgb(15, 157, 88)' }}>
            <h3 style={{ color: 'rgb(15, 157, 88)' }}>Active Partners</h3>
            <p style={{ fontSize: '14px', color: 'var(--medium-text)' }}>
              Partners generating revenue on the platform. Correlates with business growth and indicates affiliate program health.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default OverallPerformancePage; 