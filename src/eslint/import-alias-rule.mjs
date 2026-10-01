/** Named import aliases must be compared as AST values, not esquery attributes. */
export const IMPORT_ALIAS_RULE_NAME = 'no-import-alias'
export const IMPORT_ALIAS_RULE_ID = `aqg/${IMPORT_ALIAS_RULE_NAME}`
const IMPORT_ALIAS_MESSAGE_ID = 'renamed'

export const importAliasPlugin = {
  rules: {
    [IMPORT_ALIAS_RULE_NAME]: {
      meta: {
        type: 'problem',
        docs: { description: 'Require the original name for named imports, including type imports.' },
        schema: [],
        messages: {
          [IMPORT_ALIAS_MESSAGE_ID]:
            'Import alias is not allowed. Use the original imported name or rename your local declaration.'
        }
      },
      create(context) {
        return {
          ImportSpecifier(node) {
            const importedName = node.imported.name ?? node.imported.value
            if (importedName !== node.local.name) context.report({ node, messageId: IMPORT_ALIAS_MESSAGE_ID })
          }
        }
      }
    }
  }
}
