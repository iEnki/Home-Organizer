const pkg = require('./package.json');
const baseline = require('./config/browser-baseline.json');
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: { overrideBrowserslist: [...pkg.browserslist.production, ...baseline.compatibilityFloor] },
  },
};
