// Set Reminder Dialog Script

let messageData = null;

document.addEventListener("DOMContentLoaded", async () => {
  await loadMessageData();
  setupDateDefaults();
  setupQuickOptions();
  setupButtons();
});

async function loadMessageData() {
  try {
    messageData = await browser.runtime.sendMessage({ action: "getPendingMessage" });

    if (messageData) {
      document.getElementById("subject").textContent = messageData.subject || "(No subject)";
      document.getElementById("sender").textContent = `From: ${messageData.author || "Unknown"}`;
    } else {
      showError("Could not load email information. Please try again.");
    }
  } catch (error) {
    console.error("Error loading message data:", error);
    showError("Error loading email information.");
  }
}

function setupDateDefaults() {
  // Default to tomorrow at 9:00 AM
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  document.getElementById("dueDate").value = formatDateTimeLocal(tomorrow);
}

function setupQuickOptions() {
  document.querySelectorAll(".quick-options button").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = new Date();

      if (btn.dataset.minutes) {
        date.setMinutes(date.getMinutes() + parseInt(btn.dataset.minutes));
      } else if (btn.dataset.days) {
        date.setDate(date.getDate() + parseInt(btn.dataset.days));
        date.setHours(9, 0, 0, 0); // Set to 9 AM for day-based options
      }

      document.getElementById("dueDate").value = formatDateTimeLocal(date);
    });
  });
}

function setupButtons() {
  document.getElementById("saveBtn").addEventListener("click", saveReminder);
  document.getElementById("cancelBtn").addEventListener("click", () => window.close());

  // Allow Enter key to save
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveReminder();
    } else if (e.key === "Escape") {
      window.close();
    }
  });
}

async function saveReminder() {
  const dueDateInput = document.getElementById("dueDate").value;
  const notes = document.getElementById("notes").value.trim();

  if (!dueDateInput) {
    showError("Please select a date and time for the reminder.");
    return;
  }

  const dueDate = new Date(dueDateInput);

  if (isNaN(dueDate.getTime())) {
    showError("Invalid date. Please select a valid date and time.");
    return;
  }

  if (dueDate <= new Date()) {
    showError("Please select a future date and time.");
    return;
  }

  if (!messageData) {
    showError("Email information not available. Please close and try again.");
    return;
  }

  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const result = await browser.runtime.sendMessage({
      action: "createReminder",
      data: {
        messageId: messageData.id,
        messageHeaderId: messageData.headerMessageId,
        subject: messageData.subject || "(No subject)",
        sender: messageData.author || "Unknown",
        folderId: messageData.folder ? messageData.folder.path : "",
        dueDate: dueDate.toISOString(),
        notes: notes
      }
    });

    if (result.success) {
      window.close();
    } else {
      showError(result.error || "Failed to create reminder.");
      saveBtn.disabled = false;
      saveBtn.textContent = "Set Reminder";
    }
  } catch (error) {
    console.error("Error saving reminder:", error);
    showError("Error saving reminder. Please try again.");
    saveBtn.disabled = false;
    saveBtn.textContent = "Set Reminder";
  }
}

function showError(message) {
  // Remove existing error if any
  const existing = document.querySelector(".error-message");
  if (existing) {
    existing.remove();
  }

  const error = document.createElement("div");
  error.className = "error-message";
  error.textContent = message;

  const container = document.querySelector(".dialog-container");
  const h2 = container.querySelector("h2");
  h2.insertAdjacentElement("afterend", error);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (error.parentNode) {
      error.remove();
    }
  }, 5000);
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
