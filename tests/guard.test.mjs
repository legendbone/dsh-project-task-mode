import assert from 'node:assert/strict'
import test from 'node:test'
import { registerTaskStartGuard } from '../src/agent/guard.ts'

async function runGuard({
  name = 'bash',
  command,
  activeTask = false,
  reviveTask = false,
  withSession = true,
} = {}) {
  let hook
  const reviveCalls = []
  const ctx = {
    on(event, callback) {
      if (event === 'tools/pre-execute') hook = callback
    },
  }
  const controller = {
    activeTaskForSession() {
      return activeTask ? { id: 'task-1' } : undefined
    },
    reviveForSession(sessionId) {
      reviveCalls.push(sessionId)
      return reviveTask ? { id: 'task-1', status: 'in_progress' } : undefined
    },
  }
  registerTaskStartGuard(ctx, controller)
  assert.equal(typeof hook, 'function')
  const result = await hook({
    name,
    arguments: command === undefined ? {} : { command },
    agent: withSession ? { session: { id: 'session-1' } } : undefined,
  }, async () => ({ kind: 'allow' }))
  return { result, reviveCalls }
}

async function execute(options = {}) {
  return (await runGuard(options)).result
}

test('allows a read-only git diff pipeline before task start', async () => {
  const command = 'git diff -- Assets/Scripts/Game/View/GameSceneManager-JackPot.cs Assets/Scripts/Game/UI/RewardCutsceneDialog.cs | head -400'
  assert.deepEqual(await execute({ command }), { kind: 'allow' })
})

test('supports quoted paths in a read-only git diff pipeline', async () => {
  const command = 'git diff -- "Assets/UI/Reward Cutscene.cs" \'Assets/UI/Reward Video.cs\' | head -n 40'
  assert.deepEqual(await execute({ command }), { kind: 'allow' })
})

test('allows common read-only commands before task start', async t => {
  const commands = [
    'pwd; ls -la',
    'ls -la',
    'pwd && ls',
    'cat package.json | grep version',
    'find . -name "*.ts"',
    'git status',
    'git status --short',
    'git log --oneline -5',
    'git diff -- src | tail -40',
    'git branch -a',
    'git tag -l',
    'git remote -v',
    'git config --get user.name',
    'git stash list',
    "sed -n '1,20p' package.json",
    'head -n 40 README.md',
    'tail -20 README.md',
    'wc -l src/agent/shell.ts',
    'rg "isReadOnly" src',
    'du -sh .',
    'sort package.json',
    'echo done',
  ]
  for (const command of commands) {
    await t.test(command, async () => {
      assert.deepEqual(await execute({ command }), { kind: 'allow' })
    })
  }
})

test('allows read-only for loops before task start', async t => {
  const commands = [
    'for f in a b; do echo "$f"; cat "$f"; done',
    'cd /repo && for f in src/a.ts src/b.ts; do echo "===== $f ====="; cat "$f"; echo; done',
    'for f in a b\ndo\n  cat "${f}"\ndone',
    'for f in a b; do cat "$f" 2>/dev/null; done',
    'echo "${HOME}"; for f in x; do head -n 2 "$f"; done',
  ]
  for (const command of commands) {
    await t.test(JSON.stringify(command), async () => {
      assert.deepEqual(await execute({ command }), { kind: 'allow' })
    })
  }
})

test('keeps write-bearing or substituting for loops denied', async t => {
  const commands = [
    'for f in a b; do rm -rf "$f"; done',
    'for f in a b; do cat "$f"; touch x; done',
    'for f in $(ls); do cat "$f"; done',
    'for f in a b; do echo `id`; done',
    'for f in a; do cat "$f" > out.txt; done',
    'for f in a b; do cat "$f"; done; touch x',
  ]
  for (const command of commands) {
    await t.test(JSON.stringify(command), async () => {
      assert.equal((await execute({ command })).kind, 'deny')
    })
  }
})

test('explains why a write-bearing for loop is denied', async () => {
  const result = await execute({ command: 'for f in a b; do rm -rf "$f"; done' })
  assert.equal(result.kind, 'deny')
  assert.match(result.reason, /只读|白名单/)
})

test('allows the original inspection command with stderr discarded', async () => {
  const command = 'ls -la Tools tableTools2 2>/dev/null; echo "---"; ls -la A_macScript 2>/dev/null | head; echo "--- module content ---"; file A_macScript'
  assert.deepEqual(await execute({ command }), { kind: 'allow' })
})

test('allows only redirections that cannot write files', async t => {
  const commands = [
    'ls 2>/dev/null',
    'ls 2> /dev/null',
    'ls >/dev/null',
    'ls 1> /dev/null',
    'ls 2>&1 | head',
    'ls 1>&2',
    'ls >/dev/null 2>&1',
    'ls 2>&1 >/dev/null',
    '2>/dev/null ls -la',
    'ls 2>/dev/null -la',
    'echo foo2>/dev/null',
    'echo 2 > /dev/null',
    'echo "2>/dev/null"',
  ]
  for (const command of commands) {
    await t.test(command, async () => {
      assert.deepEqual(await execute({ command }), { kind: 'allow' })
    })
  }
})

