const { generate: unparse } = require('escodegen');
const { parse } = require('esprima');

const FAIL_RESULT = {};

let walk;
const walkLiteral = (node) => node.value;

function walkUnary(node, context) {
  switch (node.operator) {
    case '+':
      return +walk(node.argument, context);
    case '-':
      return -walk(node.argument, context);
    case '~':
      /* eslint-disable no-bitwise */
      return ~walk(node.argument, context);
    case '!':
      return !walk(node.argument, context);
    default:
      return FAIL_RESULT;
  }
}

function walkArray(node, context) {
  const result = [];
  for (let i = 0, l = node.elements.length; i < l; i += 1) {
    const x = walk(node.elements[i], context);
    if (x === FAIL_RESULT) {
      return FAIL_RESULT;
    }
    result.push(x);
  }
  return result;
}

function walkObject(node, context) {
  const result = {};
  for (let i = 0, l = node.properties.length; i < l; i += 1) {
    const property = node.properties[i];
    const value = walk(property.value, context);
    if (value === FAIL_RESULT) {
      return FAIL_RESULT;
    }
    result[property.key.vlaue || property.key.name] = value;
  }
  return result;
}

function walkBinary(node, context) {
  const left = walk(node.left, context);
  if (left === FAIL_RESULT) {
    return FAIL_RESULT;
  }
  if (node.operator === '&&' && !left) {
    return false;
  }
  if (node.operator === '||' && left) {
    return true;
  }
  const right = walk(node.right, context);
  if (right === FAIL_RESULT) {
    return FAIL_RESULT;
  }
  switch (node.operator) {
    case '==':
      /* eslint-disable eqeqeq */
      return left == right;
    case '===':
      return left === right;
    case '!=':
      /* eslint-disable eqeqeq */
      return left != right;
    case '!==':
      return left !== right;
    case '**':
      return left ** right;
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return left / right;
    case '%':
      return left % right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '|':
      /* eslint-disable no-bitwise */
      return left | right;
    case '&':
      /* eslint-disable no-bitwise */
      return left & right;
    case '^':
      /* eslint-disable no-bitwise */
      return left ^ right;
    case '||':
      return left || right;
    case '&&':
      return left && right;
    default:
      return FAIL_RESULT;
  }
}

function walkIdentifier(node, context) {
  if ({}.hasOwnProperty.call(context, node.name)) {
    return context[node.name];
  }
  return undefined;
}

function walkThis(node, context) {
  if ({}.hasOwnProperty.call(context, 'this')) {
    // eslint-disable-next-line
    return context["this"];
  }
  return undefined;
}

function walkCall(node, context) {
  const callee = walk(node.callee, context);
  if (callee === FAIL_RESULT || typeof callee !== 'function') {
    return FAIL_RESULT;
  }
  let ctx = node.callee.object
    ? walk(node.callee.object, context)
    : FAIL_RESULT;
  if (ctx === FAIL_RESULT) {
    ctx = null;
  }
  const args = [];
  for (let i = 0, l = node.arguments.length; i < l; i += 1) {
    const x = walk(node.arguments[i], context);
    if (x === FAIL_RESULT) {
      return FAIL_RESULT;
    }
    args.push(x);
  }
  return callee.apply(ctx, args);
}

function walkMember(node, context) {
  const obj = walk(node.object, context);
  if (obj === FAIL_RESULT || typeof obj === 'function') {
    return FAIL_RESULT;
  }
  if (node.property.type === 'Identifier') {
    return obj[node.property.name];
  }
  const prop = walk(node.property, context);
  if (prop === FAIL_RESULT) {
    return FAIL_RESULT;
  }
  return obj ? obj[prop] : FAIL_RESULT;
}

function walkConditional(node, context) {
  const value = walk(node.test, context);
  if (value === FAIL_RESULT) {
    return FAIL_RESULT;
  }
  if (value) {
    return walk(node.consequent, context);
  }
  if (!node.alternate) {
    return undefined;
  }
  return walk(node.alternate, context);
}

