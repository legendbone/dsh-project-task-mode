type Quote = "'" | '"'

type Separator = ';' | '&&' | '||' | '|'

type Token =
  | { readonly kind: 'word'; readonly value: string }
  | { readonly kind: 'op'; readonly value: Separator }

const FIND_WRITE_PRIMARIES = new Set([
  '-delete',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
  '-fprint',
  '-fprint0',
  '-fprintf',
  '-fls',
])

const GIT_READ_SUBCOMMANDS = new Set([
  'status',
  'log',
  'show',
  'grep',
  'blame',
  'shortlog',
  'ls-files',
  'ls-tree',
  'rev-parse',
  'cat-file',
  'for-each-ref',
  'count-objects',
  'describe',
  'whatchanged',
  'show-ref',
  'merge-base',
  'name-rev',
  'show-branch',
])

const GIT_BRANCH_LIST_FLAGS = new Set([
  '-a',
  '-r',
  '-v',
  '-vv',
  '--list',
  '-l',
  '--all',
  '--remotes',
  '--verbose',
  '--show-current',
  '--contains',
  '--no-contains',
  '--merged',
  '--no-merged',
  '--points-at',
  '--format',
  '--sort',
  '--column',
  '--no-column',
  '--color',
  '--no-color',
  '--abbrev',
  '--no-abbrev',
  '--omit-empty',
])

const GIT_TAG_LIST_FLAGS = new Set([
  '-l',
  '--list',
  '-n',
  '--contains',
  '--no-contains',
  '--merged',
  '--no-merged',
  '--points-at',
  '--format',
  '--sort',
  '--column',
  '--no-column',
  '--color',
  '--no-color',
  '-i',
  '--ignore-case',
  '--verify',
  '--omit-empty',
])

const GIT_CONFIG_WRITE_FLAGS = new Set([
  '--unset',
  '--unset-all',
  '--add',
  '--replace-all',
  '--edit',
  '-e',
  '--rename-section',
  '--remove-section',
])

type TokenizeResult =
  | { readonly ok: true; readonly tokens: Token[] }
  | { readonly ok: false; readonly reason?: string }

type RedirectionResult =
  | { readonly ok: true; readonly endIndex: number }
  | { readonly ok: false; readonly reason: string }

function isRedirectionBoundary(char: string | undefined): boolean {
  return char === undefined || /[\s;|&<>]/.test(char)
}

function rejectRedirection(command: string, index: number, descriptor: string): { readonly ok: false; readonly reason: string } {
  const operator = command[index] === '<' ? `${descriptor}<` : `${descriptor}>`
  return {
    ok: false,
    reason: `检测到不支持或可能写入文件的重定向 \`${operator}\`（字符位置 ${index + 1}）；任务开始前仅允许输出到 /dev/null 或在 stdout/stderr 间复制。`,
  }
}

/** Parse a redirection without a file-writing target. The `>` or `<` is at index. */
function parseSafeRedirection(command: string, index: number, descriptor: string): RedirectionResult {
  if (command[index] === '<' || command[index + 1] === '>' || command[index + 1] === '|') {
    return rejectRedirection(command, index, descriptor)
  }

  if (command[index + 1] === '&') {
    const target = command[index + 2]
    const allowed = (descriptor === '2' && target === '1') || (descriptor === '1' && target === '2')
    if (!allowed || !isRedirectionBoundary(command[index + 3])) {
      return rejectRedirection(command, index, descriptor)
    }
    return { ok: true, endIndex: index + 2 }
  }

  let targetStart = index + 1
  while (command[targetStart] === ' ' || command[targetStart] === '\t') targetStart++
  const target = '/dev/null'
  if (!command.startsWith(target, targetStart)
    || !isRedirectionBoundary(command[targetStart + target.length])) {
    return rejectRedirection(command, index, descriptor)
  }
  return { ok: true, endIndex: targetStart + target.length - 1 }
}

type ExpansionResult =
  | { readonly ok: true; readonly text: string; readonly nextIndex: number }
  | { readonly ok: false }

/**
 * Parse a `$...` expansion starting at `index` (the `$`).
 * Allows `$VAR`, `${VAR}` and positional/special params; rejects command
 * substitution `$(...)` (and arithmetic `$((...))`), keeping the read-only
 * analyzer sound.
 */
