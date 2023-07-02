const LOG_ACTIVE = false;

const ALERTS_STORAGE_KEY = "chrome-bitbucket-alerts-alerts";
const USERNAME_STORAGE_KEY = "chrome-bitbucket-alerts-username";
const APP_PASSWORD_STORAGE_KEY = "chrome-bitbucket-alerts-app-password";
const REQUIRE_INTERACTION_STORAGE_KEY =
	"chrome-bitbucket-alerts-require-interaction";

const ALARM_NAME = "main-task";

const BASE_API_URL = "https://api.bitbucket.org/2.0/repositories";
const BASE_PULL_REQUEST_URL = "https://bitbucket.org";

interface BitBucketPullRequest {
	source: { branch: { name: string }; commit: { hash: string } };
	destination: { branch: { name: string } };
	state: "OPEN" | "MERGED" | "DECLINED";
	merge_commit: { hash: string };
}

interface BitBucketBuild {
	state: "INPROGRESS" | "SUCCESSFUL" | "FAILED";
}

interface BitBucketStatuses {
	values: (BitBucketBuild | undefined)[]; // the addition of `undefined` is to provide the behaviour of noUncheckedIndexedAccess in the editor (because it's configured in the separate `tsconfig.scripts.json` which is active at build time only)
}

interface BitBucketTag {
	name: string;
	target: { type: string; hash: string };
}

interface BitBucketTags {
	values: (BitBucketTag | undefined)[]; // the addition of `undefined` is to provide the behaviour of noUncheckedIndexedAccess in the editor (because it's configured in the separate `tsconfig.scripts.json` which is active at build time only)
}

interface Alert {
	id: string;
	organisation: string;
	repository: string;
	pullRequest: string;
	sourceBranch?: string;
	destinationBranch?: string;
	commitHash?: string;
	pullRequestState?: BitBucketPullRequest["state"];
	buildState?: BitBucketBuild["state"];
	mergeCommitHash?: string;
	buildTag?: string;
	toBeDeleted?: boolean;
	lastChange?: number;
	old?: boolean;
}

// Dodgy way of differentiating Chrome and Firefox
const firefox = typeof window !== "undefined" && "browser" in window;

const log = (...args: unknown[]) => {
	if (LOG_ACTIVE) {
		console.info(...args);
	}
};

let workInProgress = false;

const waitForRunwayClear = () =>
	new Promise<void>((resolve) => {
		if (!workInProgress) {
			resolve();
			return;
		}

		log("Runway busy");

		// It seems that service workers are paused after 30 seconds of inactivity, so we shouldn't need to set up an alarm here
		const interval = setInterval(() => {
			log("Waiting for runway to clear...");

			if (!workInProgress) {
				clearInterval(interval);
				resolve();
			}
		}, 100);
	});

const createAlert = async (
	newAlert: Alert,
	sendResponse: (response?: unknown) => void,
) => {
	await waitForRunwayClear();

	workInProgress = true;

	let storedAlerts: Alert[] | null;

	try {
		storedAlerts = (await chrome.storage.sync.get(ALERTS_STORAGE_KEY))[
			ALERTS_STORAGE_KEY
		];
	} catch (e) {
		sendResponse({
			error: e,
			message: "Error. There seems to be a problem with browser storage.",
		});
		workInProgress = false;
		return;
	}

	const alerts: Alert[] = Array.isArray(storedAlerts) ? storedAlerts : [];

	if (alerts.filter(({ id }) => id === newAlert.id).length) {
		log("Alert already exists.");
		sendResponse({ alreadyExists: true });
		workInProgress = false;
		return;
	}

	const newAlerts = [newAlert, ...alerts];

	log("Alerts are now:");
	log(newAlerts);

	try {
		await chrome.storage.sync.set({ [ALERTS_STORAGE_KEY]: newAlerts });
	} catch (e) {
		sendResponse({
			error: e,
			message: "Error. There seems to be a problem with browser storage.",
		});
		workInProgress = false;
		return;
	}

	let authToken: string;

	try {
		authToken = await getAuthToken(true);
	} catch (e) {
		sendResponse({
			error: e,
			message:
				"Error. BitBucket credentials are missing. Open the extension's dialog.",
		});
		workInProgress = false;
		return;
	}

	try {
		await processAlertInPlace(newAlert, authToken, true);
	} catch (e) {
		sendResponse({
			error: e,
			message:
				"Error. The page you're on might have been incorrectly recognised as a pull request.",
		});
		workInProgress = false;
		return;
	}

	try {
		chrome.storage.sync.set({ [ALERTS_STORAGE_KEY]: newAlerts });
	} catch (e) {
		sendResponse({
			error: e,
			message: "Error. There seems to be a problem with browser storage.",
		});
		workInProgress = false;
		return;
	}

	sendResponse({ confirmed: true });
	workInProgress = false;
};

