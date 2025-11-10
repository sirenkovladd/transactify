import van, { type State } from "vanjs-core";
import { setupAdding } from "./adding.ts";
import { openCategoryModal, setupCategoryModal } from "./category.ts";
import { activeTab, convertTransaction, error, filteredTransactions, loading, loggedIn, type Transaction } from './common.ts';
import { setupFilters } from "./filter.ts";
import { setupGroup } from "./group.ts";
import { Login } from "./login.ts";
import { setupTransactionPopup } from "./popup.ts";
import { renderSharingSettings } from "./sharing.ts";
import { setupStats } from "./stats.ts";
import { openTagModal, setupTagModal } from "./tags.ts";

const { div, span, aside, input, h2, label, button, main, h3, canvas } = van.tags;

function setupSharingModal() {
  const sharingModal = document.getElementById('sharing-modal') as HTMLElement;
  const sharingBtn = document.getElementById('sharing-btn') as HTMLElement;
  const sharingCloseButton = sharingModal?.getElementsByClassName('close-button')[0] as HTMLElement;
  const sharingSettingsContent = document.getElementById('sharing-settings-content') as HTMLElement;

  if (sharingModal && sharingBtn && sharingCloseButton && sharingSettingsContent) {
    sharingBtn.onclick = () => {
      sharingModal.style.display = 'block';
      renderSharingSettings(sharingSettingsContent);
    }

    sharingCloseButton.onclick = () => {
      sharingModal.style.display = 'none';
    }

    window.onclick = (event) => {
      if (event.target == sharingModal) {
        sharingModal.style.display = 'none';
      }
    };
  }
}

function MobileFilter() {
  return div({ class: 'mobile-filter' },
    h2('Фільтри'),
    div({ class: 'filter-group' },
      label('Сума:'),
      div({ class: 'amount-filter-inputs' },
        input({ id: 'amount-min-mobile', placeholder: 'Min', type: 'number' }),
        span('-'),
        input({ id: 'amount-max-mobile', placeholder: 'Max', type: 'number' })
      ),
      div({ class: 'double-slider-container', id: 'double-slider-mobile' },
        div({ class: 'double-slider-track' }),
        div({ class: 'double-slider-range', id: 'double-slider-range-mobile' }),
        div({ class: 'double-slider-thumb', id: 'thumb-min-mobile' }),
        div({ class: 'double-slider-thumb', id: 'thumb-max-mobile' })
      ),
    ),
    div({ class: 'filter-group' },
      label('Дата:'),
      div({ class: 'date-range-container', id: "date-range-mobile" },
        input({ type: 'text', class: 'date-input', name: 'start', placeholder: 'From' }),
        span('-'),
        input({ type: 'text', class: 'date-input', name: 'end', placeholder: 'To' })
      ),
    ),
    div({ class: 'filter-group' },
      label({ for: 'merchant-mobile' }, 'Мерчант:'),
      div({ id: 'merchant-mobile', class: 'multi-select-container' }),
    ),
    div({ class: 'filter-group' },
      label({ for: 'card-mobile' }, 'Картка:'),
      div({ id: 'card-mobile', class: 'multi-select-container' }),
    ),
    div({ class: 'filter-group' },
      label({ for: 'person-mobile' }, 'Ім\'я:'),
      div({ id: 'person-mobile', class: 'multi-select-container' }),
    ),
    div({ class: 'filter-group' },
      label({ for: 'category-mobile' }, 'Категорія:'),
      div({ id: 'category-mobile', class: 'multi-select-container' }),
    ),
    div({ class: 'filter-group' },
      label({ for: 'tag-mobile' }, 'Тег:'),
      div({ id: 'tag-mobile', class: 'multi-select-container' }),
    ),
  );
}

