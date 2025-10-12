import van from "vanjs-core";
import { transactionPopup } from "./popup";

const { div, span, p, h3, strong } = van.tags;

export type Transaction = {
  id: number;
  category: string;
  merchant: string;
  personName: string;
  amount: number;
  occurredAt: string;
  card: string;
  tags: string[];
  details?: string;
  photos?: string[];
}

export const transactions = van.state<Transaction[]>([])
export const categories = van.state<string[]>([]);
export const merchants = van.derive(() => [...new Set(transactions.val.map(t => t.merchant))]);
export const cards = van.derive(() => [...new Set(transactions.val.map(t => t.card))]);
export const persons = van.derive(() => [...new Set(transactions.val.map(t => t.personName))]);
export const tags = van.derive(() => [...new Set(transactions.val.flatMap(t => t.tags))]);
export const error = van.state('');
export const loading = van.state(true);

// Filter states
export const amountFilter = van.state({ min: 0, max: 1000 });
export const dateStartFilter = van.state('2023-01-01');
export const dateEndFilter = van.state(new Date().toISOString().split('T')[0] as string);
export const merchantFilter = van.state<string[]>([]);
export const cardFilter = van.state<string[]>([]);
export const personFilter = van.state<string[]>([]);
export const categoryFilter = van.state<string[]>([]);
export const tagFilter = van.state<string[]>([]);
export const groupedOption = van.state<keyof typeof groupedOptions>('category');
export const minDate = van.state<string | null>(null);
export const maxDate = van.state<string | null>(null);

const delayedAmountFilter = van.state(amountFilter.rawVal);
van.derive(() => {
  const amount = amountFilter.val;
  setTimeout(() => {
    delayedAmountFilter.val = amount;
  }, 50);
});

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
  loading.val = true;
  error.val = '';
  try {
    const [transactionsResponse, categoriesResponse] = await Promise.all([
      fetch("/api/transactions"),
      fetch("/api/categories")
    ]);

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

fetchTransactions();


van.derive(() => {
  const transactionsList = transactions.val;
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
    const maxDateStr = endDate.toISOString().split('T')[0] as string;
    minDate.val = minDateStr;
    maxDate.val = maxDateStr;
    dateStartFilter.val = minDateStr;
    dateEndFilter.val = maxDateStr;
    amountFilter.val = { min: 0, max: maxAmount };
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

export function convertTransaction(tr: Transaction) {
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

  card.addEventListener('click', () => transactionPopup(tr));

  return card;
}