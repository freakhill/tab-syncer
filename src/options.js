document.addEventListener("DOMContentLoaded", () => {
  const supabaseUrlInput = document.getElementById("supabaseUrl");
  const supabaseApiKeyInput = document.getElementById("supabaseApiKey");
  const syncPeriodInput = document.getElementById("syncPeriod");
  const dbEmailInput = document.getElementById("dbEmail");
  const dbPasswordInput = document.getElementById("dbPassword");
  const timeshiftInput = document.getElementById("timeshift");
  const saveButton = document.getElementById("save");
  const status = document.getElementById("status");

  // Load the current configuration
  chrome.storage.local.get(
    ["supabaseUrl", "supabaseApiKey", "syncPeriod", "dbEmail", "dbPassword", "timeshift"],
    ({ supabaseUrl, supabaseApiKey, syncPeriod, dbEmail, dbPassword, timeshift }) => {
      if (supabaseUrl) supabaseUrlInput.value = supabaseUrl;
      if (supabaseApiKey) supabaseApiKeyInput.value = supabaseApiKey;
      syncPeriodInput.value = syncPeriod !== undefined ? syncPeriod : 60;
      if (dbEmail) dbEmailInput.value = dbEmail;
      if (dbPassword) dbPasswordInput.value = dbPassword;
      timeshiftInput.value = timeshift !== undefined ? timeshift : 0;
    }
  );

  // Save the configuration
  saveButton.addEventListener("click", () => {
    const supabaseUrl = supabaseUrlInput.value.trim();
    const supabaseApiKey = supabaseApiKeyInput.value.trim();
    const syncPeriod = parseInt(syncPeriodInput.value.trim(), 10);
    const dbEmail = dbEmailInput.value.trim();
    const dbPassword = dbPasswordInput.value.trim();
    const timeshift = parseInt(timeshiftInput.value.trim(), 10);

    if (!supabaseUrl || !supabaseApiKey || !dbEmail || !dbPassword) {
      status.textContent = "All fields are required.";
      status.classList.add("error");
      setTimeout(() => {
        status.textContent = "";
        status.classList.remove("error");
      }, 5000);
      return;
    }

    if (isNaN(syncPeriod) || syncPeriod < 10 || syncPeriod > 3600) {
      status.textContent = "Sync period must be a number between 10 and 3600 seconds.";
      status.classList.add("error");
      setTimeout(() => {
        status.textContent = "";
        status.classList.remove("error");
      }, 5000);
      return;
    }

    if (isNaN(timeshift)) {
      status.textContent = "Timeshift must be a valid number.";
      status.classList.add("error");
      setTimeout(() => {
        status.textContent = "";
        status.classList.remove("error");
      }, 5000);
      return;
    }

    chrome.storage.local.set({ supabaseUrl, supabaseApiKey, syncPeriod, dbEmail, dbPassword, timeshift }, () => {
      status.textContent = "Configuration saved successfully!";
      status.classList.add("success");
      setTimeout(() => {
        status.textContent = "";
        status.classList.remove("success");
      }, 5000);

      chrome.runtime.sendMessage({ action: "reloadSupabaseConfig" });
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "supabaseError") {
      const status = document.getElementById("status");
      if (message.error) {
        status.textContent = `Error: ${message.error}`;
        status.classList.add("error");
      } else {
        status.textContent = "";
        status.classList.remove("error");
      }
    }
  });
});
