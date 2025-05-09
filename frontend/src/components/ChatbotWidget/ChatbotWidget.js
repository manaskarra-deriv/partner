import React, { useState, useEffect, useRef } from 'react';
import { sendMessageToChatbot } from '../../services/api';
import './ChatbotWidget.css'; // We will create this CSS file

// Simple icon for the button (can be replaced with an actual SVG or font icon)
export const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

function ChatbotWidget({ fileId, isVisible, onClose }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hello! How can I help you analyze your PartnerDashboard data today?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null); // For auto-scrolling

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]); // Scroll when new messages arrive

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || !fileId) return;

    const userMessage = { sender: 'user', text: query };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setQuery('');
    setIsLoading(true);
    setError('');

    try {
      // For now, not sending full chat history to backend to keep it simpler
      // The agent defined earlier also doesn't explicitly use chat_history yet.
      const response = await sendMessageToChatbot(fileId, userMessage.text);
      const botMessage = { sender: 'bot', text: response.data.answer || "Sorry, I couldn't get a response." };
      setMessages(prevMessages => [...prevMessages, botMessage]);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || "Failed to get response.";
      setError(errMsg);
      setMessages(prevMessages => [...prevMessages, { sender: 'bot', text: `Error: ${errMsg}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="chatbot-widget-container">
      <div className="chatbot-header">
        <h3>PartnerDashboard Data Assistant</h3>
        <button onClick={onClose} className="chatbot-close-btn">&times;</button>
      </div>
      <div className="chatbot-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.sender}`}>
            <p>{msg.text}</p>
          </div>
        ))}
        {isLoading && <div className="chat-message bot"><p>Thinking...</p></div>}
        <div ref={messagesEndRef} /> {/* Anchor for scrolling */}
      </div>
      {error && <p className="chatbot-error">{error}</p>}
      <form onSubmit={handleSubmit} className="chatbot-input-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={fileId ? "Ask about your PartnerDashboard data..." : "Upload PartnerDashboard file first..."}
          disabled={!fileId || isLoading}
        />
        <button type="submit" disabled={!fileId || isLoading || !query.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatbotWidget; 