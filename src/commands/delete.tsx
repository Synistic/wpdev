import { rmSync } from "node:fs";
import { Box, Text } from "ink";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { SelectConfirm } from "../components/select-confirm.tsx";
import { StepList } from "../components/step-indicator.tsx";
import { loadGlobalConfig } from "../config/global.ts";
import { loadSiteConfig } from "../config/site.ts";
import { dockerCompose, exec } from "../utils/exec.ts";
import { getSiteDir } from "../utils/paths.ts";

export const description = "Delete a WordPress environment and all its data";

export const options = z.object({
	force: z
		.boolean()
		.default(false)
		.describe(
			'__pastel_option_config__{"description":"Skip confirmation prompt","alias":"f"}',
		),
});

export const args = z.tuple([z.string().describe("Site name")]);

type Props = {
	options: z.infer<typeof options>;
	args: z.infer<typeof args>;
};

type DeleteStep =
	| "stop"
	| "remove-containers"
	| "remove-volumes"
	| "remove-images"
	| "delete-files"
	| "done";

export default function Delete({ options: opts, args: [name] }: Props) {
	const [status, setStatus] = useState<
		"loading" | "confirm" | "deleting" | "done" | "error"
	>("loading");
	const [error, setError] = useState("");
	const [deleteStep, setDeleteStep] = useState<DeleteStep>("stop");
	const [completedSteps, setCompletedSteps] = useState<Set<string>>(
		() => new Set(),
	);
	const [errorStep, setErrorStep] = useState<string>();
	const [siteDir, setSiteDir] = useState("");
	const [containerNames, setContainerNames] = useState<string[]>([]);
	const [volumeNames, setVolumeNames] = useState<string[]>([]);

	const config = useMemo(() => loadSiteConfig(name), [name]);

	// Load site info on mount
	useEffect(() => {
		if (!config) {
			setError(`Site '${name}' existiert nicht`);
			setStatus("error");
			return;
		}

		const globalConfig = loadGlobalConfig();
		const dir = getSiteDir(globalConfig.sitesDir, name);
		setSiteDir(dir);

		// Find containers and volumes
		async function loadInfo() {
			const containerResult = await exec([
				"docker",
				"ps",
				"-a",
				"--filter",
				`name=${name}_`,
				"--format",
				"{{.Names}}",
			]);
			if (containerResult.exitCode === 0 && containerResult.stdout.trim()) {
				setContainerNames(
					containerResult.stdout
						.trim()
						.split("\n")
						.filter((c) => c.length > 0),
				);
			}

			const volumeResult = await exec([
				"docker",
				"volume",
				"ls",
				"--filter",
				`name=${name}`,
				"--format",
				"{{.Name}}",
			]);
			if (volumeResult.exitCode === 0 && volumeResult.stdout.trim()) {
				setVolumeNames(
					volumeResult.stdout
						.trim()
						.split("\n")
						.filter((v) => v.length > 0),
				);
			}

			if (opts.force) {
				setStatus("deleting");
			} else {
				setStatus("confirm");
			}
		}
		loadInfo();
	}, [name, config, opts.force]);

	function markStepDone(step: DeleteStep) {
		setCompletedSteps((prev) => new Set([...prev, step]));
	}

	// Run deletion process
	useEffect(() => {
		if (status !== "deleting") return;

		async function run() {
			try {
				const globalConfig = loadGlobalConfig();
				const dir = getSiteDir(globalConfig.sitesDir, name);

				// Stop containers
				setDeleteStep("stop");
				await dockerCompose(dir, ["stop"]);
				markStepDone("stop");

				// Remove containers + volumes via docker compose
				setDeleteStep("remove-containers");
				await dockerCompose(dir, ["down", "-v", "--remove-orphans"]);
				markStepDone("remove-containers");

				// Remove any remaining volumes
				setDeleteStep("remove-volumes");
				if (volumeNames.length > 0) {
					for (const vol of volumeNames) {
						await exec(["docker", "volume", "rm", "-f", vol]);
					}
				}
				markStepDone("remove-volumes");

				// Remove built images
				setDeleteStep("remove-images");
				const imageResult = await exec([
					"docker",
					"images",
					"--filter",
					`reference=*${name}*`,
					"--format",
					"{{.ID}}",
				]);
				if (imageResult.exitCode === 0 && imageResult.stdout.trim()) {
					const imageIds = imageResult.stdout
						.trim()
						.split("\n")
						.filter((id) => id.length > 0);
					for (const id of imageIds) {
						await exec(["docker", "rmi", "-f", id]);
					}
				}
				markStepDone("remove-images");

				// Delete files
				setDeleteStep("delete-files");
				rmSync(dir, { recursive: true, force: true });
				markStepDone("delete-files");

				setDeleteStep("done");
				setStatus("done");
			} catch (e) {
				setErrorStep(deleteStep);
				setError(e instanceof Error ? e.message : String(e));
				setStatus("error");
			}
		}
		run();
	}, [status, name, volumeNames, deleteStep]);

	const deleteStepsConfig = useMemo(
		() => [
			{ key: "stop", label: "Container stoppen" },
			{ key: "remove-containers", label: "Container entfernen" },
			{
				key: "remove-volumes",
				label: "Volumes entfernen",
				detail:
					volumeNames.length > 0 ? `${volumeNames.length} Volumes` : undefined,
			},
			{ key: "remove-images", label: "Docker Images entfernen" },
			{
				key: "delete-files",
				label: "Dateien löschen",
				detail: siteDir || undefined,
			},
		],
		[volumeNames, siteDir],
	);

	// === ERROR ===
	if (status === "error") {
		return (
			<Box flexDirection="column" gap={1}>
				{completedSteps.size > 0 && (
					<StepList
						steps={deleteStepsConfig}
						currentStep=""
						completedSteps={completedSteps}
						errorStep={errorStep}
					/>
				)}
				<Box gap={1}>
					<Text color="red" bold>
						{"\u2717"}
					</Text>
					<Text color="red">{error}</Text>
				</Box>
			</Box>
		);
	}

	// === LOADING ===
	if (status === "loading") {
		return <Text color="blue">Lade Site-Informationen...</Text>;
	}

	// === CONFIRM ===
	if (status === "confirm" && config) {
		return (
			<Box flexDirection="column" gap={1}>
				<Text bold color="red">
					Site '{name}' löschen
				</Text>

				<Box
					flexDirection="column"
					borderStyle="single"
					borderColor="red"
					paddingX={1}
				>
					<Text>
						<Text bold>Site</Text>
						{"         "}
						{name}
					</Text>
					<Text>
						<Text bold>PHP</Text>
						{"          "}
						{config.php}
					</Text>
					<Text>
						<Text bold>Datenbank</Text>
						{"    "}
						{config.db ?? "mariadb"}
					</Text>
					<Text>
						<Text bold>Port</Text>
						{"         "}
						{config.port}
					</Text>
					{containerNames.length > 0 && (
						<Text>
							<Text bold>Container</Text>
							{"    "}
							<Text dimColor>{containerNames.join(", ")}</Text>
						</Text>
					)}
					{volumeNames.length > 0 && (
						<Text>
							<Text bold>Volumes</Text>
							{"      "}
							<Text dimColor>{volumeNames.join(", ")}</Text>
						</Text>
					)}
					<Text>
						<Text bold>Verzeichnis</Text> <Text dimColor>{siteDir}</Text>
					</Text>
				</Box>

				<Text color="yellow">
					Alle Daten (Datenbank, Uploads, Config) werden unwiderruflich
					gelöscht!
				</Text>

				<SelectConfirm
					options={[
						{ label: "Ja, alles löschen", value: "yes" },
						{ label: "Abbrechen", value: "no" },
					]}
					onSubmit={(value) => {
						if (value === "yes") {
							setStatus("deleting");
						} else {
							setStatus("error");
							setError("Abgebrochen.");
						}
					}}
				/>
			</Box>
		);
	}

	// === DELETING ===
	if (status === "deleting") {
		return (
			<Box flexDirection="column" gap={1}>
				<Text bold color="red">
					Lösche '{name}'
				</Text>
				<StepList
					steps={deleteStepsConfig}
					currentStep={deleteStep}
					completedSteps={completedSteps}
				/>
			</Box>
		);
	}

	// === DONE ===
	return (
		<Box flexDirection="column" gap={1}>
			<StepList
				steps={deleteStepsConfig}
				currentStep=""
				completedSteps={completedSteps}
			/>
			<Box marginTop={1}>
				<Text color="green" bold>
					{"\u2713"} Site '{name}' wurde vollständig gelöscht.
				</Text>
			</Box>
		</Box>
	);
}
