/**
 * A formula a column's values are worked out from, and how it is written and read back.
 *
 * The formula sent to the server is a tree and never SQL: the server builds the expression from
 * it, naming operators and functions from lists of the ones it allows, so nothing typed here
 * reaches a statement as it was typed. What somebody types is parsed into that tree here, and a
 * tree is written back out as text to be shown and edited. Anything the parser does not
 * understand is a problem said plainly rather than something passed along to be refused later.
 */

/** A column of the table, by the attnum Postgres holds it at */
export interface FormulaColumn {
  column: number;
}

/** A value written into the formula */
export interface FormulaValue {
  value: number | string | boolean | null;
}

/** An operator applied to formulas */
export interface FormulaOperation {
  op: string;
  of: Formula[];
}

/** A function applied to formulas */
export interface FormulaCall {
  fn: string;
  of: Formula[];
}

/** A choice between two formulas */
export interface FormulaChoice {
  if: Formula;
  then: Formula;
  else?: Formula;
}

export type Formula =
  | FormulaColumn
  | FormulaValue
  | FormulaOperation
  | FormulaCall
  | FormulaChoice;

/**
 * The functions a formula can use, which are Postgres's own and immutable.
 *
 * The same list the server holds in msar.formula_functions, so that a formula refused there is
 * one that was never offered here. concat and to_char are not among them: they read how the
 * session is set up, so Postgres will not work a stored value out from them. Text is joined
 * with || instead.
 */
export const formulaFunctions = [
  'upper',
  'lower',
  'initcap',
  'btrim',
  'ltrim',
  'rtrim',
  'lpad',
  'rpad',
  'replace',
  'translate',
  'substr',
  'left',
  'right',
  'reverse',
  'repeat',
  'split_part',
  'starts_with',
  'strpos',
  'length',
  'char_length',
  'md5',
  'ascii',
  'chr',
  'abs',
  'ceil',
  'ceiling',
  'floor',
  'round',
  'trunc',
  'sign',
  'mod',
  'div',
  'power',
  'sqrt',
  'exp',
  'ln',
  'log',
  'width_bucket',
  'date_part',
  // The function-shaped pieces of SQL's own grammar, which msar.formula_forms holds
  'coalesce',
  'nullif',
  'greatest',
  'least',
] as const;

export interface FormulaTableColumn {
  id: number;
  name: string;
}

/** What went wrong with a formula somebody typed, as something to look a message up by */
export type FormulaProblem =
  | { code: 'formula_is_empty' }
  | { code: 'formula_has_no_such_column'; name: string }
  | { code: 'formula_has_no_such_function'; name: string }
  | { code: 'formula_quote_unclosed' }
  | { code: 'formula_bracket_unclosed' }
  | { code: 'formula_paren_unclosed' }
  | { code: 'formula_wants_something_here' }
  | { code: 'formula_does_not_understand'; text: string };

export type FormulaReading =
  | { ok: true; formula: Formula }
  | { ok: false; problem: FormulaProblem };

interface Token {
  kind: 'number' | 'string' | 'name' | 'symbol';
  text: string;
  /** For a string, the value it stands for once its quoting is taken off */
  value?: string;
}

/** An Error carrying what was wrong, so that a reading can be given up on from anywhere inside */
interface FormulaTrouble extends Error {
  problem: FormulaProblem;
}

function trouble(problem: FormulaProblem): FormulaTrouble {
  const error = new Error(problem.code) as FormulaTrouble;
  error.problem = problem;
  return error;
}

function isTrouble(thrown: unknown): thrown is FormulaTrouble {
  return thrown instanceof Error && 'problem' in thrown;
}

