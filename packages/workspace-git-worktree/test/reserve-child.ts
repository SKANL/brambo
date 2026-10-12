import { WorktreeLedger } from '../src/ledger.ts'

// Child process for the cross-process reservation test: waits for a shared start
// instant so every process hits the read-modify-write window together.
const [stateDir, startAt, count] = process.argv.slice(2) as [string, string, string]
const ledger = new WorktreeLedger(stateDir)
while (Date.now() < Number(startAt)) await new Promise((resolve) => setTimeout(resolve, 1))
const ordinals: number[] = []
for (let index = 0; index < Number(count); index += 1) ordinals.push(await ledger.reserveOrdinal())
process.stdout.write(JSON.stringify(ordinals))
