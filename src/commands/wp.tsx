import { Text } from "ink";
import { useEffect, useState } from "react";
import { z } from "zod";
import { loadGlobalConfig } from "../config/global.ts";
import { loadSiteConfig } from "../config/site.ts";
import { execStream } from "../utils/exec.ts";
import { getSiteDir } from "../utils/paths.ts";

export const description = "Run WP-CLI command in a WordPress environment";

export const args = z
	.tuple([z.string().describe("Site name")])
	.rest(z.string());

type Props = {
	args: z.infer<typeof args>;
};

export default function Wp({ args: [name, ...wpArgs] }: Props) {
	const [error, setError] = useState("");

	useEffect(() => {
		async function run() {
			const config = loadSiteConfig(name);
			if (!config) {
				setError(`Site '${name}' does not exist`);
				return;
			}

			const globalConfig = loadGlobalConfig();
			const siteDir = getSiteDir(globalConfig.sitesDir, name);

			await execStream(
				[
					"docker",
					"compose",
					"exec",
					"wordpress",
					"wp",
					"--allow-root",
					...wpArgs,
				],
				{ cwd: siteDir },
			);
		}
		run();
	}, []);

	if (error) return <Text color="red">Error: {error}</Text>;
	return null;
}