function DesktopLayout(transactionModal: State<Transaction | null>) {
  return div({ class: 'desktop-layout' },
    aside({ class: 'sidebar' },
      div({ class: 'sidebar-header' },
        h2('Фільтри')
      ),
      div({ class: 'filter-group' },
        label('Сума:'),
        div({ class: 'amount-filter-inputs' },
          input({ id: 'amount-min', placeholder: 'Min', type: 'number' }),
          span('-'),
          input({ id: 'amount-max', placeholder: 'Max', type: 'number' })
        ),
        div({ class: 'double-slider-container', id: 'double-slider-desktop' },
          div({ class: 'double-slider-track' }),
          div({ class: 'double-slider-range', id: 'double-slider-range-desktop' }),
          div({ class: 'double-slider-thumb', id: 'thumb-min-desktop' }),
          div({ class: 'double-slider-thumb', id: 'thumb-max-desktop' })
        ),
      ),
      div({ class: 'filter-group' },
        label('Дата:'),
        div({ id: 'date-range-desktop', class: 'date-range-container' },
          input({ type: 'text', class: 'date-input', name: 'start', placeholder: 'From' }),
          span('-'),
          input({ type: 'text', class: 'date-input', name: 'end', placeholder: 'To' }),
        ),
      ),
      div({ class: 'filter-group' },
        label({ for: 'merchant' }, 'Мерчант:'),
        div({ id: 'merchant', class: 'multi-select-container' }),
      ),
      div({ class: 'filter-group' },
        label({ for: 'card' }, 'Картка:'),
        div({ id: 'card', class: 'multi-select-container' }),
      ),
      div({ class: 'filter-group' },
        label({ for: 'person' }, 'Ім\'я:'),
        div({ id: 'person', class: 'multi-select-container' }),
      ),
      div({ class: 'filter-group' },
        label({ for: 'category' }, 'Категорія:'),
        div({ id: 'category', class: 'multi-select-container' }),
      ),
      div({ class: 'filter-group' },
        label({ for: 'tag' }, 'Тег:'),
        div({ id: 'tag', class: 'multi-select-container' }),
      ),
      button({ class: 'apply-btn desktop-btn' }, 'Застосувати фільтри'),
    ),
    main({ class: 'main-content' },
      div({ class: 'main-tab-container' },
        div({
          class: () => `main-tab${activeTab.val === 'grouped' ? ' active' : ''}`, onclick: () => {
            activeTab.val = 'grouped';
          }
        }, 'Grouped'),
        div({
          class: () => `main-tab${activeTab.val === 'transactions' ? ' active' : ''}`, onclick: () => {
            activeTab.val = 'transactions';
          }
        }, 'Transactions'),
      ),
      div({ id: 'grouped-content', class: () => `main-tab-content${activeTab.val === 'grouped' ? ' active' : ''}` },
        div({ class: 'grouped-options' },
        ),
      ),
      div({ id: 'transactions-content', class: () => `main-tab-content${activeTab.val === 'transactions' ? ' active' : ''}` },
        div({ class: 'transactions-actions' },
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
          }, '+ Add Tag to All Filtered'),
          span({
            class: 'add-tag-btn',
            onclick: () => {
              const ids = filteredTransactions.val.map(t => t.id);
              if (ids.length > 0) {
                openCategoryModal(ids, 'Change Category for All Filtered');
              } else {
                alert('No transactions to change category.');
              }
            }
          }, 'Change Category for All Filtered')
        ),
        div({ class: 'transactions-list' },
          () => {
            if (loading.val) {
              return div("Loading...")
            }
            if (error.val) {
              return div(error.val)
            }
            return div(filteredTransactions.val.map(e => convertTransaction(e, transactionModal)))
          }
        ),
      ),
    ),
    aside({ class: 'stats-sidebar' },
      h3('Summary'),
      div({ id: 'summary-content' },
      ),
      h3('Last 30 days'),
      div({ class: 'pie-chart-container' },
        canvas({ id: 'last-month-chart' }),
      ),
      h3('By Category'),
      div({ class: 'pie-chart-container' },
        canvas({ id: 'category-chart' }),
      ),
      h3('By Tags'),
      div({ class: 'pie-chart-container' },
        canvas({ id: 'tags-chart' }),
      ),
      h3('By Person'),
      div({ class: 'pie-chart-container' },
        canvas({ id: 'person-chart' }),
      ),
    ),
  );
}

function Page(openTransactionModal: State<Transaction | null>) {
  return div({ class: 'page-container' },
    MobileFilter(),
    DesktopLayout(openTransactionModal),
  );
}

function App(transactionModal: State<Transaction | null>) {
  if (loggedIn.val) {
    return Page(transactionModal);
  }
  return Login();
}

function mainInit() {
  const [openTransactionModal, TransactionPopup] = setupTransactionPopup();
  van.add(document.body, () => App(openTransactionModal), TransactionPopup, ...setupAdding())

  queueMicrotask(() => {
    setupFilters();
    setupGroup();
    setupTagModal();
    setupCategoryModal();
    setupSharingModal(); // Call the new setup function
    setupStats();
  })

}

document.addEventListener("DOMContentLoaded", mainInit);
