/**
 * TinyLang Parser
 * 
 * Converts a stream of tokens into an Abstract Syntax Tree (AST).
 * Uses recursive descent for statements and Pratt parsing for expressions.
 * 
 * Operator Precedence (low to high):
 * 1. Assignment (=, +=, -=, *=, /=)
 * 2. Ternary (?:) - right-associative
 * 3. Pipe (|>)
 * 4. Nullish coalescing (??)
 * 5. Logical OR (or)
 * 6. Logical AND (and)
 * 7. Equality (==, !=)
 * 8. Comparison (<, >, <=, >=)
 * 9. Range (..)
 * 10. Addition (+, -)
 * 11. Multiplication (*, /, %)
 * 12. Power (**)
 * 13. Unary (not, -)
 * 14. Call, Member Access, Index
 */

import { Token, TokenType, CommentToken } from '../types/tokens';
import { Lexer } from '../lexer';
import {
  Program,
  Statement,
  Expression,
  BaseNode,
  Comment,
  CommentAnchor,
  VariableDeclaration,
  DestructuringDeclaration,
  FunctionDeclaration,
  ClassDeclaration,
  EnumDeclaration,
  ReturnStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  BreakStatement,
  ContinueStatement,
  ExpressionStatement,
  PrintStatement,
  ImportStatement,
  MatchStatement,
  MatchCase,
  Parameter,
  NumberLiteral,
  StringLiteral,
  InterpolatedString,
  InterpolatedPart,
  BooleanLiteral,
  NullLiteral,
  ArrayLiteral,
  ObjectLiteral,
  ObjectProperty,
  Identifier,
  BinaryExpression,
  UnaryExpression,
  LogicalExpression,
  AssignmentExpression,
  CallExpression,
  MemberExpression,
  IndexExpression,
  ArrowFunction,
  RangeExpression,
  ThisExpression,
  NewExpression,
  FunctionExpression,
  TestDeclaration,
  TryCatchStatement,
  ThrowStatement,
  SpreadExpression,
  PipeExpression,
  PipeMethodExpression,
  OptionalMemberExpression,
  OptionalIndexExpression,
  NullishCoalesceExpression,
  TernaryExpression,
} from '../types/ast';
import { ParseError } from './errors';
import { splitInterpolatedString } from './fstring';

/** Nothing precedes the first construct in the file, so nothing can be blank. */
const NO_LAYOUT_LINE = 0;

/**
 * A braced statement list, plus the comments found at its end that had no
 * statement to attach to.
 *
 * Returning the two together is what makes it impossible to forget the second:
 * an empty region is the only place a comment has nowhere to go, and the node
 * that owns the region is built by parseBlock's caller, not by parseBlock.
 */
interface Block {
  statements: Statement[];
  dangling: Comment[];
}

/** A relocated comment, to be printed on a line of its own. */
function ownLine(comment: Comment): Comment {
  return { ...comment, ownLine: true, blankBefore: false };
}

