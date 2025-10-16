import van, { type State } from "vanjs-core";
import { amountFilter, cardFilter, cards, categoriesFromTransaction, categoryFilter, dateEndFilter, dateStartFilter, maxDate, merchantFilter, merchants, minDate, personFilter, persons, tagFilter, tags, transactions } from './common.ts';

declare const DateRangePicker: any;

const { div, span, input } = van.tags;

function createMultiSelect(container: HTMLElement, optionsState: State<string[]>, selectedState: State<string[]>) {
  container.classList.add('multi-select-container');
  const searchInput = input({ class: 'multi-select-input', placeholder: 'Search...' });
  const dropdown = div({ class: 'multi-select-dropdown' });
  const tagsContainer = div();

  const renderTags = () => {
    van.add(tagsContainer, ...selectedState.val.map(value =>
      span({ class: 'multi-select-tag' },
        value,
        span({
          class: 'multi-select-tag-remove', onclick: () => {
            selectedState.val = selectedState.val.filter(v => v !== value);
          }
        }, '×')
      )
    ));
    tagsContainer.innerHTML = '';
    van.add(tagsContainer, ...selectedState.val.map(value =>
      span({ class: 'multi-select-tag' },
        value,
        span({
          class: 'multi-select-tag-remove', onclick: () => {
            selectedState.val = selectedState.val.filter(v => v !== value);
          }
        }, '×')
      )
    ));
  };

  const renderOptions = (filter = '') => {
    const lowerFilter = filter.toLowerCase();
    const availableOptions = optionsState.val.filter(opt =>
      !selectedState.val.includes(opt) && opt.toLowerCase().includes(lowerFilter)
    );

    dropdown.innerHTML = '';
    van.add(dropdown, ...availableOptions.map(opt =>
      div({
        class: 'multi-select-option', onclick: () => {
          selectedState.val = [...selectedState.val, opt];
          searchInput.value = '';
          renderOptions();
        }
      }, opt)
    ));
  };

  searchInput.addEventListener('input', () => renderOptions(searchInput.value));
  searchInput.addEventListener('focus', () => renderOptions());

  van.add(container, tagsContainer, searchInput, dropdown);

  van.derive(() => {
    renderTags();
    renderOptions(searchInput.value);
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      dropdown.style.display = 'none';
    }
  });
  container.addEventListener('click', (e) => {
    dropdown.style.display = 'block';
  });
}

