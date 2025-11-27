import van from "vanjs-core";
import { setupAdding } from "./adding.ts";
import { openCategoryModal, setupCategoryModal } from "./category.ts";
import {
	activeTab,
	cardFilter,
	cards,
	categoriesFromTransaction,
	categoryFilter,
	convertTransaction,
	error,
	filteredTransactions,
	loading,
	loggedIn,
	merchantFilter,
	merchants,
	personFilter,
	persons,
	tagFilter,
	tags,
} from "./common.ts";
import { MultiSelect, setupFilters } from "./filter.ts";
import { GroupEls } from "./group.ts";
import { Login } from "./login.ts";
import "./main.css";
import { TransactionPopup } from "./popup.ts";
import { renderSharingSettings } from "./sharing.ts";
import { StatsSidebar } from "./stats.ts";
import { openTagModal, setupTagModal } from "./tags.ts";

const { div, span, aside, input, h2, label, button, main } = van.tags;

function setupSharingModal() {
	const sharingModal = document.getElementById("sharing-modal") as HTMLElement;
	const sharingBtn = document.getElementById("sharing-btn") as HTMLElement;
	const sharingCloseButton = sharingModal?.getElementsByClassName(
		"close-button",
	)[0] as HTMLElement;
	const sharingSettingsContent = document.getElementById(
		"sharing-settings-content",
	) as HTMLElement;

	if (
		sharingModal &&
		sharingBtn &&
		sharingCloseButton &&
		sharingSettingsContent
	) {
		sharingBtn.onclick = () => {
			sharingModal.style.display = "block";
			renderSharingSettings(sharingSettingsContent);
		};

		sharingCloseButton.onclick = () => {
			sharingModal.style.display = "none";
		};

		window.onclick = (event) => {
			if (event.target === sharingModal) {
				sharingModal.style.display = "none";
			}
		};
	}
}

function MobileFilter() {
	return div(
		{ class: "mobile-filter" },
		h2("Фільтри"),
		div(
			{ class: "filter-group" },
			label("Сума:"),
			div(
				{ class: "amount-filter-inputs" },
				input({ id: "amount-min-mobile", placeholder: "Min", type: "number" }),
				span("-"),
				input({ id: "amount-max-mobile", placeholder: "Max", type: "number" }),
			),
			div(
				{ class: "double-slider-container", id: "double-slider-mobile" },
				div({ class: "double-slider-track" }),
				div({ class: "double-slider-range", id: "double-slider-range-mobile" }),
				div({ class: "double-slider-thumb", id: "thumb-min-mobile" }),
				div({ class: "double-slider-thumb", id: "thumb-max-mobile" }),
			),
		),
		div(
			{ class: "filter-group" },
			label("Дата:"),
			div(
				{ class: "date-range-container", id: "date-range-mobile" },
				input({
					type: "text",
					class: "date-input",
					name: "start",
					placeholder: "From",
				}),
				span("-"),
				input({
					type: "text",
					class: "date-input",
					name: "end",
					placeholder: "To",
				}),
			),
		),
		div(
			{ class: "filter-group" },
			MultiSelect("Merchant", merchants, merchantFilter),
		),
		div({ class: "filter-group" }, MultiSelect("Card", cards, cardFilter)),
		div(
			{ class: "filter-group" },
			MultiSelect("Person", persons, personFilter),
		),
		div(
			{ class: "filter-group" },
			MultiSelect("Category", categoriesFromTransaction, categoryFilter),
		),
		div({ class: "filter-group" }, MultiSelect("Tag", tags, tagFilter)),
	);
}

