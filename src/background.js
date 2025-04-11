import { createClient } from "@supabase/supabase-js";

let supabase;
let syncInterval;
let lastTabActivity = Date.now(); // Track the last tab activity timestamp
let timeshift = 0; // Default timeshift in hours

// Load the timeshift configuration
chrome.storage.local.get("timeshift", (result) => {
  timeshift = result.timeshift || 0;
});

// Initialize Supabase client
async function initializeSupabase() {
  console.log("Initializing Supabase client...");
  
  const { supabaseUrl, supabaseApiKey, dbEmail, dbPassword, syncPeriod } = await chrome.storage.local.get([
    "supabaseUrl",
    "supabaseApiKey",
    "dbEmail",
    "dbPassword",
    "syncPeriod",
  ]);
  if (!supabaseUrl || !supabaseApiKey || !dbEmail || !dbPassword) {
    const errorMessage = "Supabase configuration or user credentials are missing.";
    console.error(errorMessage);
    chrome.runtime.sendMessage({ action: "supabaseError", error: errorMessage });
    return;
  }

  console.log("Creating Supabase client...");
  supabase = createClient(supabaseUrl, supabaseApiKey);

  if (supabase) {  
    console.log("Supabase client initialized successfully.");
  } else {
    const errorMessage = "Failed to initialize Supabase client.";
    console.error(errorMessage);
    chrome.runtime.sendMessage({ action: "supabaseError", error: errorMessage });
    return;
  }

  // Authenticate the user
  console.log("Authenticating user...");
  //const { error: authError } = await supabase.auth.signInWithPassword({
  const { authError } = await supabase.auth.signInWithPassword({
    email: dbEmail,
    password: dbPassword,
  });

  if (authError) {
    const errorMessage = `Failed to authenticate user: ${authError}`;
    console.error(errorMessage);
    chrome.runtime.sendMessage({ action: "supabaseError", error: errorMessage });
    return;
  }

  // Set up periodic synchronization
  console.log("Setting up periodic synchronization...");
  if (syncInterval) clearInterval(syncInterval);
  const period = parseInt(syncPeriod, 10) || 600; // Default to 600 seconds (10 minutes)
  if (isNaN(period) || period < 0 || period > 3600) {
    const errorMessage = "Invalid sync period. It must be a number between 0 and 3600 seconds.";
    console.error(errorMessage);
    chrome.runtime.sendMessage({ action: "supabaseError", error: errorMessage });
    return;
  }
  if (period > 0) {
    syncInterval = setInterval(syncAllTabs, period * 1000);
  } else {
    console.log("Periodic sync is disabled (syncPeriod is 0).");
  }

  // Clear any previous error messages
  console.log("Clearing previous error messages...");
  chrome.runtime.sendMessage({ action: "supabaseError", error: null });
}

// Sync a single tab to the Supabase database
async function syncTab(tab) {
  if (!supabase) {
    console.warn("Supabase client is not initialized. Attempting to initialize...");
    await initializeSupabase();
    if (!supabase) {
      console.error("Failed to initialize Supabase client.");
      return;
    }
  }

  if (!tab.url || !tab.url.startsWith("http")) {
    console.warn("Ignoring tab with unsupported URL:", tab.url);
    return;
  }

  const lastAccessed = tab.lastAccessed && typeof tab.lastAccessed === "number"
    ? new Date(tab.lastAccessed - timeshift * 60 * 60 * 1000).toISOString() // Apply timeshift and convert to UTC string
    : null;
  const userAgent = navigator.userAgent;
  const faviconurl = tab.favIconUrl && (tab.favIconUrl.startsWith("http") ? tab.favIconUrl : null); // Ignore invalid faviconurl

  const { error } = await supabase.from("tabs").upsert({
    useragent: userAgent,
    tabid: tab.id,
    url: tab.url,
    title: tab.title,
    faviconurl,
    pinned: tab.pinned ? true : false,
    lastaccessed: lastAccessed,
  });

  if (error) {
    console.error("Failed to sync tab:", error.message);
  }
}

// Remove a tab from the Supabase database
async function removeTab(tabId) {
  if (!supabase) {
    console.warn("Supabase client is not initialized. Attempting to initialize...");
    await initializeSupabase();
    if (!supabase) {
      console.error("Failed to initialize Supabase client.");
      return;
    }
  }

  const userAgent = navigator.userAgent;

  const { error } = await supabase
    .from("tabs")
    .delete()
    .eq("useragent", userAgent)
    .eq("tabid", tabId);

  if (error) {
    console.error("Failed to remove tab:", error.message);
  }
}

