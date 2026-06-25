import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, Bot, User, Loader2, Sparkles } from 'lucide-react';
import api from '../../services/api';
import './ChatWidget.css';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

const STATUS_LABELS: Record<string, string> = {
    thinking: '🧠 Thinking...',
    querying: '🔍 Querying database...',
    analyzing: '📊 Analyzing results...',
};

export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [history, setHistory] = useState<Message[]>([
        { role: 'assistant', content: 'Hello! I am your VersAgent AI assistant. How can I help you today?' }
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [aiStatus, setAiStatus] = useState<{ online: boolean; model: string } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            checkStatus();
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    useEffect(() => {
        scrollToBottom();
    }, [history, statusText]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const checkStatus = async () => {
        try {
            const status = await api.getAiStatus();
            setAiStatus(status);
        } catch (error) {
            setAiStatus({ online: false, model: '' });
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', content: message };
        setHistory(prev => [...prev, userMsg]);
        setMessage('');
        setIsLoading(true);
        setStatusText('thinking');

        try {
            let currentAssistantMessage = '';
            // Add placeholder for streaming
            setHistory(prev => [...prev, { role: 'assistant', content: '' }]);

            await api.chatStreamWithStatus(
                message,
                history,
                // On content chunk
                (chunk) => {
                    setStatusText(''); // clear status when real content arrives
                    currentAssistantMessage += chunk;
                    setHistory(prev => {
                        const newHistory = [...prev];
                        newHistory[newHistory.length - 1] = { role: 'assistant', content: currentAssistantMessage };
                        return newHistory;
                    });
                },
                // On status change
                (status) => {
                    setStatusText(status);
                }
            );
        } catch (error: any) {
            console.error('Chat error:', error);
            setHistory(prev => {
                const newHistory = [...prev];
                if (newHistory[newHistory.length - 1].role === 'assistant' && newHistory[newHistory.length - 1].content === '') {
                    newHistory[newHistory.length - 1].content = `Sorry, I couldn't process that request. Please try again.`;
                    return newHistory;
                }
                return [...newHistory, { 
                    role: 'assistant', 
                    content: `Sorry, I couldn't process that request. Please try again.` 
                }];
            });
        } finally {
            setIsLoading(false);
            setStatusText('');
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    };

    return (
        <div className={`chat-widget-container ${isOpen ? 'open' : ''}`}>
            {/* Toggle Button */}
            {!isOpen && (
                <button className="chat-toggle-btn" onClick={() => setIsOpen(true)}>
                    <MessageSquare size={24} />
                    <span className="chat-badge">AI</span>
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className="chat-window">
                    <div className="chat-header">
                        <div className="chat-header-info">
                            <Sparkles size={18} className="ai-icon" />
                            <div>
                                <h3>VersAgent AI</h3>
                                <div className="ai-status">
                                    <span className={`status-dot ${aiStatus?.online ? 'online' : 'offline'}`}></span>
                                    {aiStatus?.online ? `Model: ${aiStatus.model}` : 'AI Service Offline'}
                                </div>
                            </div>
                        </div>
                        <button className="close-btn" onClick={() => setIsOpen(false)}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className="chat-messages">
                        {history.map((msg, i) => {
                            // Don't render the empty placeholder bubble while loading
                            if (isLoading && i === history.length - 1 && msg.content === '') return null;
                            
                            return (
                                <div key={i} className={`message-wrapper ${msg.role}`}>
                                    <div className="message-icon">
                                        {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
                                    </div>
                                    <div className="message-bubble">
                                        {msg.content}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Thinking / querying / analyzing indicator */}
                        {isLoading && (
                            <div className="message-wrapper assistant">
                                <div className="message-icon">
                                    <Bot size={16} />
                                </div>
                                <div className="message-bubble loading">
                                    <Loader2 size={16} className="spinner" />
                                    <span>{STATUS_LABELS[statusText] || '🧠 Thinking...'}</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form className="chat-input-area" onSubmit={handleSend}>
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder={isLoading ? 'AI is working...' : 'Type a message...'}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            disabled={isLoading}
                        />
                        <button type="submit" disabled={!message.trim() || isLoading}>
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
