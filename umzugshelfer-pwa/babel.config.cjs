module.exports = {
  env: {
    test: {
      // CJS Jest has no import.meta; keep file URLs for ESM-only Router 8.
      plugins: [({ types }) => ({
        visitor: {
          MetaProperty(path, state) {
            if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
              path.replaceWith(types.valueToNode({ url: require('node:url').pathToFileURL(state.filename).href }));
            }
          },
        },
      })],
    },
  },
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};