/** A relocated comment, to be printed beside the code it now follows. */
function sameLine(comment: Comment): Comment {
  return { ...comment, ownLine: false, blankBefore: false };
}

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private errors: ParseError[] = [];

  /**
   * Comments to attach, in source order, and how far through them we are.
   *
   * Empty unless the caller supplied them. Attachment is opt-in because the
   * comment fields are pure layout: the interpreter, compiler, VM, linter and
   * debugger have no use for them, and an AST without them is exactly the AST
   * those tools have always been given.
   */
  private comments: CommentToken[] = [];
  private commentIndex: number = 0;
  private readonly trackComments: boolean;

  /**
   * The line the last consumed token or comment ended on.
   *
   * Blank lines are not tokens, so this is how they are detected: if the next
   * construct starts two or more lines below this one, at least one line between
   * them held nothing but whitespace.
   */
  private layoutLine: number = NO_LAYOUT_LINE;

  constructor(tokens: Token[], comments?: CommentToken[]) {
    this.tokens = tokens;
    this.comments = comments ?? [];
    this.trackComments = comments !== undefined;
  }

  /**
   * Parse the token stream into a Program AST node
   */
  parse(): Program {
    const body: Statement[] = [];
    this.startLayout();
    this.skipNewlines();

    while (!this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) {
          body.push(stmt);
        }
      } catch (error) {
        if (error instanceof ParseError) {
          this.errors.push(error);
          this.synchronize();
        } else {
          throw error;
        }
      }
      this.skipNewlines();
    }

    if (this.errors.length > 0) {
      throw this.errors[0];
    }

    const program: Program = {
      type: 'Program',
      body,
      position: { line: 1, column: 1, offset: 0 },
    };

    // Comments after the last top-level statement. The EOF token's offset is not
    // the end of the source (it is derived from the last token's start), so the
    // boundary is unbounded here rather than taken from a token.
    this.setDangling(program, 'body', this.claimRegionEnd(body, Infinity));
    return program;
  }

  // ============ Comment attachment ============

  /**
   * Seed the blank-line cursor with the first construct in the file, so that
   * blank lines above it are not mistaken for a blank line the author put
   * *between* two things and wanted kept.
   */
  private startLayout(): void {
    if (!this.trackComments) return;
    const firstToken = this.tokens[0]?.position.line ?? 1;
    const firstComment = this.comments[0]?.start.line ?? Infinity;
    this.layoutLine = Math.min(firstToken, firstComment);
  }

  /** Whether the author left a blank line above line `line`. */
  private blankBefore(line: number): boolean {
    return (
      this.trackComments &&
      this.layoutLine !== NO_LAYOUT_LINE &&
      line - this.layoutLine >= 2
    );
  }

  /**
   * Convert a lexed comment, resolving its blank-line context as it goes.
   *
   * `anchored` is false for a comment that is being relocated because it was
   * written somewhere with no node to attach to. Such a comment must not
   * contribute to the blank-line layout at all: it is not where the author put
   * it, so the gap it leaves behind is not a gap the author asked for, and
   * counting it invents a blank line out of nothing.
   */
  private toComment(token: CommentToken, anchored: boolean = true): Comment {
    const comment: Comment = {
      kind: token.kind,
      text: token.text,
      ownLine: token.ownLine,
      blankBefore: anchored && this.blankBefore(token.start.line),
      indent: token.start.column - 1,
    };
    if (anchored) this.layoutLine = token.end.line;
    return comment;
  }

  /**
   * Unclaimed comments beginning before `offset`, in source order.
   *
   * One forward-only cursor claims every comment exactly once, which is what
   * makes it impossible for two anchors to keep the same comment or for one to be
   * skipped: an unclaimed comment is still there to be found later.
   */
  private takeComments(
    offset: number,
    anchored: (token: CommentToken) => boolean
  ): Comment[] {
    const taken: Comment[] = [];
    while (
      this.commentIndex < this.comments.length &&
      this.comments[this.commentIndex].start.offset < offset
    ) {
      const token = this.comments[this.commentIndex++];
      taken.push(this.toComment(token, anchored(token)));
    }
    return taken;
  }

  private takeCommentsBefore(offset: number, anchored: boolean = true): Comment[] {
    return this.takeComments(offset, () => anchored);
  }

  /**
   * Comments before `statementStart`, marking the ones that only happen to
   * precede it as relocated.
   *
   * `previousEnd` is where the last token before the statement ended. A comment
   * that starts before that has code between it and the statement - it was
   * written in an `if` condition, or above a key in an object literal whose value
   * is a function - so it documents that code, not this statement. It is still
   * kept here, because this is the nearest anchor that exists, but it must not
   * bring a blank line with it: the gap it leaves behind is not one the author
   * asked for.
   */
  private takeLeadingComments(statementStart: number, previousEnd: number): Comment[] {
    return this.takeComments(
      statementStart,
      (token) => token.start.offset >= previousEnd
    );
  }

  /**
   * Unclaimed comments that sit beside code on line `line`.
   *
   * `ownLine` is what distinguishes `x = 1 // why` from a comment that happens
   * to follow on the next line: the latter documents what comes after it and
   * belongs to the next construct, not this one.
   */
  private takeTrailingCommentsOn(line: number): Comment[] {
    const taken: Comment[] = [];
    while (this.commentIndex < this.comments.length) {
      const candidate = this.comments[this.commentIndex];
      if (candidate.ownLine || candidate.start.line !== line) break;
      taken.push(this.toComment(candidate));
      this.commentIndex++;
    }
    return taken;
  }

  /**
   * Claim the comments between the last statement of a region and the token that
   * closes it.
   *
   * With statements present the comments become trailing comments of the last
   * one, which puts them back inside the braces when the region is printed. With
   * none they are returned for the enclosing node to record as dangling: an
   * empty region is the only place a comment has no statement to attach to.
   */
  private claimRegionEnd(statements: Statement[], boundaryOffset: number): Comment[] {
    if (!this.trackComments) return [];
    const leftover = this.takeCommentsBefore(boundaryOffset);
    if (leftover.length === 0) return [];
    if (statements.length === 0) return leftover;
    this.appendTrailing(statements[statements.length - 1], leftover);
    return [];
  }

  private appendTrailing(anchor: CommentAnchor, comments: Comment[]): void {
    if (comments.length === 0) return;
    anchor.trailingComments = [...(anchor.trailingComments ?? []), ...comments];
  }

  private setDangling(node: BaseNode, region: string, comments: Comment[]): void {
    if (comments.length === 0) return;
    node.danglingComments = { ...(node.danglingComments ?? {}), [region]: comments };
  }

  /** Assemble an anchor for a construct that is not a node of its own. */
  private commentAnchor(
    leading: Comment[],
    trailing: Comment[],
    blankBefore: boolean
  ): CommentAnchor | undefined {
    const anchor: CommentAnchor = {};
    if (leading.length > 0) anchor.leadingComments = leading;
    if (trailing.length > 0) anchor.trailingComments = trailing;
    if (blankBefore) anchor.blankBefore = true;
    return Object.keys(anchor).length > 0 ? anchor : undefined;
  }

  // ============ Statement Parsing ============

  /**
   * Parse one statement, attaching the comments that belong to it.
   *
   * Three kinds are attached here:
   *
   *  - own-line comments above the statement, as `leadingComments`;
   *  - a comment beside the statement's last line, as `trailingComments`;
   *  - comments *inside* the statement that no nested statement claimed.
   *
   * The third kind is a relocation, and the only one that loses information. A
   * comment in the middle of an expression - `[1, // one` - has no node to attach
   * to, because the formatter renders expressions from the AST and the AST has no
   * room between two array elements. Rather than drop it, it is moved to the
   * nearest place that does exist, keeping its position relative to every other
   * comment: above the statement if the statement contains no comments of its
   * own, and after it otherwise. Only the column moves, and the comment check
   * verifies that much.
   *
   * The order matters more than it looks. Comments are claimed through one
   * forward-only cursor, so anything left over sits *after* every comment a
   * nested statement already took. Hoisting such a leftover above the statement
   * would print it before those: a comment on a later argument of a call whose
   * earlier argument is a function containing a comment would come out with the
   * two the wrong way round, and the check would reject the file for reordering. Hence: leftovers go after the statement when the statement claimed
   * anything internally.
   */
  private parseStatement(): Statement {
    return this.withComments(() => this.parseStatementInner());
  }

  private withComments<T extends Statement>(parse: () => T): T {
    if (!this.trackComments) return parse();

    const first = this.peek();
    const leading = this.takeLeadingComments(
      first.position.offset,
      this.previousTokenEnd()
    );
    const blankBefore = this.blankBefore(first.position.line);

    const claimedBefore = this.commentIndex;
    const statement = parse();
    const claimedInside = this.commentIndex > claimedBefore;

    const last = this.lastConsumedToken();
    const leftovers = this.takeCommentsBefore(
      last.position.offset + last.length,
      false
    );
    const trailing = this.takeTrailingCommentsOn(last.position.line);

    if (claimedInside) {
      // After the comments the statement's own body claimed.
      this.appendTrailing(statement, leftovers.map(sameLine));
      if (leading.length > 0) statement.leadingComments = leading;
    } else if (leading.length > 0 || leftovers.length > 0) {
      statement.leadingComments = [...leading, ...leftovers.map(ownLine)];
    }
    if (blankBefore) statement.blankBefore = true;
    this.appendTrailing(statement, trailing);
    return statement;
  }

  /** Where the token before the one about to be parsed ended. */
  private previousTokenEnd(): number {
    const previous = this.tokens[this.current - 1];
    return previous === undefined ? 0 : previous.position.offset + previous.length;
  }

  /**
   * The last token the parser consumed, ignoring the newline or semicolon that
   * ended the statement. That token's line is where a trailing comment would be,
   * and its end is where the statement's own text stops.
   */
  private lastConsumedToken(): Token {
    let index = this.current - 1;
    while (
      index > 0 &&
      (this.tokens[index].type === TokenType.NEWLINE ||
        this.tokens[index].type === TokenType.SEMICOLON)
    ) {
      index--;
    }
    return this.tokens[Math.max(index, 0)];
  }

  private parseStatementInner(): Statement {
    switch (this.peek().type) {
      case TokenType.LET:
      case TokenType.CONST:
        return this.parseVariableDeclaration();
      case TokenType.FN:
        return this.parseFunctionDeclaration();
      case TokenType.CLASS:
        return this.parseClassDeclaration();
      case TokenType.RETURN:
        return this.parseReturnStatement();
      case TokenType.IF:
        return this.parseIfStatement();
      case TokenType.WHILE:
        return this.parseWhileStatement();
      case TokenType.FOR:
        return this.parseForStatement();
      case TokenType.BREAK:
        return this.parseBreakStatement();
      case TokenType.CONTINUE:
        return this.parseContinueStatement();
      case TokenType.PRINT:
        return this.parsePrintStatement();
      case TokenType.IMPORT:
        return this.parseImportStatement();
      case TokenType.MATCH:
        return this.parseMatchStatement();
      case TokenType.TEST:
        return this.parseTestDeclaration();
      case TokenType.TRY:
        return this.parseTryCatchStatement();
      case TokenType.THROW:
        return this.parseThrowStatement();
      case TokenType.ENUM:
        return this.parseEnumDeclaration();
      default:
        return this.parseExpressionStatement();
    }
  }

  private parseVariableDeclaration(): VariableDeclaration | DestructuringDeclaration {
    const token = this.advance(); // consume let/const
    const constant = token.type === TokenType.CONST;
    const position = token.position;

    // Check for destructuring patterns: let [a, b] = ... or let {x, y} = ...
    if (this.check(TokenType.LBRACKET)) {
      return this.parseArrayDestructuring(position, constant);
    }
    if (this.check(TokenType.LBRACE)) {
      return this.parseObjectDestructuring(position, constant);
    }

    const nameToken = this.expect(TokenType.IDENTIFIER,
      'a variable name',
      `Variable declarations look like: ${constant ? 'const' : 'let'} myVariable = value`
    );

    this.expect(TokenType.ASSIGN, "'='",
      `Variables must be initialized. Try: ${constant ? 'const' : 'let'} ${nameToken.value} = someValue`
    );

    const value = this.parseExpression();
    this.expectEndOfStatement();

    return {
      type: 'VariableDeclaration',
      name: nameToken.value,
      value,
      constant,
      position,
    };
  }

  private parseArrayDestructuring(position: { line: number; column: number; offset: number }, constant: boolean): DestructuringDeclaration {
    this.advance(); // consume '['
    const names: string[] = [];

    if (!this.check(TokenType.RBRACKET)) {
      do {
        const nameToken = this.expect(TokenType.IDENTIFIER, 'a variable name');
        names.push(nameToken.value);
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.RBRACKET, "']'",
      'Close the destructuring pattern with ]'
    );

    this.expect(TokenType.ASSIGN, "'='",
      'Destructuring declarations must be initialized: let [a, b] = [1, 2]'
    );

    const value = this.parseExpression();
    this.expectEndOfStatement();

    return {
      type: 'DestructuringDeclaration',
      pattern: { kind: 'array', names },
      value,
      constant,
      position,
    };
  }

  private parseObjectDestructuring(position: { line: number; column: number; offset: number }, constant: boolean): DestructuringDeclaration {
    this.advance(); // consume '{'
    const names: string[] = [];

    if (!this.check(TokenType.RBRACE)) {
      do {
        const nameToken = this.expect(TokenType.IDENTIFIER, 'a property name');
        names.push(nameToken.value);
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.RBRACE, "'}'",
      'Close the destructuring pattern with }'
    );

    this.expect(TokenType.ASSIGN, "'='",
      'Destructuring declarations must be initialized: let {x, y} = obj'
    );

    const value = this.parseExpression();
    this.expectEndOfStatement();

    return {
      type: 'DestructuringDeclaration',
      pattern: { kind: 'object', names },
      value,
      constant,
      position,
    };
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    const token = this.advance(); // consume 'fn'
    const position = token.position;

    const nameToken = this.expect(TokenType.IDENTIFIER,
      'a function name',
      'Function declarations look like: fn myFunction(param1, param2) { ... }'
    );

    const params = this.parseParameterList();
    const body = this.parseBlock();

    const declaration: FunctionDeclaration = {
      type: 'FunctionDeclaration',
      name: nameToken.value,
      params,
      body: body.statements,
      position,
    };
    this.setDangling(declaration, 'body', body.dangling);
    return declaration;
  }

  private parseParameterList(): Parameter[] {
    this.expect(TokenType.LPAREN, "'('",
      'Function parameters must be enclosed in parentheses: fn name(param1, param2)'
    );

    const params: Parameter[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        const paramToken = this.expect(TokenType.IDENTIFIER, 'a parameter name');
        const param: Parameter = { name: paramToken.value };

        // Check for default value
        if (this.match(TokenType.ASSIGN)) {
          param.defaultValue = this.parseExpression();
        }

        params.push(param);
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.RPAREN, "')'",
      'Close the parameter list with a closing parenthesis )'
    );

    return params;
  }

  private parseClassDeclaration(): ClassDeclaration {
    const token = this.advance(); // consume 'class'
    const position = token.position;

    const nameToken = this.expect(TokenType.IDENTIFIER,
      'a class name',
      'Class declarations look like: class MyClass { ... }'
    );

    let superClass: string | undefined;
    if (this.match(TokenType.EXTENDS)) {
      const superToken = this.expect(TokenType.IDENTIFIER,
        'a parent class name',
        'After "extends", provide the name of the class to inherit from'
      );
      superClass = superToken.value;
    }

    this.expect(TokenType.LBRACE, "'{'",
      'Class body must be enclosed in braces { }'
    );
    this.skipNewlines();

    const methods: FunctionDeclaration[] = [];
    const properties: VariableDeclaration[] = [];
    // Source order, which the two lists above lose. Only used to find the member
    // a comment at the end of the class body should attach to.
    const members: Statement[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;

      if (this.check(TokenType.FN)) {
        const method = this.withComments(() => this.parseFunctionDeclaration());
        methods.push(method);
        members.push(method);
      } else if (this.check(TokenType.LET) || this.check(TokenType.CONST)) {
        const decl = this.withComments(() => this.parseVariableDeclaration());
        if (decl.type !== 'VariableDeclaration') {
          throw ParseError.fromToken(this.peek(),
            'Destructuring is not supported in class properties',
            'Use simple property declarations: let name = value'
          );
        }
        properties.push(decl);
        members.push(decl);
      } else {
        throw ParseError.unexpected(this.peek(), "'fn' or 'let' for class members");
      }
      this.skipNewlines();
    }

    const memberComments = this.claimRegionEnd(members, this.peek().position.offset);

    this.expect(TokenType.RBRACE, "'}'", 'Close the class body with }');

    const declaration: ClassDeclaration = {
      type: 'ClassDeclaration',
      name: nameToken.value,
      superClass,
      methods,
      properties,
      position,
    };
    this.setDangling(declaration, 'members', memberComments);
    return declaration;
  }

  private parseReturnStatement(): ReturnStatement {
    const token = this.advance(); // consume 'return'
    const position = token.position;

    let value: Expression | null = null;
    if (!this.isEndOfStatement()) {
      value = this.parseExpression();
    }
    this.expectEndOfStatement();

    return {
      type: 'ReturnStatement',
      value,
      position,
    };
  }

  private parseIfStatement(): IfStatement {
    const token = this.advance(); // consume 'if'
    const position = token.position;

    const condition = this.parseExpression();
    const consequent = this.parseBlock();

    let alternate: Statement[] | IfStatement | null = null;
    let alternateComments: Comment[] = [];
    this.skipNewlines();
    if (this.match(TokenType.ELSE)) {
      if (this.check(TokenType.IF)) {
        alternate = this.parseIfStatement();
      } else {
        const elseBlock = this.parseBlock();
        alternate = elseBlock.statements;
        alternateComments = elseBlock.dangling;
      }
    }

    const statement: IfStatement = {
      type: 'IfStatement',
      condition,
      consequent: consequent.statements,
      alternate,
      position,
    };
    this.setDangling(statement, 'consequent', consequent.dangling);
    this.setDangling(statement, 'alternate', alternateComments);
    return statement;
  }

  private parseWhileStatement(): WhileStatement {
    const token = this.advance(); // consume 'while'
    const position = token.position;

    const condition = this.parseExpression();
    const body = this.parseBlock();

    const statement: WhileStatement = {
      type: 'WhileStatement',
      condition,
      body: body.statements,
      position,
    };
    this.setDangling(statement, 'body', body.dangling);
    return statement;
  }

  private parseForStatement(): ForStatement {
    const token = this.advance(); // consume 'for'
    const position = token.position;

    const varToken = this.expect(TokenType.IDENTIFIER,
      'a loop variable name',
      'For loops look like: for item in collection { ... }'
    );

    this.expect(TokenType.IN, "'in'",
      'For loops use "in" to iterate: for item in collection { ... }'
    );

    const iterable = this.parseExpression();
    const body = this.parseBlock();

    const statement: ForStatement = {
      type: 'ForStatement',
      variable: varToken.value,
      iterable,
      body: body.statements,
      position,
    };
    this.setDangling(statement, 'body', body.dangling);
    return statement;
  }

  private parseBreakStatement(): BreakStatement {
    const token = this.advance(); // consume 'break'
    this.expectEndOfStatement();
    return { type: 'BreakStatement', position: token.position };
  }

  private parseContinueStatement(): ContinueStatement {
    const token = this.advance(); // consume 'continue'
    this.expectEndOfStatement();
    return { type: 'ContinueStatement', position: token.position };
  }

  private parsePrintStatement(): PrintStatement {
    const token = this.advance(); // consume 'print'
    const position = token.position;

    this.expect(TokenType.LPAREN, "'('",
      'print requires parentheses: print("hello")'
    );

    const expressions: Expression[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        expressions.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.RPAREN, "')'",
      'Close the print call with )'
    );
    this.expectEndOfStatement();

    return {
      type: 'PrintStatement',
      expressions,
      position,
    };
  }

  private parseImportStatement(): ImportStatement {
    const token = this.advance(); // consume 'import'
    const position = token.position;

    this.expect(TokenType.LBRACE, "'{'",
      'Import names in braces: import {name1, name2} from "module"'
    );

    const names: string[] = [];
    if (!this.check(TokenType.RBRACE)) {
      do {
        const nameToken = this.expect(TokenType.IDENTIFIER, 'an import name');
        names.push(nameToken.value);
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.RBRACE, "'}'");

    this.expect(TokenType.FROM, "'from'",
      'After import names, use "from" to specify the module'
    );

    const sourceToken = this.expect(TokenType.STRING, 'a module name string',
      'Module names must be strings: import {x} from "module"'
    );

    this.expectEndOfStatement();

    return {
      type: 'ImportStatement',
      names,
      source: sourceToken.value,
      position,
    };
  }

  private parseMatchStatement(): MatchStatement {
    const token = this.advance(); // consume 'match'
    const position = token.position;

    const subject = this.parseExpression();

    this.expect(TokenType.LBRACE, "'{'",
      'Match blocks use braces: match value { when 1 => ... }'
    );
    this.skipNewlines();

    const cases: MatchCase[] = [];
    let defaultCase: Statement[] | undefined;
    let defaultComments: CommentAnchor | undefined;
    // Anchors in source order, so a comment before the closing brace lands on
    // the arm it follows.
    const arms: CommentAnchor[] = [];
    const dangling: Record<string, Comment[]> = {};

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;

      // Comments above a `when` or `else` belong to the arm, not to the first
      // statement of its body: the body is printed after `=>`, on the same line.
      const armStart = this.peek();
      const leading = this.takeCommentsBefore(armStart.position.offset);
      const blankBefore = this.blankBefore(armStart.position.line);

      if (this.match(TokenType.ELSE)) {
        this.expect(TokenType.ARROW, "'=>'",
          'Default case uses: else => { ... }'
        );
        const defaultBody = this.parseCaseBody();
        defaultCase = defaultBody.statements;
        const bodyComments = defaultBody.dangling;
        const trailing = this.takeTrailingCommentsOn(this.lastConsumedToken().position.line);
        // Pushed onto `arms` whether or not it has comments yet: a comment
        // before the closing brace must land on the last arm in source order,
        // and the `else` arm is printed after every `when`.
        defaultComments = this.commentAnchor(leading, trailing, blankBefore) ?? {};
        if (bodyComments.length > 0) dangling['default'] = bodyComments;
        arms.push(defaultComments);
      } else {
        this.expect(TokenType.WHEN, "'when'",
          'Match cases start with "when": when value => { ... }'
        );
        const pattern = this.parseExpression();
        this.expect(TokenType.ARROW, "'=>'",
          'After the pattern, use => to specify the action'
        );
        const body = this.parseCaseBody();
        const bodyComments = body.dangling;
        const trailing = this.takeTrailingCommentsOn(this.lastConsumedToken().position.line);
        const matchCase: MatchCase = {
          pattern,
          body: body.statements,
          ...this.commentAnchor(leading, trailing, blankBefore),
        };
        if (bodyComments.length > 0) dangling[`case${cases.length}`] = bodyComments;
        cases.push(matchCase);
        arms.push(matchCase);
      }
      this.skipNewlines();
    }

    // Comments before the closing brace: on the last arm if there is one,
    // dangling in the body of an arm-less match otherwise.
    const leftover = this.trackComments
      ? this.takeCommentsBefore(this.peek().position.offset)
      : [];
    if (leftover.length > 0) {
      if (arms.length > 0) {
        this.appendTrailing(arms[arms.length - 1], leftover);
      } else {
        dangling['cases'] = leftover;
      }
    }

    this.expect(TokenType.RBRACE, "'}'");

    const statement: MatchStatement = {
      type: 'MatchStatement',
      subject,
      cases,
      defaultCase,
      position,
    };
    if (defaultComments !== undefined && Object.keys(defaultComments).length > 0) {
      statement.defaultComments = defaultComments;
    }
    for (const [region, comments] of Object.entries(dangling)) {
      this.setDangling(statement, region, comments);
    }
    return statement;
  }

  private parseCaseBody(): Block {
    if (this.check(TokenType.LBRACE)) {
      return this.parseBlock();
    }
    // A one-statement arm has no braces, so it has no region for a comment to
    // dangle in: the statement itself is the whole body.
    return { statements: [this.parseStatement()], dangling: [] };
  }

  private parseTestDeclaration(): TestDeclaration {
    const token = this.advance(); // consume 'test'
    const position = token.position;

    const description = this.parseExpression();
    const body = this.parseBlock();

    const declaration: TestDeclaration = {
      type: 'TestDeclaration',
      description,
      body: body.statements,
      position,
    };
    this.setDangling(declaration, 'body', body.dangling);
    return declaration;
  }

  private parseTryCatchStatement(): TryCatchStatement {
    const token = this.advance(); // consume 'try'
    const position = token.position;

    const tryBody = this.parseBlock();

    this.skipNewlines();
    this.expect(TokenType.CATCH, "'catch'",
      'A try block must be followed by catch: try { ... } catch err { ... }'
    );

    const errorVarToken = this.expect(TokenType.IDENTIFIER, 'an error variable name',
      'After catch, provide a variable name: catch err { ... }'
    );

    const catchBody = this.parseBlock();

    const statement: TryCatchStatement = {
      type: 'TryCatchStatement',
      tryBody: tryBody.statements,
      catchVariable: errorVarToken.value,
      catchBody: catchBody.statements,
      position,
    };
    this.setDangling(statement, 'tryBody', tryBody.dangling);
    this.setDangling(statement, 'catchBody', catchBody.dangling);
    return statement;
  }

  private parseThrowStatement(): ThrowStatement {
    const token = this.advance(); // consume 'throw'
    const position = token.position;

    const value = this.parseExpression();
    this.expectEndOfStatement();

    return {
      type: 'ThrowStatement',
      value,
      position,
    };
  }

  private parseEnumDeclaration(): EnumDeclaration {
    const token = this.advance(); // consume 'enum'
    const position = token.position;

    const nameToken = this.expect(TokenType.IDENTIFIER,
      'an enum name',
      'Enum declarations look like: enum Direction { North South East West }'
    );

    this.expect(TokenType.LBRACE, "'{'",
      'Enum body must be enclosed in braces { }'
    );
    this.skipNewlines();

    const variants: string[] = [];
    // A variant is a bare identifier, not a node, so its comments are collected
    // into a list that stays index-aligned with `variants`.
    const variantComments: CommentAnchor[] = [];
    let anyVariantComments = false;

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;

      const leading = this.takeCommentsBefore(this.peek().position.offset);
      const blankBefore = this.blankBefore(this.peek().position.line);
      const variantToken = this.expect(TokenType.IDENTIFIER, 'a variant name',
        'Enum variants are identifiers listed on separate lines'
      );
      const trailing = this.takeTrailingCommentsOn(variantToken.position.line);

      variants.push(variantToken.value);
      const anchor = this.commentAnchor(leading, trailing, blankBefore);
      variantComments.push(anchor ?? {});
      if (anchor !== undefined) anyVariantComments = true;

      this.skipNewlines();
    }

    // Comments before the closing brace: on the last variant if there is one,
    // dangling in the body if the enum is empty.
    const leftover = this.trackComments
      ? this.takeCommentsBefore(this.peek().position.offset)
      : [];
    let danglingVariants: Comment[] = [];
    if (leftover.length > 0) {
      if (variantComments.length > 0) {
        this.appendTrailing(variantComments[variantComments.length - 1], leftover);
        anyVariantComments = true;
      } else {
        danglingVariants = leftover;
      }
    }

    this.expect(TokenType.RBRACE, "'}'", 'Close the enum body with }');

    const declaration: EnumDeclaration = {
      type: 'EnumDeclaration',
      name: nameToken.value,
      variants,
      position,
    };
    if (anyVariantComments) declaration.variantComments = variantComments;
    this.setDangling(declaration, 'variants', danglingVariants);
    return declaration;
  }

  private parseExpressionStatement(): ExpressionStatement {
    const position = this.peek().position;
    const expression = this.parseExpression();
    this.expectEndOfStatement();

    return {
      type: 'ExpressionStatement',
      expression,
      position,
    };
  }

  // ============ Expression Parsing (Pratt Parser) ============

  private parseExpression(): Expression {
    return this.parseAssignment();
  }

  private parseAssignment(): Expression {
    const expr = this.parseTernary();

    if (this.check(TokenType.ASSIGN) ||
        this.check(TokenType.PLUS_ASSIGN) ||
        this.check(TokenType.MINUS_ASSIGN) ||
        this.check(TokenType.STAR_ASSIGN) ||
        this.check(TokenType.SLASH_ASSIGN)) {
      const operatorToken = this.advance();
      const value = this.parseAssignment(); // Right-associative

      return {
        type: 'AssignmentExpression',
        operator: operatorToken.value,
        target: expr,
        value,
        position: expr.position,
      } as AssignmentExpression;
    }

    return expr;
  }

  private parsePipe(): Expression {
    let left = this.parseNullishCoalesce();

    while (this.match(TokenType.PIPE_ARROW)) {
      // Check for .method() syntax: pipe into method call on left value
      if (this.check(TokenType.DOT)) {
        this.advance(); // consume the dot
        const methodToken = this.expect(TokenType.IDENTIFIER, 'a method name',
          'After |> . provide a method name to call on the piped value'
        );
        const args: Expression[] = [];
        if (this.match(TokenType.LPAREN)) {
          if (!this.check(TokenType.RPAREN)) {
            args.push(this.parseExpression());
            while (this.match(TokenType.COMMA)) {
              args.push(this.parseExpression());
            }
          }
          this.expect(TokenType.RPAREN, "')'", 'Close method call with )');
        }
        left = {
          type: 'PipeMethodExpression',
          left,
          method: methodToken.value,
          args,
          position: left.position,
        } as PipeMethodExpression;
      } else {
        // Check for arrow function: (params) => body
        const right = this.parseNullishCoalesce();
        left = {
          type: 'PipeExpression',
          left,
          right,
          position: left.position,
        } as PipeExpression;
      }
    }

    return left;
  }

  private parseNullishCoalesce(): Expression {
    let left = this.parseOr();

    while (this.match(TokenType.NULLISH_COALESCE)) {
      const right = this.parseOr();
      left = {
        type: 'NullishCoalesceExpression',
        left,
        right,
        position: left.position,
      } as NullishCoalesceExpression;
    }

    return left;
  }

  /**
   * `cond ? whenTrue : whenFalse`.
   *
   * Sits just above assignment and below everything else, so `??`, `|>` and the
   * binary operators all bind tighter and form the condition. Both arms parse an
   * assignment expression, which makes the operator right-associative:
   * `a ? b : c ? d : e` groups as `a ? b : (c ? d : e)`.
   *
   * This used to return parseOr() unchanged with a comment saying the language
   * had no `? :`, which left TernaryExpression - and the interpreter's
   * evalTernaryExpression and the compiler's compileTernaryExpression - as
   * unreachable dead code.
   */
  private parseTernary(): Expression {
    const condition = this.parsePipe();

    if (!this.match(TokenType.QUESTION)) {
      return condition;
    }

    const consequent = this.parseAssignment();
    this.expect(
      TokenType.COLON,
      "':'",
      'A conditional expression looks like: cond ? whenTrue : whenFalse'
    );
    const alternate = this.parseAssignment();

    return {
      type: 'TernaryExpression',
      condition,
      consequent,
      alternate,
      position: condition.position,
    } as TernaryExpression;
  }

  private parseOr(): Expression {
    let left = this.parseAnd();

    while (this.match(TokenType.OR)) {
      const right = this.parseAnd();
      left = {
        type: 'LogicalExpression',
        operator: 'or',
        left,
        right,
        position: left.position,
      } as LogicalExpression;
    }

    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseEquality();

    while (this.match(TokenType.AND)) {
      const right = this.parseEquality();
      left = {
        type: 'LogicalExpression',
        operator: 'and',
        left,
        right,
        position: left.position,
      } as LogicalExpression;
    }

    return left;
  }

  private parseEquality(): Expression {
    let left = this.parseComparison();

    while (this.check(TokenType.EQUAL) || this.check(TokenType.NOT_EQUAL)) {
      const operator = this.advance();
      const right = this.parseComparison();
      left = {
        type: 'BinaryExpression',
        operator: operator.value,
        left,
        right,
        position: left.position,
      } as BinaryExpression;
    }

    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseRange();

    while (
      this.check(TokenType.LESS) ||
      this.check(TokenType.LESS_EQUAL) ||
      this.check(TokenType.GREATER) ||
      this.check(TokenType.GREATER_EQUAL)
    ) {
      const operator = this.advance();
      const right = this.parseRange();
      left = {
        type: 'BinaryExpression',
        operator: operator.value,
        left,
        right,
        position: left.position,
      } as BinaryExpression;
    }

    return left;
  }

  private parseRange(): Expression {
    const left = this.parseAddition();

    if (this.check(TokenType.DOT) && this.peekNext()?.type === TokenType.DOT) {
      // Range expression: start..end
      this.advance(); // first dot
      this.advance(); // second dot
      const inclusive = this.match(TokenType.ASSIGN); // ..= for inclusive
      const right = this.parseAddition();
      return {
        type: 'RangeExpression',
        start: left,
        end: right,
        inclusive,
        position: left.position,
      } as RangeExpression;
    }

    return left;
  }

  private parseAddition(): Expression {
    let left = this.parseMultiplication();

    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const operator = this.advance();
      const right = this.parseMultiplication();
      left = {
        type: 'BinaryExpression',
        operator: operator.value,
        left,
        right,
        position: left.position,
      } as BinaryExpression;
    }

    return left;
  }

  private parseMultiplication(): Expression {
    let left = this.parsePower();

    while (
      this.check(TokenType.STAR) ||
      this.check(TokenType.SLASH) ||
      this.check(TokenType.PERCENT)
    ) {
      const operator = this.advance();
      const right = this.parsePower();
      left = {
        type: 'BinaryExpression',
        operator: operator.value,
        left,
        right,
        position: left.position,
      } as BinaryExpression;
    }

    return left;
  }

  private parsePower(): Expression {
    const left = this.parseUnary();

    if (this.check(TokenType.POWER)) {
      const operator = this.advance();
      const right = this.parsePower(); // Right-associative
      return {
        type: 'BinaryExpression',
        operator: operator.value,
        left,
        right,
        position: left.position,
      } as BinaryExpression;
    }

    return left;
  }

  private parseUnary(): Expression {
    if (this.check(TokenType.MINUS) || this.check(TokenType.NOT)) {
      const operator = this.advance();
      const operand = this.parseUnary();
      return {
        type: 'UnaryExpression',
        operator: operator.value,
        operand,
        position: operator.position,
      } as UnaryExpression;
    }

    return this.parseCallMemberIndex();
  }

  private parseCallMemberIndex(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      // Support fluent multi-line chaining:
      //   [1, 2, 3]
      //     .filter(...)
      //     .map(...)
      // The lexer emits a NEWLINE after ']' and ')', which would otherwise end
      // the statement. If the next significant token is a '.', the line is a
      // continuation, so consume the pending newlines and keep chaining.
      if (this.check(TokenType.NEWLINE) && this.nextSignificantIsDot()) {
        while (this.check(TokenType.NEWLINE)) {
          this.advance();
        }
      }

      if (this.check(TokenType.LPAREN)) {
        expr = this.parseCallExpression(expr);
      } else if (this.check(TokenType.QUESTION_DOT)) {
        this.advance(); // consume '?.'
        if (this.check(TokenType.LBRACKET)) {
          // Optional index access: obj?.[index]
          this.advance(); // consume '['
          const index = this.parseExpression();
          this.expect(TokenType.RBRACKET, "']'",
            'Optional index access must be closed with ]'
          );
          expr = {
            type: 'OptionalIndexExpression',
            object: expr,
            index,
            position: expr.position,
          } as OptionalIndexExpression;
        } else {
          // Optional member access: obj?.prop
          const property = this.expect(TokenType.IDENTIFIER, 'a property name',
            'After ?. provide a property or method name'
          );
          expr = {
            type: 'OptionalMemberExpression',
            object: expr,
            property: property.value,
            position: expr.position,
          } as OptionalMemberExpression;
        }
      } else if (this.check(TokenType.DOT)) {
        // Don't consume dot if next is also dot (it's a range expression)
        if (this.peekNext()?.type === TokenType.DOT) {
          break;
        }
        this.advance(); // consume the dot
        const property = this.expect(TokenType.IDENTIFIER, 'a property name',
          'After the dot (.), provide a property or method name'
        );
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: property.value,
          position: expr.position,
        } as MemberExpression;
      } else if (this.match(TokenType.LBRACKET)) {
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET, "']'",
          'Array index access must be closed with ]'
        );
        expr = {
          type: 'IndexExpression',
          object: expr,
          index,
          position: expr.position,
        } as IndexExpression;
      } else {
        break;
      }
    }

    return expr;
  }

  private parseCallExpression(callee: Expression): CallExpression {
    this.advance(); // consume '('
    const args: Expression[] = [];

    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }

    this.expect(TokenType.RPAREN, "')'",
      'Function calls must be closed with )'
    );

    return {
      type: 'CallExpression',
      callee,
      args,
      position: callee.position,
    };
  }

  // ============ Primary Expressions ============

  private parsePrimary(): Expression {
    const token = this.peek();

    switch (token.type) {
      case TokenType.NUMBER:
        return this.parseNumberLiteral();
      case TokenType.STRING:
        return this.parseStringLiteral();
      case TokenType.FSTRING:
        return this.parseInterpolatedString();
      case TokenType.BOOLEAN:
        return this.parseBooleanLiteral();
      case TokenType.NULL:
        return this.parseNullLiteral();
      case TokenType.LBRACKET:
        return this.parseArrayLiteral();
      case TokenType.LBRACE:
        return this.parseObjectLiteral();
      case TokenType.LPAREN:
        return this.parseGroupOrArrow();
      case TokenType.IDENTIFIER:
        return this.parseIdentifier();
      case TokenType.THIS:
        return this.parseThis();
      case TokenType.NEW:
        return this.parseNew();
      case TokenType.FN:
        return this.parseFunctionExpression();
      case TokenType.SPREAD:
        return this.parseSpreadExpression();
      default:
        throw ParseError.unexpected(token, 'an expression');
    }
  }

  private parseNumberLiteral(): NumberLiteral {
    const token = this.advance();
    return {
      type: 'NumberLiteral',
      value: Number(token.value),
      // The token's value is the exact source slice, so this is the literal as
      // written. Kept so the formatter need not reconstruct it from the float.
      raw: token.value,
      position: token.position,
    };
  }

  private parseStringLiteral(): StringLiteral {
    const token = this.advance();
    return {
      type: 'StringLiteral',
      value: token.value,
      position: token.position,
    };
  }

  private parseBooleanLiteral(): BooleanLiteral {
    const token = this.advance();
    return {
      type: 'BooleanLiteral',
      value: token.value === 'true',
      position: token.position,
    };
  }

  private parseNullLiteral(): NullLiteral {
    const token = this.advance();
    return {
      type: 'NullLiteral',
      position: token.position,
    };
  }

  private parseArrayLiteral(): ArrayLiteral {
    const token = this.advance(); // consume '['
    const elements: Expression[] = [];

    this.skipNewlines();
    if (!this.check(TokenType.RBRACKET)) {
      do {
        this.skipNewlines();
        if (this.check(TokenType.RBRACKET)) break;
        elements.push(this.parseExpression());
        this.skipNewlines();
      } while (this.match(TokenType.COMMA));
    }
    this.skipNewlines();

    this.expect(TokenType.RBRACKET, "']'",
      'Arrays must be closed with ]. Example: [1, 2, 3]'
    );

    return {
      type: 'ArrayLiteral',
      elements,
      position: token.position,
    };
  }

  private parseObjectLiteral(): ObjectLiteral {
    const token = this.advance(); // consume '{'
    const properties: ObjectProperty[] = [];

    this.skipNewlines();
    if (!this.check(TokenType.RBRACE)) {
      do {
        this.skipNewlines();
        if (this.check(TokenType.RBRACE)) break;

        const keyToken = this.expect(TokenType.IDENTIFIER, 'a property name',
          'Object properties look like: {name: "value", age: 25}'
        );

        this.expect(TokenType.COLON, "':'",
          'Separate property name and value with a colon: name: value'
        );

        const value = this.parseExpression();
        properties.push({ key: keyToken.value, value });
        this.skipNewlines();
      } while (this.match(TokenType.COMMA));
    }
    this.skipNewlines();

    this.expect(TokenType.RBRACE, "'}'",
      'Objects must be closed with }. Example: {name: "Alice"}'
    );

    return {
      type: 'ObjectLiteral',
      properties,
      position: token.position,
    };
  }

  private parseGroupOrArrow(): Expression {
    const startPos = this.peek().position;

    // Try to parse as arrow function. Comment state has to be saved along with
    // the token index: a speculative parse can consume comments, and rewinding
    // the tokens without rewinding those would lose them for good.
    const savedPosition = this.current;
    const savedCommentIndex = this.commentIndex;
    const savedLayoutLine = this.layoutLine;
    try {
      const params = this.tryParseArrowParams();
      if (params !== null && this.match(TokenType.ARROW)) {
        // It's an arrow function
        if (this.check(TokenType.LBRACE)) {
          const body = this.parseBlock();
          const arrow: ArrowFunction = {
            type: 'ArrowFunction',
            params,
            body: body.statements,
            position: startPos,
          };
          this.setDangling(arrow, 'body', body.dangling);
          return arrow;
        } else {
          const expr = this.parseExpression();
          return {
            type: 'ArrowFunction',
            params,
            body: expr,
            position: startPos,
          } as ArrowFunction;
        }
      }
    } catch {
      // Not an arrow function, backtrack
    }

    // Reset and parse as grouping
    this.current = savedPosition;
    this.commentIndex = savedCommentIndex;
    this.layoutLine = savedLayoutLine;
    this.advance(); // consume '('
    const expr = this.parseExpression();
    this.expect(TokenType.RPAREN, "')'",
      'Parenthesized expressions must be closed with )'
    );
    return expr;
  }

  private tryParseArrowParams(): Parameter[] | null {
    if (!this.match(TokenType.LPAREN)) return null;

    const params: Parameter[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        if (!this.check(TokenType.IDENTIFIER)) return null;
        const paramToken = this.advance();
        const param: Parameter = { name: paramToken.value };

        if (this.match(TokenType.ASSIGN)) {
          param.defaultValue = this.parseExpression();
        }

        params.push(param);
      } while (this.match(TokenType.COMMA));
    }

    if (!this.match(TokenType.RPAREN)) return null;
    return params;
  }

  private parseIdentifier(): Identifier {
    const token = this.advance();
    return {
      type: 'Identifier',
      name: token.value,
      position: token.position,
    };
  }

  private parseThis(): ThisExpression {
    const token = this.advance();
    return {
      type: 'ThisExpression',
      position: token.position,
    };
  }

  private parseNew(): NewExpression {
    const token = this.advance(); // consume 'new'
    const callee = this.parsePrimary();
    
    const args: Expression[] = [];
    if (this.check(TokenType.LPAREN)) {
      this.advance(); // consume '('
      if (!this.check(TokenType.RPAREN)) {
        do {
          args.push(this.parseExpression());
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RPAREN, "')'");
    }

    return {
      type: 'NewExpression',
      callee,
      args,
      position: token.position,
    };
  }

  private parseFunctionExpression(): FunctionExpression {
    const token = this.advance(); // consume 'fn'
    const params = this.parseParameterList();
    const body = this.parseBlock();

    const expression: FunctionExpression = {
      type: 'FunctionExpression',
      params,
      body: body.statements,
      position: token.position,
    };
    this.setDangling(expression, 'body', body.dangling);
    return expression;
  }

  private parseInterpolatedString(): InterpolatedString {
    const token = this.advance(); // consume FSTRING token
    const position = token.position;
    const raw = token.value;

    // Split the raw f-string, then parse each interpolated expression source.
    // The splitting rules are shared with the formatter's comment check, which
    // has to look inside interpolations for the same reason: they contain code.
    const parts: InterpolatedPart[] = splitInterpolatedString(raw).map((part) => {
      if (part.kind === 'literal') {
        return { kind: 'literal', value: part.value } as InterpolatedPart;
      }
      const innerLexer = new Lexer(part.source);
      const innerTokens = innerLexer.tokenize();
      const innerParser = new Parser(innerTokens);
      return {
        kind: 'expression',
        expression: innerParser.parseExpression(),
      } as InterpolatedPart;
    });

    return {
      type: 'InterpolatedString',
      parts,
      position,
    };
  }

  private parseSpreadExpression(): SpreadExpression {
    const token = this.advance(); // consume '...'
    const argument = this.parseExpression();
    return {
      type: 'SpreadExpression',
      argument,
      position: token.position,
    };
  }

  // ============ Block Parsing ============

  private parseBlock(): Block {
    this.expect(TokenType.LBRACE, "'{'",
      'Blocks must start with an opening brace {'
    );
    this.skipNewlines();

    const statements: Statement[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      statements.push(this.parseStatement());
      this.skipNewlines();
    }

    const dangling = this.claimRegionEnd(statements, this.peek().position.offset);

    this.expect(TokenType.RBRACE, "'}'",
      'Blocks must end with a closing brace }'
    );

    return { statements, dangling };
  }

  // ============ Helper Methods ============

  private peek(): Token {
    return this.tokens[this.current];
  }

  private peekNext(): Token | undefined {
    if (this.current + 1 < this.tokens.length) {
      return this.tokens[this.current + 1];
    }
    return undefined;
  }

  private advance(): Token {
    const token = this.tokens[this.current];
    this.current++;
    // Keeps the blank-line cursor on the last thing consumed, including the
    // braces and newlines that are not part of any statement. Without that, the
    // first statement of a block would look like it had a blank line above it
    // whenever the block's header was two lines up.
    if (token !== undefined) this.layoutLine = token.position.line;
    return token;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private expect(type: TokenType, expected: string, hint?: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw ParseError.fromToken(this.peek(),
      `Expected ${expected}, but found '${this.peek().value || this.peek().type}'`,
      hint
    );
  }

  private skipNewlines(): void {
    while (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) {
      this.advance();
    }
  }

  private isEndOfStatement(): boolean {
    if (this.isAtEnd()) return true;
    return this.check(TokenType.NEWLINE) ||
           this.check(TokenType.SEMICOLON) ||
           this.check(TokenType.RBRACE);
  }

  private expectEndOfStatement(): void {
    if (this.isEndOfStatement()) {
      if (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) {
        this.advance();
      }
      return;
    }
    // Don't throw for RBRACE - the block parser will handle it
    if (!this.check(TokenType.RBRACE)) {
      throw ParseError.fromToken(this.peek(),
        `Expected end of statement, but found '${this.peek().value}'`,
        'Each statement should be on its own line, or separated by semicolons'
      );
    }
  }

  /**
   * Error recovery: skip tokens until we reach a likely statement boundary
   */
  /**
   * Look past any run of NEWLINE tokens and report whether the next
   * significant token is a DOT. Used to detect fluent method chains that
   * continue onto the following line.
   *
   * A lone DOT is required; `..` is a range operator, not a continuation.
   */
  private nextSignificantIsDot(): boolean {
    let i = this.current;
    while (i < this.tokens.length && this.tokens[i].type === TokenType.NEWLINE) {
      i++;
    }
    if (i >= this.tokens.length || this.tokens[i].type !== TokenType.DOT) {
      return false;
    }
    // Exclude the range operator `..`
    return this.tokens[i + 1]?.type !== TokenType.DOT;
  }

  private synchronize(): void {
    // Always consume at least one token. Without this the caller can spin
    // forever: if the offending token is preceded by a NEWLINE we would return
    // immediately, parse() would retry the very same token, and error recovery
    // would never make progress.
    if (!this.isAtEnd()) {
      this.advance();
    }

    while (!this.isAtEnd()) {
      // If we just passed a newline/semicolon, we're at a new statement
      const prev = this.current > 0 ? this.tokens[this.current - 1] : undefined;
      if (prev?.type === TokenType.NEWLINE || prev?.type === TokenType.SEMICOLON) {
        return;
      }

      // If the next token starts a new statement, stop
      switch (this.peek().type) {
        case TokenType.LET:
        case TokenType.CONST:
        case TokenType.FN:
        case TokenType.CLASS:
        case TokenType.IF:
        case TokenType.WHILE:
        case TokenType.FOR:
        case TokenType.RETURN:
        case TokenType.PRINT:
        case TokenType.IMPORT:
        case TokenType.TEST:
        case TokenType.TRY:
        case TokenType.THROW:
        case TokenType.ENUM:
          return;
      }

      this.advance();
    }
  }
}