const removeAlert = async (id: string) => {
	await waitForRunwayClear();

	workInProgress = true;

	log("Removing alert...");

	let storedAlerts: Alert[] | null;

	try {
		storedAlerts = (await chrome.storage.sync.get(ALERTS_STORAGE_KEY))[
			ALERTS_STORAGE_KEY
		];
	} catch (e) {
		workInProgress = false;
		return;
	}

	if (storedAlerts) {
		try {
			chrome.storage.sync.set({
				[ALERTS_STORAGE_KEY]: storedAlerts.filter((alert) => alert.id !== id),
			});
		} catch (e) {
			workInProgress = false;
			return;
		}
	}

	log("Alert removed.");

	workInProgress = false;
};

chrome.runtime.onMessage.addListener(
	(
		message:
			| ({ type: "new-alert" } & Pick<
					Alert,
					"organisation" | "repository" | "pullRequest"
			  >)
			| { type: "remove-alert"; id: string },
		_,
		sendResponse,
	) => {
		log("Message received:");
		log(message);

		if (message.type === "new-alert") {
			const id = `${message.organisation}--${message.repository}--${message.pullRequest}`;

			createAlert(
				{
					id,
					organisation: message.organisation,
					repository: message.repository,
					pullRequest: message.pullRequest,
				},
				sendResponse,
			);
		} else if (message.type === "remove-alert") {
			removeAlert(message.id);
		}

		return true;
	},
);

const notify = (
	title: string,
	message: string,
	negative?: boolean,
	action?: { title: string; link: string },
) =>
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

