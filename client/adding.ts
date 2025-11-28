import van, { type ChildDom, type State } from "vanjs-core";
import "./adding.css";
import {
	addTransactions,
	categories,
	getDateStr,
	loggedIn,
	type NewTransaction,
	transactions,
} from "./common.ts";
import { type Categories, categoriesMap } from "./const.ts";

const { div, span, p, input, button, option, select, textarea, label, a } =
	van.tags;

const LabeledField = (labelText: string, field: ChildDom, className?: string) =>
	div(
		{ class: ["import-labeled-field", className].filter(Boolean).join(" ") },
		label(labelText),
		field,
	);

// Parsed transaction shape used in import modal.
// Tags are stored as comma-separated string in the UI and converted to array on save.
type ParsedImportRow = {
	datetime: string;
	merchant: string;
	amount: number;
	category: string;
	card?: string;
	tags: string;
};

function parseCSV(data: string): ParsedImportRow[] {
	const lines = data.trim().split("\n");
	if (lines.length < 1) {
		return [];
	}
	const header = lines
		.shift()!
		.split(",")
		.map((h) => h.trim().toLowerCase());

	const transactions = lines.map((line) => {
		const values = line.split(",");
		const row: { [key: string]: string } = {};
		header.forEach((key, i) => {
			row[key] = values[i] ? values[i].trim() : "";
		});
		return row;
	});

	return transactions.map((t) => {
		const amountStr = t.amount || t.debit || t.credit;
		let amount = parseFloat(amountStr || "0");
		if (t.debit && amount > 0) {
			amount = -amount;
		}

		let datetime = t.datetime || t.date || "";
		if (datetime && !datetime.includes("T")) {
			const d = new Date(datetime);
			if (!isNaN(d.getTime())) {
				const year = d.getFullYear();
				const month = (d.getMonth() + 1).toString().padStart(2, "0");
				const day = d.getDate().toString().padStart(2, "0");
				datetime = `${year}-${month}-${day}T00:00`;
			}
		}

		return {
			datetime,
			merchant: t.merchant || t.description || "",
			amount: amount || 0,
			category: t.category || "",
			tags: t.tags || "",
		} satisfies ParsedImportRow;
	});
}

const cibcMerchant: Record<string, Categories> = {
	"0001": "home goods",
	"0002": "unknown",
	"0004": "transportation",
	"0005": "hotel",
	"0003": "food & other",
	"0006": "takeouts",
	"0007": "home goods",
	"0008": "health",
	"0009": "unknown",
	"0010": "unknown",
	"0011": "unknown",
};

function categoryFallback(merchantCategoryId: string): Categories {
	return cibcMerchant[merchantCategoryId] || "unknown";
}

function parseCIBC(data: string): ParsedImportRow[] {
	let payload: any[] = [];

	try {
		const parsed = JSON.parse(data);
		if (Array.isArray(parsed)) {
			payload = parsed;
		} else if (parsed && Array.isArray(parsed.transactions)) {
			payload = parsed.transactions;
		} else {
			console.error("Unexpected CIBC payload format");
			return [];
		}
	} catch (e) {
		console.error("Failed to parse CIBC JSON", e);
		return [];
	}

	return payload
		.filter((e) => e.descriptionLine1 !== "PAYMENT THANK YOU/PAIEMEN")
		.map((item) => {
			const merchant =
				item.descriptionLine1 || item.transactionDescription || "";
			const categoryFromMap = getCategory(merchant);
			const category =
				categoryFromMap && categoryFromMap !== "unknown"
					? categoryFromMap
					: categoryFallback(item.merchantCategoryId);

			let amount = 0;
			if (item.debit != null) {
				amount = Math.abs(Number(item.debit) || 0);
			} else if (item.credit != null) {
				amount = -Math.abs(Number(item.credit) || 0);
			}

			let datetime = item.date || item.postedDate || "";
			if (datetime) {
				const d = new Date(datetime.split("T")[0] + "T00:00");
				if (!isNaN(d.getTime())) {
					const year = d.getFullYear();
					const month = (d.getMonth() + 1).toString().padStart(2, "0");
					const day = d.getDate().toString().padStart(2, "0");
					const hours = d.getHours().toString().padStart(2, "0");
					const minutes = d.getMinutes().toString().padStart(2, "0");
					datetime = `${year}-${month}-${day}T${hours}:${minutes}`;
				}
			}

			return {
				datetime,
				merchant,
				amount,
				category,
				card: "cibc",
				tags: "",
			} satisfies ParsedImportRow;
		});
}

