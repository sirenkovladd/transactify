import van from "vanjs-core";
import { addTransactions, categories, type NewTransaction } from './common.ts';

const { div, span, p, h3, strong, table, thead, tbody, tr, th, td, input, button, option, select } = van.tags;

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

function parseCIBC(data: string): any[] {
  // TODO
  return [
    { datetime: '2024-01-03T14:00:00', merchant: 'CIBC Merchant 1', amount: 300, category: 'Category 1', tags: '' },
    { datetime: '2024-01-04T15:00:00', merchant: 'CIBC Merchant 2', amount: 400, category: 'Category 3', tags: 'tag4' },
  ];
}

const categoriesMap: Record<string, string[]> = {
  "mobile internet": ["KOODO AIRTIME", "KOODO MOBILE"],
  "internet": ["NOVUS"],
  "food & other": ["SAVE ON FOODS", "URBAN FARE", "NOFRILLS JOTI'S", "BC LIQUOR", "LENA MARKET", "WHOLE FOODS", "JASMINE HALAL MEATS AND M", "EAST WEST MARKET", "PIAST BAKERY", "POLO FARMERS MARKET 2", "ORGANIC ACRES MARKET", "MARKET MEATS KITSILAN", "SEVEN SEAS FISH MARKET ON", "LITTLE GEM GROCERY", "TOP TEN PRODUCE", "BERRYMOBILE", "LEGACY LIQUOR STORE", "VALHALLA PURE OUTFITTERS", "OSYOOS PRODUCE", "SQ *OH SWEET DAY BAKE SH", "Body Energy Club", "Aburi Market"],
  "takeouts": ["BIG DADDY'S FISH FRY", "STARBUCKS", "LA DIPERIE", "MR. SUSHI MAIN STREET", "FOGLIFTER COFFEE ROASTERS", "STEGA EATERY", "THE WATSON", "BEST FALAFEL", "DOORDASHFATBURGER", "OPHELIA", "CANUCKS SPORTS", "Matchstick Riley Park", "PNE FOOD & BEVERAGE", "HUNNYBEE", "PUREBREAD BAKERY", "CULTIVATE TEA", "COMMODORE BALLROOM", "SUPERFLUX (CABANA)", "IRISH TIMES PUB", "THE BENT MAST RESTAURANT", "CRUST BAKERY", "TERRAZZO", "10 ACRES", "THE FISH STORE AT FISHER", "Old Country Market", "BARKLEY CAFE", "RHINO COFFEE HOUSE", "SQ *#B33R", "PLEASE BEVERAGE", "Small Victory Bakery", "VIA TEVERE MAIN ST", "BEAUCOUP BAKERY AND C", "Sq *Thierry Mt. Pleasant", "Holy Eucharist Cathed", "KOZAK"],
  "transportation": ["LYFT", "COMPASS WEB", "UBER", "COMPASS WALK", "COMPASS ACCOUNT", "BC TRANSIT", "COMPASS AUTOLOAD", "BCF - ONLINE SALES", "BC, SPIRIT OF", "BCF-CUSTOMER SERVICE CENT"],
  "clothes": ["Bailey Nelson", "THE ROCKIN COWBOY", "WINNERSHOMESENSE", "SP KOTN", "TOFINO PHARMACY", "Lamaisonsimons"],
  "health": ["COASTAL EYE CLINIC"],
  "home goods": ["CANADIAN TIRE", "AMAZON*", "AMAZON.COM *", "YOUR DOLLAR STORE", "VALUE VILLAGE", "MICHAELS", "Amazon.ca", "DOLLARAMA", "SALARMY", "BLUMEN FLORALS", "HCM*CARSON BOOKS INC", "Hetzner Online Gmbh", "Smart N Save", "The Best Shop", "Popeyes"],
  "presents": ["PET VALU CANADA INC.", "APPLE.COM/CA", "SP DBCANADA"],
  "haircut": ["KONAS BARBER SHOP"],
  "donations": [],
  "therapy": [],
  "english": [],
  "french": ["Preply"],
  "events": ["TICKETLEADER", "SEATGEEK TICKETS", "ROYAL BC MUSEUM", "FOX CABARET", "BOUNCE* TICKET", "Cineplex", "Eventbrite"],
  "travel": ["VIA RAIL/ZAW99N", "AIR CAN*", "BOOKING.COM", "Wb E-Store"],
  "london drugs": ["LONDON DRUGS", "SHOPPERS DRUG"],
  "taxAccountant": ["LILICO"],
  "film": ["Amazon Channels", "PrimeVideo"],
  "hotel": ["Hotel at"],
  "visa": ["Ups"],
};

function getCategory(merchant: string): string {
  for (const category in categoriesMap) {
    for (const pattern of categoriesMap[category]) {
      if (merchant.toLowerCase().includes(pattern.toLowerCase())) {
        return category;
      }
    }
  }
  return "Unknown";
}

function parseWealthsimple(data: string): any[] {
  const payload = JSON.parse(data);

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

function renderParsedTransactions(data: any[], container: HTMLElement, card?: string) {
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
          const importModal = document.getElementById('import-modal');
          if (importModal) {
            importModal.style.display = 'none';
          }
          container.innerHTML = ''; // Clear the parsed transactions
        });
      }
    }
  }, 'Save Imported Transactions');

  van.add(container, div(allTagsInput, addTagButton), transactionTable, div(saveButton));
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
    // TODO add scan receipt

    const parseData = (parser: (data: string) => any[], card?: string) => {
      return () => {
        const inputId = parser.name.replace('parse', '').toLowerCase() + '-input';
        const input = document.getElementById(inputId) as HTMLTextAreaElement;
        if (input && parsedTransactionsContainer) {
          const data = input.value;
          const parsedData = parser(data);
          renderParsedTransactions(parsedData, parsedTransactionsContainer, card);
        }
      }
    }

    if (parseCSVBtn) {
      parseCSVBtn.onclick = parseData(parseCSV);
    }
    if (parseCIBCBtn) {
      parseCIBCBtn.onclick = parseData(parseCIBC, 'cibc');
    }
    if (parseWealthsimpleBtn) {
      parseWealthsimpleBtn.onclick = parseData(parseWealthsimple, 'wealthsimple');
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
}