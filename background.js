// Email Reminders - Background Script
// Handles alarm scheduling, notifications, and reminder management

const ALARM_NAME = "checkReminders";
const CHECK_INTERVAL_MINUTES = 1;
const REMINDER_TAG_KEY = "reminder";
const REMINDER_TAG_COLOR = "#ff9800"; // Orange color for reminder tag

// ============================================================================
// Tag Management
// ============================================================================

async function initializeReminderTag() {
  try {
    // Try the available API (supports both MV2 and MV3)
    let tags;
    if (browser.messages.tags && browser.messages.tags.list) {
      tags = await browser.messages.tags.list();
    } else if (browser.messages.listTags) {
      tags = await browser.messages.listTags();
    } else {
      console.warn("No tag listing API available");
      return;
    }

    const existingTag = tags.find(tag => tag.key === REMINDER_TAG_KEY);

    if (!existingTag) {
      // Try the available create API
      if (browser.messages.tags && browser.messages.tags.create) {
        await browser.messages.tags.create(REMINDER_TAG_KEY, "Has Reminder", REMINDER_TAG_COLOR);
      } else if (browser.messages.createTag) {
        await browser.messages.createTag(REMINDER_TAG_KEY, "Has Reminder", REMINDER_TAG_COLOR);
      } else {
        console.warn("No tag creation API available");
        return;
      }
    }
  } catch (error) {
    console.error("Error initializing reminder tag:", error);
  }
}

async function addReminderTag(messageId) {
  try {
    const message = await browser.messages.get(messageId);
    if (message) {
      const currentTags = message.tags || [];
      if (!currentTags.includes(REMINDER_TAG_KEY)) {
        await browser.messages.update(messageId, {
          tags: [...currentTags, REMINDER_TAG_KEY]
        });
      }
    }
  } catch (error) {
    console.error("Error adding reminder tag:", error);
  }
}

async function removeReminderTag(messageId) {
  try {
    const message = await browser.messages.get(messageId);
    if (message) {
      const currentTags = message.tags || [];
      if (currentTags.includes(REMINDER_TAG_KEY)) {
        await browser.messages.update(messageId, {
          tags: currentTags.filter(tag => tag !== REMINDER_TAG_KEY)
        });
      }
    }
  } catch (error) {
    console.error("Error removing reminder tag:", error);
  }
}

async function hasOtherActiveReminders(messageId, excludeReminderId) {
  const { reminders = {} } = await browser.storage.local.get("reminders");
  const activeStatuses = ["pending", "snoozed", "notified"];

  for (const [id, reminder] of Object.entries(reminders)) {
    if (id !== excludeReminderId &&
        reminder.messageId === messageId &&
        activeStatuses.includes(reminder.status)) {
      return true;
    }
  }
  return false;
}

async function removeReminderTagIfNoActiveReminders(messageId, excludeReminderId) {
  const hasOther = await hasOtherActiveReminders(messageId, excludeReminderId);
  if (!hasOther) {
    await removeReminderTag(messageId);
  }
}

async function syncReminderTags() {
  try {
    const reminders = await getReminders();
    const activeReminders = reminders.filter(r =>
      r.status === "pending" || r.status === "snoozed" || r.status === "notified"
    );

    // Add tags to messages with active reminders
    for (const reminder of activeReminders) {
      await addReminderTag(reminder.messageId);
    }
  } catch (error) {
    console.error("Error syncing reminder tags:", error);
  }
}

// ============================================================================
// Initialization
// ============================================================================

browser.runtime.onInstalled.addListener(async () => {
  await initializeAlarm();
});

browser.runtime.onStartup.addListener(async () => {
  await initializeAlarm();
});

async function initializeAlarm() {
  // Clear any existing alarm and create fresh one
  await browser.alarms.clear(ALARM_NAME);
  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: CHECK_INTERVAL_MINUTES
  });

  // Initialize reminder tag
  await initializeReminderTag();

  // Do an immediate check on startup
  await checkDueReminders();

  // Sync reminder tags on startup
  await syncReminderTags();

  // Update badge on startup
  await updateBadge();
}

// ============================================================================
// Alarm Handling
// ============================================================================

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await checkDueReminders();
  }
});