function getCategory(merchant: string): Categories {
	for (const [category, merchants] of Object.entries(categoriesMap)) {
		for (const pattern of merchants) {
			if (merchant.toLowerCase().includes(pattern.toLowerCase())) {
				return category as Categories;
			}
		}
	}
	return "unknown";
}

function parseWealthsimple(data: string): ParsedImportRow[] {
	const payload = JSON.parse(data) as {
		node: {
			amountSign: string;
			amount: string;
			occurredAt: string;
			spendMerchant?: string;
			eTransferName?: string;
			type: string;
		};
	}[];

	return payload
		.map((item) => {
			const node = item.node;
			if (["CREDIT_CARD_PAYMENT", "DEPOSIT"].includes(node.type)) {
				return null;
			}
			let amount = parseFloat(node.amount);
			if (node.amountSign === "positive") {
				amount = -amount;
			}

			const d = new Date(node.occurredAt);
			const year = d.getFullYear();
			const month = (d.getMonth() + 1).toString().padStart(2, "0");
			const day = d.getDate().toString().padStart(2, "0");
			const hours = d.getHours().toString().padStart(2, "0");
			const minutes = d.getMinutes().toString().padStart(2, "0");
			const datetime = `${year}-${month}-${day}T${hours}:${minutes}`;

			const merchant =
				node.spendMerchant ||
				node.eTransferName ||
				(node.type === "INTEREST" && "Interest") ||
				(node.type === "REIMBURSEMENT" && "Cashback");
			if (!merchant) {
				return null;
			}
			const category = getCategory(merchant);

			return {
				datetime,
				merchant,
				amount,
				category,
				card: "wealthsimple",
				tags: "",
			} satisfies ParsedImportRow;
		})
		.filter((e) => !!e);
}

function buildExistingIndex(existing: NewTransaction[]): Set<string> {
	const index = new Set<string>();

	for (const tx of existing) {
		if (!tx.occurredAt || tx.amount == null || !tx.merchant) continue;
		const date = getDateStr(new Date(tx.occurredAt));
		const amt = Number(tx.amount).toFixed(2);
		const merchant = tx.merchant.trim().toLowerCase();
		const cardKey = (tx.card || "").trim().toLowerCase();
		index.add(`${date}|${amt}|${merchant}|${cardKey}`);
	}

	return index;
}

function isDuplicateImport(row: ParsedImportRow, index: Set<string>): boolean {
	if (!row.datetime || row.amount == null || !row.merchant) return false;
	const date = getDateStr(new Date(row.datetime));
	const amt = Number(row.amount).toFixed(2);
	const merchant = row.merchant.trim().toLowerCase();
	const cardKey = (row.card || "").trim().toLowerCase();
	return index.has(`${date}|${amt}|${merchant}|${cardKey}`);
}

