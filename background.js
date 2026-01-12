// Email Reminders - Background Script
// Handles alarm scheduling, notifications, and reminder management

const ALARM_NAME = "checkReminders";
const CHECK_INTERVAL_MINUTES = 1;

// ============================================================================
// Initialization
// ============================================================================

browser.runtime.onInstalled.addListener(async () => {
  console.log("Email Reminders extension installed");
  await initializeAlarm();
});

browser.runtime.onStartup.addListener(async () => {
  console.log("Email Reminders extension started");
  await initializeAlarm();
});

async function initializeAlarm() {
  // Clear any existing alarm and create fresh one
  await browser.alarms.clear(ALARM_NAME);
  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: CHECK_INTERVAL_MINUTES
  });
  console.log(`Alarm set to check every ${CHECK_INTERVAL_MINUTES} minute(s)`);

  // Do an immediate check on startup
  await checkDueReminders();
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

  for (const reminder of reminders) {
    if (reminder.status !== "pending" && reminder.status !== "snoozed") {
      continue;
    }

    const dueDate = new Date(reminder.dueDate);
    if (dueDate <= now) {
      await showReminderNotification(reminder);
      // Mark as notified to prevent repeated notifications
      await updateReminderStatus(reminder.id, "notified");
    }
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
      console.log("Message ID stale, searching by header ID");
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
  console.log("Created reminder:", id);
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

  console.log(`Snoozed reminder ${id} for ${minutes} minutes`);
  return { success: true };
}

async function dismissReminder(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  reminders[id].status = "dismissed";
  reminders[id].modifiedDate = new Date().toISOString();

  await browser.storage.local.set({ reminders });
  await browser.notifications.clear(id);

  console.log("Dismissed reminder:", id);
  return { success: true };
}

async function completeReminder(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  reminders[id].status = "completed";
  reminders[id].completedDate = new Date().toISOString();
  reminders[id].modifiedDate = new Date().toISOString();

  await browser.storage.local.set({ reminders });
  await browser.notifications.clear(id);

  console.log("Completed reminder:", id);
  return { success: true };
}

async function deleteReminder(id) {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  if (!reminders[id]) {
    return { error: "Reminder not found" };
  }

  delete reminders[id];
  await browser.storage.local.set({ reminders });
  await browser.notifications.clear(id);

  console.log("Deleted reminder:", id);
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
// Utility Functions
// ============================================================================

function generateId() {
  return 'rem_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}
