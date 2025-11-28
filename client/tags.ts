import { fetchTransactions, token, transactions } from "./common.ts";
import "./tags.css";

import van from "vanjs-core";
import "./tags.css";

const { div, h3, label, input, button, span } = van.tags;

const isOpen = van.state(false);
const currentTransactionIDs = van.state<number[]>([]);
const modalTitle = van.state("Add Tag");
const tagInputVal = van.state("");
const suggestions = van.state<string[]>([]);
const showSuggestions = van.state(false);

export function openTagModal(
	transactionIDs: number[],
	title: string = "Add Tag",
) {
	currentTransactionIDs.val = transactionIDs;
	modalTitle.val = `${title} (${transactionIDs.length} transactions)`;
	tagInputVal.val = "";
	isOpen.val = true;
	// Focus input after render? We might need a ref or effect.
	// For now, simple state open is enough.
}

export function TagModal() {
	const closeModal = () => {
		isOpen.val = false;
		showSuggestions.val = false;
	};

	const saveTag = async () => {
		const tag = tagInputVal.val.trim();
		if (!tag) {
			alert("Please enter a tag.");
			return;
		}

		if (currentTransactionIDs.val.length === 0) {
			alert("No transactions selected.");
			return;
		}

		try {
			const response = await fetch("/api/transactions/tags", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token.val}`,
				},
				body: JSON.stringify({
					transaction_ids: currentTransactionIDs.val,
					tag: tag,
					action: "add",
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
			alert("Error adding tag.");
		}
	};

	const updateSuggestions = (inputText: string) => {
		const tagSet = new Set<string>();
		transactions.val.forEach((t) => {
			t.tags.forEach((tag) => {
				tagSet.add(tag);
			});
		});
		const allTags = Array.from(tagSet).sort();
		suggestions.val = allTags.filter((tag) =>
			tag.toLowerCase().includes(inputText.toLowerCase()),
		);
		showSuggestions.val = suggestions.val.length > 0;
	};

	return () => {
		if (!isOpen.val) return "";

		return div(
			{
				id: "tag-modal",
				class: "modal",
				style: "display: block;",
				onclick: (e) => {
					if (e.target === e.currentTarget) closeModal();
				},
			},
			div(
				{ class: "modal-content" },
				span({ class: "close-button", onclick: closeModal }, "×"),
				h3({ id: "tag-modal-title" }, modalTitle),
				div(
					{ class: "editable-field" },
					label({ class: "editable-label" }, "Tag:"),
					div(
						{ class: "tags-input-container" },
						input({
							type: "text",
							id: "tag-modal-input",
							class: "modal-input",
							value: tagInputVal,
							oninput: (e: Event) => {
								const val = (e.target as HTMLInputElement).value;
								tagInputVal.val = val;
								updateSuggestions(val);
							},
							onfocus: (e: Event) => {
								const val = (e.target as HTMLInputElement).value;
								updateSuggestions(val);
							},
							onblur: () => {
								setTimeout(() => {
									showSuggestions.val = false;
								}, 200);
							},
						}),
						() =>
							div(
								{
									id: "tag-suggestions",
									class: "suggestions-dropdown",
									style: () =>
										`display: ${showSuggestions.val ? "block" : "none"}`,
								},
								suggestions.val.map((tag) =>
									div(
										{
											class: "suggestion-item",
											onclick: () => {
												tagInputVal.val = tag;
												showSuggestions.val = false;
											},
										},
										tag,
									),
								),
							),
					),
				),
				div(
					{ class: "modal-footer" },
					button(
						{
							id: "save-tag-btn",
							class: "apply-btn",
							onclick: saveTag,
						},
						"Save",
					),
				),
			),
		);
	};
}
