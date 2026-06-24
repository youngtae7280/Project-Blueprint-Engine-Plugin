export function searchTodos(todos, query) {
  const normalizedQuery = String(query ?? '')
    .trim()
    .toLowerCase()

  if (normalizedQuery.length === 0) {
    return [...todos]
  }

  return todos.filter((todo) => {
    const title = String(todo.title ?? '').toLowerCase()
    const note = String(todo.note ?? '').toLowerCase()
    const content = String(todo.content ?? '').toLowerCase()

    return title.includes(normalizedQuery) || note.includes(normalizedQuery) || content.includes(normalizedQuery)
  })
}
