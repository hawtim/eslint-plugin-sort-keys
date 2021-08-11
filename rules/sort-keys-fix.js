const naturalCompare = require('natural-compare')

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
          minKeys: {
            type: 'number',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(ctx) {
    // Parse options
    const order = ctx.options[0] || 'asc'
    const options = ctx.options[1]
    const insensitive = (options && options.caseSensitive) === false
    const natural = Boolean(options && options.natural)
    const isValidOrder =
      isValidOrders[order + (insensitive ? 'I' : '') + (natural ? 'N' : '')]
    const minKeys = Number(options && options.minKeys) || 2
    // The stack to save the previous property's name for each object literals
    let stack = null
    // Shared SpreadElement for ExperimentalSpreadProperty
    const SpreadElement = node => {
      if (node.parent.type === 'ObjectExpression') {
        stack.prevName = null
      }
    }
    return {
      ExperimentalSpreadProperty: SpreadElement,
      SpreadElement,

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

      Property(node) {
        if (node.parent.type === 'ObjectPattern') {
          return
        }
        if (node.parent.properties.length < minKeys) {
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
          ctx.report({
            node,
            loc: node.key.loc,
            message:
              "Expected object keys to be in {{natual}}{{insensitive}}{{order}}ending order. '{{thisName}}' should be before '{{prevName}}'.",
            data: {
              thisName,
              prevName,
              order,
              insensitive: insensitive ? 'insensitive ' : '',
              natual: natural ? 'natural ' : '',
            },
            fix(fixer) {
              // Check if already sorted
              if (
                node.parent.__alreadySorted ||
                node.parent.properties.__alreadySorted
              ) {
                return []
              }
              node.parent.__alreadySorted = true
              node.parent.properties.__alreadySorted = true
              //
              const src = ctx.getSourceCode()
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
                part.sort((p1, p2) => {
                  const n1 = getPropertyName(p1)
                  const n2 = getPropertyName(p2)
                  if (insensitive && n1.toLowerCase() === n2.toLowerCase()) {
                    return 0
                  }
                  return isValidOrder(n1, n2) ? -1 : 1
                })
              })
              // Perform fixes
              const fixes = []
              let newIndex = 0
              parts.forEach(part => {
                part.forEach(p => {
                  moveProperty(p, props[newIndex], fixer, src).forEach(f =>
                    fixes.push(f),
                  )
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
    if (
      toPrev.loc.end.line === after.loc.start.line &&
      commentsBefore[commentsBefore.length - 1].type === 'Line'
    ) {
      fixes.push(fixer.insertTextBefore(after, '\n'))
    }
  }
  // Move comments on the same line with this property
  const next = findComma(thisNode, src)
  const commentsAfter = src
    .getCommentsAfter(next)
    .filter(c => thisNode.loc.end.line === c.loc.start.line)
  if (commentsAfter.length) {
    const b = next.range[1]
    const e = commentsAfter[commentsAfter.length - 1].range[1]
    fixes.push(fixer.replaceTextRange([b, e], ''))
    const toNext = findComma(toNode, src)
    const txt = src.text.substring(b, e)
    fixes.push(fixer.insertTextAfter(toNext, txt))
    // In case the last comment overwrite the next token, add new line
    const after = src.getTokenAfter(toNext, { includeComments: true })
    if (
      toNext.loc.end.line === after.loc.start.line &&
      commentsAfter[commentsAfter.length - 1].type === 'Line'
    ) {
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

const isValidOrders = {
  asc: (a, b) => a <= b,
  ascI: (a, b) => a.toLowerCase() <= b.toLowerCase(),
  ascN: (a, b) => naturalCompare(a, b) <= 0,
  ascIN: (a, b) => naturalCompare(a.toLowerCase(), b.toLowerCase()) <= 0,
  desc: (a, b) => isValidOrders.asc(b, a),
  descI: (a, b) => isValidOrders.ascI(b, a),
  descN: (a, b) => isValidOrders.ascN(b, a),
  descIN: (a, b) => isValidOrders.ascIN(b, a),
}

const getPropertyName = node => {
  let prop
  switch (node && node.type) {
    case 'Property':
    case 'MethodDefinition':
      prop = node.key
      break
    case 'MemberExpression':
      prop = node.property
      break
  }
  switch (prop && prop.type) {
    case 'Literal':
      return String(prop.value)
    case 'TemplateLiteral':
      if (prop.expressions.length === 0 && prop.quasis.length === 1) {
        return prop.quasis[0].value.cooked
      }
      break
    case 'Identifier':
      if (!node.computed) {
        return prop.name
      }
      break
  }
  return (node.key && node.key.name) || null
}
