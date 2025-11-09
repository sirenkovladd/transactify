import van, { type ChildDom, type State } from "vanjs-core";
import { addTransactions, categories, type NewTransaction } from './common.ts';
import { categoriesMap, type Categories } from "./const.ts";

const { div, span, p, h3, strong, table, thead, tbody, tr, th, td, input, button, option, select, textarea } = van.tags;

function parseCSV(data: string): any[] {
  const lines = data.trim().split('\n');
  if (lines.length < 1) {
    return [];
  }
  const header = lines.shift()!.split(',').map(h => h.trim().toLowerCase());

  const transactions = lines.map(line => {
    const values = line.split(',');
    const row: { [key: string]: string } = {};
    header.forEach((key, i) => {
      row[key] = values[i] ? values[i].trim() : '';
    });
    return row;
  });

  return transactions.map(t => {
    const amountStr = t.amount || t.debit || t.credit;
    let amount = parseFloat(amountStr || '0');
    if (t.debit && amount > 0) {
      amount = -amount;
    }

    // Try to convert date to datetime-local format if possible
    let datetime = t.datetime || t.date || '';
    if (datetime && !datetime.includes('T')) {
      // Assuming date is in a format that can be parsed by Date, like YYYY-MM-DD
      const d = new Date(datetime);
      if (!isNaN(d.getTime())) {
        // Format to 'YYYY-MM-DDTHH:mm'
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        datetime = `${year}-${month}-${day}T00:00`;
      }
    }


    return {
      datetime: datetime,
      merchant: t.merchant || t.description || '',
      amount: amount || 0,
      category: t.category || '',
      tags: t.tags || '',
    };
  });
}

const cibcMerchant: Record<string, Categories> = {
  "0001": "home goods",
  "0002": "unknown",
  "0004": "transportation",
  "0005": "hotel",
  "0003": "food & other",
  "0006": "takeouts",
  "0007": "home goods",
  "0008": "health",
  "0009": "unknown",
  "0010": "unknown",
  "0011": "unknown"
}

function categoryFallback(merchantCategoryId: string): Categories {
  return cibcMerchant[merchantCategoryId] || 'unknown';
}

function parseCIBC(data: string): any[] {
  let payload: any[] = [];

  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      payload = parsed;
    } else if (parsed && Array.isArray(parsed.transactions)) {
      // Support wrapped shape if needed
      payload = parsed.transactions;
    } else {
      console.error('Unexpected CIBC payload format');
      return [];
    }
  } catch (e) {
    console.error('Failed to parse CIBC JSON', e);
    return [];
  }

  return payload.filter(e => e.descriptionLine1 !== 'PAYMENT THANK YOU/PAIEMEN').map((item) => {
    const merchant = item.descriptionLine1 || item.transactionDescription || '';
    const categoryFromMap = getCategory(merchant);
    const category =
      categoryFromMap && categoryFromMap !== 'unknown'
        ? categoryFromMap
        : categoryFallback(item.merchantCategoryId);

    // Prefer debit as negative, fallback to credit as positive
    let amount = 0;
    if (item.debit != null) {
      amount = Math.abs(Number(item.debit) || 0);
    } else if (item.credit != null) {
      amount = -Math.abs(Number(item.credit) || 0);
    }

    // Normalize datetime to 'YYYY-MM-DDTHH:mm'
    let datetime = item.date || item.postedDate || '';
    if (datetime) {
      const d = new Date(datetime);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        datetime = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
    }

    return {
      datetime,
      merchant,
      amount,
      category,
      card: 'cibc',
      tags: '',
    };
  });
}

function getCategory(merchant: string): Categories {
  for (const [category, merchants] of Object.entries(categoriesMap)) {
    for (const pattern of merchants) {
      if (merchant.toLowerCase().includes(pattern.toLowerCase())) {
        return category as Categories;
      }
    }
  }
  return "unknown";
}

function parseWealthsimple(data: string): any[] {
  const payload = JSON.parse(data) as { node: { amountSign: string, amount: string, occurredAt: string, spendMerchant: string } }[];

  return payload.filter(e => e.node.amountSign === 'negative').map((item: any) => {
    const node = item.node;
    let amount = parseFloat(node.amount);

    const d = new Date(node.occurredAt);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const datetime = `${year}-${month}-${day}T${hours}:${minutes}`;

    const merchant = node.spendMerchant;
    const category = getCategory(merchant);

    return {
      datetime: datetime,
      merchant: merchant,
      amount: amount,
      category: category,
      card: 'wealthsimple',
      tags: '',
    };
  });
}

