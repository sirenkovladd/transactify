import van from "vanjs-core";
import { convertTransaction, filteredTransactions, groupedOption, groupedOptions, type Transaction } from './common.ts';

const { div, h3, details, summary } = van.tags;

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

export function setupGroup() {
  const groupedContent = document.getElementById("grouped-content");
  if (groupedContent) {
    const groupedOptionsEl = document.querySelector(".grouped-options");
    if (groupedOptionsEl) {
      van.add(groupedOptionsEl, Object.keys(groupedOptions).map(o => {
        const option = div({ class: "option" }, o);
        option.addEventListener('click', () => {
          document.querySelectorAll('.grouped-options .option').forEach(opt => opt.classList.remove('active'));
          option.classList.add('active');
          groupedOption.val = o as keyof typeof groupedOptions;

          // const existingContent = groupedContent.querySelector('#grouped-by-content');
          // if (existingContent) {
          //   existingContent.remove();
          // }
        });
        return option;
      }))
      van.add(groupedContent, div({ id: 'grouped-by-content' }, () => {
        const grouped = groupTransactions(filteredTransactions.val, groupedOptions[groupedOption.val]);
        const content = div();
        for (const key in grouped) {
          const total = grouped[key]?.reduce((acc, tr) => acc + tr.amount, 0) || 0;
          van.add(content, details(
            summary(h3(`${key} - $${total.toFixed(2)}`)),
            div(grouped[key]?.map(convertTransaction) || [])
          ));
        }
        return content;
      }));
    }
  }
}