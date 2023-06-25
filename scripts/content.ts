const ELEMENT_ID = "chrome-bitbucket-alerts-button";

const urlRegex = RegExp(
	"https://bitbucket.org/(\\w+)/([\\w-]+)/pull-requests/(\\d+).*",
);

new MutationObserver(() => {
	const match = location.href.match(urlRegex);

	const button = document.getElementById(ELEMENT_ID);

	if (match && !button) {
		const nav = document.getElementsByTagName("nav")[0];

		if (!nav) {
			return;
		}

		const element = document.createElement("button");

		element.id = ELEMENT_ID;

		element.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell-plus"><path d="M19.3 14.8C20.1 16.4 21 17 21 17H3s3-2 3-9c0-3.3 2.7-6 6-6 1 0 1.9.2 2.8.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M15 8h6"/><path d="M18 5v6"/></svg>`;

		element.setAttribute(
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

		element.onclick = () => {
			try {
				chrome.runtime.sendMessage({
					organisation: match[1],
					repository: match[2],
					pullRequest: match[3],
				});
			} catch {
				alert(
					"Error, the extension might have been reloaded. Please refresh the page and try again.",
				);
			}
		};

		nav.appendChild(element);
	} else if (!match && button) {
		button.remove();
	}
}).observe(document.body, { childList: true, subtree: true });
