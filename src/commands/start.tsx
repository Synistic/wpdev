import { Text } from "ink";
import { useEffect, useState } from "react";
import { z } from "zod";
import { loadGlobalConfig } from "../config/global.ts";
import { loadSiteConfig } from "../config/site.ts";
import { derivePorts } from "../platform/ports.ts";
import { dockerCompose } from "../utils/exec.ts";
import { getSiteDir } from "../utils/paths.ts";

export const description = "Start a WordPress environment";

export const args = z.tuple([z.string().describe("Site name")]);

type Props = {
	args: z.infer<typeof args>;
};

export default function Start({ args: [name] }: Props) {
	const [status, setStatus] = useState<"starting" | "done" | "error">(
		"starting",
	);
	const [error, setError] = useState("");
	const [port, setPort] = useState(0);

	useEffect(() => {
		async function run() {
			const config = loadSiteConfig(name);
			if (!config) {
				setError(`Site '${name}' does not exist`);
				setStatus("error");
				return;
			}

			setPort(config.port);
			const globalConfig = loadGlobalConfig();
			const siteDir = getSiteDir(globalConfig.sitesDir, name);
			const result = await dockerCompose(siteDir, ["start"]);

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
	if (status === "done") {
		const ports = derivePorts(port);
		return (
			<Text color="green">
				Started '{name}' — <Text color="cyan">http://localhost:{ports.wp}</Text>
			</Text>
		);
	}
	return <Text color="blue">Starting '{name}'...</Text>;
}
