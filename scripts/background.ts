const LOG_ACTIVE = true;

const ALERTS_STORAGE_KEY = "chrome-bitbucket-alerts-alerts";
const USERNAME_STORAGE_KEY = "chrome-bitbucket-alerts-username";
const APP_PASSWORD_STORAGE_KEY = "chrome-bitbucket-alerts-app-password";
const REQUIRE_INTERACTION_STORAGE_KEY =
	"chrome-bitbucket-alerts-require-interaction";

const BASE_API_URL = "https://api.bitbucket.org/2.0/repositories";

interface BitBucketPullRequest {
	source: { branch: { name: string } };
	destination: { branch: { name: string } };
	state: "OPEN" | "MERGED" | "DECLINED";
	merge_commit: { hash: string };
}

interface BitBucketBuild {
	state: "INPROGRESS" | "SUCCESSFUL" | "FAILED";
}

interface BitBucketStatuses {
	values: BitBucketBuild[];
}

interface Alert {
	id: string;
	organisation: string;
	repository: string;
	pullRequest: string;
	sourceBranch?: string;
	destinationBranch?: string;
	pullRequestState?: BitBucketPullRequest["state"];
	buildState?: BitBucketBuild["state"];
	mergeCommitHash?: string;
	lastChange?: number;
}

// Dodgy way of differentiating Chrome and Firefox
const firefox = typeof window !== "undefined" && "browser" in window;

const log = (...args: unknown[]) => {
	if (LOG_ACTIVE) {
		console.info(...args);
	}
};

chrome.runtime.onMessage.addListener(
	(
		message: Pick<Alert, "organisation" | "repository" | "pullRequest">,
		_,
		sendResponse,
	) => {
		log("Message received:");
		log(message);

		chrome.storage.sync
			.get(ALERTS_STORAGE_KEY)
			.then(({ [ALERTS_STORAGE_KEY]: storedAlerts }) => {
				const alerts: Alert[] = Array.isArray(storedAlerts) ? storedAlerts : [];

				const newAlertId = `${message.organisation}--${message.repository}--${message.pullRequest}`;

				if (alerts.filter(({ id }) => id === newAlertId).length) {
					log("Alert already exists.");
					sendResponse({ alreadyExists: true });
					return;
				}

				const newAlert = { ...message, id: newAlertId };

				const newAlerts = [newAlert, ...alerts];

				log("Alerts are now:");
				log(newAlerts);

				chrome.storage.sync
					.set({ [ALERTS_STORAGE_KEY]: newAlerts })
					.then(() => {
						getAuthToken(true)
							.then((authToken) =>
								processAlert(newAlert, authToken, true)
									.then(() => {
										chrome.storage.sync.set({
											[ALERTS_STORAGE_KEY]: newAlerts,
										});
										sendResponse({ confirmed: true });
									})
									.catch((e) => {
										sendResponse({
											error: e,
											message:
												"Error. The page you're on might have been incorrectly recognised as a pull request.",
										});
									}),
							)
							.catch((e) => {
								sendResponse({
									error: e,
									message:
										"Error. BitBucket credentials are missing. Open the extension's dialog.",
								});
							});
					});
			})
			.catch((e) => sendResponse({ error: e }));

		return true; // to be able to use `sendResponse` asynchronously
	},
);

const notify = (
	title: string,
	message: string,
	negative?: boolean,
	action?: { title: string; link: string },
) => {
	chrome.storage.sync
		.get(REQUIRE_INTERACTION_STORAGE_KEY)
		.then(({ [REQUIRE_INTERACTION_STORAGE_KEY]: requireInteraction }) => {
			const notificationId = action?.link || Date.now().toString();

			chrome.notifications.create(notificationId, {
				type: "basic",
				iconUrl: negative ? "favicon-red.png" : "favicon-green.png",
				title,
				message,
				...(!firefox
					? { requireInteraction: !(requireInteraction === false) }
					: {}),
				...(action && !firefox ? { buttons: [{ title: action.title }] } : {}),
			});
		});
};

chrome.notifications.onButtonClicked.addListener((notificationId) =>
	chrome.tabs.create({ url: notificationId }),
);

const getAuthToken = async (throwOnError?: boolean): Promise<string> => {
	const username = (await chrome.storage.sync.get(USERNAME_STORAGE_KEY))[
		USERNAME_STORAGE_KEY
	];
	const appPassword = (await chrome.storage.sync.get(APP_PASSWORD_STORAGE_KEY))[
		APP_PASSWORD_STORAGE_KEY
	];

	if ((!username || !appPassword) && throwOnError) {
		throw new Error("Missing BitBucket credentials.");
	}

	return btoa(`${username}:${appPassword}`);
};

