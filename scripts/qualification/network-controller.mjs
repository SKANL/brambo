import { mkdir, readdir, readFile, writeFile, lstat, realpath, rm, mkdtemp } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, dirname, basename, win32 } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { isBuiltin } from 'node:module'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { projectQualificationFailure } from './network.mjs'

const packages = ['contracts', 'delegation', 'orchestration', 'runtime-local', 'workspace-artifacts-local',
  'workflow-store-sqlite', 'workflow-remote', 'workflow-coordinator']
export function combineCounts(first, next) {
  return Object.fromEntries(['a', 'b'].map(stage => {
    try {
      const values = [first, next].map(row => Object.getOwnPropertyDescriptor(row, stage)?.value)
      return [stage, values.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1) ? values[0] + values[1] : null]
    } catch { return [stage, null] }
  }))
}
export function containerArguments({ name, network, volume, image, role, args = [] }) {
  if (![name, network, volume].every(value => /^brambo-network-[a-z0-9-]{1,60}$/.test(value)) ||
      !/^sha256:[a-f0-9]{64}$/.test(image) || !['--coordinator', '--worker'].includes(role) ||
      args.some(value => typeof value !== 'string' || value.length > 128) ||
      role === '--worker' && (args.length !== 3 || args[0] !== 'http://coordinator:8080/v1/workflow' ||
        !['worker-a', 'worker-b'].includes(args[1]) || !['checkpoint', 'run', 'revoked'].includes(args[2])) ||
      role === '--coordinator' && (args.length !== 2 || args[0] !== '0.0.0.0' || args[1] !== '8080')) throw Error('container-input')
  return ['run', '--detach', '--pull=never', '--name', name, '--network', network, '--network-alias',
    role === '--coordinator' ? 'coordinator' : args[1], '--user=65534:65534', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--pids-limit=64', '--memory=256m', '--cpus=1',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m', '--volume', volume + ':/state:rw,rprivate', image, role, '/state', ...args,
    ...(role === '--worker' ? ['--wait'] : [])]
}
export function validateNativeScope({ optIn, connection, profile, image }) {
  if (optIn !== true || !/^brambo-q-[a-f0-9]{8}$/.test(connection) ||
    basename(profile ?? '') !== 'brambo-podman-setup-' + connection.slice(-8) ||
    !/^docker\.io\/library\/node@sha256:[a-f0-9]{64}$/.test(image)) throw Error('native-scope')
  return true
}
// Installed Podman manual: default output is a JSON array with Id, not a Go-template field.
export async function inspectNativeImage(run, reference, expectedId) {
  try {
    if (typeof reference !== 'string' || expectedId !== undefined && typeof expectedId !== 'string') throw Error()
    const digest = /^docker\.io\/library\/node@sha256:[a-f0-9]{64}$/.test(reference)
    if (!digest && !/^localhost\/brambo-network-[a-z0-9-]{1,60}$/.test(reference) ||
        expectedId !== undefined && !/^sha256:[a-f0-9]{64}$/.test(expectedId)) throw Error()
    const result = await run(['image', 'inspect', reference], '', 15000)
    const own = name => Object.getOwnPropertyDescriptor(result, name)?.value
    const text = own('stdout')
    if (own('exitCode') !== 0 || own('settled') !== true || own('truncated') !== false ||
        typeof text !== 'string' || Buffer.byteLength(text) > 1048576) throw Error()
    const records = JSON.parse(text)
    if (!Array.isArray(records) || records.length !== 1) throw Error()
    const record = records[0]
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.hasOwn(record, 'ID') || typeof record.Id !== 'string' || !/^[a-f0-9]{64}$/.test(record.Id)) throw Error()
    const identities = digest ? record.RepoDigests : record.RepoTags
    if (!Array.isArray(identities) || identities.length === 0 || identities.length > 64 ||
        identities.some(value => typeof value !== 'string' || value.length > 256) ||
        !identities.includes(digest ? reference : reference + ':latest')) throw Error()
    const imageId = 'sha256:' + record.Id
    if (expectedId !== undefined && expectedId !== imageId) throw Error()
    return imageId
  } catch { throw Error('image-inspect-invalid') }
}

