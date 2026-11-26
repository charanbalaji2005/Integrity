import { describe, expect, it } from "vitest";
import { isPhoneOrVirtualCamera, pickLaptopCamera } from "../preferences";

const cam = (deviceId: string, label: string) => ({ deviceId, label, kind: "videoinput" as MediaDeviceKind });

describe("laptop camera selection", () => {
  it("recognises phone and virtual cameras", () => {
    expect(isPhoneOrVirtualCamera("Samsung S24 Ultra (Windows Virtual Camera)")).toBe(true);
    expect(isPhoneOrVirtualCamera("Link to Windows camera")).toBe(true);
    expect(isPhoneOrVirtualCamera("OBS Virtual Camera")).toBe(true);
    expect(isPhoneOrVirtualCamera("DroidCam Source 3")).toBe(true);
    expect(isPhoneOrVirtualCamera("Integrated Camera (04f2:b6dd)")).toBe(false);
    expect(isPhoneOrVirtualCamera("HD Webcam")).toBe(false);
  });

  it("prefers the built-in webcam over a phone connected through Phone Link", () => {
    expect(pickLaptopCamera([cam("phone", "Samsung S24 Ultra"), cam("laptop", "Integrated Webcam")])).toBe("laptop");
    expect(pickLaptopCamera([cam("obs", "OBS Virtual Camera"), cam("usb", "USB2.0 HD UVC WebCam")])).toBe("usb");
  });

  it("still returns a camera when only phone/virtual ones exist, and null when none", () => {
    expect(pickLaptopCamera([cam("phone", "Samsung S24 Ultra")])).toBe("phone");
    expect(pickLaptopCamera([])).toBeNull();
    expect(pickLaptopCamera([{ deviceId: "m", label: "Mic", kind: "audioinput" }])).toBeNull();
  });
});
