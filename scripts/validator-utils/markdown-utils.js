export function missingTerms(markdown, terms) {
  return terms.filter((term) => !markdown.includes(term))
}

