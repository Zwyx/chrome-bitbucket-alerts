import { LucideTrash2 } from "lucide-react";
import { FC } from "react";
import { cn } from "./utils";

const BASE_PULL_REQUEST_URL = "https://bitbucket.org";

export interface BitBucketPullRequest {
	source: { branch: { name: string } };
	destination: { branch: { name: string } };
	state: "OPEN" | "MERGED" | "DECLINED";
	merge_commit: { hash: string };
}

export interface BitBucketBuild {
	state: "INPROGRESS" | "SUCCESSFUL" | "FAILED";
}

export interface Alert {
	id: string;
	organisation: string;
	repository: string;
	pullRequest: string;
	sourceBranch?: string;
	destinationBranch?: string;
	pullRequestState?: BitBucketPullRequest["state"];
	buildState?: BitBucketBuild["state"];
	mergeCommitHash?: string;
	buildTag?: string;
	lastChange?: number;
	old?: boolean;
}

interface AlertProps {
	alert: Alert;
	className?: string;
	onRemoveAlert: (id: string) => void;
}

export const Alert: FC<AlertProps> = ({ alert, className, onRemoveAlert }) => (
	<div className={cn("flex gap-2", className)}>
		<div className="flex flex-1 flex-col">
			<div className="flex">
				<div className="flex-1 text-sm">
					{alert.old ? "[Inactive because older than 30 days] " : ""}
					{alert.repository}
					{alert.buildTag && (
						<>
							<> – </>
							<span className="text-orange-600">{alert.buildTag}</span>
						</>
					)}
				</div>

				<div
					className={cn(
						"w-[70px] rounded px-1 text-right text-xs font-semibold opacity-90",
						!alert.pullRequestState && "text-gray-400 dark:text-gray-500",
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
							alert.buildState === "INPROGRESS" && "bg-blue-200 text-blue-800",
							alert.buildState === "SUCCESSFUL" &&
								"bg-green-200 text-green-800",
							alert.buildState === "FAILED" && "bg-red-200 text-red-800",
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

		<button onClick={() => onRemoveAlert(alert.id)}>
			<LucideTrash2 className="text-gray-500 dark:text-gray-400" size={20} />
		</button>
	</div>
);
