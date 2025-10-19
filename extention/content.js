
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "parseTransactions") {
    let transactions;
    if (window.location.hostname.includes("cibconline.cibc.com")) {
      transactions = parseCibc();
    } else if (window.location.hostname.includes("wealthsimple.com")) {
      transactions = parseWealthsimple();
    }

    if (transactions) {
      showModal(transactions);
      sendResponse({ status: "success", count: transactions.length });
    } else {
      sendResponse({ status: "error", message: "No transactions found or site not supported." });
    }
  }
  return true; // Indicates that the response is sent asynchronously
});

function showModal(transactions) {
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '50%';
  modal.style.left = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.width = '80%';
  modal.style.maxWidth = '1000px';
  modal.style.height = '70%';
  modal.style.backgroundColor = 'white';
  modal.style.border = '1px solid black';
  modal.style.zIndex = '10000';
  modal.style.overflow = 'auto';
  modal.style.padding = '20px';

  const closeModal = () => modal.remove();

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.onclick = closeModal;

  const allTagsInput = document.createElement('input');
  allTagsInput.type = 'text';
  allTagsInput.placeholder = 'Add tag to all';

  const addTagButton = document.createElement('button');
  addTagButton.textContent = 'Add Tag to All';
  addTagButton.onclick = () => {
    const tag = allTagsInput.value;
    if (tag) {
      const tagInputs = modal.querySelectorAll('.tags-input');
      tagInputs.forEach(input => {
        const currentTags = input.value.split(',').map(t => t.trim()).filter(t => t);
        if (!currentTags.includes(tag)) {
          input.value = [...currentTags, tag].join(', ');
        }
      });
    }
  };

  const table = document.createElement('table');
  table.style.width = '100%';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Datetime</th>
        <th>Merchant</th>
        <th>Amount</th>
        <th>Category</th>
        <th>Card</th>
        <th>Tags</th>
        <th>Actions</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  transactions.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="datetime-local" value="${item.datetime}"></td>
      <td><input type="text" value="${item.merchant}"></td>
      <td><input type="number" value="${item.amount}"></td>
      <td><input type="text" value="${item.category}"></td>
      <td><input type="text" value="${item.card || ''}"></td>
      <td><input type="text" value="${item.tags}" class="tags-input"></td>
    `;
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.onclick = () => tr.remove();
    const actionTd = document.createElement('td');
    actionTd.appendChild(removeButton);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save Imported Transactions';
  saveButton.onclick = () => {
    const transactionsToSave = [];
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      transactionsToSave.push({
        occurredAt: new Date(inputs[0].value).toISOString(),
        merchant: inputs[1].value,
        amount: parseFloat(inputs[2].value),
        category: inputs[3].value,
        card: inputs[4].value,
        tags: inputs[5].value.split(',').map(t => t.trim()).filter(t => t),
        currency: 'CAD',
        personName: '',
      });
    });
    console.log('Saving:', transactionsToSave);
    // Here you would call a function to send the data to the server, like in adding.ts
    // addTransactions(transactionsToSave).then(closeModal);
    alert('Transactions saved to console. See implementation notes.');
    closeModal();
  };

  modal.appendChild(closeButton);
  modal.appendChild(document.createElement('hr'));
  modal.appendChild(allTagsInput);
  modal.appendChild(addTagButton);
  modal.appendChild(document.createElement('hr'));
  modal.appendChild(table);
  modal.appendChild(document.createElement('hr'));
  modal.appendChild(saveButton);

  document.body.appendChild(modal);
}

// These functions will be available because the parser files will be injected by the manifest.
// We need to declare them to satisfy the linter.
function parseCibc() {
  const transactions = [];
  const rows = document.querySelectorAll('tr.transaction-row');

  rows.forEach(row => {
    const dateEl = row.querySelector('.transactionDate span');
    const descriptionEl = row.querySelector('.transactionDescription');
    const amountEl = row.querySelector('.amount.debit span.negative, .amount.credit span.positive');

    if (dateEl && descriptionEl && amountEl) {
      const date = dateEl.textContent.trim();
      const description = descriptionEl.textContent.trim();
      const amountText = amountEl.textContent.trim().replace('−$', '-').replace('$', '');
      const amount = parseFloat(amountText);

      // Convert date "Oct 2, 2025" to "YYYY-MM-DD"
      const d = new Date(date);
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}T00:00`;

      transactions.push({
        datetime: formattedDate,
        merchant: description,
        amount: amount,
        category: 'Unknown', // Or try to guess
        tags: '',
        card: 'cibc'
      });
    }
  });

  return transactions;
}

function parseWealthsimple() {
  // TODO: Implement Wealthsimple parsing logic.
  // This will likely involve finding a script tag
  // with a JSON object containing transactions.
  console.log("Wealthsimple parser not implemented yet.");
  return [];
}

