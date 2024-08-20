export type Workflow = {
	name: string;
	id: string;
	created_on: string;
	modified_on: string;
	script_name: string;
	class_name: string;
};

export type Version = {
	id: string;
	created_on: string;
	modified_on: string;
	workflow_id: string;
};

export type InstanceStatus =
	| "unknown"
	| "queued"
	| "running"
	| "paused"
	| "errored"
	| "terminated"
	| "complete";

export type InstanceWithoutDates = {
	status: InstanceStatus;
	instanceId: string;
	versionId: string;
	workflowId: string;
};

export type Instance = {
	id: string;
	created_on: string;
	modified_on: string;
	workflow_id: string;
	version_id: string;
	status: InstanceStatus;
};

export type InstanceTriggerName =
	| "api"
	| "binding"
	| "event"
	| "cron"
	| "unknown";

export type InstanceAttempt = {
	start: string;
	end: string | null;
	success: boolean | null;
	error: { name: string; message: string } | null;
};

export type InstanceStepLog = {
	name: string;
	start: string;
	end: string | null;
	attempts: InstanceAttempt[];
	output: unknown;
	success: boolean | null;
	type: "step";
};

export type InstanceSleepLog = {
	name: string;
	start: string;
	end: string;
	finished: boolean;
	type: "sleep";
};

export type InstanceTerminateLog = {
	type: "termination";
	trigger: {
		source: string;
	};
};

export type InstanceStatusAndLogs = {
	status: InstanceStatus;
	params: Record<string, unknown>;
	trigger: {
		source: InstanceTriggerName;
	};
	versionId: string;
	queued: string;
	start: string | null;
	end: string | null;
	steps: (InstanceStepLog | InstanceSleepLog | InstanceTerminateLog)[];
	success: boolean | null;
	error: { name: string; message: string } | null;
};
