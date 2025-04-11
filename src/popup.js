import { UAParser } from "ua-parser-js";

document.addEventListener("DOMContentLoaded", async () => {
  const tabList = document.getElementById("tab-list");
  const noTabsMessage = document.getElementById("no-tabs-message");
  const errorMessage = document.getElementById("error-message");
  const purgeButton = document.getElementById("purge-tabs");
  const filterInput = document.getElementById("filter-input");
  const refreshButton = document.getElementById("refresh");
  const status = document.getElementById("status");
  const syncAllTabsButton = document.getElementById("sync-all-tabs");
  const regexCheckbox = document.getElementById("regex-checkbox");

  // Focus the filter input by default
  filterInput.focus();

  let isRegexMode = false; // Default to substring matching

  let allTabs = []; // Store all tabs for filtering
  let cachedTabs = []; // Cache tabs for initial display

  // Load cached tabs from chrome.storage.local synchronously using a callback
  function loadCachedTabs(callback) {
    chrome.storage.local.get("cachedTabs", (result) => {
      if (result.cachedTabs) {
        try {
          cachedTabs = JSON.parse(result.cachedTabs);
        } catch (e) {
          console.error("Failed to parse cached tabs:", e);
          cachedTabs = [];
        }
      }
      if (callback) callback(); // Execute the callback after loading
    });
  }

  // Save cached tabs to chrome.storage.local
  function saveCachedTabs(tabs) {
    try {
      chrome.storage.local.set({ cachedTabs: JSON.stringify(tabs) });
    } catch (e) {
      console.error("Failed to save cached tabs:", e);
    }
  }

  /**
   * Calculate the Levenshtein distance between two strings.
   * Levenshtein distance is a measure of the difference between two strings.
   * It is defined as the minimum number of single-character edits (insertions, deletions, or substitutions)
   * required to change one string into the other.
   * 
   * @param {string} a - The first string.
   * @param {string} b - The second string.
   * @returns {number} - The Levenshtein distance between the two strings.
   */
  function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        matrix[i][j] =
          a[i - 1] === b[j - 1]
            ? matrix[i - 1][j - 1]
            : Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]) + 1;
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Tokenize a string into words by splitting on spaces and punctuation.
   * @param {string} text - The input string to tokenize.
   * @returns {string[]} - An array of normalized tokens.
   */
  function tokenize(text) {
    return text
      .toLowerCase()
      .trim()
      .split(/\W+/)
      .filter(Boolean); // Remove empty tokens
  }

  /**
   * Calculate the median of an array of numbers.
   * @param {number[]} numbers - The array of numbers.
   * @returns {number} - The median value.
   */
  function median(numbers) {
    if (numbers.length === 0) return Infinity;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Calculate the tokenized Levenshtein distance between two strings.
   * This method tokenizes both strings, matches tokens to minimize Levenshtein distance,
   * and calculates the median distance across all matches.
   * 
   * @param {string} a - The first string.
   * @param {string} b - The second string.
   * @returns {number} - The median Levenshtein distance between tokens.
   */
  function tokenizedLevenshteinDistance(a, b) {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);

    const distances = tokensA.map((tokenA) => {
      const tokenDistances = tokensB.map((tokenB) => levenshteinDistance(tokenA, tokenB));
      return Math.min(...tokenDistances); // Match tokenA to the closest token in tokensB
    });

    return median(distances); // Use the median distance as the final score
  }

  // Normalize text for comparison
  function normalizeText(text) {
    return text.toLowerCase().trim();
  }

  /**
   * Recalibrate the color intensity based on the match score and the current filtered selection.
   * Dynamically adjusts the lightness range for better contrast.
   * @param {number} score - The match score.
   * @param {number} maxDistance - The maximum distance in the current filtered selection.
   * @returns {string} - The background color in oklch format.
   */
  function calculateMatchColor(score, maxDistance) {
    const lightnessRange = 0.6; // Define the range of lightness for better contrast
    const baseLightness = 0.4; // Minimum lightness
    const normalizedScore = Math.min(score, maxDistance) / maxDistance; // Normalize score to [0, 1]
    const lightness = baseLightness + (1 - normalizedScore) * lightnessRange; // Adjust lightness dynamically
    const chroma = 0.1; // Fixed chroma for subtle color
    const hue = 330; // Fixed hue for a pinkish tone
    return `oklch(${lightness} ${chroma} ${hue})`; // Return color in oklch format
  }

  // Render tabs with filtering
  async function renderTabs(filter = "") {
    tabList.innerHTML = ""; // Clear the list

    if (!filter.trim()) {
      // If the filter is empty, display all tabs
      noTabsMessage.hidden = allTabs.length > 0;
      populateTabList(allTabs.map((tab) => ({ tab, distance: Infinity }))); // No coloring for unfiltered tabs
      return;
    }

    const normalizedFilter = normalizeText(filter);

    const filteredTabs = allTabs
      .map((tab) => {
        const combinedText = normalizeText(`${tab.url || ""} ${tab.title || ""}`);
        const distance = isRegexMode
          ? new RegExp(filter, "i").test(combinedText)
            ? 0
            : Infinity
          : tokenizedLevenshteinDistance(normalizedFilter, combinedText);
        return { tab, distance };
      })
      .filter(({ distance }) => distance < Infinity) // Exclude tabs that don't match in regex mode
      .sort((a, b) => a.distance - b.distance); // Sort by distance

    const maxDistance = Math.max(...filteredTabs.map(({ distance }) => distance), 1); // Avoid division by zero

    noTabsMessage.hidden = filteredTabs.length > 0;
    populateTabList(filteredTabs, maxDistance);
  }

  // Populate the tab list
  function populateTabList(filteredTabs, maxDistance) {
    // Group tabs by userAgent, then sort by lastaccessed
    const tabsByUserAgent = filteredTabs.reduce((acc, { tab, distance }) => {
      const key = tab.userAgent;
      acc[key] = acc[key] || [];
      acc[key].push({ tab, distance });
      return acc;
    }, {});

    // Populate the list
    for (const [key, userAgentTabs] of Object.entries(tabsByUserAgent)) {
      const parser = new UAParser(key);
      const browser = parser.getBrowser();
      const os = parser.getOS();

      userAgentTabs.sort((a, b) => (b.tab.lastaccessed || 0) - (a.tab.lastaccessed || 0)); // Sort tabs by lastaccessed

      userAgentTabs.forEach(({ tab: { url, title, faviconurl, pinned, lastaccessed }, distance }) => {
        const li = document.createElement("li");
        li.className = "tab-item";

        // Add OS icon
        const osIcon = document.createElement("i");
        osIcon.className = `os-icon ${
          {
            Windows: "fab fa-windows",
            MacOS: "fab fa-apple",
            Linux: "fab fa-linux",
            Android: "fab fa-android",
            iOS: "fab fa-apple",
          }[os.name] || "fas fa-question-circle"
        }`;
        osIcon.title = os.name || "Unknown OS";
        li.appendChild(osIcon);

        // Add browser icon
        const browserIcon = document.createElement("i");
        browserIcon.className = `browser-icon ${
          {
            Chrome: "fab fa-chrome",
            Firefox: "fab fa-firefox",
            Safari: "fab fa-safari",
            Edge: "fab fa-edge",
            Opera: "fab fa-opera",
          }[browser.name] || "fas fa-question-circle"
        }`;
        browserIcon.title = browser.name || "Unknown Browser";
        li.appendChild(browserIcon);

        // Add favicon if available
        if (faviconurl) {
          const img = document.createElement("img");
          img.src = faviconurl;
          img.alt = "Favicon";
          img.className = "favicon";
          li.appendChild(img);
        } else {
          li.appendChild(document.createTextNode("∅"));
        }

        // Add clickable link with title and host domain
        const link = document.createElement("a");
        link.href = url;
        link.textContent = `${title || "Untitled"} (${new URL(url).hostname})`;
        link.target = "_blank";
        link.className = "tab-link";
        link.style.backgroundColor = calculateMatchColor(distance, maxDistance); // Adjust color based on maxDistance
        link.style.color = distance < maxDistance * 0.5 ? "#000" : "#333"; // Ensure legibility for darker backgrounds
        link.style.padding = "5px 10px"; // Add padding for better visibility
        link.style.borderRadius = "4px"; // Add border radius for aesthetics
        li.appendChild(link);

        // Add duration since last accessed
        if (lastaccessed) {
          const lastAccessedLabel = document.createElement("span");
          lastAccessedLabel.textContent = `${timeSince(new Date(lastaccessed))}`;
          lastAccessedLabel.className = "last-accessed-label";
          li.appendChild(lastAccessedLabel);
        }

        tabList.appendChild(li);
      });
    }
  }

  // Parse user agent to display relevant values
  function parseUserAgent(userAgent) {
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    return `${device.vendor || "Unknown Device"} ${device.model || ""} (${os.name || "Unknown OS"} ${os.version || ""}) - ${browser.name || "Unknown Browser"} ${browser.version || ""}`;
  }

  // Calculate time since last access
  function timeSince(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    return `${months}M`;
  }

  try {
    // Load cached tabs initially and render them after loading
    loadCachedTabs(() => {
      if (cachedTabs.length > 0) {
        allTabs = cachedTabs;
        renderTabs();
      }
    });

    // Fetch tabs from the background script
    const { data: tabs, error } = await chrome.runtime.sendMessage({ action: "getTabs" });

    if (error) {
      errorMessage.textContent = `Error fetching tabs: ${error}`;
      errorMessage.hidden = false;
      return;
    }

    allTabs = tabs; // Store all tabs
    cachedTabs = tabs; // Update cache
    saveCachedTabs(tabs); // Save to chrome.storage.local
    renderTabs(); // Render all tabs
  } catch (error) {
    errorMessage.textContent = `Unexpected error: ${error.message}`;
    errorMessage.hidden = false;
  }

  // Handle filter input
  filterInput.addEventListener("input", (e) => {
    renderTabs(e.target.value);
  });

  // Handle regex checkbox toggle
  regexCheckbox.addEventListener("change", (e) => {
    isRegexMode = e.target.checked;
    renderTabs(filterInput.value); // Re-render tabs with the current filter
  });

  // Handle "Purge Tabs" button click
  purgeButton.addEventListener("click", async () => {
    if (confirm("Are you sure you want to delete all tab records for all machines? This action cannot be undone.")) {
      try {
        const { success, error } = await chrome.runtime.sendMessage({ action: "purgeTabs" });
        if (success) {
          alert("All tab records have been deleted.");
          chrome.storage.local.remove("cachedTabs"); // Clear cached tabs
          location.reload(); // Refresh the popup to reflect changes
        } else {
          alert(`Failed to purge tabs: ${error}`);
        }
      } catch (err) {
        alert(`Unexpected error: ${err.message}`);
      }
    }
  });

  // Refresh tabs on button click
  refreshButton.addEventListener("click", async () => {
    try {
      const { data: tabs, error } = await chrome.runtime.sendMessage({ action: "getTabs" });
      if (error) {
        status.textContent = `Error: ${error}`;
        status.classList.add("error");
        setTimeout(() => {
          status.textContent = "";
          status.classList.remove("error");
        }, 5000);
        return;
      }

      allTabs = tabs;
      cachedTabs = tabs; // Update cache
      saveCachedTabs(tabs); // Save to chrome.storage.local
      renderTabs();
    } catch (err) {
      status.textContent = `Unexpected error: ${err.message}`;
      status.classList.add("error");
      setTimeout(() => {
        status.textContent = "";
        status.classList.remove("error");
      }, 5000);
    }
  });

  // Handle "Sync All Tabs Now" button click
  syncAllTabsButton.addEventListener("click", async () => {
    try {
      const { success, error } = await chrome.runtime.sendMessage({ action: "syncAllTabsNow" });
      if (success) {
        status.textContent = "All tabs synced successfully!";
        status.classList.add("success");

        // Fetch updated tabs and refresh the display
        const { data: tabs, error: fetchError } = await chrome.runtime.sendMessage({ action: "getTabs" });
        if (fetchError) {
          status.textContent = `Error refreshing tabs: ${fetchError}`;
          status.classList.add("error");
        } else {
          allTabs = tabs;
          cachedTabs = tabs; // Update cache
          saveCachedTabs(tabs); // Save to chrome.storage.local
          renderTabs(); // Refresh the display
        }
      } else {
        status.textContent = `Failed to sync tabs: ${error}`;
        status.classList.add("error");
      }
    } catch (err) {
      status.textContent = `Unexpected error: ${err.message}`;
      status.classList.add("error");
    } finally {
      setTimeout(() => {
        status.textContent = "";
        status.classList.remove("success", "error");
      }, 5000);
    }
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "supabaseError") {
    const errorMessage = document.getElementById("error-message");
    if (message.error) {
      errorMessage.textContent = `Error: ${message.error}`;
      errorMessage.hidden = false;
    } else {
      errorMessage.textContent = "";
      errorMessage.hidden = true;
    }
  }
});