// Inspect only own data descriptors; hostile accessors/proxies never become diagnostic text.
function inspectOwn(value, key) {
  if (!value || typeof value !== 'object') throw Error('inspect-shape')
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor && !Object.hasOwn(descriptor, 'value')) throw Error('inspect-shape')
  return descriptor?.value
}
function inspectKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('inspect-shape')
  const keys = Object.keys(value)
  if (keys.length > 64 || keys.some(key => key.length > 256)) throw Error('inspect-shape')
  return keys
}
function inspectArray(value) {
  if (!Array.isArray(value)) throw Error('inspect-shape')
  const length = inspectOwn(value, 'length')
  if (!Number.isSafeInteger(length) || length < 0 || length > 64) throw Error('inspect-shape')
  return Array.from({ length }, (_, index) => inspectOwn(value, String(index)))
}
export function projectNetworkInspection(value, network) {
  const row = { kind: 'network', ownedName: false, validId: false, internal: false, verified: false }
  try {
    row.ownedName = typeof network === 'string' && /^brambo-network-[a-z0-9-]{1,60}$/.test(network) &&
      inspectOwn(value, 'name') === network
    const id = inspectOwn(value, 'id')
    row.validId = typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
    row.internal = inspectOwn(value, 'internal') === true
    row.verified = row.ownedName && row.validId && row.internal
  } catch { row.verified = false }
  return row
}
export function projectContainment(value, scope) {
  const row = { kind: 'container', verified: false, nonroot: false, readonlyRoot: false,
    networkMode: 'missing', networkCount: null, ownedMembership: false, internal: false,
    effectiveCapsCount: null, boundingCapsCount: null, effectiveCapsKind: 'missing', boundingCapsKind: 'missing', noNewPrivileges: false,
    pids: null, memory: null, cpuOne: false, noPorts: false,
    mountCount: null, mountKinds: [], privateStateVolume: false,
    tmpfsCount: null, tmpfsOptionCount: null, tmpfsBytes: null, tmpfsUnknownOptions: null, tmpfsSafe: false }
  try {
    const network = inspectOwn(scope, 'network'), id = inspectOwn(scope, 'networkId'), volume = inspectOwn(scope, 'volume')
    if (typeof network !== 'string' || !/^brambo-network-[a-z0-9-]{1,60}$/.test(network) ||
        typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) ||
        typeof volume !== 'string' || !/^brambo-network-[a-z0-9-]{1,60}$/.test(volume)) return row
    row.internal = inspectOwn(scope, 'internal') === true
    const h = inspectOwn(value, 'HostConfig'), config = inspectOwn(value, 'Config')
    const settings = inspectOwn(value, 'NetworkSettings'), networks = inspectOwn(settings, 'Networks')
    row.nonroot = inspectOwn(config, 'User') === '65534:65534'
    row.readonlyRoot = inspectOwn(h, 'ReadonlyRootfs') === true
    const mode = inspectOwn(h, 'NetworkMode')
    row.networkMode = mode === network ? 'owned-name' : mode === id ? 'owned-id' :
      mode === 'bridge' ? 'owned-bridge' : mode === 'host' ? 'host' : typeof mode === 'string' ? 'foreign' : mode === undefined ? 'missing' : 'invalid'
    const names = inspectKeys(networks)
    row.networkCount = names.length
    const membershipId = names.length === 1 && names[0] === network ? inspectOwn(inspectOwn(networks, network), 'NetworkID') : undefined
    row.ownedMembership = names.length === 1 && names[0] === network && typeof membershipId === 'string' && membershipId === id
    const effective = inspectOwn(value, 'EffectiveCaps'), bounding = inspectOwn(value, 'BoundingCaps')
    row.effectiveCapsCount = Array.isArray(effective) ? inspectArray(effective).length : null
    row.boundingCapsCount = Array.isArray(bounding) ? inspectArray(bounding).length : null
    row.effectiveCapsKind = Array.isArray(effective) ? 'array' : effective === null ? 'null' : effective === undefined ? 'missing' : 'invalid'
    row.boundingCapsKind = Array.isArray(bounding) ? 'array' : bounding === null ? 'null' : bounding === undefined ? 'missing' : 'invalid'
    row.noNewPrivileges = inspectArray(inspectOwn(h, 'SecurityOpt')).includes('no-new-privileges')
    for (const [field, source] of [['pids', 'PidsLimit'], ['memory', 'Memory']]) {
      const number = inspectOwn(h, source)
      row[field] = Number.isSafeInteger(number) && number >= 0 ? number : null
    }
    row.cpuOne = inspectOwn(h, 'NanoCpus') === 1000000000 ||
      inspectOwn(h, 'CpuQuota') === 100000 && inspectOwn(h, 'CpuPeriod') === 100000
    const ports = inspectOwn(settings, 'Ports')
    row.noPorts = inspectKeys(ports).every(key => inspectOwn(ports, key) === null)
    const mounts = inspectArray(inspectOwn(value, 'Mounts'))
    row.mountCount = mounts.length
    row.mountKinds = mounts.map(mount => {
      const type = inspectOwn(mount, 'Type')
      return ['volume', 'bind', 'tmpfs'].includes(type) ? type : 'unknown'
    })
    const mount = mounts[0]
    row.privateStateVolume = mounts.length === 1 && inspectOwn(mount, 'Type') === 'volume' &&
      inspectOwn(mount, 'Name') === volume && inspectOwn(mount, 'Destination') === '/state' &&
      inspectOwn(mount, 'RW') === true && ['rprivate', 'private'].includes(inspectOwn(mount, 'Propagation'))
    const tmpfs = inspectOwn(h, 'Tmpfs'), paths = inspectKeys(tmpfs)
    row.tmpfsCount = paths.length
    const options = paths.length === 1 && paths[0] === '/tmp' ? inspectOwn(tmpfs, '/tmp') : undefined
    if (typeof options === 'string' && Buffer.byteLength(options) <= 1024) {
      const tokens = options.split(',')
      if (tokens.length <= 32) {
        row.tmpfsOptionCount = tokens.length
        row.tmpfsUnknownOptions = tokens.filter(token => !['rw', 'noexec', 'nosuid', 'nodev', 'size=16m', 'size=16777216', 'rprivate', 'tmpcopyup'].includes(token)).length
        const sizes = tokens.filter(token => token.startsWith('size='))
        row.tmpfsBytes = sizes.length === 1 && ['size=16m', 'size=16777216'].includes(sizes[0]) ? 16777216 : null
        row.tmpfsSafe = row.tmpfsUnknownOptions === 0 && new Set(tokens).size === tokens.length &&
          ['rw', 'noexec', 'nosuid', 'nodev'].every(token => tokens.includes(token)) && row.tmpfsBytes === 16777216
      }
    }
    row.inspectionVerified = row.nonroot && row.readonlyRoot && ['owned-name', 'owned-id', 'owned-bridge'].includes(row.networkMode) &&
      row.internal && row.ownedMembership && (row.effectiveCapsCount === 0 || row.effectiveCapsKind === 'null') &&
      (row.boundingCapsCount === 0 || row.boundingCapsKind === 'null') &&
      row.noNewPrivileges && row.pids === 64 && row.memory === 268435456 && row.cpuOne && row.noPorts &&
      row.privateStateVolume && row.tmpfsSafe
    // This static helper does not grant native admission; every native launch also needs a fresh runtime proof.
    row.verified = row.inspectionVerified && row.effectiveCapsCount === 0 && row.boundingCapsCount === 0
  } catch { row.verified = false }
  return row
}
export function verifyContainment(value, scope) { return projectContainment(value, scope).verified }

