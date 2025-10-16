import van, { type State } from "vanjs-core";

const { div, span, p, h3, strong } = van.tags;

export type Transaction = {
  id: number;
  category: string;
  merchant: string;
  personName: string;
  amount: number;
  currency: string;
  occurredAt: string;
  card: string;
  tags: string[];
  details?: string;
  photos?: string[];
}

export const loggedIn = van.state(!!localStorage.getItem('token'));
export const token = van.state(localStorage.getItem('token') || '');

van.derive(() => {
  if (token.val) {
    localStorage.setItem('token', token.val);
  } else {
    localStorage.removeItem('token');
  }
  loggedIn.val = !!token.val;
});

const params = new URLSearchParams(window.location.search);

const amountMin = params.get('amountMin');
const amountMax = params.get('amountMax');

export const transactions = van.state<Transaction[]>([])
export const categories = van.state<string[]>([]);
export const categoriesFromTransaction = van.derive(() => [...new Set(transactions.val.map(t => t.category))]);
export const merchants = van.derive(() => [...new Set(transactions.val.map(t => t.merchant))]);
export const cards = van.derive(() => [...new Set(transactions.val.map(t => t.card))]);
export const persons = van.derive(() => [...new Set(transactions.val.map(t => t.personName))]);
export const tags = van.derive(() => [...new Set(transactions.val.flatMap(t => t.tags))]);
export const error = van.state('');
export const loading = van.state(true);

// Filter states
export const amountFilter = van.state({ min: amountMin ? Number(amountMin) : 0, max: amountMax ? Number(amountMax) : 0 });
export const dateStartFilter = van.state(params.get('dateStart') || '2023-01-01');
export const dateEndFilter = van.state(params.get('dateEnd') || new Date().toISOString().split('T')[0] as string);
export const merchantFilter = van.state<string[]>(params.has('merchants') ? params.get('merchants')!.split(',') : []);
export const cardFilter = van.state<string[]>(params.has('cards') ? params.get('cards')!.split(',') : []);
export const personFilter = van.state<string[]>(params.has('persons') ? params.get('persons')!.split(',') : []);
export const categoryFilter = van.state<string[]>(params.has('categories') ? params.get('categories')!.split(',') : []);
export const tagFilter = van.state<string[]>(params.has('tags') ? params.get('tags')!.split(',') : []);
export const groupedOption = van.state<keyof typeof groupedOptions>(params.get('groupBy') as keyof typeof groupedOptions || 'category');
export const activeTab = van.state(params.get('tab') || 'grouped');
export const minDate = van.state<string | null>(null);
export const maxDate = van.state<string | null>(null);

const delayedAmountFilter = van.state(amountFilter.rawVal);
van.derive(() => {
  const amount = amountFilter.val;
  setTimeout(() => {
    delayedAmountFilter.val = amount;
  }, 50);
});

export type NewTransaction = Omit<Transaction, 'id' | 'photos'>;

