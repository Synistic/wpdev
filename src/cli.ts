#!/usr/bin/env bun
import Pastel from "pastel";

const app = new Pastel({
	importMeta: import.meta,
	name: "wpdev",
	description: "Fast local WordPress development environments",
	version: "0.1.0",
});

await app.run();