async function checkDueReminders() {
  const reminders = await getReminders();
  const now = new Date();
  let statusChanged = false;

  for (const reminder of reminders) {
    if (reminder.status !== "pending" && reminder.status !== "snoozed") {
      continue;
    }

    const dueDate = new Date(reminder.dueDate);
    if (dueDate <= now) {
      await showReminderNotification(reminder);
      // Mark as notified to prevent repeated notifications
      await updateReminderStatus(reminder.id, "notified");
      statusChanged = true;
    }
  }

  // Update badge if any status changed
  if (statusChanged) {
    await updateBadge();
  }
}

// ============================================================================
// Notifications
// ============================================================================

async function showReminderNotification(reminder) {
  const truncatedSubject = reminder.subject.length > 50
    ? reminder.subject.substring(0, 47) + "..."
    : reminder.subject;

  await browser.notifications.create(reminder.id, {
    type: "basic",
    iconUrl: "icons/icon-48.png",
    title: "Email Reminder",
    message: `${truncatedSubject}\nFrom: ${reminder.sender}`
  });
}

browser.notifications.onClicked.addListener(async (notificationId) => {
  // Try to open the original email
  const reminder = await getReminderById(notificationId);
  if (reminder) {
    await openEmail(reminder);
  }
  await browser.notifications.clear(notificationId);
});

browser.notifications.onClosed.addListener(async (notificationId) => {
  // Notification was dismissed, keep reminder in notified state
  // User can snooze or dismiss from popup
});

async function openEmail(reminder) {
  try {
    // First try with stored messageId
    let message = null;
    try {
      message = await browser.messages.get(reminder.messageId);
    } catch (e) {
      // Message ID might be stale, try finding by header ID
    }

    if (!message && reminder.messageHeaderId) {
      message = await findMessageByHeaderId(reminder.messageHeaderId);
    }

    if (message) {
      // Open the message in a new tab
      await browser.messageDisplay.open({
        messageId: message.id,
        location: "tab"
      });
    } else {
      console.warn("Could not find message for reminder:", reminder.id);
    }
  } catch (error) {
    console.error("Error opening email:", error);
  }
}

async function findMessageByHeaderId(headerMessageId) {
  try {
    const result = await browser.messages.query({
      headerMessageId: headerMessageId
    });
    if (result.messages && result.messages.length > 0) {
      return result.messages[0];
    }
  } catch (error) {
    console.error("Error searching for message:", error);
  }
  return null;
}

// ============================================================================
// Context Menu
// ============================================================================

browser.menus.create({
  id: "set-reminder",
  title: "Set Reminder...",
  contexts: ["message_list"]
});

browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "set-reminder") {
    if (info.selectedMessages && info.selectedMessages.messages.length > 0) {
      const message = info.selectedMessages.messages[0];
      await openReminderDialog(message);
    }
  }
});

async function openReminderDialog(message) {
  // Store message data temporarily for the dialog
  await browser.storage.local.set({
    pendingReminderMessage: {
      id: message.id,
      headerMessageId: message.headerMessageId,
      subject: message.subject,
      author: message.author,
      folder: message.folder
    }
  });

  await browser.windows.create({
    url: "reminder-dialog/dialog.html",
    type: "popup",
    width: 530,
    height: 620
  });
}

// ============================================================================
// Message API
// ============================================================================

browser.runtime.onMessage.addListener(async (message, sender) => {
  switch (message.action) {
    case "createReminder":
      return await createReminder(message.data);

    case "updateReminder":
      return await updateReminder(message.id, message.data);

    case "snoozeReminder":
      return await snoozeReminder(message.id, message.minutes);

    case "dismissReminder":
      return await dismissReminder(message.id);

    case "completeReminder":
      return await completeReminder(message.id);

    case "deleteReminder":
      return await deleteReminder(message.id);

    case "getReminders":
      return await getReminders();

    case "getReminderCounts":
      const allReminders = await getReminders();
      return getReminderCounts(allReminders);

    case "getReminderById":
      return await getReminderById(message.id);

    case "getPendingMessage":
      return await getPendingMessage();

    case "openEmail":
      const reminder = await getReminderById(message.id);
      if (reminder) {
        await openEmail(reminder);
      }
      return { success: true };

    default:
      return { error: "Unknown action" };
  }
});

// ============================================================================
// Reminder CRUD Operations
// ============================================================================

