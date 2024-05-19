import { writeFileSync } from "node:fs";
import readline from "node:readline";
import { http, HttpResponse } from "msw";
import { afterEach, assert, beforeEach, describe, it, vi } from "vitest";
import { msw } from "../helpers/http-mocks";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetMembershipsFail } from "../helpers/mock-oauth-flow";
import { useMockStdin } from "../helpers/mock-stdin";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { PagesProject } from "../../pages/download-config";
import type { Interface } from "node:readline";

function createFetchResult(result: unknown, success = true) {
	return {
		success,
		errors: [],
		messages: [],
		result,
	};
}

export function mockGetMemberships(
	accounts: { id: string; account: { id: string; name: string } }[]
) {
	msw.use(
		http.get("*/memberships", (req, res, ctx) => {
			return res.once(ctx.json(createFetchResult(accounts)));
		})
	);
}

describe("wrangler pages secret", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	describe("put", () => {
		function mockProjectRequests(
			input: { name: string; text: string },
			env: "production" | "preview" = "production"
		) {
			msw.use(
				rest.patch(
					`*/accounts/:accountId/pages/projects/:project`,
					async (req, res, ctx) => {
						assert(req.params.project == "some-project-name");
						const project = await req.json<PagesProject>();
						assert.deepEqual(
							project.deployment_configs[env].env_vars?.[input.name],
							{ type: "secret_text", value: input.text }
						);
						assert(
							project.deployment_configs[env].wrangler_config_hash ==
								(env === "production" ? "wch" : undefined)
						);
						return res.once(ctx.json(createFetchResult(project)));
					}
				),
				http.get(
					"*/accounts/:accountId/pages/projects/:project",
					async (req, res, ctx) => {
						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									name: "some-project-name",
									deployment_configs: {
										production: { wrangler_config_hash: "wch" },
										preview: {},
									},
								},
							})
						);
					}
				)
			);
		}

		describe("interactive", () => {
			beforeEach(() => {
				setIsTTY(true);
			});

			it("should trim stdin secret value", async ({ expect }) => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: `hunter2
				  `,
				});

				mockProjectRequests({ name: `secret-name`, text: `hunter2` });
				await runWrangler(
					"pages secret put secret-name --project some-project-name"
				);
				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Pages project \\"some-project-name\\" (production)
			✨ Success! Uploaded secret secret-name"
		`);
			});

			it("should create a secret", async ({ expect }) => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: "the-secret",
				});

				mockProjectRequests({ name: "the-key", text: "the-secret" });
				await runWrangler(
					"pages secret put the-key --project some-project-name"
				);

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Pages project \\"some-project-name\\" (production)
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should create a secret: preview", async ({ expect }) => {
				mockPrompt({
					text: "Enter a secret value:",
					options: { isSecret: true },
					result: "the-secret",
				});

				mockProjectRequests({ name: "the-key", text: "the-secret" }, "preview");
				await runWrangler(
					"pages secret put the-key --project some-project-name --env preview"
				);

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Pages project \\"some-project-name\\" (preview)
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error with invalid env", async ({ expect }) => {
				mockProjectRequests(
					{ name: "the-key", text: "the-secret" },
					// @ts-expect-error This is intentionally invalid
					"some-env"
				);
				await expect(
					runWrangler(
						"pages secret put the-key --project some-project-name --env some-env"
					)
				).rejects.toMatchInlineSnapshot(
					`[Error: Pages does not support the "some-env" named environment. Please specify "production" (default) or "preview"]`
				);
			});

			it("should error without a project name", async ({ expect }) => {
				await expect(
					runWrangler("pages secret put the-key")
				).rejects.toMatchInlineSnapshot(
					`[Error: Must specify a project name.]`
				);
			});
		});

		describe("non-interactive", () => {
			beforeEach(() => {
				setIsTTY(false);
			});
			const mockStdIn = useMockStdin({ isTTY: false });

			it("should trim stdin secret value, from piped input", async ({
				expect,
			}) => {
				mockProjectRequests({ name: "the-key", text: "the-secret" });
				// Pipe the secret in as three chunks to test that we reconstitute it correctly.
				mockStdIn.send(
					`the`,
					`-`,
					`secret
          ` // whitespace & newline being removed
				);
				await runWrangler(
					"pages secret put the-key --project some-project-name"
				);

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Pages project \\"some-project-name\\" (production)
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should create a secret, from piped input", async ({ expect }) => {
				mockProjectRequests({ name: "the-key", text: "the-secret" });
				// Pipe the secret in as three chunks to test that we reconstitute it correctly.
				mockStdIn.send("the", "-", "secret");
				await runWrangler(
					"pages secret put the-key --project some-project-name"
				);

				expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Pages project \\"some-project-name\\" (production)
			✨ Success! Uploaded secret the-key"
		`);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.err).toMatchInlineSnapshot(`""`);
			});

			it("should error if the piped input fails", async ({ expect }) => {
				mockProjectRequests({ name: "the-key", text: "the-secret" });
				mockStdIn.throwError(new Error("Error in stdin stream"));
				await expect(
					runWrangler("pages secret put the-key --project some-project-name")
				).rejects.toThrowErrorMatchingInlineSnapshot(`"Error in stdin stream"`);

				expect(std.out).toMatchInlineSnapshot(`
			          "
			          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		        `);
				expect(std.warn).toMatchInlineSnapshot(`""`);
			});

			describe("with accountId", () => {
				mockAccountId({ accountId: null });

				it("should error if request for memberships fails", async ({
					expect,
				}) => {
					mockGetMembershipsFail();
					await expect(
						runWrangler("pages secret put the-key --project some-project-name")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`"A request to the Cloudflare API (/memberships) failed."`
					);
				});

				it("should error if a user has no account", async ({ expect }) => {
					mockGetMemberships([]);
					await expect(
						runWrangler("pages secret put the-key --project some-project-name")
					).rejects.toThrowErrorMatchingInlineSnapshot(`
				                  "Failed to automatically retrieve account IDs for the logged in user.
				                  In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as \`account_id\` in your \`wrangler.toml\` file."
			                `);
				});

				it("should error if a user has multiple accounts, and has not specified an account", async ({
					expect,
				}) => {
					mockGetMemberships([
						{
							id: "1",
							account: { id: "account-id-1", name: "account-name-1" },
						},
						{
							id: "2",
							account: { id: "account-id-2", name: "account-name-2" },
						},
						{
							id: "3",
							account: { id: "account-id-3", name: "account-name-3" },
						},
					]);

					await expect(
						runWrangler("pages secret put the-key --project some-project-name")
					).rejects.toThrowErrorMatchingInlineSnapshot(`
				"More than one account available but unable to select one in non-interactive mode.
				Please set the appropriate \`account_id\` in your \`wrangler.toml\` file.
				Available accounts are (\`<name>\`: \`<account_id>\`):
				  \`account-name-1\`: \`account-id-1\`
				  \`account-name-2\`: \`account-id-2\`
				  \`account-name-3\`: \`account-id-3\`"
			`);
				});
			});
		});
	});

	describe("delete", () => {
		beforeEach(() => {
			setIsTTY(true);
		});
		function mockDeleteRequest(
			name: string,
			env: "production" | "preview" = "production"
		) {
			msw.use(
				rest.patch(
					`*/accounts/:accountId/pages/projects/:project`,
					async (req, res, ctx) => {
						assert(req.params.project == "some-project-name");
						const project = await req.json<PagesProject>();
						assert(project.deployment_configs[env].env_vars?.[name] == null);
						assert(
							project.deployment_configs[env].wrangler_config_hash ==
								(env === "production" ? "wch" : undefined)
						);

						return res.once(ctx.json(createFetchResult(project)));
					}
				),
				http.get(
					"*/accounts/:accountId/pages/projects/:project",
					async (req, res, ctx) => {
						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									name: "some-project-name",
									deployment_configs: {
										production: { wrangler_config_hash: "wch" },
										preview: {},
									},
								},
							})
						);
					}
				)
			);
		}

		it("should delete a secret", async ({ expect }) => {
			mockDeleteRequest("the-key");
			mockConfirm({
				text: "Are you sure you want to permanently delete the secret the-key on the Pages project some-project-name (production)?",
				result: true,
			});
			await runWrangler(
				"pages secret delete the-key --project some-project-name"
			);
			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Deleting the secret the-key on the Pages project some-project-name (production)
			✨ Success! Deleted secret the-key"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should delete a secret: preview", async ({ expect }) => {
			mockDeleteRequest("the-key", "preview");
			mockConfirm({
				text: "Are you sure you want to permanently delete the secret the-key on the Pages project some-project-name (preview)?",
				result: true,
			});
			await runWrangler(
				"pages secret delete the-key --project some-project-name --env preview"
			);
			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Deleting the secret the-key on the Pages project some-project-name (preview)
			✨ Success! Deleted secret the-key"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should fail to delete with invalid env", async ({ expect }) => {
			await expect(
				runWrangler(
					"pages secret delete the-key --project some-project-name --env some-env"
				)
			).rejects.toMatchInlineSnapshot(
				`[Error: Pages does not support the "some-env" named environment. Please specify "production" (default) or "preview"]`
			);
		});

		it("should error without a project name", async ({ expect }) => {
			await expect(
				runWrangler("pages secret delete the-key")
			).rejects.toMatchInlineSnapshot(`[Error: Must specify a project name.]`);
		});
	});

	describe("list", () => {
		beforeEach(() => {
			setIsTTY(true);
		});
		function mockListRequest() {
			msw.use(
				http.get(
					"*/accounts/:accountId/pages/projects/:project",
					async (req, res, ctx) => {
						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									name: "some-project-name",
									deployment_configs: {
										production: {
											wrangler_config_hash: "wch",
											env_vars: {
												"the-secret-name": {
													type: "secret_text",
												},
												"the-secret-name-2": {
													type: "secret_text",
												},
											},
										},
										preview: {
											env_vars: {
												"the-secret-name-preview": {
													type: "secret_text",
												},
											},
										},
									},
								},
							})
						);
					}
				)
			);
		}

		it("should list secrets", async ({ expect }) => {
			mockListRequest();
			await runWrangler("pages secret list --project some-project-name");
			expect(std.out).toMatchInlineSnapshot(`
			"The \\"production\\" environment of your Pages project \\"some-project-name\\" has access to the following secrets:
			  - the-secret-name: Value Encrypted
			  - the-secret-name-2: Value Encrypted"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should list secrets: preview", async ({ expect }) => {
			mockListRequest();
			await runWrangler(
				"pages secret list --project some-project-name --env preview"
			);
			expect(std.out).toMatchInlineSnapshot(`
			"The \\"preview\\" environment of your Pages project \\"some-project-name\\" has access to the following secrets:
			  - the-secret-name-preview: Value Encrypted"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should fail with invalid env", async ({ expect }) => {
			mockListRequest();
			await expect(
				runWrangler(
					"pages secret list --project some-project-name --env some-env"
				)
			).rejects.toMatchInlineSnapshot(
				`[Error: Pages does not support the "some-env" named environment. Please specify "production" (default) or "preview"]`
			);
		});

		it("should error without a project name", async ({ expect }) => {
			await expect(
				runWrangler("pages secret list")
			).rejects.toMatchInlineSnapshot(`[Error: Must specify a project name.]`);
		});
	});

	describe("secret bulk", () => {
		function mockProjectRequests(
			vars: { name: string; text: string }[],
			env: "production" | "preview" = "production"
		) {
			msw.use(
				rest.patch(
					`*/accounts/:accountId/pages/projects/:project`,
					async (req, res, ctx) => {
						assert(req.params.project == "some-project-name");
						const project = await req.json<PagesProject>();
						for (const variable of vars) {
							assert.deepEqual(
								project.deployment_configs[env].env_vars?.[variable.name],
								{ type: "secret_text", value: variable.text }
							);
						}

						assert(
							project.deployment_configs[env].wrangler_config_hash ==
								(env === "production" ? "wch" : undefined)
						);
						return res.once(ctx.json(createFetchResult(project)));
					}
				),
				http.get(
					"*/accounts/:accountId/pages/projects/:project",
					async (req, res, ctx) => {
						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									name: "some-project-name",
									deployment_configs: {
										production: { wrangler_config_hash: "wch" },
										preview: {},
									},
								},
							})
						);
					}
				)
			);
		}
		it("should fail secret bulk w/ no pipe or JSON input", async ({
			expect,
		}) => {
			mockProjectRequests([]);
			vi.spyOn(readline, "createInterface").mockImplementation(
				() => null as unknown as Interface
			);
			await expect(
				runWrangler(`pages secret bulk --project some-project-name`)
			).rejects.toMatchInlineSnapshot(
				`[Error: 🚨 Please provide a JSON file or valid JSON pipe]`
			);
		});

		it("should use secret bulk w/ pipe input", async ({ expect }) => {
			vi.spyOn(readline, "createInterface").mockImplementation(
				() =>
					// `readline.Interface` is an async iterator: `[Symbol.asyncIterator](): AsyncIterableIterator<string>`
					JSON.stringify({
						secret1: "secret-value",
						password: "hunter2",
					}) as unknown as Interface
			);

			mockProjectRequests([
				{
					name: "secret1",
					text: "secret-value",
				},
				{
					name: "password",
					text: "hunter2",
				},
			]);

			await runWrangler(`pages secret bulk --project some-project-name`);
			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secrets for the Pages project \\"some-project-name\\" (production)
			Finished processing secrets JSON file:
			✨ 2 secrets successfully uploaded"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should create secret bulk", async ({ expect }) => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);

			mockProjectRequests([
				{
					name: "secret-name-1",
					text: "secret_text",
				},
				{
					name: "secret-name-2",
					text: "secret_text",
				},
			]);

			await runWrangler(
				"pages secret bulk ./secret.json --project some-project-name"
			);

			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secrets for the Pages project \\"some-project-name\\" (production)
			Finished processing secrets JSON file:
			✨ 2 secrets successfully uploaded"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should create secret bulk: preview", async ({ expect }) => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
				})
			);

			mockProjectRequests(
				[
					{
						name: "secret-name-1",
						text: "secret_text",
					},
					{
						name: "secret-name-2",
						text: "secret_text",
					},
				],
				"preview"
			);

			await runWrangler(
				"pages secret bulk ./secret.json --project some-project-name --env preview"
			);

			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secrets for the Pages project \\"some-project-name\\" (preview)
			Finished processing secrets JSON file:
			✨ 2 secrets successfully uploaded"
		`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should count success and network failure on secret bulk", async ({
			expect,
		}) => {
			writeFileSync(
				"secret.json",
				JSON.stringify({
					"secret-name-1": "secret_text",
					"secret-name-2": "secret_text",
					"secret-name-3": "secret_text",
					"secret-name-4": "secret_text",
					"secret-name-5": "secret_text",
					"secret-name-6": "secret_text",
					"secret-name-7": "secret_text",
				})
			);

			msw.use(
				http.get(
					"*/accounts/:accountId/pages/projects/:project",
					async (req, res, ctx) => {
						return res(
							ctx.status(200),
							ctx.json({
								success: true,
								errors: [],
								messages: [],
								result: {
									name: "some-project-name",
									deployment_configs: {
										production: { wrangler_config_hash: "wch" },
										preview: {},
									},
								},
							})
						);
					}
				)
			);
			msw.use(
				rest.patch(
					"*/accounts/:accountId/pages/projects/:project",
					async (_, res) => {
						return res.networkError(`Failed to create secret`);
					}
				)
			);

			await expect(
				runWrangler(
					"pages secret bulk ./secret.json --project some-project-name"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`"🚨 7 secrets failed to upload"`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secrets for the Pages project \\"some-project-name\\" (production)
			Finished processing secrets JSON file:
			✨ 0 secrets successfully uploaded
			"
		`);
			expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1m🚨 7 secrets failed to upload[0m

			"
		`);
		});
	});
});
