import van from "vanjs-core";
import "./category.css";
import { categories, fetchTransactions, token } from "./common.ts";

let currentTransactionIDs: number[] = [];

async function updateTransactionsCategory(
	transactionIds: number[],
	category: string,
) {
	const response = await fetch("/api/transactions/category", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token.val}`,
		},
		body: JSON.stringify({
			transaction_ids: transactionIds,
			category: category,
		}),
	});
	if (!response.ok) {
		throw new Error(`Failed to update category for transactions`);
	}
}

export function setupCategoryModal() {
	const modal = document.getElementById("category-modal")!;
	if (!modal) return;

	const closeButton = modal.querySelector(".close-button") as HTMLElement;
	const saveButton = document.getElementById("save-category-btn")!;
	const categorySelect = document.getElementById(
		"category-modal-select",
	) as HTMLSelectElement;
	const modalTitle = document.getElementById("category-modal-title")!;

	function closeModal() {
		modal.style.display = "none";
	}

	async function saveCategory() {
		const category = categorySelect.value;
		if (!category) {
			alert("Please select a category.");
			return;
		}

		if (currentTransactionIDs.length === 0) {
			alert("No transactions selected.");
			return;
		}

		try {
			await updateTransactionsCategory(currentTransactionIDs, category);
			closeModal();
			fetchTransactions(); // Refresh data
		} catch (err) {
			console.error(err);
			alert("Error updating category.");
		}
	}

	closeButton.onclick = closeModal;
	window.addEventListener("click", (event) => {
		if (event.target === modal) {
			closeModal();
		}
	});
	saveButton.onclick = saveCategory;

	van.derive(() => {
		categorySelect.innerHTML = "";
		categories.val.forEach((category) => {
			const option = document.createElement("option");
			option.value = category;
			option.textContent = category;
			categorySelect.appendChild(option);
		});
	});

	openCategoryModal = (
		transactionIDs: number[],
		title: string = "Change Category",
	) => {
		currentTransactionIDs = transactionIDs;
		modalTitle.textContent = `${title} (${transactionIDs.length} transactions)`;
		modal.style.display = "block";
	};
}

export let openCategoryModal: (
	transactionIDs: number[],
	title?: string,
) => void;
