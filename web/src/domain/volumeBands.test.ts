import { describe, expect, it } from "vitest";
import { volumeBand } from "./volumeBands";

describe("volumeBand", () => {
  it("places a total on the prompt's bands, with the edges on the right side", () => {
    expect(volumeBand(0).band).toBe("below");
    expect(volumeBand(3.75).band).toBe("below");
    expect(volumeBand(4).band).toBe("building");
    expect(volumeBand(11.99).band).toBe("building");
    expect(volumeBand(12).band).toBe("ideal");
    expect(volumeBand(20).band).toBe("ideal");
    expect(volumeBand(20.25).band).toBe("above");
  });

  it("always says where it falls in words", () => {
    for (const sets of [0, 5, 15, 25]) expect(volumeBand(sets).label).not.toBe("");
  });
});