function parseDollarExpansion(command: string, index: number): ExpansionResult {
  const next = command[index + 1]
  if (next === '(') return { ok: false }
  if (next === '{') {
    const end = command.indexOf('}', index + 2)
    if (end < 0) return { ok: false }
    const name = command.slice(index + 2, end)
    if (!/^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[?@*#$!-])$/.test(name)) return { ok: false }
    return { ok: true, text: command.slice(index, end + 1), nextIndex: end }
  }
  const named = /^[A-Za-z_][A-Za-z0-9_]*/.exec(command.slice(index + 1))
  if (named) return { ok: true, text: `$${named[0]}`, nextIndex: index + named[0].length }
  if (next !== undefined && /[0-9?@*#$!-]/.test(next)) {
    return { ok: true, text: `$${next}`, nextIndex: index + 1 }
  }
  return { ok: false }
}

/** Tokenize a shell command list, keeping separators and validating redirections. */
function tokenize(command: string): TokenizeResult {
  const tokens: Token[] = []
  let word = ''
  let wordStarted = false
  let quote: Quote | undefined

  const pushWord = () => {
    if (!wordStarted) return
    tokens.push({ kind: 'word', value: word })
    word = ''
    wordStarted = false
  }

  const pushOp = (value: Separator) => {
    pushWord()
    tokens.push({ kind: 'op', value })
  }

  for (let index = 0; index < command.length; index++) {
    const char = command[index]!

    if (quote === "'") {
      if (char === "'") quote = undefined
      else word += char
      continue
    }

    if (quote === '"') {
      if (char === '"') {
        quote = undefined
        continue
      }
      if (char === '`') return { ok: false, reason: '检测到反引号命令替换；任务开始前不予放行。' }
      if (char === '$') {
        const expansion = parseDollarExpansion(command, index)
        if (!expansion.ok) return { ok: false, reason: '检测到命令替换或无法静态判定的变量展开；任务开始前仅允许 $VAR/${VAR} 形式的参数展开。' }
        word += expansion.text
        wordStarted = true
        index = expansion.nextIndex
        continue
      }
      if (char === '\\') {
        const next = command[index + 1]
        if (next === undefined || next === '\n' || next === '\r') return { ok: false }
        if (next === '"' || next === '\\' || next === '$' || next === '`') {
          word += next
          index++
        } else {
          word += char
        }
        continue
      }
      word += char
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      wordStarted = true
      continue
    }
    if (char === ' ' || char === '\t') {
      pushWord()
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && command[index + 1] === '\n') index++
      pushOp(';')
      continue
    }
    if (char === ';') {
      pushOp(';')
      continue
    }
    if (char === '&') {
      if (command[index + 1] === '&') {
        pushOp('&&')
        index++
        continue
      }
      return { ok: false }
    }
    if (char === '|') {
      if (command[index + 1] === '|') {
        pushOp('||')
        index++
        continue
      }
      pushOp('|')
      continue
    }
    if (char === '\\') {
      const next = command[index + 1]
      if (next === undefined || next === '\n' || next === '\r') return { ok: false }
      word += next
      wordStarted = true
      index++
      continue
    }
    if (char === '>' || char === '<') {
      let descriptor = '1'
      if (/^\d+$/.test(word)) {
        descriptor = word
        word = ''
        wordStarted = false
      } else {
        pushWord()
      }
      if (descriptor !== '1' && descriptor !== '2') {
        return rejectRedirection(command, index, descriptor)
      }
      const redirection = parseSafeRedirection(command, index, descriptor)
      if (!redirection.ok) return redirection
      index = redirection.endIndex
      continue
    }
    if (char === '`') return { ok: false, reason: '检测到反引号命令替换；任务开始前不予放行。' }
    if (char === '$') {
      const expansion = parseDollarExpansion(command, index)
      if (!expansion.ok) return { ok: false, reason: '检测到命令替换或无法静态判定的变量展开；任务开始前仅允许 $VAR/${VAR} 形式的参数展开。' }
      word += expansion.text
      wordStarted = true
      index = expansion.nextIndex
      continue
    }
    if (char === '(' || char === ')' || char === '{' || char === '}') {
      return { ok: false, reason: '检测到子 shell 或命令分组；任务开始前不予放行。' }
    }
    word += char
    wordStarted = true
  }

  if (quote) return { ok: false }
  pushWord()
  return { ok: true, tokens }
}

/** Split tokens into simple commands. Returns undefined on malformed command lists. */
function splitCommands(tokens: Token[]): string[][] | undefined {
  const commands: string[][] = []
  let current: string[] = []
  let lastOp: Separator | undefined

  for (const token of tokens) {
    if (token.kind === 'word') {
      current.push(token.value)
      continue
    }
    if (current.length === 0) return undefined
    commands.push(current)
    current = []
    lastOp = token.value
  }

  if (current.length > 0) {
    commands.push(current)
  } else if (lastOp !== ';') {
    // Trailing `|`, `&&`, `||` has a missing right operand.
    return undefined
  }

  if (commands.length === 0) return undefined
  return commands
}

function commandName(value: string): string {
  const slash = value.lastIndexOf('/')
  return slash >= 0 ? value.slice(slash + 1) : value
}

function isReadOnlyGitDiff(words: string[]): boolean {
  if (words[0] !== 'git' || words[1] !== 'diff') return false
  let parsingOptions = true
  for (const argument of words.slice(2)) {
    if (parsingOptions && argument === '--') {
      parsingOptions = false
      continue
    }
    if (!parsingOptions) continue
    if (argument === '--output' || argument.startsWith('--output=')) return false
    if (argument === '--ext-diff' || argument === '--textconv') return false
  }
  return true
}

function hasGitWriteOutput(args: string[]): boolean {
  return args.some((argument) =>
    argument === '--output'
    || argument.startsWith('--output=')
    || argument === '--ext-diff'
    || argument === '--textconv')
}

function isReadOnlyGitBranch(args: string[]): boolean {
  if (args.length === 0) return true
  for (const argument of args) {
    if (argument.startsWith('--')) {
      if (!GIT_BRANCH_LIST_FLAGS.has(argument.split('=')[0]!)) return false
      continue
    }
    if (argument.startsWith('-')) {
      if (!/^-[arvl]+$/.test(argument)) return false
      continue
    }
    return false
  }
  return true
}

function isReadOnlyGitTag(args: string[]): boolean {
  if (args.length === 0) return true
  for (const argument of args) {
    if (argument.startsWith('--')) {
      if (!GIT_TAG_LIST_FLAGS.has(argument.split('=')[0]!)) return false
      continue
    }
    if (argument.startsWith('-')) {
      if (!/^-[ln]+$/.test(argument)) return false
      continue
    }
    return false
  }
  return true
}

function isReadOnlyGitRemote(args: string[]): boolean {
  if (args.length === 0) return true
  return args.length === 1 && (args[0] === '-v' || args[0] === '--verbose')
}

function isReadOnlyGitConfig(args: string[]): boolean {
  if (args.length === 0) return false
  if (args.some((argument) => GIT_CONFIG_WRITE_FLAGS.has(argument))) return false
  return args.some((argument) =>
    argument === '--get'
    || argument.startsWith('--get')
    || argument === '--list'
    || argument === '-l')
}

function isReadOnlyGitStash(args: string[]): boolean {
  const sub = args[0]
  if (sub !== 'list' && sub !== 'show') return false
  return !hasGitWriteOutput(args.slice(1))
}

function isReadOnlyGit(args: string[]): boolean {
  if (args.length === 0) return true
  const sub = args[0]!
  // Global options like `-c`, `-C`, `--git-dir` can change behavior; deny them.
  if (sub.startsWith('-')) return false
  const rest = args.slice(1)
  if (sub === 'diff') return isReadOnlyGitDiff(['git', 'diff', ...rest])
  if (sub === 'branch') return isReadOnlyGitBranch(rest)
  if (sub === 'tag') return isReadOnlyGitTag(rest)
  if (sub === 'remote') return isReadOnlyGitRemote(rest)
  if (sub === 'config') return isReadOnlyGitConfig(rest)
  if (sub === 'stash') return isReadOnlyGitStash(rest)
  if (sub === 'worktree') {
    return rest.length === 0
      || (rest.length === 1 && (rest[0] === 'list' || rest[0] === '-v' || rest[0] === '--verbose'))
  }
  if (GIT_READ_SUBCOMMANDS.has(sub)) return !hasGitWriteOutput(rest)
  return false
}

function isReadOnlySed(args: string[]): boolean {
  let quiet = false
  const scripts: string[] = []
  for (const argument of args) {
    if (argument === '-i' || argument.startsWith('--in-place') || (argument.startsWith('-i') && !argument.startsWith('--'))) {
      return false
    }
    if (argument === '-e' || argument === '--expression') return false
    if (argument === '-n' || argument === '--quiet' || argument === '--silent'
      || (/^-[a-zA-Z]*n[a-zA-Z]*$/.test(argument) && !argument.startsWith('--'))) {
      quiet = true
      continue
    }
    if (argument.startsWith('-')) continue
    scripts.push(argument)
  }
  // Only `sed -n` with a pure print script is safe; anything else may write or exec.
  // The first non-option argument is the script; any further ones are input files (read-only).
  if (!quiet || scripts.length < 1) return false
  return /^\s*(\d+|\$)?(,\s*(\d+|\$))?\s*p\s*$/.test(scripts[0]!)
}

function isReadOnlySimpleCommand(words: string[]): boolean {
  const name = commandName(words[0]!)
  const args = words.slice(1)
  switch (name) {
    case 'pwd':
    case 'whoami':
    case 'id':
    case 'hostname':
    case 'uname':
    case 'date':
    case 'echo':
    case 'printf':
    case 'true':
    case 'false':
    case 'basename':
    case 'dirname':
    case 'realpath':
    case 'readlink':
    case 'which':
    case 'type':
    case 'file':
    case 'stat':
    case 'du':
    case 'df':
    case 'ls':
    case 'cat':
    case 'head':
    case 'tail':
    case 'wc':
    case 'grep':
    case 'egrep':
    case 'fgrep':
    case 'rg':
    case 'tr':
    case 'cut':
    case 'nl':
    case 'column':
    case 'fold':
    case 'paste':
    case 'comm':
    case 'join':
    case 'diff':
    case 'jq':
    case 'cd':
      return true
    case 'tree':
      return !args.some((argument) => argument === '-o' || argument === '--output' || argument.startsWith('--output='))
    case 'sort':
      return !args.some((argument) => argument === '-o' || argument.startsWith('-o') || argument.startsWith('--output'))
    case 'uniq':
      return args.filter((argument) => !argument.startsWith('-')).length <= 1
    case 'find':
      return !args.some((argument) => FIND_WRITE_PRIMARIES.has(argument) || argument.startsWith('-fprint'))
    case 'sed':
      return isReadOnlySed(args)
    case 'git':
      return isReadOnlyGit(args)
    default:
      return false
  }
}

/** Validate a `for NAME in LIST` header. Returns an error reason or undefined. */
function forHeaderError(words: string[]): string | undefined {
  const name = words[1]
  if (name === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return 'for 循环缺少合法的循环变量名'
  }
  if (words[2] !== 'in') return '仅支持 `for NAME in 列表; do ...; done` 形式的循环'
  return undefined
}

/**
 * Validate a parsed command list as read-only, understanding `for ...; do
 * <read-only commands>; done` loops whose body may reference `$VAR`.
 * Returns an error reason on failure, or undefined when the whole list is safe.
 */
function checkCommandList(commands: string[][]): string | undefined {
  let index = 0

  const simpleCommandError = (words: string[]): string | undefined =>
    isReadOnlySimpleCommand(words) ? undefined : `命令 \`${words.join(' ')}\` 不在只读白名单，无法在任务开始前执行`

  const checkFor = (): string | undefined => {
    const header = commands[index]!
    const headerProblem = forHeaderError(header)
    if (headerProblem) return headerProblem
    index++
    if (index >= commands.length) return 'for 循环缺少 do 块'
    const first = commands[index]!
    if (first[0] !== 'do') return 'for 循环缺少 do 关键字'
    if (first.length > 1) {
      const bodyError = simpleCommandError(first.slice(1))
      if (bodyError) return bodyError
    }
    index++
    while (index < commands.length) {
      const words = commands[index]!
      const head = words[0]!
      if (head === 'done') {
        if (words.length > 1) return 'done 关键字后存在多余内容'
        index++
        return undefined
      }
      if (head === 'for') {
        const nestedError = checkFor()
        if (nestedError) return nestedError
        continue
      }
      if (head === 'do') return '意外的控制关键字 `do`'
      const bodyError = simpleCommandError(words)
      if (bodyError) return bodyError
      index++
    }
    return 'for 循环缺少 done 关键字'
  }

  while (index < commands.length) {
    const words = commands[index]!
    const head = words[0]!
    if (head === 'for') {
      const loopError = checkFor()
      if (loopError) return loopError
      continue
    }
    if (head === 'do' || head === 'done') return `意外的控制关键字 \`${head}\``
    const commandError = simpleCommandError(words)
    if (commandError) return commandError
    index++
  }
  return undefined
}

export function analyzeReadOnlyBashExecution(args: unknown): { allowed: boolean; reason?: string } {
  if (typeof args !== 'object' || args === null) return { allowed: false }
  const command = (args as { command?: unknown }).command
  if (typeof command !== 'string') return { allowed: false }
  const parsed = tokenize(command)
  if (!parsed.ok) return { allowed: false, ...(parsed.reason ? { reason: parsed.reason } : {}) }
  const commands = splitCommands(parsed.tokens)
  if (!commands) return { allowed: false, reason: '无法解析命令列表（可能存在不完整的管道或连接符）。' }
  const reason = checkCommandList(commands)
  return reason === undefined ? { allowed: true } : { allowed: false, reason }
}

export function isReadOnlyBashExecution(args: unknown): boolean {
  return analyzeReadOnlyBashExecution(args).allowed
}
