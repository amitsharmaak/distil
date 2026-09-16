import { navigateFullPage } from "@/lib/browser-navigation";

it("performs a full navigation through the provided location", () => {
  const assign = jest.fn();
  navigateFullPage("/", { assign });
  expect(assign).toHaveBeenCalledWith("/");
});
