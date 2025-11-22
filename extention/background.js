chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openImportPage') {
    handleOpenImportPage(request.transactions);
    // Return true to indicate we might respond asynchronously (though we aren't really here)
    return true;
  }
});

async function handleOpenImportPage(transactions) {
  const serverUrl = 'https://transaction.sirenko.ca/?add=extension';

  try {
    const tab = await chrome.tabs.create({ url: serverUrl, active: true });

    // Wait for the tab to finish loading
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);

        // Send data to the new tab
        // We need to wait a bit for the app to initialize its event listeners
        setTimeout(() => {
          // Method 1: Send message to content script (if one exists and is listening)
          chrome.tabs.sendMessage(tab.id, {
            action: 'importTransactions',
            transactions: transactions
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log("Content script not ready or not present, trying direct injection");
            } else {
              console.log("Message sent to tab via sendMessage");
            }
          });

          // Method 2: Direct execution to postMessage to the window
          // This is more reliable for communicating with the web app's JS directly
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (data) => {
              window.postMessage({ type: 'EXTENSION_IMPORT_TRANSACTIONS', data }, '*');
            },
            args: [transactions]
          }).catch(err => console.error("Script execution failed:", err));

        }, 2000); // Wait 2 seconds for app to hydrate
      }
    });

  } catch (error) {
    console.error('Failed to open web app:', error);
  }
}