/** The operators, longest first, so that <= is never read as < followed by = */
const symbols = [
  '<>',
  '!=',
  '<=',
  '>=',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '=',
  '<',
  '>',
  '(',
  ')',
  ',',
];

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === "'") {
      // A quote inside a value is written twice over, as SQL writes it.
      let value = '';
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            value += "'";
            j += 2;
          } else {
            closed = true;
            j += 1;
            break;
          }
        } else {
          value += text[j];
          j += 1;
        }
      }
      if (!closed) throw trouble({ code: 'formula_quote_unclosed' });
      tokens.push({ kind: 'string', text: text.slice(i, j), value });
      i = j;
    } else if (c === '[') {
      // A column whose name has something in it that would not read as a name on its own.
      const end = text.indexOf(']', i + 1);
      if (end === -1) {
        throw trouble({ code: 'formula_bracket_unclosed' });
      }
      tokens.push({ kind: 'name', text: text.slice(i + 1, end) });
      i = end + 1;
    } else if (
      /[0-9]/.test(c) ||
      (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))
    ) {
      const rest = text.slice(i);
      const match = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(rest);
      // The regex always matches here, the character we are on being a digit or a leading point.
      const matched = match ? match[0] : c;
      tokens.push({ kind: 'number', text: matched });
      i += matched.length;
    } else if (/[A-Za-z_À-￿]/.test(c)) {
      const rest = text.slice(i);
      const match = /^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*/.exec(rest);
      const matched = match ? match[0] : c;
      tokens.push({ kind: 'name', text: matched });
      i += matched.length;
    } else {
      const at = i;
      const symbol = symbols.find((s) => text.startsWith(s, at));
      if (!symbol) {
        throw trouble({
          code: 'formula_does_not_understand',
          text: c,
        });
      }
      tokens.push({ kind: 'symbol', text: symbol });
      i += symbol.length;
    }
  }
  return tokens;
}

const keywords = ['and', 'or', 'not', 'is', 'null', 'true', 'false', 'if'];

class Reader {
  private tokens: Token[];

  private at = 0;

  private columnsByName: Map<string, number>;

  constructor(tokens: Token[], columns: FormulaTableColumn[]) {
    this.tokens = tokens;
    // Matched as written first, and then without regard to case, so that a formula reads the way
    // somebody would write it without having to match a column's capitals exactly.
    this.columnsByName = new Map();
    columns.forEach((c) => this.columnsByName.set(c.name.toLowerCase(), c.id));
    columns.forEach((c) => this.columnsByName.set(c.name, c.id));
  }

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private isWord(word: string): boolean {
    const token = this.peek();
    return (
      token !== undefined &&
      token.kind === 'name' &&
      token.text.toLowerCase() === word
    );
  }

  private takeWord(word: string): boolean {
    if (!this.isWord(word)) return false;
    this.at += 1;
    return true;
  }

  private takeSymbol(...options: string[]): string | undefined {
    const token = this.peek();
    if (token?.kind === 'symbol' && options.includes(token.text)) {
      this.at += 1;
      return token.text;
    }
    return undefined;
  }

  private expectSymbol(symbol: string) {
    if (this.takeSymbol(symbol) === undefined) {
      throw trouble(
        symbol === ')'
          ? { code: 'formula_paren_unclosed' }
          : { code: 'formula_wants_something_here' },
      );
    }
  }

  read(): Formula {
    if (this.tokens.length === 0) {
      throw trouble({ code: 'formula_is_empty' });
    }
    const formula = this.readOr();
    const left = this.peek();
    if (left) {
      throw trouble({
        code: 'formula_does_not_understand',
        text: left.text,
      });
    }
    return formula;
  }

  private readOr(): Formula {
    const of = [this.readAnd()];
    while (this.takeWord('or')) of.push(this.readAnd());
    return of.length === 1 ? of[0] : { op: 'OR', of };
  }

  private readAnd(): Formula {
    const of = [this.readNot()];
    while (this.takeWord('and')) of.push(this.readNot());
    return of.length === 1 ? of[0] : { op: 'AND', of };
  }

  private readNot(): Formula {
    if (this.takeWord('not')) return { op: 'NOT', of: [this.readNot()] };
    return this.readComparison();
  }

  private readComparison(): Formula {
    const left = this.readConcat();
    const symbol = this.takeSymbol('=', '<>', '!=', '<', '<=', '>', '>=');
    if (symbol) {
      // != is how it is often typed and <> is how SQL spells it.
      const op = symbol === '!=' ? '<>' : symbol;
      return { op, of: [left, this.readConcat()] };
    }
    if (this.takeWord('is')) {
      const negated = this.takeWord('not');
      if (!this.takeWord('null')) {
        throw trouble({ code: 'formula_wants_something_here' });
      }
      return { op: negated ? 'IS NOT NULL' : 'IS NULL', of: [left] };
    }
    return left;
  }

