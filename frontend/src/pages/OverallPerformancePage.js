import React, { useState, useEffect } from 'react';
import { getAnalysisData } from '../services/api';
import { Bar } from 'react-chartjs-2';
import DateRangeSelector from '../components/DateRangeSelector';
import DataSourceSelector from '../components/DataSourceSelector';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function OverallPerformancePage() {
  const [activeClientsChartData, setActiveClientsChartData] = useState({ labels: [], datasets: [] });
  const [usersChartData, setUsersChartData] = useState({ labels: [], datasets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState('Overall Performance');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
    preset: 'all'
  });
  const [dataSource, setDataSource] = useState(null);
  const [myAffiliateData, setMyAffiliateData] = useState(null);
  const [dynamicWorksData, setDynamicWorksData] = useState(null);
  const [combinedLabels, setCombinedLabels] = useState([]);

  // Fetch data from a specific source
  const fetchSourceData = async (fileId, source, dateParams = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      // Construct query parameters for date filtering
      let queryParams = '';
      if (dateParams.startDate && dateParams.endDate) {
        queryParams = `?startDate=${dateParams.startDate}&endDate=${dateParams.endDate}&preset=${dateParams.preset || 'all'}`;
      }
      
      const response = await getAnalysisData(fileId, queryParams, source);
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
        
        return monthlyKpis;
      }
      return null;
    } catch (err) {
      console.error(`Error fetching ${source} data:`, err);
      return null;
    }
  };

  const updateCharts = () => {
    if (!myAffiliateData && !dynamicWorksData) {
      setActiveClientsChartData({ labels: [], datasets: [] });
      setUsersChartData({ labels: [], datasets: [] });
      return;
    }

    // Generate unified labels from both data sources
    const uniqueLabels = Array.from(new Set([
      ...(myAffiliateData || []).map(d => d.Month),
      ...(dynamicWorksData || []).map(d => d.Month)
    ])).sort((a, b) => new Date(a) - new Date(b));

    setCombinedLabels(uniqueLabels);

    // Active Clients Chart Data (stacked bar chart for MyAffiliate and DynamicWorks)
    setActiveClientsChartData({
      labels: uniqueLabels,
      datasets: [
        {
          label: 'MyAffiliate',
          data: uniqueLabels.map(month => {
            const entry = (myAffiliateData || []).find(d => d.Month === month);
            return entry ? entry.monthly_active_clients : 0;
          }),
          backgroundColor: 'rgba(66, 133, 244, 0.7)',
          borderColor: 'rgb(66, 133, 244)',
          borderWidth: 1,
          stack: 'Stack 0',
        },
        {
          label: 'DynamicWorks',
          data: uniqueLabels.map(month => {
            const entry = (dynamicWorksData || []).find(d => d.Month === month);
            return entry ? entry.monthly_active_clients : 0;
          }),
          backgroundColor: 'rgba(15, 157, 88, 0.9)',
          borderColor: 'rgb(15, 157, 88)',
          borderWidth: 1,
          stack: 'Stack 0',
        },
      ],
    });

    // First-Time Traders and Active Partners Chart (separate stacked bar chart)
    setUsersChartData({
      labels: uniqueLabels,
      datasets: [
        {
          label: 'First-Time Traders (FTT)',
          data: uniqueLabels.map(month => {
            let total = 0;
            const maEntry = (myAffiliateData || []).find(d => d.Month === month);
            const dwEntry = (dynamicWorksData || []).find(d => d.Month === month);
            if (maEntry) total += maEntry.monthly_ftt || 0;
            if (dwEntry) total += dwEntry.monthly_ftt || 0;
            return total;
          }),
          backgroundColor: 'rgba(219, 68, 55, 0.7)',
          borderColor: 'rgb(219, 68, 55)',
          borderWidth: 1,
          stack: 'Stack 0',
        },
        {
          label: 'Active Partners',
          data: uniqueLabels.map(month => {
            let total = 0;
            const maEntry = (myAffiliateData || []).find(d => d.Month === month);
            const dwEntry = (dynamicWorksData || []).find(d => d.Month === month);
            if (maEntry) total += maEntry.monthly_active_partners || 0;
            if (dwEntry) total += dwEntry.monthly_active_partners || 0;
            return total;
          }),
          backgroundColor: 'rgba(244, 180, 0, 0.7)',
          borderColor: 'rgb(244, 180, 0)',
          borderWidth: 1,
          stack: 'Stack 0',
        },
      ],
    });

    setLoading(false);
  };

  // Handle data loading
  const fetchAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      const myAffiliateId = sessionStorage.getItem('myAffiliateId');
      const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
      
      // Fetch data from both sources
      let maData = null;
      let dwData = null;
      
      if (myAffiliateId) {
        maData = await fetchSourceData(myAffiliateId, 'myAffiliate', dateRange);
      }
      
      if (dynamicWorksId) {
        dwData = await fetchSourceData(dynamicWorksId, 'dynamicWorks', dateRange);
      }
      
      setMyAffiliateData(maData);
      setDynamicWorksData(dwData);
      
      // If neither source has data
      if (!maData && !dwData) {
        setError('No data available from either source.');
      }
    } catch (err) {
      console.error("Error fetching overall performance data:", err);
      setError(err.message || 'Failed to load data.');
    }
  };

  // Initial data load
  useEffect(() => {
    fetchAllData();
  }, []);

  // Update charts when data changes
  useEffect(() => {
    updateCharts();
  }, [myAffiliateData, dynamicWorksData]);

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
      // This is now handled by fetchAllData which gets both sources
      fetchAllData();
    }
  }, [dataSource]);
  
  const handleDateRangeChange = (newDateRange) => {
    // We're now ignoring date range changes since we only show "All Time" data
    console.log("Date range changes are disabled - showing All Time data only");
  };

  // Chart options for Active Clients stacked bar chart
  const activeClientsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: 'Active Clients by Data Source (Oct 2024 - Apr 2025)',
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
      }
    },
    scales: {
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
      },
      y: {
        stacked: true,
        title: {
          display: true,
          text: 'Count',
          font: {
            family: "'Inter', sans-serif",
            size: 14,
            weight: 'bold'
          }
        },
        beginAtZero: false,
        min: 95000, // Set a minimum value to make smaller values more visible
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
      }
    }
  };

  // Chart options for Users (FTT & Active Partners) stacked bar chart
  const usersChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: 'First-Time Traders & Active Partners (Oct 2024 - Apr 2025)',
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
      }
    },
    scales: {
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
      },
      y: {
        stacked: true,
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
      <h1>Overall Performance</h1>
      
      {/* Active Clients Chart */}
      <div className="card">
        <p className="description" style={{ marginBottom: '20px', color: 'var(--medium-text)' }}>
          This chart displays Active Clients from both MyAffiliate and DynamicWorks data sources from October 2024 through April 2025,
          providing insights into the platform's growth and user engagement.
        </p>
        
        {activeClientsChartData.datasets.length > 0 ? (
          <div className="chart-container" style={{ height: '500px' }}>
            <Bar options={activeClientsChartOptions} data={activeClientsChartData} />
          </div>
        ) : (
          <p>No data available to display the active clients chart. {error || ''}</p>
        )}
      </div>
      
      {/* FTT and Active Partners Chart */}
      <div className="card" style={{ marginTop: '20px' }}>
        <p className="description" style={{ marginBottom: '20px', color: 'var(--medium-text)' }}>
          This chart shows First-Time Traders (FTT) and Active Partners metrics from October 2024 through April 2025,
          providing insights into user acquisition and partner program performance.
        </p>
        
        {usersChartData.datasets.length > 0 ? (
          <div className="chart-container" style={{ height: '500px' }}>
            <Bar options={usersChartOptions} data={usersChartData} />
          </div>
        ) : (
          <p>No data available to display the users chart. {error || ''}</p>
        )}
      </div>
      
      {/* KPI Summary Cards */}
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
        
        <div className="card" style={{ padding: '20px', textAlign: 'center', backgroundColor: 'rgba(244, 180, 0, 0.05)', borderTop: '3px solid rgb(244, 180, 0)' }}>
          <h3 style={{ color: 'rgb(244, 180, 0)' }}>Active Partners</h3>
          <p style={{ fontSize: '14px', color: 'var(--medium-text)' }}>
            Partners generating revenue on the platform. Correlates with business growth and indicates affiliate program health.
          </p>
        </div>
      </div>
    </div>
  );
}

export default OverallPerformancePage; 