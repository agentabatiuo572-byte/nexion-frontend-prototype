import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./support-tickets.vue", {
  query: "?raw", import: "default", eager: true,
})["./support-tickets.vue"] ?? "") as string;

describe("ticket FAQ suggestion refresh", () => {
  it("preserves last-good suggestions only within the same locale/category scope", () => {
    expect(source).toContain("ticketSuggestionGeneration");
    expect(source).toContain("requestedLocale");
    expect(source).toContain("requestedCategory");
    expect(source).toContain("ticketSuggestionCache");
    expect(source).toContain("ticketSuggestionKey");
    expect(source).toContain("ticketSuggestionCache.get(scopeKey) ?? []");
  });

  it("uses bounded server pages and exposes all published suggestions through load more", () => {
    expect(source).toContain("supportApi.faqPage(requestedLocale, requestedCategory, \"Ticket Create\", 1, TICKET_SUGGESTION_PAGE_SIZE)");
    expect(source).toContain("async function loadMoreTicketSuggestions()");
    expect(source).toContain("ticketSuggestions.value.length < ticketSuggestionTotal.value");
    expect(source).toContain('@click="loadMoreTicketSuggestions"');
    expect(source).not.toContain("supportApi.faqs(");
  });
});

// The page kept its mode in local state only, so "back to list" left
// ?mode=create in the address while a refresh of that address showed the list,
// and an account-key watcher reset the mode unconditionally — a deep link to the
// create form could not survive its own reload.
describe("ticket create/list mode and address agree", () => {
  it("drives every mode change through the address-syncing helper", () => {
    expect(source).toContain("function setMode(");
    // Address sync must go through the failure-aware adapter, never raw uni calls.
    expect(source).toContain("void navReplace(modeQueryHref(next));");
    expect(source).not.toMatch(/\buni\.(?:reLaunch|redirectTo)\s*\(/);
    for (const transition of ["setMode({ kind: 'list' })", "setMode({ kind: 'create' })"]) {
      expect(source).toContain(transition);
    }
    // No handler may assign the mode directly and skip the address update.
    expect(source).not.toMatch(/@click="mode = \{/);
  });

  it("keeps the create deep link across an account-key change", () => {
    const watcher = source.slice(source.indexOf("watch(() => app.accountKey"));
    const body = watcher.slice(0, watcher.indexOf("}, { flush: \"sync\" });"));
    // The watcher clears the previous account's draft but must not force the
    // list mode, which would override ?mode=create on load.
    expect(body).toContain("subject.value = \"\"");
    // Only the detail branch may fall back to the list; an unconditional reset
    // (a statement that starts a line) must be gone.
    expect(body).not.toMatch(/\n\s*mode\.value = \{ kind: "list" \};/);
    expect(body).toContain('if (mode.value.kind === "detail") mode.value = { kind: "list" };');
  });

  it("restores the create form from the query and does not block it on a list read", () => {
    expect(source).toMatch(/onLoad\(\(query\) => \{\s*if \(query\?\.mode === "create"\)/);
    // A failed ticket-list read only blocks the list view; the create form owns
    // its own sources.
    expect(source).toContain("const listIsVisible = mode.value.kind === \"list\";");
    expect(source).toContain("if (tickets.status === \"rejected\" && listIsVisible) throw tickets.reason;");
  });
});