function renderParsedTransactions(
	data: ParsedImportRow[],
	card: string | undefined,
	openImportModal: State<boolean>,
	existingTransactions: NewTransaction[],
) {
	const container = div();

	const allTagsInput = input({ type: "text", placeholder: "Add tag to all" });
	const addTagButton = button(
		{
			onclick: () => {
				const tag = allTagsInput.value.trim();
				if (!tag) return;
				const tagInputs = container.querySelectorAll(".tags-input");
				tagInputs.forEach((inputEl) => {
					const el = inputEl as HTMLInputElement;
					const current = el.value
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean);
					if (!current.includes(tag)) {
						el.value = [...current, tag].join(", ");
					}
				});
			},
		},
		"Add Tag to All",
	);

	const duplicateIndex = buildExistingIndex(existingTransactions);

	const list = div(
		{ class: "import-transactions-list" },
		...data.map((item) => {
			const isDup = isDuplicateImport(item, duplicateIndex);

			const merchantInput = input({
				type: "text",
				value: item.merchant,
				class: "import-merchant-input",
			});
			const tagsInput = input({
				type: "text",
				value: item.tags,
				class: "tags-input import-tags-input",
			});
			const amountInput = input({
				type: "number",
				value: item.amount,
				class: "import-amount-input",
			});
			const categorySelect = select(
				{ class: "modal-input import-category-select" },
				...categories.val.map((c) =>
					option({ value: c, selected: c === item.category }, c),
				),
			);
			const cardInput = card
				? null
				: input({
						type: "text",
						value: item.card ?? "",
						class: "import-card-input",
					});
			const datetimeInput = input({
				type: "datetime-local",
				value: item.datetime,
				class: "import-datetime-input",
			});

			const root = div(
				{
					class: `import-transaction-item${isDup ? " import-transaction-duplicate" : ""}`,
				},
				div(
					{ class: "import-transaction-row" },
					LabeledField("Merchant", merchantInput),
				),
				div(
					{ class: "import-transaction-row" },
					categorySelect,
					datetimeInput,
					amountInput,
				),
				div(
					{ class: "import-transaction-row" },
					LabeledField("Tags", tagsInput),
					cardInput,
					div(
						{ class: "import-actions" },
						isDup
							? span(
									{
										class: "import-duplicate-label",
										title:
											"This transaction already exists and will be skipped on import.",
									},
									"Already exists",
								)
							: null,
						button(
							{
								class: "import-row-remove-btn",
								onclick: (e: Event) => {
									(e.target as HTMLElement)
										?.closest(".import-transaction-item")
										?.remove();
								},
							},
							"Remove",
						),
					),
				),
			);

			return root;
		}),
	);

	const saveButton = button(
		{
			class: "import-save-btn",
			onclick: () => {
				const transactionsToSave: NewTransaction[] = [];
				const rows = container.querySelectorAll(".import-transaction-item");

				rows.forEach((rowEl) => {
					const row = rowEl as HTMLElement;

					// Skip rows already marked as duplicate
					if (row.classList.contains("import-transaction-duplicate")) {
						return;
					}

					const occurredAt = (
						row.querySelector(".import-datetime-input") as HTMLInputElement
					)?.value;
					const merchant = (
						row.querySelector(".import-merchant-input") as HTMLInputElement
					)?.value;
					const amountStr = (
						row.querySelector(".import-amount-input") as HTMLInputElement
					)?.value;
					const category = (
						row.querySelector(".import-category-select") as HTMLSelectElement
					)?.value;
					const cardValue = card
						? card
						: (
								row.querySelector(
									".import-card-input",
								) as HTMLInputElement | null
							)?.value || "";
					const tagsValue =
						(row.querySelector(".import-tags-input") as HTMLInputElement)
							?.value || "";
					const tags = tagsValue
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean);

					if (!occurredAt || !merchant || !amountStr || !category) {
						return;
					}

					const amount = parseFloat(amountStr);
					if (Number.isNaN(amount)) {
						return;
					}

					transactionsToSave.push({
						occurredAt: new Date(occurredAt).toISOString(),
						merchant,
						amount,
						category,
						tags,
						currency: "CAD",
						card: cardValue,
					});
				});

				if (transactionsToSave.length > 0) {
					addTransactions(transactionsToSave).then(() => {
						openImportModal.val = false;
					});
				}
			},
		},
		"Save Imported Transactions",
	);

	const copyAllButton = button(
		{
			class: "copy-all-btn",
			onclick: () => {
				const rows = container.querySelectorAll(".import-transaction-item");
				const csvData: string[] = [];
				const headers = [
					"datetime",
					"merchant",
					"amount",
					"category",
					"tags",
					"card",
				];
				csvData.push(headers.join(","));

				rows.forEach((rowEl) => {
					const row = rowEl as HTMLElement;

					const datetime = (
						row.querySelector(".import-datetime-input") as HTMLInputElement
					)?.value;
					const merchant = (
						row.querySelector(".import-merchant-input") as HTMLInputElement
					)?.value;
					const amount = (
						row.querySelector(".import-amount-input") as HTMLInputElement
					)?.value;
					const category = (
						row.querySelector(".import-category-select") as HTMLSelectElement
					)?.value;
					const tags =
						(row.querySelector(".import-tags-input") as HTMLInputElement)
							?.value || "";
					const cardValue = card
						? card
						: (
								row.querySelector(
									".import-card-input",
								) as HTMLInputElement | null
							)?.value || "";

					const csvRow = [
						datetime,
						'"' + merchant.replace(/"/g, '""') + '"',
						amount,
						category,
						'"' + tags.replace(/"/g, '""') + '"',
						cardValue,
					];
					csvData.push(csvRow.join(","));
				});

				navigator.clipboard
					.writeText(csvData.join("\n"))
					.then(() => {
						const originalText = copyAllButton.innerText;
						copyAllButton.innerText = "Copied!";
						setTimeout(() => {
							copyAllButton.innerText = originalText;
						}, 2000);
					})
					.catch((err) => {
						console.error("Failed to copy: ", err);
						alert("Failed to copy to clipboard.");
					});
			},
		},
		"Copy All as CSV",
	);

	const buttonContainer = div(
		{ class: "import-button-container" },
		saveButton,
		copyAllButton,
	);

	van.add(container, div(allTagsInput, addTagButton), list, buttonContainer);
	return container;
}

export function NewTransactionModal() {
	const dateVal = van.state("");
	const merchantVal = van.state("");
	const amountVal = van.state("");
	const cardVal = van.state("");
	const categoryVal = van.state("");
	const tagsVal = van.state("");

	const closeModal = () => {
		openNewTransactionModal.val = false;
	};

	const saveTransaction = async () => {
		const amount = parseFloat(amountVal.val);
		if (Number.isNaN(amount)) {
			alert("Invalid amount");
			return;
		}

		const newTransaction: NewTransaction = {
			occurredAt: dateVal.val,
			merchant: merchantVal.val,
			amount: amount,
			card: cardVal.val,
			category: categoryVal.val,
			tags: tagsVal.val
				.split(",")
				.map((tag) => tag.trim())
				.filter((t) => t),
			currency: "CAD",
		};

		await addTransactions([newTransaction]);
		closeModal();
	};

	return () => {
		if (!openNewTransactionModal.val) return "";

		return div(
			{
				id: "create-new-transaction-modal",
				class: "modal",
				style: "display: block;",
				onclick: (e) => {
					if (e.target === e.currentTarget) closeModal();
				},
			},
			div(
				{ class: "modal-content" },
				span({ class: "close-button", onclick: closeModal }, "×"),
				van.tags.h3("Create New Transaction"),
				div(
					{ class: "editable-field" },
					label({ class: "editable-label" }, "Date:"),
					input({
						type: "datetime-local",
						id: "new-transaction-date",
						class: "modal-input",
						value: dateVal,
						oninput: (e: Event) => {
							dateVal.val = (e.target as HTMLInputElement).value;
						},
					}),
				),
				div(
					{ class: "editable-field" },
					label({ class: "editable-label" }, "Merchant:"),
					input({
						type: "text",
						id: "new-transaction-merchant",
						class: "modal-input",
						value: merchantVal,
						oninput: (e: Event) => {
							merchantVal.val = (e.target as HTMLInputElement).value;
						},
					}),
				),
				div(
					{ class: "editable-field" },
					label({ class: "editable-label" }, "Amount:"),
					input({
						type: "number",
						id: "new-transaction-amount",
						class: "modal-input",
						value: amountVal,
						oninput: (e: Event) => {
							amountVal.val = (e.target as HTMLInputElement).value;
						},
					}),
				),
				div(
					{ class: "editable-field" },
					label({ class: "editable-label" }, "Card:"),
					input({
						type: "text",
						id: "new-transaction-card",
						class: "modal-input",
						value: cardVal,
						oninput: (e: Event) => {
							cardVal.val = (e.target as HTMLInputElement).value;
						},
					}),
				),
				div(
					{ class: "editable-field" },
					label({ class: "editable-label" }, "Category:"),
					select(
						{
							id: "new-transaction-category",
							class: "modal-input",
							value: categoryVal,
							onchange: (e: Event) => {
								categoryVal.val = (e.target as HTMLSelectElement).value;
							},
						},
						categories.val.map((c) => option({ value: c }, c)),
					),
				),
				div(
					{ class: "editable-field" },
					label({ class: "editable-label" }, "Tags:"),
					input({
						type: "text",
						id: "new-transaction-tags",
						class: "modal-input",
						value: tagsVal,
						oninput: (e: Event) => {
							tagsVal.val = (e.target as HTMLInputElement).value;
						},
					}),
				),
				div(
					{ class: "modal-footer" },
					button(
						{
							id: "save-new-transaction-btn",
							class: "apply-btn",
							onclick: saveTransaction,
						},
						"Save Transaction",
					),
				),
			),
		);
	};
}

export function ScanReceiptModal() {
	const closeModal = () => {
		openScanReceiptModal.val = false;
	};

	return () => {
		if (!openScanReceiptModal.val) return "";

		return div(
			{
				id: "scan-receipt-modal",
				class: "modal",
				style: "display: block;",
				onclick: (e) => {
					if (e.target === e.currentTarget) closeModal();
				},
			},
			div(
				{ class: "modal-content" },
				span({ class: "close-button", onclick: closeModal }, "×"),
				van.tags.h3("Scan Receipt"),
				div(
					{ id: "scan-receipt-container" },
					label(
						{ for: "receipt-upload", class: "receipt-upload-label" },
						div({ class: "upload-icon" }, "📷"),
						div("Click to upload a receipt"),
					),
					input({
						type: "file",
						id: "receipt-upload",
						accept: "image/*",
						style: "display: none;",
					}),
					button(
						{ id: "scan-receipt-btn", class: "apply-btn" },
						"Scan", // Logic to be implemented
					),
				),
				div({ id: "parsed-receipt-container" }),
			),
		);
	};
}

const openNewTransactionModal = van.state(false);
const openScanReceiptModal = van.state(false);
const openImportModal = van.state(false);
const externalImportData = van.state<ParsedImportRow[] | null>(null);

export function setupAdding() {
	const urlParams = new URLSearchParams(window.location.search);
	if (urlParams.get("add") === "extension") {
		window.addEventListener("message", (event) => {
			if (event.data && event.data.type === "EXTENSION_IMPORT_TRANSACTIONS") {
				const rawTransactions = event.data.data;
				if (Array.isArray(rawTransactions)) {
					externalImportData.val = rawTransactions;
					openImportModal.val = true;
				}
			}
		});
	}

	const ImportModalComponent = () => {
		if (!openImportModal.val) return "";

		const active = van.state<"Wealthsimple" | "CSV" | "CIBC">("Wealthsimple");
		const parsedDataState = van.state<ParsedImportRow[]>([]);

		const Tab = (type: typeof active.val, ...children: ChildDom[]) =>
			div(
				{ class: () => `tab-content${active.val === type ? " active" : ""}` },
				...children,
			);

		// Initialize parsedDataState if external data exists
		if (externalImportData.val && parsedDataState.val.length === 0) {
			const rawWealthsimple = JSON.stringify(externalImportData.val);
			parsedDataState.val = parseWealthsimple(rawWealthsimple);
		}

		const wealthsimpleInput = textarea({
			id: "wealthsimple-input",
			placeholder: "Paste your Wealthsimple data here",
		});
		const cibcInput = textarea({
			id: "cibc-input",
			placeholder: "Paste your CIBC data here",
		});
		const csvInput = textarea({
			id: "csv-input",
			placeholder:
				"2024-01-01,The Coffee Shop,-3.50,Food,coffee\n2024-01-02,Book Store,-25.00,Shopping,books",
		});

		const parseData = (
			inputEl: HTMLTextAreaElement,
			parser: (data: string) => ParsedImportRow[],
		) => {
			return () => {
				const data = inputEl.value;
				parsedDataState.val = parser(data);
			};
		};

		const existing = transactions?.val || [];

		const modal = div(
			{
				id: "import-modal",
				class: "modal",
				style: "display: block;",
				onclick: () => {
					openImportModal.val = false;
					externalImportData.val = null;
				},
			},
			div(
				{
					class: "modal-content",
					onclick: (e: Event) => e.stopPropagation(),
				},
				span(
					{
						class: "close-button",
						onclick: () => {
							openImportModal.val = false;
							externalImportData.val = null;
						},
					},
					"×",
				),
				div(
					{ class: "tab-container" },
					(["Wealthsimple", "CIBC", "CSV"] as const).map((type) =>
						div(
							{
								class: () => `tab${active.val === type ? " active" : ""}`,
								"data-tab": type.toLowerCase(),
								onclick: () => {
									active.val = type;
								},
							},
							type,
						),
					),
				),
				Tab(
					"Wealthsimple",
					wealthsimpleInput,
					button(
						{
							id: "parse-wealthsimple-btn",
							class: "apply-btn",
							onclick: parseData(
								wealthsimpleInput as HTMLTextAreaElement,
								parseWealthsimple,
							),
						},
						"Preview",
					),
				),
				Tab(
					"CIBC",
					cibcInput,
					button(
						{
							id: "parse-cibc-btn",
							class: "apply-btn",
							onclick: parseData(cibcInput as HTMLTextAreaElement, parseCIBC),
						},
						"Preview",
					),
				),
				Tab(
					"CSV",
					div(
						{ class: "csv-import-container" },
						div(
							{ class: "csv-header-example" },
							p("date,merchant,amount,category,tags"),
						),
						csvInput,
					),
					button(
						{
							id: "parse-csv-btn",
							class: "apply-btn",
							onclick: parseData(csvInput as HTMLTextAreaElement, parseCSV),
						},
						"Preview",
					),
				),
				div({ id: "parsed-transactions-container" }, () =>
					parsedDataState.val.length > 0
						? renderParsedTransactions(
								parsedDataState.val,
								undefined,
								openImportModal,
								existing,
							)
						: "",
				),
			),
		);

		return modal;
	};

	return [
		ImportModalComponent,
		() => {
			if (!loggedIn.val) return "";
			return div(
				{
					class: "create-btn-container",
				},
				div(
					{ class: "create-btn-content" },
					a(
						{
							id: "create-new-transaction-btn",
							onclick: () => {
								openNewTransactionModal.val = true;
							},
						},
						"New Transaction",
					),
					a(
						{
							id: "import-transaction",
							onclick: () => {
								openImportModal.val = true;
							},
						},
						"Import...",
					),
					a(
						{
							id: "scan-receipt-action-btn",
							onclick: () => {
								openScanReceiptModal.val = true;
							},
						},
						"Scan Receipt",
					),
					a(
						{
							id: "sharing-btn",
							onclick: () => {
								// This needs to be wired up to openSharingModal from sharing.ts
								// But we can't import it here directly if it creates a cycle?
								// Actually, sharing.ts imports common.ts, adding.ts imports common.ts.
								// We can dispatch an event or use a shared state.
								// Or we can just export the open function and import it in main.ts and pass it down?
								// Or simpler: main.ts handles the button click?
								// But the button is created here.
								// Let's use a custom event for now to avoid circular deps if any.
								window.dispatchEvent(new CustomEvent("open-sharing-modal"));
							},
						},
						"Sharing",
					),
				),
				button(
					{
						class: "create-btn",
					},
					"+ New",
				),
			);
		},
	];
}
