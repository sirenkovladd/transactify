import van, { type State } from "vanjs-core";
import {
	categories,
	fetchTransactions,
	formatOccurredAt,
	token,
	transactions,
	type Transaction,
} from "./common.ts";

const {
	div,
	span,
	strong,
	img,
	input,
	textarea,
	select,
	option,
	button,
	label,
} = van.tags;

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
	} catch (e: any) {
		console.error("Delete failed:", e);
		alert(`Error deleting: ${e.message}`);
	}
}

export const openTransactionModal = van.state<Transaction | null>(null);

function getLocaleDate(dateString: string) {
	const date = new Date(dateString);
	date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
	return date.toISOString().slice(0, 16) as string;
}

export function TransactionPopup() {
	const tr = openTransactionModal.val;
	if (tr) {
		const fieldsChanged = van.state<State<boolean>[]>([]);
		const showSaveBtn = van.derive(() => fieldsChanged.val.some((s) => s.val));
		const saveButton = button(
			{
				id: "save-changes-btn",
				class: "apply-btn",
				style: () => `display: ${showSaveBtn.val ? "inline-block" : "none"}`,
				onclick: async () => {
					try {
						const response = await fetch("/api/transaction/update", {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${localStorage.getItem("token")}`,
							},
							body: JSON.stringify(editableTr),
						});

						if (!response.ok) {
							const errorText = await response.text();
							throw new Error(`Failed to save transaction: ${errorText}`);
						}

						const index = transactions.val.findIndex((t) => t.id === tr.id);
						if (index !== -1) {
							const newTransactions = [...transactions.val];
							newTransactions[index] = editableTr;
							transactions.val = newTransactions;
						}
						openTransactionModal.val = null;
					} catch (e: any) {
						console.error("Save failed:", e);
						alert(`Error saving: ${e.message}`);
					}
				},
			},
			"Зберегти зміни",
		);

		const editableTr = JSON.parse(JSON.stringify(tr));

		function createTagsField(
			label: string,
			originalValue: string[],
			onUpdate: (tags: string[]) => void,
		) {
			const currentTags = van.state([...originalValue]);

			fieldsChanged.val = fieldsChanged.val.concat(
				van.derive(
					() =>
						JSON.stringify(currentTags.val.sort()) !==
						JSON.stringify([...originalValue].sort()),
				),
			);

			const editing = van.state(false);

			const fieldContainer = div(
				{ class: "editable-field" },
				strong({ class: "editable-label" }, label),
				() => {
					if (!editing.val) {
						return span(
							{
								class: "editable-value",
								onclick: () => {
									editing.val = true;
								},
							},
							() => currentTags.val.join(", ") || "N/A",
						);
					}

					// --- Tags Input Component ---
					const allTags = getAllTags();
					const inputText = van.state("");
					const inputEl = input({
						class: "tags-input-real",
						type: "text",
						placeholder: "Add a tag...",
						value: inputText,
					});
					const filteredTags = van.derive(() => {
						return allTags
							.filter((tag) => !currentTags.val.includes(tag))
							.filter((tag) =>
								tag.toLowerCase().includes(inputText.val.toLowerCase()),
							);
					});

					const componentWrapper = div(
						{
							class: "tags-input-container-wrapper",
							tabindex: -1,
						},
						div(
							{
								class: "tags-input-container multi",
								onclick: () => inputEl.focus(),
							},
							() =>
								div(
									{ class: "tags-list" },
									currentTags.val.map((tag) => {
										return span(
											{ class: "tag-pill" },
											tag,
											span(
												{
													class: "tag-pill-remove",
													onclick: () => {
														currentTags.val = currentTags.val.filter(
															(t) => t !== tag,
														);
													},
												},
												"×",
											),
										);
									}),
								),
							inputEl,
						),
						() =>
							div(
								{
									class: "suggestions-dropdown",
									style: () =>
										`display: ${filteredTags.val.length > 0 ? "block" : "none"}`,
								},
								filteredTags.val.map((tag) => {
									const item = div({ class: "suggestion-item" }, tag);
									item.addEventListener("click", () => {
										if (!currentTags.val.includes(tag)) {
											currentTags.val = [...currentTags.val, tag];
										}
										inputEl.focus();
										inputText.val = "";
									});
									return item;
								}),
							),
					);

					const onExit = () => {
						onUpdate(currentTags.val);
						editing.val = false;
					};

					inputEl.onblur = (e: FocusEvent) => {
						if (!componentWrapper.contains(e.relatedTarget as Node)) {
							onExit();
						}
					};

					inputEl.addEventListener("keydown", (e) => {
						if (e.key === "Enter" || e.key === ",") {
							e.preventDefault();

							const newTag = inputText.val.trim();
							if (newTag && !currentTags.val.includes(newTag)) {
								currentTags.val = [...currentTags.val, newTag];
							}
							inputText.val = "";
						} else if (
							e.key === "Backspace" &&
							inputText.val === "" &&
							currentTags.val.length > 0
						) {
							const newTags = [...currentTags.val];
							newTags.pop();
							currentTags.val = newTags;
						} else if (e.key === "Escape") {
							onExit();
						}
					});

					inputEl.addEventListener("input", () => {
						const inputTextRaw = inputEl.value.toLowerCase();
						inputText.val = inputTextRaw;
					});

					queueMicrotask(() => inputEl.focus());
					return componentWrapper;
				},
			);

			return fieldContainer;
		}

		const createEditableField = (
			label: string,
			originalValue: any,
			onUpdate: (s: string) => void,
			type = "text",
			options: readonly string[] = [],
		) => {
			const currentValue = van.state(originalValue);
			fieldsChanged.val = fieldsChanged.val.concat(
				van.derive(() => currentValue.val !== originalValue),
			);
			const isTextarea = type === "textarea";
			const isDate = type === "datetime-local";
			const isSelect = type === "select";

			const displayValue = van.derive(() =>
				currentValue.val
					? isDate
						? formatOccurredAt(currentValue.val)
						: currentValue.val
					: "N/A",
			);

			const editing = van.state(false);

			const fieldContainer = div(
				{ class: "editable-field" },
				strong({ class: "editable-label" }, label),
				() => {
					if (!editing.val) {
						return span(
							{
								class: `editable-value${isTextarea ? " textarea-value" : ""}`,
								onclick: () => {
									editing.val = true;
								},
							},
							displayValue,
						);
					}
					const inputEl = isTextarea
						? textarea({
								class: "modal-textarea editable-input",
								value: currentValue,
							})
						: isSelect
							? select(
									{ class: "modal-input editable-input" },
									options.map((opt) =>
										option(
											{ value: opt, selected: opt === currentValue.val },
											opt,
										),
									),
								)
							: input({
									class: "modal-input editable-input",
									type,
									value: isDate
										? getLocaleDate(currentValue.val)
										: currentValue,
								});

					const handleUpdate = () => {
						const newValue = isDate
							? new Date(inputEl.value).toISOString()
							: inputEl.value;
						currentValue.val = newValue;
						onUpdate(newValue);
						editing.val = false;
					};

					inputEl.addEventListener("blur", handleUpdate);
					inputEl.addEventListener("input", () => {
						const newValue = isDate
							? new Date(inputEl.value).toISOString()
							: inputEl.value;
						currentValue.val = newValue;
					});
					(inputEl as HTMLElement).addEventListener(
						"keydown",
						(e: KeyboardEvent) => {
							if (e.key === "Enter" && !isTextarea) {
								handleUpdate();
							} else if (e.key === "Escape") {
								editing.val = false;
							}
						},
					);
					queueMicrotask(() => inputEl.focus());
					return inputEl;
				},
			);

			return fieldContainer;
		};

		const modalDetails = div(
			{ id: "modal-details" },
			createEditableField("Merchant:", editableTr.merchant, (v) => {
				editableTr.merchant = v;
			}),
			createEditableField("Amount:", editableTr.amount.toString(), (v) => {
				editableTr.amount = parseFloat(v);
			}),
			createEditableField(
				"Date:",
				editableTr.occurredAt,
				(v) => {
					editableTr.occurredAt = v;
				},
				"datetime-local",
			),
			createEditableField("Card:", editableTr.card, (v) => {
				editableTr.card = v;
			}),
			createEditableField(
				"Category:",
				editableTr.category,
				(v) => {
					editableTr.category = v;
				},
				"select",
				categories.val,
			),
			createTagsField("Tags:", editableTr.tags, (v) => {
				editableTr.tags = v;
			}),
			createEditableField(
				"Details:",
				editableTr.details,
				(v) => {
					editableTr.details = v;
				},
				"textarea",
			),
		);

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
				{ class: "modal-content", onclick: (e: Event) => e.stopPropagation() },
				span(
					{
						class: "close-button",
						onclick: () => {
							openTransactionModal.val = null;
						},
					},
					"×",
				),
				modalDetails,
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
						{ class: "add-photo-btn" },
						"Add Photo",
						input({
							type: "file",
							accept: "image/*",
							style: "display: none;",
							onchange: (e: Event) => {
								const file = (e.target as HTMLInputElement).files?.[0];
								if (file) {
									uploadPhoto(file, tr.id).catch((err) => alert(err.message));
								}
							},
						}),
					),
				),
				div(
					{ class: "modal-footer" },
					button(
						{
							id: "delete-transaction-btn",
							class: "apply-btn",
							style: "background-color: #f44336;",
							onclick: () => onDelete(tr),
						},
						"Delete",
					),
					saveButton,
				),
			),
		);
	}
	return "";
}
