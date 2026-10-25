import { describe, expect, it } from "vitest";
import { cleanInfo, infoFromProvider } from "@/lib/service-info";

describe("service details from the provider's words", () => {
  it("reads quality, speed, start, drop and cancel", () => {
    const i = infoFromProvider("Facebook Followers | Page & Profile | HQ + Mix Accounts | Cancel Enable | Low Drop | Instant Start | No Refill | Speed: 300K/Day", "- Location: Global", true);
    expect(i).toMatchObject({ speed: "300K", start: "instant", drop: "low", location: "Global", cancel: true });
    expect(i.quality).toBe("mixed");
  });
  it("reads a start time range and non drop", () => {
    const i = infoFromProvider("Youtube Subscribers [Max 50K] [50-100/Day - R30] [12-24 Hours Start] [Non Drop]");
    expect(i).toMatchObject({ speed: "50-100", start: "12-24 h", drop: "none" });
  });
  it("flags bot services", () => {
    expect(infoFromProvider("Instagram Followers [Bot | Cheap | No Refill]").quality).toBe("bot");
  });
  it("keeps only known values", () => {
    expect(cleanInfo({ quality: "amazing", drop: "low", speed: " 10K ", cancel: "yes", extra: 1 })).toEqual({ drop: "low", speed: "10K" });
  });
});
