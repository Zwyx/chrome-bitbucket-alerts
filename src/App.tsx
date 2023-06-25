import {
	LucideArrowRight,
	LucideBellPlus,
	LucideSettings,
	LucideTrash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "./utils";
import favicon from "/favicon-green.png";

const ALERTS_STORAGE_KEY = "chrome-bitbucket-alerts-alerts";
const USERNAME_STORAGE_KEY = "chrome-bitbucket-alerts-username";
const APP_PASSWORD_STORAGE_KEY = "chrome-bitbucket-alerts-app-password";
const REQUIRE_INTERACTION_STORAGE_KEY =
	"chrome-bitbucket-alerts-require-interaction";

const BASE_PULL_REQUEST_URL = "https://bitbucket.org";

interface BitBucketPullRequest {
	source: { branch: { name: string } };
	destination: { branch: { name: string } };
	state: "OPEN" | "MERGED" | "DECLINED";
	merge_commit: { hash: string };
}

interface BitBucketBuild {
	state: "INPROGRESS" | "SUCCESSFUL" | "FAILED";
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

function App() {
	const [username, setUsername] = useState("");
	const [appPassword, setAppPassword] = useState("");
	const [requireInteraction, setRequireInteraction] = useState(true);

	const [alerts, setAlerts] = useState<Alert[]>([]);

	const [settingsView, setSettingsView] = useState(false);

	useEffect(() => {
		if (chrome.storage) {
			chrome.storage.sync
				.get(USERNAME_STORAGE_KEY)
				.then(({ [USERNAME_STORAGE_KEY]: storedUsername }) => {
					if (typeof storedUsername === "string") {
						setUsername(storedUsername);
					}
				})
				.catch(console.error);

			chrome.storage.sync
				.get(APP_PASSWORD_STORAGE_KEY)
				.then(({ [APP_PASSWORD_STORAGE_KEY]: storedAppPassword }) => {
					if (typeof storedAppPassword === "string") {
						setAppPassword(storedAppPassword);
					}
				})
				.catch(console.error);

			chrome.storage.sync
				.get(REQUIRE_INTERACTION_STORAGE_KEY)
				.then(
					({ [REQUIRE_INTERACTION_STORAGE_KEY]: storedRequireInteraction }) => {
						if (typeof storedRequireInteraction === "boolean") {
							setRequireInteraction(storedRequireInteraction);
						}
					},
				)
				.catch(console.error);

			chrome.storage.sync
				.get(ALERTS_STORAGE_KEY)
				.then(({ [ALERTS_STORAGE_KEY]: storedAlerts }) => {
					if (Array.isArray(storedAlerts)) {
						setAlerts(storedAlerts);
					}
				});
			setAlerts([]);

			chrome.storage.sync.onChanged.addListener(
				({ [ALERTS_STORAGE_KEY]: newAlerts }) => {
					if (newAlerts?.newValue) {
						setAlerts(newAlerts.newValue);
					}
				},
			);
		}
	}, []);

	const updateUsername = useCallback((newUsername: string) => {
		if (chrome.storage) {
			chrome.storage.sync
				.set({ [USERNAME_STORAGE_KEY]: newUsername })
				.catch(console.error);
		}
		setUsername(newUsername);
	}, []);

	const updateAppPassword = useCallback((newAppPassword: string) => {
		if (chrome.storage) {
			chrome.storage.sync
				.set({ [APP_PASSWORD_STORAGE_KEY]: newAppPassword })
				.catch(console.error);
		}
		setAppPassword(newAppPassword);
	}, []);

	const updateRequireInteraction = useCallback(
		(newRequireInteraction: boolean) => {
			if (chrome.storage) {
				chrome.storage.sync
					.set({
						[REQUIRE_INTERACTION_STORAGE_KEY]: newRequireInteraction,
					})
					.catch(console.error);
			}
			setRequireInteraction(newRequireInteraction);
		},
		[],
	);

	const notify = useCallback(() => {
		if (chrome.notifications) {
			chrome.notifications.create({
				type: "basic",
				iconUrl: "favicon-green.png",
				title: "Hello!",
				message: "Hope you like it.",
				requireInteraction,
			});
		} else {
			alert("Notifications seem unavailable");
		}
	}, [requireInteraction]);

	const removeAlert = useCallback(
		(id: string) => {
			console.log(id);
			console.log(alerts);
			const newAlerts = alerts.filter((alert) => alert.id !== id);
			console.log(newAlerts);
			chrome.storage.sync.set({ [ALERTS_STORAGE_KEY]: newAlerts });
		},
		[alerts],
	);

	return (
		<div className="flex max-h-[550px] w-[500px] flex-col gap-6 overflow-auto p-8">
			<div className="flex justify-between">
				<img src={favicon} width={20} alt="logo" />

				{(!username || !appPassword) && !settingsView && (
					<div className="mx-2 flex flex-1 items-center justify-end text-orange-500">
						<div className="mr-1 text-sm leading-none">
							Configure your BitBucket credentials
						</div>
						<LucideArrowRight size={20} />
					</div>
				)}

				<button
					onClick={() =>
						setSettingsView((prevSettingsView) => !prevSettingsView)
					}
				>
					<LucideSettings size={20} />
				</button>
			</div>

			{settingsView && (
				<div className=" flex flex-col gap-4">
					<div>
						<label htmlFor="username" className="select-none">
							BitBucket username
						</label>

						<span>
							{" "}
							– find yours{" "}
							<a
								className="text-blue-600 dark:text-blue-400"
								href="https://bitbucket.org/account/settings/"
								target="_blank"
								rel="noopener noreferrer"
							>
								here
							</a>
						</span>

						<input
							id="username"
							className="w-full rounded border border-gray-600 dark:border-gray-400"
							value={username}
							onChange={(e) => updateUsername(e.target.value)}
						/>
					</div>

					<div>
						<label htmlFor="appPassword" className="select-none">
							BitBucket read only access app password
						</label>

						<span>
							{" "}
							– create one{" "}
							<a
								className="text-blue-600 dark:text-blue-400"
								href="https://bitbucket.org/account/settings/app-passwords/"
								target="_blank"
								rel="noopener noreferrer"
							>
								here
							</a>
						</span>

						<input
							id="appPassword"
							type="password"
							className="w-full rounded border border-gray-600 dark:border-gray-400"
							value={appPassword}
							onChange={(e) => updateAppPassword(e.target.value)}
						/>
					</div>

					<div className="flex items-center">
						<input
							id="requireInteraction"
							type="checkbox"
							className="flex-0 mr-2 rounded border"
							checked={requireInteraction}
							onChange={(e) => updateRequireInteraction(e.target.checked)}
						/>

						<label htmlFor="requireInteraction" className="flex-1 select-none">
							Notifications require interaction
						</label>

						<button
							className="rounded border border-blue-600 px-2 py-1 dark:border-blue-400"
							onClick={notify}
						>
							Test
						</button>
					</div>
				</div>
			)}

			{!settingsView && (
				<div className="flex flex-col gap-4 text-sm">
					{alerts.map((alert) => (
						<div
							key={`${alert.organisation}--${alert.repository}--${alert.pullRequest}`}
							className="flex gap-2"
						>
							<div className="flex flex-1 flex-col">
								<div className="flex">
									<div className="flex-1 text-sm">{alert.repository}</div>

									<div
										className={cn(
											"w-[70px] rounded px-1 text-right text-xs font-semibold opacity-90",
											!alert.pullRequestState &&
												"text-gray-400 dark:text-gray-500",
											alert.pullRequestState === "OPEN" &&
												"text-blue-600 dark:text-blue-400",
											alert.pullRequestState === "MERGED" &&
												"text-green-600 dark:text-green-400",
											alert.pullRequestState === "DECLINED" &&
												"text-gray-600 dark:text-gray-400",
										)}
									>
										{alert.pullRequestState === "OPEN"
											? "open"
											: alert.pullRequestState === "MERGED"
											? "merged"
											: alert.pullRequestState === "DECLINED"
											? "declined"
											: "—"}
									</div>

									<div className="w-[85px]">
										<div
											className={cn(
												"ml-auto w-fit rounded px-1 text-xs font-semibold opacity-90",
												!alert.buildState && "text-gray-400 dark:text-gray-500",
												alert.buildState === "INPROGRESS" &&
													"bg-blue-300 text-blue-700",
												alert.buildState === "SUCCESSFUL" &&
													"bg-green-300 text-green-700",
												alert.buildState === "FAILED" &&
													"bg-red-300 text-red-700",
											)}
										>
											{alert.buildState === "INPROGRESS"
												? "in progress"
												: alert.buildState === "SUCCESSFUL"
												? "complete"
												: alert.buildState === "FAILED"
												? "failed"
												: "—"}
										</div>
									</div>
								</div>

								<div className="flex">
									<div
										className={cn(
											"flex-1 text-sm",
											alert.pullRequestState === "OPEN"
												? "font-semibold"
												: "text-gray-400 dark:text-gray-500",
										)}
									>
										<a
											className="text-blue-600 dark:text-blue-400"
											href={`${BASE_PULL_REQUEST_URL}/${alert.organisation}/${alert.repository}/pull-requests/${alert.pullRequest}`}
											target="_blank"
											rel="noopener noreferrer"
										>
											{alert.sourceBranch || "—"}
										</a>
									</div>

									<div
										className={cn(
											"text-sm",
											alert.pullRequestState === "MERGED" &&
												alert.buildState !== "SUCCESSFUL"
												? "font-semibold"
												: "text-gray-400 dark:text-gray-500",
										)}
									>
										{alert.destinationBranch || "—"}
									</div>
								</div>
							</div>

							<button
								className="text-gray-400 dark:text-gray-500"
								onClick={() => removeAlert(alert.id)}
							>
								<LucideTrash2 size={20} />
							</button>
						</div>
					))}

					{!alerts.length && (
						<div className="flex justify-center gap-2">
							<span>Use the</span>
							<LucideBellPlus className="text-[#00dcb6]" size={20} />
							<span>button on a PR page to start receiving notifications.</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default App;
