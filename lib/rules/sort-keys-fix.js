/**
 * @fileoverview Rule to require object keys to be sorted
 * @author Toru Nagashima
 */

'use strict'

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

const astUtils = require('../util/ast-utils')

const naturalCompare = require('natural-compare')

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Gets the property name of the given `Property` node.
 *
 * - If the property's key is an `Identifier` node, this returns the key's name
 *   whether it's a computed property or not.
 * - If the property has a static name, this returns the static name.
 * - Otherwise, this returns null.
 *
 * @param {ASTNode} node - The `Property` node to get.
 * @returns {string|null} The property name or null.
 * @private
 */
function getPropertyName(node) {
  const staticName = astUtils.getStaticPropertyName(node)

  if (staticName !== null) {
    return staticName
  }

  return node.key.name || null
}

/**
 * Functions which check that the given 2 names are in specific order.
 *
 * Postfix `I` is meant insensitive.
 * Postfix `N` is meant natual.
 *
 * @private
 */
const isValidOrders = {
  asc(a, b) {
    return a <= b
  },
  ascI(a, b) {
    return a.toLowerCase() <= b.toLowerCase()
  },
  ascN(a, b) {
    return naturalCompare(a, b) <= 0
  },
  ascIN(a, b) {
    return naturalCompare(a.toLowerCase(), b.toLowerCase()) <= 0
  },
  desc(a, b) {
    return isValidOrders.asc(b, a)
  },
  descI(a, b) {
    return isValidOrders.ascI(b, a)
  },
  descN(a, b) {
    return isValidOrders.ascN(b, a)
  },
  descIN(a, b) {
    return isValidOrders.ascIN(b, a)
  },
}

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

module.exports = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'require object keys to be sorted',
      category: 'Stylistic Issues',
      recommended: false,
      url: 'https://github.com/namnm/eslint-plugin-sort-keys',
    },

    schema: [
      {
        enum: ['asc', 'desc'],
      },
      {
        type: 'object',
        properties: {
          caseSensitive: {
            type: 'boolean',
          },
          natural: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    // Parse options.
    const order = context.options[0] || 'asc'
    const options = context.options[1]
    const insensitive = (options && options.caseSensitive) === false
    const natual = Boolean(options && options.natural)
    const isValidOrder = isValidOrders[order + (insensitive ? 'I' : '') + (natual ? 'N' : '')]

    // The stack to save the previous property's name for each object literals.
    let stack = null

    const SpreadElement = node => {
      if (node.parent.type === 'ObjectExpression') {
        stack.prevName = null
      }
    }

    return {
      ExperimentalSpreadProperty: SpreadElement,

      ObjectExpression() {
        stack = {
          upper: stack,
          prevName: null,
          prevNode: null,
        }
      },

      'ObjectExpression:exit'() {
        stack = stack.upper
      },

      SpreadElement,

      Property(node) {
        if (node.parent.type === 'ObjectPattern') {
          return
        }

        const prevName = stack.prevName
        const prevNode = stack.prevNode
        const thisName = getPropertyName(node)

        if (thisName !== null) {
          stack.prevName = thisName
          stack.prevNode = node || prevNode
        }

        if (prevName === null || thisName === null) {
          return
        }

        if (!isValidOrder(prevName, thisName)) {
          context.report({
            node,
            loc: node.key.loc,
            message:
              "Expected object keys to be in {{natual}}{{insensitive}}{{order}}ending order. '{{thisName}}' should be before '{{prevName}}'.",
            data: {
              thisName,
              prevName,
              order,
              insensitive: insensitive ? 'insensitive ' : '',
              natual: natual ? 'natural ' : '',
            },
            fix(fixer) {
              // Check if already sorted
              if (node.parent.__alreadySorted || node.parent.properties.__alreadySorted) {
                return []
              }
              node.parent.__alreadySorted = true
              node.parent.properties.__alreadySorted = true
              //
              const src = context.getSourceCode()
              const props = node.parent.properties
              // Split into parts on each spread operator (empty key)
              const parts = []
              let part = []
              props.forEach(p => {
                if (!p.key) {
                  parts.push(part)
                  part = []
                } else {
                  part.push(p)
                }
              })
              parts.push(part)
              // Sort all parts
              parts.forEach(part => {
                part.sort((p1, p2) => (isValidOrder(getPropertyName(p1), getPropertyName(p2)) ? -1 : 1))
              })
              // Perform fixes
              const fixes = []
              let newIndex = 0
              parts.forEach(part => {
                part.forEach(p => {
                  moveProperty(p, props[newIndex], fixer, src).forEach(f => fixes.push(f))
                  newIndex++
                })
                newIndex++
              })
              return fixes
            },
          })
        }
      },
    }
  },
}

const moveProperty = (thisNode, toNode, fixer, src) => {
  if (thisNode === toNode) {
    return []
  }
  const fixes = []
  // Move property
  fixes.push(fixer.replaceText(toNode, src.getText(thisNode)))
  // Move comments on top of this property, but do not move comments
  //    on the same line with the previous property
  const prev = findPrevLine(thisNode, src)
  const cond = c => !prev || prev.loc.end.line !== c.loc.start.line
  const commentsBefore = src.getCommentsBefore(thisNode).filter(cond)
  if (commentsBefore.length) {
    const prevComments = src.getCommentsBefore(thisNode).filter(c => !cond(c))
    const b = prevComments.length
      ? prevComments[prevComments.length - 1].range[1]
      : prev
      ? prev.range[1]
      : commentsBefore[0].range[0]
    const e = commentsBefore[commentsBefore.length - 1].range[1]
    fixes.push(fixer.replaceTextRange([b, e], ''))
    const toPrev = src.getTokenBefore(toNode, { includeComments: true })
    const txt = src.text.substring(b, e)
    fixes.push(fixer.insertTextAfter(toPrev, txt))
    // In case the last comment overwrite the next token, add new line
    const after = toNode
    if (toPrev.loc.end.line === after.loc.start.line && commentsBefore[commentsBefore.length - 1].type === 'Line') {
      fixes.push(fixer.insertTextBefore(after, '\n'))
    }
  }
  // Move comments on the same line with this property
  const next = findComma(thisNode, src)
  const commentsAfter = src.getCommentsAfter(next).filter(c => thisNode.loc.end.line === c.loc.start.line)
  if (commentsAfter.length) {
    const b = next.range[1]
    const e = commentsAfter[commentsAfter.length - 1].range[1]
    fixes.push(fixer.replaceTextRange([b, e], ''))
    const toNext = findComma(toNode, src)
    const txt = src.text.substring(b, e)
    fixes.push(fixer.insertTextAfter(toNext, txt))
    // In case the last comment overwrite the next token, add new line
    const after = src.getTokenAfter(toNext, { includeComments: true })
    if (toNext.loc.end.line === after.loc.start.line && commentsAfter[commentsAfter.length - 1].type === 'Line') {
      fixes.push(fixer.insertTextBefore(after, '\n'))
    }
  }
  //
  return fixes
}

const findPrevLine = (node, src) => {
  let t = node
  while (t && t.range[0] >= node.parent.range[0]) {
    if (t.loc.end.line !== node.loc.start.line) {
      return t
    }
    t = src.getTokenBefore(t)
  }
  return null
}
const findComma = (node, src) => {
  const t = src.getTokenAfter(node)
  return t && t.value === ',' ? t : node
}
