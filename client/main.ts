import van from "vanjs-core";
import { setupAdding } from "./adding.ts";
import { convertTransaction, error, filteredTransactions, loading, loggedIn, token } from './common.ts';
import { setupFilters } from "./filter.ts";
import { setupGroup } from "./group.ts";
import { setupStats } from "./stats.ts";
import { openTagModal, setupTagModal } from "./tags.ts";

const { div, span } = van.tags;

async function login(username: string, password: string) {
  const loginError = document.getElementById('login-error')!;
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }
    const data = await response.json();
    token.val = data.token;
    loginError.textContent = '';
  } catch (error: any) {
    loginError.textContent = error.message;
  }
}

function setupLogin() {
  const loginForm = document.getElementById('login-form');
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = (document.getElementById('username') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;
    login(username, password);
  });
}

function main() {
  const loginContainer = document.getElementById('login-container') as HTMLElement;
  const pageContainer = document.querySelector('.page-container') as HTMLElement;

  van.derive(() => {
    if (loggedIn.val) {
      loginContainer.style.display = 'none';
      pageContainer.style.display = 'flex';
    } else {
      loginContainer.style.display = 'flex';
      pageContainer.style.display = 'none';
    }
  });

  // add login
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
  setupStats();
  setupLogin();
}

document.addEventListener("DOMContentLoaded", main);
