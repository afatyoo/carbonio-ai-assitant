const CopyPlugin = require('copy-webpack-plugin');
const path = require('path');

const customizeConfig = (config) => ({
	...config,
	plugins: [
		...(config.plugins ?? []),
		new CopyPlugin({
			patterns: [
				{
					from: path.resolve(__dirname, 'i18n'),
					to: path.resolve(__dirname, 'dist/i18n')
				}
			]
		})
	]
});

module.exports = customizeConfig;