function DesktopLayout() {
	return div(
		{ class: "desktop-layout" },
		aside(
			{ class: "sidebar" },
			div({ class: "sidebar-header" }, h2("Фільтри")),
			div(
				{ class: "filter-group" },
				label("Сума:"),
				div(
					{ class: "amount-filter-inputs" },
					input({ id: "amount-min", placeholder: "Min", type: "number" }),
					span("-"),
					input({ id: "amount-max", placeholder: "Max", type: "number" }),
				),
				div(
					{ class: "double-slider-container", id: "double-slider-desktop" },
					div({ class: "double-slider-track" }),
					div({
						class: "double-slider-range",
						id: "double-slider-range-desktop",
					}),
					div({ class: "double-slider-thumb", id: "thumb-min-desktop" }),
					div({ class: "double-slider-thumb", id: "thumb-max-desktop" }),
				),
			),
			div(
				{ class: "filter-group" },
				label("Дата:"),
				div(
					{ id: "date-range-desktop", class: "date-range-container" },
					input({
						type: "text",
						class: "date-input",
						name: "start",
						placeholder: "From",
					}),
					span("-"),
					input({
						type: "text",
						class: "date-input",
						name: "end",
						placeholder: "To",
					}),
				),
			),
			div(
				{ class: "filter-group" },
				MultiSelect("Merchant", merchants, merchantFilter),
			),
			div({ class: "filter-group" }, MultiSelect("Card", cards, cardFilter)),
			div(
				{ class: "filter-group" },
				MultiSelect("Person", persons, personFilter),
			),
			div(
				{ class: "filter-group" },
				MultiSelect("Category", categoriesFromTransaction, categoryFilter),
			),
			div({ class: "filter-group" }, MultiSelect("Tag", tags, tagFilter)),
			button({ class: "apply-btn desktop-btn" }, "Застосувати фільтри"),
		),
		main(
			{ class: "main-content" },
			div(
				{ class: "main-tab-container" },
				div(
					{
						class: () =>
							`main-tab${activeTab.val === "grouped" ? " active" : ""}`,
						onclick: () => {
							activeTab.val = "grouped";
						},
					},
					"Grouped",
				),
				div(
					{
						class: () =>
							`main-tab${activeTab.val === "transactions" ? " active" : ""}`,
						onclick: () => {
							activeTab.val = "transactions";
						},
					},
					"Transactions",
				),
			),
			div(
				{
					id: "grouped-content",
					class: () =>
						`main-tab-content${activeTab.val === "grouped" ? " active" : ""}`,
				},
				...GroupEls(),
			),
			div(
				{
					id: "transactions-content",
					class: () =>
						`main-tab-content${activeTab.val === "transactions" ? " active" : ""}`,
				},
				div(
					{ class: "transactions-actions" },
					span(
						{
							class: "add-tag-btn",
							onclick: () => {
								const ids = filteredTransactions.val.map((t) => t.id);
								if (ids.length > 0) {
									openTagModal(ids, "Add Tag to All Filtered");
								} else {
									alert("No transactions to tag.");
								}
							},
						},
						"+ Add Tag to All Filtered",
					),
					span(
						{
							class: "add-tag-btn",
							onclick: () => {
								const ids = filteredTransactions.val.map((t) => t.id);
								if (ids.length > 0) {
									openCategoryModal(ids, "Change Category for All Filtered");
								} else {
									alert("No transactions to change category.");
								}
							},
						},
						"Change Category for All Filtered",
					),
				),
				div({ class: "transactions-list" }, () => {
					if (loading.val) {
						return div("Loading...");
					}
					if (error.val) {
						return div(error.val);
					}
					return div(filteredTransactions.val.map(convertTransaction));
				}),
			),
		),
		StatsSidebar(),
	);
}

function Page() {
	return div({ class: "page-container" }, MobileFilter(), DesktopLayout());
}

function App() {
	if (loggedIn.val) {
		return Page();
	}
	return Login();
}

function mainInit() {
	van.add(document.body, App, TransactionPopup, ...setupAdding());

	queueMicrotask(() => {
		setupFilters();
		setupTagModal();
		setupCategoryModal();
		setupSharingModal(); // Call the new setup function
	});
}

document.addEventListener("DOMContentLoaded", mainInit);
