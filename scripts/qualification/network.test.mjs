import test from 'node:test'
import assert from 'node:assert/strict'
import { fork, spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { prepareBundle, loadPublicPorts, runNetworkScenario, combineCounts, containerArguments,
  validateNativeScope, runContainerScenario, verifyContainment, bridgeRequest, inspectNativeImage, receiveContainer } from './network-controller.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
// The native boundary returns the installed manual's JSON shape, not a guessed Go template.
async function imageInspectionScenario(makeRecord) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-')), resources = new Set(), launches = []
  try {
    const proof = await runContainerScenario({ optIn: true, repo, connection: 'brambo-q-6771c6f1',
      profile: 'C:/Users/angua/AppData/Local/Temp/brambo-podman-setup-6771c6f1',
      image: 'docker.io/library/node@sha256:' + 'a'.repeat(64), root,
      run: async args => {
        const key = args[0] + ':' + args.at(-1)
        if (args[0] === 'image' && args[1] === 'inspect') {
          const value = makeRecord(args.at(-1))
          const code = args.includes('--format') ? 125 : 0
          return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ['--input-type=module', '-e',
              "let text='';for await(const bytes of process.stdin)text+=bytes;process.stdout.write(text);process.exitCode=" + code],
            { env: {}, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
            let stdout = ''; child.stdout.on('data', bytes => { stdout += bytes })
            child.stdin.on('error', () => {}); child.stdin.end(value)
            child.once('error', reject)
            child.once('close', exitCode => resolve({ exitCode, stdout, settled: true, truncated: false }))
          })
        }
        if (args[0] === 'run') { launches.push(args); return { exitCode: 125, stdout: '', settled: true, truncated: false } }
        if (args[1] === 'create') resources.add(key)
        if (args[0] === 'build') resources.add('image:' + args[args.indexOf('--tag') + 1])
        if (args[1] === 'rm') resources.delete(key)
        return { exitCode: args[1] === 'exists' && !resources.has(key) ? 1 : 0,
          stdout: args[0] === 'network' && args[1] === 'inspect' ? JSON.stringify([{ name: args.at(-1), id: 'd'.repeat(64), internal: true }]) : '', settled: true, truncated: false }
      } })
    return { proof, launches }
  } finally { await rm(root, { recursive: true, force: true }) }
}
test('image inspection consumes documented native JSON before launching the exact immutable image', async () => {
  const { proof, launches } = await imageInspectionScenario(tag => JSON.stringify([{ Id: 'b'.repeat(64), RepoTags: [tag + ':latest'], RepoDigests: [] }]))
  assert.equal(launches.length, 1, 'documented JSON must reach container admission without a Go template')
  assert.equal(launches[0].includes('sha256:' + 'b'.repeat(64)), true)
  assert.equal(proof.qualified, false, 'the controlled subsequent launch failure remains a failure')
  assert.equal(proof.reason, 'command-failed')
  assert.equal(proof.cleanupVerified, true)
})
for (const [name, record] of Object.entries({ missing: () => [{}], multiple: tag => [
  { Id: 'b'.repeat(64), RepoTags: [tag + ':latest'] }, { Id: 'c'.repeat(64), RepoTags: [tag + ':latest'] }],
  maliciousId: tag => [{ Id: 'sha256:../host', RepoTags: [tag + ':latest'] }],
  coercedId: tag => [{ Id: ['b'.repeat(64)], RepoTags: [tag + ':latest'] }],
  wrongIdentity: () => [{ Id: 'b'.repeat(64), RepoTags: ['localhost/brambo-network-other'] }],
  undocumentedAlias: tag => [{ ID: 'b'.repeat(64), RepoTags: [tag + ':latest'] }],
  oversized: tag => [{ Id: 'b'.repeat(64), RepoTags: [tag + ':latest'], padding: 'x'.repeat(1048576) }],
})) {
  test('image inspection rejects ' + name + ' native JSON before container admission', async () => {
    const { proof, launches } = await imageInspectionScenario(tag => JSON.stringify(record(tag)))
    assert.equal(launches.length, 0)
    assert.equal(proof.reason, 'image-inspect-invalid')
    assert.equal(proof.qualified, false)
    assert.equal(proof.cleanupVerified, true)
  })
}
test('image inspection binds the exact official pinned digest and expected image ID at the shared launcher seam', async () => {
  const image = 'docker.io/library/node@sha256:' + 'a'.repeat(64), id = 'b'.repeat(64)
  const run = async args => {
    assert.deepEqual(args, ['image', 'inspect', image])
    return { exitCode: 0, settled: true, truncated: false,
      stdout: JSON.stringify([{ Id: id, RepoTags: ['docker.io/library/node:24-bookworm-slim'], RepoDigests: [image] }]) }
  }
  assert.equal(await inspectNativeImage(run, image, 'sha256:' + id), 'sha256:' + id)
  await assert.rejects(inspectNativeImage(run, image, 'sha256:' + 'c'.repeat(64)), /image-inspect-invalid/)
  await assert.rejects(inspectNativeImage(async () => ({ exitCode: 0, settled: true, truncated: false,
    stdout: JSON.stringify([{ Id: id, RepoDigests: [image + '0'] }]) }), image), /image-inspect-invalid/)
})
test('image inspection rejects malformed, nonsettled, truncated or hostile native result metadata', async () => {
  const image = 'docker.io/library/node@sha256:' + 'a'.repeat(64)
  const valid = { exitCode: 0, settled: true, truncated: false, stdout: JSON.stringify([{ Id: 'b'.repeat(64), RepoDigests: [image] }]) }
  for (const result of [{ ...valid, exitCode: 125 }, { ...valid, settled: false }, { ...valid, truncated: true },
    { ...valid, stdout: '{' }, { ...valid, stdout: JSON.stringify({ Id: 'b'.repeat(64) }) },
    { ...valid, stdout: JSON.stringify([{ Id: 'b'.repeat(64), RepoDigests: [image], ID: 'c'.repeat(64) }]) },
    Object.defineProperty({}, 'stdout', { get() { throw Error('PRIVATE_SYNTHETIC_GETTER') } }),
    new Proxy({}, { getOwnPropertyDescriptor() { throw Error('PRIVATE_SYNTHETIC_PROXY') } })]) {
    await assert.rejects(inspectNativeImage(async () => result, image), /^Error: image-inspect-invalid$/)
  }
  await assert.rejects(inspectNativeImage(async () => { throw Error('PRIVATE_SYNTHETIC_TRANSPORT') }, image), /^Error: image-inspect-invalid$/)
})
for (const target of ['reference', 'expectedId']) test('image inspection rejects nonprimitive ' + target + ' before coercion or native calls', async () => {
  const image = 'docker.io/library/node@sha256:' + 'a'.repeat(64)
  let coercions = 0, nativeCalls = 0
  const value = text => ({ toString() { coercions++; return text } })
  const run = async () => { nativeCalls++; return { exitCode: 0, settled: true, truncated: false,
    stdout: JSON.stringify([{ Id: 'b'.repeat(64), RepoDigests: [image] }]) } }
  const reference = target === 'reference' ? value(image) : image
  const expectedId = target === 'expectedId' ? value('sha256:' + 'b'.repeat(64)) : undefined
  await assert.rejects(inspectNativeImage(run, reference, expectedId), /^Error: image-inspect-invalid$/)
  assert.deepEqual({ coercions, nativeCalls }, { coercions: 0, nativeCalls: 0 })
})

