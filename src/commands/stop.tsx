import { Text } from "ink";
import { useEffect, useState } from "react";
import { z } from "zod";
import { loadGlobalConfig } from "../config/global.ts";
import { loadSiteConfig } from "../config/site.ts";
import { dockerCompose } from "../utils/exec.ts";
import { getSiteDir } from "../utils/paths.ts";

export const description = "Stop a WordPress environment";

export const args = z.tuple([z.string().describe("Site name")]);

type Props = {
	args: z.infer<typeof args>;
};

export default function Stop({ args: [name] }: Props) {
	const [status, setStatus] = useState<"stopping" | "done" | "error">(
		"stopping",
	);
	const [error, setError] = useState("");

	useEffect(() => {
		async function run() {
			const config = loadSiteConfig(name);
			if (!config) {
				setError(`Site '${name}' does not exist`);
				setStatus("error");
				return;
			}

			const globalConfig = loadGlobalConfig();
			const siteDir = getSiteDir(globalConfig.sitesDir, name);
			const result = await dockerCompose(siteDir, ["stop"]);

			if (result.exitCode !== 0) {
				setError(result.stderr);
				setStatus("error");
				return;
			}

			setStatus("done");
		}
		run();
	}, [name]);

	if (status === "error") return <Text color="red">Error: {error}</Text>;
	if (status === "done") return <Text color="green">Stopped '{name}'.</Text>;
	return <Text color="blue">Stopping '{name}'...</Text>;
}
