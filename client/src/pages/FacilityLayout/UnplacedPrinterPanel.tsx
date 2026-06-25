import { Printer, GripVertical } from 'lucide-react';

export interface UnplacedPrinter {
  id: string;
  ip_address: string;
  hostname?: string | null;
  model?: string | null;
  category?: string;
}

interface Props {
  printers: UnplacedPrinter[];
  loading: boolean;
  onDragStart: (e: React.DragEvent, printer: UnplacedPrinter) => void;
}

export default function UnplacedPrinterPanel({ printers, loading, onDragStart }: Props) {
  return (
    <div className="unplaced-panel">
      <div className="unplaced-panel-header">
        <Printer size={18} />
        <h3>Unplaced Printer Inventory</h3>
        <span className="badge badge-neutral">{printers.length}</span>
      </div>

      <div className="unplaced-panel-body">
        {loading ? (
          <div className="unplaced-loading">
            <div className="loader" style={{ width: 24, height: 24 }} />
            <span>Loading printers...</span>
          </div>
        ) : printers.length === 0 ? (
          <div className="unplaced-empty">
            <Printer size={32} opacity={0.3} />
            <p>All printers have been placed on the layout.</p>
          </div>
        ) : (
          <div className="unplaced-list">
            {printers.map(p => (
              <div
                key={p.id}
                className="unplaced-item"
                draggable
                onDragStart={(e) => onDragStart(e, p)}
              >
                <GripVertical size={14} className="drag-handle" />
                <div className="unplaced-item-icon">
                  <Printer size={16} />
                </div>
                <div className="unplaced-item-info">
                  <span className="unplaced-item-ip font-mono">{p.ip_address}</span>
                  <span className="unplaced-item-model">{p.model || p.hostname || p.category || '—'}</span>
                </div>
                <span className="unplaced-item-id">{p.id.substring(0, 8)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
