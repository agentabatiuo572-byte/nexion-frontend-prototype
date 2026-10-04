import { parse as parseSfc } from "@vue/compiler-sfc";
import { parse as parseScript, parseExpression } from "@babel/parser";

const COMPONENT = "@/components/glass-segments.vue";
const scriptAst = (content) => parseScript(content, { sourceType: "module", plugins: ["typescript"] }).program;
const expression = (source) => {
  try { return parseExpression(source, { plugins: ["typescript"] }); }
  catch { return null; }
};
const unwrap = (node) => {
  while (["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"].includes(node?.type)) node = node.expression;
  return node;
};
const propertyName = (node) => node?.type === "Identifier" ? node.name : node?.type === "StringLiteral" ? node.value : null;
const directive = (node, name) => node.props?.find((prop) => prop.type === 7 && prop.name === name);
const binding = (node, name) => node.props?.filter((prop) => prop.type === 7 && prop.name === "bind" && prop.arg?.isStatic && prop.arg.content === name) ?? [];
const plainBinding = (node, name) => {
  const bound = binding(node, name);
  return bound.length === 1 && !bound[0].modifiers.length && !node.props.some((prop) => prop.type === 6 && prop.name === name) ? bound[0] : null;
};
const unsafeBinding = (node) => node.props?.some((prop) => prop.type === 7 && prop.name === "bind" && (!prop.arg || !prop.arg.isStatic));
const conditional = (node) => ["if", "else", "else-if", "for", "slot"].some((name) => directive(node, name));
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function visitScript(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const [key, child] of Object.entries(node)) {
    if (["loc", "comments", "leadingComments", "trailingComments", "innerComments", "tokens"].includes(key)) continue;
    if (Array.isArray(child)) child.forEach((item) => visitScript(item, visitor));
    else if (child && typeof child === "object") visitScript(child, visitor);
  }
}

function references(node, name) {
  let found = false;
  visitScript(node, (part) => { if (part.type === "Identifier" && part.name === name) found = true; });
  return found;
}

function declaresOptionsProp(node) {
  node = unwrap(node);
  if (node?.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "withDefaults") node = node.arguments[0];
  if (node?.type !== "CallExpression" || node.callee.type !== "Identifier" || node.callee.name !== "defineProps") return false;
  const type = node.typeParameters?.params[0];
  return type?.type === "TSTypeLiteral" && type.members.some((member) => member.type === "TSPropertySignature" && propertyName(member.key) === "options");
}

/** A narrow source contract, not a Vue interpreter: the shared native option node must
 * render the options prop unconditionally and bind the same iteration value's ID. */
function hasRenderingContract(source) {
  const { descriptor, errors } = parseSfc(source);
  if (errors.length || !descriptor.template?.ast || !descriptor.scriptSetup) return false;
  const ast = scriptAst(descriptor.scriptSetup.content);
  let optionsProp = false, optionsShadow = false;
  for (const statement of ast.body) {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        optionsShadow ||= references(declaration.id, "options");
        optionsProp ||= declaresOptionsProp(declaration.init);
      }
    }
    if (statement.type === "ImportDeclaration" && statement.importKind !== "type" && statement.specifiers.some((specifier) => specifier.importKind !== "type" && specifier.local.name === "options")) optionsShadow = true;
    if (["FunctionDeclaration", "ClassDeclaration", "TSEnumDeclaration"].includes(statement.type) && statement.id?.name === "options") optionsShadow = true;
    if (statement.type === "ExpressionStatement") optionsProp ||= declaresOptionsProp(statement.expression);
  }
  if (!optionsProp || optionsShadow) return false;
  let matches = 0, optionsLoops = 0, unsupportedId = false;
  const visit = (node, blocked = false) => {
    if (node.type === 1) {
      const loop = directive(node, "for");
      const id = plainBinding(node, "id");
      if (loop && references(expression(loop.forParseResult?.source.content ?? ""), "options")) optionsLoops++;
      const contractNode = loop?.exp?.content.trim() === "option in options" && id?.exp?.content.trim() === "option.id";
      for (const boundId of binding(node, "id")) {
        const value = expression(boundId.exp?.content ?? "");
        if (references(value, "options") || (!contractNode && references(value, "option"))) unsupportedId = true;
      }
      if (contractNode) {
        if (blocked || node.tagType !== 0 || unsafeBinding(node) || ["if", "else", "else-if"].some((name) => directive(node, name))) return;
        matches++;
      }
      blocked ||= conditional(node) || node.tagType === 1 || node.tagType === 2;
    }
    for (const child of node.children ?? []) visit(child, blocked);
  };
  visit(descriptor.template.ast);
  return matches === 1 && optionsLoops === 1 && !unsupportedId;
}

