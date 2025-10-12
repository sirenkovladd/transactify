import van from "vanjs-core";
import { categories, formatOccurredAt, type Transaction, transactions } from './common.ts';

const { div, span, strong, img, input, textarea, select, option } = van.tags;

export function transactionPopup(tr: Transaction) {
  const modal = document.getElementById('transaction-modal') as HTMLElement;
  const modalDetails = document.getElementById('modal-details') as HTMLElement;
  const modalPhotos = document.getElementById('modal-photos') as HTMLElement;
  const saveButton = document.getElementById('save-changes-btn') as HTMLElement;

  if (modal && modalDetails && modalPhotos && saveButton) {
    // Create a deep copy for editing
    const editableTr = JSON.parse(JSON.stringify(tr));

    const showSaveButton = () => saveButton.style.display = 'inline-block';

    modalDetails.innerHTML = ''; // Clear previous content
    modalPhotos.innerHTML = '';
    saveButton.style.display = 'none'; // Hide save button initially

    const createEditableField = (label: string, value: any, onUpdate: (s: string) => void, type = 'text', options: readonly string[] = []) => {
      const isTextarea = type === 'textarea';
      const isDate = type === 'date' || type === 'datetime-local';
      const isSelect = type === 'select';

      const displayValue = isDate ? (value ? formatOccurredAt(value) : 'N/A') : (value || 'N/A');
      const valueSpan = span({ class: 'editable-value' }, displayValue);
      if (isTextarea) {
        valueSpan.classList.add('textarea-value');
      }
      (valueSpan as any)._value = value; // Store raw value

      const fieldContainer = div({ class: 'editable-field' },
        strong({ class: 'editable-label' }, label),
        valueSpan
      );

      fieldContainer.addEventListener('click', (e) => {
        if (fieldContainer.querySelector('input, textarea, select') || (e.target as HTMLElement).tagName === 'A') return;

        const currentValue = (valueSpan as any)._value;
        let originalValue;
        if (type === 'date') {
          originalValue = currentValue ? new Date(currentValue).toISOString().split('T')[0] : '';
        } else if (type === 'datetime-local') {
          if (currentValue) {
            const d = new Date(currentValue);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            originalValue = d.toISOString().slice(0, 16);
          } else {
            originalValue = '';
          }
        } else {
          originalValue = currentValue;
        }

        const inputEl = isTextarea
          ? textarea({ class: 'modal-textarea editable-input', value: originalValue || '' })
          : isSelect
            ? select({ class: 'modal-input editable-input' },
              options.map(opt => option({ value: opt, selected: opt === currentValue }, opt))
            )
            : input({ class: 'modal-input editable-input', type, value: originalValue || '' });

        const handleUpdate = () => {
          const newValue = (inputEl as HTMLInputElement).value;
          let updatedValue: string = newValue;
          if (isDate) {
            if (newValue) {
              updatedValue = new Date(newValue).toISOString();
              valueSpan.textContent = formatOccurredAt(updatedValue);
            } else {
              updatedValue = '';
              valueSpan.textContent = 'N/A';
            }
          } else {
            valueSpan.textContent = newValue || 'N/A';
          }
          (valueSpan as any)._value = updatedValue;
          onUpdate(updatedValue);
          fieldContainer.replaceChild(valueSpan, inputEl as Node);
          showSaveButton();
        };

        (inputEl as HTMLElement).addEventListener('blur', handleUpdate);
        (inputEl as HTMLElement).addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' && !isTextarea) {
            handleUpdate();
          } else if (e.key === 'Escape') {
            fieldContainer.replaceChild(valueSpan, inputEl as Node);
          }
        });

        fieldContainer.replaceChild(inputEl, valueSpan);
        (inputEl as HTMLElement).focus();
      });

      return fieldContainer;
    };

    van.add(modalDetails, [
      createEditableField('Merchant:', editableTr.merchant, (v) => editableTr.merchant = v),
      createEditableField('Amount:', editableTr.amount, (v) => editableTr.amount = parseFloat(v)),
      createEditableField('Date:', editableTr.occurredAt, (v) => editableTr.occurredAt = v, 'datetime-local'),
      createEditableField('Person:', editableTr.personName, (v) => editableTr.personName = v),
      createEditableField('Card:', editableTr.card, (v) => editableTr.card = v),
      createEditableField('Category:', editableTr.category, (v) => editableTr.category = v, 'select', categories.val),
      createEditableField('Tags (comma separated):', editableTr.tags.join(', '), (v) => editableTr.tags = v.split(',').map(t => t.trim())),
      createEditableField('Details:', editableTr.details, (v) => editableTr.details = v, 'textarea'),
    ]);

    if (tr.photos && tr.photos.length > 0) {
      tr.photos.forEach(photoUrl => {
        van.add(modalPhotos, img({ src: photoUrl, alt: "Transaction photo" }));
      });
    }

    saveButton.onclick = async () => {
      try {
        const response = await fetch('/api/transaction/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(editableTr),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to save transaction: ${errorText}`);
        }

        const index = transactions.val.findIndex(t => t.id === tr.id);
        if (index !== -1) {
          const newTransactions = [...transactions.val];
          newTransactions[index] = editableTr;
          transactions.val = newTransactions;
        }
        modal.style.display = 'none';
      } catch (e: any) {
        console.error('Save failed:', e);
        alert(`Error saving: ${e.message}`);
      }
    };

    modal.style.display = 'block';
  }
}