const containmentScope = { network: 'brambo-network-net', networkId: 'd'.repeat(64), internal: true, volume: 'brambo-network-a' }
function containmentFixture(mode = containmentScope.network) {
  return { Config: { User: '65534:65534' }, EffectiveCaps: [], BoundingCaps: [],
    HostConfig: { ReadonlyRootfs: true, NetworkMode: mode, CapDrop: ['CAP_CHOWN', 'CAP_DAC_OVERRIDE'],
      SecurityOpt: ['no-new-privileges'], PidsLimit: 64, Memory: 268435456, CpuQuota: 100000, CpuPeriod: 100000,
      Tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=16m' } },
    Mounts: [{ Type: 'volume', Name: containmentScope.volume, Destination: '/state', RW: true, Propagation: 'rprivate' }],
    NetworkSettings: { Ports: {}, Networks: { [containmentScope.network]: { NetworkID: containmentScope.networkId } } } }
}
for (const mode of ['owned-name', 'owned-id']) test('containment admits documented Podman ' + mode + ' network with empty actual capabilities and HostConfig tmpfs', () => {
  assert.equal(verifyContainment(containmentFixture(mode === 'owned-id' ? containmentScope.networkId : containmentScope.network), containmentScope), true)
})
for (const mode of ['owned-name', 'owned-id']) test('containment rejects missing membership NetworkID for ' + mode, () => {
  const value = containmentFixture(mode === 'owned-id' ? containmentScope.networkId : containmentScope.network)
  delete value.NetworkSettings.Networks[containmentScope.network].NetworkID
  assert.equal(verifyContainment(value, containmentScope), false)
})
for (const [name, mutate] of Object.entries({
  foreignNetwork: value => { value.HostConfig.NetworkMode = 'PRIVATE_FOREIGN' },
  hostNetwork: value => { value.HostConfig.NetworkMode = 'host' },
  wrongMembership: value => { value.NetworkSettings.Networks = { PRIVATE_FOREIGN: {} } },
  wrongNetworkId: value => { value.NetworkSettings.Networks[containmentScope.network].NetworkID = 'e'.repeat(64) },
  nonInternal: (_value, scope) => { scope.internal = false },
  effectiveCapabilities: value => { value.EffectiveCaps = ['CAP_CHOWN'] },
  boundingCapabilities: value => { value.BoundingCaps = ['CAP_CHOWN'] },
  missingEffectiveCapabilities: value => { delete value.EffectiveCaps },
  missingBoundingCapabilities: value => { delete value.BoundingCaps },
  unsafeTmpfs: value => { value.HostConfig.Tmpfs['/tmp'] = 'rw,exec,suid,dev,size=16m' },
  conflictingTmpfs: value => { value.HostConfig.Tmpfs['/tmp'] += ',exec' },
  missingTmpfs: value => { delete value.HostConfig.Tmpfs },
  extraTmpfs: value => { value.HostConfig.Tmpfs['/host'] = 'rw,size=16m' },
  oversizedTmpfs: value => { value.HostConfig.Tmpfs['/tmp'] = 'x'.repeat(1025) },
  extraMount: value => { value.Mounts.push({ Type: 'bind', Destination: '/host', RW: false }) },
  sharedMount: value => { value.Mounts[0].Propagation = 'shared' },
  rootUser: value => { value.Config.User = '0' },
  writableRoot: value => { value.HostConfig.ReadonlyRootfs = false },
  publishedPort: value => { value.NetworkSettings.Ports = { '8080/tcp': [{}] } },
  missingPrivilegesGuard: value => { value.HostConfig.SecurityOpt = [] },
})) test('containment rejects ' + name + ' rather than trusting requested flags', () => {
  const value = containmentFixture(), scope = { ...containmentScope }; mutate(value, scope)
  assert.equal(verifyContainment(value, scope), false)
})
// Sensitivity: the legacy accepted shape cannot hide nonempty or absent actual caps.
for (const field of ['EffectiveCaps', 'BoundingCaps']) test('containment rejects legacy ALL marker with invalid ' + field, () => {
  const value = containmentFixture()
  value.HostConfig.CapDrop = ['ALL']; value.Mounts.push({ Type: 'tmpfs', Destination: '/tmp', RW: true })
  value[field] = ['CAP_CHOWN']
  assert.equal(verifyContainment(value, containmentScope), false)
  delete value[field]
  assert.equal(verifyContainment(value, containmentScope), false)
})
test('containment descriptor inspection never invokes accessors or primitive coercion', () => {
  let effects = 0
  const value = containmentFixture()
  Object.defineProperty(value, 'HostConfig', { get() { effects++; throw Error('PRIVATE_ACCESSOR') } })
  assert.equal(verifyContainment(value, containmentScope), false)
  assert.equal(effects, 0)
  const mode = { toString() { effects++; return containmentScope.network } }
  assert.equal(verifyContainment(containmentFixture(mode), containmentScope), false)
  assert.equal(effects, 0)
  assert.equal(verifyContainment(new Proxy({}, { getOwnPropertyDescriptor() { throw Error('PRIVATE_PROXY') } }), containmentScope), false)
})

async function containmentAdmissionScenario({ networkPatch = {}, containerPatch = {}, observed = false, runtimePatch = {}, probeFault, inspectFault } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-')), resources = new Set(), launches = [], postAdmission = [], probeTargets = []
  let inspections = 0
  try {
    const proof = await runContainerScenario({ optIn: true, repo, connection: 'brambo-q-6771c6f1',
      profile: 'C:/Users/angua/AppData/Local/Temp/brambo-podman-setup-6771c6f1',
      image: 'docker.io/library/node@sha256:' + 'a'.repeat(64), root,
      run: async args => {
        const key = args[0] + ':' + args.at(-1)
        let stdout = '', exitCode = 0
        if (args[1] === 'create') resources.add(key)
        if (args[0] === 'build') resources.add('image:' + args[args.indexOf('--tag') + 1])
        if (args[0] === 'run') { launches.push(args); resources.add('container:' + args[args.indexOf('--name') + 1]); stdout = 'c'.repeat(64) + '\n' }
        if (args[1] === 'rm') resources.delete(key)
        if (args[1] === 'exists' && !resources.has(key)) exitCode = 1
        if (args[0] === 'network' && args[1] === 'inspect') stdout = JSON.stringify([
          { name: args.at(-1), id: 'd'.repeat(64), internal: true, ...networkPatch }])
        if (args[0] === 'image' && args[1] === 'inspect') stdout = JSON.stringify([
          { Id: 'b'.repeat(64), RepoTags: [args.at(-1) + ':latest'] }])
        if (args[0] === 'inspect') {
          const launch = launches.at(-1), value = containmentFixture(observed ? 'bridge' : 'd'.repeat(64))
          value.Id = 'c'.repeat(64)
          if (observed) { value.EffectiveCaps = null; value.BoundingCaps = null; value.HostConfig.Tmpfs['/tmp'] += ',rprivate,tmpcopyup' }
          const network = launch[launch.indexOf('--network') + 1], volume = launch[launch.indexOf('--volume') + 1].split(':')[0]
          value.NetworkSettings.Networks = { [network]: { NetworkID: 'd'.repeat(64) } }; value.Mounts[0].Name = volume
          inspections++
          stdout = JSON.stringify([{ ...value, ...containerPatch, ...(inspectFault ? inspectFault(inspections) : {}) }])
        }
        if (args[0] === 'exec' && args.includes('--containment-probe')) {
          postAdmission.push('probe'); probeTargets.push(args[1])
          const packet = { containerId: args.at(-2), nonce: args.at(-1), uid: 65534,
            capEff: '0000000000000000', capBnd: '0000000000000000', noNewPrivs: 1, rootWrite: 'EROFS',
            tmp: { filesystem: 'tmpfs', flags: ['rw','nosuid','nodev','noexec','relatime'],
              options: ['rw','size=16384k','uid=1000','gid=1000'], private: true },
            state: { filesystem: 'ext4', flags: ['rw','nosuid','nodev','relatime'], private: true }, ...runtimePatch }
          // A real anonymous child carries the independently specified native response.
          const result = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ['--input-type=module', '-e',
              "let text='';for await(const bytes of process.stdin)text+=bytes;process.stdout.write(text)"],
            { env: {}, stdio: ['pipe','pipe','ignore'], windowsHide: true })
            let text = ''; child.stdout.on('data', bytes => { text += bytes })
            child.stdin.on('error', () => {}); child.stdin.end(probeFault === 'malformed' ? '{' : JSON.stringify(packet))
            child.once('error', reject); child.once('close', code => resolve({ exitCode: code, stdout: text, settled: true, truncated: false }))
          })
          if (probeFault === 'failure') result.exitCode = 125
          if (probeFault === 'truncated') result.truncated = true
          if (probeFault === 'unsettled') result.settled = false
          if (probeFault === 'oversized') result.stdout += ' '.repeat(8193)
          return result
        }
        if (['logs', 'exec'].includes(args[0])) { postAdmission.push(args[0]); exitCode = 125 }
        return { exitCode, stdout, settled: true, truncated: false }
      } })
    return { proof, launches, postAdmission, probeTargets }
  } finally { await rm(root, { recursive: true, force: true }) }
}
test('containment admission binds actual inspected owned network identity before any container launch', async () => {
  const { proof, launches } = await containmentAdmissionScenario({ networkPatch: { name: 'PRIVATE_FOREIGN', id: 'not-an-id' } })
  assert.equal(proof.qualified, false); assert.equal(proof.reason, 'containment'); assert.equal(launches.length, 0)
  assert.equal(proof.cleanupVerified, true)
  assert.equal(proof.containmentObservations[0].kind, 'network')
  assert.equal(proof.containmentObservations[0].ownedName, false)
  assert.equal(JSON.stringify(proof).includes('PRIVATE_FOREIGN'), false)
})
test('containment admission retains bounded actual cap failure projection without starting worker or leaking inspect fields', async () => {
  const { proof, postAdmission } = await containmentAdmissionScenario({ containerPatch: {
    EffectiveCaps: ['PRIVATE_CAPABILITY'], PRIVATE_METADATA: 'PRIVATE_DIAGNOSTIC',
    Config: { User: '65534:65534', Env: ['PRIVATE_CREDENTIAL'] } } })
  assert.equal(proof.qualified, false); assert.equal(proof.reason, 'containment')
  assert.equal(proof.cleanupVerified, true); assert.deepEqual(postAdmission, [])
  const row = proof.containmentObservations.find(row => row.kind === 'container')
  assert.equal(row.effectiveCapsCount, 1); assert.equal(row.boundingCapsCount, 0); assert.equal(row.verified, false)
  assert.equal(row.networkMode, 'owned-id')
  assert.equal(JSON.stringify(proof).includes('PRIVATE'), false)
})
test('containment admission accepts actual Podman JSON then retains verified projection without qualifying later failure', async () => {
  const { proof, launches, postAdmission } = await containmentAdmissionScenario()
  assert.equal(launches.length, 1); assert.deepEqual(postAdmission, ['probe', 'logs'])
  assert.equal(proof.qualified, false); assert.equal(proof.reason, 'command-failed'); assert.equal(proof.cleanupVerified, true)
  const row = proof.containmentObservations.find(row => row.kind === 'container')
  assert.equal(row.verified, true); assert.equal(row.networkMode, 'owned-id'); assert.equal(row.tmpfsSafe, true)
})

