import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { NewsItem } from '../../types';
import './NewsCarousel.css';

interface NewsCarouselProps {
    news: NewsItem[];
    visibleCount?: number;
    autoScrollInterval?: number;
}

const NewsCarousel = ({
    news,
    visibleCount = 2,
    autoScrollInterval = 5000
}: NewsCarouselProps) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    
    // Touch state for swiping
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    const maxIndex = Math.max(0, news.length - visibleCount);

    const goNext = useCallback(() => {
        setCurrentIndex(prev => (prev >= maxIndex ? 0 : prev + 1));
    }, [maxIndex]);

    const goPrev = useCallback(() => {
        setCurrentIndex(prev => (prev <= 0 ? maxIndex : prev - 1));
    }, [maxIndex]);

    // Auto-scroll effect
    useEffect(() => {
        if (isPaused || news.length <= visibleCount) return;

        const timer = setInterval(goNext, autoScrollInterval);
        return () => clearInterval(timer);
    }, [isPaused, goNext, autoScrollInterval, news.length, visibleCount]);

    if (news.length === 0) {
        return (
            <div className="news-carousel-empty">
                <p>No news available</p>
            </div>
        );
    }

    // Touch handlers
    const minSwipeDistance = 50;

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
        setIsPaused(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        setIsPaused(false);
        if (touchStart === null || touchEnd === null) return;
        
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe && news.length > visibleCount) {
            goNext();
        } else if (isRightSwipe && news.length > visibleCount) {
            goPrev();
        }
    };

    const visibleNews = news.slice(currentIndex, currentIndex + visibleCount);
    // If we're at the end and need to wrap
    if (visibleNews.length < visibleCount && news.length > visibleCount) {
        const remaining = visibleCount - visibleNews.length;
        visibleNews.push(...news.slice(0, remaining));
    }

    return (
        <div
            className="news-carousel"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {news.length > visibleCount && (
                <button
                    className="carousel-btn carousel-btn-prev"
                    onClick={goPrev}
                    aria-label="Previous news"
                >
                    <ChevronLeft size={24} />
                </button>
            )}

            <div className="carousel-track">
                {visibleNews.map((item, idx) => (
                    <div
                        key={`${item.id}-${idx}`}
                        className="carousel-slide"
                    >
                        <div 
                            className="news-card"
                            onClick={item.link ? () => window.open(item.link!, '_blank', 'noopener,noreferrer') : undefined}
                            style={item.link ? { cursor: 'pointer' } : undefined}
                        >
                            <div className="news-card-content">
                                <h3 className="news-card-title">{item.title}</h3>
                                {item.content && (
                                    <p className="news-card-text">{item.content}</p>
                                )}
                                <span className="news-card-date">
                                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
                                </span>
                            </div>
                            {item.imageUrl && (
                                <div className="news-card-image">
                                    <img src={item.imageUrl} alt={item.title} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {news.length > visibleCount && (
                <button
                    className="carousel-btn carousel-btn-next"
                    onClick={goNext}
                    aria-label="Next news"
                >
                    <ChevronRight size={24} />
                </button>
            )}

            {/* Dots indicator */}
            {news.length > visibleCount && (
                <div className="carousel-dots">
                    {Array.from({ length: news.length - visibleCount + 1 }).map((_, idx) => (
                        <button
                            key={idx}
                            className={`carousel-dot ${idx === currentIndex ? 'active' : ''}`}
                            onClick={() => setCurrentIndex(idx)}
                            aria-label={`Go to slide ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default NewsCarousel;
