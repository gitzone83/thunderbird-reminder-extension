// Popup script for Email Reminders

document.addEventListener("DOMContentLoaded", async () => {
  await loadReminders();
  await loadStats();

  document.getElementById("viewAllBtn").addEventListener("click", async () => {
    await browser.tabs.create({
      url: browser.runtime.getURL("reminder-list/list.html")
    });
    window.close();
  });
});

async function loadStats() {
  try {
    const counts = await browser.runtime.sendMessage({ action: "getReminderCounts" });
    updateStatsDisplay(counts);
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

function updateStatsDisplay(counts) {
  const statsEl = document.getElementById("stats");

  // Update each count
  statsEl.querySelector(".stat.pending .count").textContent = counts.pending;
  statsEl.querySelector(".stat.snoozed .count").textContent = counts.snoozed;
  statsEl.querySelector(".stat.notified .count").textContent = counts.notified;
  statsEl.querySelector(".stat.completed .count").textContent = counts.completed;
  statsEl.querySelector(".stat.dismissed .count").textContent = counts.dismissed;

  // Show stats if there are any reminders
  if (counts.total > 0) {
    statsEl.classList.remove("hidden");
  } else {
    statsEl.classList.add("hidden");
  }
}

async function loadReminders() {
  const loadingEl = document.getElementById("loading");
  const emptyEl = document.getElementById("empty-state");
  const listEl = document.getElementById("reminders-list");

  try {
    const reminders = await browser.runtime.sendMessage({ action: "getReminders" });

    // Filter to show only active reminders (pending, snoozed, notified)
    const activeReminders = reminders.filter(r =>
      ["pending", "snoozed", "notified"].includes(r.status)
    );

    loadingEl.classList.add("hidden");

    if (activeReminders.length === 0) {
      emptyEl.classList.remove("hidden");
      listEl.classList.add("hidden");
    } else {
      emptyEl.classList.add("hidden");
      listEl.classList.remove("hidden");
      renderReminders(activeReminders, listEl);
    }
  } catch (error) {
    console.error("Error loading reminders:", error);
    loadingEl.textContent = I18n.message("loadRemindersError");
  }
}

function renderReminders(reminders, container) {
  container.innerHTML = "";

  for (const reminder of reminders) {
    const item = createReminderItem(reminder);
    container.appendChild(item);
  }
}

function createReminderItem(reminder) {
  const now = new Date();
  const dueDate = new Date(reminder.dueDate);
  const isOverdue = dueDate < now;
  const isDueSoon = !isOverdue && (dueDate - now) < 60 * 60 * 1000; // 1 hour

  const item = document.createElement("div");
  item.className = "reminder-item";
  if (isOverdue || reminder.status === "notified") {
    item.classList.add("overdue");
  } else if (isDueSoon) {
    item.classList.add("due-soon");
  }
  if (reminder.status === "notified") {
    item.classList.add("notified");
  }

  const subject = document.createElement("div");
  subject.className = "reminder-subject";
  subject.textContent = reminder.subject || I18n.message("noSubject");
  subject.title = reminder.subject || I18n.message("noSubject");

  const sender = document.createElement("div");
  sender.className = "reminder-sender";
  sender.textContent = reminder.sender || I18n.message("unknownSender");
  sender.title = reminder.sender || I18n.message("unknownSender");

  const due = document.createElement("div");
  due.className = "reminder-due";
  if (isOverdue) {
    due.classList.add("overdue");
    due.textContent = I18n.message("overdueAt", I18n.formatRelativeTime(dueDate));
  } else if (isDueSoon) {
    due.classList.add("due-soon");
    due.textContent = I18n.message("dueAt", I18n.formatRelativeTime(dueDate));
  } else {
    due.textContent = I18n.message("dueAt", I18n.formatDateTime(dueDate));
  }

  const actions = document.createElement("div");
  actions.className = "reminder-actions";

  // Open email button
  const openBtn = document.createElement("button");
  openBtn.textContent = I18n.message("openEmail");
  openBtn.className = "primary";
  openBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await browser.runtime.sendMessage({ action: "openEmail", id: reminder.id });
  });

  // Snooze button with dropdown
  const snoozeContainer = document.createElement("div");
  snoozeContainer.className = "snooze-menu";

  const snoozeBtn = document.createElement("button");
  snoozeBtn.textContent = I18n.message("snooze");
  snoozeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = snoozeContainer.querySelector(".snooze-dropdown");
    dropdown.classList.toggle("show");
  });

  const snoozeDropdown = document.createElement("div");
  snoozeDropdown.className = "snooze-dropdown";

  const snoozeOptions = [
    { label: I18n.message("fiveMinutes"), minutes: 5 },
    { label: I18n.message("fifteenMinutes"), minutes: 15 },
    { label: I18n.message("oneHour"), minutes: 60 },
    { label: I18n.message("fourHours"), minutes: 240 },
    { label: I18n.message("tomorrow"), minutes: 24 * 60 },
    { label: I18n.message("nextWeek"), minutes: 7 * 24 * 60 }
  ];

  for (const option of snoozeOptions) {
    const optionBtn = document.createElement("button");
    optionBtn.textContent = option.label;
    optionBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await snoozeReminder(reminder.id, option.minutes);
    });
    snoozeDropdown.appendChild(optionBtn);
  }

  snoozeContainer.appendChild(snoozeBtn);
  snoozeContainer.appendChild(snoozeDropdown);

  // Complete button
  const completeBtn = document.createElement("button");
  completeBtn.textContent = I18n.message("done");
  completeBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await completeReminder(reminder.id);
  });

  // Dismiss button
  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = I18n.message("dismiss");
  dismissBtn.className = "danger";
  dismissBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await dismissReminder(reminder.id);
  });

  actions.appendChild(openBtn);
  actions.appendChild(snoozeContainer);
  actions.appendChild(completeBtn);
  actions.appendChild(dismissBtn);

  item.appendChild(subject);
  item.appendChild(sender);
  item.appendChild(due);
  item.appendChild(actions);

  // Click on item opens email
  item.addEventListener("click", async () => {
    await browser.runtime.sendMessage({ action: "openEmail", id: reminder.id });
  });

  return item;
}

async function snoozeReminder(id, minutes) {
  await browser.runtime.sendMessage({ action: "snoozeReminder", id, minutes });
  await loadReminders();
  await loadStats();
}

async function completeReminder(id) {
  await browser.runtime.sendMessage({ action: "completeReminder", id });
  await loadReminders();
  await loadStats();
}

async function dismissReminder(id) {
  await browser.runtime.sendMessage({ action: "dismissReminder", id });
  await loadReminders();
  await loadStats();
}

// Close snooze dropdowns when clicking outside
document.addEventListener("click", () => {
  document.querySelectorAll(".snooze-dropdown.show").forEach(el => {
    el.classList.remove("show");
  });
});
