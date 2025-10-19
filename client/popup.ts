import van from "vanjs-core";
import { categories, formatOccurredAt, type Transaction, transactions, token, fetchTransactions } from './common.ts';

const { div, span, strong, img, input, textarea, select, option, button, label } = van.tags;

async function fetchPhoto(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token.val}`
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch photo: ${url}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

async function uploadPhoto(file: File, transactionId: number) {
    const formData = new FormData();
    formData.append('photo', file);

    const response = await fetch(`/api/transaction/${transactionId}/photo`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token.val}`
        },
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload photo: ${errorText}`);
    }

    await fetchTransactions();
}

async function deletePhoto(filePath: string) {
    if (!confirm('Are you sure you want to delete this photo?')) {
        return;
    }

    const response = await fetch('/api/photo', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.val}`
        },
        body: JSON.stringify({ filePath })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete photo: ${errorText}`);
    }

    await fetchTransactions();
}

function getAllTags() {
    const tagSet = new Set<string>();
    transactions.val.forEach(t => {
        t.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
}

function transactionPopup(tr: Transaction) {
    const modal = document.getElementById('transaction-modal') as HTMLElement;
    const modalDetails = document.getElementById('modal-details') as HTMLElement;
    const modalPhotos = document.getElementById('modal-photos') as HTMLElement;
    const saveButton = document.getElementById('save-changes-btn') as HTMLElement;
    const deleteButton = document.getElementById('delete-transaction-btn') as HTMLElement;

    if (modal && modalDetails && modalPhotos && saveButton && deleteButton) {
        const editableTr = JSON.parse(JSON.stringify(tr));

        const showSaveButton = () => saveButton.style.display = 'inline-block';

        modalDetails.innerHTML = '';
        modalPhotos.innerHTML = '';
        saveButton.style.display = 'none';

        function createTagsField(label: string, tags: string[], onUpdate: (tags: string[]) => void) {
            const { div, strong, span, input } = van.tags;

            const valueSpan = span({ class: 'editable-value' }, tags.join(', ') || 'N/A');
            (valueSpan as any)._value = tags;

            const fieldContainer = div({ class: 'editable-field' },
                strong({ class: 'editable-label' }, label),
                valueSpan
            );

            fieldContainer.addEventListener('click', (e) => {
                if (fieldContainer.querySelector('.tags-input-container-wrapper') || (e.target as HTMLElement).tagName === 'A') return;

                let currentTags = [...(valueSpan as any)._value];
                const allTags = getAllTags();

                const tagsContainer = div({ class: 'tags-list' });
                const inputEl = input({ class: 'tags-input-real', type: 'text', placeholder: 'Add a tag...' });
                const suggestionsContainer = div({ class: 'suggestions-dropdown' });

                function renderTags() {
                    tagsContainer.innerHTML = '';
                    currentTags.forEach(tag => {
                        const tagPill = span({ class: 'tag-pill' },
                            tag,
                            span({ class: 'tag-pill-remove', 'data-tag': tag }, '×')
                        );
                        tagsContainer.appendChild(tagPill);
                    });
                }

                const componentWrapper = div({ class: 'tags-input-container-wrapper' });
                const component = div({ class: 'tags-input-container multi', onclick: () => inputEl.focus() },
                    tagsContainer,
                    inputEl
                );
                van.add(componentWrapper, component, suggestionsContainer);

                const updateTags = (newTags: string[]) => {
                    currentTags = newTags;
                    renderTags();
                    onUpdate(currentTags);
                    showSaveButton();
                };

                tagsContainer.addEventListener('click', e => {
                    const target = e.target as HTMLElement;
                    if (target.classList.contains('tag-pill-remove')) {
                        const tagToRemove = target.dataset.tag;
                        if (tagToRemove) {
                            updateTags(currentTags.filter(t => t !== tagToRemove));
                        }
                    }
                });

                const addTagFromInput = () => {
                    const newTag = inputEl.value.trim();
                    if (newTag && !currentTags.includes(newTag)) {
                        updateTags([...currentTags, newTag]);
                    }
                    inputEl.value = '';
                    hideSuggestions();
                };

                inputEl.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTagFromInput();
                    } else if (e.key === 'Backspace' && inputEl.value === '' && currentTags.length > 0) {
                        const newTags = [...currentTags];
                        newTags.pop();
                        updateTags(newTags);
                    }
                });

                function showSuggestions() {
                    const inputText = inputEl.value.toLowerCase();
                    const filteredTags = allTags.filter(tag =>
                        tag.toLowerCase().includes(inputText) && !currentTags.includes(tag)
                    );

                    suggestionsContainer.innerHTML = '';
                    if (filteredTags.length > 0 && inputText) {
                        filteredTags.forEach(tag => {
                            const item = div({ class: 'suggestion-item' }, tag);
                            item.addEventListener('click', () => {
                                if (!currentTags.includes(tag)) {
                                    updateTags([...currentTags, tag]);
                                }
                                inputEl.value = '';
                                hideSuggestions();
                                inputEl.focus();
                            });
                            suggestionsContainer.appendChild(item);
                        });
                        suggestionsContainer.style.display = 'block';
                    } else {
                        hideSuggestions();
                    }
                }

                function hideSuggestions() {
                    suggestionsContainer.style.display = 'none';
                }

                inputEl.addEventListener('input', showSuggestions);
                inputEl.addEventListener('focus', showSuggestions);

                inputEl.addEventListener('blur', () => {
                    setTimeout(() => {
                        if (!componentWrapper.contains(document.activeElement)) {
                            addTagFromInput();
                            valueSpan.textContent = currentTags.join(', ') || 'N/A';
                            (valueSpan as any)._value = currentTags;
                            if (fieldContainer.contains(componentWrapper)) {
                                fieldContainer.replaceChild(valueSpan, componentWrapper);
                            }
                        }
                    }, 150);
                });

                renderTags();
                fieldContainer.replaceChild(componentWrapper, valueSpan);
                inputEl.focus();
            });

            return fieldContainer;
        }

        const createEditableField = (label: string, value: any, onUpdate: (s: string) => void, type = 'text', options: readonly string[] = []) => {
            const isTextarea = type === 'textarea';
            const isDate = type === 'date' || type === 'datetime-local';
            const isSelect = type === 'select';

            const displayValue = isDate ? (value ? formatOccurredAt(value) : 'N/A') : (value || 'N/A');
            const valueSpan = span({ class: 'editable-value' }, displayValue);
            if (isTextarea) {
                valueSpan.classList.add('textarea-value');
            }
            (valueSpan as any)._value = value;

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
            createTagsField('Tags:', editableTr.tags, (v) => editableTr.tags = v),
            createEditableField('Details:', editableTr.details, (v) => editableTr.details = v, 'textarea'),
        ]);

        if (tr.photos && tr.photos.length > 0) {
            tr.photos.forEach(photoUrl => {
                const photoContainer = div({ class: 'photo-container' });
                const imgEl = img({ alt: 'Transaction photo' });
                fetchPhoto(photoUrl).then(url => imgEl.src = url);

                const deleteBtn = button({ class: 'delete-photo-btn', onclick: () => deletePhoto(photoUrl) }, '×');
                van.add(photoContainer, imgEl, deleteBtn);
                van.add(modalPhotos, photoContainer);
            });
        }

        const fileInput = input({ type: 'file', accept: 'image/*', style: 'display: none;', onchange: (e: Event) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                uploadPhoto(file, tr.id).catch(err => alert(err.message));
            }
        } });
        const addPhotoBtn = label({ class: 'add-photo-btn' },
            'Add Photo',
            fileInput
        );
        van.add(modalPhotos, addPhotoBtn);

        saveButton.onclick = async () => {
            try {
                const response = await fetch('/api/transaction/update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
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

        deleteButton.onclick = async () => {
            if (!confirm('Are you sure you want to delete this transaction?')) {
                return;
            }

            try {
                const response = await fetch('/api/transaction/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ id: tr.id }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to delete transaction: ${errorText}`);
                }

                transactions.val = transactions.val.filter(t => t.id !== tr.id);
                modal.style.display = 'none';
            } catch (e: any) {
                console.error('Delete failed:', e);
                alert(`Error deleting: ${e.message}`);
            }
        };

        modal.style.display = 'block';
    }
}

export function setupTransactionPopup() {
    const openTransactionModal = van.state<Transaction | null>(null);
    return [
        openTransactionModal,
        () => {
            const tr = openTransactionModal.val;
            if (tr) {
                queueMicrotask(() => transactionPopup(tr))
                return div({ id: 'transaction-modal', class: 'modal', style: 'display: block;', onclick: () => openTransactionModal.val = null },
                    div({ class: 'modal-content', onclick: (e: Event) => e.stopPropagation() },
                        span({ class: 'close-button', onclick: () => openTransactionModal.val = null }, '×'),
                        div({ id: 'modal-details' }),
                        div({ id: 'modal-photos' }),
                        div({ class: 'modal-footer' },
                            button({ id: 'delete-transaction-btn', class: 'apply-btn', style: 'background-color: #f44336;' }, 'Delete'),
                            button({ id: 'save-changes-btn', class: 'apply-btn' }, 'Зберегти зміни'),
                        ),
                    ),
                );
            }
            return ''
        }
    ] as const
}
