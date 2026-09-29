import SearchPage from "../page";
import { feedUrlForSearch } from "../feed-url-for-search";

const mockRedirect = jest.fn();
jest.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

describe("/search redirect", () => {
  it("maps old search links onto the Feed with every parameter kept", () => {
    expect(feedUrlForSearch({})).toBe("/feed");
    expect(
      feedUrlForSearch({ q: "durable queues", source: ["gmail", "slack"], archive: "include" })
    ).toBe("/feed?q=durable+queues&source=gmail&source=slack&archive=include");
  });

  it("redirects to the equivalent Feed view", async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: "rust" }) });
    expect(mockRedirect).toHaveBeenCalledWith("/feed?q=rust");
  });
});
