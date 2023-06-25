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

chrome.runtime.onMessage.addListener(
	(message: Pick<Alert, "organisation" | "repository" | "pullRequest">) => {
		console.info("Message received:");
		console.info(message);

		chrome.storage.sync
			.get(ALERTS_STORAGE_KEY)
			.then(({ [ALERTS_STORAGE_KEY]: storedAlerts }) => {
				const alerts: Alert[] = Array.isArray(storedAlerts) ? storedAlerts : [];

				const newAlertId = `${message.organisation}--${message.repository}--${message.pullRequest}`;

				if (alerts.filter(({ id }) => id === newAlertId).length) {
					console.info("Alert already exists.");
					return;
				}

				const newAlert = { ...message, id: newAlertId };

				const newAlerts = [newAlert, ...alerts];

				console.info("Alerts are now:");
				console.info(newAlerts);

				chrome.storage.sync.set({ [ALERTS_STORAGE_KEY]: newAlerts });

				getAuthToken().then((authToken) => processAlert(newAlert, authToken));
			});
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

const getAuthToken = async (): Promise<string> => {
	const username = (await chrome.storage.sync.get(USERNAME_STORAGE_KEY))[
		USERNAME_STORAGE_KEY
	];
	const appPassword = (await chrome.storage.sync.get(APP_PASSWORD_STORAGE_KEY))[
		APP_PASSWORD_STORAGE_KEY
	];

	return btoa(`${username}:${appPassword}`);
};

const processAlert = async (alert: Alert, authToken: string) => {
	const seconds = new Date().getSeconds();

	console.info("Processing alert:");
	console.info(alert);

	if (alert.pullRequestState === "DECLINED") {
		console.info("Pull request is declined. Exiting.");
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

	console.info(`Pull request age is ${age}`);

	const minutes = new Date().getMinutes();

	if (
		age === "old" ||
		(age === "<30d" && minutes !== 0) ||
		(age === "<7d" && minutes % 10 !== minutes / 10)
	) {
		console.info(`Delaying request. Exiting.`);
		return;
	}

	if (!alert.pullRequestState || alert.pullRequestState === "OPEN") {
		console.info("Requesting pull request...");

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
		} catch {
			return;
		}

		if (pullRequestRes.status !== 200) {
			return;
		}

		const pullRequest: BitBucketPullRequest = await pullRequestRes.json();

		console.info("Pull request is:");
		console.info(pullRequest);

		alert.pullRequestState = pullRequest.state;
		alert.sourceBranch = pullRequest.source.branch.name;
		alert.destinationBranch = pullRequest.destination.branch.name;

		if (pullRequest.state === "OPEN") {
			console.info("Requesting pull request statuses...");

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
			} catch {
				return;
			}

			if (pullRequestStatusesRes.status !== 200) {
				return;
			}

			const pullRequestStatuses: BitBucketStatuses =
				await pullRequestStatusesRes.json();

			console.info("Pull request statuses are:");
			console.info(pullRequestStatuses);

			const latestBuildState = pullRequestStatuses.values[0]?.state;

			if (latestBuildState && latestBuildState !== alert.buildState) {
				alert.buildState = latestBuildState;
				alert.lastChange = seconds;

				console.info(`Build state is now: ${latestBuildState}`);

				notify(
					latestBuildState === "SUCCESSFUL"
						? "Build complete"
						: "Build failed!",
					`${alert.repository}\n${alert.sourceBranch}`,
					latestBuildState === "SUCCESSFUL" ? undefined : true,
				);
			}
		} else {
			console.info(`Pull request is now: ${pullRequest.state}`);

			alert.pullRequestState = pullRequest.state;
			alert.buildState = undefined;
			alert.lastChange = seconds;

			if (pullRequest.state === "MERGED") {
				alert.mergeCommitHash = pullRequest.merge_commit.hash;
			}
		}
	}

	if (alert.pullRequestState === "MERGED") {
		console.info("Requesting merge commit statuses...");

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
		} catch {
			return;
		}

		if (mergeCommitStatusesRes.status !== 200) {
			return;
		}

		const mergeCommitStatuses: BitBucketStatuses =
			await mergeCommitStatusesRes.json();

		console.info("Merge commit statuses are:");
		console.info(mergeCommitStatuses);

		const latestBuildState = mergeCommitStatuses.values[0]?.state;

		if (latestBuildState && latestBuildState !== alert.buildState) {
			alert.buildState = latestBuildState;
			alert.lastChange = seconds;

			console.info(`Build state is now: ${latestBuildState}`);

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
	console.log("Starting work...");

	if (workInProgress) {
		return;
	}

	workInProgress = true;

	const alerts: Alert[] = (await chrome.storage.sync.get(ALERTS_STORAGE_KEY))[
		ALERTS_STORAGE_KEY
	];

	console.info("Alerts");
	console.info(alerts);

	if (!alerts) {
		console.info("No alerts. Exiting.");
		workInProgress = false;
		return;
	}

	const authToken = await getAuthToken();

	for (const alert of alerts) {
		await processAlert(alert, authToken);
	}

	chrome.storage.sync.set({ [ALERTS_STORAGE_KEY]: alerts });

	console.info("Finished!");

	workInProgress = false;
}, 60e3);
