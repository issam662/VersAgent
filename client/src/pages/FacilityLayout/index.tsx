import { useState, useEffect, useRef, useCallback } from 'react';
import { Map, Edit3, Server, Wifi, Printer, Plus, ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import api from '../../services/api';
import { floorPlans } from './floorData';
import DeviceMarker, { DeviceTooltip } from './DeviceMarker';
import type { LayoutDevice } from './DeviceMarker';
import DevicePopover from './DevicePopover';
import UnplacedPrinterPanel from './UnplacedPrinterPanel';
import type { UnplacedPrinter } from './UnplacedPrinterPanel';
import './FacilityLayout.css';

interface Floor {
  id: string;
  name: string;
  floor_order: number;
  width: number;
  height: number;
}

// Per-floor default zoom levels
const DEFAULT_ZOOM: Record<string, number> = {
  'floor-ground': 1,
  'floor-site': 1.5,
};
const getDefaultZoom = (floorId: string) => DEFAULT_ZOOM[floorId] ?? 1;

// Per-floor marker size multiplier (higher = smaller markers)
const MARKER_SCALE: Record<string, number> = {
  'floor-ground': 2,
  'floor-site': 1.35,
};
const getMarkerScale = (floorId: string) => MARKER_SCALE[floorId] ?? 1;

export default function FacilityLayout() {
  // ─── State ───
  const [floors, setFloors] = useState<Floor[]>([]);
  const [activeFloorId, setActiveFloorId] = useState('floor-site');
  const [devices, setDevices] = useState<LayoutDevice[]>([]);
  const [unplacedPrinters, setUnplacedPrinters] = useState<UnplacedPrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [printersLoading, setPrintersLoading] = useState(false);

  const [showRacks, setShowRacks] = useState(true);
  const [showWaps, setShowWaps] = useState(true);
  const [showPrinters, setShowPrinters] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [selectedDevice, setSelectedDevice] = useState<LayoutDevice | null>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [dragTarget, setDragTarget] = useState<LayoutDevice | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDraggingDevice, setIsDraggingDevice] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });

  const [zoom, setZoom] = useState(getDefaultZoom('floor-site'));
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredDeviceId, setHoveredDeviceId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // ─── Data Loading ───
  const loadFloors = useCallback(async () => {
    try {
      const res = await api.getLayoutFloors();
      if (res.floors && res.floors.length > 0) {
        setFloors(res.floors);
      } else {
        throw new Error('empty');
      }
    } catch {
      // Fallback — just use what we have in floorPlans
      setFloors([
        { id: 'floor-ground', name: 'OFFICES', floor_order: 1, width: 1024, height: 567 },
        { id: 'floor-site', name: 'SHOPFLOOR', floor_order: 0, width: 1024, height: 768 },
      ]);
    }
  }, []);

  const loadDevices = useCallback(async (floorId: string) => {
    setLoading(true);
    try {
      const res = await api.getFloorDevices(floorId);
      setDevices(res.devices || []);
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-ping all devices on the active floor to determine online/offline status
  const pingAllDevices = useCallback(async (floorId: string) => {
    try {
      const res = await api.pingFloorDevices(floorId);
      if (res.results) {
        setDevices(prev => prev.map(d => {
          const pingResult = res.results.find(r => r.id === d.id);
          return pingResult ? { ...d, status: pingResult.status } : d;
        }));
      }
    } catch {
      // Ping failed silently — keep existing status
    }
  }, []);

  const loadUnplacedPrinters = useCallback(async () => {
    setPrintersLoading(true);
    try {
      const res = await api.getUnplacedPrinters();
      setUnplacedPrinters(res.printers || []);
    } catch {
      setUnplacedPrinters([]);
    } finally {
      setPrintersLoading(false);
    }
  }, []);

  useEffect(() => { loadFloors(); }, [loadFloors]);
  useEffect(() => { loadDevices(activeFloorId); }, [activeFloorId, loadDevices]);
  useEffect(() => { if (editMode) loadUnplacedPrinters(); }, [editMode, loadUnplacedPrinters]);

  // Sync fullscreen state when user presses Escape
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Ping devices after they load, then every 30 seconds
  useEffect(() => {
    if (!loading && devices.length > 0) {
      pingAllDevices(activeFloorId);
      const interval = setInterval(() => pingAllDevices(activeFloorId), 30000);
      return () => clearInterval(interval);
    }
  }, [loading, activeFloorId, devices.length, pingAllDevices]);

  // ─── Floor Plan Data ───
  // Only show floors that have a blueprint image
  const availableFloors = floors.filter(f => floorPlans[f.id]);
  const floorPlan = floorPlans[activeFloorId];

  const visibleDevices = devices.filter(d => {
    if (d.device_type === 'rack' && !showRacks) return false;
    if (d.device_type === 'wap' && !showWaps) return false;
    if (d.device_type === 'printer' && !showPrinters) return false;
    return true;
  });

  const racks = devices.filter(d => d.device_type === 'rack');
  const onlineCount = visibleDevices.filter(d => d.status === 'online').length;
  const offlineCount = visibleDevices.filter(d => d.status === 'offline').length;

  // ─── SVG Coordinate Math ───
  const screenToSvg = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const svgEl = svgRef.current;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  };

  // ─── Device Drag (Edit Mode) ───
  const handleDeviceDragStart = (e: React.PointerEvent, device: LayoutDevice) => {
    if (!editMode) return;
    e.stopPropagation();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    setDragTarget(device);
    setDragOffset({ x: svgPt.x - device.pos_x, y: svgPt.y - device.pos_y });
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setIsDraggingDevice(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragTarget) {
      if (!isDraggingDevice) {
        if (Math.hypot(e.clientX - dragStartPos.x, e.clientY - dragStartPos.y) > 3) {
          setIsDraggingDevice(true);
        } else {
          return;
        }
      }
      const svgPt = screenToSvg(e.clientX, e.clientY);
      const newX = Math.max(0, svgPt.x - dragOffset.x);
      const newY = Math.max(0, svgPt.y - dragOffset.y);
      setDevices(prev => prev.map(d => d.id === dragTarget.id ? { ...d, pos_x: newX, pos_y: newY } : d));
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerUp = async () => {
    if (dragTarget) {
      if (isDraggingDevice) {
        const updated = devices.find(d => d.id === dragTarget.id);
        if (updated) {
          try {
            await api.updateDevicePosition(updated.id, updated.pos_x, updated.pos_y);
          } catch (err) { console.error('Failed to save position', err); }
        }
      }
      setDragTarget(null);
      setIsDraggingDevice(false);
    }
    setIsPanning(false);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (dragTarget) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  // ─── Zoom ───
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(5, Math.max(0.3, prev * delta)));
  };

  // ─── Select Device ───
  const handleSelectDevice = (device: LayoutDevice) => {
    setSelectedDevice(device);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      // Use viewport-relative (fixed) coordinates so the popover escapes overflow:hidden
      const rawX = rect.left + device.pos_x * zoom + pan.x + 40;
      const rawY = rect.top + device.pos_y * zoom + pan.y - 20;
      const popoverW = 290;
      const popoverH = 420; // estimated max height including footer
      setPopoverPos({
        x: Math.max(8, Math.min(rawX, window.innerWidth - popoverW - 8)),
        y: Math.max(8, Math.min(rawY, window.innerHeight - popoverH - 8)),
      });
    }
  };

  // ─── Device CRUD ───
  const handleSaveDevice = async (id: string, data: Partial<LayoutDevice>) => {
    try {
      await api.updateLayoutDevice(id, {
        name: data.name,
        ipAddress: data.ip_address,
        parentRackId: data.parent_rack_id,
        switchName: (data as any).switchName ?? data.switch_name,
        status: data.status,
      });
      await loadDevices(activeFloorId);
      setSelectedDevice(null);
    } catch (err) { console.error('Save failed', err); }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!confirm('Remove this device from the layout?')) return;
    try {
      await api.deleteLayoutDevice(id);
      await loadDevices(activeFloorId);
      setSelectedDevice(null);
      if (editMode) loadUnplacedPrinters();
    } catch (err) { console.error('Delete failed', err); }
  };

  const handleAddDevice = async (type: 'rack' | 'wap') => {
    try {
      const vw = floorPlan ? floorPlan.imageWidth : 1024;
      const vh = floorPlan ? floorPlan.imageHeight : 567;
      await api.createLayoutDevice({
        floorId: activeFloorId,
        deviceType: type,
        name: `New ${type.toUpperCase()}`,
        posX: vw * 0.3 + Math.random() * vw * 0.4,
        posY: vh * 0.2 + Math.random() * vh * 0.4,
        status: 'offline',
      });
      await loadDevices(activeFloorId);
    } catch (err) { console.error('Add failed', err); }
  };

  // ─── Drag printer from panel to canvas ───
  const handlePrinterDragStart = (e: React.DragEvent, printer: UnplacedPrinter) => {
    e.dataTransfer.setData('application/json', JSON.stringify(printer));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCanvas(false);
    try {
      const printerData = JSON.parse(e.dataTransfer.getData('application/json'));
      const pos = screenToSvg(e.clientX, e.clientY);
      await api.createLayoutDevice({
        floorId: activeFloorId,
        deviceType: 'printer',
        name: printerData.hostname || `Printer ${printerData.ip_address}`,
        ipAddress: printerData.ip_address,
        printerId: printerData.id,
        posX: pos.x,
        posY: pos.y,
        status: 'offline',
      });
      await loadDevices(activeFloorId);
      loadUnplacedPrinters();
    } catch (err) { console.error('Drop failed', err); }
  };

  // ─── Connection Lines ───
  const connectionLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (showWaps && showRacks) {
    devices.filter(d => d.device_type === 'wap' && d.parent_rack_id).forEach(wap => {
      const rack = devices.find(d => d.id === wap.parent_rack_id);
      if (rack) connectionLines.push({ x1: rack.pos_x, y1: rack.pos_y, x2: wap.pos_x, y2: wap.pos_y });
    });
  }

  // Parse the base viewBox from the floor plan (cropped to blueprint content)
  const baseVB = (floorPlan?.viewBox || '0 0 1024 567').split(' ').map(Number);
  const [bx, by, bw, bh] = baseVB;
  // Apply zoom and pan — center the zoom on the middle of the blueprint
  const vbW = bw / zoom;
  const vbH = bh / zoom;
  const vbX = bx + (bw - vbW) / 2 - pan.x / zoom;
  const vbY = by + (bh - vbH) / 2 - pan.y / zoom;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  return (
    <div className="facility-layout-page" ref={pageRef} style={isFullscreen ? { backgroundColor: 'var(--aptiv-dark)' } : {}}>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Map size={28} color="var(--aptiv-primary)" />
          Facility Layout
        </h1>
        <p className="page-subtitle">Interactive schematics of Plant M5 Oujda — Network infrastructure overview</p>
      </div>

      {/* Toolbar */}
      <div className="facility-toolbar">
        <div className="floor-tabs">
          {availableFloors.map(f => (
            <button
              key={f.id}
              className={`floor-tab ${f.id === activeFloorId ? 'active' : ''}`}
              onClick={() => { setActiveFloorId(f.id); setSelectedDevice(null); setZoom(getDefaultZoom(f.id)); setPan({ x: 0, y: 0 }); }}
            >
              {f.name}
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        <div className="visibility-toggles">
          <button className={`vis-toggle ${showRacks ? 'active' : ''}`} onClick={() => setShowRacks(v => !v)}>
            <span className="vis-toggle-dot" /> <Server size={14} /> Racks
          </button>
          <button className={`vis-toggle ${showWaps ? 'active' : ''}`} onClick={() => setShowWaps(v => !v)}>
            <span className="vis-toggle-dot" /> <Wifi size={14} /> WAPs
          </button>
          <button className={`vis-toggle ${showPrinters ? 'active' : ''}`} onClick={() => setShowPrinters(v => !v)}>
            <span className="vis-toggle-dot" /> <Printer size={14} /> Printers
          </button>
        </div>

        <button className={`edit-toggle-btn ${editMode ? 'active' : ''}`} onClick={() => { setEditMode(v => !v); setSelectedDevice(null); }}>
          <Edit3 size={16} />
          {editMode ? 'Editing' : 'Edit Mode'}
        </button>

        {editMode && (
          <div className="toolbar-add-btns">
            <button className="toolbar-add-btn" onClick={() => handleAddDevice('rack')}><Plus size={14} /> Rack</button>
            <button className="toolbar-add-btn" onClick={() => handleAddDevice('wap')}><Plus size={14} /> WAP</button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="facility-layout-content">
        {/* SVG Canvas */}
        <div
          ref={containerRef}
          className={`canvas-container ${dragOverCanvas ? 'drag-over' : ''}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          onDragOver={(e) => { e.preventDefault(); setDragOverCanvas(true); }}
          onDragLeave={() => setDragOverCanvas(false)}
          onDrop={handleCanvasDrop}
          onClick={() => { if (!dragTarget) setSelectedDevice(null); }}
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <div className="loader" />
            </div>
          ) : (
            <>
              <svg
                ref={svgRef}
                className="floor-plan-svg"
                viewBox={viewBox}
                preserveAspectRatio="xMidYMid meet"
                style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
              >
                {/* The actual blueprint image — CSS filtered to dark schematics */}
                {floorPlan && (
                  <image
                    href={floorPlan.imageSrc}
                    x={0} y={0}
                    width={floorPlan.imageWidth}
                    height={floorPlan.imageHeight}
                    className="blueprint-image"
                    preserveAspectRatio="xMidYMid meet"
                  />
                )}

                {/* Connection lines (WAP → Rack) */}
                {connectionLines.map((line, i) => (
                  <line key={`conn-${i}`} className="connection-line"
                    x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
                ))}

                {/* Device markers overlaid on the image */}
                {visibleDevices.map(d => (
                  <DeviceMarker
                    key={d.id}
                    device={d}
                    isEditMode={editMode}
                    isSelected={selectedDevice?.id === d.id}
                    onSelect={handleSelectDevice}
                    onDragStart={handleDeviceDragStart}
                    scale={zoom * getMarkerScale(activeFloorId)}
                    onHover={setHoveredDeviceId}
                  />
                ))}

                {/* Global Hover Tooltip Rendered on Top */}
                {hoveredDeviceId && !editMode && (
                  (() => {
                    const hd = visibleDevices.find(d => d.id === hoveredDeviceId);
                    if (hd) return <DeviceTooltip device={hd} scale={zoom * getMarkerScale(activeFloorId)} />;
                    return null;
                  })()
                )}
              </svg>

              {/* Info overlay */}
              <div className="canvas-info-overlay">
                <div className="canvas-info-badge">
                  <span className="dot online" /> {onlineCount} Online
                </div>
                <div className="canvas-info-badge">
                  <span className="dot offline" /> {offlineCount} Offline
                </div>
                <div className="canvas-info-badge">
                  {visibleDevices.length} total devices
                </div>
              </div>

              {/* Zoom controls */}
              <div className="zoom-controls">
                <button className="zoom-btn" onClick={() => setZoom(z => Math.min(5, z * 1.2))} title="Zoom In">
                  <ZoomIn size={16} />
                </button>
                <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.3, z * 0.8))} title="Zoom Out">
                  <ZoomOut size={16} />
                </button>
                <button className="zoom-btn" onClick={() => { setZoom(getDefaultZoom(activeFloorId)); setPan({ x: 0, y: 0 }); }} title="Reset View">
                  <RotateCcw size={14} />
                </button>
                <button className="zoom-btn" onClick={() => {
                  if (!document.fullscreenElement) {
                    pageRef.current?.requestFullscreen();
                    setIsFullscreen(true);
                  } else {
                    document.exitFullscreen();
                    setIsFullscreen(false);
                  }
                }} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                  {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>

              {/* Device Popover */}
              {selectedDevice && editMode && (
                <DevicePopover
                  device={selectedDevice}
                  racks={racks}
                  position={popoverPos}
                  onSave={handleSaveDevice}
                  onDelete={handleDeleteDevice}
                  onClose={() => setSelectedDevice(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Unplaced Printers Panel (Edit Mode only) */}
        {editMode && (
          <UnplacedPrinterPanel
            printers={unplacedPrinters}
            loading={printersLoading}
            onDragStart={handlePrinterDragStart}
          />
        )}
      </div>
    </div>
  );
}
