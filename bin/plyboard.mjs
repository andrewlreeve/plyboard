#!/usr/bin/env node

import { runCli } from "../src/cli.js";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`plyboard: ${error.message}`);
  if (process.env.PLYBOARD_DEBUG === "1" && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
