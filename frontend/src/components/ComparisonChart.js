import React from 'react';
import { Bar } from 'react-chartjs-2';
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

/**
 * Component for comparing metrics between MyAffiliate and DynamicWorks data sources
 */
function ComparisonChart({ 
  title, 
  subtitle, 
  myAffiliateData, 
  dynamicWorksData, 
  labels, 
  metric 
}) {
  // Prepare chart data
  const chartData = {
    labels,
    datasets: [
      {
        label: 'MyAffiliate',
        data: myAffiliateData,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
      },
      {
        label: 'DynamicWorks',
        data: dynamicWorksData,
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
      },
    ],
  };

  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          usePointStyle: true,
          padding: 20,
          font: { size: 12 }
        }
      },
      title: {
        display: true,
        text: title,
        font: { size: 16, weight: 'bold' },
        padding: {
          top: 10,
          bottom: 5
        }
      },
      subtitle: {
        display: !!subtitle,
        text: subtitle,
        font: { size: 14 },
        padding: {
          bottom: 20
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
            let value = context.raw;
            // Format currency if metric contains 'revenue', 'commissions', or 'deposits'
            if (metric && (['revenue', 'commissions', 'deposits'].some(term => metric.toLowerCase().includes(term)))) {
              value = value.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0
              });
            } else {
              value = value.toLocaleString();
            }
            return `${context.dataset.label}: ${value}`;
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
            // Format currency if metric contains 'revenue', 'commissions', or 'deposits'
            if (metric && (['revenue', 'commissions', 'deposits'].some(term => metric.toLowerCase().includes(term)))) {
              return value.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                notation: 'compact',
                compactDisplay: 'short'
              });
            }
            return value.toLocaleString();
          }
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: { size: 11 }
        }
      }
    }
  };

  return (
    <div className="comparison-chart-card">
      <div className="chart-container">
        <Bar options={options} data={chartData} />
      </div>
      
      <style jsx>{`
        .comparison-chart-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 20px;
          margin-bottom: 24px;
          border: 1px solid var(--border-color);
          border-top: 4px solid var(--primary);
        }
        
        .chart-container {
          height: 400px;
          width: 100%;
        }
        
        @media (max-width: 768px) {
          .chart-container {
            height: 300px;
          }
        }
      `}</style>
    </div>
  );
}

export default ComparisonChart; 