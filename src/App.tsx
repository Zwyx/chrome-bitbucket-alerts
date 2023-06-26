import { LucideArrowRight, LucideBellPlus, LucideSettings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "./Alert";
import { cn } from "./utils";
import favicon from "/favicon-green.png";

const ALERTS_STORAGE_KEY = "chrome-bitbucket-alerts-alerts";
const USERNAME_STORAGE_KEY = "chrome-bitbucket-alerts-username";
const APP_PASSWORD_STORAGE_KEY = "chrome-bitbucket-alerts-app-password";
const REQUIRE_INTERACTION_STORAGE_KEY =
	"chrome-bitbucket-alerts-require-interaction";

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

	const firefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

	const notify = useCallback(() => {
		if (chrome.notifications) {
			chrome.notifications.create({
				type: "basic",
				iconUrl: "favicon-green.png",
				title: "Hello!",
				message: "Hope you like it.",
				...(firefox ? {} : { requireInteraction }),
			});
		} else {
			alert("Notifications seem unavailable");
		}
	}, [firefox, requireInteraction]);

	const isAlertActive = (alert: Alert) =>
		alert.pullRequestState !== "MERGED" || alert.buildState !== "SUCCESSFUL";

	const isAlertInactive = (alert: Alert) => !isAlertActive(alert);

	const removeAlert = useCallback(
		(id: string) => chrome.runtime.sendMessage({ type: "remove-alert", id }),
		[],
	);

	return (
		<div className="flex max-h-[550px] w-[500px] flex-col gap-6 overflow-auto p-8">
			<div className="flex justify-between">
				<img src={favicon} width={20} alt="logo" />

				{(!username || !appPassword) && !settingsView && (
					<div className="mx-2 flex flex-1 items-center justify-end text-orange-600">
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
					<LucideSettings
						className="text-gray-600 dark:text-gray-300"
						size={20}
					/>
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

					<div className="flex items-center" title="Unavailable on Firefox">
						<input
							id="requireInteraction"
							type="checkbox"
							className="flex-0 mr-2 rounded border"
							disabled={firefox}
							checked={!firefox && requireInteraction}
							onChange={(e) => updateRequireInteraction(e.target.checked)}
						/>

						<label
							htmlFor="requireInteraction"
							className={cn(
								"flex-1 select-none",
								firefox && "text-gray-600 dark:text-gray-400",
							)}
						>
							Notifications require interaction
						</label>

						<button
							className="rounded border border-blue-600 px-2 py-1 dark:border-blue-400"
							onClick={notify}
						>
							Test notification
						</button>
					</div>
				</div>
			)}

			{!settingsView && (
				<div className="flex flex-col gap-4 text-sm">
					{alerts.filter(isAlertActive).map((alert) => (
						<Alert key={alert.id} alert={alert} onRemoveAlert={removeAlert} />
					))}

					{!!alerts.filter(isAlertInactive).length && (
						<div className="border-t" />
					)}

					{alerts.filter(isAlertInactive).map((alert) => (
						<Alert
							key={alert.id}
							className="opacity-70"
							alert={alert}
							onRemoveAlert={removeAlert}
						/>
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
