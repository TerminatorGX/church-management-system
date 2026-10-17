import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView — the chat views call it to keep
// the latest message visible, so without a stub any test that renders them
// throws "scrollIntoView is not a function".
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
