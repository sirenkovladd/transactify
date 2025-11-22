chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Find cards on the page
  if (request.action === "findCards") {
    let cards = [];
    try {
      if (window.location.hostname.includes("cibconline.cibc.com")) {
        cards = findCibcCards();
      } else if (window.location.hostname.includes("wealthsimple.com")) {
        cards = findWealthsimpleCards();
      }

      if (cards.length > 0) {
        chrome.runtime.sendMessage({ action: "cardsFound", cards: cards });
        sendResponse({ status: "success" });
      } else {
        sendResponse({ status: "error", message: "No cards found on this page." });
      }
    } catch (error) {
      console.error("Error finding cards:", error);
      sendResponse({ status: "error", message: `An error occurred: ${error.message}` });
    }
    return true;
  }

  // Get auth details for making API calls from the popup
  if (request.action === "getAuthDetails") {
    try {
      let authDetails = {};
      if (request.site.includes("wealthsimple.com")) {
        authDetails = getWealthsimpleAuth();
      } else {
        // TODO: Implement for other sites like CIBC
      }
      sendResponse({ status: "success", auth: authDetails });
    } catch (error) {
      console.error("Error getting auth details:", error);
      sendResponse({ status: "error", message: `Failed to get auth details: ${error.message}` });
    }
    return true;
  }
});

/**
 * ----- Auth Details Functions -----
 */
function getWealthsimpleAuth() {
  // "wsm_auth_token=..."
  const cookie = document.cookie.split('; ').find(row => row.startsWith('_oauth2_access_v2='));
  if (!cookie) {
    throw new Error("Wealthsimple auth token not found in cookies.");
  }
  const decodedCookie = decodeURIComponent(cookie);
  const tokenData = JSON.parse(decodedCookie.split('=')[1]);
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error("Access token not found in Wealthsimple cookie.");
  }

  return {
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    }
  };
}


/**
 * ----- Card Discovery Functions -----
 */

function findCibcCards() {
  const cards = [];
  // This is a guess. CIBC might use a select dropdown for accounts.
  const accountSelector = document.querySelector('select[name="selectedAccount"]');
  if (accountSelector) {
    accountSelector.querySelectorAll('option').forEach(option => {
      if (option.value) {
        cards.push({
          id: option.value,
          name: option.textContent.trim(),
          site: 'cibconline.cibc.com'
        });
      }
    });
  }
  // As a fallback, look for a card name in a header
  const cardNameElement = document.querySelector('.card-name-header'); // This is a hypothetical selector
  const accountNumberElement = document.querySelector('.account-number'); // Hypothetical
  if (cardNameElement && accountNumberElement && cards.length === 0) {
    cards.push({
      id: accountNumberElement.textContent.trim(),
      name: cardNameElement.textContent.trim(),
      site: 'cibconline.cibc.com'
    });
  }
  return cards;
}

function findWealthsimpleCards() {
  const cards = [];
  const path = window.location.pathname;
  // Example URL: /app/account-details/ca-credit-card-k5MlXK_1Lg
  const match = path.match(/\/app\/account-details\/([a-zA-Z0-9_-]+)/);

  if (match && match[1]) {
    const cardId = match[1];
    // Try to find a human-readable name for the card, e.g., in an h1 or a specific element
    const h1 = main.getElementsByClassName('kHtUCP')[0];
    let cardName = 'Wealthsimple Card'; // Default name
    if (h1) {
      cardName = h1.textContent.trim();
    }

    cards.push({
      id: cardId,
      name: cardName,
      site: 'my.wealthsimple.com'
    });
  }
  return cards;
}