export async function addTransactions(newTransactions: NewTransaction[]) {
  if (!token.val) {
    error.val = 'Not logged in';
    return;
  }
  try {
    const response = await fetch('/api/transactions/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.val}`
      },
      body: JSON.stringify(newTransactions)
    });

    if (response.status === 401) {
      token.val = '';
      error.val = 'Session expired. Please log in again.';
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add transactions: ${errorText}`);
    }

    await fetchTransactions(); // Refresh the transaction list
  } catch (e: any) {
    error.val = e.message;
  }
}

export const filteredTransactions = van.derive(() => {
  return transactions.val.filter(tr => {
    const occurredDate = new Date(tr.occurredAt);
    const startDate = dateStartFilter.val ? new Date(dateStartFilter.val) : null;
    const endDate = dateEndFilter.val ? new Date(dateEndFilter.val) : null;

    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    const amount = Math.abs(tr.amount);

    return (
      amount >= delayedAmountFilter.val.min && amount <= delayedAmountFilter.val.max &&
      (!startDate || occurredDate >= startDate) &&
      (!endDate || occurredDate <= endDate) &&
      (merchantFilter.val.length === 0 || merchantFilter.val.includes(tr.merchant)) &&
      (cardFilter.val.length === 0 || cardFilter.val.includes(tr.card)) &&
      (personFilter.val.length === 0 || personFilter.val.includes(tr.personName)) &&
      (categoryFilter.val.length === 0 || categoryFilter.val.includes(tr.category)) &&
      (tagFilter.val.length === 0 || tagFilter.val.every(tag => tr.tags.includes(tag)))
    );
  });
});


export async function fetchTransactions() {
  if (!token.val) {
    transactions.val = [];
    categories.val = [];
    return;
  }
  loading.val = true;
  error.val = '';
  try {
    const headers = {
      'Authorization': `Bearer ${token.val}`
    };
    const [transactionsResponse, categoriesResponse] = await Promise.all([
      fetch("/api/transactions", { headers }),
      fetch("/api/categories", { headers })
    ]);

    if (transactionsResponse.status === 401 || categoriesResponse.status === 401) {
      token.val = '';
      return;
    }

    if (!transactionsResponse.ok) {
      throw new Error('Failed to fetch transactions');
    }
    if (!categoriesResponse.ok) {
      throw new Error('Failed to fetch categories');
    }

    const transactionsData = await transactionsResponse.json();
    transactions.val = transactionsData;

    const categoriesData = await categoriesResponse.json();
    categories.val = categoriesData;

  } catch (e: any) {
    error.val = e.message;
  } finally {
    loading.val = false;
  }
}

van.derive(() => {
  if (loggedIn.val) {
    fetchTransactions();
  }
});

let blockUrlUpdate = true;

function updateUrl() {
  if (blockUrlUpdate) return;

  const params = new URLSearchParams();

  if (dateStartFilter.val !== minDate.val) {
    params.set('dateStart', dateStartFilter.val);
  }
  if (dateEndFilter.val !== maxDate.val) {
    params.set('dateEnd', dateEndFilter.val);
  }

  if (amountFilter.val.min > 0) {
    params.set('amountMin', amountFilter.val.min.toString());
  }
  params.set('amountMax', amountFilter.val.max.toString());

  if (merchantFilter.val.length > 0) params.set('merchants', merchantFilter.val.join(','));
  if (cardFilter.val.length > 0) params.set('cards', cardFilter.val.join(','));
  if (personFilter.val.length > 0) params.set('persons', personFilter.val.join(','));
  if (categoryFilter.val.length > 0) params.set('categories', categoryFilter.val.join(','));
  if (tagFilter.val.length > 0) params.set('tags', tagFilter.val.join(','));

  if (groupedOption.val !== 'category') {
    params.set('groupBy', groupedOption.val);
  }
  if (activeTab.val !== 'grouped') {
    params.set('tab', activeTab.val);
  }

  const query = params.toString();
  const newPath = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  if (location.href !== newPath) {
    history.pushState({}, '', newPath);
  }
}

van.derive(() => {
  amountFilter.val;
  dateStartFilter.val;
  dateEndFilter.val;
  merchantFilter.val;
  cardFilter.val;
  personFilter.val;
  categoryFilter.val;
  tagFilter.val;
  groupedOption.val;
  activeTab.val;
  minDate.val;
  maxDate.val;
  updateUrl();
});

let initialSetupDone = false;
van.derive(() => {
  if (initialSetupDone) return;
  const transactionsList = transactions.val;
  if (transactionsList.length === 0) return;
  const first = transactionsList[0];
  if (first) {
    let endDate = new Date(first.occurredAt);
    let startDate = endDate;
    let maxAmount = Math.abs(first.amount);
    for (const transaction of transactionsList) {
      const transactionDate = new Date(transaction.occurredAt);
      if (transactionDate < startDate) {
        startDate = transactionDate;
      }
      if (transactionDate > endDate) {
        endDate = transactionDate;
      }
      const amount = Math.abs(transaction.amount);
      if (amount > maxAmount) {
        maxAmount = amount;
      }
    }
    const minDateStr = startDate.toISOString().split('T')[0] as string;
    const maxDateStr = new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] as string;
    minDate.val = minDateStr;
    maxDate.val = maxDateStr;
    dateStartFilter.val = minDateStr;
    dateEndFilter.val = maxDateStr;
    amountFilter.val = { min: 0, max: maxAmount };

    initialSetupDone = true;
    blockUrlUpdate = false;
  }
})

export function formatOccurredAt(dateString: string): string {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  };
  return date.toLocaleString('en-CA', options);
}

export function getIcon(category: string) {
  switch (category) {
    case "mobile internet":
      return "📱";
    case "internet":
      return "🌐";
    case "food & other":
      return "🛒";
    case "takeouts":
      return "🍔";
    case "transportation":
      return "🚇";
    case "clothes":
      return "👕";
    case "health":
      return "💊";
    case "home goods":
      return "🏡";
    case "presents":
      return "🎁";
    case "haircut":
      return "✂️";
    case "donations":
      return "❤️";
    case "therapy":
      return "🛋️";
    case "english":
      return "🇬🇧";
    case "french":
      return "🇫🇷";
    case "events":
      return "🎟️";
    case "travel":
      return "✈️";
    case "london drugs":
      return "💄";
    case "taxAccountant":
      return "🧾";
    case "film":
      return "🎬";
    case "hotel":
      return "🏨";
    case "visa":
      return "💳";
    default:
      return "🛍️";
  }
}


function getStartOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

export const groupedOptions = {
  category: (tr: Transaction) => tr.category,
  day: (tr: Transaction) => new Date(tr.occurredAt).toISOString().split('T')[0] as string,
  week: (tr: Transaction) => getStartOfWeek(new Date(tr.occurredAt)).toISOString().split('T')[0] as string,
  biweekly: (tr: Transaction) => {
    const date = new Date(tr.occurredAt);
    const weekNumber = Math.floor((date.getDate() - 1) / 14) + 1;
    return `${date.getFullYear()}-W${weekNumber}`;
  },
  month: (tr: Transaction) => new Date(tr.occurredAt).toISOString().slice(0, 7),
  "half year": (tr: Transaction) => `${new Date(tr.occurredAt).getFullYear()}-H${Math.floor(new Date(tr.occurredAt).getMonth() / 6) + 1}`,
  year: (tr: Transaction) => new Date(tr.occurredAt).getFullYear().toString(),
  tags: (tr: Transaction) => tr.tags,
  people: (tr: Transaction) => tr.personName,
};

export function convertTransaction(tr: Transaction, transactionModal: State<Transaction | null>) {
  const card = div({ class: "transaction-card" }, [
    div({ class: "card-header" }, [
      span({ class: "category-icon" }, getIcon(tr.category)),
      div({ class: "transaction-info" }, [
        h3({ class: "merchant-name" }, tr.merchant),
        p({ class: "person-name" }, tr.personName),
      ]),
      div({ class: "transaction-amount" }, [
        span({ class: "amount" }, `$${tr.amount}`),
        span({ class: "date" }, formatOccurredAt(tr.occurredAt)),
      ]),
    ]),
    div({ class: "card-details" }, [
      p(strong('Картка: '), tr.card),
      p(strong('Категорія: '), tr.category),
    ]),
    div({ class: "tags" }, tr.tags.map((tag) => span({ class: "tag" }, `#${tag}`))),
  ]);

  card.addEventListener('click', () => {
    transactionModal.val = tr;
  });

  return card;
}

