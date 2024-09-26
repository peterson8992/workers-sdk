/**
 * We can provide Node.js compatibility in a number of different modes:
 * - "legacy" - this mode adds compile-time polyfills that are not well maintained and cannot work with workerd runtime builtins.
 * - "als": this mode tells the workerd runtime to enable only the Async Local Storage builtin library (accessible via `node:async_hooks`).
 * - "v1" - this mode tells the workerd runtime to enable some Node.js builtin libraries (accessible only via `node:...` imports) but no globals.
 * - "v2" - this mode tells the workerd runtime to enable more Node.js builtin libraries (accessible both with and without the `node:` prefix)
 *   and also some Node.js globals such as `Buffer`; it also turns on additional compile-time polyfills for those that are not provided by the runtime.
 *  - null - no Node.js compatibility.
 */
export type NodeJSCompatMode = "legacy" | "als" | "v1" | "v2" | null;

/**
 * Computes the Node.js compatibility mode we are running.
 *
 * NOTES:
 * - The v2 mode is configured via `nodejs_compat_v2` compat flag or via `nodejs_compat` plus a compatibility date of Sept 23rd. 2024 or later.
 * - See `EnvironmentInheritable` for `nodeCompat` and `noBundle`.
 *
 * @param compatibilityDateStr The compatibility date
 * @param compatibilityFlags The compatibility flags
 * @param opts.nodeCompat Whether the legacy node_compat arg is being used
 * @returns the mode and flags to indicate specific configuration for validating.
 */
export function getNodeCompat(
	compatibilityDate: string = "2000-01-01", // Default to some arbitrary old date
	compatibilityFlags: string[],
	opts?: {
		nodeCompat?: boolean;
	}
) {
	const { nodeCompat = false } = opts ?? {};
	const {
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	} = computeWorkerdCompatibilityFlags(compatibilityFlags, compatibilityDate);

	const legacy = nodeCompat === true;
	let mode: NodeJSCompatMode = null;
	if (hasNodejsCompatV2Flag) {
		mode = "v2";
	} else if (hasNodejsCompatFlag) {
		mode = "v1";
	} else if (hasNodejsAlsFlag) {
		mode = "als";
	} else if (legacy) {
		mode = "legacy";
	}

	return {
		mode,
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	};
}

function computeWorkerdCompatibilityFlags(
	compatibilityFlags: string[],
	compatibilityDate: string
) {
	const flags = new Flags(compatibilityFlags, compatibilityDate);
	const nodejsCompatFlag = flags.get("nodejs_compat");
	return {
		hasNodejsAlsFlag: flags.get("nodejs_als").value,
		hasNodejsCompatFlag: nodejsCompatFlag.value,
		hasNodejsCompatV2Flag: flags
			.get("nodejs_compat_v2")
			.impliedByAfterDate(nodejsCompatFlag, "2024-09-23").value,
		hasExperimentalNodejsCompatV2Flag: compatibilityFlags.includes(
			"experimental:nodejs_compat_v2"
		),
	};
}

type Flag = {
	value: boolean;
	impliedByAfterDate: (flag: Flag, date: string) => Flag;
};

class Flags {
	constructor(
		private flags: string[],
		private compatibilityDate: string
	) {}

	get(name: string): Flag {
		const noFlagName = `no_${name}`;

		const flag = {
			value: this.flags.includes(name) && !this.flags.includes(noFlagName),
			impliedByAfterDate: (other: Flag, date: string) => {
				flag.value ||= other.value && date >= this.compatibilityDate;
				return flag;
			},
		};
		return flag;
	}
}