  private readConcat(): Formula {
    const of = [this.readAdditive()];
    while (this.takeSymbol('||')) of.push(this.readAdditive());
    return of.length === 1 ? of[0] : { op: '||', of };
  }

  private readAdditive(): Formula {
    let left = this.readMultiplicative();
    for (;;) {
      const symbol = this.takeSymbol('+', '-');
      if (!symbol) return left;
      left = { op: symbol, of: [left, this.readMultiplicative()] };
    }
  }

  private readMultiplicative(): Formula {
    let left = this.readPower();
    for (;;) {
      const symbol = this.takeSymbol('*', '/', '%');
      if (!symbol) return left;
      left = { op: symbol, of: [left, this.readPower()] };
    }
  }

  private readPower(): Formula {
    const left = this.readUnary();
    if (this.takeSymbol('^')) {
      // To the right, so that 2 ^ 3 ^ 2 is 2 ^ (3 ^ 2), as Postgres reads it.
      return { op: '^', of: [left, this.readPower()] };
    }
    return left;
  }

  private readUnary(): Formula {
    if (this.takeSymbol('-')) return { op: '-', of: [this.readUnary()] };
    if (this.takeSymbol('+')) return this.readUnary();
    return this.readPrimary();
  }

  private readPrimary(): Formula {
    const token = this.peek();
    if (!token) throw trouble({ code: 'formula_wants_something_here' });

    if (this.takeSymbol('(') !== undefined) {
      const inner = this.readOr();
      this.expectSymbol(')');
      return inner;
    }

    if (token.kind === 'number') {
      this.at += 1;
      return { value: Number(token.text) };
    }

    if (token.kind === 'string') {
      this.at += 1;
      return { value: token.value ?? '' };
    }

    if (token.kind === 'name') {
      const word = token.text.toLowerCase();
      if (word === 'true' || word === 'false') {
        this.at += 1;
        return { value: word === 'true' };
      }
      if (word === 'null') {
        this.at += 1;
        return { value: null };
      }
      if (word === 'if') {
        this.at += 1;
        return this.readChoice();
      }
      // A name followed by a bracket is something being applied; anything else is a column.
      const followedByCall =
        this.tokens[this.at + 1]?.kind === 'symbol' &&
        this.tokens[this.at + 1]?.text === '(';
      if (followedByCall && !token.text.includes(' ')) {
        this.at += 1;
        return this.readCall(word);
      }
      return this.readColumn();
    }

    throw trouble({
      code: 'formula_does_not_understand',
      text: token.text,
    });
  }

  private readChoice(): Formula {
    this.expectSymbol('(');
    const condition = this.readOr();
    this.expectSymbol(',');
    const whenTrue = this.readOr();
    const choice: FormulaChoice = { if: condition, then: whenTrue };
    if (this.takeSymbol(',')) choice.else = this.readOr();
    this.expectSymbol(')');
    return choice;
  }

  private readCall(name: string): Formula {
    if (!(formulaFunctions as readonly string[]).includes(name)) {
      throw trouble({
        code: 'formula_has_no_such_function',
        name,
      });
    }
    this.expectSymbol('(');
    const of: Formula[] = [];
    if (this.takeSymbol(')') === undefined) {
      of.push(this.readOr());
      while (this.takeSymbol(',')) of.push(this.readOr());
      this.expectSymbol(')');
    }
    if (of.length === 0) {
      throw trouble({ code: 'formula_wants_something_here' });
    }
    return { fn: name, of };
  }

  private readColumn(): Formula {
    const token = this.peek();
    // Only called with a name in hand.
    const name = token ? token.text : '';
    const id =
      this.columnsByName.get(name) ??
      this.columnsByName.get(name.toLowerCase());
    if (id === undefined) {
      throw trouble({ code: 'formula_has_no_such_column', name });
    }
    this.at += 1;
    return { column: id };
  }
}

/**
 * Read a formula somebody has typed.
 *
 * Column names are matched as written and then without regard to case. A name with a space or
 * anything else in it that would not read as a name on its own is written in square brackets.
 */
export function parseFormula(
  text: string,
  columns: FormulaTableColumn[],
): FormulaReading {
  try {
    if (text.trim() === '') {
      return { ok: false, problem: { code: 'formula_is_empty' } };
    }
    const formula = new Reader(tokenize(text), columns).read();
    return { ok: true, formula };
  } catch (e) {
    if (isTrouble(e)) return { ok: false, problem: e.problem };
    throw e;
  }
}

