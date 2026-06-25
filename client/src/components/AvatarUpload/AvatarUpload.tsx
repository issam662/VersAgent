import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, ZoomIn, ZoomOut, Move, Check, X } from 'lucide-react';
import './AvatarUpload.css';

interface AvatarUploadProps {
    currentAvatar?: string;
    onSave: (imageData: string) => void;
    onCancel: () => void;
    fallbackLetter?: string;
}

const AvatarUpload = ({ currentAvatar, onSave, onCancel, fallbackLetter = 'U' }: AvatarUploadProps) => {
    const [image, setImage] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    imageRef.current = img;
                    setImage(e.target?.result as string);
                    setZoom(1);
                    setPosition({ x: 0, y: 0 });
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!image) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    const handleZoom = (delta: number) => {
        setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (!image) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        handleZoom(delta);
    };

    const handleSave = () => {
        if (!image || !imageRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = 200;
        canvas.width = size;
        canvas.height = size;

        const img = imageRef.current;
        const scale = zoom;
        const imgWidth = img.width * scale;
        const imgHeight = img.height * scale;

        const offsetX = (size - imgWidth) / 2 + position.x;
        const offsetY = (size - imgHeight) / 2 + position.y;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, offsetX, offsetY, imgWidth, imgHeight);

        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();

        const dataUrl = canvas.toDataURL('image/png');
        onSave(dataUrl);
    };

    const triggerFileSelect = () => {
        if (!image) {
            fileInputRef.current?.click();
        }
    };

    return (
        <div className="avatar-upload">
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
            />

            {/* Preview area - click to select when no image, drag when image selected */}
            <div
                className={`avatar-preview ${isDragging ? 'dragging' : ''} ${image ? 'has-image' : ''}`}
                onMouseDown={image ? handleMouseDown : undefined}
                onClick={triggerFileSelect}
                onWheel={handleWheel}
            >
                {image ? (
                    <div
                        className="avatar-image-container"
                        style={{
                            transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${zoom})`,
                        }}
                    >
                        <img src={image} alt="Avatar preview" draggable={false} />
                    </div>
                ) : currentAvatar ? (
                    <img src={currentAvatar} alt="Current avatar" className="current-avatar" />
                ) : (
                    <div className="avatar-placeholder">
                        <span>{fallbackLetter}</span>
                    </div>
                )}

                {/* Only show upload overlay when no image */}
                {!image && (
                    <div className="avatar-overlay">
                        <Upload size={24} />
                        <span>Click to upload</span>
                    </div>
                )}
            </div>

            {image && (
                <>
                    <div className="avatar-hint">
                        <Move size={14} />
                        <span>Drag image to reposition • Scroll to zoom</span>
                    </div>

                    <div className="avatar-controls">
                        <div className="zoom-controls">
                            <button
                                type="button"
                                className="control-btn"
                                onClick={() => handleZoom(-0.1)}
                                title="Zoom out"
                            >
                                <ZoomOut size={18} />
                            </button>
                            <div className="zoom-slider">
                                <input
                                    type="range"
                                    min="0.5"
                                    max="3"
                                    step="0.1"
                                    value={zoom}
                                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                                />
                            </div>
                            <button
                                type="button"
                                className="control-btn"
                                onClick={() => handleZoom(0.1)}
                                title="Zoom in"
                            >
                                <ZoomIn size={18} />
                            </button>
                        </div>

                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload size={14} />
                            Choose different photo
                        </button>
                    </div>

                    <div className="avatar-actions">
                        <button type="button" className="btn btn-ghost" onClick={onCancel}>
                            <X size={16} />
                            Cancel
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleSave}>
                            <Check size={16} />
                            Save Avatar
                        </button>
                    </div>
                </>
            )}

            {!image && (
                <div className="avatar-actions">
                    <button type="button" className="btn btn-ghost" onClick={onCancel}>
                        <X size={16} />
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};

export default AvatarUpload;
