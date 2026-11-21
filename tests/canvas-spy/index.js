'use strict';
const { loadPage, EXIT_NO_SUCH_MUTANT, EXIT_BAD_ANCHOR } = require('./page');
const { createRecorder, Path2D, bbox } = require('./recorder');
const { createClock } = require('./clock');
const query = require('./query');

module.exports = {
  loadPage,
  createRecorder,
  createClock,
  Path2D,
  bbox,
  ...query,
  EXIT_NO_SUCH_MUTANT,
  EXIT_BAD_ANCHOR,
};