test('fresh runtime containment binds immutable ID even when inspection cap arrays are empty', async () => {
  const { proof, postAdmission, probeTargets } = await containmentAdmissionScenario()
  assert.deepEqual(postAdmission, ['probe', 'logs'])
  assert.deepEqual(probeTargets, ['c'.repeat(64)])
  assert.equal(proof.containmentObservations.find(row => row.kind === 'container').runtimeVerified, true)
})
test('fresh runtime containment accepts measured Podman bridge null caps and documented tmpfs defaults', async () => {
  const { proof, postAdmission, probeTargets } = await containmentAdmissionScenario({ observed: true })
  assert.deepEqual(postAdmission, ['probe', 'logs'])
  assert.deepEqual(probeTargets, ['c'.repeat(64)])
  const row = proof.containmentObservations.find(row => row.kind === 'container')
  assert.equal(row.verified, true); assert.equal(row.runtimeVerified, true); assert.equal(row.networkMode, 'owned-bridge')
  assert.equal(row.tmpfsUnknownOptions, 0)
  assert.equal(proof.qualified, false, 'controlled subsequent logs failure is never qualified')
})
const runtimeFailures = {
  'nonzero-effective': { capEff: '0000000000000001' },
  'nonzero-bounding': { capBnd: '0000000000000001' },
  'missing-cap': { capEff: null }, 'malformed-cap': { capEff: 0 },
  root: { uid: 0 }, privileges: { noNewPrivs: 0 }, 'root-writable': { rootWrite: 'written' },
  stale: { nonce: 'previous-proof' }, 'cross-container': { containerId: 'e'.repeat(64) },
  'unsafe-tmp': { tmp: { filesystem: 'tmpfs', flags: ['rw'], options: ['rw','size=16384k'], private: true } },
  'wrong-size': { tmp: { filesystem: 'tmpfs', flags: ['rw','nosuid','nodev','noexec'], options: ['rw','size=32768k'], private: true } },
  'shared-tmp': { tmp: { filesystem: 'tmpfs', flags: ['rw','nosuid','nodev','noexec'], options: ['rw','size=16384k'], private: false } },
  'shared-state': { state: { filesystem: 'ext4', flags: ['rw','nosuid','nodev'], private: false } },
}
for (const [name, runtimePatch] of Object.entries(runtimeFailures)) test('fresh runtime containment rejects ' + name + ' before protocol admission', async () => {
  const { proof, postAdmission } = await containmentAdmissionScenario({ runtimePatch })
  assert.equal(proof.reason, 'containment'); assert.equal(proof.qualified, false)
  assert.deepEqual(postAdmission, ['probe'])
  const row = proof.containmentObservations.find(row => row.kind === 'container')
  assert.equal(row.runtimeVerified, false); assert.equal(row.verified, false)
})
for (const probeFault of ['failure','truncated','malformed','oversized']) test('fresh runtime containment rejects ' + probeFault + ' probe receipt', async () => {
  const { proof, postAdmission } = await containmentAdmissionScenario({ probeFault })
  assert.equal(proof.reason, 'containment'); assert.deepEqual(postAdmission, ['probe'])
  assert.equal(proof.containmentObservations.find(row => row.kind === 'container').verified, false)
})
for (const when of [1,2]) test('fresh runtime containment rejects immutable inspect identity change at snapshot ' + when, async () => {
  const { proof, postAdmission } = await containmentAdmissionScenario({ inspectFault: count => count === when ? { Id: 'e'.repeat(64) } : {} })
  assert.equal(proof.reason, 'containment')
  assert.deepEqual(postAdmission, when === 1 ? [] : ['probe'])
})


for (const [name, containerPatch] of Object.entries({
  missingEffective: { EffectiveCaps: undefined }, missingBounding: { BoundingCaps: undefined },
  invalidEffective: { EffectiveCaps: 'null' }, nonemptyBounding: { BoundingCaps: ['CAP_CHOWN'] },
})) test('fresh runtime containment denies observed null-cap shape with ' + name + ' inspection', async () => {
  const { proof, postAdmission } = await containmentAdmissionScenario({ observed: true, containerPatch })
  assert.equal(proof.reason, 'containment'); assert.deepEqual(postAdmission, [])
  assert.equal(proof.containmentObservations.find(row => row.kind === 'container').verified, false)
})
test('fresh runtime containment rechecks actual protections after probe without accepting changed caps', async () => {
  const { proof, postAdmission } = await containmentAdmissionScenario({
    inspectFault: count => count === 2 ? { EffectiveCaps: ['CAP_CHOWN'] } : {},
  })
  assert.equal(proof.reason, 'containment'); assert.deepEqual(postAdmission, ['probe'])
  assert.equal(proof.containmentObservations.find(row => row.kind === 'container').verified, false)
})
test('fresh runtime containment cannot qualify or verify cleanup from an unsettled probe', async () => {
  const { proof, postAdmission } = await containmentAdmissionScenario({ probeFault: 'unsettled' })
  assert.deepEqual(postAdmission, ['probe']); assert.equal(proof.qualified, false)
  assert.equal(proof.reason, 'cleanup-unverified'); assert.equal(proof.cleanupVerified, false)
})
// Execute the same trusted probe function in a real process with only synthetic proc descriptors.
async function protectionProbeProcess(fault) {
  const script = "import{runtimeProtectionProbe}from" + JSON.stringify(new URL('./network-controller.mjs', import.meta.url).href) + ";" + String.raw`
let input='';for await(const bytes of process.stdin)input+=bytes;const fault=JSON.parse(input);
const status='CapEff:\t0000000000000000\nCapBnd:\t0000000000000000\nNoNewPrivs:\t1\n';
const tmp='1 0 0:1 / /tmp rw,nosuid,nodev,noexec,relatime - tmpfs tmpfs rw,size=16384k,uid=1000,gid=1000\n';
const state='2 0 0:2 / /state rw,nosuid,nodev,relatime - ext4 /dev/synthetic rw\n';
const files={'/proc/self/status':fault==='status-limit'?'x'.repeat(65537):status,
 '/proc/self/mountinfo':fault==='mount-limit'?'x'.repeat(262145):fault==='missing-mount'?tmp:tmp+state};
let totalRead=0,closed=0;const descriptors=new Map();
const fs={openSync(path){if(!Object.hasOwn(files,path))throw Error('unexpected-path');descriptors.set(path,{bytes:Buffer.from(files[path]),offset:0});return path},
 readSync(fd,out,start,length){const d=descriptors.get(fd),count=Math.min(length,7,d.bytes.length-d.offset);
 d.bytes.copy(out,start,d.offset,d.offset+count);d.offset+=count;totalRead+=count;return count},
 closeSync(){closed++},writeFileSync(path){if(path!=='/.brambo-containment-canary')throw Error('unexpected-path');throw Object.assign(Error(),{code:'EROFS'})},
 unlinkSync(){throw Error('unexpected-unlink')}};
try{const proof=runtimeProtectionProbe(fs,65534);console.log(JSON.stringify({ok:true,proof,totalRead,closed}))}
catch{console.log(JSON.stringify({ok:false,totalRead,closed}))}`
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module','-e',script], { env: {}, stdio: ['pipe','pipe','ignore'], windowsHide: true })
    let text = ''; child.stdout.on('data', bytes => { text += bytes })
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(fault))
    child.once('error', reject); child.once('close', code => { assert.equal(code, 0); resolve(JSON.parse(text)) })
  })
}
test('trusted runtime probe reads bounded partial proc records and two fixed private mounts', async () => {
  const result = await protectionProbeProcess(null)
  assert.equal(result.ok, true); assert.equal(result.closed, 2)
  assert.deepEqual(result.proof, { uid: 65534, capEff: '0000000000000000', capBnd: '0000000000000000',
    noNewPrivs: 1, rootWrite: 'EROFS', tmp: { filesystem: 'tmpfs', flags: ['rw','nosuid','nodev','noexec','relatime'],
      options: ['rw','size=16384k','uid=1000','gid=1000'], private: true },
    state: { filesystem: 'ext4', flags: ['rw','nosuid','nodev','relatime'], private: true } })
})
for (const [fault, maximum] of [['status-limit',65537],['mount-limit',262145+100],['missing-mount',1000]])
  test('trusted runtime probe fails closed and closes descriptors on ' + fault, async () => {
    const result = await protectionProbeProcess(fault)
    assert.equal(result.ok, false); assert.equal(result.totalRead <= maximum, true); assert.equal(result.closed >= 1, true)
  })