async function createReminder(data) {
  const { reminders = {} } = await browser.storage.local.get("reminders");
  const id = generateId();

  reminders[id] = {
    id,
    messageId: data.messageId,
    messageHeaderId: data.messageHeaderId,
    subject: data.subject,
    sender: data.sender,
    folderId: data.folderId,
    dueDate: data.dueDate,
    notes: data.notes || "",
    createdDate: new Date().toISOString(),
    status: "pending",
    snoozeCount: 0
  };

  await browser.storage.local.set({ reminders });
  await addReminderTag(data.messageId);
  await updateBadge();
  return { success: true, id };
}

async function updateReminder(id, data) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  reminders[id] = {
    ...reminders[id],
    ...data,
    modifiedDate: new Date().toISOString()
  };

  await browser.storage.local.set({ reminders });
  return { success: true };
}

async function updateReminderStatus(id, status) {
  return await updateReminder(id, { status });
}

async function snoozeReminder(id, minutes) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  const newDueDate = new Date();
  newDueDate.setMinutes(newDueDate.getMinutes() + minutes);

  reminders[id].dueDate = newDueDate.toISOString();
  reminders[id].status = "snoozed";
  reminders[id].snoozeCount = (reminders[id].snoozeCount || 0) + 1;
  reminders[id].modifiedDate = new Date().toISOString();

  await browser.storage.local.set({ reminders });
  await browser.notifications.clear(id);
  await updateBadge();
  return { success: true };
}

async function dismissReminder(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  const messageId = reminders[id].messageId;
  reminders[id].status = "dismissed";
  reminders[id].modifiedDate = new Date().toISOString();

  await browser.storage.local.set({ reminders });
  await removeReminderTagIfNoActiveReminders(messageId, id);
  await browser.notifications.clear(id);
  await updateBadge();
  return { success: true };
}

async function completeReminder(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  const messageId = reminders[id].messageId;
  reminders[id].status = "completed";
  reminders[id].completedDate = new Date().toISOString();
  reminders[id].modifiedDate = new Date().toISOString();

  await browser.storage.local.set({ reminders });
  await removeReminderTagIfNoActiveReminders(messageId, id);
  await browser.notifications.clear(id);
  await updateBadge();
  return { success: true };
}

async function deleteReminder(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  const messageId = reminders[id].messageId;
  const wasActive = ["pending", "snoozed", "notified"].includes(reminders[id].status);

  delete reminders[id];
  await browser.storage.local.set({ reminders });

  // Only check for tag removal if the deleted reminder was active
  if (wasActive) {
    await removeReminderTagIfNoActiveReminders(messageId, id);
  }

  await browser.notifications.clear(id);
  await updateBadge();
  return { success: true };
}

async function getReminders() {
  const { reminders = {} } = await browser.storage.local.get("reminders");
  return Object.values(reminders).sort((a, b) =>
    new Date(a.dueDate) - new Date(b.dueDate)
  );
}

async function getReminderById(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");
  return reminders[id] || null;
}

async function getPendingMessage() {
  const { pendingReminderMessage } = await browser.storage.local.get("pendingReminderMessage");
  // Clear it after retrieval
  await browser.storage.local.remove("pendingReminderMessage");
  return pendingReminderMessage;
}

// ============================================================================
// Badge Updates
// ============================================================================

async function updateBadge() {
  const reminders = await getReminders();
  const counts = getReminderCounts(reminders);

  const pendingAndSnoozed = counts.pending + counts.snoozed;
  const due = counts.notified;

  if (pendingAndSnoozed > 0 || due > 0) {
    // Show format: pending|due (e.g., "3|2")
    const badgeText = `${pendingAndSnoozed}|${due}`;
    await browser.browserAction.setBadgeText({ text: badgeText });

    // Use different colors based on urgency
    if (due > 0) {
      // Orange for due reminders
      await browser.browserAction.setBadgeBackgroundColor({ color: "#ff9800" });
    } else {
      // Blue for pending only
      await browser.browserAction.setBadgeBackgroundColor({ color: "#1976d2" });
    }
  } else {
    await browser.browserAction.setBadgeText({ text: "" });
  }
}

function getReminderCounts(reminders) {
  const counts = {
    pending: 0,
    snoozed: 0,
    notified: 0,
    completed: 0,
    dismissed: 0,
    total: reminders.length
  };

  for (const reminder of reminders) {
    if (counts.hasOwnProperty(reminder.status)) {
      counts[reminder.status]++;
    }
  }

  counts.active = counts.pending + counts.snoozed + counts.notified;
  counts.archived = counts.completed + counts.dismissed;

  return counts;
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId() {
  return 'rem_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}
