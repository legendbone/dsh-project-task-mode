import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import semver from 'semver'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// 宿主用 semver.satisfies(runtimeVersion, engines.dsh, { includePrerelease: true })
// 判定 bundle 兼容性；精确版本串只匹配自身，DSH 升级后整层 patch 会被跳过。
const SUPPORTED_HOSTS = ['0.2.1-rc.3', '0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.2', '0.2.3', '0.3.0-rc.1']
const OUT_OF_RANGE_HOSTS = ['0.2.1-rc.2', '0.3.0', '1.0.0']

const satisfies = (host, range) => semver.satisfies(host, range, { includePrerelease: true })

test('engines.dsh 是范围，覆盖已支持的宿主版本线（含 prerelease）', () => {
  assert.equal(semver.valid(pkg.engines.dsh), null, `engines.dsh 不能钉死精确版本：${pkg.engines.dsh}`)
  assert.ok(semver.validRange(pkg.engines.dsh), `engines.dsh 必须是合法范围：${pkg.engines.dsh}`)
  for (const host of SUPPORTED_HOSTS) {
    assert.equal(satisfies(host, pkg.engines.dsh), true, `engines.dsh=${pkg.engines.dsh} 必须接受 dsh ${host}`)
  }
  for (const host of OUT_OF_RANGE_HOSTS) {
    assert.equal(satisfies(host, pkg.engines.dsh), false, `engines.dsh=${pkg.engines.dsh} 必须拒绝 dsh ${host}`)
  }
})

test('所有 @deepseek-ai/dsh-* peer 使用同一范围而非精确版本', () => {
  const peers = Object.entries(pkg.peerDependencies).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
  assert.equal(peers.length, 19, '预期 19 个 @deepseek-ai/dsh-* peer')
  for (const [name, range] of peers) {
    assert.equal(semver.valid(range), null, `${name} 不能钉死精确版本：${range}`)
    assert.equal(range, pkg.engines.dsh, `${name} 应与 engines.dsh 保持一致`)
    for (const host of SUPPORTED_HOSTS) {
      assert.equal(satisfies(host, range), true, `${name}@${range} 必须接受 dsh ${host}`)
    }
  }
})

test('devDependencies 保留精确版本，避免 npm ci 解析到旧 cordis peer', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const devs = Object.entries(pkg.devDependencies).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
  assert.equal(devs.length, 19, '预期 19 个 @deepseek-ai/dsh-* devDependency')
  // 宿主只读取 engines.dsh / peerDependencies；devDependencies 只用于本地构建。
  // 若放宽成 >=0.2.1-rc.3 <0.3.0，npm 会解析到 0.2.1-rc.5，其 cordis peer 为 ~4.0.5，
  // 与根 @deepseek-ai/cordis ^4.1.0 冲突，导致 npm ci ERESOLVE。
  for (const [name, version] of devs) {
    assert.ok(semver.valid(version), `${name} 必须是可复现的精确版本：${version}`)
    const resolved = lock.packages[`node_modules/${name}`]?.version
    assert.equal(resolved, version, `${name} 的 lock 解析版本必须与声明一致：${resolved} vs ${version}`)
  }
})

test('package-lock.json 根段与 package.json 的版本和范围一致', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const root = lock.packages['']
  assert.equal(lock.version, pkg.version, 'lock 顶层 version 必须同步')
  assert.equal(root.version, pkg.version, 'lock 根包 version 必须同步')
  assert.equal(root.engines.dsh, pkg.engines.dsh, 'lock 根包 engines.dsh 必须同步')
  for (const [name, range] of Object.entries(pkg.peerDependencies)) {
    assert.equal(root.peerDependencies[name], range, `lock 根包 peer ${name} 必须同步`)
  }
  for (const [name, range] of Object.entries(pkg.devDependencies)) {
    assert.equal(root.devDependencies[name], range, `lock 根包 devDependency ${name} 必须同步`)
  }
})

test('cordis.patch 不再引用已合并的 tool-subagent-control 子路径', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.equal(
    patch.includes('@deepseek-ai/dsh-tool-subagent-control/list-agents'),
    false,
    'dsh 0.2.2-rc.1 起 list_agents 已并入主包，旧 ./list-agents 子路径会让整条 preset 挂载失败',
  )
  assert.match(patch, /name: '@deepseek-ai\/dsh-tool-subagent-control'\n/)
})
