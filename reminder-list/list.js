// Reminder List Page Script

let allReminders = [];
let currentFilter = "active";

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("extensionVersion").textContent = I18n.message(
    "extensionVersion", browser.runtime.getManifest().version
  );
  await loadReminders();
  setupFilterListener();
});

function setupFilterListener() {
  document.getElementById("filterStatus").addEventListener("change", (e) => {
    currentFilter = e.target.value;
    renderReminders();
  });
}

async function loadReminders() {
  const loadingEl = document.getElementById("loading");
  const emptyEl = document.getElementById("empty-state");
  const containerEl = document.getElementById("reminders-container");

  try {
    allReminders = await browser.runtime.sendMessage({ action: "getReminders" });
    loadingEl.classList.add("hidden");
    renderReminders();
  } catch (error) {
    console.error("Error loading reminders:", error);
    loadingEl.textContent = I18n.message("loadRemindersError");
  }
}

function renderReminders() {
  const emptyEl = document.getElementById("empty-state");
  const containerEl = document.getElementById("reminders-container");
  const tbody = document.getElementById("reminders-tbody");

  const filteredReminders = filterReminders(allReminders, currentFilter);

  if (filteredReminders.length === 0) {
    emptyEl.classList.remove("hidden");
    containerEl.classList.add("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  containerEl.classList.remove("hidden");

  tbody.innerHTML = "";

  for (const reminder of filteredReminders) {
    const row = createReminderRow(reminder);
    tbody.appendChild(row);
  }
}

function filterReminders(reminders, filter) {
  switch (filter) {
    case "active":
      return reminders.filter(r => ["pending", "snoozed", "notified"].includes(r.status));
    case "pending":
      return reminders.filter(r => r.status === "pending" || r.status === "snoozed");
    case "completed":
      return reminders.filter(r => r.status === "completed");
    case "dismissed":
      return reminders.filter(r => r.status === "dismissed");
    case "all":
    default:
      return reminders;
  }
}

function createReminderRow(reminder) {
  const now = new Date();
  const dueDate = new Date(reminder.dueDate);
  const isOverdue = dueDate < now && ["pending", "snoozed", "notified"].includes(reminder.status);
  const isDueSoon = !isOverdue && (dueDate - now) < 60 * 60 * 1000;
  const isActive = ["pending", "snoozed", "notified"].includes(reminder.status);

  const row = document.createElement("tr");

  // Status cell
  const statusCell = document.createElement("td");
  const statusBadge = document.createElement("span");
  statusBadge.className = `status-badge ${reminder.status}`;
  statusBadge.textContent = formatStatus(reminder.status);
  statusCell.appendChild(statusBadge);

  // Subject cell
  const subjectCell = document.createElement("td");
  subjectCell.className = "subject-cell";
  subjectCell.addEventListener("click", () => openEmail(reminder.id));

  const subjectText = document.createElement("div");
  subjectText.className = "subject-text";
  subjectText.textContent = reminder.subject || I18n.message("noSubject");
  subjectText.title = reminder.subject || I18n.message("noSubject");
  subjectCell.appendChild(subjectText);

  if (reminder.notes) {
    const notesText = document.createElement("div");
    notesText.className = "notes-text";
    notesText.textContent = reminder.notes;
    subjectCell.appendChild(notesText);
  }

  // Sender cell
  const senderCell = document.createElement("td");
  const senderText = document.createElement("div");
  senderText.className = "sender-text";
  senderText.textContent = reminder.sender || I18n.message("unknownSender");
  senderText.title = reminder.sender || I18n.message("unknownSender");
  senderCell.appendChild(senderText);

  // Due date cell
  const dueCell = document.createElement("td");
  const dueText = document.createElement("div");
  dueText.className = "due-text";
  if (isOverdue) {
    dueText.classList.add("overdue");
    dueText.textContent = I18n.message("overdueAt", I18n.formatDateTime(dueDate, true));
  } else if (isDueSoon && isActive) {
    dueText.classList.add("due-soon");
    dueText.textContent = I18n.formatDateTime(dueDate, true);
  } else {
    dueText.textContent = I18n.formatDateTime(dueDate, true);
  }
  dueCell.appendChild(dueText);

  // Actions cell
  const actionsCell = document.createElement("td");
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "action-buttons";

  if (isActive) {
    // Open button
    const openBtn = document.createElement("button");
    openBtn.textContent = I18n.message("open");
    openBtn.className = "primary";
    openBtn.addEventListener("click", () => openEmail(reminder.id));
    actionsDiv.appendChild(openBtn);

    // Snooze dropdown
    const snoozeSelect = document.createElement("select");
    snoozeSelect.className = "snooze-select";
    for (const [value, key] of [
      ["", "snoozePrompt"], ["5", "fiveMinutes"], ["15", "fifteenMinutes"],
      ["60", "oneHour"], ["240", "fourHours"], ["1440", "oneDay"], ["10080", "oneWeek"]
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = I18n.message(key);
      snoozeSelect.appendChild(option);
    }
    snoozeSelect.addEventListener("change", async (e) => {
      if (e.target.value) {
        await snoozeReminder(reminder.id, parseInt(e.target.value));
        e.target.value = "";
      }
    });
    actionsDiv.appendChild(snoozeSelect);

    // Complete button
    const completeBtn = document.createElement("button");
    completeBtn.textContent = I18n.message("done");
    completeBtn.className = "success";
    completeBtn.addEventListener("click", () => completeReminder(reminder.id));
    actionsDiv.appendChild(completeBtn);

    // Dismiss button
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = I18n.message("dismiss");
    dismissBtn.className = "danger";
    dismissBtn.addEventListener("click", () => dismissReminder(reminder.id));
    actionsDiv.appendChild(dismissBtn);
  } else {
    // Delete button for completed/dismissed
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = I18n.message("delete");
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", () => deleteReminder(reminder.id));
    actionsDiv.appendChild(deleteBtn);

    // Reactivate button
    const reactivateBtn = document.createElement("button");
    reactivateBtn.textContent = I18n.message("reactivate");
    reactivateBtn.addEventListener("click", () => reactivateReminder(reminder.id));
    actionsDiv.appendChild(reactivateBtn);
  }

  actionsCell.appendChild(actionsDiv);

  row.appendChild(statusCell);
  row.appendChild(subjectCell);
  row.appendChild(senderCell);
  row.appendChild(dueCell);
  row.appendChild(actionsCell);

  return row;
}

async function openEmail(id) {
  await browser.runtime.sendMessage({ action: "openEmail", id });
}

async function snoozeReminder(id, minutes) {
  await browser.runtime.sendMessage({ action: "snoozeReminder", id, minutes });
  await loadReminders();
}

async function completeReminder(id) {
  await browser.runtime.sendMessage({ action: "completeReminder", id });
  await loadReminders();
}

async function dismissReminder(id) {
  await browser.runtime.sendMessage({ action: "dismissReminder", id });
  await loadReminders();
}

async function deleteReminder(id) {
  if (confirm(I18n.message("confirmDelete"))) {
    await browser.runtime.sendMessage({ action: "deleteReminder", id });
    await loadReminders();
  }
}

async function reactivateReminder(id) {
  // Set new due date to tomorrow 9am
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  await browser.runtime.sendMessage({
    action: "updateReminder",
    id,
    data: {
      status: "pending",
      dueDate: tomorrow.toISOString()
    }
  });
  await loadReminders();
}

function formatStatus(status) {
  const labels = {
    pending: I18n.message("pending"),
    snoozed: I18n.message("snoozed"),
    notified: I18n.message("due"),
    completed: I18n.message("done"),
    dismissed: I18n.message("dismissed")
  };
  return labels[status] || status;
}
