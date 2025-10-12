import van from "vanjs-core";
import { categories } from './common.ts';

const { div, span, p, h3, strong, table, thead, tbody, tr, th, td, input, button, option, select } = van.tags;

function parseCSV(data: string): any[] {
  // TODO
  return [
    { datetime: '2024-01-01T12:00:00', merchant: 'CSV Merchant 1', amount: 100, category: 'Category 1', tags: 'tag1, tag2' },
    { datetime: '2024-01-02T13:00:00', merchant: 'CSV Merchant 2', amount: 200, category: 'Category 2', tags: 'tag3' },
  ];
}

function parseCIBC(data: string): any[] {
  // TODO
  return [
    { datetime: '2024-01-03T14:00:00', merchant: 'CIBC Merchant 1', amount: 300, category: 'Category 1', tags: '' },
    { datetime: '2024-01-04T15:00:00', merchant: 'CIBC Merchant 2', amount: 400, category: 'Category 3', tags: 'tag4' },
  ];
}

function parseWealthsimple(data: string): any[] {
  // TODO
  return [
    { datetime: '2024-01-05T16:00:00', merchant: 'Wealthsimple Merchant 1', amount: 500, category: 'Category 2', tags: 'tag5' },
    { datetime: '2024-01-06T17:00:00', merchant: 'Wealthsimple Merchant 2', amount: 600, category: 'Category 3', tags: 'tag6, tag7' },
  ];
}

function renderParsedTransactions(data: any[], container: HTMLElement) {
  container.innerHTML = '';

  const allTagsInput = input({ type: 'text', placeholder: 'Add tag to all' });
  const addTagButton = button({
    onclick: () => {
      const tag = allTagsInput.value;
      if (tag) {
        const tagInputs = container.querySelectorAll('.tags-input');
        tagInputs.forEach(input => {
          const currentTags = (input as HTMLInputElement).value.split(',').map(t => t.trim()).filter(t => t);
          if (!currentTags.includes(tag)) {
            (input as HTMLInputElement).value = [...currentTags, tag].join(', ');
          }
        });
      }
    }
  }, 'Add Tag to All');

  const transactionTable = table(
    thead(
      tr(
        th('Datetime'),
        th('Merchant'),
        th('Amount'),
        th('Category'),
        th('Tags'),
        th('Actions')
      )
    ),
    tbody(
      ...data.map(item =>
        tr(
          td(input({ type: 'datetime-local', value: item.datetime })),
          td(input({ type: 'text', value: item.merchant })),
          td(input({ type: 'number', value: item.amount })),
          td(select({ class: 'modal-input' }, ...categories.val.map(c => option({ value: c, selected: c === item.category }, c)))),
          td(input({ type: 'text', value: item.tags, class: 'tags-input' })),
          td(button({ onclick: (e: Event) => (e.target as HTMLElement)?.closest('tr')?.remove() }, 'Remove'))
        )
      )
    )
  );
  van.add(container, div(allTagsInput, addTagButton), transactionTable);
}

export function setupAdding() {
  // Import Modal Logic
  const importModal = document.getElementById('import-modal');
  const importBtn = document.getElementById('import-transaction');
  const importCloseButton = importModal?.getElementsByClassName('close-button')[0] as HTMLElement;

  if (importModal && importBtn && importCloseButton) {
    importBtn.onclick = () => {
      importModal.style.display = 'block';
    }

    importCloseButton.onclick = () => {
      importModal.style.display = 'none';
    }

    window.onclick = (event) => {
      if (event.target == importModal) {
        importModal.style.display = 'none';
      }
    };

    const tabs = importModal.querySelectorAll('.tab');
    const tabContents = importModal.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        tabContents.forEach(c => c.classList.remove('active'));
        const tabName = tab.getAttribute('data-tab');
        if (tabName) {
          document.getElementById(tabName + '-tab')?.classList.add('active');
        }
      });
    });

    const parseCSVBtn = document.getElementById('parse-csv-btn');
    const parseCIBCBtn = document.getElementById('parse-cibc-btn');
    const parseWealthsimpleBtn = document.getElementById('parse-wealthsimple-btn');

    const parsedTransactionsContainer = document.getElementById('parsed-transactions-container');

    const parseData = (parser: (data: string) => any[]) => {
      return () => {
        const inputId = parser.name.replace('parse', '').toLowerCase() + '-input';
        const input = document.getElementById(inputId) as HTMLTextAreaElement;
        if (input && parsedTransactionsContainer) {
          const data = input.value;
          const parsedData = parser(data);
          renderParsedTransactions(parsedData, parsedTransactionsContainer);
        }
      }
    }

    if (parseCSVBtn) {
      parseCSVBtn.onclick = parseData(parseCSV);
    }
    if (parseCIBCBtn) {
      parseCIBCBtn.onclick = parseData(parseCIBC);
    }
    if (parseWealthsimpleBtn) {
      parseWealthsimpleBtn.onclick = parseData(parseWealthsimple);
    }
  }

  // Create New Transaction Modal Logic
  const createNewTransactionModal = document.getElementById('create-new-transaction-modal');
  const createNewTransactionBtn = document.getElementById('create-new-transaction-btn');
  const createNewTransactionCloseButton = createNewTransactionModal?.getElementsByClassName('close-button')[0] as HTMLElement;
  const saveNewTransactionBtn = document.getElementById('save-new-transaction-btn');
  const categoryDropdown = document.getElementById('new-transaction-category') as HTMLSelectElement;

  if (createNewTransactionModal && createNewTransactionBtn && createNewTransactionCloseButton && saveNewTransactionBtn && categoryDropdown) {
    createNewTransactionBtn.onclick = () => {
      createNewTransactionModal.style.display = 'block';
    }

    createNewTransactionCloseButton.onclick = () => {
      createNewTransactionModal.style.display = 'none';
    }

    window.onclick = (event) => {
      if (event.target == createNewTransactionModal) {
        createNewTransactionModal.style.display = 'none';
      }
    };

    saveNewTransactionBtn.onclick = () => {
      const newTransaction = {
        date: (document.getElementById('new-transaction-date') as HTMLInputElement).value,
        merchant: (document.getElementById('new-transaction-merchant') as HTMLInputElement).value,
        amount: (document.getElementById('new-transaction-amount') as HTMLInputElement).value,
        person: (document.getElementById('new-transaction-person') as HTMLInputElement).value,
        card: (document.getElementById('new-transaction-card') as HTMLInputElement).value,
        category: (document.getElementById('new-transaction-category') as HTMLSelectElement).value,
        tags: (document.getElementById('new-transaction-tags') as HTMLInputElement).value.split(',').map(tag => tag.trim()),
      };
      createNewTransactionModal.style.display = 'none';
    }

    van.derive(() => {
      categoryDropdown.innerHTML = '';
      categories.val.forEach(category => {
        van.add(categoryDropdown, option({ value: category }, category));
      });
    });
  }
}