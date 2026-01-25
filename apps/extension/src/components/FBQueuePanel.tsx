import { useState, useEffect } from 'react';
import { fbQueue } from '@/lib';
import type { FBQueueItem, QueueItemStatus } from '@/types';
import { cn } from '@/lib/cn';

const STATUS_ICONS: Record<QueueItemStatus, string> = {
  pending: '○',
  filling: '●',
  waiting: '⏸',
  done: '✓',
  failed: '✗',
};

const STATUS_COLORS: Record<QueueItemStatus, string> = {
  pending: 'text-muted-foreground',
  filling: 'text-primary',
  waiting: 'text-yellow-500',
  done: 'text-green-500',
  failed: 'text-destructive',
};

export function FBQueuePanel() {
  const [queue, setQueue] = useState<FBQueueItem[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const unsubscribe = fbQueue.subscribe((items) => {
      setQueue(items);
    });
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

  const handleMarkDone = async (itemId: string) => {
    await fbQueue.updateStatus(itemId, 'done');
    const { fb_current_item } = await chrome.storage.local.get('fb_current_item');
    if (fb_current_item === itemId) {
      await chrome.storage.local.remove('fb_current_item');
    }
  };

  const handleRetry = async (itemId: string) => {
    await fbQueue.updateStatus(itemId, 'pending');
  };

  if (queue.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-muted-foreground">
        <p className="text-lg">No items in queue</p>
        <p className="text-sm mt-2">Add orders to FB Marketplace from the Orders tab</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header controls */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {completedCount} / {totalCount} completed
          {failedCount > 0 && <span className="text-destructive ml-1">({failedCount} failed)</span>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePauseResume}
            className="px-3 py-1 text-sm rounded-md bg-secondary hover:bg-secondary/80"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1 text-sm rounded-md bg-secondary hover:bg-secondary/80 text-destructive"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2 border-b">
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto">
        {queue.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 px-4 py-3 border-b hover:bg-secondary/30"
          >
            <span className={cn('text-lg font-bold', STATUS_COLORS[item.status])}>
              {STATUS_ICONS[item.status]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.listing.title}</p>
              <p className="text-xs text-muted-foreground capitalize">{item.status}</p>
              {item.error && (
                <p className="text-xs text-destructive truncate">{item.error}</p>
              )}
            </div>
            <div className="flex gap-1">
              {(item.status === 'waiting' || item.status === 'filling') && (
                <button
                  type="button"
                  onClick={() => handleMarkDone(item.id)}
                  className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-600 hover:bg-green-500/20"
                  title="Mark as done"
                >
                  Done
                </button>
              )}
              {item.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => handleRetry(item.id)}
                  className="px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20"
                  title="Retry"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
