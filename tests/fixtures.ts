/** Эталоны, снятые с Python-версии (tools/dump_fixtures.py). Заморожены. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fixture(name: string): any {
  return JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf-8"));
}
