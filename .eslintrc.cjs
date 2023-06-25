module.exports = {
	env: { browser: true, es2020: true, webextensions: true },
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:react-hooks/recommended",
		"prettier",
	],
	parser: "@typescript-eslint/parser",
	parserOptions: { ecmaVersion: "latest", sourceType: "module" },
	plugins: ["react-refresh"],
	rules: {
		"react-refresh/only-export-components": "warn",
	},
	overrides: [
		{
			// to prevent `'module' is not defined` at the top of this file
			files: ["**/*.cjs"],
			env: {
				node: true,
			},
		},
	],
};
