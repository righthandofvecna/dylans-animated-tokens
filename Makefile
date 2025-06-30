
ver:
	echo "export const VERSION = \""$$(jq -r ".version" module.json)"\";" > js/version.mjs

release: ver
	npx esbuild js/main.mjs --bundle --minify --outfile=dylans-animated-tokens.js
	zip module.zip -r lang templates dylans-animated-tokens.js module.json
	rm dylans-animated-tokens.js
	echo "import * as main from './js/main.mjs';" > dylans-animated-tokens.js

