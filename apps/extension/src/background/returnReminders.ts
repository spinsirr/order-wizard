import { LocalStorageRepository } from '@/repositories/LocalStorageRepository';
import { getReturnWarning } from '@/utils/returnWarnings';

export const RETURN_REMINDER_ALARM = 'ordercue-return-reminders';
export const RETURN_REMINDER_NOTIFICATION = 'ordercue-return-reminders';
export const RETURN_REMINDER_STATE_KEY = 'returnReminderStages';
const repository = new LocalStorageRepository();

/** Recompute from saved orders; reminder state stays on this device and never changes an order. */
export async function checkReturnReminders(now = new Date()): Promise<void> {
  const orders = await repository.getAll();
  const stored =
    await chrome.storage.local.get<Record<string, Record<string, string>>>(
      RETURN_REMINDER_STATE_KEY,
    );
  const previous: Record<string, string> = stored[RETURN_REMINDER_STATE_KEY] ?? {};
  const current: Record<string, string> = {};
  let overdueCount = 0;
  let urgentCount = 0;

  for (const order of orders) {
    const warning = getReturnWarning(order, now);
    if (!warning) continue;
    // Sync can replace the device-local id; orderNumber is the repository's stable identity.
    current[order.orderNumber] = `${warning.targetDate}:${warning.stage}`;
    if (warning.stage === 'overdue') overdueCount += 1;
    if (warning.stage === 'urgent') urgentCount += 1;
  }

  const count = Object.keys(current).length;
  await chrome.action.setBadgeText({ text: count === 0 ? '' : count > 99 ? '99+' : String(count) });
  await chrome.action.setBadgeBackgroundColor({
    color: overdueCount + urgentCount > 0 ? '#b91c1c' : '#ab570a',
  });
  await chrome.action.setTitle({
    title:
      count === 0
        ? 'Open OrderCue'
        : `OrderCue · ${count} return ${count === 1 ? 'reminder' : 'reminders'}`,
  });

  const hasNewStage = Object.entries(current).some(([id, stage]) => previous[id] !== stage);
  const hasClearedOrder = Object.keys(previous).some((id) => !(id in current));

  if (count === 0 || hasClearedOrder) {
    await chrome.notifications.clear(RETURN_REMINDER_NOTIFICATION);
  }

  if (hasNewStage) {
    // Keep stages pending if notifications are disabled so enabling them does not lose reminders.
    if ((await chrome.notifications.getPermissionLevel()) !== 'granted') return;
    await chrome.notifications.create(RETURN_REMINDER_NOTIFICATION, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-128.png'),
      title:
        overdueCount > 0
          ? 'Not reimbursed after 30 days — check returns'
          : urgentCount > 0
            ? 'Return check urgent — nearing 30 days'
            : 'Reimbursement missing — consider a return',
      message: `${count} ${count === 1 ? 'order has' : 'orders have'} not been reimbursed after 25+ days.${overdueCount > 0 ? ` ${overdueCount} at 30+ days.` : ''} Open OrderCue and confirm the return deadline on Amazon.`,
      priority: overdueCount + urgentCount > 0 ? 2 : 1,
    });
  }

  // Persist only after notification delivery succeeds, so failed deliveries can retry.
  if (hasNewStage || hasClearedOrder) {
    await chrome.storage.local.set({ [RETURN_REMINDER_STATE_KEY]: current });
  }
}

export function initializeReturnReminders(): void {
  // Serialize alarm/startup/storage events so simultaneous checks cannot notify twice.
  let pendingCheck = Promise.resolve();
  const check = () => {
    pendingCheck = pendingCheck
      .then(() => checkReturnReminders())
      .catch((error: unknown) => {
        console.error('OrderCue return reminder check failed:', error);
      });
    return pendingCheck;
  };

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETURN_REMINDER_ALARM) void check();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.orders) void check();
  });
  chrome.runtime.onStartup.addListener(check);
  chrome.runtime.onInstalled.addListener(check);
  chrome.notifications.onPermissionLevelChanged.addListener(check);
  chrome.notifications.onClicked.addListener((id) => {
    if (id !== RETURN_REMINDER_NOTIFICATION) return;
    void chrome.tabs
      .create({ url: chrome.runtime.getURL('sidepanel.html?view=returns') })
      .then(() => chrome.notifications.clear(id))
      .catch((error: unknown) => console.error('Could not open return reminders:', error));
  });

  // Alarms may be removed on update/restart. Check at each service-worker start.
  void chrome.alarms
    .get(RETURN_REMINDER_ALARM)
    .then(async (alarm) => {
      if (!alarm) await chrome.alarms.create(RETURN_REMINDER_ALARM, { periodInMinutes: 60 });
      await check();
    })
    .catch((error: unknown) => console.error('Could not schedule return reminders:', error));
}