// Trusted inert code: only bounded kernel protection records and two fixed mounts are read.
export function runtimeProtectionProbe(fs, uid) {
  function bounded(path, limit) {
    const fd = fs.openSync(path, 'r'), bytes = Buffer.alloc(limit + 1)
    let size = 0
    try {
      while (size <= limit) {
        const count = fs.readSync(fd, bytes, size, bytes.length - size, null)
        if (count === 0) break
        size += count
      }
      if (size > limit) throw Error('probe-limit')
      return bytes.subarray(0, size).toString('utf8')
    } finally { fs.closeSync(fd) }
  }
  const status = bounded('/proc/self/status', 65536)
  function field(key) {
    const rows = status.split('\n').filter(line => line.startsWith(key + ':'))
    if (rows.length !== 1) throw Error('probe-status')
    return rows[0].slice(key.length + 1).trim()
  }
  const mountinfo = bounded('/proc/self/mountinfo', 262144)
  function mount(path, tmp) {
    const rows = mountinfo.split('\n').filter(line => line.split(' ')[4] === path)
    if (rows.length !== 1) throw Error('probe-mount')
    const [before, after, extra] = rows[0].split(' - '), fields = before.split(' '), tail = after?.split(' ')
    if (extra !== undefined || fields.length < 6 || !tail || tail.length !== 3) throw Error('probe-mount')
    const flags = fields[5].split(','), options = tail[2].split(',')
    if (flags.length > 16 || options.length > 32) throw Error('probe-mount')
    return { filesystem: tail[0], flags, ...(tmp ? { options } : {}),
      private: !fields.slice(6).some(value => /^(shared|master|propagate_from):/.test(value)) }
  }
  let rootWrite
  try {
    fs.writeFileSync('/.brambo-containment-canary', '', { flag: 'wx' })
    rootWrite = 'written'; fs.unlinkSync('/.brambo-containment-canary')
  } catch (error) { rootWrite = error.code === 'EROFS' ? 'EROFS' : 'other' }
  return { uid, capEff: field('CapEff'), capBnd: field('CapBnd'),
    noNewPrivs: field('NoNewPrivs') === '1' ? 1 : 0, rootWrite,
    tmp: mount('/tmp', true), state: mount('/state', false) }
}
const protectionCode = "const proof=(" + runtimeProtectionProbe.toString() + ")(require('node:fs'),process.getuid());" +
  "console.log(JSON.stringify({...proof,containerId:process.argv[2],nonce:process.argv[3]}))"
function runtimeProtectionValid(value) {
  const own = key => inspectOwn(value, key)
  if (own('uid') !== 65534 || own('capEff') !== '0000000000000000' ||
      own('capBnd') !== '0000000000000000' || own('noNewPrivs') !== 1 || own('rootWrite') !== 'EROFS') return false
  for (const key of ['tmp', 'state']) {
    const mount = own(key), flags = inspectArray(inspectOwn(mount, 'flags'))
    const required = key === 'tmp' ? ['rw', 'nosuid', 'nodev', 'noexec'] : ['rw', 'nosuid', 'nodev']
    const allowed = [...required, 'relatime']
    if (inspectOwn(mount, 'private') !== true || inspectOwn(mount, 'filesystem') !== (key === 'tmp' ? 'tmpfs' : 'ext4') ||
        new Set(flags).size !== flags.length || flags.some(flag => !allowed.includes(flag)) ||
        required.some(flag => !flags.includes(flag))) return false
    if (key === 'tmp') {
      const options = inspectArray(inspectOwn(mount, 'options'))
      if (new Set(options).size !== options.length || !options.includes('rw') || !options.includes('size=16384k') ||
          options.filter(option => typeof option === 'string' && option.startsWith('size=')).length !== 1 ||
          options.some(option => typeof option !== 'string' ||
            !['rw', 'size=16384k'].includes(option) && !/^(uid|gid)=(0|[1-9][0-9]{0,4})$/.test(option))) return false
    }
  }
  return true
}
// No caller-supplied/cached proof is accepted. The immutable launch ID binds both snapshots and exec.
async function collectNativeContainment(run, containerId, scope) {
  let row = { kind: 'container', verified: false, runtimeVerified: false, runtimeFailure: 'inspect-invalid' }
  try {
    if (typeof containerId !== 'string' || !/^[a-f0-9]{64}$/.test(containerId)) return row
    const end = performance.now() + 30000
    async function packet(args, limit) {
      const remaining = Math.min(10000, end - performance.now())
      if (remaining <= 0) throw Error('probe-deadline')
      const result = await run(args, '', remaining), text = inspectOwn(result, 'stdout')
      if (inspectOwn(result, 'exitCode') !== 0 || inspectOwn(result, 'settled') !== true ||
          inspectOwn(result, 'truncated') !== false || typeof text !== 'string' || Buffer.byteLength(text) > limit ||
          performance.now() >= end) throw Error('probe-receipt')
      return JSON.parse(text)
    }
    async function snapshot() {
      const records = await packet(['inspect', containerId], 1048576)
      if (!Array.isArray(records) || records.length !== 1 || inspectOwn(records[0], 'Id') !== containerId) throw Error('probe-identity')
      return projectContainment(records[0], scope)
    }
    row = { ...await snapshot(), verified: false, runtimeVerified: false, runtimeFailure: 'inspection-denied' }
    if (row.inspectionVerified !== true) return row
    row.runtimeFailure = 'probe-invalid'
    const nonce = randomUUID(), proof = await packet(['exec', containerId, 'node', '-e', protectionCode, '--',
      '--containment-probe', containerId, nonce], 8192)
    if (inspectOwn(proof, 'containerId') !== containerId || inspectOwn(proof, 'nonce') !== nonce || !runtimeProtectionValid(proof)) return row
    row.runtimeFailure = 'inspect-changed'
    const final = await snapshot()
    if (final.inspectionVerified !== true) return row
    row = { ...final, verified: true, runtimeVerified: true, runtimeFailure: null }
  } catch { row.verified = false; row.runtimeVerified = false }
  return row
}