export function setupFilters() {
  const bindTextInputs = (desktopId: string, mobileId: string, state: State<string>, event = 'input') => {
    const desktopEl = document.getElementById(desktopId) as HTMLInputElement;
    const mobileEl = document.getElementById(mobileId) as HTMLInputElement;

    if (desktopEl) desktopEl.addEventListener(event, e => state.val = (e.target as HTMLInputElement).value);
    if (mobileEl) mobileEl.addEventListener(event, e => state.val = (e.target as HTMLInputElement).value);

    van.derive(() => {
      if (desktopEl && desktopEl.value !== state.val) desktopEl.value = state.val;
      if (mobileEl && mobileEl.value !== state.val) mobileEl.value = state.val;
    });
  };

  // Amount Range
  const amountMinDesktop = document.getElementById('amount-min') as HTMLInputElement;
  const amountMaxDesktop = document.getElementById('amount-max') as HTMLInputElement;
  const amountMinMobile = document.getElementById('amount-min-mobile') as HTMLInputElement;
  const amountMaxMobile = document.getElementById('amount-max-mobile') as HTMLInputElement;

  const onMinChange = (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    amountFilter.val = { ...amountFilter.val, min: value === '' ? -Infinity : Number(value) };
  };
  const onMaxChange = (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    amountFilter.val = { ...amountFilter.val, max: value === '' ? Infinity : Number(value) };
  };

  if (amountMinDesktop) amountMinDesktop.addEventListener('input', onMinChange);
  if (amountMaxDesktop) amountMaxDesktop.addEventListener('input', onMaxChange);
  if (amountMinMobile) amountMinMobile.addEventListener('input', onMinChange);
  if (amountMaxMobile) amountMaxMobile.addEventListener('input', onMaxChange);

  van.derive(() => {
    const { min, max } = amountFilter.val;
    const minStr = Number.isFinite(min) ? String(min) : '';
    const maxStr = Number.isFinite(max) ? String(max) : '';

    if (amountMinDesktop && amountMinDesktop.value !== minStr) amountMinDesktop.value = minStr;
    if (amountMaxDesktop && amountMaxDesktop.value !== maxStr) amountMaxDesktop.value = maxStr;
    if (amountMinMobile && amountMinMobile.value !== minStr) amountMinMobile.value = minStr;
    if (amountMaxMobile && amountMaxMobile.value !== maxStr) amountMaxMobile.value = maxStr;
  });

  const setupDoubleSlider = (
    containerId: string,
    thumbMinId: string,
    thumbMaxId: string,
    rangeId: string
  ) => {
    const container = document.getElementById(containerId);
    const thumbMin = document.getElementById(thumbMinId);
    const thumbMax = document.getElementById(thumbMaxId);
    const range = document.getElementById(rangeId);

    if (!container || !thumbMin || !thumbMax || !range) return;

    const sliderMinVal = 0;
    const sliderMaxVal = van.derive(() => transactions.val.reduce((max, tr) => Math.max(max, Math.abs(tr.amount)), 0)); // Hardcoded max amount

    van.derive(() => {
      const { min, max } = amountFilter.val;
      const minV = Math.max(min, sliderMinVal);
      const maxV = Math.min(max, sliderMaxVal.val);

      const minPercent = ((minV - sliderMinVal) / (sliderMaxVal.val - sliderMinVal)) * 100;
      const maxPercent = ((maxV - sliderMinVal) / (sliderMaxVal.val - sliderMinVal)) * 100;

      thumbMin.style.left = `calc(${minPercent}% - 8px)`;
      thumbMax.style.left = `calc(${maxPercent}% - 8px)`;
      range.style.left = `${minPercent}%`;
      range.style.width = `${maxPercent - minPercent}%`;
    });

    const addDragListener = (thumb: HTMLElement, isMin: boolean) => {
      const onPointerMove = (clientX: number) => {
        const rect = container.getBoundingClientRect();
        let newX = clientX - rect.left;
        let percent = (newX / rect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));

        let newValue = Math.round(sliderMinVal + (percent / 100) * (sliderMaxVal.val - sliderMinVal));

        if (isMin) {
          newValue = Math.min(newValue, amountFilter.val.max);
          amountFilter.val = { ...amountFilter.val, min: newValue };
        } else {
          newValue = Math.max(newValue, amountFilter.val.min);
          amountFilter.val = { ...amountFilter.val, max: newValue };
        }
      };

      const onMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        const onMouseMove = (moveEvent: MouseEvent) => onPointerMove(moveEvent.clientX);
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      const onTouchStart = (e: TouchEvent) => {
        const onTouchMove = (moveEvent: TouchEvent) => {
          moveEvent.preventDefault();
          onPointerMove(moveEvent.touches[0]!.clientX);
        };
        const onTouchEnd = () => {
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
        };
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
      };

      thumb.addEventListener('mousedown', onMouseDown);
      thumb.addEventListener('touchstart', onTouchStart);
    };

    addDragListener(thumbMin, true);
    addDragListener(thumbMax, false);
  };

  setupDoubleSlider('double-slider-desktop', 'thumb-min-desktop', 'thumb-max-desktop', 'double-slider-range-desktop');
  setupDoubleSlider('double-slider-mobile', 'thumb-min-mobile', 'thumb-max-mobile', 'double-slider-range-mobile');

  const initDateRangePicker = (containerId: string, startState: State<string>, endState: State<string>) => {
    const el = document.getElementById(containerId);
    if (!el) return;

    const picker = new DateRangePicker(el, {
      format: 'yyyy-mm-dd',
      autohide: true,
      todayHighlight: true,
    });

    van.derive(() => {
      if (minDate.val && maxDate.val) {
        picker.setOptions({
          minDate: minDate.val,
          maxDate: maxDate.val,
        });
      }
    });

    el.addEventListener('changeDate', () => {
      const [start, end] = picker.getDates('yyyy-mm-dd');
      if (start !== startState.val) {
        startState.val = start;
      }
      if (end !== endState.val) {
        endState.val = end;
      }
    });

    van.derive(() => {
      const [currentStart, currentEnd] = picker.getDates('yyyy-mm-dd');
      if (startState.val !== currentStart || endState.val !== currentEnd) {
        picker.setDates(startState.val, endState.val);
      }
    });
  };

  initDateRangePicker('date-range-desktop', dateStartFilter, dateEndFilter);
  initDateRangePicker('date-range-mobile', dateStartFilter, dateEndFilter);

  createMultiSelect(document.getElementById('merchant')!, merchants, merchantFilter);
  createMultiSelect(document.getElementById('merchant-mobile')!, merchants, merchantFilter);
  createMultiSelect(document.getElementById('card')!, cards, cardFilter);
  createMultiSelect(document.getElementById('card-mobile')!, cards, cardFilter);
  createMultiSelect(document.getElementById('person')!, persons, personFilter);
  createMultiSelect(document.getElementById('person-mobile')!, persons, personFilter);
  createMultiSelect(document.getElementById('category')!, categoriesFromTransaction, categoryFilter);
  createMultiSelect(document.getElementById('category-mobile')!, categoriesFromTransaction, categoryFilter);
  createMultiSelect(document.getElementById('tag')!, tags, tagFilter);
  createMultiSelect(document.getElementById('tag-mobile')!, tags, tagFilter);
}