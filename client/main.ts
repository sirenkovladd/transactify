import van from "vanjs-core";
import { setupAdding } from "./adding.ts";
import { convertTransaction, error, filteredTransactions, loading, loggedIn, token } from './common.ts';
import { setupFilters } from "./filter.ts";
import { setupGroup } from "./group.ts";
import { openTagModal, setupTagModal } from "./tags.ts";

declare const Chart: any;

const { div, span } = van.tags;

function setupStats() {
  const summaryContent = document.getElementById('summary-content');
  const categoryChartCanvas = document.getElementById('category-chart') as HTMLCanvasElement;
  const tagsChartCanvas = document.getElementById('tags-chart') as HTMLCanvasElement;
  const personChartCanvas = document.getElementById('person-chart') as HTMLCanvasElement;

  if (!summaryContent || !categoryChartCanvas || !tagsChartCanvas || !personChartCanvas) {
    return;
  }

  let categoryChart: any;
  let tagsChart: any;
  let personChart: any;

  const createPieChart = (canvas: HTMLCanvasElement, data: any, label: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    return new Chart(ctx, {
      type: 'pie',
      data: {
        labels: Object.keys(data),
        datasets: [{
          label: label,
          data: Object.values(data),
          backgroundColor: [
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
            'rgba(153, 102, 255, 0.8)',
            'rgba(255, 159, 64, 0.8)',
            'rgba(199, 199, 199, 0.8)',
            'rgba(83, 109, 254, 0.8)',
            'rgba(40, 180, 99, 0.8)',
            'rgba(244, 67, 54, 0.8)',
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          title: {
            display: false,
          }
        }
      }
    });
  };

  const updateChart = (chart: any, data: any) => {
    if (!chart) return;
    chart.data.labels = Object.keys(data);
    chart.data.datasets[0].data = Object.values(data);
    chart.update();
  };

  van.derive(() => {
    const transactions = filteredTransactions.val;

    // Summary
    const totalTransactions = transactions.length;
    const totalAmount = transactions.reduce((sum, tr) => sum + tr.amount, 0);
    const averageAmount = totalTransactions > 0 ? totalAmount / totalTransactions : 0;

    summaryContent.innerHTML = '';
    van.add(summaryContent,
      div({ class: 'summary-item' }, span({ class: 'label' }, 'Total Transactions:'), span({ class: 'value' }, totalTransactions)),
      div({ class: 'summary-item' }, span({ class: 'label' }, 'Total Amount:'), span({ class: 'value' }, `${totalAmount.toFixed(2)}`)),
      div({ class: 'summary-item' }, span({ class: 'label' }, 'Average Amount:'), span({ class: 'value' }, `${averageAmount.toFixed(2)}`))
    );

    // Category data
    const categoryData = transactions.reduce((acc, tr) => {
      acc[tr.category] = (acc[tr.category] || 0) + Math.abs(tr.amount);
      return acc;
    }, {} as Record<string, number>);

    // Tags data
    const tagsData = transactions.reduce((acc, tr) => {
      if (tr.tags.length === 0) {
        acc['Untagged'] = (acc['Untagged'] || 0) + Math.abs(tr.amount);
      } else {
        tr.tags.forEach(tag => {
          acc[tag] = (acc[tag] || 0) + Math.abs(tr.amount);
        });
      }
      return acc;
    }, {} as Record<string, number>);

    // Person data
    const personData = transactions.reduce((acc, tr) => {
      acc[tr.personName] = (acc[tr.personName] || 0) + Math.abs(tr.amount);
      return acc;
    }, {} as Record<string, number>);

    if (!categoryChart) {
      categoryChart = createPieChart(categoryChartCanvas, categoryData, 'By Category');
    } else {
      updateChart(categoryChart, categoryData);
    }

    if (!tagsChart) {
      tagsChart = createPieChart(tagsChartCanvas, tagsData, 'By Tags');
    } else {
      updateChart(tagsChart, tagsData);
    }

    if (!personChart) {
      personChart = createPieChart(personChartCanvas, personData, 'By Person');
    } else {
      updateChart(personChart, personData);
    }
  });
}

async function login(username, password) {
  const loginError = document.getElementById('login-error');
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
  } catch (error) {
    loginError.textContent = error.message;
  }
}

function setupLogin() {
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = (document.getElementById('username') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;
    login(username, password);
  });
}

function main() {
  const loginContainer = document.getElementById('login-container');
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
