// Popup script for Email Reminders

document.addEventListener("DOMContentLoaded", async () => {
  await loadReminders();

  document.getElementById("viewAllBtn").addEventListener("click", async () => {
    await browser.tabs.create({
      url: browser.runtime.getURL("reminder-list/list.html")
    });
    window.close();
  });
});

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
    loadingEl.textContent = "Error loading reminders";
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
  subject.textContent = reminder.subject;
  subject.title = reminder.subject;

  const sender = document.createElement("div");
  sender.className = "reminder-sender";
  sender.textContent = reminder.sender;
  sender.title = reminder.sender;

  const due = document.createElement("div");
  due.className = "reminder-due";
  if (isOverdue) {
    due.classList.add("overdue");
    due.textContent = `Overdue: ${formatRelativeTime(dueDate)}`;
  } else if (isDueSoon) {
    due.classList.add("due-soon");
    due.textContent = `Due: ${formatRelativeTime(dueDate)}`;
  } else {
    due.textContent = `Due: ${formatDateTime(dueDate)}`;
  }

  const actions = document.createElement("div");
  actions.className = "reminder-actions";

  // Open email button
  const openBtn = document.createElement("button");
  openBtn.textContent = "Open Email";
  openBtn.className = "primary";
  openBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await browser.runtime.sendMessage({ action: "openEmail", id: reminder.id });
  });

  // Snooze button with dropdown
  const snoozeContainer = document.createElement("div");
  snoozeContainer.className = "snooze-menu";

  const snoozeBtn = document.createElement("button");
  snoozeBtn.textContent = "Snooze";
  snoozeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = snoozeContainer.querySelector(".snooze-dropdown");
    dropdown.classList.toggle("show");
  });

  const snoozeDropdown = document.createElement("div");
  snoozeDropdown.className = "snooze-dropdown";

  const snoozeOptions = [
    { label: "5 minutes", minutes: 5 },
    { label: "15 minutes", minutes: 15 },
    { label: "1 hour", minutes: 60 },
    { label: "4 hours", minutes: 240 },
    { label: "Tomorrow", minutes: 24 * 60 },
    { label: "Next week", minutes: 7 * 24 * 60 }
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
  completeBtn.textContent = "Done";
  completeBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await completeReminder(reminder.id);
  });

  // Dismiss button
  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = "Dismiss";
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
}

async function completeReminder(id) {
  await browser.runtime.sendMessage({ action: "completeReminder", id });
  await loadReminders();
}

async function dismissReminder(id) {
  await browser.runtime.sendMessage({ action: "dismissReminder", id });
  await loadReminders();
}

function formatDateTime(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${dateStr} at ${timeStr}`;
  }
}

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs < 0) {
    // Future
    const futureMins = Math.abs(diffMins);
    const futureHours = Math.abs(diffHours);
    if (futureMins < 60) {
      return `in ${futureMins} minute${futureMins !== 1 ? "s" : ""}`;
    } else if (futureHours < 24) {
      return `in ${futureHours} hour${futureHours !== 1 ? "s" : ""}`;
    }
    return formatDateTime(date);
  }

  // Past
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  } else {
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  }
}

// Close snooze dropdowns when clicking outside
document.addEventListener("click", () => {
  document.querySelectorAll(".snooze-dropdown.show").forEach(el => {
    el.classList.remove("show");
  });
});
