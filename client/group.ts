import van from "vanjs-core";
import {
	convertTransaction,
	fetchTransactions,
	filteredTransactions,
	groupedOption,
	groupedOptions,
	groupedOptionsSortFn,
	type Transaction,
} from "./common.ts";
import "./group.css";
import { openTagModal } from "./tags.ts";

const { div, h3, details, summary, span } = van.tags;

export type GroupedTransactions = {
	key: string;
	transactions: Transaction[];
	total: number;
};

function groupTransactions(
	transactions: Transaction[],
	keyExtractor: (tr: Transaction) => string | string[],
	sortFn?: (a: GroupedTransactions, b: GroupedTransactions) => number,
): GroupedTransactions[] {
	const grouped: Record<string, Transaction[]> = {};
	for (const tr of transactions) {
		const key = keyExtractor(tr);
		if (Array.isArray(key)) {
			for (const k of key) {
				if (!grouped[k]) {
					grouped[k] = [];
				}
				grouped[k].push(tr);
			}
		} else {
			if (!grouped[key]) {
				grouped[key] = [];
			}
			grouped[key].push(tr);
		}
	}
	const groupedTransactions = Object.entries(grouped).map(
		([key, transactions]) => ({
			key,
			transactions,
			total: transactions.reduce((acc, tr) => acc + tr.amount, 0),
		}),
	);
	if (sortFn) {
		groupedTransactions.sort(sortFn);
	}
	return groupedTransactions;
}

function getCommonTags(transactions: Transaction[]): string[] {
	if (!transactions || transactions.length === 0) {
		return [];
	}
	const tagCounts: Record<string, number> = {};
	for (const tr of transactions) {
		// Ensure tr.tags is an array
		const tags = Array.isArray(tr.tags) ? tr.tags : [];
		for (const tag of tags) {
			tagCounts[tag] = (tagCounts[tag] || 0) + 1;
		}
	}
	const commonTags: string[] = [];
	for (const tag in tagCounts) {
		if (tagCounts[tag] === transactions.length) {
			commonTags.push(tag);
		}
	}
	return commonTags;
}

async function manageGroupTags(
	transactionIDs: number[],
	tag: string,
	action: "add" | "remove",
) {
	try {
		const response = await fetch("/api/transactions/tags", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ transaction_ids: transactionIDs, tag, action }),
		});
		if (!response.ok) {
			throw new Error("Failed to update tags");
		}
		fetchTransactions(); // Refresh data
	} catch (err) {
		console.error(err);
		alert("Error updating tags.");
	}
}

import { subGroupMap as subGroupMapState } from "./common.ts";

const defaultSubGroupMap: Record<string, string> = {
	'parking spot': 'rent',
	'tenant insurance': 'rent',
	'bc hydro': 'rent',
	'internet': 'rent',
	'movies': 'subscriptions',
	'london drugs': 'toiletries',
	'vlad': 'sports',
	'dental': 'health',
	'film': 'hobbies',
	'books': 'hobbies',
	'english': 'studies',
	'french': 'studies',
	'preply': 'studies',
	'interest': 'banking',
	'hotel': 'travel'
};

const subGroupMap = new Proxy({} as any, {
	get(_, prop: string) {
		return subGroupMapState.val[prop] || defaultSubGroupMap[prop];
	}
});


function getSubGroupName(group: string): string {
	const normalizedGroup = group.trim().toLowerCase();

	// Returns the mapped value, or falls back to the original group name
	// if it's not found in the map (e.g., "sauna")
	return subGroupMap[normalizedGroup] || group;
}