export function createNativeRunner({ connection, profile }) {
  const env = { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', SystemDrive: 'C:', COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
    PATH: 'C:\\Program Files\\Git\\usr\\bin;C:\\Windows\\System32\\OpenSSH;C:\\Windows\\System32;C:\\Windows',
    PATHEXT: '.COM;.EXE;.BAT;.CMD', TEMP: win32.normalize(profile), TMP: win32.normalize(profile), CONTAINERS_MACHINE_PROVIDER: 'wsl',
    ...Object.fromEntries([['HOME', 'home'], ['USERPROFILE', 'home'], ['APPDATA', 'appdata'], ['LOCALAPPDATA', 'localappdata'],
      ['XDG_CONFIG_HOME', 'config'], ['XDG_DATA_HOME', 'data'], ['XDG_CACHE_HOME', 'cache']].map(([key, value]) => [key, win32.normalize(join(profile, value))])) }
  return async (args, input = '', budget = 15000) => {
    const actual = await realpath(profile), boundary = await realpath(tmpdir()), rel = relative(boundary, actual)
    if (!rel || isAbsolute(rel) || rel.startsWith('..') || basename(actual) !== 'brambo-podman-setup-' + connection.slice(-8)) throw Error('native-scope')
    return new Promise(resolve => {
      let stdout = '', truncated = false, timer, settlementTimer, finished = false
      const child = spawn('C:/Users/angua/AppData/Local/Programs/Podman/podman.exe', ['--connection', connection, ...args],
        { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      const finish = (exitCode, settled) => {
        if (finished) return
        finished = true; clearTimeout(timer); clearTimeout(settlementTimer); resolve({ exitCode, settled, truncated, stdout })
      }
      child.stdout.on('data', bytes => {
        if (Buffer.byteLength(stdout) + bytes.length > 1048576) truncated = true
        else stdout += bytes
      })
      child.stderr.resume() // Never persist/print native diagnostic bodies.
      child.once('error', () => finish(null, true)); child.once('close', code => finish(code, true))
      child.stdin.on('error', () => {}); child.stdin.end(input)
      timer = setTimeout(() => {
        const killer = spawn('C:/Windows/System32/taskkill.exe', ['/pid', String(child.pid), '/T', '/F'],
          { env: { SystemRoot: 'C:\\Windows' }, windowsHide: true, stdio: 'ignore' })
        settlementTimer = setTimeout(() => { killer.kill(); finish(null, false); child.unref() }, 5000)
        killer.once('error', () => finish(null, false))
      }, Math.min(300000, budget))
    })
  }
}
const bridge = `let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>1048576)throw Error('limit')}
const value=JSON.parse(input);if(value.url!=='http://coordinator:8080/v1/workflow'||value.method!=='POST'||
 !['synthetic-alice','synthetic-worker-a','synthetic-worker-b'].includes(value.authorization))throw Error('scope');
const response=await fetch(value.url,{method:'POST',headers:{'content-type':'application/json',authorization:value.authorization},
 body:value.body,redirect:'error',signal:AbortSignal.timeout(15000)});let size=0,chunks=[];
for await(const chunk of response.body){size+=chunk.length;if(size>1048576)throw Error('limit');chunks.push(chunk)}
console.log(JSON.stringify({status:response.status,body:Buffer.concat(chunks).toString()}));`
export function bridgeRequest(url, init) {
  return JSON.stringify({ url, method: init.method, authorization: new Headers(init.headers).get('authorization'), body: init.body })
}
// State and logs are separate snapshots. A stopped container earns one final read, never another poll loop.
export async function receiveContainer(command, name, end) {
  function packet(text) {
    try {
      if (typeof text !== 'string' || Buffer.byteLength(text) > 1048576) throw Error()
      const lines = text.trim().split('\n')
      if (lines.length !== 1) throw Error()
      const value = JSON.parse(lines[0])
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          !['ready','checkpoint','done','failed'].includes(value.type)) throw Error()
      if (value.type === 'done' && (!value.calls ||
          !['a','b'].every(key => Number.isSafeInteger(value.calls[key]) && value.calls[key] >= 0 && value.calls[key] <= 1))) throw Error()
      delete value.containerExit
      return value
    } catch { throw Error('packet-invalid') }
  }
  const request = args => {
    const remaining = end - performance.now()
    if (remaining <= 0) throw Error('deadline')
    return command(args, '', Math.min(15000, remaining))
  }
  while (performance.now() < end) {
    const text = await request(['logs', name])
    if (typeof text !== 'string' || Buffer.byteLength(text) > 1048576) throw Error('packet-invalid')
    if (text.trim()) return packet(text)
    let state
    try {
      const stateText = await request(['inspect', '--format', '{{json .State}}', name])
      if (typeof stateText !== 'string' || Buffer.byteLength(stateText) > 8192) throw Error()
      state = JSON.parse(stateText)
      if (!state || typeof state !== 'object' || Array.isArray(state) || typeof state.Running !== 'boolean') throw Error()
    } catch (error) {
      if (projectQualificationFailure(error).label === 'command-failed' ||
          projectQualificationFailure(error).label === 'deadline') throw error
      throw Error('packet-invalid', { cause: error })
    }
    if (state.Running === false) {
      const observation = safeContainerExit({ exitCode: state.ExitCode, status: state.Status,
        oomKilled: state.OOMKilled, packetPresent: null })
      try {
        const finalText = await request(['logs', name])
        observation.packetPresent = typeof finalText === 'string' ? finalText.trim().length > 0 : null
        if (typeof finalText !== 'string' || Buffer.byteLength(finalText) > 1048576) throw Error('packet-invalid')
        if (observation.packetPresent) {
          const finalPacket = packet(finalText)
          if (finalPacket.type === 'done' && !successfulContainerExit(observation)) throw Error('worker-exit')
          return { ...finalPacket, containerExit: observation }
        }
        throw Error('worker-exit')
      } catch (error) {
        // Only the code-owned primitive projection travels with the original bounded failure.
        const projected = projectQualificationFailure(error), bounded = Error(projected.label ?? 'native-receive-failed')
        if (projected.code) bounded.code = projected.code
        if (projected.name) bounded.name = projected.name
        bounded.containerExit = observation
        throw bounded
      }
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, end - performance.now()))))
  }
  throw Error('deadline')
}
function successfulContainerExit(value) {
  return value.exitCode === 0 && ['exited','stopped'].includes(value.status) &&
    value.oomKilled === false && value.packetPresent === true
}
function observedContainerExit(value) {
  try {
    if (!value || typeof value !== 'object') return null
    const descriptor = Object.getOwnPropertyDescriptor(value, 'containerExit')
    if (!descriptor) return null
    return safeContainerExit(Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined)
  } catch { return safeContainerExit(undefined) }
}
function safeContainerExit(value) {
  const result = { exitCode: null, status: null, oomKilled: null, packetPresent: null }
  try {
    const code = inspectOwn(value, 'exitCode'), status = inspectOwn(value, 'status')
    const oom = inspectOwn(value, 'oomKilled'), present = inspectOwn(value, 'packetPresent')
    if (Number.isSafeInteger(code) && code >= 0 && code <= 255) result.exitCode = code
    if (['created','configured','running','paused','stopping','stopped','exited','removing'].includes(status)) result.status = status
    if (typeof oom === 'boolean') result.oomKilled = oom
    if (typeof present === 'boolean') result.packetPresent = present
  } catch { /* Unknown primitive diagnostics remain null; never invoke accessors. */ }
  return result
}

