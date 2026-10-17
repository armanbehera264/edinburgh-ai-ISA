/** A tiny 16-bit expression language: the reference "normal computer" answer
 * that Claude's reversible code is checked against.
 *
 *   z = x*2 + y        x ^ (y + 7)       (x + y) * 5 - 3
 *
 * Variables: x, y. Operators by precedence (low → high):
 *   |   ^   &   << >>   + -   *   unary - ~
 * All arithmetic wraps modulo 2^16.
 */

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: 'x' | 'y' }
  | { t: 'un'; op: '-' | '~'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node };

export interface ParsedExpr {
  /** Canonical text used as the cache key and shown in the UI. */
  text: string;
  evaluate(x: number, y: number): number;
}

const LEVELS: string[][] = [['|'], ['^'], ['&'], ['<<', '>>'], ['+', '-'], ['*']];

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  const re = /\s*(0x[0-9a-fA-F]+|\d+|<<|>>|[xyXY]|[-+*^&|~()])/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`Unexpected "${src.slice(i).trim()[0]}"`);
    tokens.push(m[1].toLowerCase());
    i = re.lastIndex;
  }
  return tokens;
}

export function parseExpression(input: string): ParsedExpr {
  // Accept "z = …" or just "…".
  const body = input.replace(/^\s*z\s*=/i, '');
  const tokens = tokenize(body);
  if (tokens.length === 0) throw new Error('Type a formula using x and y, like x*2 + y');
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  const parseLevel = (level: number): Node => {
    if (level === LEVELS.length) return parseUnary();
    let left = parseLevel(level + 1);
    while (peek() !== undefined && LEVELS[level].includes(peek())) {
      const op = take();
      left = { t: 'bin', op, a: left, b: parseLevel(level + 1) };
    }
    return left;
  };
  const parseUnary = (): Node => {
    const tok = peek();
    if (tok === '-' || tok === '~') {
      take();
      return { t: 'un', op: tok, a: parseUnary() };
    }
    return parseAtom();
  };
  const parseAtom = (): Node => {
    const tok = take();
    if (tok === undefined) throw new Error('The formula ends too early');
    if (tok === '(') {
      const inner = parseLevel(0);
      if (take() !== ')') throw new Error('Missing a closing bracket');
      return inner;
    }
    if (tok === 'x' || tok === 'y') return { t: 'var', name: tok };
    if (/^(0x[0-9a-f]+|\d+)$/.test(tok)) return { t: 'num', v: Number(tok) & 0xffff };
    throw new Error(`Unexpected "${tok}"`);
  };

  const tree = parseLevel(0);
  if (pos !== tokens.length) throw new Error(`Unexpected "${tokens[pos]}"`);

  const ev = (n: Node, x: number, y: number): number => {
    switch (n.t) {
      case 'num': return n.v;
      case 'var': return n.name === 'x' ? x : y;
      case 'un': {
        const a = ev(n.a, x, y);
        return (n.op === '-' ? -a : ~a) & 0xffff;
      }
      case 'bin': {
        const a = ev(n.a, x, y);
        const b = ev(n.b, x, y);
        switch (n.op) {
          case '+': return (a + b) & 0xffff;
          case '-': return (a - b) & 0xffff;
          case '*': return Number((BigInt(a) * BigInt(b)) & 0xffffn);
          case '&': return a & b;
          case '|': return a | b;
          case '^': return a ^ b;
          case '<<': return b >= 16 ? 0 : (a << b) & 0xffff;
          case '>>': return b >= 16 ? 0 : a >>> b;
          default: throw new Error(`Unknown operator ${n.op}`);
        }
      }
    }
  };

  return {
    text: 'z = ' + tokens.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')'),
    evaluate: (x, y) => ev(tree, x & 0xffff, y & 0xffff),
  };
}
