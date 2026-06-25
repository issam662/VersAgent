import { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import type { LayoutDevice } from './DeviceMarker';

interface Props {
  device: LayoutDevice;
  racks: LayoutDevice[];
  position: { x: number; y: number };
  onSave: (id: string, data: Partial<LayoutDevice>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function DevicePopover({ device, racks, position, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(device.name || '');
  const [ip, setIp] = useState(device.ip_address || '');
  const [parentRack, setParentRack] = useState(device.parent_rack_id || '');
  const [switchName, setSwitchName] = useState(device.switch_name || '');
  // Status is determined by ping — not editable

  useEffect(() => {
    setName(device.name || '');
    setIp(device.ip_address || '');
    setParentRack(device.parent_rack_id || '');
    setSwitchName(device.switch_name || '');

  }, [device]);

  const handleSave = () => {
    onSave(device.id, {
      name: name || null,
      ip_address: ip || null,
      parent_rack_id: parentRack || null,
      switchName: switchName || null,
    } as any);
  };

  return (
    <div
      className="device-popover"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="popover-header">
        <h4>{device.device_type.toUpperCase()} Properties</h4>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="popover-body">
        <div className="popover-field">
          <label className="input-label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name" />
        </div>

        <div className="popover-field">
          <label className="input-label">IP Address</label>
          <input className="input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="e.g. 10.71.10.1" disabled={device.device_type === 'printer'} />
        </div>

        {(device.device_type === 'rack') && (
          <div className="popover-field">
            <label className="input-label">Switch Name</label>
            <input className="input" value={switchName} onChange={(e) => setSwitchName(e.target.value)} placeholder="e.g. SW-PROD-01" />
          </div>
        )}

        {(device.device_type === 'wap') && (
          <div className="popover-field">
            <label className="input-label">Parent Rack</label>
            <select className="input" value={parentRack} onChange={(e) => setParentRack(e.target.value)}>
              <option value="">— None —</option>
              {racks.map(r => (
                <option key={r.id} value={r.id}>{r.name || r.id}</option>
              ))}
            </select>
          </div>
        )}

        <div className="popover-field">
          <label className="input-label">Status (Ping)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'var(--aptiv-gray-900)', borderRadius: 'var(--radius-md)', border: '1px solid var(--aptiv-gray-800)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: device.status === 'online' ? 'var(--status-success)' : 'var(--status-danger)', boxShadow: device.status === 'online' ? '0 0 6px rgba(0,200,83,0.5)' : 'none' }} />
            <span style={{ fontSize: '0.8125rem', color: device.status === 'online' ? 'var(--status-success)' : 'var(--aptiv-gray-500)' }}>
              {device.status === 'online' ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      <div className="popover-footer">
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(device.id)}>
          <Trash2 size={14} /> Remove
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>
          <Save size={14} /> Save
        </button>
      </div>
    </div>
  );
}