export function isFormulaColumn(formula: Formula): formula is FormulaColumn {
  return 'column' in formula;
}

export function isFormulaValue(formula: Formula): formula is FormulaValue {
  return 'value' in formula;
}

export function isFormulaOperation(
  formula: Formula,
): formula is FormulaOperation {
  return 'op' in formula;
}

export function isFormulaCall(formula: Formula): formula is FormulaCall {
  return 'fn' in formula;
}

export function isFormulaChoice(formula: Formula): formula is FormulaChoice {
  return 'if' in formula;
}

/** How tightly each operator holds, so that only the brackets that are needed are written */
const holding: Record<string, number> = {
  OR: 1,
  AND: 2,
  NOT: 3,
  '=': 4,
  '<>': 4,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  'IS NULL': 4,
  'IS NOT NULL': 4,
  '||': 5,
  '+': 6,
  '-': 6,
  '*': 7,
  '/': 7,
  '%': 7,
  '^': 8,
};

const unaryMinusHolding = 9;
const nothingToBracket = 10;

function writeValue(value: FormulaValue['value']): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

function writeColumnName(name: string): string {
  // Bracketed unless the name would read as a name on its own, and a word the grammar uses for
  // something else is bracketed too so that a column called "if" or "null" is still readable.
  const readsAsAName = /^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*$/.test(name);
  if (readsAsAName && !keywords.includes(name.toLowerCase())) return name;
  return `[${name}]`;
}

function write(
  formula: Formula,
  names: Map<number, string>,
): { text: string; holds: number } {
  if (isFormulaColumn(formula)) {
    const name = names.get(formula.column);
    return {
      // A column that is no longer there is said so rather than written as something readable.
      text: name === undefined ? `[?${formula.column}]` : writeColumnName(name),
      holds: nothingToBracket,
    };
  }
  if (isFormulaValue(formula)) {
    return { text: writeValue(formula.value), holds: nothingToBracket };
  }
  if (isFormulaChoice(formula)) {
    const parts = [
      write(formula.if, names).text,
      write(formula.then, names).text,
    ];
    if (formula.else !== undefined) {
      parts.push(write(formula.else, names).text);
    }
    return { text: `if(${parts.join(', ')})`, holds: nothingToBracket };
  }
  if (isFormulaCall(formula)) {
    const parts = formula.of.map((f) => write(f, names).text);
    return {
      text: `${formula.fn}(${parts.join(', ')})`,
      holds: nothingToBracket,
    };
  }
  if (isFormulaOperation(formula)) {
    const holds = holding[formula.op.toUpperCase()] ?? 0;
    const bracketed = (f: Formula, need: number) => {
      const written = write(f, names);
      return written.holds < need ? `(${written.text})` : written.text;
    };
    if (formula.op === 'NOT') {
      return { text: `not ${bracketed(formula.of[0], holds)}`, holds };
    }
    if (formula.op === 'IS NULL' || formula.op === 'IS NOT NULL') {
      const word = formula.op === 'IS NULL' ? 'is null' : 'is not null';
      return { text: `${bracketed(formula.of[0], holds)} ${word}`, holds };
    }
    if (formula.of.length === 1) {
      return {
        text: `-${bracketed(formula.of[0], unaryMinusHolding)}`,
        holds: unaryMinusHolding,
      };
    }
    const word = formula.op.toLowerCase();
    // One more than this operator holds on the right, so that a - (b - c) keeps its brackets.
    const parts = formula.of.map((f, index) =>
      bracketed(f, index === 0 ? holds : holds + 1),
    );
    return { text: parts.join(` ${word} `), holds };
  }
  return { text: '', holds: nothingToBracket };
}

/**
 * Write a formula out as text, to be shown and edited.
 *
 * The brackets written are the ones that are needed, so that what comes out reads like what
 * somebody would have typed rather than like a parse tree.
 */
export function unparseFormula(
  formula: Formula,
  columns: FormulaTableColumn[],
): string {
  const names = new Map(columns.map((c) => [c.id, c.name]));
  return write(formula, names).text;
}
