import van from "vanjs-core";
import { convertTransaction, fetchTransactions, filteredTransactions, groupedOption, groupedOptions, type Transaction } from './common.ts';
import { openTagModal } from "./tags.ts";

const { div, h3, details, summary, span } = van.tags;

function groupTransactions(transactions: Transaction[], keyExtractor: (tr: Transaction) => string | string[]) {
  const grouped: Record<string, Transaction[]> = {};
  for (const tr of transactions) {
    const key = keyExtractor(tr);
    if (Array.isArray(key)) {
      for (const k of key) {
        if (!grouped[k]) {
          grouped[k] = [];
        }
        grouped[k].push(tr);
      }
    } else {
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(tr);
    }
  }
  return grouped;
}

function getCommonTags(transactions: Transaction[]): string[] {
  if (!transactions || transactions.length === 0) {
    return [];
  }
  const tagCounts: Record<string, number> = {};
  for (const tr of transactions) {
    // Ensure tr.tags is an array
    const tags = Array.isArray(tr.tags) ? tr.tags : [];
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const commonTags: string[] = [];
  for (const tag in tagCounts) {
    if (tagCounts[tag] === transactions.length) {
      commonTags.push(tag);
    }
  }
  return commonTags;
}

async function manageGroupTags(transactionIDs: number[], tag: string, action: 'add' | 'remove') {
  try {
    const response = await fetch('/api/transactions/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_ids: transactionIDs, tag, action }),
    });
    if (!response.ok) {
      throw new Error('Failed to update tags');
    }
    fetchTransactions(); // Refresh data
  } catch (err) {
    console.error(err);
    alert('Error updating tags.');
  }
}

export function setupGroup() {
  const groupedContent = document.getElementById("grouped-content");
  if (groupedContent) {
    const groupedOptionsEl = document.querySelector(".grouped-options");
    if (groupedOptionsEl) {
      van.add(groupedOptionsEl, Object.keys(groupedOptions).map(o => {
        return div({
          class: () => `option${groupedOption.val === o ? ' active' : ''}`,
          onclick: () => { groupedOption.val = o as keyof typeof groupedOptions; }
        }, o);
      }))
      van.add(groupedContent, div({ id: 'grouped-by-content' }, () => {
        const grouped = groupTransactions(filteredTransactions.val, groupedOptions[groupedOption.val]);
        const content = div();
        for (const key in grouped) {
          const transactions = grouped[key] || [];
          const total = transactions.reduce((acc, tr) => acc + tr.amount, 0);
          const commonTags = getCommonTags(transactions);
          const transactionIDs = transactions.map(t => t.id);

          van.add(content, details(
            summary(
              h3(`${key} - ${total.toFixed(2)}`),
              div({ class: 'summary-tags' },
                ...commonTags.map(tag =>
                  span({ class: 'group-tag' },
                    tag,
                    span({
                      class: 'remove-tag-btn',
                      onclick: (e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm(`Remove tag "${tag}" from all transactions in this group?`)) {
                          manageGroupTags(transactionIDs, tag, 'remove');
                        }
                      }
                    }, '×')
                  )
                ),
                span({
                  class: 'add-tag-btn',
                  onclick: (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openTagModal(transactionIDs, `Add Tag to ${key}`);
                  }
                }, '+ Tag')
              )
            ),
            div(transactions.map(convertTransaction))
          ));
        }
        return content;
      }));
    }
  }
}