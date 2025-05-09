import React, { useState, useEffect } from 'react';
import '../App.css';

const DateRangeSelector = ({ onDateRangeChange }) => {
  const [selectedPreset, setSelectedPreset] = useState('all');
  const [showCalendar, setShowCalendar] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Monthly options - first day of each month
  const monthOptions = [
    { value: 'oct-2024', label: 'Oct 2024', startDate: '2024-10-01', endDate: '2024-10-31' },
    { value: 'nov-2024', label: 'Nov 2024', startDate: '2024-11-01', endDate: '2024-11-30' },
    { value: 'dec-2024', label: 'Dec 2024', startDate: '2024-12-01', endDate: '2024-12-31' },
    { value: 'jan-2025', label: 'Jan 2025', startDate: '2025-01-01', endDate: '2025-01-31' },
    { value: 'feb-2025', label: 'Feb 2025', startDate: '2025-02-01', endDate: '2025-02-28' },
    { value: 'mar-2025', label: 'Mar 2025', startDate: '2025-03-01', endDate: '2025-03-31' },
    { value: 'apr-2025', label: 'Apr 2025', startDate: '2025-04-01', endDate: '2025-04-30' },
  ];
  
  // Default to current date for end date
  useEffect(() => {
    const today = new Date();
    setEndDate(formatDate(today));
  }, []);
  
  // Format date to YYYY-MM-DD
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Get date range based on selected month
  const getDateRangeForMonth = (monthValue) => {
    const selectedMonth = monthOptions.find(month => month.value === monthValue);
    if (selectedMonth) {
      return {
        startDate: selectedMonth.startDate,
        endDate: selectedMonth.endDate
      };
    }
    
    // Default to a wide date range for 'all'
    return {
      startDate: '2000-01-01',
      endDate: formatDate(new Date())
    };
  };
  
  // Handle preset selection
  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    setShowCalendar(preset === 'custom');
    
    if (preset !== 'custom') {
      let dateRange;
      
      if (preset === 'all') {
        dateRange = {
          startDate: '2000-01-01',
          endDate: formatDate(new Date())
        };
      } else {
        // Get date range for the selected month
        dateRange = getDateRangeForMonth(preset);
      }
      
      setStartDate(dateRange.startDate);
      setEndDate(dateRange.endDate);
      
      onDateRangeChange({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        preset: preset
      });
    }
  };
  
  // Handle custom date range
  const handleCustomDateChange = () => {
    if (startDate && endDate) {
      onDateRangeChange({
        startDate,
        endDate,
        preset: 'custom'
      });
    }
  };
  
  // Format displayed date range
  const getDisplayedDateRange = () => {
    if (selectedPreset === 'all') return 'All Time';
    
    // Display month name for preset months
    const selectedMonth = monthOptions.find(month => month.value === selectedPreset);
    if (selectedMonth) return selectedMonth.label;
    
    // For custom date range
    if (startDate && endDate) {
      return `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
    }
    
    return 'Select dates';
  };
  
  return (
    <div className="date-range-selector">
      <div className="preset-options">
        <button 
          className={`date-button ${selectedPreset === 'all' ? 'active' : ''}`} 
          onClick={() => handlePresetChange('all')}
        >
          All Time
        </button>
        {monthOptions.map(month => (
          <button 
            key={month.value}
            className={`date-button ${selectedPreset === month.value ? 'active' : ''}`} 
            onClick={() => handlePresetChange(month.value)}
          >
            {month.label}
          </button>
        ))}
        <button 
          className={`date-button ${selectedPreset === 'custom' ? 'active' : ''}`} 
          onClick={() => handlePresetChange('custom')}
        >
          Custom
        </button>
      </div>
      
      {showCalendar && (
        <div className="calendar-selector">
          <div className="date-inputs">
            <div className="date-input-group">
              <label>From:</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="date-input-group">
              <label>To:</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <button 
              className="apply-button"
              onClick={handleCustomDateChange}
            >
              Apply
            </button>
          </div>
        </div>
      )}
      
      <div className="selected-range">
        <span>Viewing: {getDisplayedDateRange()}</span>
      </div>
    </div>
  );
};

export default DateRangeSelector; 