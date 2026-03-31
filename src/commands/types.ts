import type { Logger } from "../lib/logger.js";
import type { Output } from "../lib/output.js";

export interface GlobalFlags {
	help: boolean;
	version: boolean;
	json: boolean;
	quiet: boolean;
	verbose: boolean;
}

export interface CommandRunContext {
	args: string[];
	env: NodeJS.ProcessEnv;
	flags: GlobalFlags;
	logger: Logger;
	output: Output;
}

export interface CommandDefinition {
	description: string;
	helpText: string;
	aliases?: string[];
	examples?: string[];
	run: (context: CommandRunContext) => Promise<number>;
}
