import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import { type Config } from "../../config";
import {
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromConfig,
} from "../../d1/utils";
import { msw } from "../helpers/http-mocks";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockGetMemberships } from "../helpers/mock-oauth-flow";

describe("getDatabaseInfoFromConfig", () => {
	it("should handle no database", ({ expect }) => {
		const config = {
			d1_databases: [],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toBeNull();
	});

	it("should handle no matching database", ({ expect }) => {
		const config = {
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db2")).toBeNull();
	});

	it("should handle matching database", ({ expect }) => {
		const config = {
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toEqual({
			uuid: "xxxx",
			previewDatabaseUuid: undefined,
			binding: "DATABASE",
			name: "db",
			migrationsTableName: "d1_migrations",
			migrationsFolderPath: "./migrations",
			internal_env: undefined,
		});
	});

	it("should handle matching a database with a custom migrations folder", ({
		expect,
	}) => {
		const config = {
			d1_databases: [
				{
					binding: "DATABASE",
					database_name: "db",
					database_id: "xxxx",
					migrations_dir: "./custom_migrations",
				},
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toEqual({
			uuid: "xxxx",
			previewDatabaseUuid: undefined,
			binding: "DATABASE",
			name: "db",
			migrationsTableName: "d1_migrations",
			migrationsFolderPath: "./custom_migrations",
			internal_env: undefined,
		});
	});

	it("should handle matching a database with custom migrations table", ({
		expect,
	}) => {
		const config = {
			d1_databases: [
				{
					binding: "DATABASE",
					database_name: "db",
					database_id: "xxxx",
					migrations_table: "custom_migrations",
				},
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db")).toEqual({
			uuid: "xxxx",
			previewDatabaseUuid: undefined,
			binding: "DATABASE",
			name: "db",
			migrationsTableName: "custom_migrations",
			migrationsFolderPath: "./migrations",
			internal_env: undefined,
		});
	});

	it("should handle matching a database when there are multiple databases", ({
		expect,
	}) => {
		const config = {
			d1_databases: [
				{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				{ binding: "DATABASE2", database_name: "db2", database_id: "yyyy" },
			],
		} as unknown as Config;
		expect(getDatabaseInfoFromConfig(config, "db2")).toEqual({
			uuid: "yyyy",
			previewDatabaseUuid: undefined,
			binding: "DATABASE2",
			name: "db2",
			migrationsTableName: "d1_migrations",
			migrationsFolderPath: "./migrations",
			internal_env: undefined,
		});
	});
});

describe("getDatabaseByNameOrBinding", () => {
	mockAccountId({ accountId: null });
	mockApiToken();

	it("should handle no database", async ({ expect }) => {
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		msw.use(
			http.get("*/accounts/:accountId/d1/database", async (req, res, ctx) => {
				return res(
					ctx.status(200),
					ctx.json({
						result: [
							{
								file_size: 7421952,
								name: "benchmark3-v1",
								num_tables: 2,
								uuid: "7b0c1d24-ec57-4179-8663-9b82dafe9277",
								version: "alpha",
							},
						],
						success: true,
						errors: [],
						messages: [],
					})
				);
			})
		);
		const config = {
			d1_databases: [],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "db")
		).rejects.toThrowError("Couldn't find DB with name 'db'");
	});

	it("should handle a matching database", async ({ expect }) => {
		mockGetMemberships([
			{ id: "IG-88", account: { id: "1701", name: "enterprise" } },
		]);
		const mockDb = {
			file_size: 7421952,
			name: "db",
			num_tables: 2,
			uuid: "7b0c1d24-ec57-4179-8663-9b82dafe9277",
			version: "alpha",
		};
		msw.use(
			http.get("*/accounts/:accountId/d1/database", async (req, res, ctx) => {
				return res(
					ctx.status(200),
					ctx.json({
						result: [mockDb],
						success: true,
						errors: [],
						messages: [],
					})
				);
			})
		);
		const config = {
			d1_databases: [],
		} as unknown as Config;
		await expect(
			getDatabaseByNameOrBinding(config, "123", "db")
		).resolves.toStrictEqual(mockDb);
	});
});
