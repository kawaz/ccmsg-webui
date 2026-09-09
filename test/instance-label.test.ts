import { describe, expect, test } from "bun:test";
import { instanceLabel } from "../src/instance-label.ts";

const ID = "0123456789abcdef0123456789abcdef";

describe("naming an instance on screen", () => {
  test("the endpoint is what a person recognises", () => {
    expect(instanceLabel(ID, "wss://ui.example/ws")).toBe("wss://ui.example/ws");
  });

  test("an instance in no mesh is named by the head of its id", () => {
    expect(instanceLabel(ID)).toBe("01234567");
  });
});
