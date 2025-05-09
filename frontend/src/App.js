import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink
} from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage'; // We'll create this page
import CountryAnalysisPage from './pages/CountryAnalysisPage'; // Import new page
import PartnerPerformancePage from './pages/PartnerPerformancePage'; // Import new page
import OverallPerformancePage from './pages/OverallPerformancePage'; // Import new page
import AiAssistantPage from './pages/AiAssistantPage'; // Import the new AI Assistant page
import './App.css'; // For basic styling

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="app-nav">
          <NavLink to="/" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Upload</NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>PartnerDashboard</NavLink>
          <NavLink to="/country-analysis" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Country Analysis</NavLink>
          <NavLink to="/partner-performance" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Partner Performance</NavLink>
          <NavLink to="/overall-performance" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Overall Performance</NavLink>
          <NavLink to="/ai-assistant" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>AI Assistant</NavLink>
        </nav>
        <main className="app-content">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/country-analysis" element={<CountryAnalysisPage />} />
            <Route path="/partner-performance" element={<PartnerPerformancePage />} />
            <Route path="/overall-performance" element={<OverallPerformancePage />} />
            <Route path="/ai-assistant" element={<AiAssistantPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App; 