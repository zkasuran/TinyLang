/**
 * ESLint flat configuration.
 *
 * `npm run lint` was advertised in package.json but had never run: ESLint 9
 * looks for `eslint.config.*` and no configuration file of any generation
 * existed, so the script only ever printed the "couldn't find" error.
 *
 * CommonJS, because the package has no `"type": "module"` and tsconfig emits
 * commonjs; an `export default` here would fail to load.
 */

const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

/** Rules shared by src/ and tests/. */
const sharedRules = {
  // Core recommended first: it carries the rules that catch outright mistakes
  // (no-unreachable, no-dupe-else-if, no-duplicate-case, no-control-regex,
  // no-unsafe-optional-chaining, ...). Listing individual rules without this
  // baseline was leaving most of them off.
  ...js.configs.recommended.rules,
  // Then turn back off the core rules TypeScript itself already checks better,
  // and layer the TypeScript-aware set on top.
  ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
  ...tsPlugin.configs.recommended.rules,

  // An unused argument is often load-bearing here: a native builtin's `fn(args)`
  // signature is fixed by the call protocol, and a visitor method must accept the
  // node it deliberately ignores. tsc's noUnusedParameters already enforces the
  // leading-underscore convention for src/, so this rule only needs to agree with
  // it rather than duplicate it.
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],

  // Additional bug catchers not in the recommended baseline, on deliberately.
  //
  // no-unreachable is put back on: typescript-eslint switches it off on the
  // grounds that the compiler reports it, but tsc only does so when
  // allowUnreachableCode is set to false, and this tsconfig leaves it at the
  // default, where unreachable code is an editor hint and not a build failure.
  // Off here plus unset there would mean nothing checks it at all.
  'no-unreachable': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-throw-literal': 'error',
  'no-self-compare': 'error',
  'no-template-curly-in-string': 'error',
  'no-unmodified-loop-condition': 'error',
  'no-promise-executor-return': 'error',
  'require-atomic-updates': 'error',

  // Off for this codebase, not to get to green. Every require() here is a
  // deliberate call-time load in a package that compiles to CommonJS, and the
  // laziness is load-bearing: src/modules/node-host.ts wraps `require('fs')` in
  // a try/catch precisely so the same source runs in the browser playground,
  // where a top-level import of `fs` would break the bundle outright. Rewriting
  // them as static imports would change behaviour, which is out of scope for a
  // lint rule. The rule was renamed from no-var-requires in v8, which is why the
  // pre-existing disable comments no longer matched anything.
  '@typescript-eslint/no-require-imports': 'off',
};

module.exports = [
  {
    // Build output, dependencies, the generated single-file playground bundle and
    // the throwaway scratch directory are not source and must not be linted.
    ignores: [
      'dist/**',
      'node_modules/**',
      'playground/index.html',
      'playground/dist/**',
      '.scratch/**',
      'coverage/**',
      'eslint.config.js',
    ],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: sharedRules,
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: sharedRules,
  },
];
