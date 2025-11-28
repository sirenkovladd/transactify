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

const isOpen = van.state(false);

export function openSharingModal() {
	isOpen.val = true;
}

export function SharingModal() {
	const closeModal = () => {
		isOpen.val = false;
	};

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

	// Fetch data when modal opens
	van.derive(() => {
		if (isOpen.val) {
			fetchTokens();
			fetchSubscriptions();
		}
	});

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

	return () => {
		if (!isOpen.val) return "";

		return div(
			{
				id: "sharing-modal",
				class: "modal",
				style: "display: block;",
				onclick: (e) => {
					if (e.target === e.currentTarget) closeModal();
				},
			},
			div(
				{ class: "modal-content" },
				span({ class: "close-button", onclick: closeModal }, "×"),
				h3("Sharing Settings"),
				div(
					{ id: "sharing-settings-content" },
					Tokens,
					AddConnection,
					Subscriptions,
				),
			),
		);
	};
}
