### eslint-plugin-sort-keys

- Similar to https://eslint.org/docs/rules/sort-keys but fixable
- Fixed some issues and unit tests from the original fork https://github.com/leo-buneev/eslint-plugin-sort-keys-fix

```
npm install --save-dev eslint eslint-plugin-sort-keys
```

```js
// eslint.config.js
module.exports = {
  plugins: ['sort-keys'],
  rules: {
    'sort-keys': 0, // disable default eslint sort-keys
    'sort-keys/sort-keys-fix': 1,
  },
}
```

### Change log

- 2.3.4: fix bug move comments incorrectly on the same line with property
- 2.3.3: fix bug move comments incorrectly on top of a multi-line property
- 2.3.2: some typos and improvements, add change log
- 2.3.1: add support for `minKeys`, update unit tests, dependencies and structure
- 2.2.0: move comments together with the property
- 2.1.0: fix bug multiple runs to complete the sort
- 2.0.0: first publish from this forked repo, fix bug multiple runs to complete the sort
