module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: 'module',
		ecmaFeatures: { jsx: true }
	},
	plugins: ['@typescript-eslint', 'react-hooks', 'unused-imports'],
	env: { browser: true, es2022: true },
	ignorePatterns: ['dist/', 'release/', 'node_modules/'],
	rules: {
		'no-eval': 'error',
		'no-implied-eval': 'error',
		'no-new-func': 'error',
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		'unused-imports/no-unused-imports': 'error',
		'react-hooks/rules-of-hooks': 'error',
		'react-hooks/exhaustive-deps': 'warn'
	}
};