test('native controller refuses missing opt-in or ambient/unowned connection before mutation', () => {
  assert.throws(() => validateNativeScope({ optIn: false }), /native-scope/)
  assert.throws(() => validateNativeScope({ optIn: true, connection: 'default', profile: 'C:/Users/angua', image: 'node:latest' }), /native-scope/)
})
test('build failure settles exact owned resources without qualification or shared prune', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-')), receipts = [], resources = new Set()
  try {
    const result = await runContainerScenario({ optIn: true, repo, connection: 'brambo-q-6771c6f1',
      profile: 'C:/Users/angua/AppData/Local/Temp/brambo-podman-setup-6771c6f1',
      image: 'docker.io/library/node@sha256:' + 'a'.repeat(64), root,
      run: async args => {
        receipts.push(args)
        const key = args[0] + ':' + args.at(-1)
        if (args[1] === 'create') resources.add(key)
        if (args[1] === 'rm') resources.delete(key)
        return { exitCode: args[0] === 'build' || args[1] === 'exists' && !resources.has(key) ? 1 : 0,
          stdout: args[0] === 'network' && args[1] === 'inspect' ? JSON.stringify([{ name: args.at(-1), id: 'd'.repeat(64), internal: true }]) : '', settled: true, truncated: false }
      } })
    assert.equal(result.qualified, false)
    assert.equal(result.reason, 'build-failed')
    assert.equal(result.cleanupVerified, true)
    assert.equal(receipts.some(args => args[0] === 'volume' && args[1] === 'rm'), true)
    assert.equal(receipts.some(args => args[0] === 'network' && args[1] === 'rm'), true)
    assert.equal(receipts.some(args => args.includes('prune')), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('a still-present owned resource cannot be reported as verified cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-'))
  let mutation = false
  try {
    const proof = await runContainerScenario({ optIn: true, repo, connection: 'brambo-q-6771c6f1',
      profile: 'C:/Users/angua/AppData/Local/Temp/brambo-podman-setup-6771c6f1',
      image: 'docker.io/library/node@sha256:' + 'a'.repeat(64), root,
      run: async args => {
        if (args[0] === 'network' && args[1] === 'create') mutation = true
        return { exitCode: args[0] === 'build' || args[1] === 'exists' && !mutation ? 1 : 0,
          stdout: args[0] === 'network' && args[1] === 'inspect' ? JSON.stringify([{ name: args.at(-1), id: 'd'.repeat(64), internal: true }]) : '', settled: true, truncated: false }
      } })
    assert.equal(proof.cleanupVerified, false)
    assert.equal(proof.reason, 'cleanup-unverified')
    assert.equal(proof.qualified, false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('native container command enforces containment without published ports, ambient env or pull', () => {
  const args = containerArguments({ name: 'brambo-network-a', network: 'brambo-network-net', volume: 'brambo-network-state',
    image: 'sha256:' + 'a'.repeat(64), role: '--worker', args: ['http://coordinator:8080/v1/workflow', 'worker-a', 'checkpoint'] })
  for (const flag of ['--pull=never', '--user=65534:65534', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=64', '--memory=256m', '--cpus=1']) assert.equal(args.includes(flag), true, flag)
  assert.equal(args.includes('--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m'), true)
  assert.equal(args.includes('brambo-network-state:/state:rw,rprivate'), true)
  assert.equal(args.some(arg => /^--(?:publish|privileged|env|env-file|network=host)|^-[pe]$/.test(arg)), false)
  assert.throws(() => containerArguments({ name: 'unowned', image: 'node:latest' }), /container-input/)
})
test('curated transfer rejects third-party executable imports before writing a package payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-'))
  try {
    for (const name of ['contracts', 'delegation', 'orchestration', 'runtime-local', 'workspace-artifacts-local',
      'workflow-store-sqlite', 'workflow-remote', 'workflow-coordinator']) {
      const base = join(root, 'repo/packages', name)
      await mkdir(join(base, 'dist'), { recursive: true })
      await writeFile(join(base, 'package.json'), JSON.stringify({ name: '@brambodev/' + name, version: '0.4.0', type: 'module',
        exports: { '.': { default: './dist/index.js' } }, dependencies: {} }))
      await writeFile(join(base, 'dist/index.js'), "import 'unapproved-third-party'\n")
    }
    await mkdir(join(root, 'repo/scripts/qualification'), { recursive: true })
    await writeFile(join(root, 'repo/scripts/qualification/network.mjs'), '')
    await assert.rejects(prepareBundle(join(root, 'repo'), join(root, 'payload')), /bundle-import/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
function launch(file, args) {
  const child = fork(file, args, { execArgv: [], env: {}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true })
  child.stdout.resume(); child.stderr.resume()
  const packets = []; child.on('message', packet => packets.push(packet))
  return { child, async receive() {
    const end = performance.now() + 20000
    while (performance.now() < end) {
      if (packets.length) return packets.shift()
      if (child.exitCode !== null || child.signalCode !== null) throw Error('process-exit')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw Error('packet-deadline')
  } }
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(resolve => child.once('exit', resolve))
  child.kill('SIGKILL'); await exited
}
test('coordinator native role honors explicit listener port for internal-network transport', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-')), reserve = createServer()
  let child
  try {
    await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
    const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve))
    await prepareBundle(repo, join(root, 'bundle'))
    const coordinator = launch(join(root, 'bundle/network.mjs'), ['--coordinator', join(root, 'authority'), '127.0.0.1', String(port)])
    child = coordinator.child
    assert.equal((await coordinator.receive()).endpoint, 'http://127.0.0.1:' + port + '/v1/workflow')
  } finally { if (child) await stop(child); await rm(root, { recursive: true, force: true }) }
})
async function fixture(mode, operation, wait = false) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-')), children = []
  try {
    await prepareBundle(repo, join(root, 'bundle'))
    const file = join(root, 'bundle/network.mjs'), authority = launch(file, ['--coordinator', join(root, 'authority')])
    children.push(authority.child)
    const ready = await authority.receive()
    assert.equal(ready.type, 'ready')
    const { remote: { createRemoteRunStore } } = await loadPublicPorts(join(root, 'bundle'))
    const client = createRemoteRunStore({ endpoint: ready.endpoint, fetch,
      authorizeRequest: async () => ({ authorization: 'synthetic-alice' }) })
    const key = { namespace: 'tenant', runId: 'run' }
    await client.create({ schemaVersion: 1, key, revision: 0, workflowId: 'network-flow', workflowVersion: '1',
      sessionId: 'session', status: 'pending', workspace: ready.workspace, tasks: [], context: null, cancelRequested: false },
    { key, clientId: 'a', idempotencyKey: 'start', kind: 'start', payload: null }, { namespace: 'tenant', subject: 'alice' })
    const first = launch(file, ['--worker', join(root, 'worker-a'), ready.endpoint, 'worker-a', mode, ...(wait ? ['--wait'] : [])]); children.push(first.child)
    await operation({ first, client, key, file, ready, root, children })
    await client.close()
  } finally { for (const child of children.reverse()) await stop(child); await rm(root, { recursive: true, force: true }) }
}
// A missing prepare-task checkpoint admits b and fails this at the actual worker boundary.
test('checkpoint reports completed a before b admission at the public worker seam', { timeout: 30000 }, async () => {
  await fixture('checkpoint', async ({ first, client, key }) => {
    const packet = await first.receive()
    assert.equal(packet.type, 'checkpoint')
    assert.deepEqual(packet.calls, { a: 1, b: 0 })
    const snapshot = await client.get(key)
    assert.deepEqual(snapshot.tasks.map(task => [task.taskId, task.phase, task.attempt]), [['a', 'succeeded', 1], ['b', 'pending', 0]])
  })
})
test('native worker admission waits for containment gate before any dispatch', { timeout: 30000 }, async () => {
  await fixture('run', async ({ first, root, client, key }) => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    assert.equal((await client.get(key)).status, 'pending')
    await mkdir(join(root, 'worker-a'), { recursive: true })
    await writeFile(join(root, 'worker-a/start'), 'trusted-start')
    const packet = await first.receive()
    assert.deepEqual(packet.calls, { a: 1, b: 1 })
    assert.equal((await client.get(key)).status, 'succeeded')
  }, true)
})
test('HTTP bridge preserves actual public-client Headers authentication without reading ambient credentials', { timeout: 30000 }, async () => {
  await fixture('revoked', async ({ key, ready, root }) => {
    const ports = await loadPublicPorts(join(root, 'bundle'))
    const bridged = ports.remote.createRemoteRunStore({ endpoint: ready.endpoint,
      authorizeRequest: async () => ({ authorization: 'synthetic-alice' }),
      fetch: (url, init) => {
        const packet = JSON.parse(bridgeRequest(url, init))
        return fetch(packet.url, { method: packet.method, body: packet.body,
          headers: { 'content-type': 'application/json', authorization: packet.authorization } })
      } })
    assert.deepEqual((await bridged.get(key))?.key, { namespace: 'tenant', runId: 'run' })
    await bridged.close()
  })
})
test('non-IPC native worker preserves exact safe result packets for container transport', { timeout: 30000 }, async () => {
  await fixture('revoked', async ({ first, file, ready, root, children }) => {
    await first.receive()
    const child = spawn(process.execPath, [file, '--worker', join(root, 'worker-b'), ready.endpoint, 'worker-b', 'run'],
      { execArgv: [], env: {}, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    children.push(child); child.stderr.resume()
    let text = ''; child.stdout.on('data', bytes => { text += bytes })
    await new Promise(resolve => child.once('exit', resolve))
    assert.equal(child.exitCode, 0)
    assert.deepEqual(text.trim() ? JSON.parse(text) : null, { type: 'done', calls: { a: 0, b: 0 } })
  })
})
// Omitting handoff, exact stale probes or duplicate accounting prevents qualification.
async function scenario(variant = 'valid', alter = packet => packet, faults = {}) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-')), children = []
  try {
    await prepareBundle(repo, join(root, 'bundle'))
    const file = join(root, 'bundle/network.mjs'), coordinator = launch(file, ['--coordinator', join(root, 'authority')])
    children.push(coordinator.child)
    const authority = await coordinator.receive(), actualPorts = await loadPublicPorts(join(root, 'bundle'))
    const ports = faults.ports ? faults.ports(actualPorts) : actualPorts
    let publishRequests = 0, publicationObservation
    const proof = await runNetworkScenario({ ports, authority, variant, transport: async (input, init) => {
      const operation = JSON.parse(init.body).operation
      if (operation === 'artifact.publish') publishRequests++
      const response = await fetch(input, init)
      if (operation === 'artifact.publish') {
        const value = await response.clone().json()
        publicationObservation = { httpStatus: response.status, versionOne: value.version === 1,
          deniedStatus: value.status === 'denied', deniedCode: value.code === 'denied',
          exactKeys: Object.keys(value).sort().join(',') === 'code,status,version',
          sameEndpoint: input === authority.endpoint, authenticated: new Headers(init.headers).get('authorization') === 'synthetic-worker-a' }
      }
      return faults.response ? faults.response(operation, response, init) : response
    },
      startWorker: async (subject, mode) => {
        const worker = launch(file, ['--worker', join(root, subject), authority.endpoint, subject, mode])
        children.push(worker.child); return { ...worker, receive: async () => alter(await worker.receive(), subject) }
      }, killWorker: async worker => { await stop(worker.child); return true } })
    return { proof, publishRequests, publicationObservation }
  } finally { for (const child of children.reverse()) await stop(child); await rm(root, { recursive: true, force: true }) }
}
test('killed checkpoint owner hands off once with stale state/artifact refusal and digest identity', { timeout: 30000 }, async () => {
    const { proof, publishRequests, publicationObservation } = await scenario()
    assert.equal(proof.qualified, true, JSON.stringify({ proof, publicationObservation }))
    assert.deepEqual(publicationObservation, { httpStatus: 404, versionOne: true, deniedStatus: true,
      deniedCode: true, exactKeys: true, sameEndpoint: true, authenticated: true })
    assert.equal(proof.status, 'succeeded')
    assert.equal(proof.contention, 'contended')
    assert.equal(proof.staleCommit, 'stale-lease')
    assert.equal(proof.stalePublish, 'denied')
    assert.equal(publishRequests, 1, 'stale artifact rejection must reach the coordinator, not fail local lease scope')
    assert.equal(proof.completedUnchanged, true)
    assert.equal(proof.artifactIdentity, true)
    assert.deepEqual(proof.counts, { a: 1, b: 1 })
})
test('fractional IPC counts cannot counterfeit exact-once completion', { timeout: 30000 }, async () => {
  const { proof } = await scenario('valid', packet => ({ ...packet, calls: { ...packet.calls, a: 0.5 } }))
  assert.equal(proof.status, 'succeeded')
  assert.equal(proof.qualified, false)
  assert.equal(proof.counts.a, null)
  assert.equal(proof.counterFailure, 'counter-invalid')
})
test('revocation after completed checkpoint prevents all replacement dispatch', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked')
  assert.equal(proof.qualified, true, JSON.stringify(proof))
  assert.equal(proof.completedUnchanged, true)
  assert.deepEqual(proof.counts, { a: 1, b: 0 })
  assert.notEqual(proof.status, 'succeeded')
})
test('counter projection rejects missing, duplicate, overflow, string and accessor values without invoking accessors', () => {
  for (const value of [undefined, 2, Number.MAX_SAFE_INTEGER, '1', -1, 0.5]) {
    assert.equal(combineCounts({ a: value, b: 0 }, { a: 0, b: 1 }).a, null)
  }
  let touched = false
  const hostile = { get a() { touched = true; throw Error('private') }, b: 0 }
  assert.equal(combineCounts(hostile, { a: 0, b: 1 }).a, null)
  assert.equal(touched, false)
  assert.deepEqual(combineCounts(new Proxy({}, { getOwnPropertyDescriptor() { throw Error('private') } }), {}), { a: null, b: null })
  assert.equal(combineCounts({ a: 1, b: 0 }, { a: 1, b: 1 }).a, 2, 'duplicates remain visible, never clamped')
})
// Authorizing a revoked disclosure dispatches real synthetic work and fails this proof.
test('revoked reconstruction has zero driver dispatch through public runtime', { timeout: 30000 }, async () => {
  await fixture('revoked', async ({ first, client, key }) => {
    const packet = await first.receive()
    assert.equal(packet.type, 'done')
    assert.deepEqual(packet.calls, { a: 0, b: 0 })
    assert.notEqual((await client.get(key)).status, 'succeeded')
  })
})

const denialFaults = {
  network: () => { throw Error('synthetic-network') },
  unavailable: () => new Response(JSON.stringify({ version: 1, status: 'unavailable', code: 'unavailable' }), { status: 503 }),
  'malformed-success': () => new Response('{}', { status: 200 }),
  'malformed-denial': () => new Response(JSON.stringify({ status: 'denied' }), { status: 404 }),
  'oversized-denial': () => new Response(' '.repeat(4097) + JSON.stringify({ version: 1, status: 'denied', code: 'denied' }), { status: 404 }),
}
for (const [name, fault] of Object.entries(denialFaults)) {
  test('stale publication proof rejects ' + name + ' instead of claiming coordinator denial', { timeout: 30000 }, async () => {
    const { proof, publishRequests, publicationObservation } = await scenario('valid', packet => packet, {
      response: (operation, response) => {
        if (operation !== 'artifact.publish') return response
        return fault()
      },
    })
    assert.equal(proof.status, 'succeeded')
    assert.equal(publishRequests, 1)
    assert.deepEqual(publicationObservation, { httpStatus: 404, versionOne: true, deniedStatus: true,
      deniedCode: true, exactKeys: true, sameEndpoint: true, authenticated: true })
    assert.equal(proof.qualified, false)
    assert.notEqual(proof.stalePublish, 'denied')
  })
}
test('revoked auxiliary safety requires an observed stale publication denial', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked', packet => packet, {
    response: (operation, response) => operation === 'artifact.publish' ? denialFaults.unavailable() : response,
  })
  assert.deepEqual(proof.counts, { a: 1, b: 0 })
  assert.equal(proof.qualified, false)
})
test('revoked auxiliary safety requires stale-lease rather than a revision conflict', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked', packet => packet, {
    response: (operation, response) => operation === 'commit' ?
      new Response(JSON.stringify({ version: 1, status: 'ok', payload: { status: 'conflict' } }), { status: 200 }) : response,
  })
  assert.equal(proof.staleCommit, 'conflict')
  assert.equal(proof.qualified, false)
})
test('revoked auxiliary safety requires exact immutable artifact identity', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked', packet => packet, {
    ports: actual => ({ remote: { ...actual.remote, createRemoteArtifactProvider: options => {
      const provider = actual.remote.createRemoteArtifactProvider(options)
      return { ...provider, read: async (...args) => {
        await provider.read(...args)
        return Buffer.from('synthetic-corrupt\n')
      } }
    } } }),
  })
  assert.equal(proof.artifactIdentity, false)
  assert.equal(proof.qualified, false)
})