function renderParsedTransactions(data: any[], card: string | undefined, openImportModal: State<boolean>) {
  const container = div();

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
        card ? null : th('Card'),
        th('Tags'),
        th('Actions'),
      )
    ),
    tbody(
      ...data.map(item =>
        tr(
          td(input({ type: 'datetime-local', value: item.datetime })),
          td(input({ type: 'text', value: item.merchant })),
          td(input({ type: 'number', value: item.amount })),
          td(select({ class: 'modal-input' }, ...categories.val.map(c => option({ value: c, selected: c === item.category }, c)))),
          card ? null : td(input({ type: 'text', value: '' })),
          td(input({ type: 'text', value: item.tags, class: 'tags-input' })),
          td(button({ onclick: (e: Event) => (e.target as HTMLElement)?.closest('tr')?.remove() }, 'Remove'))
        )
      )
    )
  );

  const saveButton = button({
    onclick: () => {
      const transactionsToSave: NewTransaction[] = [];
      const rows = transactionTable.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const inputs = row.querySelectorAll('input, select');
        const occurredAt = (inputs[0] as HTMLInputElement).value;
        const merchant = (inputs[1] as HTMLInputElement).value;
        const amount = parseFloat((inputs[2] as HTMLInputElement).value);
        const category = (inputs[3] as HTMLSelectElement).value;
        const cardValue = card ? card : (inputs[4] as HTMLInputElement).value;
        const tags = (inputs[card ? 4 : 5] as HTMLInputElement).value.split(',').map(t => t.trim()).filter(t => t);

        transactionsToSave.push({
          occurredAt: new Date(occurredAt).toISOString(),
          merchant,
          amount,
          category,
          tags,
          currency: 'CAD', // Defaulting currency
          personName: '', // Defaulting personName
          card: cardValue,
        });
      });

      if (transactionsToSave.length > 0) {
        addTransactions(transactionsToSave).then(() => {
          openImportModal.val = false;
        });
      }
    }
  }, 'Save Imported Transactions');

  van.add(container, div(allTagsInput, addTagButton), transactionTable, div(saveButton));
  return container;
}

export function setupAdding() {
  const openImportModal = van.state(false);

  const ImportModalComponent = () => {
    if (!openImportModal.val) return '';

    const active = van.state<'Wealthsimple' | 'CSV' | 'CIBC'>('Wealthsimple');

    const Tab = (type: typeof active.val, ...children: ChildDom[]) => div({ class: () => `tab-content${active.val === type ? ' active' : ''}` }, ...children)

    const parsedTransactionsContainer = div({ id: 'parsed-transactions-container' });

    const wealthsimpleInput = textarea({ id: 'wealthsimple-input', placeholder: 'Paste your Wealthsimple data here' });
    const cibcInput = textarea({ id: 'cibc-input', placeholder: 'Paste your CIBC data here' });
    const csvInput = textarea({ id: 'csv-input', placeholder: '2024-01-01,The Coffee Shop,-3.50,Food,coffee\n2024-01-02,Book Store,-25.00,Shopping,books' });

    const parseData = (input: HTMLTextAreaElement, parser: (data: string) => any[], card?: string) => {
      return () => {
        const data = input.value;
        const parsedData = parser(data);
        console.log(parsedData);
        parsedTransactionsContainer.innerHTML = '';
        van.add(parsedTransactionsContainer, renderParsedTransactions(parsedData, card, openImportModal));
      };
    };

    const modal = div({ id: 'import-modal', class: 'modal', style: 'display: block;', onclick: () => openImportModal.val = false },
      div({ class: 'modal-content', onclick: (e: Event) => e.stopPropagation() },
        span({ class: 'close-button', onclick: () => openImportModal.val = false }, '×'),
        div({ class: 'tab-container' },
          (['Wealthsimple', 'CIBC', 'CSV'] as const).map((type) => div({
            class: () => `tab${active.val === type ? ' active' : ''}`,
            'data-tab': 'wealthsimple',
            onclick: () => active.val = type,
          }, type))
        ),
        Tab("Wealthsimple",
          wealthsimpleInput,
          button({ id: 'parse-wealthsimple-btn', class: 'apply-btn', onclick: parseData(wealthsimpleInput, parseWealthsimple, 'wealthsimple') }, 'Preview')
        ),
        Tab('CIBC',
          cibcInput,
          button({ id: 'parse-cibc-btn', class: 'apply-btn', onclick: parseData(cibcInput, parseCIBC, 'cibc') }, 'Preview')
        ),
        Tab('CSV',
          div({ class: 'csv-import-container' },
            div({ class: 'csv-header-example' },
              p('date,merchant,amount,category,tags')
            ),
            csvInput,
          ),
          button({ id: 'parse-csv-btn', class: 'apply-btn', onclick: parseData(csvInput, parseCSV) }, 'Preview')
        ),
        parsedTransactionsContainer,
      )
    );

    return modal;
  };

  // Set up the import button
  const importBtn = document.getElementById('import-transaction');
  if (importBtn) {
    importBtn.onclick = () => openImportModal.val = true;
  }

  // Create New Transaction Modal Logic (unchanged)
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
      const newTransaction: NewTransaction = {
        occurredAt: (document.getElementById('new-transaction-date') as HTMLInputElement).value,
        merchant: (document.getElementById('new-transaction-merchant') as HTMLInputElement).value,
        amount: parseFloat((document.getElementById('new-transaction-amount') as HTMLInputElement).value),
        personName: (document.getElementById('new-transaction-person') as HTMLInputElement).value,
        card: (document.getElementById('new-transaction-card') as HTMLInputElement).value,
        category: (document.getElementById('new-transaction-category') as HTMLSelectElement).value,
        tags: (document.getElementById('new-transaction-tags') as HTMLInputElement).value.split(',').map(tag => tag.trim()).filter(t => t),
        currency: 'CAD', // Default currency
      };

      addTransactions([newTransaction]).then(() => {
        createNewTransactionModal.style.display = 'none';
        // TODO: Clear form fields
      });
    }

    van.derive(() => {
      categoryDropdown.innerHTML = '';
      categories.val.forEach(category => {
        van.add(categoryDropdown, option({ value: category }, category));
      });
    });
  }

  return [openImportModal, ImportModalComponent];
}