export async function runContainerScenario(options) {
  validateNativeScope(options)
  const { repo, connection, profile, image, variant = 'valid' } = options
  if (!['valid', 'revoked'].includes(variant)) throw Error('native-scope')
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'brambo-network-'))
  const actual = await realpath(root), boundary = await realpath(tmpdir()), rel = relative(boundary, actual)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !basename(actual).startsWith('brambo-network-')) throw Error('native-scope')
  const run = options.run ?? createNativeRunner({ connection, profile })
  const prefix = 'brambo-network-' + randomUUID().slice(0, 8), network = prefix + '-net', tag = 'localhost/' + prefix
  const volumes = ['authority', 'a', 'b'].map(role => prefix + '-' + role), containers = [], createdVolumes = []
  let createdNetwork = false, buildAttempted = false, proof, reason = 'unknown', settled = true, workEnd = Infinity, phase = 'bundle'
  const containmentObservations = []
  async function command(args, input = '', budget = 15000) {
    const remaining = Math.min(budget, workEnd - performance.now())
    if (remaining <= 0) throw Error('deadline')
    const result = await run(args, input, remaining)
    settled &&= result.settled === true
    if (result.exitCode !== 0 || !result.settled || result.truncated) throw Error(args[0] === 'build' ? 'build-failed' : 'command-failed')
    return result.stdout
  }
  async function unoccupied(kind, name) {
    const result = await run([kind, 'exists', name], '', 15000)
    settled &&= result.settled === true
    if (result.exitCode !== 1 || !result.settled || result.truncated) throw Error('resource-collision')
  }
  try {
    const manifest = await prepareBundle(repo, join(root, 'payload'))
    await writeFile(join(root, 'Dockerfile'), 'FROM ' + image + '\nCOPY payload /opt/qualification\nUSER 65534:65534\nWORKDIR /opt/qualification\nENTRYPOINT ["node", "network.mjs"]\n')
    phase = 'network-create'; await unoccupied('network', network); createdNetwork = true
    await command(['network', 'create', '--internal', network])
    phase = 'network-inspect'; const inspectedNetwork = JSON.parse(await command(['network', 'inspect', network]))[0]
    const networkObservation = projectNetworkInspection(inspectedNetwork, network)
    containmentObservations.push(networkObservation)
    if (!networkObservation.verified) throw Error('containment')
    const networkScope = { network, networkId: inspectedNetwork.id, internal: true }
    for (const volume of volumes) {
      phase = 'volume-create'
      await unoccupied('volume', volume); createdVolumes.push(volume)
      await command(['volume', 'create', '--uid=65534', '--gid=65534', volume])
    }
    await unoccupied('image', tag)
    phase = 'image-build'; buildAttempted = true
    await command(['build', '--network=none', '--pull=never', '--tag', tag, '--file', join(root, 'Dockerfile'), root], '', 240000)
    workEnd = performance.now() + 300000
    phase = 'image-inspect'
    const pinned = await inspectNativeImage(async (args, input, budget) => {
      const remaining = Math.min(budget, workEnd - performance.now())
      if (remaining <= 0) throw Error('deadline')
      const result = await run(args, input, remaining)
      settled &&= result.settled === true
      return result
    }, tag)
    async function launch(subject, mode) {
      const role = subject === 'coordinator' ? '--coordinator' : '--worker', index = subject === 'coordinator' ? 0 : subject === 'worker-a' ? 1 : 2
      const name = prefix + '-' + index, args = subject === 'coordinator' ? ['0.0.0.0', '8080'] :
        ['http://coordinator:8080/v1/workflow', subject, mode]
      await unoccupied('container', name); containers.push(name)
      const id = (await command(containerArguments({ name, network, volume: volumes[index], image: pinned, role, args }))).trim()
      const observation = await collectNativeContainment(async (tokens, input, budget) => {
        const remaining = Math.min(budget, workEnd - performance.now())
        if (remaining <= 0) throw Error('deadline')
        const result = await run(tokens, input, remaining)
        settled &&= inspectOwn(result, 'settled') === true
        return result
      }, id, { ...networkScope, volume: volumes[index] })
      containmentObservations.push(observation)
      if (!observation.verified) throw Error('containment')
      if (subject !== 'coordinator') await command(['exec', id, 'node', '-e', "require('node:fs').writeFileSync('/state/start','trusted-start')"])
      return { name: id, receive: () => receiveContainer(command, id, workEnd) }
    }
    phase = 'coordinator-start'; const coordinator = await launch('coordinator')
    phase = 'coordinator-ready'; const authority = await coordinator.receive()
    const ports = await loadPublicPorts(join(root, 'payload'))
    const transport = async (url, init) => {
      if (init.signal?.aborted) throw Error('deadline')
      const reply = JSON.parse(await command(['exec', '--interactive', coordinator.name, 'node', '--input-type=module', '-e', bridge],
        bridgeRequest(url, init), 20000))
      return new Response(reply.body, { status: reply.status })
    }
    phase = 'workflow'; proof = await runNetworkScenario({ ports, authority, transport, variant, startWorker: launch,
      killWorker: async worker => {
        await command(['kill', '--signal=KILL', worker.name])
        const state = JSON.parse(await command(['inspect', '--format', '{{json .State}}', worker.name]))
        return state.Running === false && state.Pid === 0
      } })
    proof.bundleSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
    const admitted = containmentObservations.filter(row => row.kind === 'container')
    proof.containerProof = admitted.length === 3 && admitted.every(row => row.verified === true && row.runtimeVerified === true)
    proof.qualified &&= proof.containerProof
  } catch (error) {
    const failure = projectQualificationFailure(error)
    reason = failure.label ?? failure.kind
    proof = { qualified: false, reason, failedPhase: phase, failure, status: null, counts: { a: null, b: null } }
    const exit = observedContainerExit(error)
    if (exit) proof.containerExit = exit
  }
  finally {
    let cleaned = settled
    const end = performance.now() + 120000
    const cleanup = async (kind, name, force = false) => {
      if (performance.now() >= end) { cleaned = false; return }
      const bounded = args => run(args, '', Math.max(1, Math.min(15000, end - performance.now())))
      try {
        const existing = await bounded([kind, 'exists', name])
        if (existing.exitCode === 1 && existing.settled) return
        if (existing.exitCode !== 0 || !existing.settled) { cleaned = false; return }
        const result = await bounded([kind, 'rm', ...(force ? ['--force'] : []), name])
        const absent = await bounded([kind, 'exists', name])
        cleaned &&= result.exitCode === 0 && result.settled === true && absent.exitCode === 1 && absent.settled === true
      }
      catch { cleaned = false }
    }
    for (const name of containers.reverse()) await cleanup('container', name, true)
    for (const volume of createdVolumes.reverse()) await cleanup('volume', volume)
    if (createdNetwork) await cleanup('network', network)
    if (buildAttempted) await cleanup('image', tag, true)
    if (cleaned) await rm(actual, { recursive: true, force: true })
    proof ??= { qualified: false, reason }
    proof.containmentObservations = containmentObservations
    proof.cleanupVerified = cleaned
    if (!cleaned) { proof.qualified = false; proof.reason = 'cleanup-unverified' }
  }
  return proof
}
// Curated public compiled payload, never a copy of host node_modules or the repository.
export async function prepareBundle(repo, destination) {
  const rows = []
  const parser = createRequire(createRequire(import.meta.url).resolve('eslint/package.json'))('espree')
  async function validateImports(text, source, packageRoot) {
    const tree = parser.parse(text, { ecmaVersion: 'latest', sourceType: 'module' }), local = []
    function specifier(value) {
      if (value?.type !== 'Literal' || typeof value.value !== 'string') throw Error('bundle-import')
      const name = value.value
      if (name.startsWith('node:') && isBuiltin(name)) return
      if (packages.some(pkg => name === '@brambodev/' + pkg)) return
      if (name.startsWith('./') || name.startsWith('../')) {
        const target = resolve(dirname(source), name), rel = relative(packageRoot, target)
        if (name.endsWith('.js') && !/[?#]/.test(name) && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..')) {
          local.push(target); return
        }
      }
      throw Error('bundle-import')
    }
    function visit(node) {
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && node.source) specifier(node.source)
      if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') throw Error('bundle-import')
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.filter(item => item && typeof item.type === 'string').forEach(visit)
        else if (value && typeof value.type === 'string') visit(value)
      }
    }
    visit(tree)
    for (const path of local) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) throw Error('bundle-import') }
  }
  async function copyFile(source, target, relative, packageRoot) {
    if (!(await lstat(source)).isFile() || (await lstat(source)).isSymbolicLink()) throw Error('bundle-symlink')
    const bytes = await readFile(source)
    if (source.endsWith('.js')) await validateImports(bytes.toString(), source, packageRoot)
    await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, bytes)
    rows.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  async function walk(source, target, prefix, packageRoot = source) {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('bundle-symlink')
      if (entry.isDirectory()) await walk(join(source, entry.name), join(target, entry.name), prefix + '/' + entry.name, packageRoot)
      else if (entry.isFile() && entry.name.endsWith('.js')) await copyFile(join(source, entry.name), join(target, entry.name), prefix + '/' + entry.name, packageRoot)
    }
  }
  for (const name of packages) {
    const source = join(repo, 'packages', name), prefix = 'node_modules/@brambodev/' + name, target = join(destination, prefix)
    await copyFile(join(source, 'package.json'), join(target, 'package.json'), prefix + '/package.json')
    await walk(join(source, 'dist'), join(target, 'dist'), prefix + '/dist')
  }
  await copyFile(join(repo, 'scripts/qualification/network.mjs'), join(destination, 'network.mjs'), 'network.mjs')
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}
export async function loadPublicPorts(bundle) {
  const resolve = createRequire(join(bundle, 'network.mjs'))
  return { remote: await import(pathToFileURL(resolve.resolve('@brambodev/workflow-remote')).href) }
}
async function observedDenial(response) {
  let reader, timer
  try {
    if (response.status !== 404) return false
    reader = response.clone().body.getReader()
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('observation-deadline')), 1000) })
    const chunks = []
    let size = 0
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline])
      if (done) break
      size += value.byteLength
      if (size > 4096) return false
      chunks.push(value)
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)))
    return value !== null && !Array.isArray(value) && Object.keys(value).sort().join(',') === 'code,status,version' &&
      value.version === 1 && value.status === 'denied' && value.code === 'denied'
  } catch { return false }
  finally { clearTimeout(timer); if (reader) void reader.cancel().catch(() => {}) }
}

