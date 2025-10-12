import { fetchTransactions } from "./common.ts";

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
                headers: { 'Content-Type': 'application/json' },
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