test('application publication policy permits valid lease and denies expired lease before backend entry', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-'))
  let authority, client
  try {
    await prepareBundle(repo, join(root, 'bundle'))
    const { startAuthority } = await import(pathToFileURL(join(root, 'bundle/network.mjs')).href)
    authority = await startAuthority(join(root, 'authority'))
    const ports = await loadPublicPorts(join(root, 'bundle'))
    let publicationResponse
    const options = { endpoint: authority.endpoint, authorizeRequest: async () => ({ authorization: 'synthetic-worker-a' }),
      fetch: async (input, init) => {
        const response = await fetch(input, init)
        if (JSON.parse(init.body).operation === 'artifact.publish') {
          const body = await response.clone().json()
          publicationResponse = { httpStatus: response.status, version: body.version, status: body.status, code: body.code ?? null }
        }
        return response
      } }
    client = ports.remote.createRemoteRunStore(options)
    const artifacts = ports.remote.createRemoteArtifactProvider(options)
    const result = await client.claim('tenant', ['workspace:parent'], 'worker-a', 3000)
    assert.equal(result.status, 'acquired')
    const manifest = await artifacts.manifest(authority.workspace)
    await artifacts.publish(authority.workspace, manifest, result.lease)
    assert.equal(publicationResponse.httpStatus, 200)
    assert.equal(authority.publicationAttempts(), 1)
    await new Promise(resolve => setTimeout(resolve, Math.max(0, result.lease.expiresAt - Date.now()) + 50))
    assert.equal(await client.valid(result.lease), false)
    await assert.rejects(artifacts.publish(authority.workspace, manifest, result.lease))
    assert.deepEqual(publicationResponse, { httpStatus: 404, version: 1, status: 'denied', code: 'denied' })
    assert.equal(authority.publicationAttempts(), 1, 'denied stale publication never enters backend')
  } finally {
    await client?.close()
    await authority?.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('qualification diagnostics retains revoked completed counters when actual public transport fails', { timeout: 30000 }, async () => {
  let reads = 0
  const outcome = await scenario('revoked', packet => packet, { response: (operation, response) => {
    if (operation === 'get' && ++reads === 2) throw Error('PRIVATE_SYNTHETIC_TRANSPORT')
    return response
  } }).catch(() => ({ rejected: true }))
  assert.equal(outcome.rejected, undefined, 'failure must return bounded observed progress, not discard it by throwing')
  const { proof } = outcome
  assert.equal(proof.qualified, false); assert.equal(proof.failedPhase, 'result-read')
  assert.equal(proof.failure.kind, 'transport'); assert.equal(proof.failure.label, 'Remote workflow unavailable')
  assert.deepEqual(proof.counts, { a: 1, b: 0 }); assert.equal(proof.status, 'running')
  assert.equal(proof.statusObservedPhase, 'checkpoint-read')
  assert.deepEqual(proof.rootTasks, [{ taskId: 'a', phase: 'succeeded', attempt: 1 }, { taskId: 'b', phase: 'pending', attempt: 0 }])
  assert.equal(proof.checkpoint, true); assert.equal(proof.staleCommit, null); assert.equal(proof.artifactIdentity, null)
  assert.equal(JSON.stringify(proof).includes('PRIVATE'), false)
})
test('qualification diagnostics distinguishes a typed permission denial at actual public response boundary', { timeout: 30000 }, async () => {
  let reads = 0
  const outcome = await scenario('revoked', packet => packet, { response: (operation, response) =>
    operation === 'get' && ++reads === 2 ?
      new Response(JSON.stringify({ version: 1, status: 'denied', code: 'denied' }), { status: 404 }) : response,
  }).catch(() => ({ rejected: true }))
  assert.equal(outcome.rejected, undefined)
  assert.equal(outcome.proof.qualified, false); assert.equal(outcome.proof.failedPhase, 'result-read')
  assert.equal(outcome.proof.failure.kind, 'permission'); assert.equal(outcome.proof.lastExchange.typedDenied, true)
  assert.deepEqual(outcome.proof.counts, { a: 1, b: 0 })
})
test('qualification diagnostics retains checkpoint assertion phase without fabricated counters or exception prose', { timeout: 30000 }, async () => {
  const outcome = await scenario('valid', packet => packet.type === 'checkpoint' ? { ...packet, type: 'PRIVATE_BAD_PACKET' } : packet)
    .catch(() => ({ rejected: true }))
  assert.equal(outcome.rejected, undefined)
  assert.equal(outcome.proof.qualified, false); assert.equal(outcome.proof.failedPhase, 'checkpoint-receive')
  assert.equal(outcome.proof.failure.kind, 'assertion'); assert.equal(outcome.proof.failure.label, 'checkpoint')
  assert.deepEqual(outcome.proof.counts, { a: null, b: null }); assert.equal(outcome.proof.status, null)
  assert.equal(JSON.stringify(outcome.proof).includes('PRIVATE'), false)
})
test('qualification diagnostics does not reinterpret expected reconstruction denial as transport failure', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked')
  assert.equal(proof.qualified, true); assert.deepEqual(proof.counts, { a: 1, b: 0 })
  assert.equal(proof.failedPhase, null); assert.equal(proof.failure, null)
})
test('qualification diagnostics native catch retains ready phase and safe command failure', async () => {
  const { proof } = await containmentAdmissionScenario()
  assert.equal(proof.qualified, false); assert.equal(proof.failedPhase, 'coordinator-ready')
  assert.equal(proof.failure.kind, 'command'); assert.equal(proof.failure.label, 'command-failed')
  assert.deepEqual(proof.counts, { a: null, b: null })
})
test('qualification diagnostics native worker emits bounded failure packet without IPC or raw errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brambo-network-'))
  try {
    await prepareBundle(repo, join(root, 'bundle'))
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(root,'bundle/network.mjs'),'--worker',join(root,'worker'),'not-an-endpoint','worker-b','revoked'],
        { env: {}, stdio: ['ignore','pipe','pipe'], windowsHide: true })
      let stdout='',stderr='';child.stdout.on('data',bytes=>{stdout+=bytes});child.stderr.on('data',bytes=>{stderr+=bytes})
      child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}))
    })
    assert.equal(result.code,1); assert.equal(result.stderr,'')
    const packet = result.stdout.trim() ? JSON.parse(result.stdout) : null
    assert.notEqual(packet,null,'native failure cannot disappear merely because no IPC channel exists')
    assert.equal(packet.type,'failed');assert.equal(packet.failedPhase,'worker-setup')
    assert.equal(packet.failure.kind,'configuration');assert.equal(packet.failure.label,'Invalid remote endpoint')
    assert.deepEqual(packet.calls,{a:null,b:null})
    assert.equal(result.stdout.includes(root),false)
  } finally { await rm(root,{recursive:true,force:true}) }
})

