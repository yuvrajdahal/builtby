const { blameFile } = require("./blame");
const { transform } = require("./transform");

/** Webpack loader: tag JSX host elements with their git authorship. */
module.exports = function builtbyLoader(source) {
  const callback = this.async();
  const file = this.resourcePath;

  // Cheap bail-out for modules without lowercase JSX tags.
  if (!/<[a-z]/.test(source)) return callback(null, source);

  blameFile(file)
    .then((blame) => callback(null, blame ? transform(source, file, blame) : source))
    .catch((err) => {
      this.emitWarning(new Error(`[builtby] ${file}: ${err.message}`));
      callback(null, source);
    });
};