function literalIds(initializer, computedNames) {
  let array = unwrap(initializer);
  if (array?.type === "CallExpression" && array.callee.type === "Identifier" && computedNames.has(array.callee.name) && array.arguments.length === 1) {
    const getter = array.arguments[0];
    if (getter.type !== "ArrowFunctionExpression" || getter.params.length || getter.async) return null;
    array = unwrap(getter.body);
  }
  if (array?.type !== "ArrayExpression") return null;
  const ids = [];
  for (const option of array.elements) {
    if (option?.type !== "ObjectExpression" || option.properties.some((prop) => prop.type !== "ObjectProperty" || prop.computed)) return null;
    const properties = option.properties.filter((prop) => propertyName(prop.key) === "id");
    if (!properties.length) continue; // ID is optional; absent IDs do not manufacture a target.
    if (properties.length !== 1 || properties[0].value.type !== "StringLiteral" || !properties[0].value.value) return null;
    ids.push(properties[0].value.value);
  }
  return ids;
}

function hasOtherTemplateReference(root, name, componentNames) {
  let found = false;
  const checkExpression = (source) => {
    let ast = expression(source);
    if (!ast) {
      try { ast = scriptAst(source); }
      catch { found = true; return; } // Unknown syntax cannot prove immutable IDs.
    }
    visitScript(ast, (node) => { if (node.type === "Identifier" && node.name === name) found = true; });
  };
  const visit = (node) => {
    if (node.type === 1) {
      for (const prop of node.props) {
        if (prop.type !== 7 || !prop.exp) continue;
        const allowed = componentNames.has(node.tag) && prop === plainBinding(node, "options") && expression(prop.exp.content)?.type === "Identifier" && prop.exp.content.trim() === name;
        if (!allowed) checkExpression(prop.exp.content);
      }
    }
    if (node.type === 5) checkExpression(node.content.content);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return found;
}

/** Project only IDs whose import, binding, literal data and shared render contract
 * are all proven. Unsupported expressions return unknown and cannot clear gate E.
 * Retain duplicates: each caller instance renders another copy of the same IDs. */
export function projectGlassSegmentsIds(source, sharedSource) {
  const result = { ids: [], unknown: [] };
  if (!source.includes(COMPONENT)) return result;
  try {
    const { descriptor, errors } = parseSfc(source);
    if (errors.length || !descriptor.template?.ast || !descriptor.scriptSetup || descriptor.script) {
      result.unknown.push("SFC or script setup cannot be resolved");
      return result;
    }
    const ast = scriptAst(descriptor.scriptSetup.content);
    const componentNames = new Set(), computedNames = new Set(), declarations = new Map();
    for (const statement of ast.body) {
      if (statement.type === "ImportDeclaration" && statement.importKind !== "type") {
        for (const specifier of statement.specifiers) {
          if (statement.source.value === COMPONENT && specifier.type === "ImportDefaultSpecifier") {
            componentNames.add(specifier.local.name); componentNames.add(kebab(specifier.local.name));
          }
          if (statement.source.value === "vue" && specifier.type === "ImportSpecifier" && specifier.importKind !== "type" && propertyName(specifier.imported) === "computed") computedNames.add(specifier.local.name);
        }
      }
      if (statement.type === "VariableDeclaration" && statement.kind === "const") {
        for (const declaration of statement.declarations) if (declaration.id.type === "Identifier") declarations.set(declaration.id.name, declaration);
      }
    }
    if (!componentNames.size) return result;
    const contract = hasRenderingContract(sharedSource);
    const visit = (node, blocked = false) => {
      if (node.type === 1) {
        if (componentNames.has(node.tag)) {
          const options = plainBinding(node, "options");
          const bound = options ? expression(options.exp?.content ?? "") : null;
          const declaration = bound?.type === "Identifier" ? declarations.get(bound.name) : null;
          let extraReference = false;
          if (declaration) visitScript(ast, (part) => {
            // Any script reference beyond the binding itself could mutate the array. Resolve no
            // mutation/alias chains; fail closed instead of assuming const freezes it.
            if (part.type === "Identifier" && part.name === bound.name && part !== declaration.id) extraReference = true;
          });
          if (declaration) extraReference ||= hasOtherTemplateReference(descriptor.template.ast, bound.name, componentNames);
          const ids = declaration && !extraReference ? literalIds(declaration.init, computedNames) : null;
          if (!contract || blocked || conditional(node) || unsafeBinding(node) || !ids) result.unknown.push(`${node.tag} :options cannot prove rendered IDs`);
          else result.ids.push(...ids);
        }
        // Custom-component children and slot outlets may be discarded or replaced.
        blocked ||= conditional(node) || node.tagType === 1 || node.tagType === 2;
      }
      for (const child of node.children ?? []) visit(child, blocked);
    };
    visit(descriptor.template.ast);
  } catch {
    result.unknown.push("SFC/script parse failed; no IDs projected");
  }
  return result;
}