test('qualification diagnostics projects only own fixed labels/codes without accessors, proxy prose or paths', async () => {
  const { projectQualificationFailure } = await import('./network.mjs')
  let accessors = 0
  const hostile = Object.defineProperty({}, 'message', { get() { accessors++; throw Error('PRIVATE_GETTER') } })
  assert.deepEqual(projectQualificationFailure(hostile), { kind: 'unknown', code: null, name: null, label: null })
  assert.equal(accessors, 0)
  for (const error of [{ message: 'PRIVATE: C:/synthetic/private', code: 'PRIVATE_CODE' },
    { message: 'x'.repeat(129) }, new Proxy({}, { getOwnPropertyDescriptor() { throw Error('PRIVATE_PROXY') } })]) {
    assert.deepEqual(projectQualificationFailure(error), { kind: 'unknown', code: null, name: null, label: null })
  }
  assert.deepEqual(projectQualificationFailure({ code: 'ECONNRESET', message: 'PRIVATE_NETWORK_BODY' }),
    { kind: 'transport', code: 'ECONNRESET', name: null, label: null })
  assert.equal(projectQualificationFailure({ code: 'BRAMBO_CONTRACT_LEASE_SCOPE_INVALID', message: 'PRIVATE_LEASE_TOKEN' }).kind, 'permission')
  assert.equal(projectQualificationFailure({ message: 'Invalid remote workflow response' }).kind, 'protocol')
})
test('qualification diagnostics retains bounded native worker failure packet and rejects hostile extra text', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked', packet => packet.type === 'done' ? { type: 'failed', failedPhase: 'worker-run',
    failure: { kind: 'unknown', label: 'Remote workflow unavailable', code: null, name: null, message: 'PRIVATE_PROSE' },
    calls: { a: 0, b: 0 }, private: 'PRIVATE_METADATA' } : packet)
  assert.equal(proof.qualified, false); assert.equal(proof.failedPhase, 'replacement-receive')
  assert.equal(proof.workerFailure.failedPhase, 'worker-run'); assert.equal(proof.workerFailure.failure.label, 'Remote workflow unavailable')
  assert.deepEqual(proof.workerFailure.calls, { a: 0, b: 0 })
  assert.deepEqual(proof.counts, { a: null, b: null })
  assert.equal(JSON.stringify(proof).includes('PRIVATE'), false)
})


