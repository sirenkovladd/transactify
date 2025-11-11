import { fetchTransactions, token, transactions } from "./common.ts";

let currentTransactionIDs: number[] = [];

export function setupTagModal() {
    function closeModal() {
        modal.style.display = 'none';
    }

    async function saveTag() {
        const tag = tagInput.value.trim();
        if (!tag) {
            alert('Please enter a tag.');
            return;
        }

        if (currentTransactionIDs.length === 0) {
            alert('No transactions selected.');
            return;
        }

        try {
            const response = await fetch('/api/transactions/tags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token.val}`
                },
                body: JSON.stringify({
                    transaction_ids: currentTransactionIDs,
                    tag: tag,
                    action: 'add'
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to add tag: ${error}`);
            }

            closeModal();
            fetchTransactions(); // Refresh data
        } catch (err) {
            console.error(err);
            alert('Error adding tag.');
        }
    }
    const modal = document.getElementById('tag-modal')!;
    const closeButton = modal.querySelector('.close-button') as HTMLElement;
    const saveButton = document.getElementById('save-tag-btn')!;
    const tagInput = document.getElementById('tag-modal-input') as HTMLInputElement;
    const modalTitle = document.getElementById('tag-modal-title')!;
    const suggestionsContainer = document.getElementById('tag-suggestions') as HTMLElement;

    let allTags: string[] = [];

    function updateAllTags() {
        const tagSet = new Set<string>();
        transactions.val.forEach(t => {
            t.tags.forEach(tag => tagSet.add(tag));
        });
        allTags = Array.from(tagSet).sort();
    }

    function showSuggestions() {
        const inputText = tagInput.value.toLowerCase();
        const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(inputText));

        suggestionsContainer.innerHTML = '';
        if (filteredTags.length > 0) {
            filteredTags.forEach(tag => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.textContent = tag;
                item.addEventListener('click', () => {
                    tagInput.value = tag;
                    suggestionsContainer.style.display = 'none';
                });
                suggestionsContainer.appendChild(item);
            });
            suggestionsContainer.style.display = 'block';
        } else {
            suggestionsContainer.style.display = 'none';
        }
    }

    tagInput.addEventListener('focus', () => {
        updateAllTags();
        showSuggestions();
    });

    tagInput.addEventListener('input', showSuggestions);

    tagInput.addEventListener('blur', () => {
        setTimeout(() => {
            suggestionsContainer.style.display = 'none';
        }, 200); // Delay to allow click on suggestion
    });


    closeButton.onclick = closeModal;
    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            closeModal();
        }
    });
    saveButton.onclick = saveTag;


    openTagModal = (transactionIDs: number[], title: string = 'Add Tag') => {
        currentTransactionIDs = transactionIDs;
        modalTitle.textContent = `${title} (${transactionIDs.length} transactions)`;
        tagInput.value = '';
        modal.style.display = 'block';
        tagInput.focus();
    }
}

export let openTagModal: (transactionIDs: number[], title?: string) => void;