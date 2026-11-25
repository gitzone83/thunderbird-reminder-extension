// Options page script

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  const { settings = {} } = await browser.storage.local.get("settings");

  document.getElementById("checkInterval").value = settings.checkInterval || "1";
  document.getElementById("defaultTime").value = settings.defaultTime || "09:00";
  document.getElementById("archiveOnReminder").checked = settings.archiveOnReminder === true;
}

function setupEventListeners() {
  document.getElementById("saveBtn").addEventListener("click", saveSettings);
  document.getElementById("exportBtn").addEventListener("click", exportReminders);
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", importReminders);
  document.getElementById("clearCompletedBtn").addEventListener("click", clearCompleted);
  document.getElementById("clearAllBtn").addEventListener("click", clearAll);
}

async function saveSettings() {
  const settings = {
    checkInterval: document.getElementById("checkInterval").value,
    defaultTime: document.getElementById("defaultTime").value,
    archiveOnReminder: document.getElementById("archiveOnReminder").checked
  };

  await browser.storage.local.set({ settings });

  const statusEl = document.getElementById("saveStatus");
  statusEl.textContent = I18n.message("settingsSaved");
  statusEl.classList.remove("error");

  setTimeout(() => {
    statusEl.textContent = "";
  }, 3000);
}

async function exportReminders() {
  const { reminders = {} } = await browser.storage.local.get("reminders");

  const exportData = {
    version: "1.0",
    exportDate: new Date().toISOString(),
    reminders: Object.values(reminders)
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `email-reminders-export-${new Date().toISOString().split("T")[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

async function importReminders(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.reminders || !Array.isArray(data.reminders)) {
      throw new Error(I18n.message("invalidImport"));
    }

    const { reminders = {} } = await browser.storage.local.get("reminders");

    // Merge imported reminders
    let importCount = 0;
    for (const reminder of data.reminders) {
      if (reminder.id && !reminders[reminder.id]) {
        reminders[reminder.id] = reminder;
        importCount++;
      }
    }

    await browser.storage.local.set({ reminders });

    alert(I18n.message("importSuccess", String(importCount)));
  } catch (error) {
    console.error("Import error:", error);
    alert(I18n.message("importFailed"));
  }

  // Reset file input
  e.target.value = "";
}

async function clearCompleted() {
  if (!confirm(I18n.message("confirmClearCompleted"))) {
    return;
  }

  const { reminders = {} } = await browser.storage.local.get("reminders");

  const activeReminders = {};
  for (const [id, reminder] of Object.entries(reminders)) {
    if (reminder.status !== "completed" && reminder.status !== "dismissed") {
      activeReminders[id] = reminder;
    }
  }

  await browser.storage.local.set({ reminders: activeReminders });
  alert(I18n.message("completedCleared"));
}

async function clearAll() {
  if (!confirm(I18n.message("confirmClearAll"))) {
    return;
  }

  if (!confirm(I18n.message("confirmClearAllAgain"))) {
    return;
  }

  await browser.storage.local.set({ reminders: {} });
  alert(I18n.message("allCleared"));
}
