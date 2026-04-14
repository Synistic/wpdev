import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MultiSelect, TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { SelectConfirm } from "../components/select-confirm.tsx";
import { StepList } from "../components/step-indicator.tsx";
import { WizardSummary } from "../components/wizard-summary.tsx";
import { ensureGlobalDirs, loadGlobalConfig } from "../config/global.ts";
import type { PhpVersion, SiteConfig } from "../config/schema.ts";
import { dbEngines, phpVersions } from "../config/schema.ts";
import { saveSiteConfig, siteExists } from "../config/site.ts";
import { generateComposeYaml } from "../docker/compose.ts";
import { generateDockerfile } from "../docker/dockerfile.ts";
import { generateEntrypoint } from "../docker/entrypoint.ts";
import { detectPlatform } from "../platform/detect.ts";
import { checkDocker } from "../platform/docker.ts";
import {
	derivePorts,
	findFreePort,
	isPortAvailable,
} from "../platform/ports.ts";
import { dockerCompose, exec } from "../utils/exec.ts";
import { getSiteDir } from "../utils/paths.ts";

export const description = "Create a new WordPress environment";

export const options = z.object({
	port: z
		.number()
		.optional()
		.describe("Port for WordPress (auto-assigned if not set)"),
	php: z.enum(phpVersions).optional().describe("PHP version"),
	db: z
		.enum(dbEngines)
		.optional()
		.describe("Database engine (mariadb or mysql)"),
	locale: z.string().optional().describe("WordPress locale"),
	yes: z
		.boolean()
		.default(false)
		.describe(
			'__pastel_option_config__{"description":"Skip interactive prompts, use defaults","alias":"y"}',
		),
});

export const args = z.tuple([z.string().describe("Site name")]);

type Props = {
	options: z.infer<typeof options>;
	args: z.infer<typeof args>;
};

type WizardStep =
	| "php"
	| "db"
	| "port"
	| "locale"
	| "plugins"
	| "admin-user"
	| "admin-email"
	| "confirm"
	| "building"
	| "done"
	| "error";

const wizardStepOrder: WizardStep[] = [
	"php",
	"db",
	"port",
	"locale",
	"plugins",
	"admin-user",
	"admin-email",
	"confirm",
];

const availablePlugins = [
	{ label: "All-in-One WP Migration", value: "all-in-one-wp-migration" },
	{ label: "WooCommerce", value: "woocommerce" },
	{ label: "Advanced Custom Fields", value: "advanced-custom-fields" },
	{ label: "Yoast SEO", value: "wordpress-seo" },
	{ label: "Contact Form 7", value: "contact-form-7" },
	{ label: "WP Mail SMTP", value: "wp-mail-smtp" },
	{ label: "Wordfence Security", value: "wordfence" },
	{ label: "Query Monitor (Debug)", value: "query-monitor" },
	{ label: "WP Crontrol (Debug)", value: "wp-crontrol" },
];

const pluginLabelMap = Object.fromEntries(
	availablePlugins.map((p) => [p.value, p.label]),
);

const phpOptions = phpVersions.map((v) => ({
	label: v === "8.2" ? `PHP ${v} (empfohlen)` : `PHP ${v}`,
	value: v,
}));

const dbOptions = [
	{ label: "MariaDB 11 (empfohlen)", value: "mariadb" },
	{ label: "MySQL 8.0", value: "mysql" },
];

const dbLabelMap: Record<string, string> = {
	mariadb: "MariaDB 11",
	mysql: "MySQL 8.0",
};

const localeOptions = [
	{ label: "Deutsch (de_DE)", value: "de_DE" },
	{ label: "English (en_US)", value: "en_US" },
	{ label: "Fran\u00e7ais (fr_FR)", value: "fr_FR" },
	{ label: "Espa\u00f1ol (es_ES)", value: "es_ES" },
	{ label: "Italiano (it_IT)", value: "it_IT" },
	{ label: "Nederlands (nl_NL)", value: "nl_NL" },
];

const localeLabelMap = Object.fromEntries(
	localeOptions.map((l) => [l.value, l.label]),
);

