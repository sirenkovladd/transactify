import van, { type State } from "vanjs-core";
import {
	categories,
	fetchTransactions,
	token,
	transactions,
	type Transaction,
} from "./common.ts";

const { div, span, img, input, textarea, select, option, button, label } =
	van.tags;

async function fetchPhoto(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token.val}`,
		},
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch photo: ${url}`);
	}
	const blob = await response.blob();
	return URL.createObjectURL(blob);
}

async function uploadPhoto(file: File, transactionId: number) {
	const formData = new FormData();
	formData.append("photo", file);

	const response = await fetch(`/api/transaction/${transactionId}/photo`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token.val}`,
		},
		body: formData,
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Failed to upload photo: ${errorText}`);
	}

	await fetchTransactions();
}

async function deletePhoto(filePath: string) {
	if (!confirm("Are you sure you want to delete this photo?")) {
		return;
	}

	const response = await fetch("/api/photo", {
		method: "DELETE",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token.val}`,
		},
		body: JSON.stringify({ filePath }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Failed to delete photo: ${errorText}`);
	}

	await fetchTransactions();
}

function getAllTags() {
	const tagSet = new Set<string>();
	transactions.val.forEach((t) => {
		t.tags.forEach((tag) => {
			tagSet.add(tag);
		});
	});
	return Array.from(tagSet).sort();
}

async function onDelete(tr: Transaction) {
	if (!confirm("Are you sure you want to delete this transaction?")) {
		return;
	}

	try {
		const response = await fetch("/api/transaction/delete", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token.val}`,
			},
			body: JSON.stringify({ id: tr.id }),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to delete transaction: ${errorText}`);
		}

		transactions.val = transactions.val.filter((t) => t.id !== tr.id);
		openTransactionModal.val = null;
	} catch (e: unknown) {
		console.error("Delete failed:", e);
		alert(`Error deleting: ${(e as Error).message}`);
	}
}

export const openTransactionModal = van.state<Transaction | null>(null);