// Synchronize all currently open tabs
async function syncAllTabs(force = false) {
  if (!supabase) {
    console.warn("Supabase client is not initialized. Attempting to initialize...");
    await initializeSupabase();
    if (!supabase) {
      console.error("Failed to initialize Supabase client.");
      return;
    }
  }

  const now = Date.now();
  if (!force && now - lastTabActivity > (syncInterval || 600) * 1000) {
    console.log("Skipping sync as there was no tab activity in the last sync period.");
    return;
  }

  const tabs = await chrome.tabs.query({});
  const userAgent = navigator.userAgent;

  const openTabUrls = tabs
    .filter((tab) => tab.url && tab.url.startsWith("http")) // Ignore tabs with unsupported URLs
    .map((tab) => tab.url);

  const tabData = tabs
    .filter((tab) => tab.url && tab.url.startsWith("http")) // Ignore tabs with unsupported URLs
    .map((tab) => {
      const lastAccessed = tab.lastAccessed && typeof tab.lastAccessed === "number"
        ? new Date(tab.lastAccessed - timeshift * 60 * 60 * 1000).toISOString() // Apply timeshift and convert to UTC string
        : null;
      const faviconurl = tab.favIconUrl && (tab.favIconUrl.startsWith("http") ? tab.favIconUrl : null); // Ignore invalid faviconurl

      return {
        useragent: userAgent,
        tabid: tab.id,
        url: tab.url,
        title: tab.title,
        faviconurl,
        pinned: tab.pinned ? true : false,
        lastaccessed: lastAccessed,
      };
    });

  // Upsert current open tabs
  console.log(`Syncing tabs to Supabase... ${tabData.length} tabs to sync.`);
  if (tabData.length === 0) {
    console.log("No tabs to sync.");
    return;
  } else {
  const { error: upsertError } = await supabase.from("tabs").upsert(tabData);
  if (upsertError) {
    console.error("Failed to sync tabs:", upsertError.message);
  }
  }
  
  // Delete tabs from the database that are not currently open
  const { error: deleteError } = await supabase
    .from("tabs")
    .delete()
    .eq("useragent", userAgent)
    .not("url", "in", openTabUrls);

  if (deleteError) {
    console.error("Failed to delete tabs:", deleteError.message);
  }
}

// Remove multiple tabs from the Supabase database
async function removeTabs(tabIds) {
  if (!supabase) {
    console.warn("Supabase client is not initialized. Attempting to initialize...");
    await initializeSupabase();
    if (!supabase) {
      console.error("Failed to initialize Supabase client.");
      return;
    }
  }

  const userAgent = navigator.userAgent;

  const { error } = await supabase
    .from("tabs")
    .delete()
    .eq("useragent", userAgent)
    .in("tabid", tabIds);

  if (error) {
    console.error("Failed to remove tabs:", error.message);
  }
}

// Fetch all tabs from the Supabase database
async function getTabsFromDatabase() {
  if (!supabase) {
    console.error("Supabase client is not initialized.");
    return { error: "Supabase client is not initialized.", data: [] };
  }

  const { data, error } = await supabase
    .from("tabs")
    .select("*")
    .order("lastaccessed", { ascending: false });

  if (error) {
    console.error("Failed to fetch tabs:", error.message);
    return { error: error.message, data: [] };
  }

  // Convert lastaccessed from UTC string to local timestamp
  const convertedData = data.map((tab) => ({
    ...tab,
    lastaccessed: tab.lastaccessed
      ? new Date(tab.lastaccessed).toLocaleString() // Convert to local timezone
      : null,
  }));

  return { data: convertedData };
}

// Sync newly opened tabs
chrome.tabs.onCreated.addListener((tab) => {
  lastTabActivity = Date.now();
  syncTab(tab); // Sync only the newly created tab
});

// Sync updated tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    lastTabActivity = Date.now();
    syncTab(tab); // Sync only the updated tab
  }
});

// Remove closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  lastTabActivity = Date.now();
  removeTab(tabId); // Remove only the closed tab
});

// Handle messages from the popup script and options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getTabs") {
    getTabsFromDatabase().then((result) => sendResponse(result));
    return true; // Keep the message channel open for async response
  } else if (message.action === "reloadSupabaseConfig") {
    initializeSupabase().then(() => {
      console.log("Supabase configuration reloaded.");
      // Reload timeshift configuration
      chrome.storage.local.get("timeshift", (result) => {
        timeshift = result.timeshift || 0;
        console.log(`Timeshift reloaded: ${timeshift} hours`);
      });
      sendResponse({ success: true });
    }).catch((error) => {
      console.error("Failed to reload Supabase configuration:", error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep the message channel open for async response
  } else if (message.action === "purgeTabs") {
    supabase
      .from("tabs")
      .delete()
      .not("tabid", "is", null) // Add a where clause to delete rows where tabid is not null
      .then(({ error }) => {
        if (error) {
          console.error("Failed to purge tabs:", error.message);
          sendResponse({ success: false, error: error.message });
        } else {
          console.log("All tab records with non-null tabid have been deleted.");
          sendResponse({ success: true });
        }
      })
      .catch((error) => {
        console.error("Unexpected error during purge:", error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  } else if (message.action === "syncAllTabsNow") {
    syncAllTabs(true) // Pass `true` to force sync
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Failed to sync all tabs:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
});

// Initialize Supabase configuration on startup
chrome.runtime.onStartup.addListener(initializeSupabase);
chrome.runtime.onInstalled.addListener(initializeSupabase);