const processAlert = async (
	alert: Alert,
	authToken: string,
	throwOnError?: boolean,
) => {
	const seconds = new Date().getSeconds();

	log("Processing alert:");
	log(alert);

	if (alert.pullRequestState === "DECLINED") {
		log("Pull request is declined. Exiting.");
		return;
	}

	const age =
		!alert.lastChange || seconds - alert.lastChange < 4_3200
			? "<12h"
			: seconds - alert.lastChange < 60_4800
			? "<7d"
			: seconds - alert.lastChange < 2_592e3
			? "<30d"
			: "old";

	log(`Pull request age is ${age}`);

	const minutes = new Date().getMinutes();

	if (
		age === "old" ||
		(age === "<30d" && minutes !== 0) ||
		(age === "<7d" && minutes % 10 !== minutes / 10)
	) {
		log(`Delaying request. Exiting.`);
		return;
	}

	if (!alert.pullRequestState || alert.pullRequestState === "OPEN") {
		log("Requesting pull request...");

		let pullRequestRes: Response;

		try {
			pullRequestRes = await fetch(
				`${BASE_API_URL}/${alert.organisation}/${alert.repository}/pullrequests/${alert.pullRequest}`,
				{
					method: "GET",
					headers: {
						Authorization: `Basic ${authToken}`,
						Accept: "application/json",
					},
				},
			);
		} catch (e) {
			if (throwOnError) {
				throw e;
			}

			return;
		}

		if (pullRequestRes.status !== 200) {
			if (throwOnError) {
				throw new Error("BitBucket response isn't 200");
			}

			return;
		}

		const pullRequest: BitBucketPullRequest = await pullRequestRes.json();

		log("Pull request is:");
		log(pullRequest);

		alert.pullRequestState = pullRequest.state;
		alert.sourceBranch = pullRequest.source.branch.name;
		alert.destinationBranch = pullRequest.destination.branch.name;

		if (pullRequest.state === "OPEN") {
			log("Requesting pull request statuses...");

			let pullRequestStatusesRes: Response;

			try {
				pullRequestStatusesRes = await fetch(
					`${BASE_API_URL}/${alert.organisation}/${alert.repository}/pullrequests/${alert.pullRequest}/statuses`,
					{
						method: "GET",
						headers: {
							Authorization: `Basic ${authToken}`,
							Accept: "application/json",
						},
					},
				);
			} catch (e) {
				if (throwOnError) {
					throw e;
				}

				return;
			}

			if (pullRequestStatusesRes.status !== 200) {
				if (throwOnError) {
					throw new Error("BitBucket response isn't 200");
				}

				return;
			}

			const pullRequestStatuses: BitBucketStatuses =
				await pullRequestStatusesRes.json();

			log("Pull request statuses are:");
			log(pullRequestStatuses);

			const latestBuildState = pullRequestStatuses.values[0]?.state;

			if (latestBuildState && latestBuildState !== alert.buildState) {
				alert.buildState = latestBuildState;
				alert.lastChange = seconds;

				log(`Build state is now: ${latestBuildState}`);

				notify(
					latestBuildState === "SUCCESSFUL"
						? "Build complete"
						: "Build failed!",
					`${alert.repository}\n${alert.sourceBranch}`,
					latestBuildState === "SUCCESSFUL" ? undefined : true,
				);
			}
		} else {
			log(`Pull request is now: ${pullRequest.state}`);

			alert.pullRequestState = pullRequest.state;
			alert.buildState = undefined;
			alert.lastChange = seconds;

			if (pullRequest.state === "MERGED") {
				alert.mergeCommitHash = pullRequest.merge_commit.hash;
			}
		}
	}

	if (alert.pullRequestState === "MERGED") {
		log("Requesting merge commit statuses...");

		let mergeCommitStatusesRes: Response;

		try {
			mergeCommitStatusesRes = await fetch(
				`${BASE_API_URL}/${alert.organisation}/${alert.repository}/commit/${alert.mergeCommitHash}/statuses`,
				{
					method: "GET",
					headers: {
						Authorization: `Basic ${authToken}`,
						Accept: "application/json",
					},
				},
			);
		} catch (e) {
			if (throwOnError) {
				throw e;
			}

			return;
		}

		if (mergeCommitStatusesRes.status !== 200) {
			if (throwOnError) {
				throw new Error("BitBucket response isn't 200");
			}

			return;
		}

		const mergeCommitStatuses: BitBucketStatuses =
			await mergeCommitStatusesRes.json();

		log("Merge commit statuses are:");
		log(mergeCommitStatuses);

		const latestBuildState = mergeCommitStatuses.values[0]?.state;

		if (latestBuildState && latestBuildState !== alert.buildState) {
			alert.buildState = latestBuildState;
			alert.lastChange = seconds;

			log(`Build state is now: ${latestBuildState}`);

			notify(
				latestBuildState === "SUCCESSFUL" ? "Build complete" : "Build failed!",
				`${alert.repository}\n${alert.destinationBranch}`,
				latestBuildState === "SUCCESSFUL" ? undefined : true,
				latestBuildState === "SUCCESSFUL"
					? {
							title: "Open Octopus",
							link: `https://octopus.${alert.organisation}.io/app#/Spaces-1/projects/${alert.repository}/overview`,
					  }
					: undefined,
			);
		}
	}
};

let workInProgress = false;

setInterval(async () => {
	log("Starting work...");

	if (workInProgress) {
		return;
	}

	workInProgress = true;

	const alerts: Alert[] = (await chrome.storage.sync.get(ALERTS_STORAGE_KEY))[
		ALERTS_STORAGE_KEY
	];

	log("Alerts");
	log(alerts);

	if (!alerts) {
		log("No alerts. Exiting.");
		workInProgress = false;
		return;
	}

	const authToken = await getAuthToken();

	for (const alert of alerts) {
		await processAlert(alert, authToken);
	}

	chrome.storage.sync.set({ [ALERTS_STORAGE_KEY]: alerts });

	log("Finished!");

	workInProgress = false;
}, 60e3);