test('keeps unrelated read tools allowed before task start', async () => {
  assert.deepEqual(await execute({ name: 'read' }), { kind: 'allow' })
})

test('allows bash normally when the session has an active task', async () => {
  assert.deepEqual(await execute({ command: 'touch after-task-start', activeTask: true }), { kind: 'allow' })
})

test('keeps unsafe or unknown bash commands denied before task start', async t => {
  const commands = [
    'touch before-task-start',
    'rm -rf build',
    'npm install',
    'python -c "open(\'x\',\'w\')"',
    'git commit -m "x"',
    'git branch -D feature',
    'git tag v1',
    'git remote add origin http://example.com/repo.git',
    'git config user.name x',
    'git stash drop',
    'git diff --output=patch.txt',
    'git diff --output patch.txt',
    'git diff --ext-diff',
    'git diff --textconv',
    'git diff > patch.txt',
    'ls 2>error.log',
    'ls 2>>error.log',
    'ls >out.txt',
    'ls 2>/dev/null; touch after-ls',
    'ls 2>/dev/null && rm -rf build',
    'ls 2>/dev/null.txt',
    'ls 2>/dev/null2>&1',
    'ls >>/dev/null',
    'ls 2>>/dev/null',
    'ls &>/dev/null',
    'ls >|/dev/null',
    'ls 12>/dev/null',
    'ls 2>&10',
    'ls 2>&1foo',
    'ls 1>&2foo',
    'ls 2>&1-',
    'ls 2>',
    'ls 2>&',
    'ls 2>&1&',
    'ls 2>/dev/null&',
    'touch x 2>/dev/null',
    '2>/dev/null touch x',
    'ls 2>/dev/null | tee out.txt',
    'sort -o 2>/dev/null',
    'git diff --output 2>/dev/null',
    'ls < input.txt',
    'git diff && touch after-diff',
    'git diff; touch after-diff',
    'git diff | head -400 && touch after-head',
    'git diff $(touch command-substitution)',
    'git diff `touch command-substitution`',
    'git diff |',
    'git -c diff.external=./external diff',
    'ls && rm -rf build',
    'ls; rm -rf build',
    'find . -delete',
    'find . -exec rm',
    'sed -i "s/a/b/" package.json',
    "sed -n '1e touch x' package.json",
    'sort -o out.txt package.json',
    'tree -o out.txt .',
    'echo hi > out.txt',
    'ls | tee out.txt',
    '',
  ]
  for (const command of commands) {
    await t.test(command || '(empty)', async () => {
      assert.equal((await execute({ command })).kind, 'deny')
    })
  }
})

test('identifies an unsupported redirection in the denial reason', async () => {
  const result = await execute({ command: 'ls 2>error.log' })
  assert.equal(result.kind, 'deny')
  assert.match(result.reason, /重定向/)
  assert.match(result.reason, /2>/)
})

test('does not extend the bash exemption to other shell tools', async () => {
  assert.equal((await execute({ name: 'pwsh', command: 'git diff | head -400' })).kind, 'deny')
  assert.equal((await execute({ name: 'terminal', command: 'git diff | head -400' })).kind, 'deny')
})

test('keeps non-shell side-effect tools denied before task start', async () => {
  assert.equal((await execute({ name: 'write' })).kind, 'deny')
})

test('re-entering a review task revives it and allows bash side effects', async () => {
  const { result, reviveCalls } = await runGuard({ command: 'touch after-review', reviveTask: true })
  assert.deepEqual(result, { kind: 'allow' })
  assert.deepEqual(reviveCalls, ['session-1'])
})

test('re-entering a review task revives it and allows write/edit tools', async () => {
  const write = await runGuard({ name: 'write', reviveTask: true })
  assert.deepEqual(write.result, { kind: 'allow' })
  assert.deepEqual(write.reviveCalls, ['session-1'])

  const edit = await runGuard({ name: 'edit', reviveTask: true })
  assert.deepEqual(edit.result, { kind: 'allow' })
})

test('does not attempt a revive when the session already owns an active task', async () => {
  const { result, reviveCalls } = await runGuard({ command: 'touch active', activeTask: true, reviveTask: true })
  assert.deepEqual(result, { kind: 'allow' })
  assert.deepEqual(reviveCalls, [])
})

test('still denies side-effect tools when there is nothing to revive', async () => {
  const { result, reviveCalls } = await runGuard({ command: 'touch before-task-start', reviveTask: false })
  assert.equal(result.kind, 'deny')
  assert.deepEqual(reviveCalls, ['session-1'])
})