// This catches logs/state snapshot races without launching Podman or a provider.
async function stoppedReceiveFixture(finalText, state = { Running: false, ExitCode: 0, Status: 'exited', OOMKilled: false }) {
  const commands = []
  const command = async args => {
    commands.push(args)
    const text = args[0] === 'inspect' ? JSON.stringify(state) : commands.length === 1 ? '' : finalText
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e',
        "let text='';for await(const bytes of process.stdin)text+=bytes;process.stdout.write(text)"],
      { env: {}, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
      let stdout = ''; child.stdout.on('data', bytes => { stdout += bytes })
      child.stdin.on('error', () => {}); child.stdin.end(text)
      child.once('error', reject); child.once('close', code => code === 0 ? resolve(stdout) : reject(Error('fixture-command')))
    })
  }
  let packet, error
  try { packet = await receiveContainer(command, 'c'.repeat(64), performance.now() + 10000) }
  catch (caught) { error = caught }
  return { commands: commands.map(args => args[0]), packet, error }
}
test('stopped receive processes one final done packet after the preceding empty logs snapshot', async () => {
  const outcome = await stoppedReceiveFixture(JSON.stringify({ type: 'done', calls: { a: 0, b: 0 } }) + '\n')
  assert.equal(outcome.error, undefined)
  assert.deepEqual(outcome.commands, ['logs', 'inspect', 'logs'])
  assert.equal(outcome.packet.type, 'done')
  assert.deepEqual(outcome.packet.calls, { a: 0, b: 0 })
  assert.deepEqual(outcome.packet.containerExit, { exitCode: 0, status: 'exited', oomKilled: false, packetPresent: true })
})
test('stopped receive final packet preserves genuine public revoked reconstruction qualification', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked', async packet => {
    if (packet.type !== 'done') return packet
    const outcome = await stoppedReceiveFixture(JSON.stringify(packet))
    if (outcome.error) throw outcome.error
    return outcome.packet
  })
  assert.equal(proof.qualified, true)
  assert.deepEqual(proof.counts, { a: 1, b: 0 })
  assert.deepEqual(proof.containerExit, { exitCode: 0, status: 'exited', oomKilled: false, packetPresent: true })
  assert.equal(proof.failedPhase, null)
})
test('stopped receive final failed packet reaches existing safe public worker failure processing', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked', async packet => {
    if (packet.type !== 'done') return packet
    const outcome = await stoppedReceiveFixture(JSON.stringify({ type: 'failed', failedPhase: 'worker-run',
      failure: { kind: 'permission', code: 'BRAMBO_CONTRACT_LEASE_SCOPE_INVALID', label: null, name: null },
      calls: { a: 0, b: 0 }, message: 'PRIVATE_SYNTHETIC_BODY' }),
    { Running: false, ExitCode: 1, Status: 'exited', OOMKilled: false })
    if (outcome.error) throw outcome.error
    return outcome.packet
  })
  assert.equal(proof.qualified, false); assert.equal(proof.failedPhase, 'replacement-receive')
  assert.equal(proof.workerFailure.failure.kind, 'permission')
  assert.deepEqual(proof.containerExit, { exitCode: 1, status: 'exited', oomKilled: false, packetPresent: true })
  assert.equal(JSON.stringify(proof).includes('PRIVATE'), false)
})
test('stopped receive with no final packet retains actual container exit distinct from successful native command', async () => {
  const outcome = await stoppedReceiveFixture('', { Running: false, ExitCode: 137, Status: 'stopped', OOMKilled: true,
    Error: 'PRIVATE_NATIVE_MESSAGE' })
  assert.deepEqual(outcome.commands, ['logs', 'inspect', 'logs'])
  assert.equal(outcome.error.message, 'worker-exit')
  assert.deepEqual(outcome.error.containerExit, { exitCode: 137, status: 'stopped', oomKilled: true, packetPresent: false })
  assert.equal(JSON.stringify(outcome.error).includes('PRIVATE'), false)
})
test('stopped receive rejects malformed, missing, multiple, unknown and oversized final packets without raw logs', async () => {
  for (const text of ['{PRIVATE', 'null', '[]', '{}', '{"type":"done"}', '{"type":"PRIVATE"}',
    '{"type":"done"}\n{"type":"done"}', ' '.repeat(1048577)]) {
    const outcome = await stoppedReceiveFixture(text)
    assert.equal(outcome.error?.message, 'packet-invalid')
    assert.deepEqual(outcome.commands, ['logs', 'inspect', 'logs'])
    assert.deepEqual(outcome.error.containerExit, { exitCode: 0, status: 'exited', oomKilled: false, packetPresent: text.trim().length > 0 })
    assert.equal(JSON.stringify(outcome.error).includes('PRIVATE'), false)
  }
})
test('stopped receive native exit projection rejects nonprimitive, missing and out-of-range values', async () => {
  for (const ExitCode of [undefined, '137', -1, 256, 0.5, { private: 'PRIVATE' }]) {
    const outcome = await stoppedReceiveFixture('', { Running: false, ExitCode, Status: 'PRIVATE', OOMKilled: 'true' })
    assert.equal(outcome.error?.message, 'worker-exit')
    assert.deepEqual(outcome.error.containerExit, { exitCode: null, status: null, oomKilled: null, packetPresent: false })
    assert.equal(JSON.stringify(outcome.error).includes('PRIVATE'), false)
  }
})
test('stopped receive rejects unknown or oversized native state rather than pretending it is stopped', async () => {
  for (const state of [{}, { Running: 'false' }, [], null,
    { Running: false, private: 'x'.repeat(8193) }]) {
    const outcome = await stoppedReceiveFixture('', state)
    assert.equal(outcome.error?.message, 'packet-invalid')
    assert.deepEqual(outcome.commands, ['logs', 'inspect'])
  }
})
test('stopped receive missing final packet preserves replacement phase and last checkpoint progress', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked', async packet => {
    if (packet.type !== 'done') return packet
    const outcome = await stoppedReceiveFixture('', { Running: false, ExitCode: 2, Status: 'exited', OOMKilled: false })
    throw outcome.error
  })
  assert.equal(proof.qualified, false); assert.equal(proof.failedPhase, 'replacement-receive')
  assert.equal(proof.failure.kind, 'worker-exit')
  assert.deepEqual(proof.containerExit, { exitCode: 2, status: 'exited', oomKilled: false, packetPresent: false })
  assert.deepEqual(proof.counts, { a: null, b: null }); assert.equal(proof.checkpoint, true)
  assert.deepEqual(proof.rootTasks, [{ taskId: 'a', phase: 'succeeded', attempt: 1 }, { taskId: 'b', phase: 'pending', attempt: 0 }])
})

