import { Server, Wifi, Printer } from 'lucide-react';

export interface LayoutDevice {
  id: string;
  floor_id: string;
  device_type: 'rack' | 'wap' | 'printer';
  name: string | null;
  ip_address: string | null;
  parent_rack_id: string | null;
  printer_id: string | null;
  switch_name: string | null;
  pos_x: number;
  pos_y: number;
  status: string;
}

interface Props {
  device: LayoutDevice;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: (device: LayoutDevice) => void;
  onDragStart: (e: React.PointerEvent, device: LayoutDevice) => void;
  scale: number;
  onHover?: (id: string | null) => void;
}

const ICON_MAP = { rack: Server, wap: Wifi, printer: Printer };

export default function DeviceMarker({ device, isEditMode, isSelected, onSelect, onDragStart, scale, onHover }: Props) {
  const Icon = ICON_MAP[device.device_type] || Server;
  const isOnline = device.status === 'online';
  const markerSize = 32 / scale;
  const half = markerSize / 2;
  const iconSize = 16 / scale;

  const statusColor = isOnline ? 'var(--status-success)' : '#ff1a1a';
  const glowColor = isOnline ? 'rgba(0, 200, 83, 0.5)' : 'rgba(255, 26, 26, 0.8)';
  const shapeBorder = device.device_type === 'wap' ? '50%' : device.device_type === 'printer' ? '6px' : '4px';

  return (
    <g
      transform={`translate(${device.pos_x - half}, ${device.pos_y - half})`}
      className={`device-marker ${isEditMode ? 'editable' : ''} ${isSelected ? 'selected' : ''}`}
      style={{ cursor: isEditMode ? 'grab' : 'pointer' }}
      onClick={(e) => { e.stopPropagation(); onSelect(device); }}
      onPointerDown={(e) => { if (isEditMode) onDragStart(e, device); }}
      onPointerEnter={() => { onHover?.(device.id); }}
      onPointerLeave={() => { onHover?.(null); }}
    >
      {/* Status glow ring */}
      <rect
        x={-2 / scale} y={-2 / scale}
        width={markerSize + 4 / scale} height={markerSize + 4 / scale}
        rx={shapeBorder === '50%' ? markerSize : parseFloat(shapeBorder) / scale}
        fill="none"
        stroke={statusColor}
        strokeWidth={isOnline ? 2 / scale : 3 / scale}
        opacity={isOnline ? 0.7 : 1}
      >
        {isOnline ? (
          <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2s" repeatCount="indefinite" />
        ) : (
          <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />
        )}
      </rect>

      {/* Outer glow */}
      <rect
        x={-4 / scale} y={-4 / scale}
        width={markerSize + 8 / scale} height={markerSize + 8 / scale}
        rx={shapeBorder === '50%' ? markerSize : parseFloat(shapeBorder) / scale}
        fill="none"
        stroke={glowColor}
        strokeWidth={isOnline ? 1 / scale : 2 / scale}
        opacity={isOnline ? 0.3 : 0.6}
      />

      {/* Background */}
      <rect
        x={0} y={0}
        width={markerSize} height={markerSize}
        rx={shapeBorder === '50%' ? half : parseFloat(shapeBorder) / scale}
        fill={isOnline ? "var(--aptiv-dark)" : "rgba(60, 10, 10, 0.9)"}
        stroke={isSelected ? 'var(--aptiv-primary)' : 'var(--aptiv-gray-700)'}
        strokeWidth={isSelected ? 2 / scale : 1 / scale}
        strokeDasharray={isSelected && isEditMode ? `${4 / scale}` : 'none'}
      />

      {/* Device icon */}
      <foreignObject x={(markerSize - iconSize) / 2} y={(markerSize - iconSize) / 2} width={iconSize} height={iconSize}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
          <Icon size={iconSize * scale} color="var(--aptiv-gray-300)" />
        </div>
      </foreignObject>

      {/* Status dot */}
      <circle
        cx={markerSize - 2 / scale}
        cy={4 / scale}
        r={4 / scale}
        fill={statusColor}
      />

      {/* Label with dark backdrop for readability on light blueprints */}
      <text
        x={half} y={markerSize + 16 / scale}
        textAnchor="middle"
        fontSize={14 / scale}
        fill="#1a1a2e"
        fontFamily="var(--font-family)"
        fontWeight="700"
        stroke="#ffffff"
        strokeWidth={4 / scale}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {device.device_type === 'printer' && device.ip_address
          ? `P${device.ip_address.split('.').pop()}`
          : (device.name || device.ip_address || device.device_type.toUpperCase())}
      </text>

      {/* Switch Name (Racks only) */}
      {device.device_type === 'rack' && device.switch_name && (
        <text
          x={half} y={markerSize + 30 / scale}
          textAnchor="middle"
          fontSize={12 / scale}
          fill="var(--aptiv-primary)"
          fontFamily="var(--font-family)"
          fontWeight="600"
          stroke="#ffffff"
          strokeWidth={4 / scale}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {device.switch_name}
        </text>
      )}

    </g>
  );
}

export function DeviceTooltip({ device, scale }: { device: LayoutDevice, scale: number }) {
  const isOnline = device.status === 'online';
  const tooltipLines: { label: string; value: string; color?: string }[] = [];
  if (device.name) tooltipLines.push({ label: 'Name', value: device.name });
  if (device.ip_address) tooltipLines.push({ label: 'IP', value: device.ip_address });
  if (device.switch_name) tooltipLines.push({ label: 'Switch', value: device.switch_name, color: '#ff6b00' });
  tooltipLines.push({ label: 'Status', value: isOnline ? 'Online' : 'Offline', color: isOnline ? '#00c853' : '#ff3d00' });

  const markerSize = 32 / scale;
  const half = markerSize / 2;
  const tooltipW = 400 / scale;
  const tooltipH = (48 + tooltipLines.length * 36) / scale;
  const tooltipX = half - tooltipW / 2;
  const tooltipY = -(tooltipH + 16 / scale);

  return (
    <g transform={`translate(${device.pos_x - half}, ${device.pos_y - half})`} style={{ pointerEvents: 'none' }}>
      <rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx={12 / scale} fill="rgba(10, 10, 20, 0.95)" stroke="var(--aptiv-primary)" strokeWidth={3 / scale} />
      <polygon points={`${half - 12 / scale},${tooltipY + tooltipH} ${half},${tooltipY + tooltipH + 12 / scale} ${half + 12 / scale},${tooltipY + tooltipH}`} fill="rgba(10, 10, 20, 0.95)" stroke="var(--aptiv-primary)" strokeWidth={3 / scale} />
      <rect x={half - 13 / scale} y={tooltipY + tooltipH - 2 / scale} width={26 / scale} height={5 / scale} fill="rgba(10, 10, 20, 0.95)" />
      {tooltipLines.map((line, i) => (
        <g key={i}>
          <text x={tooltipX + 20 / scale} y={tooltipY + (36 + i * 36) / scale} fontSize={20 / scale} fill="#999" fontFamily="var(--font-family)" fontWeight="500">{line.label}:</text>
          <text x={tooltipX + tooltipW - 20 / scale} y={tooltipY + (36 + i * 36) / scale} fontSize={20 / scale} fill={line.color || '#fff'} fontFamily="var(--font-family)" fontWeight="600" textAnchor="end">{line.value}</text>
        </g>
      ))}
    </g>
  );
}