type BuildStep =
	| "docker-check"
	| "container-check"
	| "port-check"
	| "files"
	| "build"
	| "start"
	| "wait"
	| "done";

/** Check if Docker containers with this site name already exist */
async function checkContainerCollision(
	name: string,
): Promise<{ exists: boolean; containers: string[] }> {
	const result = await exec([
		"docker",
		"ps",
		"-a",
		"--filter",
		`name=${name}_`,
		"--format",
		"{{.Names}}",
	]);
	if (result.exitCode !== 0 || !result.stdout.trim()) {
		return { exists: false, containers: [] };
	}
	const containers = result.stdout
		.trim()
		.split("\n")
		.filter((c) => c.length > 0);
	return { exists: containers.length > 0, containers };
}

export default function Create({ options: opts, args: [name] }: Props) {
	const [wizardStep, setWizardStep] = useState<WizardStep>(() => {
		if (opts.yes) return "building";
		return opts.php ? (opts.db ? "port" : "db") : "php";
	});
	const [error, setError] = useState("");
	const [buildStep, setBuildStep] = useState<BuildStep>("docker-check");
	const [completedBuildSteps, setCompletedBuildSteps] = useState<Set<string>>(
		() => new Set(),
	);
	const [errorBuildStep, setErrorBuildStep] = useState<string>();

	// Wizard state
	const [php, setPhp] = useState(opts.php ?? "8.2");
	const [db, setDb] = useState<SiteConfig["db"]>(opts.db ?? "mariadb");
	const [port, setPort] = useState(opts.port ?? 0);
	const [locale, setLocale] = useState(opts.locale ?? "de_DE");
	const [plugins, setPlugins] = useState<string[]>(["all-in-one-wp-migration"]);
	const [adminUser, setAdminUser] = useState("admin");
	const [adminEmail, setAdminEmail] = useState("admin@local.test");
	const [siteDir, setSiteDir] = useState("");
	const [suggestedPort, setSuggestedPort] = useState(0);

	// Build the summary entries from completed wizard steps
	const summaryEntries = useMemo(() => {
		const entries: Array<{ label: string; value: string }> = [];
		const stepIdx = wizardStepOrder.indexOf(wizardStep);
		const isPostWizard = wizardStep === "building" || wizardStep === "done";

		if (stepIdx > wizardStepOrder.indexOf("php") || isPostWizard) {
			entries.push({ label: "PHP", value: php });
		}
		if (stepIdx > wizardStepOrder.indexOf("db") || isPostWizard) {
			entries.push({ label: "Datenbank", value: dbLabelMap[db] ?? db });
		}
		if (stepIdx > wizardStepOrder.indexOf("port") || isPostWizard) {
			entries.push({
				label: "Port",
				value: String(port || suggestedPort || "auto"),
			});
		}
		if (stepIdx > wizardStepOrder.indexOf("locale") || isPostWizard) {
			entries.push({
				label: "Sprache",
				value: localeLabelMap[locale] ?? locale,
			});
		}
		if (stepIdx > wizardStepOrder.indexOf("plugins") || isPostWizard) {
			entries.push({
				label: "Plugins",
				value:
					plugins.length > 0
						? plugins.map((p) => pluginLabelMap[p] ?? p).join(", ")
						: "keine",
			});
		}
		if (stepIdx > wizardStepOrder.indexOf("admin-user") || isPostWizard) {
			entries.push({ label: "Admin", value: adminUser });
		}
		if (stepIdx > wizardStepOrder.indexOf("admin-email") || isPostWizard) {
			entries.push({ label: "E-Mail", value: adminEmail });
		}

		return entries;
	}, [
		wizardStep,
		php,
		db,
		port,
		suggestedPort,
		locale,
		plugins,
		adminUser,
		adminEmail,
	]);

	// Find a suggested port on mount
	useEffect(() => {
		if (!opts.port) {
			findFreePort().then((p) => {
				setSuggestedPort(p);
				if (opts.yes) setPort(p);
			});
		} else {
			setSuggestedPort(opts.port);
		}
	}, [opts.port, opts.yes]);

	// Validate name upfront
	useEffect(() => {
		if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
			setError(
				"Site name darf nur Buchstaben, Zahlen, Bindestriche und Unterstriche enthalten",
			);
			setWizardStep("error");
			return;
		}
		if (siteExists(name)) {
			setError(`Site '${name}' existiert bereits`);
			setWizardStep("error");
		}
	}, [name]);

	function markBuildStepDone(step: BuildStep) {
		setCompletedBuildSteps((prev) => new Set([...prev, step]));
	}

	// Run build process
	useEffect(() => {
		if (wizardStep !== "building") return;

		async function build() {
			let createdDir = "";
			try {
				setBuildStep("docker-check");
				const docker = await checkDocker();
				if (!docker.available) {
					throw new Error(docker.error ?? "Docker ist nicht verfügbar");
				}
				markBuildStepDone("docker-check");

				setBuildStep("container-check");
				const collision = await checkContainerCollision(name);
				if (collision.exists) {
					throw new Error(
						`Container mit dem Prefix '${name}_' existieren bereits: ${collision.containers.join(", ")}. Lösche sie zuerst mit: wpdev delete ${name}`,
					);
				}
				markBuildStepDone("container-check");

				setBuildStep("port-check");
				let assignedPort = port;
				if (!assignedPort) {
					assignedPort = await findFreePort();
				} else {
					const portCheck = await isPortAvailable(assignedPort);
					if (!portCheck.available) {
						throw new Error(
							portCheck.conflict?.reason ??
								`Port ${assignedPort} ist bereits belegt`,
						);
					}
				}
				setPort(assignedPort);
				markBuildStepDone("port-check");

				setBuildStep("files");
				ensureGlobalDirs();
				const globalConfig = loadGlobalConfig();
				const dir = getSiteDir(globalConfig.sitesDir, name);
				createdDir = dir;
				setSiteDir(dir);

				mkdirSync(join(dir, "html"), { recursive: true });
				mkdirSync(join(dir, "php.conf.d"), { recursive: true });

				const siteConfig: SiteConfig = {
					name,
					port: assignedPort,
					php: php as SiteConfig["php"],
					db,
					locale,
					wpVersion: "latest",
					platform: detectPlatform(),
					created: new Date().toISOString(),
				};

				writeFileSync(
					join(dir, "docker-compose.yml"),
					generateComposeYaml(siteConfig),
				);
				writeFileSync(
					join(dir, "Dockerfile"),
					generateDockerfile(siteConfig.php),
				);
				writeFileSync(
					join(dir, "entrypoint.sh"),
					generateEntrypoint({ plugins, adminUser, adminEmail, locale }),
					{ mode: 0o755 },
				);

				const templateDir = join(
					dirname(dirname(import.meta.dir)),
					"templates",
				);
				const nginxSrc = join(
					dirname(import.meta.dir),
					"docker",
					"templates",
					"nginx.conf",
				);
				copyFileSync(nginxSrc, join(dir, "nginx.conf"));
				copyFileSync(
					join(templateDir, "php.conf.d", "custom.ini"),
					join(dir, "php.conf.d", "custom.ini"),
				);

				saveSiteConfig(dir, siteConfig);
				markBuildStepDone("files");

				setBuildStep("build");
				const buildResult = await dockerCompose(dir, ["build", "--quiet"]);
				if (buildResult.exitCode !== 0) {
					throw new Error(`Docker build fehlgeschlagen: ${buildResult.stderr}`);
				}
				markBuildStepDone("build");

				setBuildStep("start");
				const upResult = await dockerCompose(dir, ["up", "-d"]);
				if (upResult.exitCode !== 0) {
					throw new Error(`Docker start fehlgeschlagen: ${upResult.stderr}`);
				}
				markBuildStepDone("start");

				setBuildStep("wait");
				const maxWait = 120;
				let waited = 0;
				while (waited < maxWait) {
					const logs = await dockerCompose(dir, ["logs", "wordpress"]);
					if (
						logs.stdout.includes("WordPress setup complete!") ||
						logs.stdout.includes("WordPress already installed")
					) {
						break;
					}
					await new Promise((r) => setTimeout(r, 2000));
					waited += 2;
				}
				markBuildStepDone("wait");

				setBuildStep("done");
				setWizardStep("done");
			} catch (e) {
				// Cleanup on failure
				if (createdDir) {
					try {
						await dockerCompose(createdDir, ["down", "-v", "--remove-orphans"]);
					} catch {
						// Ignore cleanup errors
					}
					try {
						rmSync(createdDir, { recursive: true, force: true });
					} catch {
						// Ignore cleanup errors
					}
				}
				setErrorBuildStep(buildStep);
				setError(e instanceof Error ? e.message : String(e));
				setWizardStep("error");
			}
		}
		build();
	}, [wizardStep, name, port, php, db, locale, plugins, adminUser, adminEmail]);

	const buildStepsConfig = useMemo(
		() => [
			{ key: "docker-check", label: "Docker prüfen" },
			{ key: "container-check", label: "Container-Kollisionen prüfen" },
			{
				key: "port-check",
				label: "Port prüfen",
				detail: port ? String(port) : undefined,
			},
			{ key: "files", label: "Konfiguration generieren" },
			{
				key: "build",
				label: "Docker Image bauen",
				detail: `PHP ${php} · ${dbLabelMap[db] ?? db}`,
			},
			{ key: "start", label: "Container starten" },
			{ key: "wait", label: "WordPress installieren" },
		],
		[port, php, db],
	);

	// === ERROR ===
	if (wizardStep === "error") {
		return (
			<Box flexDirection="column" gap={1}>
				{completedBuildSteps.size > 0 && (
					<StepList
						steps={buildStepsConfig}
						currentStep=""
						completedSteps={completedBuildSteps}
						errorStep={errorBuildStep}
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

	// === DONE ===
	if (wizardStep === "done") {
		const ports = derivePorts(port);
		return (
			<Box flexDirection="column" gap={1}>
				<StepList
					steps={buildStepsConfig}
					currentStep=""
					completedSteps={completedBuildSteps}
				/>

				<Box flexDirection="column" marginTop={1}>
					<Text color="green" bold>
						{"\u2713"} WordPress environment '{name}' ist bereit!
					</Text>
				</Box>

				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor="green"
					paddingX={2}
					paddingY={1}
				>
					<Text>
						<Text bold>WordPress</Text>
						{"  "}
						<Text color="cyan">http://localhost:{ports.wp}</Text>
					</Text>
					<Text>
						<Text bold>WP-Admin</Text>
						{"   "}
						<Text color="cyan">http://localhost:{ports.wp}/wp-admin</Text>
					</Text>
					<Text>
						<Text bold>Mailpit</Text>
						{"    "}
						<Text color="cyan">http://localhost:{ports.mailpitUi}</Text>
					</Text>
					<Text> </Text>
					<Text>
						<Text bold>Login</Text>
						{"      "}
						{adminUser} / admin
					</Text>
					<Text>
						<Text bold>PHP</Text>
						{"        "}
						{php}
					</Text>
					<Text>
						<Text bold>Datenbank</Text>
						{"  "}
						{dbLabelMap[db] ?? db}
					</Text>
					<Text>
						<Text bold>Plugins</Text>
						{"    "}
						<Text dimColor>
							{plugins.length > 0
								? plugins.map((p) => pluginLabelMap[p] ?? p).join(", ")
								: "keine"}
						</Text>
					</Text>
					<Text>
						<Text bold>Verzeichnis</Text> <Text dimColor>{siteDir}</Text>
					</Text>
				</Box>
			</Box>
		);
	}

	// === BUILDING ===
	if (wizardStep === "building") {
		return (
			<Box flexDirection="column" gap={1}>
				<Box flexDirection="column" marginBottom={1}>
					<Text bold color="blue">
						Erstelle '{name}'
					</Text>
					<WizardSummary entries={summaryEntries} />
				</Box>
				<StepList
					steps={buildStepsConfig}
					currentStep={buildStep}
					completedSteps={completedBuildSteps}
				/>
			</Box>
		);
	}

	// === INTERACTIVE WIZARD ===
	return (
		<Box flexDirection="column" gap={1}>
			<Text bold color="blue">
				Neue WordPress-Umgebung: {name}
			</Text>

			{/* Show completed wizard entries */}
			{summaryEntries.length > 0 && <WizardSummary entries={summaryEntries} />}

			{/* Step: PHP Version */}
			{wizardStep === "php" && (
				<Box flexDirection="column">
					<Text bold>
						PHP-Version <Text dimColor>(Pfeiltasten + Enter)</Text>:
					</Text>
					<SelectConfirm
						options={phpOptions}
						defaultValue="8.2"
						onSubmit={(value) => {
							setPhp(value as PhpVersion);
							setWizardStep("db");
						}}
					/>
				</Box>
			)}

			{/* Step: DB Engine */}
			{wizardStep === "db" && (
				<Box flexDirection="column">
					<Text bold>
						Datenbank <Text dimColor>(Pfeiltasten + Enter)</Text>:
					</Text>
					<SelectConfirm
						options={dbOptions}
						defaultValue="mariadb"
						onSubmit={(value) => {
							setDb(value as SiteConfig["db"]);
							setWizardStep("port");
						}}
					/>
				</Box>
			)}

			{/* Step: Port */}
			{wizardStep === "port" && (
				<Box flexDirection="column">
					<Text bold>
						Port <Text dimColor>(Enter für {suggestedPort || "auto"})</Text>:
					</Text>
					<TextInput
						placeholder={String(suggestedPort || "auto")}
						onSubmit={(value) => {
							if (value === "") {
								setPort(suggestedPort || 0);
							} else {
								const p = Number.parseInt(value, 10);
								if (Number.isNaN(p) || p < 1024 || p > 65535) {
									setError("Port muss zwischen 1024 und 65535 liegen");
									setWizardStep("error");
									return;
								}
								setPort(p);
							}
							setWizardStep("locale");
						}}
					/>
				</Box>
			)}

			{/* Step: Locale */}
			{wizardStep === "locale" && (
				<Box flexDirection="column">
					<Text bold>
						Sprache <Text dimColor>(Pfeiltasten + Enter)</Text>:
					</Text>
					<SelectConfirm
						options={localeOptions}
						defaultValue="de_DE"
						onSubmit={(value) => {
							setLocale(value);
							setWizardStep("plugins");
						}}
					/>
				</Box>
			)}

			{/* Step: Plugins */}
			{wizardStep === "plugins" && (
				<Box flexDirection="column">
					<Text bold>
						Plugins{" "}
						<Text dimColor>(Space = auswählen, Enter = bestätigen)</Text>:
					</Text>
					<MultiSelect
						options={availablePlugins}
						defaultValue={["all-in-one-wp-migration"]}
						onSubmit={(values) => {
							setPlugins(values);
							setWizardStep("admin-user");
						}}
					/>
				</Box>
			)}

			{/* Step: Admin User */}
			{wizardStep === "admin-user" && (
				<Box flexDirection="column">
					<Text bold>
						Admin-Benutzername <Text dimColor>(Enter für 'admin')</Text>:
					</Text>
					<TextInput
						placeholder="admin"
						onSubmit={(value) => {
							setAdminUser(value || "admin");
							setWizardStep("admin-email");
						}}
					/>
				</Box>
			)}

			{/* Step: Admin Email */}
			{wizardStep === "admin-email" && (
				<Box flexDirection="column">
					<Text bold>
						Admin-E-Mail <Text dimColor>(Enter für 'admin@local.test')</Text>:
					</Text>
					<TextInput
						placeholder="admin@local.test"
						onSubmit={(value) => {
							setAdminEmail(value || "admin@local.test");
							setWizardStep("confirm");
						}}
					/>
				</Box>
			)}

			{/* Step: Confirm */}
			{wizardStep === "confirm" && (
				<Box flexDirection="column">
					<Text bold>
						Erstellen? <Text dimColor>(Pfeiltasten + Enter)</Text>
					</Text>
					<SelectConfirm
						options={[
							{ label: "Ja, erstellen", value: "yes" },
							{ label: "Abbrechen", value: "no" },
						]}
						onSubmit={(value) => {
							if (value === "yes") {
								setWizardStep("building");
							} else {
								setError("Abgebrochen.");
								setWizardStep("error");
							}
						}}
					/>
				</Box>
			)}
		</Box>
	);
}
