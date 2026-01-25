import { useState, useEffect } from 'react';
import { fbQueue } from '@/lib';
import type { FBQueueItem, QueueItemStatus } from '@/types';

// Status icons
const STATUS_ICONS: Record<QueueItemStatus, string> = {
  pending: '○',
  filling: '●',
  waiting: '⏸',
  done: '✓',
  failed: '✗',
};

// Styles
const containerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  zIndex: 999998,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const widgetStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
  width: '320px',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#1877F2',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const headerButtonsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
};

const iconButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  padding: '4px 8px',
  fontSize: '16px',
  borderRadius: '4px',
  opacity: 0.9,
};

const bodyStyle: React.CSSProperties = {
  padding: '12px 16px',
  maxHeight: '300px',
  overflowY: 'auto',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 0',
  borderBottom: '1px solid #f0f0f0',
};

const itemIconStyle = (status: QueueItemStatus): React.CSSProperties => {
  const colors: Record<QueueItemStatus, string> = {
    pending: '#9ca3af',
    filling: '#1877F2',
    waiting: '#f59e0b',
    done: '#10b981',
    failed: '#ef4444',
  };
  return {
    fontSize: '14px',
    color: colors[status],
    fontWeight: 'bold',
    width: '18px',
    textAlign: 'center',
  };
};

const itemTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '13px',
  color: '#374151',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const itemStatusStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#6b7280',
  textTransform: 'capitalize',
};

const progressBarContainerStyle: React.CSSProperties = {
  padding: '8px 16px 12px',
  borderTop: '1px solid #f0f0f0',
};

const progressBarLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#6b7280',
  marginBottom: '6px',
  display: 'flex',
  justifyContent: 'space-between',
};

const progressBarTrackStyle: React.CSSProperties = {
  height: '6px',
  backgroundColor: '#e5e7eb',
  borderRadius: '3px',
  overflow: 'hidden',
};

const progressBarFillStyle = (percent: number): React.CSSProperties => ({
  height: '100%',
  width: `${percent}%`,
  backgroundColor: '#1877F2',
  transition: 'width 0.3s ease',
});

const moreItemsStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  padding: '8px 0',
  textAlign: 'center',
};

const emptyStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#9ca3af',
  textAlign: 'center',
  padding: '20px 0',
};

// Minimized badge styles
const minimizedBadgeStyle: React.CSSProperties = {
  backgroundColor: '#1877F2',
  color: '#fff',
  borderRadius: '24px',
  padding: '10px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(24, 119, 242, 0.4)',
  fontSize: '14px',
  fontWeight: 500,
};

const MAX_VISIBLE_ITEMS = 5;

export function FloatingQueue() {
  const [minimized, setMinimized] = useState(false);
  const [queue, setQueue] = useState<FBQueueItem[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    // Subscribe to queue updates
    const unsubscribe = fbQueue.subscribe((items) => {
      setQueue(items);
    });

    // Check initial paused state
    setPaused(fbQueue.isPaused());

    return unsubscribe;
  }, []);

  const doneCount = queue.filter((item) => item.status === 'done').length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;
  const totalCount = queue.length;
  const completedCount = doneCount + failedCount;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handlePauseResume = () => {
    if (paused) {
      fbQueue.resume();
      setPaused(false);
    } else {
      fbQueue.pause();
      setPaused(true);
    }
  };

  const handleClear = async () => {
    await fbQueue.clear();
  };

  const visibleItems = queue.slice(0, MAX_VISIBLE_ITEMS);
  const hiddenCount = queue.length - visibleItems.length;

  // Don't render if queue is empty
  if (queue.length === 0) {
    return null;
  }

  // Minimized view
  if (minimized) {
    return (
      <div style={containerStyle}>
        <div style={minimizedBadgeStyle} onClick={() => setMinimized(false)}>
          <span>FB Queue</span>
          <span style={{ fontWeight: 'bold' }}>
            {completedCount}/{totalCount}
          </span>
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div style={containerStyle}>
      <div style={widgetStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={headerTitleStyle}>
            <span>FB Marketplace Queue</span>
          </h3>
          <div style={headerButtonsStyle}>
            <button
              style={iconButtonStyle}
              onClick={handlePauseResume}
              title={paused ? 'Resume' : 'Pause'}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {paused ? '▶' : '⏸'}
            </button>
            <button
              style={iconButtonStyle}
              onClick={handleClear}
              title="Clear all"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              ✕
            </button>
            <button
              style={iconButtonStyle}
              onClick={() => setMinimized(true)}
              title="Minimize"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              −
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {visibleItems.length === 0 ? (
            <div style={emptyStyle}>Queue is empty</div>
          ) : (
            <>
              {visibleItems.map((item) => (
                <div key={item.id} style={itemStyle}>
                  <span style={itemIconStyle(item.status)}>
                    {STATUS_ICONS[item.status]}
                  </span>
                  <span style={itemTitleStyle} title={item.listing.title}>
                    {item.listing.title}
                  </span>
                  <span style={itemStatusStyle}>{item.status}</span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <div style={moreItemsStyle}>+{hiddenCount} more items</div>
              )}
            </>
          )}
        </div>

        {/* Progress bar */}
        <div style={progressBarContainerStyle}>
          <div style={progressBarLabelStyle}>
            <span>Progress</span>
            <span>
              {completedCount} / {totalCount}
              {failedCount > 0 && ` (${failedCount} failed)`}
            </span>
          </div>
          <div style={progressBarTrackStyle}>
            <div style={progressBarFillStyle(progressPercent)} />
          </div>
        </div>
      </div>
    </div>
  );
}
