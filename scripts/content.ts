const STYLE_LINK_ID = "chrome-bitbucket-alerts-style";
const BUTTON_ID = "chrome-bitbucket-alerts-button";
const SPIN_CLASS = "chrome-bitbucket-alerts-spin";

const BELL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell-plus"><path d="M19.3 14.8C20.1 16.4 21 17 21 17H3s3-2 3-9c0-3.3 2.7-6 6-6 1 0 1.9.2 2.8.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M15 8h6"/><path d="M18 5v6"/></svg>`;
const LOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><polyline points="20 6 9 17 4 12"/></svg>`;

const urlRegex = RegExp(
	"https://bitbucket.org/(\\w+)/([\\w-]+)/pull-requests/(\\d+).*",
);

new MutationObserver(() => {
	const match = location.href.match(urlRegex);

	const existingButton = document.getElementById(BUTTON_ID);

	if (match && !existingButton) {
		const nav = document.getElementsByTagName("nav")[0];

		if (!nav) {
			return;
		}

		if (!document.getElementById(STYLE_LINK_ID)) {
			const styleLink = document.createElement("link");

			styleLink.id = STYLE_LINK_ID;
			styleLink.rel = "stylesheet";
			styleLink.href = chrome.runtime.getURL("content.css");

			document.head.appendChild(styleLink);
		}

		const button = document.createElement("button");

		button.id = BUTTON_ID;

		button.innerHTML = BELL_ICON;

		// we load that inline to prevent a surprising flash of unstyled content
		button.setAttribute(
			"style",
			[
				"margin-right: 8px",
				"border: none",
				"background: none",
				"color: #00dcb6",
				"line-height: 0",
				"cursor: pointer",
			].join("; "),
		);

		button.onclick = () => {
			try {
				button.disabled = true;
				button.innerHTML = LOAD_ICON;
				button.classList.add(SPIN_CLASS);

				chrome.runtime
					.sendMessage({
						type: "new-alert",
						organisation: match[1],
						repository: match[2],
						pullRequest: match[3],
					})
					.then((res) => {
						button.disabled = false;
						button.classList.remove(SPIN_CLASS);

						if (res.confirmed || res.alreadyExists) {
							button.innerHTML = CHECK_ICON;
						} else {
							button.innerHTML = BELL_ICON;
						}

						if (res.error) {
							console.info(res.error);
						}

						if (res.message) {
							alert(res.message);
						}
					})
					.catch(() => {
						button.remove();
						alert("Error. Please refresh the page and try again.");
					});
			} catch {
				button.remove();
				alert(
					"Error, the extension might have been reloaded. Please refresh the page and try again.",
				);
			}
		};

		nav.appendChild(button);
	} else if (!match && existingButton) {
		existingButton.remove();
	}
}).observe(document.body, { childList: true, subtree: true });