async function copyAllGroupsToClipboard(title: string, grouped: GroupedTransactions[]) {
	let text = `${title}\t\t\t\t\n\t\t\t\t\n\t\t\t\t\n\tType\tAmount\tCurrency\tCAD\n`;

	let htmlData = `<google-sheets-html-origin style="color: rgb(0, 0, 0); font-size: medium; font-family: Arial; font-style: normal; font-weight: 400; text-align: start;">
<table cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout: fixed; font-size: 10pt; font-family: Arial; width: 0px; border-collapse: collapse; border: none;">
<colgroup><col width="100"><col width="100"><col width="100"><col width="100"><col width="100"></colgroup>
<tbody>
<tr style="height: 21px;"><td rowspan="2" colspan="5" style="border: 1px solid rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom; background-color: rgb(244, 204, 204); font-weight: bold; text-align: center;"><span><div style="max-height: 42px;">${title}</div></span></td></tr>
<tr style="height: 21px;"></tr>
<tr style="height: 21px;"><td rowspan="1" colspan="5" style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(0, 0, 0); border-image: initial; overflow: hidden; padding: 2px 3px; vertical-align: bottom; background-color: rgb(208, 224, 227);"></td></tr>
<tr style="height: 21px;">
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom; font-weight: bold;">Type</td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom; font-weight: bold;">Amount</td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom; font-weight: bold;">Currency</td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(0, 0, 0) rgb(0, 0, 0) rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom; font-weight: bold;">CAD</td>
</tr>
`;

	const additional = [
		{
			key: 'rent',
			total: 2800
		},
	];

	[
		...additional,
		...grouped
	].forEach((g, i) => {
		const rowIndex = 6 + i;
		const groupName = g.key || '';
		const amount = g.total.toFixed(2);
		const cur = 'CAD';
		const formula = `=IF(J${rowIndex}="CAD";1;GOOGLEFINANCE("CURRENCY:"&J${rowIndex}&"CAD"))*I${rowIndex}`;
		text += `${groupName}\t${getSubGroupName(groupName)}\t${amount}\t${cur}\t${formula}\n`;

		htmlData += `<tr style="height: 21px;">
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;">${groupName}</td>
<td style="border: 1px solid rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom;">${getSubGroupName(groupName)}</td>
<td style="border: 1px solid rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom; text-align: right;">${amount}</td>
<td style="border: 1px solid rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom;">${cur}</td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(0, 0, 0) rgb(204, 204, 204) rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom; text-align: right;">${formula}</td>
</tr>`;
	});

	// Empty row
	text += `\t\t\t\t\n`;
	htmlData += `<tr style="height: 21px;">
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(0, 0, 0) rgb(0, 0, 0) rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
</tr>`;

	// Sum text row
	text += `\t\t\tSum\t\n`;
	htmlData += `<tr style="height: 21px;">
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border: 1px solid rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border: 1px solid rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom; background-color: rgb(255, 255, 255);"></td>
<td rowspan="1" colspan="2" style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(0, 0, 0) rgb(204, 204, 204) rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom; background-color: rgb(255, 255, 255); font-weight: bold;">Sum</td>
</tr>`;

	const formulaSum = `=SUM(K6:K${5 + grouped.length + additional.length})`;
	text += `\t\t\t\t${formulaSum}\n`;
	htmlData += `<tr style="height: 21px;">
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(204, 204, 204) rgb(0, 0, 0); overflow: hidden; padding: 2px 3px; vertical-align: bottom;"></td>
<td style="border-width: 1px; border-style: solid; border-color: rgb(204, 204, 204) rgb(0, 0, 0) rgb(0, 0, 0) rgb(204, 204, 204); overflow: hidden; padding: 2px 3px; vertical-align: bottom; text-align: right;">${formulaSum}</td>
</tr></tbody></table></google-sheets-html-origin>`;

	const htmlBlob = new Blob([htmlData], { type: 'text/html' });
	const textBlob = new Blob([text], { type: 'text/plain' });

	try {
		await navigator.clipboard.write([
			new window.ClipboardItem({
				'text/html': htmlBlob,
				'text/plain': textBlob
			})
		]);
		console.log('Дані з метаданими скопійовано!');
	} catch (err) {
		console.error('Помилка копіювання:', err);
	}
}

export function GroupEls() {
	return [
		div(
			{ class: "grouped-options" },
			Object.keys(groupedOptions).map((o) => {
				return div(
					{
						class: () => `option${groupedOption.val === o ? " active" : ""}`,
						onclick: () => {
							groupedOption.val = o as keyof typeof groupedOptions;
						},
					},
					o,
				);
			}),
		),
		div({ id: "grouped-by-content" }, () => {
			const grouped = groupTransactions(
				filteredTransactions.val,
				groupedOptions[groupedOption.val],
				groupedOptionsSortFn[groupedOption.val],
			);
			return div(
				{ style: "display: contents;" },
				div(
					{ style: "text-align: right; margin-bottom: 10px;" },
					span(
						{
							class: "add-tag-btn",
							style: "background-color: #0f9d58; color: white; border: none; cursor: pointer; padding: 6px 10px; border-radius: 4px; font-weight: bold;",
							onclick: (e: Event) => {
								e.preventDefault();
								copyAllGroupsToClipboard("EXPENSES", grouped);
							},
						},
						"📄 Copy Groups to Google Sheets",
					),
				),
				grouped.map(({ key, transactions, total }) => {
					const commonTags = getCommonTags(transactions);
					const transactionIDs = transactions.map((t) => t.id);
					return details(
						summary(
							h3(`${key} - ${total.toFixed(2)}`),
							div(
								{ class: "summary-tags" },
								...commonTags.map((tag) =>
									span(
										{ class: "group-tag" },
										tag,
										span(
											{
												class: "remove-tag-btn",
												onclick: (e: Event) => {
													e.preventDefault();
													e.stopPropagation();
													if (
														confirm(
															`Remove tag "${tag}" from all transactions in this group?`,
														)
													) {
														manageGroupTags(transactionIDs, tag, "remove");
													}
												},
											},
											"×",
										),
									),
								),
								span(
									{
										class: "add-tag-btn",
										onclick: (e: Event) => {
											e.preventDefault();
											e.stopPropagation();
											openTagModal(transactionIDs, `Add Tag to ${key}`);
										},
									},
									"+ Tag",
								),
							),
						),
						() =>
							div(
								{ style: "display: contents;" },
								transactions.map(convertTransaction),
							),
					);
				}),
			);
		}),
	];
}
