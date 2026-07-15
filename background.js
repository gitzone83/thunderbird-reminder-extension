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

async function addReminderTag(message_id, header_message_id) {
  try {
    const message = await resolve_message(message_id, header_message_id);
    if (message) {
      const current_tags = message.tags || [];
      if (!current_tags.includes(REMINDER_TAG_KEY)) {
        await browser.messages.update(message.id, {
          tags: [...current_tags, REMINDER_TAG_KEY]
        });
      }
    }
  } catch (error) {
    console.error("Error adding reminder tag:", error);
  }
}

async function removeReminderTag(message_id, header_message_id) {
  try {
    const message = await resolve_message(message_id, header_message_id);
    if (message) {
      const current_tags = message.tags || [];
      if (current_tags.includes(REMINDER_TAG_KEY)) {
        await browser.messages.update(message.id, {
          tags: current_tags.filter(tag => tag !== REMINDER_TAG_KEY)
        });
      }
    }
  } catch (error) {
    console.error("Error removing reminder tag:", error);
  }
}

async function hasOtherActiveReminders(message_id, header_message_id, exclude_reminder_id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");
  const active_statuses = ["pending", "snoozed", "notified"];

  for (const [id, reminder] of Object.entries(reminders)) {
    if (id === exclude_reminder_id || !active_statuses.includes(reminder.status)) {
      continue;
    }

    if (header_message_id && reminder.messageHeaderId) {
      if (reminder.messageHeaderId === header_message_id) {
        return true;
      }
      continue;
    }

    if (reminder.messageId === message_id) {
      return true;
    }
  }
  return false;
}

async function removeReminderTagIfNoActiveReminders(message_id, header_message_id, exclude_reminder_id) {
  const has_other = await hasOtherActiveReminders(
    message_id,
    header_message_id,
    exclude_reminder_id
  );
  if (!has_other) {
    await removeReminderTag(message_id, header_message_id);
  }
}

async function syncReminderTags() {
  try {
    const reminders = await getReminders();
    const active_reminders = reminders.filter(r =>
      r.status === "pending" || r.status === "snoozed" || r.status === "notified"
    );

    // Add tags to messages with active reminders (resolves via stable header Message-ID)
    for (const reminder of active_reminders) {
      const message = await resolve_message(reminder.messageId, reminder.messageHeaderId);
      if (message) {
        await refresh_stored_message_id(reminder.id, message);
        await addReminderTag(message.id, reminder.messageHeaderId);
      }
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

async function find_message_by_header_id(header_message_id) {
  try {
    const result = await browser.messages.query({
      headerMessageId: header_message_id
    });
    if (result.messages && result.messages.length > 0) {
      return result.messages[0];
    }
  } catch (error) {
    console.error("Error searching for message:", error);
  }
  return null;
}

// Thunderbird's numeric message.id can be recycled after delete/move/compact.
// Prefer the stable RFC Message-ID header, and reject numeric IDs that point
// at a different message when a header id is known.
async function resolve_message(message_id, header_message_id) {
  if (header_message_id) {
    const by_header = await find_message_by_header_id(header_message_id);
    if (by_header) {
      return by_header;
    }
  }

  if (message_id != null) {
    try {
      const message = await browser.messages.get(message_id);
      if (!message) {
        return null;
      }
      if (
        header_message_id &&
        message.headerMessageId &&
        message.headerMessageId !== header_message_id
      ) {
        return null;
      }
      return message;
    } catch (error) {
      // Stored numeric id may be invalid after mailbox changes
    }
  }

  return null;
}

async function refresh_stored_message_id(reminder_id, message) {
  if (!reminder_id || !message) {
    return;
  }
  const reminder = await getReminderById(reminder_id);
  if (reminder && reminder.messageId !== message.id) {
    await updateReminder(reminder_id, { messageId: message.id });
  }
}

async function openEmail(reminder) {
  try {
    const message = await resolve_message(reminder.messageId, reminder.messageHeaderId);

    if (message) {
      await refresh_stored_message_id(reminder.id, message);
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
  await addReminderTag(data.messageId, data.messageHeaderId);
  await archiveMessageIfEnabled(data.messageId, data.messageHeaderId);
  await updateBadge();
  return { success: true, id };
}

async function archiveMessageIfEnabled(message_id, header_message_id) {
  try {
    const { settings = {} } = await browser.storage.local.get("settings");
    if (!settings.archiveOnReminder) return;

    const message = await resolve_message(message_id, header_message_id);
    if (!message) {
      console.warn("Could not resolve message for archive");
      return;
    }

    if (browser.messages.archive) {
      await browser.messages.archive([message.id]);
    } else {
      console.warn("messages.archive API not available");
    }
  } catch (error) {
    console.error("Error archiving message:", error);
  }
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

  const message_id = reminders[id].messageId;
  const header_message_id = reminders[id].messageHeaderId;
  reminders[id].status = "dismissed";
  reminders[id].modifiedDate = new Date().toISOString();

  await browser.storage.local.set({ reminders });
  await removeReminderTagIfNoActiveReminders(message_id, header_message_id, id);
  await browser.notifications.clear(id);
  await updateBadge();
  return { success: true };
}

async function completeReminder(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  const message_id = reminders[id].messageId;
  const header_message_id = reminders[id].messageHeaderId;
  reminders[id].status = "completed";
  reminders[id].completedDate = new Date().toISOString();
  reminders[id].modifiedDate = new Date().toISOString();

  await browser.storage.local.set({ reminders });
  await removeReminderTagIfNoActiveReminders(message_id, header_message_id, id);
  await browser.notifications.clear(id);
  await updateBadge();
  return { success: true };
}

async function deleteReminder(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  const message_id = reminders[id].messageId;
  const header_message_id = reminders[id].messageHeaderId;
  const was_active = ["pending", "snoozed", "notified"].includes(reminders[id].status);

  delete reminders[id];
  await browser.storage.local.set({ reminders });

  // Only check for tag removal if the deleted reminder was active
  if (was_active) {
    await removeReminderTagIfNoActiveReminders(message_id, header_message_id, id);
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
