import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { alias: { "@": resolve(__dirname, "src") } },
	test: {
		include: ["src/**/*.test.ts"],
		exclude: ["dist/**", "node_modules/**"],
		environment: "node",
		coverage: { provider: "v8", include: ["src/**/*.ts"], exclude: ["src/**/*.test.ts", "src/**/__tests__/**"] },
	},
});
