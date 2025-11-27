import van from "vanjs-core";
import {
	addConnection,
	generateToken,
	getSubscriptions,
	getTokens,
	revokeToken,
	type Subscription,
	unsubscribe,
} from "./common";
import "./sharing.css";

const { div, h3, button, input, ul, li, span } = van.tags;

export function renderSharingSettings(container: HTMLElement) {
	container.innerHTML = ""; // Clear previous content

	const tokens = van.state<string[]>([]);
	const subscriptions = van.state<{
		subscribers: string[];
		subscriptions: Subscription[];
	}>({ subscribers: [], subscriptions: [] });

	const fetchTokens = async () => {
		tokens.val = await getTokens();
	};

	const fetchSubscriptions = async () => {
		subscriptions.val = await getSubscriptions();
	};

	const Tokens = () =>
		div(
			h3("Your Sharing Tokens"),
			() =>
				ul(
					tokens.val.map((token) =>
						li(
							span(token),
							button(
								{
									onclick: async () => {
										await revokeToken(token);
										fetchTokens();
									},
								},
								"Revoke",
							),
						),
					),
				),
			button(
				{
					onclick: async () => {
						await generateToken();
						fetchTokens();
					},
				},
				"Generate New Token",
			),
		);

	const Subscriptions = () =>
		div(
			h3("Sharing Connections"),
			div(h3("They see my transactions"), () =>
				ul(
					subscriptions.val.subscribers.map((personName) =>
						li(
							span(personName),
							// No unsubscribe action for subscribers, as they are subscribing to you
						),
					),
				),
			),
			div(h3("I see their transactions"), () =>
				ul(
					subscriptions.val.subscriptions.map((sub) =>
						li(
							span(sub.PersonName),
							button(
								{
									onclick: async () => {
										await unsubscribe(sub.EncryptedUserID);
										fetchSubscriptions();
									},
								},
								"Unsubscribe",
							),
						),
					),
				),
			),
		);

	const AddConnection = () => {
		const tokenInput = input({ type: "text", placeholder: "Enter token" });
		return div(
			h3("Add Connection"),
			tokenInput,
			button(
				{
					onclick: async () => {
						await addConnection(tokenInput.value);
						fetchSubscriptions();
					},
				},
				"Add",
			),
		);
	};

	van.add(container, div(Tokens(), AddConnection(), Subscriptions()));

	fetchTokens();
	fetchSubscriptions();
}
