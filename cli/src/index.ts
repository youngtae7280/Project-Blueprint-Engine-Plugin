#!/usr/bin/env node
import process from 'node:process'
import { runPbeCli } from './app.js'

const result = await runPbeCli(process.argv.slice(2), { cwd: process.cwd() })
if (result.stdout) {
  process.stdout.write(result.stdout)
}
if (result.stderr) {
  process.stderr.write(result.stderr)
}
process.exit(result.exitCode)
