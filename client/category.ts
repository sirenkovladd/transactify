import van from "vanjs-core";
import "./category.css";
import { categories, fetchTransactions, token } from "./common.ts";

const { div, h3, label, select, option, button, span } = van.tags;

const isOpen = van.state(false);
const currentTransactionIDs = van.state<number[]>([]);
const modalTitle = van.state("Change Category");
const selectedCategory = van.state("");

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

export function openCategoryModal(
	transactionIDs: number[],
	title: string = "Change Category",
) {
	currentTransactionIDs.val = transactionIDs;
	modalTitle.val = `${title} (${transactionIDs.length} transactions)`;
	selectedCategory.val = ""; // Reset selection
	isOpen.val = true;
}

export function CategoryModal() {
	const closeModal = () => {
		isOpen.val = false;
	};

	const saveCategory = async () => {
		const category = selectedCategory.val;
		if (!category) {
			alert("Please select a category.");
			return;
		}

		if (currentTransactionIDs.val.length === 0) {
			alert("No transactions selected.");
			return;
		}

		try {
			await updateTransactionsCategory(currentTransactionIDs.val, category);
			closeModal();
			fetchTransactions(); // Refresh data
		} catch (err) {
			console.error(err);
			alert("Error updating category.");
		}
	};

	return () => {
		if (!isOpen.val) return null;

		return div(
			{
				id: "category-modal",
				class: "modal",
				style: "display: block;",
				onclick: (e) => {
					if (e.target === e.currentTarget) closeModal();
				},
			},
			div(
				{ class: "modal-content" },
				span({ class: "close-button", onclick: closeModal }, "×"),
				h3({ id: "category-modal-title" }, modalTitle),
				div(
					{ class: "editable-field" },
					label({ class: "editable-label" }, "Category:"),
					select(
						{
							id: "category-modal-select",
							class: "modal-input",
							value: selectedCategory,
							onchange: (e: Event) => {
								selectedCategory.val = (e.target as HTMLSelectElement).value;
							},
						},
						option({ value: "", disabled: true, selected: true }, "Select..."),
						categories.val.map((cat) =>
							option(
								{ value: cat, selected: cat === selectedCategory.val },
								cat,
							),
						),
					),
				),
				div(
					{ class: "modal-footer" },
					button(
						{
							id: "save-category-btn",
							class: "apply-btn",
							onclick: saveCategory,
						},
						"Save",
					),
				),
			),
		);
	};
}
