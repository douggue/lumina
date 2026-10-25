import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readPath, render, renderValue } from "@/lib/suppliers/template";

const ctx = { ref: "hg-abc", sku: "18:25", skuParts: ["18", "25"], quantity: 2, fields: { playerId: "123456" }, secret: { user: "bob", key: "s3cr3t" }, body: '{"a":1}', path: "order/create_order", timestamp: 1700000000 };

describe("supplier templates", () => {
  it("fills values, keeping types for whole-value templates", () => {
    expect(render("{{ref}}", ctx)).toBe("hg-abc");
    expect(render("ID {{fields.playerId}}", ctx)).toBe("ID 123456");
    expect(render("{{quantity}}", ctx)).toBe(2);
    expect(render("{{skuParts.1}}", ctx)).toBe("25");
    expect(render("{{missing}}x", ctx)).toBe("x");
  });

  it("signs like suppliers expect", () => {
    expect(render("{{secret.user | append:secret.key | append:ref | md5}}", ctx)).toBe(createHash("md5").update("bobs3cr3thg-abc").digest("hex"));
    expect(render("{{body | append:timestamp | append:path | hmac_sha256:secret.key}}", ctx)).toBe(
      createHmac("sha256", "s3cr3t").update('{"a":1}1700000000order/create_order').digest("hex"),
    );
    expect(render("Basic {{secret.user | append:':' | append:secret.key | base64}}", ctx)).toBe(`Basic ${Buffer.from("bob:s3cr3t").toString("base64")}`);
    expect(render("{{params | sorted_query}}", { params: { b: "2", a: "1", z: "" } })).toBe("a=1&b=2");
    expect(() => render("{{ref | nope}}", ctx)).toThrow(/Unknown filter/);
  });

  it("renders bodies with numbers and booleans", () => {
    expect(renderValue({ id: "#{{skuParts.0}}", qty: "#{{quantity}}", auto: "?true", nested: [{ ref: "{{ref}}" }] }, ctx)).toEqual({ id: 18, qty: 2, auto: true, nested: [{ ref: "hg-abc" }] });
  });

  it("reads replies with paths and wildcards", () => {
    const reply = { data: { status: "Sukses" }, item: [{ voucher_code: ["A", "B"] }, { voucher_code: ["C"] }], list: [{ cardNumber: "X1" }] };
    expect(readPath(reply, "data.status")).toBe("Sukses");
    expect(readPath(reply, "item[*].voucher_code[*]")).toEqual(["A", "B", "C"]);
    expect(readPath(reply, "list[0].cardNumber")).toBe("X1");
    expect(readPath([{ a: 1 }, { a: 2 }], "[*]")).toEqual([{ a: 1 }, { a: 2 }]);
    expect(readPath(reply, "nope.deeper")).toBeUndefined();
  });
});