function walkExpression(node, context) {
  const value = walk(node.expression, context);
  if (value === FAIL_RESULT) {
    return FAIL_RESULT;
  }
  return value;
}

function walkReturn(node, context) {
  return walk(node.argument, context);
}

function walkFunction(node, context) {
  const newContext = {};
  const keys = Object.keys(context);
  keys.forEach((element) => {
    newContext[element] = context[element];
  });
  node.params.forEach((key) => {
    if (key.type === 'Identifier') {
      newContext[key.name] = null;
    }
  });
  const bodies = node.body.body;
  for (let i = 0, l = bodies.length; i < l; i += 1) {
    if (walk(bodies[i], newContext) === FAIL_RESULT) {
      return FAIL_RESULT;
    }
  }
  const vals = keys.map((key) => context[key]);
  // eslint-disable-next-line
    return Function(keys.join(', '), 'return ' + unparse(node)).apply(
      null,
      vals
    );
}

function walkTemplateLiteral(node, context) {
  let str = '';
  for (let i = 0; i < node.expressions.length; i += 1) {
    str += walk(node.quasis[i], context);
    str += walk(node.expressions[i], context);
  }
  return str;
}

function walkTemplateElement(node) {
  return node.value.cooked;
}

function walkTaggedTemplate(node, context) {
  const tag = walk(node.tag, context);
  const { quasi } = node;
  const strings = quasi.quasis.map((q) => walk(q, context));
  const values = quasi.expressions.map((e) => walk(e, context));
  // eslint-disable-next-line
    return tag.apply(null, [strings].concat(values));
}

function walkSetIdentifier(node, context, value) {
  const newContext = context;
  newContext[node.name] = value;
  return value;
}

function walkSetMember(node, context, value) {
  const obj = walk(node.object, context);
  if (obj === FAIL_RESULT || typeof obj === 'function') {
    return FAIL_RESULT;
  }
  if (node.property.type === 'Identifier') {
    obj[node.property.name] = value;
    return value;
  }
  const prop = walk(node.property, context);
  if (prop === FAIL_RESULT) {
    return FAIL_RESULT;
  }
  if (!obj) {
    return FAIL_RESULT;
  }
  obj[prop] = value;
  return value;
}

function walkSet(node, context, value) {
  switch (node.type) {
    case 'Identifier':
      return walkSetIdentifier(node, context, value);
    case 'MemberExpression':
      return walkSetMember(node, context, value);
    default:
      return FAIL_RESULT;
  }
}

function walkUpdateExpression(node, context) {
  let value = walk(node.argument, context);
  if (value === FAIL_RESULT) {
    return FAIL_RESULT;
  }
  switch (node.operator) {
    case '++':
      value += 1;
      return walkSet(node.argument, context, value);
    case '--':
      value -= 1;
      return walkSet(node.argument, context, value);
    default:
      return FAIL_RESULT;
  }
}

function walkAssignmentExpression(node, context) {
  const value = walk(node.right, context);
  if (value === FAIL_RESULT) {
    return FAIL_RESULT;
  }
  let leftValue = walk(node.left, context);
  if (leftValue === FAIL_RESULT) {
    leftValue = 0;
  }
  switch (node.operator) {
    case '=':
      walkSet(node.left, context, value);
      return value;
    case '+=':
      leftValue += value;
      walkSet(node.left, context, leftValue);
      return leftValue;
    case '-=':
      leftValue -= value;
      walkSet(node.left, context, leftValue);
      return leftValue;
    case '*=':
      leftValue *= value;
      walkSet(node.left, context, leftValue);
      return leftValue;
    case '/=':
      leftValue /= value;
      walkSet(node.left, context, leftValue);
      return leftValue;
    case '%=':
      leftValue %= value;
      walkSet(node.left, context, leftValue);
      return leftValue;
    case '|=':
      // eslint-disable-next-line
        leftValue |= value;
      walkSet(node.left, context, leftValue);
      return leftValue;
    case '&=':
      // eslint-disable-next-line
        leftValue &= value;
      walkSet(node.left, context, leftValue);
      return leftValue;
    case '^=':
      // eslint-disable-next-line
        leftValue ^= value;
      walkSet(node.left, context, leftValue);
      return leftValue;
    default:
      return FAIL_RESULT;
  }
}