test('stopped receive never mutates hostile native command errors while preserving known stopped evidence', async () => {
  let commands = 0, touched = 0, error
  const hostile = new Proxy({}, { set() { touched++; throw Error('PRIVATE_MUTATION') },
    getOwnPropertyDescriptor() { throw Error('PRIVATE_DESCRIPTOR') } })
  try {
    await receiveContainer(async () => {
      commands++
      if (commands === 1) return ''
      if (commands === 2) return JSON.stringify({ Running: false, ExitCode: 1, Status: 'exited', OOMKilled: false })
      throw hostile
    }, 'c'.repeat(64), performance.now() + 10000)
  } catch (caught) { error = caught }
  assert.equal(touched, 0)
  assert.equal(commands, 3)
  assert.deepEqual(error.containerExit, { exitCode: 1, status: 'exited', oomKilled: false, packetPresent: null })
  assert.equal(JSON.stringify(error).includes('PRIVATE'), false)
})
test('stopped receive phase preservation does not inspect hostile error exit accessors', { timeout: 30000 }, async () => {
  let touched = 0
  const { proof, rejected } = await scenario('revoked', packet => {
    if (packet.type !== 'done') return packet
    throw Object.defineProperty({}, 'containerExit', { get() { touched++; throw Error('PRIVATE_EXIT_GETTER') } })
  }).catch(() => ({ rejected: true }))
  assert.equal(rejected, undefined)
  assert.equal(touched, 0)
  assert.equal(proof.qualified, false)
  assert.equal(proof.failedPhase, 'replacement-receive')
  assert.deepEqual(proof.counts, { a: null, b: null })
  assert.equal(JSON.stringify(proof).includes('PRIVATE'), false)
})

test('stopped receive never trusts packet-authored container exit diagnostics instead of native inspection', async () => {
  let commands = 0
  const packet = await receiveContainer(async () => {
    commands++
    return JSON.stringify({ type: 'done', calls: { a: 0, b: 0 },
      containerExit: { exitCode: 137, status: 'stopped', oomKilled: true, packetPresent: true } })
  }, 'c'.repeat(64), performance.now() + 10000)
  assert.equal(commands, 1)
  assert.equal(Object.hasOwn(packet, 'containerExit'), false)
})

for (const [label, ExitCode, OOMKilled] of [['oom-exit137', 137, true], ['failed-exit1', 1, false], ['oom-exit0', 0, true]]) {
  test('completion exit rejects done packet contradicting actual native ' + label, async () => {
    const { error, packet, commands } = await stoppedReceiveFixture(JSON.stringify({ type: 'done', calls: { a: 0, b: 0 } }),
      { Running: false, ExitCode, Status: 'exited', OOMKilled })
    assert.equal(packet, undefined)
    assert.equal(error?.message, 'worker-exit')
    assert.deepEqual(commands, ['logs', 'inspect', 'logs'])
    assert.deepEqual(error.containerExit, { exitCode: ExitCode, status: 'exited', oomKilled: OOMKilled, packetPresent: true })
  })
}
test('completion exit rejects unknown or missing native completion status without accepting done', async () => {
  for (const state of [
    { Running: false, Status: 'exited', OOMKilled: false },
    { Running: false, ExitCode: 0, Status: 'exited' },
    { Running: false, ExitCode: 0, OOMKilled: false },
    { Running: false, ExitCode: 0, Status: 'PRIVATE_STATUS', OOMKilled: false },
    { Running: false, ExitCode: 0, Status: 'running', OOMKilled: false },
  ]) {
    const { error, packet } = await stoppedReceiveFixture(JSON.stringify({ type: 'done', calls: { a: 0, b: 0 } }), state)
    assert.equal(packet, undefined); assert.equal(error?.message, 'worker-exit')
    assert.equal(error.containerExit.packetPresent, true)
    assert.equal(JSON.stringify(error).includes('PRIVATE'), false)
  }
})
test('completion exit preserves primary failed worker packet even when actual native exit reports OOM', { timeout: 30000 }, async () => {
  const { proof } = await scenario('revoked', async packet => {
    if (packet.type !== 'done') return packet
    const final = await stoppedReceiveFixture(JSON.stringify({ type: 'failed', failedPhase: 'worker-run',
      failure: { kind: 'permission', code: 'BRAMBO_CONTRACT_LEASE_SCOPE_INVALID', label: null, name: null },
      calls: { a: 0, b: 0 } }), { Running: false, ExitCode: 137, Status: 'exited', OOMKilled: true })
    if (final.error) throw final.error
    return final.packet
  })
  assert.equal(proof.qualified, false); assert.equal(proof.failedPhase, 'replacement-receive')
  assert.equal(proof.failure.label, 'worker-outcome')
  assert.equal(proof.workerFailure.failure.kind, 'permission')
  assert.equal(proof.workerFailure.failure.code, 'BRAMBO_CONTRACT_LEASE_SCOPE_INVALID')
  assert.deepEqual(proof.containerExit, { exitCode: 137, status: 'exited', oomKilled: true, packetPresent: true })
})
for (const [label, exitCode, oomKilled] of [['oom-exit137', 137, true], ['failed-exit1', 1, false]]) {
  test('completion exit cannot qualify contradictory inspected ' + label + ' through direct public scenario packet', { timeout: 30000 }, async () => {
    const { proof } = await scenario('revoked', packet => packet.type === 'done' ? { ...packet,
      containerExit: { exitCode, status: 'exited', oomKilled, packetPresent: true } } : packet)
    assert.equal(proof.qualified, false)
    assert.equal(proof.failedPhase, 'replacement-receive')
    assert.equal(proof.failure.kind, 'worker-exit')
    assert.deepEqual(proof.containerExit, { exitCode, status: 'exited', oomKilled, packetPresent: true })
    assert.deepEqual(proof.counts, { a: null, b: null })
  })
}
test('completion exit declared but unavailable metadata cannot qualify a direct public done packet', { timeout: 30000 }, async () => {
  let accessed = 0
  const { proof } = await scenario('revoked', packet => packet.type === 'done' ?
    Object.defineProperty({ ...packet }, 'containerExit', { get() { accessed++; throw Error('PRIVATE_EXIT') } }) : packet)
  assert.equal(proof.qualified, false); assert.equal(proof.failedPhase, 'replacement-receive')
  assert.equal(accessed, 0)
  assert.deepEqual(proof.containerExit, { exitCode: null, status: null, oomKilled: null, packetPresent: null })
  assert.equal(JSON.stringify(proof).includes('PRIVATE'), false)
})
