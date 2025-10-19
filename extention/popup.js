document.addEventListener('DOMContentLoaded', () => {
  const fetchButton = document.getElementById('fetchButton');
  const parseButton = document.getElementById('parseButton');
  const statusDiv = document.getElementById('status');
  const dateRangeDiv = document.getElementById('dateRange');
  const firstDateEl = document.getElementById('firstDate');
  const lastDateEl = document.getElementById('lastDate');

  parseButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: "parseTransactions" }, (response) => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }
        if (response.status === 'success') {
          statusDiv.textContent = `Parsed ${response.count} transactions.`;
        } else {
          statusDiv.textContent = 'Failed to parse: ' + response.message;
        }
      });
    }
  });


  /**
   * @typedef {Object} Transaction
   * @property {string} amount
   * @property {string} occurredAt
   * @property {string} spendMerchant
   * @property {string} subType
   */

  /**
   * MOCK: Simulates fetching transactions from an API.
   * In a real extension, this would make a network request.
   * @param {string|undefined} cursor - The pagination cursor.
   * @returns {Promise<{transactions: Transaction[], nextCursor: string|null}>}
   */
  async function getTransactions(cursor) {
    console.log(`Fetching with cursor: ${cursor}`);
    // This is mock data. Replace this with your actual API call.
    const mockDatabase = {
      'start': {
        transactions: [
          { "amount": "103.80", "occurredAt": "2025-10-05T20:24:28.000Z", "spendMerchant": "Nofrills Joti's #3403", "subType": "PURCHASE" },
          { "amount": "12.50", "occurredAt": "2025-10-06T12:15:00.000Z", "spendMerchant": "Coffee Shop", "subType": "PURCHASE" }
        ],
        nextCursor: 'page2'
      },
      'page2': {
        transactions: [
          { "amount": "250.00", "occurredAt": "2025-10-08T08:00:45.000Z", "spendMerchant": "Online Store", "subType": "PURCHASE" },
          { "amount": "78.99", "occurredAt": "2025-11-01T18:55:10.000Z", "spendMerchant": "Restaurant", "subType": "PURCHASE" }
        ],
        nextCursor: 'page3'
      },
      'page3': {
        transactions: [
          { "amount": "5.00", "occurredAt": "2025-11-02T09:30:00.000Z", "spendMerchant": "Vending Machine", "subType": "PURCHASE" }
        ],
        nextCursor: null // No more pages
      }
    };

    return new Promise(resolve => {
      setTimeout(() => {
        resolve(mockDatabase[cursor || 'start']);
      }, 500); // Simulate network delay
    });
  }

  /**
   * Fetches all transactions by handling pagination.
   * @returns {Promise<Transaction[]>}
   */
  async function fetchAllTransactions() {
    let allTransactions = [];
    let cursor = undefined;
    let hasMore = true;

    statusDiv.textContent = 'Fetching transactions...';

    while (hasMore) {
      const result = await getTransactions(cursor);
      if (result && result.transactions) {
        allTransactions.push(...result.transactions);
        cursor = result.nextCursor;
        hasMore = !!cursor;
        statusDiv.textContent = `Fetched ${allTransactions.length} transactions...`;
      } else {
        hasMore = false;
      }
    }
    return allTransactions;
  }

  /**
   * Sends the transaction data to your external server.
   * @param {Transaction[]} transactions
   */
  async function sendToServer(transactions) {
    // IMPORTANT: Replace this with your actual server URL
    const serverUrl = 'https://your-external-server.com/api/transactions';
    statusDiv.textContent = 'Sending data to server...';

    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      statusDiv.textContent = 'Successfully sent data!';
      console.log('Server response:', await response.json());

    } catch (error) {
      statusDiv.textContent = 'Error sending data. See console.';
      console.error('Failed to send transactions to server:', error);
    }
  }


  fetchButton.addEventListener('click', async () => {
    fetchButton.disabled = true;
    fetchButton.textContent = 'Processing...';
    dateRangeDiv.classList.add('hidden');

    try {
      const transactions = await fetchAllTransactions();

      if (transactions.length > 0) {
        // Find first and last dates
        const dates = transactions.map(t => new Date(t.occurredAt));
        const firstDate = new Date(Math.min(...dates));
        const lastDate = new Date(Math.max(...dates));

        // Display dates
        firstDateEl.textContent = `First: ${firstDate.toDateString()}`;
        lastDateEl.textContent = `Last:  ${lastDate.toDateString()}`;
        dateRangeDiv.classList.remove('hidden');

        await sendToServer(transactions);
      } else {
        statusDiv.textContent = 'No transactions found.';
      }

    } catch (error) {
      statusDiv.textContent = 'An error occurred. Check console.';
      console.error('Error during fetch and send process:', error);
    } finally {
      fetchButton.disabled = false;
      fetchButton.textContent = 'Fetch & Send Transactions';
    }
  });
});