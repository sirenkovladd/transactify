import van from "vanjs-core";
import { setupAdding } from "./adding.ts";
import { convertTransaction, error, filteredTransactions, loading } from './common.ts';
import { setupFilters } from "./filter.ts";
import { setupGroup } from "./group.ts";
import { openTagModal, setupTagModal } from "./tags.ts";

const { div, span } = van.tags;

function main() {

  const list = document.getElementsByClassName("transactions-list")[0]
  if (list) {
    van.add(list, () => {
      if (loading.val) {
        return div("Loading...")
      }
      if (error.val) {
        return div(error.val)
      }
      return div(filteredTransactions.val.map(convertTransaction))
    })
  }

  const transactionsActions = document.querySelector('.transactions-actions');
  if (transactionsActions) {
    van.add(transactionsActions,
      span({
        class: 'add-tag-btn',
        onclick: () => {
          const ids = filteredTransactions.val.map(t => t.id);
          if (ids.length > 0) {
            openTagModal(ids, 'Add Tag to All Filtered');
          } else {
            alert('No transactions to tag.');
          }
        }
      }, '+ Add Tag to All Filtered')
    );
  }

  // Main tabs logic
  const mainTabs = document.querySelectorAll('.main-tab');
  const mainTabContents = document.querySelectorAll('.main-tab-content');

  mainTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      mainTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      mainTabContents.forEach(content => {
        if (content.id === `${tab.getAttribute('data-tab')}-content`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });

  // Modal logic
  const modal = document.getElementById('transaction-modal');
  const closeButton = document.getElementsByClassName('close-button')[0] as HTMLElement;

  if (modal && closeButton) {
    const closeModal = () => {
      modal.style.display = 'none';
    };

    closeButton.onclick = closeModal;

    window.onclick = (event) => {
      if (event.target == modal) {
        closeModal();
      }
    };
  }
  setupAdding();
  setupFilters();
  setupGroup();
  setupTagModal();
}

document.addEventListener("DOMContentLoaded", main);