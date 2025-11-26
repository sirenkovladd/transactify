document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const cardsListDiv = document.getElementById('cards-list');
  const noCardsMessage = document.getElementById('no-cards-message');
  const currentSiteSpan = document.getElementById('current-site');
  const findCardsButton = document.getElementById('findCardsButton');
  const fetchTransactionsButton = document.getElementById('fetchTransactionsButton');

  let currentTab = null;
  let currentSite = '';

  /**
   * ----- Storage Utility Functions -----
   */

  async function getStoredData() {
    const result = await chrome.storage.local.get('cards');
    return result.cards || [];
  }

  async function setStoredData(cards) {
    return chrome.storage.local.set({ cards });
  }


  /**
   * ----- UI Rendering Functions -----
   */

  function renderCard(card) {
    const cardId = `card-${card.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const cardDiv = document.createElement('div');
    cardDiv.id = cardId;
    cardDiv.className = 'flex items-center justify-between bg-gray-200 dark:bg-gray-700 p-2 rounded-lg';

    const label = document.createElement('label');
    label.className = 'flex items-center space-x-2 cursor-pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = card.enabled;
    checkbox.className = 'form-checkbox h-5 w-5 text-blue-600 bg-gray-300 border-gray-300 rounded focus:ring-blue-500';
    checkbox.addEventListener('change', () => handleToggleCard(card.id, checkbox.checked));

    const span = document.createElement('span');
    span.textContent = card.name;

    label.appendChild(checkbox);
    label.appendChild(span);

    const removeButton = document.createElement('button');
    removeButton.className = 'text-red-500 hover:text-red-700';
    removeButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
    removeButton.addEventListener('click', () => handleRemoveCard(card.id));

    cardDiv.appendChild(label);
    cardDiv.appendChild(removeButton);

    return cardDiv;
  }

  async function loadAndRenderCards() {
    const allCards = await getStoredData();
    const siteCards = allCards.filter(c => c.site === currentSite);

    cardsListDiv.innerHTML = '';
    if (siteCards.length === 0) {
      noCardsMessage.classList.remove('hidden');
      fetchTransactionsButton.disabled = true;
    } else {
      noCardsMessage.classList.add('hidden');
      const anyEnabled = siteCards.some(c => c.enabled);
      fetchTransactionsButton.disabled = !anyEnabled;
      siteCards.forEach(card => {
        cardsListDiv.appendChild(renderCard(card));
      });
    }
  }


  /**
   * ----- Event Handlers & Action Functions -----
   */

  async function handleToggleCard(cardId, isEnabled) {
    const allCards = await getStoredData();
    const cardIndex = allCards.findIndex(c => c.id === cardId);
    if (cardIndex > -1) {
      allCards[cardIndex].enabled = isEnabled;
      await setStoredData(allCards);
      await loadAndRenderCards(); // Re-render to update button state
      showStatus(`Card ${isEnabled ? 'enabled' : 'disabled'}.`, 'success', 1500);
    }
  }

  async function handleRemoveCard(cardId) {
    let allCards = await getStoredData();
    allCards = allCards.filter(c => c.id !== cardId);
    await setStoredData(allCards);
    await loadAndRenderCards();
    showStatus('Card removed.', 'success');
  }

  function handleFindCards() {
    if (!currentTab) return;
    showStatus('Searching for cards on this page...', 'info', null);
    chrome.tabs.sendMessage(currentTab.id, { action: 'findCards' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Could not connect to the page. Try reloading it.', 'error');
        console.error(chrome.runtime.lastError.message);
      } else if (response && response.status === 'error') {
        showStatus(response.message, 'error');
      } else if (!response || response.status !== 'success') {
        showStatus('No response from page. Is it a supported site?', 'error');
      }
    });
  }

  function showStatus(message, type = 'info', duration = 3000) {
    statusDiv.textContent = message;
    statusDiv.className = 'text-sm h-10 flex items-center justify-center '; // Reset classes
    switch (type) {
      case 'success': statusDiv.classList.add('text-green-500'); break;
      case 'error': statusDiv.classList.add('text-red-500'); break;
      case 'warn': statusDiv.classList.add('text-yellow-500'); break;
      default: statusDiv.classList.add('text-gray-500', 'dark:text-gray-400'); break;
    }
    if (duration) {
      setTimeout(() => {
        if (statusDiv.textContent === message) {
          statusDiv.textContent = '';
        }
      }, duration);
    }
  }


  /**
   * ----- Message Listener -----
   */

  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'cardsFound') {
      const newCards = request.cards || [];
      if (newCards.length === 0) {
        showStatus('No new cards were found on the page.', 'warn');
        return;
      }

      const existingCards = await getStoredData();
      let addedCount = 0;

      newCards.forEach(newCard => {
        if (!existingCards.some(c => c.id === newCard.id)) {
          existingCards.push({ ...newCard, enabled: true });
          addedCount++;
        }
      });

      if (addedCount > 0) {
        await setStoredData(existingCards);
        showStatus(`Successfully added ${addedCount} new card(s)!`, 'success');
        await loadAndRenderCards();
      } else {
        showStatus('All found cards are already in your list.', 'info');
      }
    }
  });

  /**
   * ----- Transaction Fetching Logic -----
   */

  async function fetchWealthsimpleTransactions(card, auth, cursor = null, allTransactions = []) {
    showStatus(`Fetching from ${card.name}... (${allTransactions.length} found)`);
    const response = await fetch("https://my.wealthsimple.com/graphql", {
      method: "POST",
      headers: auth.headers,
      body: JSON.stringify({
        operationName: "FetchActivityFeedItems",
        variables: {
          orderBy: "OCCURRED_AT_DESC",
          first: 10,
          cursor: cursor,
          condition: {
            endDate: new Date().toISOString(),
            accountIds: [card.id]
          }
        },
        query: `query FetchActivityFeedItems($first: Int, $cursor: Cursor, $condition: ActivityCondition, $orderBy: [ActivitiesOrderBy!] = OCCURRED_AT_DESC) {
          activityFeedItems(first: $first, after: $cursor, condition: $condition, orderBy: $orderBy) {
            edges { node { amount amountSign currency occurredAt spendMerchant type eTransferName } }
            pageInfo { hasNextPage endCursor }
          }
        }`
      })
    });

    if (!response.ok) throw new Error(`Wealthsimple API error: ${response.statusText}`);
    const { data } = await response.json();
    const { edges, pageInfo } = data.activityFeedItems;
    allTransactions.push(...edges);

    // if (pageInfo.hasNextPage) {
    //   return fetchWealthsimpleTransactions(card, auth, pageInfo.endCursor, allTransactions);
    // }
    return allTransactions;
  }

  async function sendToServer(transactions) {
    showStatus(`Opening web app to import ${transactions.length} transactions...`, 'info', null);

    try {
      // Send message to background script to handle the tab creation and data transfer
      // This ensures the process continues even if the popup closes
      await chrome.runtime.sendMessage({
        action: 'openImportPage',
        transactions: transactions
      });

      showStatus('Transactions sent to web app!', 'success');

      // Optional: Close the popup after a short delay since the background script is handling it
      setTimeout(() => {
        window.close();
      }, 1000);

    } catch (error) {
      console.error('Failed to send message to background script:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  async function handleFetchTransactions() {
    fetchTransactionsButton.disabled = true;
    findCardsButton.disabled = true;

    try {
      const allCards = await getStoredData();
      const selectedCards = allCards.filter(c => c.site === currentSite && c.enabled);
      if (selectedCards.length === 0) {
        showStatus('No cards selected.', 'warn');
        return;
      }

      showStatus('Requesting authentication from page...', 'info', null);
      const authResponse = await chrome.tabs.sendMessage(currentTab.id, { action: 'getAuthDetails', site: currentSite });

      if (!authResponse || authResponse.status !== 'success') {
        throw new Error(authResponse.message || 'Failed to get authentication from page.');
      }

      let allFetchedTransactions = [];
      for (const card of selectedCards) {
        let transactions = [];
        if (card.site.includes('wealthsimple.com')) {
          transactions = await fetchWealthsimpleTransactions(card, authResponse.auth);
        } else if (card.site.includes('cibc.com')) {
          showStatus(`Fetching for CIBC's ${card.name} is not implemented yet.`, 'warn');
          // transactions = await fetchCibcTransactions(card, authResponse.auth);
        }
        allFetchedTransactions.push(...transactions);
      }

      if (allFetchedTransactions.length > 0) {
        await sendToServer(allFetchedTransactions);
      } else {
        showStatus('No new transactions found to send.', 'info');
      }

    } catch (error) {
      console.error('Error during fetch process:', error);
      showStatus(error.message, 'error');
    } finally {
      fetchTransactionsButton.disabled = false;
      findCardsButton.disabled = false;
    }
  }


  /**
   * ----- Initialization -----
   */

  async function init() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];

    if (currentTab && currentTab.url) {
      try {
        const url = new URL(currentTab.url);
        currentSite = url.hostname.replace(/^www\./, '');
        currentSiteSpan.textContent = currentSite;
      } catch (e) {
        currentSite = 'unsupported page';
        currentSiteSpan.textContent = 'unsupported page';
        findCardsButton.disabled = true;
        fetchTransactionsButton.disabled = true;
        showStatus('Cannot run on this type of page.', 'warn');
        return;
      }
    }

    await loadAndRenderCards();
    findCardsButton.addEventListener('click', handleFindCards);
    fetchTransactionsButton.addEventListener('click', handleFetchTransactions);
  }

  init();
});