export function TransactionPopup() {
	const tr = openTransactionModal.val;
	if (tr) {
		const fieldsChanged = van.state<State<boolean>[]>([]);
		const showSaveBtn = van.derive(() => fieldsChanged.val.some((s) => s.val));

		const editableTr = JSON.parse(JSON.stringify(tr)) as Transaction;

		// Helper to track changes
		const trackChange = <T>(original: T, current: State<T>, isDate = false) => {
			fieldsChanged.val = fieldsChanged.val.concat(
				van.derive(() => {
					if (isDate) {
						return (
							new Date(current.val as string).getTime() !==
							new Date(original as string).getTime()
						);
					}
					return current.val !== original;
				}),
			);
		};

		// --- Form States ---
		const merchant = van.state(editableTr.merchant);
		trackChange(editableTr.merchant, merchant);

		const amount = van.state(editableTr.amount);
		trackChange(editableTr.amount, amount);

		const occurredAt = van.state(editableTr.occurredAt);
		trackChange(editableTr.occurredAt, occurredAt, true);

		const category = van.state(editableTr.category);
		trackChange(editableTr.category, category);

		const tags = van.state(editableTr.tags);
		// Custom tracking for tags array
		fieldsChanged.val = fieldsChanged.val.concat(
			van.derive(
				() =>
					JSON.stringify(tags.val.sort()) !==
					JSON.stringify(editableTr.tags.sort()),
			),
		);

		const details = van.state(editableTr.details || "");
		trackChange(editableTr.details, details);

		const save = async () => {
			try {
				const updatedTr = {
					...editableTr,
					merchant: merchant.val,
					amount: Number(amount.val),
					occurredAt: occurredAt.val,
					category: category.val,
					tags: tags.val,
					details: details.val,
				};

				const response = await fetch("/api/transaction/update", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${localStorage.getItem("token")}`,
					},
					body: JSON.stringify(updatedTr),
				});

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`Failed to save transaction: ${errorText}`);
				}

				const index = transactions.val.findIndex((t) => t.id === tr.id);
				if (index !== -1) {
					const newTransactions = [...transactions.val];
					newTransactions[index] = updatedTr;
					transactions.val = newTransactions;
				}
				openTransactionModal.val = null;
			} catch (e: unknown) {
				console.error("Save failed:", e);
				alert(`Error saving: ${(e as Error).message}`);
			}
		};

		// --- Components ---

		const FormLabel = (text: string) => label({ class: "form-label" }, text);

		const TagsInput = () => {
			const allTags = getAllTags();
			const inputText = van.state("");
			const isFocused = van.state(false);
			const inputEl = input({
				class: "tags-input-real",
				type: "text",
				placeholder: "Add a tag...",
				value: inputText,
				oninput: (e: Event) => {
					inputText.val = (e.target as HTMLInputElement).value;
				},
				onfocus: () => {
					isFocused.val = true;
				},
				onblur: () => {
					// Delay hiding to allow clicking on suggestion
					setTimeout(() => {
						isFocused.val = false;
					}, 1);
				},
				onkeydown: (e: KeyboardEvent) => {
					if (e.key === "Enter" || e.key === ",") {
						e.preventDefault();
						const newTag = inputText.val.trim();
						if (newTag && !tags.val.includes(newTag)) {
							tags.val = [...tags.val, newTag];
						}
						inputText.val = "";
					} else if (
						e.key === "Backspace" &&
						inputText.val === "" &&
						tags.val.length > 0
					) {
						const newTags = [...tags.val];
						newTags.pop();
						tags.val = newTags;
					}
				},
			});

			const filteredTags = van.derive(() => {
				return allTags
					.filter((tag) => !tags.val.includes(tag))
					.filter((tag) =>
						tag.toLowerCase().includes(inputText.val.toLowerCase()),
					);
			});

			return div(
				{ class: "tags-input-wrapper" },
				div(
					{
						class: "tags-input-container multi",
						onclick: () => inputEl.focus(),
					},
					() =>
						div(
							{ class: "tags-list" },
							tags.val.map((tag: string) =>
								span(
									{ class: "tag-pill" },
									tag,
									span(
										{
											class: "tag-pill-remove",
											onclick: (e: Event) => {
												e.stopPropagation();
												tags.val = tags.val.filter((t: string) => t !== tag);
											},
										},
										"×",
									),
								),
							),
						),
					inputEl,
				),
				() =>
					div(
						{
							class: "suggestions-dropdown",
							style: () =>
								`display: ${
									isFocused.val && filteredTags.val.length > 0
										? "block"
										: "none"
								}`,
						},
						filteredTags.val.map((tag) => {
							const item = div({ class: "suggestion-item" }, tag);
							item.onclick = () => {
								if (!tags.val.includes(tag)) {
									tags.val = [...tags.val, tag];
								}
								inputText.val = "";
								inputEl.focus();
							};
							return item;
						}),
					),
			);
		};

		return div(
			{
				id: "transaction-modal",
				class: "modal",
				style: "display: block;",
				onclick: () => {
					openTransactionModal.val = null;
				},
			},
			div(
				{
					class: "modal-content new-design",
					onclick: (e: Event) => e.stopPropagation(),
				},
				// Header
				div(
					{ class: "modal-header" },
					div({ class: "modal-title" }, "Edit Transaction"),
					span(
						{
							class: "close-button",
							onclick: () => {
								openTransactionModal.val = null;
							},
						},
						"×",
					),
				),
				// Body
				div(
					{ class: "modal-body" },
					// Row 1: Merchant & Amount
					div(
						{ class: "form-row" },
						div(
							{ class: "form-group flex-grow" },
							FormLabel("Merchant"),
							input({
								class: "modal-input",
								value: merchant,
								oninput: (e: Event) => {
									merchant.val = (e.target as HTMLInputElement).value;
								},
							}),
						),
						div(
							{ class: "form-group amount-group" },
							FormLabel("Amount"),
							input({
								class: "modal-input",
								type: "number",
								step: "0.01",
								value: amount,
								oninput: (e: Event) => {
									amount.val = parseFloat((e.target as HTMLInputElement).value);
								},
							}),
						),
					),
					// Row 2: Date & Category
					div(
						{ class: "form-row" },
						div(
							{ class: "form-group flex-grow" },
							FormLabel("Date & Time"),
							input({
								class: "modal-input",
								type: "datetime-local",
								value: van.derive(() =>
									new Date(
										new Date(occurredAt.val).getTime() -
											new Date().getTimezoneOffset() * 60000,
									)
										.toISOString()
										.slice(0, 16),
								),
								oninput: (e: Event) => {
									occurredAt.val = new Date(
										(e.target as HTMLInputElement).value,
									).toISOString();
								},
							}),
						),
						div(
							{ class: "form-group flex-grow" },
							FormLabel("Category"),
							select(
								{
									class: "modal-input",
									onchange: (e: Event) => {
										category.val = (e.target as HTMLSelectElement).value;
									},
								},
								categories.val.map((cat) =>
									option({ value: cat, selected: cat === category.val }, cat),
								),
							),
						),
					),
					// Row 3: Tags
					div({ class: "form-group" }, FormLabel("Tags"), TagsInput()),
					// Row 4: Notes
					div(
						{ class: "form-group" },
						FormLabel("Notes"),
						textarea({
							class: "modal-textarea",
							placeholder: "Write a teaser or notes",
							value: details,
							oninput: (e: Event) => {
								details.val = (e.target as HTMLTextAreaElement).value;
							},
						}),
					),
					// Row 5: Photos
					div(
						{ class: "form-group" },
						div(
							{ id: "modal-photos" },
							(tr.photos || []).map((photoUrl) => {
								const imgEl = img({ alt: "Transaction photo" });
								fetchPhoto(photoUrl).then((url) => {
									imgEl.src = url;
								});

								return div(
									{ class: "photo-container" },
									imgEl,
									button(
										{
											class: "delete-photo-btn",
											onclick: () => deletePhoto(photoUrl),
										},
										"×",
									),
								);
							}),
							label(
								{ class: "add-photo-btn-square" },
								div({ class: "camera-icon" }, "📷"),
								div("Add Photo"),
								input({
									type: "file",
									accept: "image/*",
									style: "display: none;",
									onchange: (e: Event) => {
										const file = (e.target as HTMLInputElement).files?.[0];
										if (file) {
											uploadPhoto(file, tr.id).catch((err) =>
												alert(err.message),
											);
										}
									},
								}),
							),
						),
					),
				),
				// Footer
				div(
					{ class: "modal-footer new-design-footer" },
					button(
						{
							class: "delete-btn-text",
							onclick: () => onDelete(tr),
						},
						"Delete",
					),
					button(
						{
							class: "save-btn",
							onclick: save,
							disabled: van.derive(() => !showSaveBtn.val),
						},
						"Save",
					),
				),
			),
		);
	}
	return "";
}
