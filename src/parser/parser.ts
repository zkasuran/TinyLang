/**
 * TinyLang Parser
 * 
 * Converts a stream of tokens into an Abstract Syntax Tree (AST).
 * Uses recursive descent for statements and Pratt parsing for expressions.
 * 
 * Operator Precedence (low to high):
 * 1. Assignment (=, +=, -=, *=, /=)
 * 2. Ternary (?:)
 * 3. Logical OR (or)
 * 4. Logical AND (and)
 * 5. Equality (==, !=)
 * 6. Comparison (<, >, <=, >=)
 * 7. Range (..)
 * 8. Addition (+, -)
 * 9. Multiplication (*, /, %)
 * 10. Power (**)
 * 11. Unary (not, -)
 * 12. Call, Member Access, Index
 */

import { Token, TokenType } from '../types/tokens';
import {
  Program,
  Statement,
  Expression,
  VariableDeclaration,
  FunctionDeclaration,
  ClassDeclaration,
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
} from '../types/ast';
import { ParseError } from './errors';

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private errors: ParseError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse the token stream into a Program AST node
   */
  parse(): Program {
    const body: Statement[] = [];
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

    return {
      type: 'Program',
      body,
      position: { line: 1, column: 1, offset: 0 },
    };
  }

  // ============ Statement Parsing ============

  private parseStatement(): Statement {
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
      default:
        return this.parseExpressionStatement();
    }
  }

  private parseVariableDeclaration(): VariableDeclaration {
    const token = this.advance(); // consume let/const
    const constant = token.type === TokenType.CONST;
    const position = token.position;

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

  private parseFunctionDeclaration(): FunctionDeclaration {
    const token = this.advance(); // consume 'fn'
    const position = token.position;

    const nameToken = this.expect(TokenType.IDENTIFIER,
      'a function name',
      'Function declarations look like: fn myFunction(param1, param2) { ... }'
    );

    const params = this.parseParameterList();
    const body = this.parseBlock();

    return {
      type: 'FunctionDeclaration',
      name: nameToken.value,
      params,
      body,
      position,
    };
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

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;

      if (this.check(TokenType.FN)) {
        methods.push(this.parseFunctionDeclaration());
      } else if (this.check(TokenType.LET) || this.check(TokenType.CONST)) {
        properties.push(this.parseVariableDeclaration());
      } else {
        throw ParseError.unexpected(this.peek(), "'fn' or 'let' for class members");
      }
      this.skipNewlines();
    }

    this.expect(TokenType.RBRACE, "'}'", 'Close the class body with }');

    return {
      type: 'ClassDeclaration',
      name: nameToken.value,
      superClass,
      methods,
      properties,
      position,
    };
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
    this.skipNewlines();
    if (this.match(TokenType.ELSE)) {
      if (this.check(TokenType.IF)) {
        alternate = this.parseIfStatement();
      } else {
        alternate = this.parseBlock();
      }
    }

    return {
      type: 'IfStatement',
      condition,
      consequent,
      alternate,
      position,
    };
  }

  private parseWhileStatement(): WhileStatement {
    const token = this.advance(); // consume 'while'
    const position = token.position;

    const condition = this.parseExpression();
    const body = this.parseBlock();

    return {
      type: 'WhileStatement',
      condition,
      body,
      position,
    };
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

    return {
      type: 'ForStatement',
      variable: varToken.value,
      iterable,
      body,
      position,
    };
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

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;

      if (this.match(TokenType.ELSE)) {
        this.expect(TokenType.ARROW, "'=>'",
          'Default case uses: else => { ... }'
        );
        defaultCase = this.parseCaseBody();
      } else {
        this.expect(TokenType.WHEN, "'when'",
          'Match cases start with "when": when value => { ... }'
        );
        const pattern = this.parseExpression();
        this.expect(TokenType.ARROW, "'=>'",
          'After the pattern, use => to specify the action'
        );
        const body = this.parseCaseBody();
        cases.push({ pattern, body });
      }
      this.skipNewlines();
    }

    this.expect(TokenType.RBRACE, "'}'");

    return {
      type: 'MatchStatement',
      subject,
      cases,
      defaultCase,
      position,
    };
  }

  private parseCaseBody(): Statement[] {
    if (this.check(TokenType.LBRACE)) {
      return this.parseBlock();
    }
    // Single statement case
    const stmt = this.parseStatement();
    return [stmt];
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

  private parseTernary(): Expression {
    // We don't have ? : but we can support ternary through if-else expressions later
    return this.parseOr();
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
    let left = this.parseAddition();

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
      if (this.check(TokenType.LPAREN)) {
        expr = this.parseCallExpression(expr);
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
      default:
        throw ParseError.unexpected(token, 'an expression');
    }
  }

  private parseNumberLiteral(): NumberLiteral {
    const token = this.advance();
    return {
      type: 'NumberLiteral',
      value: Number(token.value),
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

    // Try to parse as arrow function
    const savedPosition = this.current;
    try {
      const params = this.tryParseArrowParams();
      if (params !== null && this.match(TokenType.ARROW)) {
        // It's an arrow function
        if (this.check(TokenType.LBRACE)) {
          const body = this.parseBlock();
          return {
            type: 'ArrowFunction',
            params,
            body,
            position: startPos,
          } as ArrowFunction;
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
    
    let args: Expression[] = [];
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

    return {
      type: 'FunctionExpression',
      params,
      body,
      position: token.position,
    };
  }

  // ============ Block Parsing ============

  private parseBlock(): Statement[] {
    this.expect(TokenType.LBRACE, "'{'",
      'Blocks must start with an opening brace {'
    );
    this.skipNewlines();

    const statements: Statement[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      statements.push(this.parseStatement());
      this.skipNewlines();
    }

    this.expect(TokenType.RBRACE, "'}'",
      'Blocks must end with a closing brace }'
    );

    return statements;
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
  private synchronize(): void {
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
          return;
      }

      this.advance();
    }
  }
}
