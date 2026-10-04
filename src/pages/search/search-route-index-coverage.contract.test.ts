import { describe, expect, it } from "vitest";
import searchPage from "./search.vue?raw";
import pagesJson from "../../pages.json";

// The search page advertises "routes" as a searchable source, so its route
// index has to cover the pages a user can actually reach by name. The index was
// a hand-written 18-entry list with nothing tying it to the real route table, so
// core destinations (orders, bank cards, bills, rewards, receipts, help, …)
// matched nothing and answered "no results" for their own visible titles.
const ROUTE_INDEX_ENTRY = /href:\s*"(\/pages\/[a-z0-9/-]+)"/g;

/** Route paths declared in pages.json, normalised to the leading-slash form. */
const declaredRoutes = (pagesJson as { pages: { path: string }[] }).pages
  .map((page) => `/${page.path}`);

const indexedRoutes = [...searchPage.matchAll(ROUTE_INDEX_ENTRY)].map((match) => match[1]);

// Destinations the app exposes as user-visible entries and that the search
// copy promises to cover. Each must resolve from its own display name.
const REQUIRED_SEARCHABLE_ROUTES = [
  "/pages/store/orders",
  "/pages/me/wallet-cards",
  "/pages/me/wallet-bills",
  "/pages/me/rewards",
  "/pages/me/receipts",
  "/pages/me/notifications",
  "/pages/me/profile",
  "/pages/me/security",
  "/pages/me/preferences",
  "/pages/me/language",
  "/pages/me/help",
  "/pages/me/support-tickets",
  "/pages/trust/trust",
  "/pages/learn/courses",
];

describe("search route index coverage", () => {
  it("indexes every user-visible destination the search copy promises", () => {
    expect(REQUIRED_SEARCHABLE_ROUTES.filter((route) => !indexedRoutes.includes(route)))
      .toEqual([]);
  });

  // A dead index entry is the mirror failure: it sends the user to a route the
  // app does not declare, so the hit cannot navigate.
  it("never indexes a route that pages.json does not declare", () => {
    expect(indexedRoutes.filter((route) => !declaredRoutes.includes(route))).toEqual([]);
  });
});
