export function escapeHtml(text: string): string {
  const element = document.createElement('div');
  element.textContent = text;
  return element.innerHTML;
}