export async function runNetworkScenario({ ports, authority, startWorker, killWorker, transport = fetch, variant = 'valid' }) {
  const signal = AbortSignal.timeout(300000)
  let phase = 'workflow-create', lastExchange = null, client, replacement, stale, first, packet, done
  const proof = { qualified: false, status: null, checkpoint: null, contention: null, staleCommit: null,
    stalePublish: null, completedUnchanged: null, artifactIdentity: null, counts: { a: null, b: null },
    counterFailure: null, failedPhase: null, failure: null, statusObservedPhase: null, rootTasks: null }
  const phases = value => { phase = value }
  const remote = subject => ({ endpoint: authority.endpoint,
    fetch: async (input, init) => {
      const operation = JSON.parse(init.body).operation
      const known = ['create','get','claim','release','commit','artifact.manifest','artifact.publish','artifact.read']
      lastExchange = { phase, operation: known.includes(operation) ? operation : 'unknown', httpStatus: null,
        typedDenied: false, transportFailure: false }
      try {
        const response = await transport(input, { ...init, signal })
        lastExchange.httpStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null
        lastExchange.typedDenied = await observedDenial(response)
        return response
      } catch (error) { lastExchange.transportFailure = true; throw error }
    }, authorizeRequest: async () => ({ authorization: 'synthetic-' + subject }) })
  function status(snapshot) {
    const value = snapshot?.status
    return ['pending','running','succeeded','failed','cancelled','blocked'].includes(value) ? value : null
  }
  function rootState(snapshot) {
    proof.status = status(snapshot); proof.statusObservedPhase = phase
    proof.rootTasks = null
    try {
      const tasks = inspectArray(inspectOwn(snapshot, 'tasks'))
      if (tasks.length > 2) return
      proof.rootTasks = tasks.map(task => {
        const id = inspectOwn(task, 'taskId'), state = inspectOwn(task, 'phase'), attempt = inspectOwn(task, 'attempt')
        return { taskId: ['a','b'].includes(id) ? id : null,
          phase: ['pending','running','succeeded','failed','cancelled','blocked','uncertain'].includes(state) ? state : null,
          attempt: Number.isSafeInteger(attempt) && attempt >= 0 && attempt <= 1 ? attempt : null }
      })
    } catch { proof.rootTasks = null }
  }
  function fail(error) {
    proof.qualified = false; proof.failedPhase = phase
    proof.lastExchange = lastExchange
    proof.failure = projectQualificationFailure(error, lastExchange?.phase === phase ? lastExchange : null)
    proof.reason = proof.failure.label ?? proof.failure.kind
    const exit = observedContainerExit(error)
    if (exit) proof.containerExit = exit
  }
  try {
    client = ports.remote.createRemoteRunStore(remote('alice'))
    const key = { namespace: 'tenant', runId: 'run' }
    await client.create({ schemaVersion: 1, key, revision: 0, workflowId: 'network-flow', workflowVersion: '1',
      sessionId: 'session', status: 'pending', workspace: authority.workspace, tasks: [], context: null, cancelRequested: false },
    { key, clientId: 'a', idempotencyKey: 'start', kind: 'start', payload: null }, { namespace: 'tenant', subject: 'alice' })
    phases('checkpoint-start'); first = await startWorker('worker-a', 'checkpoint')
    phases('checkpoint-receive'); packet = await first.receive()
    const firstExit = observedContainerExit(packet)
    if (firstExit) proof.containerExit = firstExit
    if (packet.type === 'failed') {
      proof.workerFailure = safeWorkerFailure(packet)
      throw Error('worker-outcome')
    }
    if (packet.type !== 'checkpoint') throw Error('checkpoint')
    phases('checkpoint-read'); const before = await client.get(key)
    rootState(before)
    phases('checkpoint-validate')
    if (!before || JSON.stringify(before.tasks.map(task => [task.taskId, task.phase, task.attempt])) !==
      JSON.stringify([['a', 'succeeded', 1], ['b', 'pending', 0]])) throw Error('checkpoint-boundary')
    const completed = structuredClone(before.tasks[0]); proof.checkpoint = true
    replacement = ports.remote.createRemoteRunStore(remote('worker-b'))
    stale = ports.remote.createRemoteRunStore(remote('worker-a'))
    let publicationDenied = false
    const artifactOptions = remote('worker-a')
    const artifacts = ports.remote.createRemoteArtifactProvider({ ...artifactOptions, fetch: async (input, init) => {
      const response = await artifactOptions.fetch(input, init)
      if (input === authority.endpoint && new Headers(init.headers).get('authorization') === 'synthetic-worker-a' &&
          JSON.parse(init.body).operation === 'artifact.publish') publicationDenied = await observedDenial(response)
      return response
    } })
    const resources = Object.keys(packet.lease.epochs)
    phases('contention'); const contention = await replacement.claim('tenant', resources, 'worker-b', 3000)
    proof.contention = contention.status
    if (contention.status !== 'contended') throw Error('contention')
    phases('terminate-owner'); if (!await killWorker(first)) throw Error('cleanup-unverified')
    phases('lease-barrier'); const end = performance.now() + 10000
    while (true) {
      if (performance.now() >= end) throw Error('lease-expiry')
      const barrier = await replacement.claim('tenant', resources, 'worker-b', 3000)
      if (barrier.status === 'acquired') { await replacement.release(barrier.lease); break }
      if (barrier.status !== 'contended') throw Error('lease-expiry')
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    phases('replacement-start'); const second = await startWorker('worker-b', variant === 'revoked' ? 'revoked' : 'run')
    phases('replacement-receive'); done = await second.receive()
    const nextExit = observedContainerExit(done)
    if (nextExit) proof.containerExit = nextExit
    if (done.type === 'failed') { proof.workerFailure = safeWorkerFailure(done); throw Error('worker-outcome') }
    if (done.type !== 'done') throw Error('worker-outcome')
    if (nextExit && !successfulContainerExit(nextExit)) throw Error('worker-exit')
    proof.counts = combineCounts(packet.calls, done.calls)
    proof.counterFailure = Object.values(proof.counts).some(count => count === null || count > 1) ? 'counter-invalid' : null
    phases('result-read'); const after = await client.get(key)
    if (!after) throw Error('result-unavailable')
    rootState(after)
    proof.completedUnchanged = JSON.stringify(completed) === JSON.stringify(after.tasks[0])
    phases('stale-commit'); const staleCommit = await stale.commit({ snapshot: { ...after, revision: after.revision + 1 },
      expectedRevision: after.revision, lease: packet.lease, events: [] })
    proof.staleCommit = staleCommit.status
    phases('artifact-manifest'); const manifest = await artifacts.manifest(completed.workspace)
    phases('stale-publish'); proof.stalePublish = 'published'
    try { await artifacts.publish(authority.workspace, await artifacts.manifest(authority.workspace), packet.lease) }
    catch { proof.stalePublish = publicationDenied ? 'denied' : 'unproven' }
    phases('artifact-read'); const bytes = await artifacts.read(completed.workspace, 'a.txt')
    const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex')
    phases('artifact-identity')
    proof.artifactIdentity = manifest.revision === completed.workspace.revision && bytes.toString() === 'synthetic-a\n' &&
      manifest.entries.some(entry => entry.path === 'a.txt' && entry.digest === digest)
    const safety = proof.completedUnchanged && proof.artifactIdentity && proof.staleCommit === 'stale-lease' && proof.stalePublish === 'denied'
    proof.qualified = safety && (variant === 'revoked' ? proof.counts.a === 1 && proof.counts.b === 0 && after.status !== 'succeeded' :
      after.status === 'succeeded' && proof.counts.a === 1 && proof.counts.b === 1)
  } catch (error) { fail(error) }
  finally {
    for (const port of [client, replacement, stale]) if (port) {
      try { await port.close() } catch (error) { if (!proof.failure) { phases('client-close'); fail(error) } }
    }
  }
  return proof
}
function safeWorkerFailure(packet) {
  const row = { failedPhase: 'unknown', failure: { kind: 'unknown', code: null, name: null, label: null }, calls: { a: null, b: null } }
  try {
    const phase = inspectOwn(packet, 'failedPhase'), failure = inspectOwn(packet, 'failure')
    if (['worker-setup','worker-run','worker-close','coordinator-setup','startup'].includes(phase)) row.failedPhase = phase
    const label = inspectOwn(failure, 'label'), code = inspectOwn(failure, 'code'), name = inspectOwn(failure, 'name')
    row.failure = projectQualificationFailure({ message: label, code, name })
    const calls = inspectOwn(packet, 'calls')
    row.calls = Object.fromEntries(['a','b'].map(key => {
      const count = inspectOwn(calls, key)
      return [key, Number.isSafeInteger(count) && count >= 0 && count <= 1 ? count : null]
    }))
  } catch { /* Unknown remains bounded; never copy arbitrary packet metadata. */ }
  return row
}