function walkBlock(node, context) {
  if (Array.isArray(node.body)) {
    let result;
    for (let i = 0; i < node.body.length; i += 1) {
      result = walk(node.body[i], context);
    }
    return result;
  }
  return walk(node.body, context);
}

function walkArrowFunction(node, context) {
  const newContext = {};
  const keys = Object.keys(context);
  keys.forEach((element) => {
    newContext[element] = context[element];
  });
  node.params.forEach((key) => {
    if (key.type === 'Identifier') {
      newContext[key.name] = null;
    }
  });
  const vals = keys.map((key) => context[key]);
  // eslint-disable-next-line
    return Function(keys.join(', '), 'return ' + unparse(node)).apply(
      null,
      vals
    );
}

walk = (node, context) => {
  switch (node.type) {
    case 'Literal':
      return walkLiteral(node, context);
    case 'UnaryExpression':
      return walkUnary(node, context);
    case 'ArrayExpression':
      return walkArray(node, context);
    case 'ObjectExpression':
      return walkObject(node, context);
    case 'BinaryExpression':
    case 'LogicalExpression':
      return walkBinary(node, context);
    case 'Identifier':
      return walkIdentifier(node, context);
    case 'ThisExpression':
      return walkThis(node, context);
    case 'CallExpression':
      return walkCall(node, context);
    case 'MemberExpression':
      return walkMember(node, context);
    case 'ConditionalExpression':
      return walkConditional(node, context);
    case 'ExpressionStatement':
      return walkExpression(node, context);
    case 'ReturnStatement':
      return walkReturn(node, context);
    case 'FunctionExpression':
      return walkFunction(node, context);
    case 'TemplateLiteral':
      return walkTemplateLiteral(node, context);
    case 'TemplateElement':
      return walkTemplateElement(node, context);
    case 'TaggedTemplateExpression':
      return walkTaggedTemplate(node, context);
    case 'UpdateExpression':
      return walkUpdateExpression(node, context);
    case 'AssignmentExpression':
      return walkAssignmentExpression(node, context);
    case 'IfStatement':
      return walkConditional(node, context);
    case 'BlockStatement':
      return walkBlock(node, context);
    case 'ArrowFunctionExpression':
      return walkArrowFunction(node, context);
    default:
      return FAIL_RESULT;
  }
};

function evaluateAll(str, context = {}) {
  const result = [];
  const compiled = parse(str);
  for (let i = 0; i < compiled.body.length; i += 1) {
    const current = compiled.body[i];
    const expression = current.expression ? current.expression : current;
    const value = walk(expression, context);
    result.push(value === FAIL_RESULT ? undefined : value);
  }
  return result;
}

function evaluate(str, context) {
  const result = evaluateAll(str, context);
  if (!result || result.length === 0) {
    return undefined;
  }
  return result[result.length - 1];
}

module.exports = {
  FAIL_RESULT,
  walkLiteral,
  walkUnary,
  walkArray,
  walkObject,
  walkBinary,
  walkIdentifier,
  walkThis,
  walkCall,
  walkMember,
  walkConditional,
  walkExpression,
  walkReturn,
  walkFunction,
  walkTemplateLiteral,
  walkTemplateElement,
  walkTaggedTemplate,
  walkSetIdentifier,
  walkSetMember,
  walkSet,
  walkUpdateExpression,
  walkAssignmentExpression,
  walkBlock,
  walk,
  evaluate,
  evaluateAll,
};