export async function getTokens() {
  if (!token.val) return [];
  try {
    const response = await fetch('/api/sharing/tokens', {
      headers: { 'Authorization': `Bearer ${token.val}` }
    });
    if (response.status === 401) {
      token.val = '';
      return [];
    }
    if (!response.ok) throw new Error('Failed to get tokens');
    return await response.json();
  } catch (e: any) {
    error.val = e.message;
    return [];
  }
}

export async function generateToken() {
  if (!token.val) return;
  try {
    const response = await fetch('/api/sharing/token', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token.val}` }
    });
    if (response.status === 401) {
      token.val = '';
      return;
    }
    if (!response.ok) throw new Error('Failed to generate token');
  } catch (e: any) {
    error.val = e.message;
  }
}

export async function revokeToken(tokenToRevoke: string) {
  if (!token.val) return;
  try {
    const response = await fetch('/api/sharing/token/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.val}`
      },
      body: JSON.stringify({ token: tokenToRevoke })
    });
    if (response.status === 401) {
      token.val = '';
      return;
    }
    if (!response.ok) throw new Error('Failed to revoke token');
  } catch (e: any) {
    error.val = e.message;
  }
}

export type Subscription = {
  PersonName: string;
  EncryptedUserID: string;
}

export async function getSubscriptions() {
  if (!token.val) return { subscribers: [], subscriptions: [] };
  try {
    const headers = { 'Authorization': `Bearer ${token.val}` };
    const [subscriptionsResponse, subscribersResponse] = await Promise.all([
      fetch('/api/sharing/subscriptions', { headers }),
      fetch('/api/sharing/connections', { headers }) // This endpoint returns who is subscribed to me
    ]);

    if (subscriptionsResponse.status === 401 || subscribersResponse.status === 401) {
      token.val = '';
      return { subscribers: [], subscriptions: [] };
    }

    if (!subscriptionsResponse.ok) throw new Error('Failed to get subscriptions');
    if (!subscribersResponse.ok) throw new Error('Failed to get subscribers');

    const subscriptionsData: Subscription[] = await subscriptionsResponse.json();
    const subscribersData: string[] = await subscribersResponse.json();

    return { subscriptions: subscriptionsData, subscribers: subscribersData };
  } catch (e: any) {
    error.val = e.message;
    return { subscribers: [], subscriptions: [] };
  }
}

export async function addConnection(connectionToken: string) {
  if (!token.val) return;
  try {
    const response = await fetch('/api/sharing/connections/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.val}`
      },
      body: JSON.stringify({ token: connectionToken })
    });
    if (response.status === 401) {
      token.val = '';
      return;
    }
    if (!response.ok) throw new Error('Failed to add connection');
  } catch (e: any) {
    error.val = e.message;
  }
}

export async function unsubscribe(encryptedUserId: string) {
  if (!token.val) return;
  try {
    const response = await fetch('/api/sharing/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.val}`
      },
      body: JSON.stringify({ encryptedUserId })
    });
    if (response.status === 401) {
      token.val = '';
      return;
    }
    if (!response.ok) throw new Error('Failed to unsubscribe');
  } catch (e: any) {
    error.val = e.message;
  }
}
