import React, { useState, useEffect, useRef } from 'react';
import { sendMessageToChatbot } from '../services/api';
import DataSourceSelector from '../components/DataSourceSelector';

function AiAssistantPage() {
  const [messages, setMessages] = useState(() => {
    // Try to load messages from sessionStorage
    const savedMessages = sessionStorage.getItem('aiAssistantMessages');
    return savedMessages ? JSON.parse(savedMessages) : [
      { 
        sender: 'bot', 
        text: 'Hello! I\'m your PartnerDashboard AI Assistant. I can help analyze your data and answer questions about your partner performance. What would you like to know?' 
      }
    ];
  });
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Add data source state (keep the functionality but hide UI)
  const [dataSource, setDataSource] = useState(null);

  // Initialize data sources on component mount
  useEffect(() => {
    const myAffiliateId = sessionStorage.getItem('myAffiliateId');
    const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
    
    // Set initial data source (defaults to combined if both are available)
    if (myAffiliateId && dynamicWorksId) {
      setDataSource('combined'); // Default to combined view if both available
    } else if (dynamicWorksId) {
      setDataSource('dynamicWorks');
    } else if (myAffiliateId) {
      setDataSource('myAffiliate');
    } else {
      setDataSource(null);
    }
  }, []);

  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem('aiAssistantMessages', JSON.stringify(messages));
  }, [messages]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input field when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    // Get the appropriate file IDs based on the selected data source
    let currentFileId;
    const myAffiliateId = sessionStorage.getItem('myAffiliateId');
    const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
    
    if (dataSource === 'myAffiliate') {
      currentFileId = myAffiliateId;
    } else if (dataSource === 'dynamicWorks') {
      currentFileId = dynamicWorksId;
    } else if (dataSource === 'combined') {
      // For combined analysis, send both file IDs
      currentFileId = dynamicWorksId || myAffiliateId; // Use one as the primary
    } else {
      currentFileId = sessionStorage.getItem('currentFileId'); // Fallback
    }
    
    if (!input.trim() || !currentFileId) return;
    
    const userMessage = { sender: 'user', text: input };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Get current messages to send as chat history (excluding the new user message we just added)
      const currentMessages = [...messages]; 
      
      // Send the message to the backend with chat history and data source
      // Include both file IDs when in combined mode
      const payload = {
        fileId: currentFileId,
        query: input, 
        chatHistory: currentMessages,
        source: dataSource,
      };
      
      // Add both file IDs when in combined mode for comprehensive analysis
      if (dataSource === 'combined' && myAffiliateId && dynamicWorksId) {
        payload.myAffiliateId = myAffiliateId;
        payload.dynamicWorksId = dynamicWorksId;
        payload.combinedAnalysis = true;
      }
      
      const response = await sendMessageToChatbot(currentFileId, input, currentMessages, dataSource, payload);
      const botMessage = { 
        sender: 'bot', 
        text: response.data.answer || "I couldn't process your request. Please try again."
      };
      setMessages(prevMessages => [...prevMessages, botMessage]);
    } catch (error) {
      console.error('Error sending message to AI assistant:', error);
      const errorMessage = { 
        sender: 'bot', 
        text: "Sorry, I encountered an error while processing your request. Please try again."
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
      // Focus back on input after response
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const clearConversation = () => {
    const confirmClear = window.confirm("Are you sure you want to clear the entire conversation?");
    if (confirmClear) {
      setMessages([{ 
        sender: 'bot', 
        text: 'Conversation cleared. How else can I help you with your data analysis?' 
      }]);
    }
  };

  // Generate a greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Check if we have any valid file ID
  const hasValidFile = () => {
    return sessionStorage.getItem('myAffiliateId') || sessionStorage.getItem('dynamicWorksId');
  };
  
  // Get custom source options for AI Assistant with combined option
  const getDataSourceOptions = () => {
    const sources = [];
    const myAffiliateId = sessionStorage.getItem('myAffiliateId');
    const dynamicWorksId = sessionStorage.getItem('dynamicWorksId');
    
    // Only add sources that have data available
    if (myAffiliateId && dynamicWorksId) {
      sources.push({ id: 'combined', label: 'Combined Analysis', icon: '📊' });
    }
    if (myAffiliateId) {
      sources.push({ id: 'myAffiliate', label: 'MyAffiliate', icon: '📈' });
    }
    if (dynamicWorksId) {
      sources.push({ id: 'dynamicWorks', label: 'DynamicWorks', icon: '📉' });
    }
    
    return sources;
  };

  // Get displayed data source name
  const getDataSourceName = () => {
    if (dataSource === 'myAffiliate') return 'MyAffiliate';
    if (dataSource === 'dynamicWorks') return 'DynamicWorks';
    if (dataSource === 'combined') return 'Combined (MyAffiliate + DynamicWorks)';
    return '';
  };

  return (
    <div className="page-container">
      <div className="ai-assistant-container">
        <div className="ai-assistant-header">
          <h1>AI Data Assistant</h1>
          {/* Only keep the Clear Conversation button */}
          <button 
            className="clear-chat-button" 
            onClick={clearConversation}
            aria-label="Clear conversation"
          >
            Clear Conversation
          </button>
        </div>

        <div className="ai-welcome-card">
          <h2>{getGreeting()}! I'm your Partner Dashboard AI Assistant</h2>
          <p>
            Ask me anything about your partner data. I can provide real-time analysis, identify trends, and deliver actionable business insights.
          </p>
          
          <div className="example-questions">
            <h3>Try asking:</h3>
            <div className="example-grid">
              <button 
                className="example-button" 
                onClick={() => {
                  setInput("Which country had the highest revenue in April 2025?");
                  inputRef.current?.focus();
                }}
              >
                Which country had the highest revenue in April 2025?
              </button>
              <button 
                className="example-button" 
                onClick={() => {
                  setInput("Compare Vietnam and Kenya based on monthly Deriv Revenue for the past 4 months");
                  inputRef.current?.focus();
                }}
              >
                Compare Vietnam and Kenya based on monthly Deriv Revenue for the past 4 months
              </button>
              <button 
                className="example-button" 
                onClick={() => {
                  setInput("Which partners have shown strong growth in the last 3 months?");
                  inputRef.current?.focus();
                }}
              >
                Which partners have shown strong growth in the last 3 months?
              </button>
              <button 
                className="example-button" 
                onClick={() => {
                  setInput("Identify partners at risk of churn based on declining revenue trends");
                  inputRef.current?.focus();
                }}
              >
                Identify partners at risk of churn based on declining revenue
              </button>
            </div>
          </div>
        </div>

        <div className="messages-container">
          {messages.map((message, index) => (
            <div 
              key={index} 
              className={`message ${message.sender === 'user' ? 'user-message' : 'bot-message'}`}
            >
              <div className="message-avatar">
                {message.sender === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                <pre>{message.text}</pre>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message bot-message">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="input-form" onSubmit={handleSendMessage}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question about the data..."
            disabled={isLoading || !hasValidFile()}
            aria-label="Message input"
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim() || !hasValidFile()}
            aria-label="Send message"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </form>
        
        {!hasValidFile() && (
          <div className="no-data-warning">
            <p>Please upload at least one data file to use the AI Assistant.</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .ai-assistant-container {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 130px);
          background-color: var(--card-bg);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--border-color);
          overflow: hidden;
        }

        .ai-assistant-header {
          padding: 20px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .ai-assistant-header h1 {
          margin: 0;
          padding: 0;
          font-size: 1.5rem;
        }
        
        .header-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .data-source-selector {
          display: flex;
          align-items: center;
          gap: 16px;
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
        
        .data-source-indicator {
          display: block;
          margin-top: 8px;
          font-style: italic;
          color: var(--primary);
        }

        .ai-welcome-card {
          padding: 24px;
          background: linear-gradient(120deg, rgba(67, 97, 238, 0.05), rgba(114, 9, 183, 0.05));
          border-bottom: 1px solid var(--border-color);
        }

        .ai-welcome-card h2 {
          margin-top: 0;
          font-size: 1.3rem;
          color: var(--primary);
        }

        .ai-welcome-card p {
          margin-bottom: 16px;
          color: var(--medium-text);
        }

        .example-questions h3 {
          font-size: 1rem;
          margin-bottom: 12px;
        }

        .example-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
        }

        .example-button {
          padding: 12px;
          text-align: left;
          font-size: 0.95rem;
          color: #1a1a2e;
          background-color: rgba(255, 255, 255, 0.9);
          border: 1px solid var(--primary);
          border-radius: var(--radius-md);
          transition: all 0.2s ease;
          white-space: normal;
          height: auto;
          box-shadow: var(--shadow-sm);
          font-weight: 500;
        }

        .example-button:hover {
          background-color: #f0f4ff;
          border-color: var(--primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
          color: var(--primary);
        }

        .clear-chat-button {
          padding: 8px 12px;
          background-color: transparent;
          color: var(--medium-text);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          transition: all 0.2s ease;
          box-shadow: none;
        }

        .clear-chat-button:hover {
          background-color: #f5f5f5;
          color: var(--danger);
          border-color: var(--danger);
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          background-color: var(--background);
        }

        .message {
          display: flex;
          gap: 12px;
          max-width: 90%;
          animation: fadeIn 0.3s ease;
        }

        .user-message {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .bot-message {
          align-self: flex-start;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background-color: var(--card-bg);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
          box-shadow: var(--shadow-sm);
        }

        .message-content {
          padding: 12px 16px;
          border-radius: 18px;
          box-shadow: var(--shadow-sm);
          position: relative;
        }

        .user-message .message-content {
          background-color: var(--primary);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .bot-message .message-content {
          background-color: white;
          border-bottom-left-radius: 4px;
        }

        .message-content pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: inherit;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 6px 0;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          background-color: var(--medium-text);
          border-radius: 50%;
          opacity: 0.6;
          animation: bounce 1.5s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(1) {
          animation-delay: 0s;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        .input-form {
          padding: 20px;
          display: flex;
          gap: 10px;
          border-top: 1px solid var(--border-color);
          background-color: var(--card-bg);
        }

        .input-form input {
          flex: 1;
          padding: 14px 18px;
          border: 1px solid var(--border-color);
          border-radius: 24px;
          font-size: 1rem;
          transition: all 0.2s ease;
        }

        .input-form input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.15);
        }

        .input-form button {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--primary);
          color: white;
          transition: all 0.2s ease;
          padding: 0;
        }

        .input-form button:hover:not(:disabled) {
          background-color: var(--primary-dark);
          transform: translateY(-2px);
        }

        .input-form button:disabled {
          background-color: var(--light-text);
          cursor: not-allowed;
        }

        .no-data-warning {
          padding: 12px 20px;
          background-color: rgba(255, 209, 102, 0.1);
          border-top: 1px solid var(--warning);
          color: var(--dark-text);
          font-size: 0.9rem;
          text-align: center;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }

        @media (max-width: 768px) {
          .example-grid {
            grid-template-columns: 1fr;
          }
          
          .message {
            max-width: 100%;
          }
          
          .header-controls {
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}

export default AiAssistantPage; 