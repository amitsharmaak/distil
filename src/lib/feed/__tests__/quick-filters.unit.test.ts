import { feedFilterState } from "@/lib/feed/feed-url";
import {
  AREA_OPTIONS,
  CLEAR_ALL_FILTERS,
  activeFilterChips,
  areaUpdate,
  hasActiveFilters,
  selectedArea,
} from "@/lib/feed/quick-filters";

const state = (search: string) => feedFilterState(new URLSearchParams(search));

describe("area options", () => {
  it("offers All then the four fixed areas, in pill order", () => {
    expect(AREA_OPTIONS.map((option) => option.label)).toEqual([
      "All",
      "Personal",
      "Work",
      "Learning",
      "Updates",
    ]);
    expect(AREA_OPTIONS[0].value).toBeUndefined();
  });

  it("writes one area parameter, or none for All", () => {
    expect(areaUpdate("work")).toEqual({ area: "work" });
    expect(areaUpdate(undefined)).toEqual({ area: undefined });
    expect(selectedArea(state("area=learning"))).toBe("learning");
    expect(selectedArea(state("area=learning&area=work"))).toBeUndefined();
  });
});

describe("activeFilterChips", () => {
  it("includes the area chip by default (Today keeps it)", () => {
    const chips = activeFilterChips(state("area=work&source=gmail"));
    expect(chips.map((chip) => chip.key)).toEqual(["area:work", "source:gmail"]);
    expect(chips[0]).toMatchObject({ label: "Work", remove: { area: [] } });
  });

  it("drops only the area chip when the pill row shows it (Feed)", () => {
    const chips = activeFilterChips(state("area=work&source=gmail&read=true&topic=AI"), {
      includeArea: false,
    });
    expect(chips.map((chip) => chip.key)).toEqual(["read", "source:gmail", "topic:AI"]);
    expect(activeFilterChips(state("area=work"), { includeArea: false })).toEqual([]);
  });

  it("still counts an area as an active filter and clears it with Clear all", () => {
    expect(hasActiveFilters(state("area=work"))).toBe(true);
    expect(CLEAR_ALL_FILTERS).toMatchObject({ area: undefined });
    expect("area" in CLEAR_ALL_FILTERS).toBe(true);
  });
});