const processAlertInPlace = async (
	alert: Alert,
	authToken: string,
	throwOnError?: boolean,
) => {
	const now = Date.now();

	log("Processing alert:");
	log(alert);

	if (alert.pullRequestState === "DECLINED") {
		log("Pull request is declined. Exiting.");
		return;
	}

	if (alert.old) {
		log("Pull request is old. Exiting.");
		return;
	}

	const age = alert.lastChange ? now - alert.lastChange : 0;

	const _1h = 1e3 * 60 * 60;
	const _12h = 1e3 * 60 * 60 * 12;
	const _30d = 1e3 * 60 * 60 * 24 * 30;

	log(
		`Pull request age is ${age}, ${
			age > _30d
				? "> 30 days"
				: age > _12h
				? "> 12 hours"
				: age > _1h
				? "> 1 hour"
				: "< 1 hour"
		}`,
	);

	if (
		alert.pullRequestState === "MERGED" &&
		alert.buildState === "SUCCESSFUL"
	) {
		if (age > _30d) {
			alert.toBeDeleted = true;
			log(
				"Pull request is merged, build is complete, alert is old so will be deleted. Exiting.",
			);
		} else {
			log("Pull request is merged and build is complete. Exiting.");
		}

		return;
	}

	const minutes = new Date().getMinutes();

	if ((age > _12h && minutes !== 0) || (age > _1h && minutes % 5 !== 0)) {
		if (age > _30d) {
			alert.old = true;
			log(`Alert marked as old.`);
		}

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

		const newCommitHash = pullRequest.source.commit.hash;

		const commitHashHasChanged = alert.commitHash !== newCommitHash;

		if (commitHashHasChanged) {
			log(`Pull request commit hash has changed and is now: ${newCommitHash}`);
		}

		if (
			alert.pullRequestState !== pullRequest.state ||
			alert.sourceBranch !== pullRequest.source.branch.name ||
			alert.destinationBranch !== pullRequest.destination.branch.name ||
			commitHashHasChanged
		) {
			alert.pullRequestState = pullRequest.state;
			alert.sourceBranch = pullRequest.source.branch.name;
			alert.destinationBranch = pullRequest.destination.branch.name;
			alert.commitHash = newCommitHash;
			alert.lastChange = now;
		}

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

			const newBuildState = pullRequestStatuses.values[0]?.state;

			const buildStateHasChanged = alert.buildState !== newBuildState;

			if (buildStateHasChanged) {
				log(
					`Pull request build state has changed and is now: ${newBuildState}`,
				);
				alert.buildState = newBuildState;
				alert.lastChange = now;
			}

			if (
				newBuildState &&
				(commitHashHasChanged || buildStateHasChanged) &&
				newBuildState !== "INPROGRESS"
			) {
				notify(
					newBuildState === "SUCCESSFUL" ? "Build complete" : "Build failed!",
					`${alert.repository}\n${alert.sourceBranch}`,
					newBuildState === "SUCCESSFUL" ? undefined : true,
					{
						title: "Open in BitBucket",
						link: `${BASE_PULL_REQUEST_URL}/${alert.organisation}/${alert.repository}/pull-requests/${alert.pullRequest}`,
					},
				);
			}
		} else {
			log(`Pull request is now: ${pullRequest.state}`);

			alert.pullRequestState = pullRequest.state;
			alert.buildState = undefined;
			alert.lastChange = now;

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

		const newBuildState = mergeCommitStatuses.values[0]?.state;

		if (newBuildState && newBuildState !== alert.buildState) {
			alert.buildState = newBuildState;
			alert.lastChange = now;

			log(`Merge commit build state is now: ${newBuildState}`);

			if (newBuildState !== "INPROGRESS") {
				if (newBuildState === "SUCCESSFUL") {
					let tagsRes: Response;

					try {
						tagsRes = await fetch(
							`${BASE_API_URL}/${alert.organisation}/${alert.repository}/refs/tags?sort=-name`,
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

					if (tagsRes.status !== 200) {
						if (throwOnError) {
							throw new Error("BitBucket response isn't 200");
						}

						return;
					}

					const tags: BitBucketTags = await tagsRes.json();

					log("Tags are:");
					log(tags);

					const newTag = tags.values.filter(
						(tag) =>
							tag &&
							tag.target.type === "commit" &&
							alert.mergeCommitHash &&
							(tag.target.hash.startsWith(alert.mergeCommitHash) ||
								alert.mergeCommitHash.startsWith(tag.target.hash)),
					)[0]?.name;

					if (newTag) {
						alert.buildTag = newTag;
					}
				}

				notify(
					newBuildState === "SUCCESSFUL" ? "Build complete" : "Build failed!",
					`${alert.repository}\n${alert.destinationBranch}${
						alert.buildTag ? `\n${alert.buildTag}` : ""
					}`,
					newBuildState === "SUCCESSFUL" ? undefined : true,
					newBuildState === "SUCCESSFUL"
						? {
								title: "Open in Octopus",
								link: `https://octopus.${alert.organisation}.io/app#/Spaces-1/projects/${alert.repository}/overview`,
						  }
						: undefined,
				);
			}
		}
	}
};

chrome.alarms.create(ALARM_NAME, {
	periodInMinutes: 0.99, // a margin to make sure we don't miss the 0th minute
});

chrome.alarms.onAlarm.addListener(async () => {
	log("Starting work...");

	if (workInProgress) {
		return;
	}

	workInProgress = true;

	let alerts: Alert[];

	try {
		alerts = (await chrome.storage.sync.get(ALERTS_STORAGE_KEY))[
			ALERTS_STORAGE_KEY
		];
	} catch (e) {
		log(e);
		workInProgress = false;
		return;
	}

	log("Alerts");
	log(alerts);

	if (!alerts) {
		log("No alerts. Exiting.");
		workInProgress = false;
		return;
	}

	const authToken = await getAuthToken();

	for (const alert of alerts) {
		await processAlertInPlace(alert, authToken);
	}

	try {
		chrome.storage.sync.set({
			[ALERTS_STORAGE_KEY]: alerts.filter(({ toBeDeleted }) => !toBeDeleted),
		});
	} catch (e) {
		log(e);
		workInProgress = false;
		return;
	}

	log("Finished!");

	workInProgress = false;
});
