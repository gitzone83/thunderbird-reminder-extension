// Reminder List Page Script

let allReminders = [];
let currentFilter = "active";

document.addEventListener("DOMContentLoaded", async () => {
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
    loadingEl.textContent = "Error loading reminders";
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
  subjectText.textContent = reminder.subject;
  subjectText.title = reminder.subject;
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
  senderText.textContent = reminder.sender;
  senderText.title = reminder.sender;
  senderCell.appendChild(senderText);

  // Due date cell
  const dueCell = document.createElement("td");
  const dueText = document.createElement("div");
  dueText.className = "due-text";
  if (isOverdue) {
    dueText.classList.add("overdue");
    dueText.textContent = `Overdue: ${formatDateTime(dueDate)}`;
  } else if (isDueSoon && isActive) {
    dueText.classList.add("due-soon");
    dueText.textContent = formatDateTime(dueDate);
  } else {
    dueText.textContent = formatDateTime(dueDate);
  }
  dueCell.appendChild(dueText);

  // Actions cell
  const actionsCell = document.createElement("td");
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "action-buttons";

  if (isActive) {
    // Open button
    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.className = "primary";
    openBtn.addEventListener("click", () => openEmail(reminder.id));
    actionsDiv.appendChild(openBtn);

    // Snooze dropdown
    const snoozeSelect = document.createElement("select");
    snoozeSelect.className = "snooze-select";
    snoozeSelect.innerHTML = `
      <option value="">Snooze...</option>
      <option value="5">5 min</option>
      <option value="15">15 min</option>
      <option value="60">1 hour</option>
      <option value="240">4 hours</option>
      <option value="1440">1 day</option>
      <option value="10080">1 week</option>
    `;
    snoozeSelect.addEventListener("change", async (e) => {
      if (e.target.value) {
        await snoozeReminder(reminder.id, parseInt(e.target.value));
        e.target.value = "";
      }
    });
    actionsDiv.appendChild(snoozeSelect);

    // Complete button
    const completeBtn = document.createElement("button");
    completeBtn.textContent = "Done";
    completeBtn.className = "success";
    completeBtn.addEventListener("click", () => completeReminder(reminder.id));
    actionsDiv.appendChild(completeBtn);

    // Dismiss button
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "Dismiss";
    dismissBtn.className = "danger";
    dismissBtn.addEventListener("click", () => dismissReminder(reminder.id));
    actionsDiv.appendChild(dismissBtn);
  } else {
    // Delete button for completed/dismissed
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", () => deleteReminder(reminder.id));
    actionsDiv.appendChild(deleteBtn);

    // Reactivate button
    const reactivateBtn = document.createElement("button");
    reactivateBtn.textContent = "Reactivate";
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
  if (confirm("Are you sure you want to delete this reminder?")) {
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
    pending: "Pending",
    snoozed: "Snoozed",
    notified: "Due",
    completed: "Done",
    dismissed: "Dismissed"
  };
  return labels[status] || status;
}

function formatDateTime(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  } else {
    return `${dateStr} at ${timeStr}`;
  }
}
