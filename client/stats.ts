import van from "vanjs-core";
import { filteredTransactions, logout } from "./common.ts";

declare const Chart: any;

const { div, span, h3, canvas, aside, button } = van.tags;

export function StatsSidebar() {
	let categoryChart: any;
	let tagsChart: any;
	let personChart: any;
	let lastMonthChart: any;

	const categoryCanvas = canvas();
	const tagsCanvas = canvas();
	const personCanvas = canvas();
	const lastMonthCanvas = canvas();

	const createPieChart = (
		canvasEl: HTMLCanvasElement,
		data: any,
		label: string,
	) => {
		const ctx = canvasEl.getContext("2d");
		if (!ctx) return;
		return new Chart(ctx, {
			type: "pie",
			data: {
				labels: Object.keys(data),
				datasets: [
					{
						label: label,
						data: Object.values(data),
						backgroundColor: [
							"rgba(255, 99, 132, 0.8)",
							"rgba(54, 162, 235, 0.8)",
							"rgba(255, 206, 86, 0.8)",
							"rgba(75, 192, 192, 0.8)",
							"rgba(153, 102, 255, 0.8)",
							"rgba(255, 159, 64, 0.8)",
							"rgba(199, 199, 199, 0.8)",
							"rgba(83, 109, 254, 0.8)",
							"rgba(40, 180, 99, 0.8)",
							"rgba(244, 67, 54, 0.8)",
						],
						borderWidth: 1,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false,
					},
					title: {
						display: false,
					},
				},
			},
		});
	};

	const createBarChart = (
		canvasEl: HTMLCanvasElement,
		labels: string[],
		data: number[],
		label: string,
	) => {
		const ctx = canvasEl.getContext("2d");
		if (!ctx) return;
		return new Chart(ctx, {
			type: "bar",
			data: {
				labels: labels,
				datasets: [
					{
						label: label,
						data: data,
						backgroundColor: "rgba(75, 192, 192, 0.8)",
						borderWidth: 1,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false,
					},
					title: {
						display: false,
					},
				},
				scales: {
					y: {
						beginAtZero: true,
					},
				},
			},
		});
	};

	const updateBarChart = (chart: any, labels: string[], data: number[]) => {
		if (!chart) return;
		chart.data.labels = labels;
		chart.data.datasets[0].data = data;
		chart.update();
	};

	const updateChart = (chart: any, data: any) => {
		if (!chart) return;
		chart.data.labels = Object.keys(data);
		chart.data.datasets[0].data = Object.values(data);
		chart.update();
	};

	// Reactively update charts and calculate summary
	van.derive(() => {
		const transactions = filteredTransactions.val;

		// Category data
		const categoryData = transactions.reduce(
			(acc, tr) => {
				acc[tr.category] = (acc[tr.category] || 0) + Math.abs(tr.amount);
				return acc;
			},
			{} as Record<string, number>,
		);

		// Tags data
		const tagsData = transactions.reduce(
			(acc, tr) => {
				if (tr.tags.length === 0) {
					acc["Untagged"] = (acc["Untagged"] || 0) + Math.abs(tr.amount);
				} else {
					tr.tags.forEach((tag) => {
						acc[tag] = (acc[tag] || 0) + Math.abs(tr.amount);
					});
				}
				return acc;
			},
			{} as Record<string, number>,
		);

		// Person data
		const personData = transactions.reduce(
			(acc, tr) => {
				acc[tr.personName] = (acc[tr.personName] || 0) + Math.abs(tr.amount);
				return acc;
			},
			{} as Record<string, number>,
		);

		// Update or Create Charts
		if (!categoryChart) {
			categoryChart = createPieChart(
				categoryCanvas,
				categoryData,
				"By Category",
			);
		} else {
			updateChart(categoryChart, categoryData);
		}

		if (!tagsChart) {
			tagsChart = createPieChart(tagsCanvas, tagsData, "By Tags");
		} else {
			updateChart(tagsChart, tagsData);
		}

		if (!personChart) {
			personChart = createPieChart(personCanvas, personData, "By Person");
		} else {
			updateChart(personChart, personData);
		}

		// Last 30 days bar chart
		const dailyDataMap = new Map<string, number>();
		const today = new Date();
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(today.getDate() - 30);
		thirtyDaysAgo.setHours(0, 0, 0, 0);

		for (let i = 0; i < 31; i++) {
			const date = new Date(thirtyDaysAgo);
			date.setDate(date.getDate() + i);
			const dayKey = date.toISOString().split("T")[0] as string;
			dailyDataMap.set(dayKey, 0);
		}

		const transactionsInDateRange = transactions.filter((tr) => {
			const trDate = new Date(tr.occurredAt);
			return trDate >= thirtyDaysAgo;
		});

		transactionsInDateRange.forEach((tr) => {
			const dayKey = new Date(tr.occurredAt)
				.toISOString()
				.split("T")[0] as string;
			if (dailyDataMap.has(dayKey)) {
				dailyDataMap.set(
					dayKey,
					(dailyDataMap.get(dayKey) || 0) + Math.abs(tr.amount),
				);
			}
		});

		const sortedDailyData = new Map([...dailyDataMap.entries()].sort());

		const labels = Array.from(sortedDailyData.keys()).map((dateString) => {
			const date = new Date(dateString);
			const localDate = new Date(
				date.valueOf() + date.getTimezoneOffset() * 60 * 1000,
			);
			return localDate.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
		});
		const dataValues = Array.from(sortedDailyData.values());

		if (!lastMonthChart) {
			lastMonthChart = createBarChart(
				lastMonthCanvas,
				labels,
				dataValues,
				"Amount",
			);
		} else {
			updateBarChart(lastMonthChart, labels, dataValues);
		}
	});

	const summary = van.derive(() => {
		const transactions = filteredTransactions.val;
		const totalTransactions = transactions.length;
		const totalAmount = transactions.reduce((sum, tr) => sum + tr.amount, 0);
		const averageAmount =
			totalTransactions > 0 ? totalAmount / totalTransactions : 0;
		return { totalTransactions, totalAmount, averageAmount };
	});

	const isOpen = van.state(true);

	return aside(
		{
			class: () => `stats-sidebar${!isOpen.val ? " collapsed" : ""}`,
		},
		button(
			{
				class: "toggle-sidebar-btn hide-arrow",
				onclick: () => {
					isOpen.val = !isOpen.val;
				},
				title: () => (isOpen.val ? "Hide Sidebar" : "Show Sidebar"),
			},
			() => (isOpen.val ? "→" : "←"),
		),
		div(
			{ class: "sidebar-content" },
			div(
				{ class: "summary-card" },
				div({ class: "summary-header" }, h3("Summary")),
				div(
					{ class: "summary-grid" },
					div(
						{ class: "summary-stat" },
						span({ class: "stat-label" }, "Transactions"),
						span({ class: "stat-value" }, () => summary.val.totalTransactions),
					),
					div(
						{ class: "summary-stat" },
						span({ class: "stat-label" }, "Amount"),
						span({ class: "stat-value" }, "$", () =>
							Math.round(summary.val.totalAmount),
						),
					),
					div(
						{ class: "summary-stat" },
						span({ class: "stat-label" }, "Average"),
						span({ class: "stat-value" }, "$", () =>
							summary.val.averageAmount.toFixed(2),
						),
					),
				),
			),
			h3("Last 30 days"),
			div({ class: "pie-chart-container" }, lastMonthCanvas),
			h3("By Category"),
			div({ class: "pie-chart-container" }, categoryCanvas),
			h3("By Tags"),
			div({ class: "pie-chart-container" }, tagsCanvas),
			h3("By Person"),
			div({ class: "pie-chart-container" }, personCanvas),
			button(
				{
					class: "apply-btn",
					style: "display: block; margin-top: 20px;",
					onclick: () => logout(),
				},
				"Logout",
			),
		),
	);
}
