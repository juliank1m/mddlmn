import { describe, expect, test } from "vitest";
import { arrayMove } from "./arrayMove";

describe("arrayMove", () => {
  test("moves an element forward", () => {
    expect(arrayMove([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
  });

  test("moves an element backward", () => {
    expect(arrayMove([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3]);
  });

  test("returns equal array if from === to", () => {
    expect(arrayMove([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
  });

  test("clamps out-of-range indices to ends", () => {
    expect(arrayMove([1, 2, 3], -1, 0)).toEqual([1, 2, 3]);
    expect(arrayMove([1, 2, 3], 0, 99)).toEqual([2, 3, 1]);
  });

  test("does not mutate input", () => {
    const input = [1, 2, 3];
    arrayMove(input, 0, 2);
    expect(input).toEqual([1, 2, 3]);
  });

  test("preserves identity of unrelated elements", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    const result = arrayMove([a, b, c], 0, 2);
    expect(result[0]).toBe(b);
    expect(result[1]).toBe(c);
    expect(result[2]).toBe(a);
  });
});
